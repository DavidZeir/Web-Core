import type { Contexto, ConectorIA, ProveedorIA } from '../global';
import type { EntradaIA, ParámetrosNormalizados, ResultadoConectorDirecto, UsoTókenes } from '../ia';
import { AplicarParámetrosOpcionales, CrearUsoFacturable, ErrorLímiteTókenes, ManejarRespuestaHttpError,
	ObtenerClaveApi, ProcesarEventoSse, ProcesarSseLineas, UsoTókenesCero, ValidarRespuestaFlujo,
	VerificarBloqueoProveedor } from '../ia';


interface UsageMetadata { // No cambiar los nombres porque se necesitan que sean estos para compatibilidad.
	promptTokenCount?: number;
	cachedContentTokenCount?: number;
	candidatesTokenCount?: number;
	thoughtsTokenCount?: number;
}


function ConstruirCuerpo(conector: ConectorIA, entrada: EntradaIA, parámetros: ParámetrosNormalizados): Record<string, unknown> {

    const cuerpo: Record<string, unknown> = {
        contents: [{ role: 'user', parts: [{ text: entrada.MensajeUsuario }] }]
	};

    if (parámetros.MensajeSistemaFinal) cuerpo.systemInstruction = { parts: [{ text: parámetros.MensajeSistemaFinal }] }; // En Gemini el system prompt va en systemInstruction.

    const generationConfig: Record<string, unknown> = {};
    AplicarParámetrosOpcionales(generationConfig, conector, parámetros, 'Gemini');
    if (Object.keys(generationConfig).length > 0) cuerpo.generationConfig = generationConfig;
    return cuerpo;

}


function ObtenerUso(meta: UsageMetadata | undefined): UsoTókenes {

	if (!meta) return UsoTókenesCero;
	const entradaCaché = meta.cachedContentTokenCount ?? 0;
	return {
		EntradaCaché: entradaCaché,
		EntradaNoCaché: Math.max(0, (meta.promptTokenCount ?? 0) - entradaCaché),
		FuenteSalidaRazonamiento: 'Proveedor',
		SalidaRazonamiento: meta.thoughtsTokenCount ?? 0,
		SalidaNoRazonamiento: meta.candidatesTokenCount ?? 0,
		MinutosCachéManual: 0,
		EscrituraCaché: 0
	};

}


export async function EjecutarGoogleDirecto(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA, entrada: EntradaIA,
	parámetros: ParámetrosNormalizados, señal: AbortSignal): Promise<ResultadoConectorDirecto> {

	const claveApi = ObtenerClaveApi(contexto, proveedor);
	const url = `${proveedor.Url}/models/${conector.Modelo}:generateContent?key=${encodeURIComponent(claveApi)}`;
	const respuesta = await fetch(url, {
		method: 'POST', signal: señal,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(ConstruirCuerpo(conector, entrada, parámetros))
	});
	if (!respuesta.ok) await ManejarRespuestaHttpError(contexto, conector, respuesta);
	const datos = await respuesta.json() as { candidates?: { finishReason?: string; finishMessage?: string; content?: { parts?: { text?: string; }[]; }; }[]; usageMetadata?: UsageMetadata; promptFeedback?: { blockReason?: string; }; };
	const candidato = datos.candidates?.[0];
	if (candidato?.finishReason === 'MAX_TOKENS') throw new ErrorLímiteTókenes();
	await VerificarBloqueoProveedor(conector, datos);
	if (candidato?.finishReason && candidato.finishReason !== 'STOP')
		throw new Error(`La respuesta no se completó con normalidad: ${candidato.finishReason}${candidato.finishMessage ? ` (${candidato.finishMessage})` : ''}`);
	const texto = (candidato?.content?.parts ?? [])
		.filter((p: { text?: string; thought?: boolean; }) => !p.thought)
		.map((p: { text?: string; }) => p.text ?? '').join(''); // Se filtran los parts con thought === true: son el razonamiento interno del modelo y no deben enviarse al cliente.
	if (!texto) throw new Error('La respuesta del proveedor está vacía.');
	const uso = ObtenerUso(datos.usageMetadata);
	const { UsoFacturable: usoFacturable, UsoTókenesTarifaExtendida: usoTókenesTarifaExtendida,
		EsContextoLargo: esContextoLargo } = CrearUsoFacturable(conector, uso);
	return { Texto: texto, Uso: uso, UsoFacturable: usoFacturable, UsoTókenesTarifaExtendida: usoTókenesTarifaExtendida,
		SolicitudesModelo: 1, SolicitudesContextoLargo: esContextoLargo ? 1 : 0, Citas: [] };

}


export async function EjecutarGoogleFlujo(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA, entrada: EntradaIA,
	parámetros: ParámetrosNormalizados, señal: AbortSignal, alRecibirTrozo: (trozo: string) => void): Promise<UsoTókenes> {

	const claveApi = ObtenerClaveApi(contexto, proveedor);
	const url = `${proveedor.Url}/models/${conector.Modelo}:streamGenerateContent?alt=sse&key=${encodeURIComponent(claveApi)}`; // streamGenerateContent con alt=sse devuelve eventos SSE estilo OpenAI. Sin alt=sse devuelve un array JSON, más difícil de analizar en Workers.

	const respuesta = await fetch(url, {
		method: 'POST', signal: señal,
		headers: { 'content-type': 'application/json', 'accept': 'text/event-stream' },
		body: JSON.stringify(ConstruirCuerpo(conector, entrada, parámetros))
	});
	const cuerpoFlujoGemini = await ValidarRespuestaFlujo(contexto, conector, respuesta);

	interface ParteGemini { text?: string; thought?: boolean; } // thought === true indica que el part es razonamiento interno del modelo. Se filtra antes de emitir al cliente.
	interface EventoSseGemini {
		candidates?: {
			finishReason?: string;
			finishMessage?: string;
			content?: { parts?: ParteGemini[]; };
		}[];
		promptFeedback?: { blockReason?: string; };
		usageMetadata?: UsageMetadata;
	}

	let finishReason: string | undefined;
	let finishMessage: string | undefined;
	let razónBloqueoPrompt: string | undefined;
	let últimoUso: UsageMetadata | undefined;
	await ProcesarSseLineas(cuerpoFlujoGemini, señal, líneaDatos => {

		const evento = ProcesarEventoSse<EventoSseGemini>(líneaDatos);
		if (!evento) return;
		const candidato = evento.candidates?.[0];
		if (candidato?.finishReason) finishReason = candidato.finishReason;
		if (candidato?.finishMessage) finishMessage = candidato.finishMessage;
		if (evento.promptFeedback?.blockReason) razónBloqueoPrompt = evento.promptFeedback.blockReason;
		const partes = candidato?.content?.parts ?? [];
		const texto = partes.filter(p => !p.thought).map(p => p.text ?? '').join(''); // Se filtran los parts con thought === true para que el razonamiento interno no llegue al cliente.
		if (texto) alRecibirTrozo(texto);
		if (evento.usageMetadata) últimoUso = evento.usageMetadata; // Se guarda el último usageMetadata recibido: Gemini lo emite en el chunk final con el conteo definitivo de tokens.

	});

	if (finishReason === 'MAX_TOKENS') throw new ErrorLímiteTókenes();

	await VerificarBloqueoProveedor(conector, { candidates: finishReason ? [{ finishReason, finishMessage }] : undefined,
		promptFeedback: razónBloqueoPrompt ? { blockReason: razónBloqueoPrompt } : undefined }); // El flujo y el modo directo comparten exactamente la misma clasificación de finalizaciones y bloqueos de Gemini.

	if (finishReason && finishReason !== 'STOP')
		throw new Error(`La respuesta no se completó con normalidad: ${finishReason}${finishMessage ? ` (${finishMessage})` : ''}`);
	if (!finishReason) throw new Error('El flujo finalizó sin una razón de finalización.'); // Stream cerrado silenciosamente antes del evento de fin: resultado puede estar truncado.
	return ObtenerUso(últimoUso);

}
