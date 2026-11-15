
import type { Contexto, ConectorIA, ProveedorIA } from '../global';
import type { EntradaIA, ParámetrosNormalizados, ResultadoConectorDirecto, UsoTókenes } from '../ia';
import { AplicarIdentificadorUsuario, AplicarParámetrosOpcionales, ErrorLímiteTókenes,
	ErrorRespuestaDemasiadoLarga, InferirUsoSalidaConRazonamiento, ManejarRespuestaHttpError,
	ObtenerClaveApi, ProcesarEventoSse, ProcesarSseLineas, UsoTókenesCero, ValidarRespuestaFlujo,
	VerificarBloqueoProveedor } from '../ia';


interface UsageMetadata { // No cambiar los nombres porque se necesitan que sean estos para compatibilidad.
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_creation?: {
		ephemeral_5m_input_tokens?: number;
		ephemeral_1h_input_tokens?: number;
	};
}

interface DetallesParada { // Anthropic puede enviar la confirmación del rechazo como stop_details en la respuesta directa o dentro de un evento SSE.
	type?: string;
	category?: string;
	explanation?: string;
}


function ConstruirCuerpo(conector: ConectorIA, entrada: EntradaIA, parámetros: ParámetrosNormalizados, enFlujo: boolean)
	: Record<string, unknown> {

    const cuerpo: Record<string, unknown> = {
        model: conector.Modelo,
        messages: [{ role: 'user', content: entrada.MensajeUsuario }]
    };
    if (parámetros.MensajeSistemaFinal) cuerpo.system = parámetros.MensajeSistemaFinal; // En Anthropic 'system' va en el nivel raíz, no en messages.
    if (enFlujo) cuerpo.stream = true;
    AplicarParámetrosOpcionales(cuerpo, conector, parámetros, 'Anthropic');
    return cuerpo;

}


function ObtenerUso(u: UsageMetadata | undefined, parámetros?: ParámetrosNormalizados, textoVisibleFinal?: string)
	: UsoTókenes {

    if (!u) return UsoTókenesCero;
	const escrituraCaché = u.cache_creation_input_tokens ?? 0;

	if (escrituraCaché > 0 && !u.cache_creation)
		throw new Error('El uso reportado es inconsistente: cache_creation_input_tokens reportado pero no hay cache_creation.');

    let minutosCachéManual = 0;
	if (escrituraCaché > 0) {

        const minutos5 = u.cache_creation?.ephemeral_5m_input_tokens ?? 0;
        const minutos60 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;

		if (minutos5 > 0 && minutos60 > 0)
			throw new Error('El uso reportado contiene información conflictiva de diferentes duraciones de escritura en la caché, en la misma solicitud, lo cual no está soportado.');

        if (minutos5 > 0) minutosCachéManual = 5;
        else if (minutos60 > 0) minutosCachéManual = 60;

    }

    const salida = InferirUsoSalidaConRazonamiento(parámetros?.Razonamiento, parámetros?.Idioma, textoVisibleFinal, u.output_tokens,
    	undefined);

    return {
        EntradaCaché: u.cache_read_input_tokens ?? 0,
		EntradaNoCaché: (u.input_tokens ?? 0) + escrituraCaché, // Se suma porque los tokens usados para crear caché también forman parte de los tokens de entrada que el modelo realmente procesó. El costo de la escritura en caché se calcula por aparte.
        SalidaRazonamiento: salida.SalidaRazonamiento,
		FuenteSalidaRazonamiento: salida.FuenteSalidaRazonamiento,
		SalidaNoRazonamiento: salida.SalidaNoRazonamiento,
        MinutosCachéManual: minutosCachéManual,
        EscrituraCaché: escrituraCaché
    };

}


export async function EjecutarAnthropicDirecto(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA, entrada: EntradaIA,
	parámetros: ParámetrosNormalizados, señal: AbortSignal): Promise<ResultadoConectorDirecto> {

	const claveApi = ObtenerClaveApi(contexto, proveedor);
	const cuerpo = ConstruirCuerpo(conector, entrada, parámetros, false);
	await AplicarIdentificadorUsuario(contexto, conector, cuerpo);
	const respuesta = await fetch(`${proveedor.Url}/messages`, {
		method: 'POST', signal: señal,
		headers: { 'content-type': 'application/json', 'x-api-key': claveApi, 'anthropic-version': '2023-06-01' },
		body: JSON.stringify(cuerpo)
	});

	if (!respuesta.ok) await ManejarRespuestaHttpError(contexto, conector, respuesta);
	const datos = await respuesta.json() as {
		stop_reason?: string | null;
		stop_details?: DetallesParada | null;
		content?: { type: string; text?: string; }[];
		usage?: UsageMetadata;
	};

	if (datos.stop_reason === 'max_tokens') throw new ErrorLímiteTókenes();
	if (datos.stop_reason === 'model_context_window_exceeded')
		throw new ErrorRespuestaDemasiadoLarga('La respuesta se truncó por la ventana de contexto.');
	await VerificarBloqueoProveedor(conector, datos);
	const texto = (datos.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('');
	if (!texto) throw new Error('La respuesta del proveedor está vacía.');

	return { Texto: texto, Uso: ObtenerUso(datos.usage, parámetros, texto), Citas: [] };

}


export async function EjecutarAnthropicFlujo(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA, entrada: EntradaIA,
    parámetros: ParámetrosNormalizados, señal: AbortSignal, alRecibirTrozo: (trozo: string) => void): Promise<UsoTókenes> {

    const claveApi = ObtenerClaveApi(contexto, proveedor);
	const cuerpo = ConstruirCuerpo(conector, entrada, parámetros, true);
	await AplicarIdentificadorUsuario(contexto, conector, cuerpo);
    const respuesta = await fetch(`${proveedor.Url}/messages`, {
        method: 'POST', signal: señal,
        headers: { 'content-type': 'application/json', 'x-api-key': claveApi, 'anthropic-version': '2023-06-01',
            'accept': 'text/event-stream' },
		body: JSON.stringify(cuerpo)
	});

	const cuerpoFlujoAnthropic = await ValidarRespuestaFlujo(contexto, conector, respuesta);

	interface EventoSseAnthropic {
		delta?: { type?: string; text?: string; stop_reason?: string | null; stop_details?: DetallesParada | null; };
		stop_details?: DetallesParada | null;
        message?: { usage?: UsageMetadata; stop_details?: DetallesParada | null; }; // Presente en 'message_start': contiene los tokens de entrada y de caché.
        usage?: { output_tokens?: number; }; // Presente en 'message_delta': contiene solo los tokens de salida.
	}

    let stopReason: string | null = null;
	let stopDetails: DetallesParada | null = null;
    let recibióMessageStop = false;
    let textoVisibleFinal = '';
    const usoAcumulado: UsageMetadata = {}; // Anthropic divide el usage entre 'message_start' (campos de entrada) y 'message_delta' (output_tokens). Se acumulan en un solo objeto para normalizar al final.
	await ProcesarSseLineas(cuerpoFlujoAnthropic, señal, líneaDatos => {

		const evento = ProcesarEventoSse<EventoSseAnthropic>(líneaDatos); // Anthropic emite eventos 'content_block_delta' con delta.text para cada fragmento de texto. También puede emitir 'error' con data: {type:'error', error:{type,message}}.
        if (evento?.type === 'content_block_delta' && evento.delta?.type === 'text_delta' && evento.delta.text) {
			textoVisibleFinal += evento.delta.text;
			alRecibirTrozo(evento.delta.text);
		}

		if (evento?.delta?.stop_details) stopDetails = evento.delta.stop_details;
		if (evento?.stop_details) stopDetails = evento.stop_details;
		if (evento?.message?.stop_details) stopDetails = evento.message.stop_details;
        if (evento?.type === 'message_delta' && evento.delta?.stop_reason) stopReason = evento.delta.stop_reason;
        if (evento?.type === 'message_stop') recibióMessageStop = true; // Evento terminal real del protocolo Anthropic: confirma que el stream cerró limpiamente.
        if (evento?.type === 'message_start' && evento.message?.usage) Object.assign(usoAcumulado, evento.message.usage); // 'message_start' trae input_tokens, cache_read_input_tokens y cache_creation_input_tokens.
        if (evento?.type === 'message_delta' && evento.usage?.output_tokens !== undefined) // 'message_delta' trae output_tokens al final del flujo.
			usoAcumulado.output_tokens = evento.usage.output_tokens;

	});

	if (stopReason === 'max_tokens') throw new ErrorLímiteTókenes();
	if (stopReason === 'model_context_window_exceeded')
		throw new ErrorRespuestaDemasiadoLarga('La respuesta se truncó por la ventana de contexto.');
	await VerificarBloqueoProveedor(conector, { stop_reason: stopReason, stop_details: stopDetails });
	if (stopReason === null) throw new Error('El flujo finalizó sin stop_reason.'); // Stream cerrado silenciosamente antes de message_delta: resultado puede estar truncado.
	if (!recibióMessageStop) throw new Error('El flujo finalizó sin un evento terminal.'); // stop_reason llegó pero el evento terminal no: el cierre del transport quedó incompleto.

	return ObtenerUso(usoAcumulado, parámetros, textoVisibleFinal);

}
