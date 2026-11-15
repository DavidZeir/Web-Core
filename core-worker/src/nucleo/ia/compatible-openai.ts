import type { Contexto, ConectorIA, ProveedorIA } from '../global';
import type { EntradaIA, EstadoUsoAcumulado, ParámetrosNormalizados, ResultadoConectorDirecto, UsoTókenes } from '../ia';
import { AcumularUsoRonda, AplicarIdentificadorUsuario, AplicarParámetrosOpcionales, CrearFuenteInfracción,
	CrearUsoFacturable, ErrorContenidoBloqueado, ErrorLímiteTókenes, InferirUsoSalidaConRazonamiento,
	ManejarRespuestaHttpError, MensajeRespuestaBloqueadaPorFiltro, ObtenerClaveApi,
	ObtenerUnidadesInfracciónBloqueoEstructurado, ProcesarEventoSse, ProcesarSseLineas, UsoTókenesCero,
	UsoTókenesTarifaExtendidaCero, ValidarRespuestaFlujo, VerificarBloqueoProveedor } from '../ia';
import { AñadirInstrucciónBúsquedaParallel, ConstruirHerramientaParallelChat, ConstruirResultadoParallel,
	CrearEstadoBúsquedaParallel, ProcesarLlamadasBúsquedaParallel } from './parallel';
import { LlamarAIRunCloudflare } from './cloudflare';


const EtiquetaAperturaRazonamiento = '<think>';

const EtiquetaCierreRazonamiento = '</think>';

export interface EstadoFiltroRazonamiento { EnRazonamiento: boolean; Búfer: string; }

interface EventoSse { choices?: { finish_reason?: string | null; delta?: { content?: string; }; }[]; usage?: UsageMetadataCompatibleOpenAI; } // No cambiar los nombres porque se necesitan que sean estos para compatibilidad.

export interface UsageMetadataCompatibleOpenAI { // No cambiar los nombres porque se necesitan que sean estos para compatibilidad.
	prompt_tokens?: number;
	completion_tokens?: number;
	prompt_tokens_details?: { cached_tokens?: number; };
	completion_tokens_details?: { reasoning_tokens?: number; };
}


export function ConstruirMensajesEstándar(conector: ConectorIA, parámetros: ParámetrosNormalizados, entrada: EntradaIA): { role: string; content: string; }[] { // Construye el array estándar de mensajes [system?, user] usado por los formatos que aceptan 'role'/'content' (OpenAI-compatible y Cloudflare Workers AI).

    const mensajes: { role: string; content: string; }[] = [];
    if (conector.SoportaMensajeSistema !== false && parámetros.MensajeSistemaFinal)
    	mensajes.push({ role: 'system', content: parámetros.MensajeSistemaFinal });
    mensajes.push({ role: 'user', content: entrada.MensajeUsuario });
    return mensajes;

}


function ConstruirCuerpo(conector: ConectorIA, entrada: EntradaIA, parámetros: ParámetrosNormalizados, enFlujo: boolean)
	: Record<string, unknown> {

    const cuerpo: Record<string, unknown> = { model: conector.Modelo, messages: ConstruirMensajesEstándar(conector, parámetros,
    	entrada) };
    if (enFlujo) { cuerpo.stream = true; cuerpo.stream_options = { include_usage: true }; } // stream_options solicita el usage al final del flujo en proveedores OpenAI Chat-compatible.
    AplicarParámetrosOpcionales(cuerpo, conector, parámetros, 'OpenAI Chat');
    return cuerpo;

}


export async function EjecutarCompatibleOpenAIDirecto(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA,
	entrada: EntradaIA, parámetros: ParámetrosNormalizados, señal: AbortSignal,
	detallarErroresProveedor = false): Promise<ResultadoConectorDirecto> {

	if (entrada.BúsquedaWeb && entrada.ProveedorBúsquedaWeb === 'Parallel')
		return EjecutarConParallel(contexto, conector, proveedor, entrada, parámetros, señal, detallarErroresProveedor);

	const esCloudflare = conector.Proveedor === 'cloudflare';
	type DatosChat = {
		choices?: {
			finish_reason?: string | null;
			message?: { content?: string; reasoning?: string; };
		}[];
		usage?: UsageMetadataCompatibleOpenAI;
	};
	let datos: DatosChat;

	if (esCloudflare) {
		datos = await LlamarAIRunCloudflare<DatosChat>(contexto, conector, entrada, parámetros, {}, señal); // Formato 'Cloudflare' inyecta chat_template_kwargs para razonamiento nativo (ej: kimi-k2.6).
	} else {

		const claveApi = ObtenerClaveApi(contexto, proveedor);
		const cuerpo = ConstruirCuerpo(conector, entrada, parámetros, false);
		await AplicarIdentificadorUsuario(contexto, conector, cuerpo);
		const respuesta = await fetch(`${proveedor.Url}/chat/completions`, {
			method: 'POST', signal: señal,
			headers: { 'content-type': 'application/json', 'authorization': `Bearer ${claveApi}` },
			body: JSON.stringify(cuerpo)
		});
		if (!respuesta.ok) await ManejarRespuestaHttpError(contexto, conector, respuesta, detallarErroresProveedor);
		datos = await respuesta.json() as DatosChat;

	}

	const elección = datos.choices?.[0];
	const finishReason = elección?.finish_reason;
	if (finishReason === 'length') throw new ErrorLímiteTókenes();
	await VerificarBloqueoProveedor(conector, datos);
	if (finishReason !== 'stop')
		throw new Error(`La respuesta del proveedor no se completó normalmente: ${finishReason ?? 'desconocida'}`);
	const textoCrudo = elección?.message?.content || '';
	if (!textoCrudo) throw new Error('La respuesta del proveedor está vacía.');
	const texto = LimpiarRazonamientoTipoThink(textoCrudo); // Modelos compatibles con OpenAI Chat (estilo DeepSeek-R1, Kimi K2.6) pueden emitir razonamiento dentro de <think>...</think>. Se elimina antes de devolver el texto al cliente.
	const uso = ObtenerUsoCompatibleOpenAI(datos.usage, parámetros, texto);
	const { UsoFacturable: usoFacturable, UsoTókenesTarifaExtendida: usoTókenesTarifaExtendida,
		EsContextoLargo: esContextoLargo } = CrearUsoFacturable(conector, uso);
	return { Texto: texto, Uso: uso, UsoFacturable: usoFacturable, UsoTókenesTarifaExtendida: usoTókenesTarifaExtendida,
		SolicitudesModelo: 1, SolicitudesContextoLargo: esContextoLargo ? 1 : 0, Citas: [] };

}


async function EjecutarConParallel(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA, entrada: EntradaIA,
	parámetros: ParámetrosNormalizados, señal: AbortSignal, detallarErroresProveedor: boolean): Promise<ResultadoConectorDirecto> { // Orquesta las rondas de Chat Completions con la herramienta de búsqueda de Parallel y conserva la contabilidad acumulada hasta la respuesta final.

	type LlamadaHerramientaChat = { id?: string; type?: string; function?: { name?: string; arguments?: string; }; };
	type MensajeChat = { role?: string; content?: string | null; reasoning_content?: string | null; reasoning_details?: unknown;
		tool_calls?: LlamadaHerramientaChat[]; };
	type DatosChat = { choices?: { finish_reason?: string | null; message?: MensajeChat; }[];
		usage?: UsageMetadataCompatibleOpenAI; };

	const claveApi = ObtenerClaveApi(contexto, proveedor);
	const parámetrosParallel = { ...parámetros, MensajeSistemaFinal: AñadirInstrucciónBúsquedaParallel(parámetros.MensajeSistemaFinal) }; // Añade la instrucción de citación y búsqueda sin mutar los parámetros compartidos con otras rutas.
	const cuerpo = ConstruirCuerpo(conector, entrada, parámetrosParallel, false); // Construye el contrato inicial de Chat Completions con los parámetros normalizados.
	cuerpo.tools = [ConstruirHerramientaParallelChat()]; // Registra la herramienta externa que el modelo puede invocar para pedir búsquedas.

	const esDeepSeekEnModoPensamiento = conector.Proveedor === 'deepseek' && parámetros.Razonamiento !== undefined
		&& parámetros.Razonamiento !== 'none';
	if (!esDeepSeekEnModoPensamiento) cuerpo.tool_choice = entrada.ForzarBúsquedaWeb ? 'required' : 'auto';

	const estado = CrearEstadoBúsquedaParallel(contexto); // Crea el estado mutable que acumula fuentes, cantidad y duración de todas las búsquedas de la investigación.
	await AplicarIdentificadorUsuario(contexto, conector, cuerpo);
	const mensajes = cuerpo.messages as Record<string, unknown>[]; // Obtiene el historial que se ampliará con los mensajes assistant y tool de cada ronda.
	let estadoUsoAcumulado: EstadoUsoAcumulado = { Uso: UsoTókenesCero, UsoFacturable: UsoTókenesCero,
		UsoTókenesTarifaExtendida: UsoTókenesTarifaExtendidaCero, SolicitudesContextoLargo: 0 };

	let solicitudesModelo = 0; // Cuenta cada respuesta recibida del modelo, incluidas las rondas intermedias con herramientas.
	while (true) { // Repite el intercambio hasta que el modelo entregue una respuesta final o se propague un error.

		const respuesta = await fetch(`${proveedor.Url}/chat/completions`, { // Envía el historial completo y la configuración actual de herramientas en cada ronda.
			method: 'POST', signal: señal,
			headers: { 'content-type': 'application/json', 'authorization': `Bearer ${claveApi}` },
			body: JSON.stringify(cuerpo), // Serializa el cuerpo actualizado, incluido el historial de rondas anteriores que se actualiza en mensajes.push(... resultadoBúsquedas.Salidas).
		});

		if (!respuesta.ok) await ManejarRespuestaHttpError(contexto, conector, respuesta, detallarErroresProveedor);

		const datos = await respuesta.json() as DatosChat;
		solicitudesModelo += 1; // Registra la solicitud solo después de recibir una respuesta HTTP válida.
		const elección = datos.choices?.[0]; // Toma la única alternativa solicitada al proveedor
		const mensaje = elección?.message; // Extrae el mensaje de la IA que puede contener texto o llamadas de herramienta.
		const llamadas = mensaje?.tool_calls ?? []; // Normaliza la ausencia de llamadas a una lista vacía para distinguir búsqueda de respuesta final.
		await VerificarBloqueoProveedor(conector, datos); // Conserva las señales de bloqueo o moderación antes de procesar el contenido de la ronda.

		if (llamadas.length > 0) { // Una o más llamadas indican que el modelo todavía necesita resultados de búsqueda antes de responder.

			const textoVisibleRonda = [mensaje?.content ?? '',
				...llamadas.map(llamada => `${llamada.function?.name ?? ''}${llamada.function?.arguments ?? ''}`)].join('\n'); // Incluye el texto visible y los argumentos de herramienta para intentar clasificar la salida de esta ronda entre razonamiento y no razonamiento.
			const usoRonda = ObtenerUsoCompatibleOpenAI(datos.usage, parámetros, textoVisibleRonda); // Interpreta los tókenes reportados y separa razonamiento de texto visible cuando corresponde.
			estadoUsoAcumulado = AcumularUsoRonda(conector, estadoUsoAcumulado, usoRonda); // Suma esta ronda y decide su tarifa extendida antes de mezclarla con las siguientes.

			const resultadoBúsquedas = await ProcesarLlamadasBúsquedaParallel(contexto,
				llamadas.map(llamada => ({ Id: llamada.id, Nombre: llamada.function?.name, Argumentos: llamada.function?.arguments })),
				estado, entrada.ExtensiónBúsquedaWeb, entrada.PaísBúsquedaWeb, señal); // Valida las llamadas, ejecuta solo las búsquedas permitidas y devuelve una salida alineada con cada llamada.

			const mensajeAsistente: Record<string, unknown> = { role: 'assistant', content: mensaje?.content ?? '', tool_calls: llamadas }; // DeepSeek V4 y la guía de compatibilidad de Novita documentan contenido no nulo en mensajes assistant con tools: https://api-docs.deepseek.com/quick_start/agent_integrations/oh_my_pi/ https://novita.ai/docs/guides/llm-interleaved-thinking. El mensaje reconstruido conserva solo el contrato común Chat de OpenAI. No se reenvía el campo genérico reasoning: https://developers.openai.com/api/reference/cli/resources/chat/subresources/completions.

			if (conector.RazonamientoConfigurable && conector.EstiloRazonamiento && mensaje
				&& Object.prototype.hasOwnProperty.call(mensaje, 'reasoning_content'))
					mensajeAsistente.reasoning_content = mensaje.reasoning_content; // DeepSeek y Fireworks exigen reenviar reasoning_content en rondas posteriores con tools. Se conserva incluso vacío o null: https://api-docs.deepseek.com/guides/thinking_mode/ https://docs.fireworks.ai/guides/reasoning.

			if (conector.Proveedor === 'novita' && mensaje && Object.prototype.hasOwnProperty.call(mensaje, 'reasoning_details'))
				mensajeAsistente.reasoning_details = mensaje.reasoning_details; // Novita exige conservar reasoning_details junto con content y tool_calls para el razonamiento intercalado: https://novita.ai/docs/guides/llm-interleaved-thinking.

			mensajes.push(mensajeAsistente); // Agrega al historial el mensaje assistant reconstruido con las llamadas para que la siguiente ronda sea válida.
			llamadas.forEach(
				(llamada, índice) => mensajes.push({role: 'tool', tool_call_id: llamada.id!, content: resultadoBúsquedas.Salidas[índice]})); // Empareja cada resultado de Parallel con su tool_call_id y conserva el orden exigido por Chat Completions.

			if (resultadoBúsquedas.LímiteAlcanzado) { // Cuando se agota el cupo, evita nuevas búsquedas y permite que el modelo consolide lo ya obtenido.
				cuerpo.tool_choice = 'none'; // Desactiva nuevas llamadas incluso en DeepSeek. La excepción solo aplica a required en la petición inicial.
			} else if (!esDeepSeekEnModoPensamiento) cuerpo.tool_choice = 'auto'; // Mantiene disponible otra búsqueda mientras quede cupo y no sea el caso especial de DeepSeek.

			continue; // Envía otra ronda con el historial ampliado y los resultados de búsqueda recién incorporados.

		}

		const finishReason = elección?.finish_reason; // Lee la razón de finalización para diferenciar una respuesta completa de un corte por límite.
		if (finishReason === 'length') throw new ErrorLímiteTókenes(); // Propaga el límite de salida como error de negocio reconocible.
		if (finishReason !== 'stop')
			throw new Error(`La respuesta del proveedor no se completó normalmente: ${finishReason ?? 'desconocida'}`); // Rechaza estados desconocidos para no presentar como válida una respuesta incompleta.
		if (entrada.ForzarBúsquedaWeb && estado.BúsquedasWeb === 0)
			throw new Error('El modelo no ejecutó la búsqueda web obligatoria.'); // Hace cumplir la intención del usuario aunque el modelo haya respondido sin invocar la herramienta.
		const textoCrudo = mensaje?.content || ''; // Obtiene el texto final del mensaje assistant sin modificar todavía el contenido recibido.
		if (!textoCrudo) throw new Error('La respuesta del proveedor está vacía.');
		const texto = LimpiarRazonamientoTipoThink(textoCrudo);
		const usoRonda = ObtenerUsoCompatibleOpenAI(datos.usage, parámetros, texto);
		estadoUsoAcumulado = AcumularUsoRonda(conector, estadoUsoAcumulado, usoRonda);

		return ConstruirResultadoParallel(texto, estado, estadoUsoAcumulado, solicitudesModelo); // Formatea las citas y devuelve texto, uso facturable y metadatos de toda la investigación.

	}

}


export function LimpiarRazonamientoTipoThink(texto: string): string {

    let resultado = texto.replace(/<think>[\s\S]*?<\/think>/g, '');
    const aperturaSinCierre = resultado.indexOf('<think>');
    if (aperturaSinCierre >= 0) resultado = resultado.substring(0, aperturaSinCierre);
    return resultado;

}


export async function EjecutarCompatibleOpenAIFlujo(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA,
	entrada: EntradaIA, parámetros: ParámetrosNormalizados, señal: AbortSignal,
	alRecibirTrozo: (trozo: string) => void): Promise<UsoTókenes> {

	const esCloudflare = conector.Proveedor === 'cloudflare';
	let flujoSse: ReadableStream<Uint8Array>;

	if (esCloudflare) {
		flujoSse = await LlamarAIRunCloudflare<ReadableStream<Uint8Array>>(contexto, conector, entrada, parámetros,
			{ stream: true, stream_options: { include_usage: true } }, señal); // Formato 'Cloudflare' inyecta chat_template_kwargs para razonamiento nativo (ej: kimi-k2.6).
	} else {

		const claveApi = ObtenerClaveApi(contexto, proveedor);
		const cuerpo = ConstruirCuerpo(conector, entrada, parámetros, true);
		await AplicarIdentificadorUsuario(contexto, conector, cuerpo);
		const respuesta = await fetch(`${proveedor.Url}/chat/completions`, {
			method: 'POST', signal: señal,
			headers: { 'content-type': 'application/json', 'authorization': `Bearer ${claveApi}`, 'accept': 'text/event-stream' },
			body: JSON.stringify(cuerpo)
		});
			flujoSse = await ValidarRespuestaFlujo(contexto, conector, respuesta);

	}

	const estadoFiltro: EstadoFiltroRazonamiento = { EnRazonamiento: false, Búfer: '' }; // Estado mutable que sobrevive entre trozos SSE para detectar etiquetas <think>...</think> cuando quedan partidas en el límite de un chunk.
	let finishReason: string | null = null;
	let últimoUso: UsageMetadataCompatibleOpenAI | undefined;
	let recibióDone = false;
	let textoVisibleFinal = '';
	await ProcesarSseLineas(flujoSse, señal, líneaDatos => {

		if (líneaDatos === '[DONE]') { recibióDone = true; return; } // El centinela final confirma que el stream cerró correctamente y no solo que llegó un finish_reason intermedio.
		const trozo = ProcesarEventoSse<EventoSse>(líneaDatos);
		if (!trozo) return;
		const choice = trozo.choices?.[0];
		if (choice?.finish_reason) finishReason = choice.finish_reason;
		const contenido = choice?.delta?.content;
		if (contenido)
			FiltrarRazonamientoTipoThink(estadoFiltro, contenido, texto => { textoVisibleFinal += texto; alRecibirTrozo(texto); }); // Modelos compatibles con OpenAI Chat (estilo DeepSeek-R1, Kimi K2.6) pueden emitir razonamiento en delta.content. Se descarta antes de reenviarlo al cliente.
		if (trozo.usage) últimoUso = trozo.usage; // Se guarda el último usage: los proveedores OpenAI Chat-compatible lo emiten en el chunk final cuando se usa stream_options.include_usage.

	});
	if (finishReason === 'length') throw new ErrorLímiteTókenes();
	if (finishReason === 'content_filter')
		throw new ErrorContenidoBloqueado(MensajeRespuestaBloqueadaPorFiltro,
			ObtenerUnidadesInfracciónBloqueoEstructurado(finishReason, conector.Proveedor),
			CrearFuenteInfracción(conector, 'finish_reason:content_filter'));
	if (finishReason === null) throw new Error('El proveedor finalizó el flujo silenciosamente.'); // Stream cerrado silenciosamente antes del evento de fin: resultado puede estar truncado.
	if (finishReason !== 'stop') throw new Error(`El flujo no se completó normalmente: ${finishReason}`);
	if (!recibióDone) throw new Error('El flujo finalizó sin la etiqueta [DONE].'); // Si faltó el centinela SSE final, el cierre quedó incompleto aunque haya llegado finish_reason.
	FinalizarFiltroRazonamiento(estadoFiltro, texto => { textoVisibleFinal += texto; alRecibirTrozo(texto); });
	return ObtenerUsoCompatibleOpenAI(últimoUso, parámetros, textoVisibleFinal);

}


export function FiltrarRazonamientoTipoThink(estado: EstadoFiltroRazonamiento, trozo: string, emitir: (texto: string) => void): void {

    let pendiente = estado.Búfer + trozo;
    estado.Búfer = '';
    while (pendiente.length > 0) {

        if (estado.EnRazonamiento) {

            const fin = pendiente.indexOf(EtiquetaCierreRazonamiento);
            if (fin >= 0) {
                pendiente = pendiente.substring(fin + EtiquetaCierreRazonamiento.length); // Se descarta todo lo que va dentro del bloque y la propia etiqueta de cierre.
                estado.EnRazonamiento = false;
			} else {

                const seguro = Math.max(0, pendiente.length - (EtiquetaCierreRazonamiento.length - 1)); // Se conservan los últimos N-1 carácteres como posible inicio de '</think>' partido entre chunks. El resto se descarta porque pertenece al razonamiento.
                estado.Búfer = pendiente.substring(seguro);
				pendiente = '';

            }

        } else {

            const inicio = pendiente.indexOf(EtiquetaAperturaRazonamiento);
			if (inicio >= 0) {

                if (inicio > 0) emitir(pendiente.substring(0, inicio)); // Se emite el texto visible previo a la etiqueta de apertura.
                pendiente = pendiente.substring(inicio + EtiquetaAperturaRazonamiento.length);
				estado.EnRazonamiento = true;

			} else {

                const seguro = Math.max(0, pendiente.length - (EtiquetaAperturaRazonamiento.length - 1)); // Se conservan los últimos N-1 carácteres como posible inicio de '<think>' partido entre chunks. El resto se emite como texto visible.
                if (seguro > 0) emitir(pendiente.substring(0, seguro));
                estado.Búfer = pendiente.substring(seguro);
				pendiente = '';

            }

        }

    }

}


export function FinalizarFiltroRazonamiento(estado: EstadoFiltroRazonamiento, emitir: (texto: string) => void): void {
    if (!estado.EnRazonamiento && estado.Búfer) emitir(estado.Búfer);
}


export function ObtenerUsoCompatibleOpenAI(u: UsageMetadataCompatibleOpenAI | undefined, parámetros?: ParámetrosNormalizados,
	textoVisibleFinal?: string): UsoTókenes {

	if (!u) return UsoTókenesCero;
	const entradaCaché = u.prompt_tokens_details?.cached_tokens ?? 0;
	const salidaRazonamientoProveedor = u.completion_tokens_details?.reasoning_tokens;
	const salida = InferirUsoSalidaConRazonamiento(parámetros?.Razonamiento, parámetros?.Idioma, textoVisibleFinal,
		u.completion_tokens, salidaRazonamientoProveedor);
	return {
		EntradaCaché: entradaCaché,
		EntradaNoCaché: Math.max(0, (u.prompt_tokens ?? 0) - entradaCaché),
		SalidaRazonamiento: salida.SalidaRazonamiento,
		FuenteSalidaRazonamiento: salida.FuenteSalidaRazonamiento,
		SalidaNoRazonamiento: salida.SalidaNoRazonamiento,
		MinutosCachéManual: 0,
		EscrituraCaché: 0
	};

}
