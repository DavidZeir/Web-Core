import type { Contexto, ConectorIA } from '../global';
import { ObtenerMensajeError } from '../global';
import { ConectoresIA, ProveedoresIA } from '../../configuracion';
import type { EntradaIA, ParámetrosNormalizados, ResultadoConectorDirecto, UsoTókenes } from '../ia';
import { AplicarParámetrosOpcionales, ProcesarEventoSse, ProcesarSseLineas } from '../ia';
import { ConstruirMensajesEstándar, ObtenerUsoCompatibleOpenAI } from './compatible-openai';
import type { UsageMetadataCompatibleOpenAI } from './compatible-openai';


interface EventoSse { response?: string; usage?: UsageMetadataCompatibleOpenAI; } // Forma del evento SSE emitido por el modelo estandar de Cloudflare Workers AI (formato propio, no OpenAI Chat). No cambiar los nombres porque se necesitan que sean estos para compatibilidad.

const PrefijoErrorConfiguraciónIA = 'Error de configuración:';


export function ObtenerFormatoRespuestaCloudflare(conector: ConectorIA): NonNullable<ConectorIA['FormatoRespuestaCloudflare']> {

	const formatoRespuesta = conector.FormatoRespuestaCloudflare;
	if (formatoRespuesta === undefined || formatoRespuesta === null)
		throw new Error(`${PrefijoErrorConfiguraciónIA} el conector '${conector.Nombre}' de Cloudflare debe declarar 'FormatoRespuestaCloudflare'; no puede estar ausente ni ser null.`);

	return formatoRespuesta;

}


export function ValidarFormatoRespuestaCloudflare(nombreConector: string): void {

	const conector = ConectoresIA[nombreConector];
	const proveedor = conector ? ProveedoresIA[conector.Proveedor] : undefined;
	if (proveedor?.Formato === 'Cloudflare') ObtenerFormatoRespuestaCloudflare(conector);

}


function CrearPromesaAborto(señal: AbortSignal): Promise<never> { // Puente de aborto para env.AI.run, que no acepta AbortSignal directamente: rechaza la promesa en cuanto se activa la señal o si ya estaba abortada.

	return new Promise<never>((_, rechazar) => {
		if (señal.aborted) { rechazar(new Error('La operación se abortó antes de empezar.')); return; }
		señal.addEventListener('abort', () => rechazar(new Error(ObtenerMensajeError(señal.reason))), { once: true });
	});

}


export async function LlamarAIRunCloudflare<T>(contexto: Contexto, conector: ConectorIA, entrada: EntradaIA,
	parámetros: ParámetrosNormalizados, opcionesExtra: Record<string, unknown>, señal: AbortSignal): Promise<T> { // Construye las opciones, aplica parámetros del conector en formato Cloudflare, llama a env.AI.run y compite con el puente de aborto.

	const opciones: Record<string, unknown> = { messages: ConstruirMensajesEstándar(conector, parámetros, entrada), ...opcionesExtra };

	AplicarParámetrosOpcionales(opciones, conector, parámetros, 'Cloudflare');
	const promesaAI = contexto.Entorno.IA.run(conector.Modelo as keyof AiModels, opciones as never) as Promise<T>;
	return Promise.race([promesaAI, CrearPromesaAborto(señal)]);

}


export async function EjecutarCloudflareRespuestaDirecto(contexto: Contexto, conector: ConectorIA, entrada: EntradaIA,
	parámetros: ParámetrosNormalizados, señal: AbortSignal): Promise<ResultadoConectorDirecto> {

	const respuesta = await LlamarAIRunCloudflare<{ response?: string; usage?: UsageMetadataCompatibleOpenAI; }>(contexto, conector,
		entrada, parámetros, {}, señal);
	const texto = respuesta?.response ?? '';
	if (!texto) throw new Error('La respuesta del proveedor está vacía.');
	return { Texto: texto, Uso: ObtenerUsoCompatibleOpenAI(respuesta.usage), Citas: [] };

}


export async function EjecutarCloudflareRespuestaFlujo(contexto: Contexto, conector: ConectorIA, entrada: EntradaIA,
	parámetros: ParámetrosNormalizados, señal: AbortSignal, alRecibirTrozo: (trozo: string) => void): Promise<UsoTókenes> {

	const flujo = await LlamarAIRunCloudflare<ReadableStream<Uint8Array>>(contexto, conector, entrada, parámetros,
		{ stream: true, stream_options: { include_usage: true } }, señal); // stream: true devuelve un ReadableStream con SSE 'data: {...}\n\n' y termina con 'data: [DONE]'.
    let últimoUso: UsageMetadataCompatibleOpenAI | undefined;
    let recibioDone = false;
    await ProcesarSseLineas(flujo, señal, líneaDatos => {

		if (líneaDatos === '[DONE]') { recibioDone = true; return; } // Centinela de fin de flujo: se registra antes de pasar a ProcesarEventoSse para poder detectar cierre silencioso al final.
		const json = ProcesarEventoSse<EventoSse>(líneaDatos);
        if (json?.response) alRecibirTrozo(json.response);
        if (json?.usage) últimoUso = json.usage; // Se guarda el último usage recibido: Cloudflare puede emitirlo en el último chunk antes de [DONE].

    });
	if (!recibioDone) throw new Error('El flujo finalizó sin una etiqueta [DONE].'); // Stream cerrado silenciosamente antes del centinela de fin: resultado puede estar truncado.
    return ObtenerUsoCompatibleOpenAI(últimoUso);

}
