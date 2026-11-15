import { ConectoresIA, IdiomasSoportados, ModelosIAEspecíficos, ProveedoresIA } from '../configuracion';
import type { ProveedorBúsquedaWeb } from '../configuracion';
import { EnviarAlertaErrorCrítico } from './alertas';
import { ConectorIA, Contexto, EstiloRazonamiento, FormatoProveedorIA, Idioma, ObtenerIdentificadorUsuarioParaTerceros,
	ObtenerMensajeError, ProveedorIA, RegistrarEventoConPrefijo } from './global';
import { ObtenerTextoEnIdioma } from './idiomas';
import { EjecutarAnthropicDirecto, EjecutarAnthropicFlujo } from './ia/anthropic';
import { EjecutarGoogleDirecto, EjecutarGoogleFlujo } from './ia/google';
import { EjecutarCompatibleOpenAIDirecto, EjecutarCompatibleOpenAIFlujo } from './ia/compatible-openai';
import { EjecutarOpenAIModerationsDirecto, EjecutarOpenAIResponsesDirecto, EjecutarOpenAIResponsesFlujo, ModoEspecialOpenAITieneFast,
	ModoEspecialOpenAITienePro, ValidarCompatibilidadFlujoModeraciónIntegradaOpenAI } from './ia/openai';
import { CalcularCostoBúsquedaWebDólares, ErrorParallel } from './ia/parallel';
import { EjecutarCloudflareRespuestaDirecto, EjecutarCloudflareRespuestaFlujo, ObtenerFormatoRespuestaCloudflare, ValidarFormatoRespuestaCloudflare } from './ia/cloudflare';
export type { EstadoFiltroRazonamiento } from './ia/compatible-openai';
export { FiltrarRazonamientoTipoThink, FinalizarFiltroRazonamiento, LimpiarRazonamientoTipoThink } from './ia/compatible-openai';
import * as v from 'valibot';


const MilisegundosIntervaloLatido = 10_000; // Intervalo en el que se emite 'señal-de-vida' para mantener viva la conexión HTTP durante procesamiento largo sin tokens emitidos.

const MáximosCarácteresMensajeUsuario = 50_000; // Límite máximo de carácteres combinados (MensajeUsuario + MensajeSistema) antes de llamar a cualquier modelo.

const MilisegundosMáximosModeraciónContenido = 2_000; // Margen preventivo para ser en exceso prevenido ante posibles vencimientos ocasionales de moderación. Parece que podrían ocurrir en algunos casos, aunque no existe evidencia concluyente.

export const SegundosMáximosIA = 600; // Límite máximo compartido por las rutas y el núcleo para el tiempo de espera de cada intento de IA, incluidas las consultas con búsquedas web.

export const MáximoTókenesSalidaIA = 384_000; // Límite superior del contrato común del núcleo. Coincide con el máximo típico más alto configurado y permite que el núcleo acote después según el proveedor efectivo.

const ModeloModeraciónContenido = 'omni-moderation-latest'; // Modelo específico principal de moderación de contenido. El conector activo y sus respaldos se declaran en configuracion.ts.

const MensajeTimeoutConector = 'Tiempo de espera agotado: el conector no respondió a tiempo.';

const PrefijoErrorConfiguraciónIA = 'Error de configuración:';

const MensajeErrorConfiguraciónIACliente = 'Error interno de configuración de IA.';

const ModosIA = ['Directo', 'Flujo'] as const; // Se hace así para que TypeScript infiera el tipo literal de cada modo y no solo string, lo que permite validación automática en tiempo de entrada con v.picklist(ModosIA) y autocompletado en el IDE. El modo 'directo' devuelve una sola respuesta JSON bloqueante. El modo 'flujo' devuelve un NDJSON con eventos progresivos (inicio, señal-de-vida, respuesta, fin, error) para UX reactiva. El cliente decide qué modo usar según su caso de uso: integraciones síncronas y respuestas cortas pueden beneficiarse del modo directo, mientras que interfaces de chat o respuestas largas se benefician del modo flujo para mostrar retroalimentación rápida al usuario.

export type ModoIA = typeof ModosIA[number];

export type TipoEventoIA = 'Inicio' | 'Latido' | 'Respuesta' | 'Fin' | 'Error';

export enum CódigoErrorIA {
	SolicitudInválida = 'SolicitudInválida',
	ContenidoNoPermitido = 'ContenidoNoPermitido',
	ModeraciónNoDisponible = 'ModeraciónNoDisponible',
	SolicitudCancelada = 'SolicitudCancelada',
	TiempoEsperaAgotado = 'TiempoEsperaAgotado',
	ProveedorNoDisponible = 'ProveedorNoDisponible',
	LímiteTókenesAlcanzado = 'LímiteTókenesAlcanzado',
	RespuestaDemasiadoLarga = 'RespuestaDemasiadoLarga',
	ConfiguraciónInválida = 'ConfiguraciónInválida',
	ErrorInterno = 'ErrorInterno',
}

export interface ErrorIA { Código: CódigoErrorIA; Fuente: string; Error: string; DuraciónMilisegundos?: number; } // Código permite al cliente decidir sin analizar el mensaje. Fuente conserva el conector o 'Solicitud' para diagnóstico y DuraciónMilisegundos mide el intento fallido cuando aplica.

export interface CitaIA {
	URL: string;
	Título: string;
	Inicio?: number;
	Fin?: number;
	TextoCitado?: string;
}

export interface EventoIA {
	Tipo: TipoEventoIA; Texto?: string; Errores?: ErrorIA[]; UsoTókenes?: UsoTókenes; BúsquedasWeb?: number; InferenciaMilisegundos?: number;
}

export interface UsoTókenes {
	EntradaCaché: number;
	EntradaNoCaché: number;
	SalidaRazonamiento: number;
	FuenteSalidaRazonamiento: 'Proveedor' | 'Inferido'; // Indica si los tókenes de razonamiento se reportan directamente por el proveedor ('Proveedor') o si se infieren restando los tokens visibles de la salida al total de tokens de salida ('Inferido').
	SalidaNoRazonamiento: number;
	MinutosCachéManual: number; // Cantidad de minutos establecidos por cliente para guardar la entrada en caché. Para Claude solo es válido 0, 5 o 60. Para Gemini puede ser cualquier valor entero. Pendiente implementación para Anthropic y para Gemini.
	EscrituraCaché: number; // Tókenes escritos con caché. Es manual para Gemini y Anthropic, o manual o automática para OpenAI. No son sumables a los input totales: se cobran por separado mediante el precio de escritura de caché correspondiente. Son un cobro separado por escritura en la caché como lo maneja Google. Anthropic los reporta juntos, pero al extraerlos, se separan. Tener cuidado que en el momento de cobrar estos tókenes de escritura en caché para Anthropic se debe usar (1.25 (5 minutos) o 2 (1 hora) - 1) porque ese es el costo real de la escritura sola. Aunque Anthropic permite combinar diferentes minutos de caché en una consulta, no se permite en este módulo. Solo puede haber escritura de caché de 5 minutos o de 60 minutos, pero no ambas.
}

export interface UsoTókenesTarifaExtendida {
	EntradaCaché: number;
	EntradaNoCaché: number;
	EscrituraCaché: number;
	SalidaRazonamiento: number;
	SalidaNoRazonamiento: number;
}

export type UnidadesInfracciónIA = 0 | 1 | 2 | 3;

export interface ResultadoIADirecto { // Regla de datos hacia el cliente: No se expone información de modelos ni proveedores en los errores que se envían al cliente.
	Tipo: 'Respuesta' | 'Error';
	Texto: string;
	Errores: ErrorIA[];
	ConectorEfectivo: string | null;
	ConsultasFallidas: number;
	UsoTókenes: UsoTókenes;
	InferenciaMilisegundos: number; // Tiempo del conector que respondió al final.
	InferenciaTotalMilisegundos: number; // Tiempo total de toda la cadena de consultas, incluyendo fallos y respuesta final.
	CostoDólares: number;
	BúsquedasWeb: number;
	UsoTókenesFacturables?: UsoTókenes; // Proyección contable de UsoTókenes, no una medición adicional del proveedor. Cuando aplica la tarifa de contexto largo, CrearUsoFacturable multiplica los conteos reales de entrada y salida por los multiplicadores configurados para que la fórmula de precios existente produzca el costo equivalente. Es un atajo pragmático para reutilizar esa fórmula sin duplicar tablas ni caminos de cálculo. UsoTókenes conserva los tókenes reales y UsoTókenesTarifaExtendida conserva el subconjunto real que recibió el recargo. Este campo no debe interpretarse como una cantidad real de tókenes ni usarse para métricas técnicas de consumo.
	ProveedorBúsquedaWeb: ProveedorBúsquedaWeb | null; // Metadato interno usado para persistir y cobrar el proveedor elegido. No se expone en ResponderResultadoIADirecto.
	UsoTókenesTarifaExtendida?: UsoTókenesTarifaExtendida; // Subconjunto real perteneciente a solicitudes cobradas con tarifa extendida. No contiene multiplicadores ni se expone públicamente.
	Citas: CitaIA[];
	UnidadesInfracción: UnidadesInfracciónIA; // Metadato interno para que la capa de negocio registre bloqueos de proveedores. ResponderResultadoIADirecto lo excluye deliberadamente del JSON público.
	FuenteInfracción?: FuenteInfracciónIA; // Metadato interno para atribuir la unidad al conector que emitió la señal, aunque otro conector haya entregado la respuesta final. ResponderResultadoIADirecto también lo excluye del JSON público.
}

const MensajeTókenesMáximosAlcanzado = 'La respuesta no pudo completarse porque se alcanzó el límite máximo de tókenes. Aumenta TókenesMáximos o solicita una respuesta más corta.';

const PrefijoMensajeErrorProveedorBloqueo = 'Proveedor bloqueó el contenido:';

export const MensajeRespuestaBloqueadaPorFiltro = 'La respuesta fue bloqueada por el filtro de contenido.';

interface EventoSseBase { type?: string; error?: string | { message?: string; code?: string; }; } // Forma común de los eventos SSE de los proveedores: además del las propiedades propias (choices/candidates/delta/etc.) todos pueden incluir 'type' y/o 'error' para señalar fallas intermedias.

export interface FuenteInfracciónIA {
	Conector: string;
	Proveedor: string;
	Modelo: string;
	Señal: string;
	EstadoHttp: number | null;
}

export interface MetadatosInfracciónIA {
	UnidadesInfracción: UnidadesInfracciónIA;
	FuenteInfracción?: FuenteInfracciónIA;
}

export function CombinarInfraccionesIA(primera: MetadatosInfracciónIA, segunda: MetadatosInfracciónIA): MetadatosInfracciónIA {

	const usaFuentePrimera = primera.UnidadesInfracción > segunda.UnidadesInfracción
		|| (primera.UnidadesInfracción === segunda.UnidadesInfracción
			&& segunda.FuenteInfracción === undefined && primera.FuenteInfracción !== undefined);
	return {
		UnidadesInfracción: Math.max(primera.UnidadesInfracción, segunda.UnidadesInfracción) as UnidadesInfracciónIA,
		FuenteInfracción: usaFuentePrimera ? primera.FuenteInfracción : segunda.FuenteInfracción
	};

}

interface BloqueoProveedor { Razón: string; Mensaje?: string; ValorEstructurado?: string; EstadoHttp?: number; UnidadesInfracción: UnidadesInfracciónIA; } // Resultado cuando un proveedor rechaza contenido por seguridad o política.

export class ErrorContenidoBloqueado extends Error {


	constructor(mensaje: string, readonly UnidadesInfracción: UnidadesInfracciónIA = 1,
		readonly FuenteInfracción?: FuenteInfracciónIA) {
		super(mensaje); this.name = 'ErrorContenidoBloqueado';
	}


}


export class ErrorLímiteTókenes extends Error {


	constructor(mensaje = MensajeTókenesMáximosAlcanzado) { super(mensaje); this.name = 'ErrorLímiteTókenes'; }


}


export class ErrorRespuestaDemasiadoLarga extends Error {


	constructor(mensaje: string) { super(mensaje); this.name = 'ErrorRespuestaDemasiadoLarga'; }


}

const ValoresBloqueoEstructurado = [ 'content_filter', 'content_policy_violation', 'refusal', 'safety', 'blocked', 'blocklist', 'prohibited', 'policy', 'unsafe', 'spii', 'prohibited_content' ]; // Valores exactos que pueden llegar en code, type, finishReason, blockReason o stop_reason del proveedor.

const FragmentosMensajeBloqueo = [ // Fragmentos medianos para mensajes libres. Evitan contar palabras aisladas como policy o safety y toleran variaciones del resto del mensaje.
	'content filter', 'content policy violation', 'policy violation', 'safety policy', 'safety filter', 'safety violation',
	'prohibited content', 'unsafe content', 'blocked content', 'content blocked'
];

const ValoresBloqueoDuroOpenAI = [ 'content_filter', 'content_policy_violation', 'refusal' ]; // Señales estructuradas que OpenAI usa para impedir, omitir o rechazar una respuesta. Una señal confirmada vale tres unidades.

const ValoresBloqueoDuroDeepSeek = [ 'content_filter' ]; // DeepSeek documenta content_filter como una respuesta omitida por sus filtros. Al ser una decisión explícita sobre el contenido, vale tres unidades.

const ValoresBloqueoDuroAnthropic = [ 'refusal' ]; // Anthropic usa refusal en stop_reason y stop_details.type para confirmar que un clasificador de seguridad rechazó la solicitud. Una señal confirmada vale tres unidades.

const EstadosHttpOperativosProveedor = [ 401, 402, 404, 408, 409, 413, 422, 429 ];

const ValoresErrorOperativoProveedor = [ // Errores que describen autenticación, cuenta, capacidad o infraestructura, no una decisión sobre el contenido del usuario.
	'authentication_error', 'invalid_api_key', 'permission_error', 'not_found_error', 'model_not_found',
	'conflict_error', 'request_too_large', 'rate_limit_error', 'insufficient_quota', 'insufficient_balance',
	'billing_hard_limit_reached', 'api_error', 'server_error', 'internal_server_error', 'timeout_error',
	'overloaded_error', 'service_unavailable', 'insufficient_system_resource', 'out_of_capacity',
	'content_filter_unavailable', 'content_filter_error'
];

const FragmentosErrorOperativoProveedor = [ // Se usan sólo después de descartar señales estructuradas de rechazo, para no anular un bloqueo explícito por una frase secundaria del diagnóstico.
	'service unavailable', 'temporarily unavailable', 'account blocked', 'account is blocked', 'account not allowed',
	'rate limit', 'too many requests', 'timed out', 'timeout', 'overloaded', 'insufficient system resource',
	'out of capacity', 'invalid api key', 'authentication failed', 'insufficient balance', 'billing',
	'content filter unavailable', 'content filter error', 'content filter is unavailable',
	'content filter is not available', 'content filter not configured', 'content filter is not configured',
	'safety service unavailable', 'policy service unavailable',
	'api key blocked', 'your api key was reported as leaked'
];

const UnidadesInfracciónRazonesFinalizaciónGemini: Readonly<Record<string, UnidadesInfracciónIA>> = { // Sólo incluye finalizaciones que Gemini atribuye explícitamente al contenido. OTHER, las razones no especificadas y las desconocidas deben conservarse como fallos genéricos del proveedor.
	SAFETY: 3,
	PROHIBITED_CONTENT: 3,
	BLOCKLIST: 0,
	RECITATION: 0,
	LANGUAGE: 0,
	SPII: 0,
	IMAGE_SAFETY: 0,
};

const UnidadesInfracciónRazonesBloqueoPromptGemini: Readonly<Record<string, UnidadesInfracciónIA>> = { // promptFeedback.blockReason confirma que el prompt fue bloqueado. Una razón futura explícita mantiene cero unidades salvo que se decida asignarle otro peso.
	SAFETY: 3,
	PROHIBITED_CONTENT: 3,
	BLOCKLIST: 0,
	OTHER: 0,
	IMAGE_SAFETY: 0,
};


function NormalizarValorProveedor(valor: unknown): string {
	return typeof valor === 'string' ? valor.trim().toLowerCase() : '';
}


function EsValorBloqueoExacto(valor: unknown): boolean {
	return ValoresBloqueoEstructurado.includes(NormalizarValorProveedor(valor));
}


function NormalizarMensajeProveedor(valor: unknown): string {
	return typeof valor === 'string' ? valor.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ') : '';
}


function EsMensajeBloqueo(valor: unknown): boolean {

	if (typeof valor !== 'string') return false;
	const valorNormalizado = NormalizarMensajeProveedor(valor);
	return FragmentosMensajeBloqueo.some(fragmento => valorNormalizado.includes(fragmento));

}


function ObtenerUnidadesInfracciónBloqueoGenérico(proveedor?: string): UnidadesInfracciónIA {
	return proveedor === 'google' ? 0 : 1; // Regla de negocio: las señales específicas de Gemini se clasifican antes y conservan sus unidades propias. Estas señales genéricas (error.code, error.type o message) pueden mencionar safety o policy durante una falla operativa de Google, así que Google conserva el bloqueo para activar el fallback, pero recibe cero unidades para no sancionar por una avería ambigua. En los demás proveedores, una señal genérica de bloqueo conserva una unidad porque es la evidencia estructurada disponible.
}


export function ObtenerUnidadesInfracciónBloqueoEstructurado(valor: unknown, proveedor?: string): UnidadesInfracciónIA {

	const valorNormalizado = NormalizarValorProveedor(valor);
	if ((proveedor === 'open-ai' && ValoresBloqueoDuroOpenAI.includes(valorNormalizado))
		|| (proveedor === 'deepseek' && ValoresBloqueoDuroDeepSeek.includes(valorNormalizado))
		|| (proveedor === 'anthropic' && ValoresBloqueoDuroAnthropic.includes(valorNormalizado)))
		return 3;
	return ObtenerUnidadesInfracciónBloqueoGenérico(proveedor);

}


function EsErrorOperativoProveedor(errorObj: Record<string, unknown> | undefined, httpStatus?: number): boolean {

	const código = NormalizarValorProveedor(errorObj?.code);
	const tipo = NormalizarValorProveedor(errorObj?.type);
	if (ValoresErrorOperativoProveedor.includes(código) || ValoresErrorOperativoProveedor.includes(tipo)) return true;
	if (httpStatus !== undefined && (EstadosHttpOperativosProveedor.includes(httpStatus) || (httpStatus >= 500 && httpStatus <= 599)))
		return true;
	const descripción = [código, tipo, NormalizarMensajeProveedor(errorObj?.message)].join(' ').replaceAll('_', ' ').replaceAll('-',
		' ');
	return FragmentosErrorOperativoProveedor.some(fragmento => descripción.includes(fragmento));

}


export function DetectarBloqueoProveedor(datos: unknown, httpStatus?: number, proveedor?: string): BloqueoProveedor | null { // Inspecciona únicamente errores y campos estructurados del proveedor. Nunca analiza el texto normal generado por el modelo.

	if (!datos || typeof datos !== 'object') return null;
	const d = datos as Record<string, unknown>;

	if (proveedor === 'google') {

		const candidates = d.candidates as { finishReason?: unknown; finishMessage?: unknown; }[] | undefined;
		const cand0 = candidates?.[0];
		const razónFinalizaciónGemini = typeof cand0?.finishReason === 'string' ? cand0.finishReason.toUpperCase() : '';
		if (Object.hasOwn(UnidadesInfracciónRazonesFinalizaciónGemini, razónFinalizaciónGemini))
			return { Razón: 'finishReason', Mensaje: typeof cand0!.finishMessage === 'string' ? cand0!.finishMessage : undefined,
				ValorEstructurado: razónFinalizaciónGemini, EstadoHttp: httpStatus,
				UnidadesInfracción: UnidadesInfracciónRazonesFinalizaciónGemini[razónFinalizaciónGemini] };

		const promptFeedback = d.promptFeedback as { blockReason?: unknown; } | undefined;
		const mensajeBloqueoPromptGemini = typeof promptFeedback?.blockReason === 'string' ? promptFeedback.blockReason : '';
		const razónBloqueoPromptGemini = mensajeBloqueoPromptGemini.trim().toUpperCase();
		if (razónBloqueoPromptGemini && razónBloqueoPromptGemini !== 'BLOCK_REASON_UNSPECIFIED')
			return { Razón: 'blockReason', Mensaje: mensajeBloqueoPromptGemini, EstadoHttp: httpStatus,
				UnidadesInfracción: UnidadesInfracciónRazonesBloqueoPromptGemini[razónBloqueoPromptGemini] ?? 0 };

	}

	const errorObj = d.error as Record<string, unknown> | undefined;
	if (errorObj && typeof errorObj === 'object') {

		for (const campo of ['code', 'type'] as const) {

			const val = errorObj[campo];
			if (EsValorBloqueoExacto(val))
				return { Razón: campo, Mensaje: typeof val === 'string' ? val : undefined, EstadoHttp: httpStatus,
					UnidadesInfracción: ObtenerUnidadesInfracciónBloqueoEstructurado(val, proveedor) };

		}

	}

	const choices = d.choices as { finish_reason?: unknown; message?: { refusal?: unknown; }; }[] | undefined;
	const choice0 = choices?.[0];
	if (NormalizarValorProveedor(choice0?.finish_reason) === 'content_filter')
		return { Razón: 'finish_reason', Mensaje: typeof choice0!.finish_reason === 'string' ? choice0!.finish_reason : undefined,
			EstadoHttp: httpStatus, UnidadesInfracción: ObtenerUnidadesInfracciónBloqueoEstructurado(choice0!.finish_reason,
				proveedor) };

	if (typeof choice0?.message?.refusal === 'string' && choice0.message.refusal.trim() !== '')
		return { Razón: 'refusal', Mensaje: typeof choice0!.message!.refusal === 'string' ? choice0!.message!.refusal : undefined,
			EstadoHttp: httpStatus, UnidadesInfracción: ObtenerUnidadesInfracciónBloqueoEstructurado('refusal', proveedor) };

	const stopDetails = d.stop_details && typeof d.stop_details === 'object' ? d.stop_details as { type?: unknown; } : undefined;
	if (NormalizarValorProveedor(stopDetails?.type) === 'refusal')
		return { Razón: 'stop_details', Mensaje: typeof stopDetails?.type === 'string' ? stopDetails.type : undefined,
			EstadoHttp: httpStatus, UnidadesInfracción: ObtenerUnidadesInfracciónBloqueoEstructurado(stopDetails?.type, proveedor) };

	if (NormalizarValorProveedor(d.stop_reason) === 'refusal')
		return { Razón: 'stop_reason', Mensaje: typeof d.stop_reason === 'string' ? d.stop_reason : undefined,
			EstadoHttp: httpStatus, UnidadesInfracción: ObtenerUnidadesInfracciónBloqueoEstructurado(d.stop_reason, proveedor) };

	const output = d.output as { content?: { type?: unknown; }[]; }[] | undefined;
	if (output) {

		for (const item of output) {

			for (const parte of item.content ?? []) {

				if (parte.type === 'refusal')
					return { Razón: 'refusal', EstadoHttp: httpStatus,
						UnidadesInfracción: ObtenerUnidadesInfracciónBloqueoEstructurado(parte.type, proveedor) };

			}

		}

	}

	if (EsErrorOperativoProveedor(errorObj, httpStatus)) return null;
	if (EsMensajeBloqueo(errorObj?.message))
		return { Razón: 'message', Mensaje: typeof errorObj!.message === 'string' ? errorObj!.message : undefined,
			EstadoHttp: httpStatus, UnidadesInfracción: ObtenerUnidadesInfracciónBloqueoGenérico(proveedor) };

	return null;

}


export function CrearFuenteInfracción(conector: ConectorIA, señal: string, estadoHttp?: number): FuenteInfracciónIA {
	return { Conector: conector.Nombre, Proveedor: conector.Proveedor, Modelo: conector.Modelo, Señal: señal, EstadoHttp: estadoHttp ?? null};
}


function ObtenerSeñalBloqueo(bloqueo: BloqueoProveedor): string {

	if (bloqueo.ValorEstructurado) return `${bloqueo.Razón}:${bloqueo.ValorEstructurado}`;
	const valor = NormalizarValorProveedor(bloqueo.Mensaje);
	return EsValorBloqueoExacto(valor) ? `${bloqueo.Razón}:${valor}` : bloqueo.Razón;

}


export async function VerificarBloqueoProveedor(conector: ConectorIA, datos: unknown, httpStatus?: number): Promise<void> { // Consolida DetectarBloqueoProveedor + throw para no repetir el mismo bloque en cada función de proveedor. La fuente se transporta y se registra sólo después de persistir la infracción.

	const bloqueo = DetectarBloqueoProveedor(datos, httpStatus, conector.Proveedor);
	if (!bloqueo) return;

	throw new ErrorContenidoBloqueado(`${PrefijoMensajeErrorProveedorBloqueo} ${bloqueo.Razón}${bloqueo.Mensaje ? ` (${bloqueo.Mensaje})` : ''}`,
		bloqueo.UnidadesInfracción, CrearFuenteInfracción(conector, ObtenerSeñalBloqueo(bloqueo), bloqueo.EstadoHttp)); // Este error es recuperable por diseño: el orquestador conserva la señal y todavía puede probar un respaldo. La fuente se transporta hasta la ruta para registrar sólo la infracción que finalmente se persiste.

}


function ObtenerTextoErrorProveedor(valor: unknown): string | null {

	if (typeof valor !== 'string') return null;
	const texto = valor.trim();
	return texto ? texto.slice(0, 500) : null;

}


export async function ManejarRespuestaHttpError(contexto: Contexto, conector: ConectorIA, respuesta: Response, detallarCuerpo = false,
	modo: ModoIA = 'Directo'): Promise<never> { // Lee el cuerpo JSON si está disponible, verifica bloqueo de proveedor y lanza el error HTTP correspondiente. Centraliza el bloque !respuesta.ok de todos los proveedores.

	let jsonError: unknown = null;
	try { jsonError = await respuesta.json(); } catch { /* No JSON */ }

	const objetoError = jsonError && typeof jsonError === 'object' ? jsonError as Record<string, unknown> : {};
	const detalleError = objetoError.error && typeof objetoError.error === 'object'
		? objetoError.error as Record<string, unknown> : objetoError;
	RegistrarEventoConPrefijo(contexto, 'IA.', 'ErrorHTTPProveedor', undefined, {
		Conector: conector.Nombre, Proveedor: conector.Proveedor, Modelo: conector.Modelo, Modo: modo,
		EstadoHttp: respuesta.status, CódigoErrorProveedor: ObtenerTextoErrorProveedor(detalleError.code),
		TipoErrorProveedor: ObtenerTextoErrorProveedor(detalleError.type),
		MensajeErrorProveedor: ObtenerTextoErrorProveedor(detalleError.message),
		IdSolicitudProveedor: respuesta.headers.get('x-request-id') ?? respuesta.headers.get('request-id'),
		ReintentarDespués: respuesta.headers.get('retry-after'),
	});

	await VerificarBloqueoProveedor(conector, jsonError, respuesta.status);
	if (detallarCuerpo && jsonError)
		throw new Error(`Proveedor HTTP ${respuesta.status} [${modo}]: ${JSON.stringify(jsonError).slice(0, 1000)}`);
	throw new Error(`Proveedor HTTP ${respuesta.status} [${modo}].`);

}


export async function ValidarRespuestaFlujo(contexto: Contexto, conector: ConectorIA, respuesta: Response): Promise<ReadableStream<Uint8Array>> { // Verifica que la respuesta HTTP sea exitosa y tenga cuerpo de flujo. Lanza con modo 'Flujo' en ambos casos.

	if (!respuesta.ok) await ManejarRespuestaHttpError(contexto, conector, respuesta, false, 'Flujo');
	if (!respuesta.body) throw new Error(`Proveedor HTTP ${respuesta.status} sin cuerpo de flujo.`);
	return respuesta.body;

}

interface EstadoLatido { Id: ReturnType<typeof setInterval>; }

class ErrorEntradaCliente extends Error { constructor(mensaje: string) { super(mensaje); this.name = 'ErrorEntradaCliente'; } } // Error 400: entrada inválida o JSON malformado, culpa del cliente.


class ErrorSolicitudCancelada extends ErrorEntradaCliente { constructor(mensaje: string) { super(mensaje); this.name = 'ErrorSolicitudCancelada'; } }


class ErrorInternoServidor extends Error { constructor(mensaje: string) { super(mensaje); this.name = 'ErrorInternoServidor'; } } // Error 500: fallo interno del servidor, no culpa del cliente.


export function ClasificarErrorConectorIA(error: unknown, solicitudCancelada = false, conectorAgotóTiempo = false): CódigoErrorIA {

	const mensajeError = ObtenerMensajeErrorIA(error);

	if (solicitudCancelada || error instanceof ErrorSolicitudCancelada) return CódigoErrorIA.SolicitudCancelada;
	if (conectorAgotóTiempo) return CódigoErrorIA.TiempoEsperaAgotado;

	if (error instanceof ErrorContenidoBloqueado && error.FuenteInfracción?.Señal === 'finishReason:LANGUAGE')
		return CódigoErrorIA.SolicitudInválida; // Excepción para Gemini.
	if (error instanceof ErrorContenidoBloqueado || mensajeError.startsWith(PrefijoMensajeErrorProveedorBloqueo)
		|| mensajeError === MensajeRespuestaBloqueadaPorFiltro)
			return CódigoErrorIA.ContenidoNoPermitido;

	if (error instanceof ErrorLímiteTókenes || mensajeError === MensajeTókenesMáximosAlcanzado)
		return CódigoErrorIA.LímiteTókenesAlcanzado;

	if (error instanceof ErrorRespuestaDemasiadoLarga || mensajeError.startsWith('La respuesta se truncó por la ventana de contexto.'))
			return CódigoErrorIA.RespuestaDemasiadoLarga;

	if (error instanceof ErrorEntradaCliente) return CódigoErrorIA.SolicitudInválida;
	if (error instanceof ErrorInternoServidor) return CódigoErrorIA.ErrorInterno;
	if (EsErrorConfiguraciónIA(error)) return CódigoErrorIA.ConfiguraciónInválida;
	return CódigoErrorIA.ProveedorNoDisponible;

}


export function ObtenerUnidadesInfracciónError(error: unknown): UnidadesInfracciónIA {

	if (error instanceof ErrorContenidoBloqueado) return error.UnidadesInfracción;
	if (error instanceof Error && typeof (error as { UnidadesInfracción?: unknown; }).UnidadesInfracción === 'number')
		return (error as unknown as { UnidadesInfracción: UnidadesInfracciónIA; }).UnidadesInfracción;
	return 0;

}


function ObtenerFuenteInfracciónError(error: unknown): FuenteInfracciónIA | undefined {
	return error instanceof ErrorContenidoBloqueado ? error.FuenteInfracción : undefined;
}


export interface ResultadoConectorDirecto {
	Texto: string; Uso: UsoTókenes; UsoFacturable?: UsoTókenes; // Proyección contable derivada de Uso. Si se activa contexto largo, sus cantidades se multiplican por la tarifa correspondiente para obtener el costo efectivo mediante el cálculo estándar. No representa lo que el proveedor reportó realmente.
	UsoTókenesTarifaExtendida?: UsoTókenesTarifaExtendida;
	SolicitudesModelo?: number; SolicitudesContextoLargo?: number; BúsquedasWeb?: number;
	ProveedorBúsquedaWeb?: ProveedorBúsquedaWeb; DuraciónBúsquedasWebMilisegundos?: number; Citas: CitaIA[];
	UnidadesInfracción?: UnidadesInfracciónIA; FuenteInfracción?: FuenteInfracciónIA;
}


export const UsoTókenesCero: UsoTókenes = {
	EntradaCaché: 0, EntradaNoCaché: 0, SalidaRazonamiento: 0, FuenteSalidaRazonamiento: 'Proveedor', SalidaNoRazonamiento: 0,
	MinutosCachéManual: 0, EscrituraCaché: 0
};

export const UsoTókenesTarifaExtendidaCero: UsoTókenesTarifaExtendida = {
	EntradaCaché: 0, EntradaNoCaché: 0, EscrituraCaché: 0, SalidaRazonamiento: 0, SalidaNoRazonamiento: 0
};


function SumarUsoTókenes(acumulado: UsoTókenes, siguiente: UsoTókenes): UsoTókenes {

	return {
		EntradaCaché: acumulado.EntradaCaché + siguiente.EntradaCaché,
		EntradaNoCaché: acumulado.EntradaNoCaché + siguiente.EntradaNoCaché,
		SalidaRazonamiento: acumulado.SalidaRazonamiento + siguiente.SalidaRazonamiento,
		FuenteSalidaRazonamiento: acumulado.FuenteSalidaRazonamiento === 'Inferido'
			|| siguiente.FuenteSalidaRazonamiento === 'Inferido' ? 'Inferido' : 'Proveedor',
		SalidaNoRazonamiento: acumulado.SalidaNoRazonamiento + siguiente.SalidaNoRazonamiento,
		MinutosCachéManual: Math.max(acumulado.MinutosCachéManual, siguiente.MinutosCachéManual),
		EscrituraCaché: acumulado.EscrituraCaché + siguiente.EscrituraCaché,
	};

}


function SumarUsoTókenesTarifaExtendida(acumulado: UsoTókenesTarifaExtendida, siguiente: UsoTókenesTarifaExtendida)
	: UsoTókenesTarifaExtendida {

	return {
		EntradaCaché: acumulado.EntradaCaché + siguiente.EntradaCaché,
		EntradaNoCaché: acumulado.EntradaNoCaché + siguiente.EntradaNoCaché,
		EscrituraCaché: acumulado.EscrituraCaché + siguiente.EscrituraCaché,
		SalidaRazonamiento: acumulado.SalidaRazonamiento + siguiente.SalidaRazonamiento,
		SalidaNoRazonamiento: acumulado.SalidaNoRazonamiento + siguiente.SalidaNoRazonamiento,
	};

}


interface ResultadoUsoFacturable {
	UsoFacturable: UsoTókenes; // Conteos ajustados solo para el cálculo monetario. Es la salida rápida que permite aplicar los multiplicadores de la tarifa de contexto largo reutilizando los precios normales, mientras el uso real permanece separado.
	UsoTókenesTarifaExtendida: UsoTókenesTarifaExtendida;
	EsContextoLargo: boolean;
}


export interface EstadoUsoAcumulado {
	Uso: UsoTókenes;
	UsoFacturable: UsoTókenes;
	UsoTókenesTarifaExtendida: UsoTókenesTarifaExtendida;
	SolicitudesContextoLargo: number;
}


export function CrearUsoFacturable(conector: ConectorIA, usoReal: UsoTókenes): ResultadoUsoFacturable { // Construye una proyección contable a partir del uso real. Cuando la solicitud supera el umbral de contexto largo, copia los tókenes reportados y multiplica sus cantidades por los multiplicadores de entrada y salida. Así se obtiene el cobro efectivo reutilizando la fórmula de precios existente, sin alterar los datos reales ni implementar un camino paralelo de tarifas. Es una solución pragmática y deliberadamente limitada: si en el futuro las tarifas requieren reglas distintas por tipo de tóken, ronda o componente, habrá que sustituirla por un cálculo de precios explícito.

	const usoFacturable = { ...usoReal };

	const tarifaContextoLargo = conector.TarifaContextoLargo;
	if (!tarifaContextoLargo)
		return { UsoFacturable: usoFacturable, UsoTókenesTarifaExtendida: UsoTókenesTarifaExtendidaCero, EsContextoLargo: false };

	const máximoTarifaEstándar = conector.MáximoTókenesEntradaTarifaEstándar;
	if (máximoTarifaEstándar === undefined)
		throw new Error(`${PrefijoErrorConfiguraciónIA} el conector ${conector.Nombre} configuró TarifaContextoLargo sin MáximoTókenesEntradaTarifaEstándar.`);

	const totalEntradaReal = usoReal.EntradaCaché + usoReal.EntradaNoCaché + usoReal.EscrituraCaché;
	if (totalEntradaReal <= máximoTarifaEstándar) // El umbral es inclusivo: por ejemplo exactamente 272 000 conserva la tarifa corta.
		return { UsoFacturable: usoFacturable, UsoTókenesTarifaExtendida: UsoTókenesTarifaExtendidaCero, EsContextoLargo: false };

	usoFacturable.EntradaCaché *= tarifaContextoLargo.MultiplicadorEntrada;
	usoFacturable.EntradaNoCaché *= tarifaContextoLargo.MultiplicadorEntrada;
	usoFacturable.EscrituraCaché *= tarifaContextoLargo.MultiplicadorEntrada;
	usoFacturable.SalidaRazonamiento *= tarifaContextoLargo.MultiplicadorSalida;
	usoFacturable.SalidaNoRazonamiento *= tarifaContextoLargo.MultiplicadorSalida;

	return {
		UsoFacturable: usoFacturable,
		UsoTókenesTarifaExtendida: { EntradaCaché: usoReal.EntradaCaché, EntradaNoCaché: usoReal.EntradaNoCaché,
			EscrituraCaché: usoReal.EscrituraCaché, SalidaRazonamiento: usoReal.SalidaRazonamiento,
			SalidaNoRazonamiento: usoReal.SalidaNoRazonamiento },
		EsContextoLargo: true
	};

}


export function AcumularUsoRonda(conector: ConectorIA, estado: EstadoUsoAcumulado, usoRonda: UsoTókenes): EstadoUsoAcumulado { // Centraliza la contabilidad de cada respuesta del modelo. La decisión de contexto largo se toma sobre esta ronda antes de sumar, para que varias rondas cortas no se conviertan artificialmente en una sola solicitud larga. Antes, la tarifa de contexto largo no estaba implementada y esas consultas se cobraban con la estándar. Lo cuida la prueba 'Error arreglado: reproduce el incidente de seis rondas largas y 25 búsquedas sin exponer tókenes equivalentes' de pruebas/ligeras/ia.test.ts, que reproduce ese caso real.

	const usoFacturableRonda = CrearUsoFacturable(conector, usoRonda);
	return {
		Uso: SumarUsoTókenes(estado.Uso, usoRonda),
		UsoFacturable: SumarUsoTókenes(estado.UsoFacturable, usoFacturableRonda.UsoFacturable),
		UsoTókenesTarifaExtendida: SumarUsoTókenesTarifaExtendida(estado.UsoTókenesTarifaExtendida,
			usoFacturableRonda.UsoTókenesTarifaExtendida),
		SolicitudesContextoLargo: estado.SolicitudesContextoLargo + (usoFacturableRonda.EsContextoLargo ? 1 : 0),
	};

}


interface CostosConsultaIA {
	CostoModeloDólares: number;
	CostoBúsquedasWebDólares: number;
	CostoTotalDólares: number;
}


function CalcularCostoModeloDólares(conector: ConectorIA, usoFacturable: UsoTókenes): number {

	const precios = conector.Precios;
	const esOpenAIResponses = ProveedoresIA[conector.Proveedor]?.Formato === 'OpenAI Responses';
	if (usoFacturable.MinutosCachéManual > 0 || (usoFacturable.EscrituraCaché > 0 && !esOpenAIResponses))
		throw new Error(`Se detectó uso de caché manual de Gemini o Anthropic, pero ese cálculo todavía no está implementado. MinutosCachéManual: ${usoFacturable.MinutosCachéManual}, EscrituraCaché: ${usoFacturable.EscrituraCaché}.`); // OpenAI Responses usa EscrituraCaché para la escritura automática reportada por la API. Los mecanismos manuales de otros proveedores siguen protegidos hasta implementar sus tarifas específicas.

	return (
		(usoFacturable.EntradaCaché * precios.EntradaCaché) / 1_000_000 +
		(usoFacturable.EntradaNoCaché * precios.EntradaNoCaché) / 1_000_000 +
		(usoFacturable.EscrituraCaché * precios.EscrituraCachéLargaDuración) / 1_000_000 + // Aplicable por el momento a la escritura de caché de OpenAI.
		(usoFacturable.SalidaRazonamiento * precios.SalidaRazonamiento) / 1_000_000 +
		(usoFacturable.SalidaNoRazonamiento * precios.SalidaNoRazonamiento) / 1_000_000
	);

}


function CalcularCostosConsultaDólares(conector: ConectorIA, usoFacturable: UsoTókenes, búsquedasWeb: number,
	proveedorBúsquedaWeb: ProveedorBúsquedaWeb | undefined): CostosConsultaIA { // Separa modelo y búsqueda para que el evento audite cada componente y sume Parallel exactamente una vez.

	const costoModeloDólares = CalcularCostoModeloDólares(conector, usoFacturable);
	const costoBúsquedasWebDólares = CalcularCostoBúsquedaWebDólares(proveedorBúsquedaWeb, búsquedasWeb);
	return { CostoModeloDólares: costoModeloDólares, CostoBúsquedasWebDólares: costoBúsquedasWebDólares,
		CostoTotalDólares: costoModeloDólares + costoBúsquedasWebDólares };

}


export interface ParámetrosNormalizados {
    Idioma: Idioma;
	Temperatura: number | undefined;
	Razonamiento: string | undefined; // Valor literal ya resuelto desde el mapa de razonamiento declarado por el conector. Undefined si el conector no soporta razonamiento.
	Verbosidad: string | undefined; // Valor literal ya resuelto desde mapeoVerbosidad. Undefined si el conector no soporta verbosidad nativa (en ese caso se cae al respaldo por texto).
	MáximosTokenes: number; // Obligatorio. Se valida al inicio de NormalizarParámetros. Se establece como obligatorio para forzar al cliente a controlar sus gastos.
	MensajeSistemaFinal: string | undefined; // Mensaje de sistema listo para enviar. Si el conector no declara verbosidad nativa y el frontend pidió un nivel, aquí ya viene anteponida la instrucción de verbosidad en el idioma del usuario. En caso contrario coincide con entrada.MensajeSistema sin modificar.
}

export type EntradaIACruda = v.InferOutput<typeof EntradaIASchema>;

export type EntradaIA = Omit<EntradaIACruda, 'ModeloOConector' | 'RespaldoModeloOConector'> & {
	Conector: string;
	RespaldoConector: string | null;
}; // connector siempre está resuelto tras la validación. RespaldoConector es la resolución de respaldoModeloOConector, o null si no se proporcionó.


const EntradaIASchema = v.object({
	Modo: v.picklist(ModosIA), // Modo de ejecución: directo (JSON bloqueante) o flujo (NDJSON).
	IdSolicitud: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(50))), // Identificador técnico opcional para trazabilidad e idempotencia de la solicitud. Se limita para evitar textos demasiado largos en claves de seguimiento.
	ModeloOConector: v.pipe(v.string(), v.trim(), v.minLength(1),
		v.check((nombre: string) => nombre in ModelosIAEspecíficos || nombre in ConectoresIA, 'ModeloOConector no existe')), // Nombre específico del modelo (clave de ModelosEspecíficos) o conector directo (clave de ConectoresIA).
	MensajeUsuario: v.pipe(v.string(), v.trim(), v.minLength(1)), // Mensaje del usuario: obligatorio y no vacío.
	MensajeSistema: v.optional(v.pipe(v.string(), v.trim())), // Mensaje de sistema: opcional, si se envía se limpia con trim.
	Temperatura: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(2))), // Escala general 0..2. El rango real se valida contra RangoTemperaturaSoportado después de resolver el conector. Temperatura: 1 se interpreta como valor predeterminado y no se transmite al proveedor.
	BúsquedaWeb: v.optional(v.boolean()), // Activa la búsqueda web cuando el conector seleccionado ofrece esta capacidad.
	ProveedorBúsquedaWeb: v.optional(v.picklist(['OpenAI', 'Parallel'])), // Selecciona la búsqueda nativa de OpenAI o la herramienta externa Parallel.
	ForzarBúsquedaWeb: v.optional(v.boolean()), // Es obligatorio cuando BúsquedaWeb está activa: false permite decidir al modelo y true exige buscar.
	ExtensiónBúsquedaWeb: v.optional(v.picklist(['Baja', 'Media', 'Alta'])), // Cantidad relativa de contexto recuperado para fundamentar la respuesta.
	PaísBúsquedaWeb: v.optional(v.pipe(v.string(), v.trim(),
		v.regex(/^[A-Za-z]{2}$/, 'PaísBúsquedaWeb debe tener un código ISO de dos letras'),
		v.transform((país: string) => país.toUpperCase()))), // Ubicación aproximada limitada al país para mejorar la relevancia local de la búsqueda.
	Razonamiento: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)), // Nivel del 1 al 5 (frontend). 1 = mínimo, 5 = máximo. Se exige siempre para que el contrato del núcleo no dependa de predeterminados escondidos en capas internas.
	Verbosidad: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)), // Nivel del 1 al 5 (frontend). 1 = mínimo, 5 = máximo. Se exige siempre para que el contrato del núcleo no dependa de predeterminados escondidos en capas internas.
	TókenesMáximos: v.pipe(v.number(), v.finite(), v.integer(), v.minValue(1)), // Se acepta una solicitud mayor que el máximo del proveedor para que el núcleo pueda acotarla antes de serializarla.
	SegundosMáximos: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(SegundosMáximosIA)), // Segundos máximos de espera por conector antes de abortar y pasar al respaldo. Obligatorio para que el cliente controle explícitamente la latencia aceptable. Diez minutos cubren investigaciones web extensas sin ampliar el tiempo de las acciones que continúan enviando límites menores.
	RespaldoModeloOConector: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1),
		v.check((nombre: string) => nombre in ModelosIAEspecíficos || nombre in ConectoresIA, 'RespaldoModeloOConector no existe'))), // Nombre específico del modelo IA o conector IA directo que se usa como respaldo.
	RespaldoRazonamiento: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5))), // Nivel de razonamiento (1-5) que se aplica al conector de respaldo. Se propaga igual que Razonamiento.
	Idioma: v.picklist(IdiomasSoportados)
});


function ValidarCompatibilidadTemperaturaRazonamiento(nombreConector: string, razonamiento: number | undefined,
	temperatura: number | undefined): void {

	const conector = ConectoresIA[nombreConector];
	const proveedor = conector ? ProveedoresIA[conector.Proveedor] : undefined;
	const esOpenAIResponses = proveedor?.Formato === 'OpenAI Responses';

	if (conector && temperatura !== undefined && temperatura !== 1) {

		const rango = conector.RangoTemperaturaSoportado;
		if (rango === null)
			throw new ErrorEntradaCliente(`La validación de entrada falló: Temperatura: El conector '${conector.Modelo}' no admite el parámetro temperature. Usa Temperatura: 1 o elimina el parámetro.`);
		const [mínimo, máximo] = rango;
		if (temperatura < mínimo || temperatura > máximo)
			throw new ErrorEntradaCliente(`La validación de entrada falló: Temperatura: El conector '${conector.Modelo}' admite valores entre ${mínimo} y ${máximo}.`);

	}

	const tieneRazonamiento = razonamiento !== undefined && razonamiento > 1; // Nivel 1 (mínimo) permite temperatura > 1. Niveles 2-5 no.
	if (esOpenAIResponses && tieneRazonamiento && temperatura !== undefined && temperatura > 1)
		throw new ErrorEntradaCliente('La validación de entrada falló: temperatura: No se permite una temperatura superior a 1.0 en OpenAI Responses cuando el nivel de razonamiento es 2 o superior. Configura el razonamiento en 1 (mínimo) si necesitas una temperatura superior a 1.0, o baja la temperatura a 1.0 o menos.');

}


function ValidarCompatibilidadBúsquedaWeb(nombreConector: string, campoConector: string, búsquedaWeb: boolean | undefined,
	proveedorBúsquedaWeb: ProveedorBúsquedaWeb | undefined): void {

	if (!búsquedaWeb) return;
	const conector = ConectoresIA[nombreConector];
	const proveedor = conector ? ProveedoresIA[conector.Proveedor] : undefined;
	if (proveedorBúsquedaWeb === 'OpenAI') {

		if (conector?.Proveedor !== 'open-ai' || proveedor?.Formato !== 'OpenAI Responses')
			throw new ErrorEntradaCliente(`La validación de entrada falló: ${campoConector}: OpenAI Search solo está disponible con conectores OpenAI Responses.`);
		return;

	}

	if (proveedorBúsquedaWeb === 'Parallel' && (conector?.NoSoportaHerramientas === true || (proveedor?.Formato !== 'OpenAI Responses' &&
		proveedor?.Formato !== 'OpenAI Chat')))
			throw new ErrorEntradaCliente(`La validación de entrada falló: ${campoConector}: El conector no es compatible con la búsqueda web de Parallel. Esta integración requiere herramientas habilitadas y el formato OpenAI Chat o OpenAI Responses. Usa otro conector compatible o desactiva BúsquedaWeb.`);

}


function ValidarCompatibilidadTarifaContextoLargo(nombreConector: string): void {

	const conector = ConectoresIA[nombreConector];
	if (!conector) return;
	const tieneUmbral = conector.MáximoTókenesEntradaTarifaEstándar !== undefined;
	const tieneTarifa = conector.TarifaContextoLargo !== undefined;
	if (tieneUmbral === tieneTarifa) return;
	throw new Error(`${PrefijoErrorConfiguraciónIA} el conector '${conector.Nombre}' debe declarar juntos 'MáximoTókenesEntradaTarifaEstándar' y 'TarifaContextoLargo', o dejar ambos ausentes.`);

}


export function ValidarEntradaIA(cuerpoCrudo: unknown, exigirIdSolicitud = false): EntradaIA {

	const resultadoValidación = v.safeParse(EntradaIASchema, cuerpoCrudo); // Validar y normalizar todos los campos con Valibot: trim, Acotamiento, type guards.

	if (!resultadoValidación.success) { // La validación falló: construir un mensaje de error descriptivo con todos los problemas.

		const mensajesError	= resultadoValidación.issues.map((issue: v.BaseIssue<unknown>) =>
				`${issue.path?.map((p: { key: unknown; }) => p.key).join('.') || 'root'}: ${issue.message}`).join('; ');
		throw new ErrorEntradaCliente(`La validación de entrada falló: ${mensajesError}`);

	}

	const salida = resultadoValidación.output;
	if (exigirIdSolicitud && !salida.IdSolicitud)
		throw new ErrorEntradaCliente('La validación de entrada falló: IdSolicitud es obligatoria.');
	if (salida.BúsquedaWeb) {

		if (!salida.ProveedorBúsquedaWeb)
			throw new ErrorEntradaCliente('La validación de entrada falló: ProveedorBúsquedaWeb es obligatorio cuando BúsquedaWeb es true.');
		if (salida.ForzarBúsquedaWeb === undefined)
			throw new ErrorEntradaCliente('La validación de entrada falló: ForzarBúsquedaWeb es obligatorio cuando BúsquedaWeb es true.');
		if (salida.ProveedorBúsquedaWeb === 'Parallel' && salida.Modo !== 'Directo')
			throw new ErrorEntradaCliente('La validación de entrada falló: Parallel solo está disponible en Modo Directo.');

	} else if (salida.ProveedorBúsquedaWeb !== undefined || salida.ForzarBúsquedaWeb !== undefined ||
		salida.ExtensiónBúsquedaWeb !== undefined || salida.PaísBúsquedaWeb !== undefined) {
			throw new ErrorEntradaCliente('La validación de entrada falló: Los parámetros de búsqueda web solo se permiten cuando BúsquedaWeb es true.');
	}

	const conectorEfectivo = ObtenerConectorDesdeModeloOConector(salida.ModeloOConector);
	const conectorRespaldoEfectivo =
		salida.RespaldoModeloOConector !== undefined ? ObtenerConectorDesdeModeloOConector(salida.RespaldoModeloOConector) : null;

	if (conectorRespaldoEfectivo !== null && conectorRespaldoEfectivo === conectorEfectivo)
		throw new ErrorEntradaCliente('La validación de entrada falló: respaldoModeloOConector: El respaldo se resuelve al mismo conector que el principal. Usa un modelo o conector distinto como respaldo.');

	const nombresConectoresEjecución = ResolverCadenaConectores(conectorEfectivo, false, conectorRespaldoEfectivo ?? undefined);
	for (const nombreConector of nombresConectoresEjecución) {
		ValidarCompatibilidadTarifaContextoLargo(nombreConector);
		ValidarFormatoRespuestaCloudflare(nombreConector);
	}

	if (salida.BúsquedaWeb) {

		const nombresConectoresBúsquedaWeb = nombresConectoresEjecución; // Se valida la misma cadena de respaldos que se ejecutará, incluidos Respaldo y RespaldoFinal configurados.
		for (const nombreConector of nombresConectoresBúsquedaWeb) {

			const campoConector = nombreConector === conectorEfectivo ? 'ModeloOConector'
				: nombreConector === conectorRespaldoEfectivo ? 'RespaldoModeloOConector' : 'Respaldo configurado';
			ValidarCompatibilidadBúsquedaWeb(nombreConector, campoConector, true, salida.ProveedorBúsquedaWeb);

		}

	}

	ValidarCompatibilidadTemperaturaRazonamiento(conectorEfectivo, salida.Razonamiento, salida.Temperatura);
	if (conectorRespaldoEfectivo !== null)
		ValidarCompatibilidadTemperaturaRazonamiento(conectorRespaldoEfectivo, salida.RespaldoRazonamiento ?? salida.Razonamiento,
			salida.Temperatura);

	const { ModeloOConector: _mc, RespaldoModeloOConector: _mf, ...resto } = salida;
	return { ...resto, Conector: conectorEfectivo, RespaldoConector: conectorRespaldoEfectivo }; // Retornar la entrada validada con el conector ya resuelto y el conector de respaldo derivado de respaldoModeloOConector.

}


async function LeerJsonSolicitud(solicitud: Request): Promise<unknown> {

	if (solicitud.bodyUsed) throw new ErrorInternoServidor('El cuerpo ya fue consumido antes de leer el JSON.');

	try {
		return await solicitud.json();
	} catch (error) {

		if (error instanceof SyntaxError) throw new ErrorEntradaCliente('JSON inválido.');
		if (error instanceof DOMException && error.name === 'AbortError')
			throw new ErrorSolicitudCancelada('La solicitud fue abortada mientras se leía el JSON.');
		throw new ErrorEntradaCliente(`No se pudo leer el JSON: ${ObtenerMensajeError(error)}`);

	}

}


async function LeerYValidarEntrada(solicitud: Request, exigirIdRequest = false, devolverResultadoDirecto = false)
	: Promise<EntradaIA | Response | ResultadoIADirecto> { // Centraliza el parse + validación: retorna EntradaIA si todo va bien, o una Response de error lista para devolver al cliente.

	try {
		const cuerpoCrudo = await LeerJsonSolicitud(solicitud);
		return ValidarEntradaIA(cuerpoCrudo, exigirIdRequest);
	} catch (error) {

		const mensajeError = ObtenerMensajeErrorIA(error);
		const esErrorConfiguración = mensajeError === MensajeErrorConfiguraciónIACliente;
		if (esErrorConfiguración) console.error('Error de configuración de IA al validar la solicitud', error);
		const estado = error instanceof ErrorEntradaCliente ? 400
			: error instanceof ErrorInternoServidor ? 500
			: esErrorConfiguración ? 500
			: 502;
		const código = error instanceof ErrorSolicitudCancelada ? CódigoErrorIA.SolicitudCancelada
			: error instanceof ErrorEntradaCliente ? CódigoErrorIA.SolicitudInválida
			: error instanceof ErrorInternoServidor ? CódigoErrorIA.ErrorInterno
			: esErrorConfiguración ? CódigoErrorIA.ConfiguraciónInválida : CódigoErrorIA.ErrorInterno;
		return ResponderErrorIA(mensajeError, código, estado, devolverResultadoDirecto);

	}

}


export interface ResultadoModeraciónContenido {
	Estado: 'Seguro' | 'Inseguro' | 'Error' | 'Cancelada';
	UnidadesInfracción: UnidadesInfracciónIA;
	FuenteInfracción?: FuenteInfracciónIA;
}


export async function ValidarConModeraciónContenido(contexto: Contexto, señalUsuario: AbortSignal, mensajeSistemaYUsuario: string,
	idioma: Idioma): Promise<ResultadoModeraciónContenido> { // Valida el mensaje usando EjecutarModoDirecto, que ya incorpora la cadena de respaldos declarada en configuracion.ts y el tiempo máximo del conector.

	const entrada: EntradaIA = {
		Modo: 'Directo',
		Conector: ObtenerConectorDesdeModeloOConector(ModeloModeraciónContenido), MensajeUsuario: mensajeSistemaYUsuario,
		MensajeSistema: undefined, Temperatura: 0, Razonamiento: 1, Verbosidad: 1, // Temperature: 0 fuerza decodificación determinista: Es decir, lo convierte en un clasificador binario, no en un modelo creativo.
		TókenesMáximos: 100, SegundosMáximos: Math.ceil(MilisegundosMáximosModeraciónContenido / 1000), Idioma: idioma,
		RespaldoRazonamiento: 1, RespaldoConector: null,
	};

	try {

		const resultado = await EjecutarModoDirecto(contexto, entrada, señalUsuario);
		if (señalUsuario.aborted || resultado.Errores.some(error => error.Código === CódigoErrorIA.SolicitudCancelada))
			return { Estado: 'Cancelada', UnidadesInfracción: resultado.UnidadesInfracción, FuenteInfracción: resultado.FuenteInfracción };
		if (resultado.Tipo === 'Error') {

			const erroresConectores = resultado.Errores.filter(error => error.Fuente !== 'Solicitud');
			const cantidadConectoresModeración = ResolverCadenaConectores(entrada.Conector).length;
			if (erroresConectores.length === cantidadConectoresModeración)
				EnviarAlertaErrorCrítico(contexto, 'IAModeraciónConectoresFallidos',
					'Fallaron todos los conectores de moderación de contenido.',
					JSON.stringify({ Conectores: erroresConectores.map(error => error.Fuente),
						Errores: erroresConectores }).slice(0, 2_000));
			return { Estado: 'Error', UnidadesInfracción: resultado.UnidadesInfracción, FuenteInfracción: resultado.FuenteInfracción };

		}

		const primerError = resultado.Errores?.[0];
		if (primerError?.Error === MensajeTimeoutConector) // El primer conector de moderación superó 1s y se usó el respaldo. Se registra para monitorear latencia y frecuencia.
			console.warn('El conector principal de moderación agotó el tiempo de espera y se usó un respaldo',
				{ ConectorPrimario: entrada.Conector, DuraciónMilisegundos: primerError.DuraciónMilisegundos });
		const primeraLínea = resultado.Texto.trim().split('\n')[0].trim().toLowerCase(); // Solo la primera línea importa: los moderadores emiten 'Seguro' o 'unsafe' como primera línea, seguido opcionalmente de categorías de riesgo.

		if (primeraLínea === 'unsafe') {

			const conectorModeración = ConectoresIA[resultado.ConectorEfectivo ?? entrada.Conector];
			const unidadesInfracción = Math.max(1, resultado.UnidadesInfracción) as UnidadesInfracciónIA;
			
			const fuenteInfracción = resultado.UnidadesInfracción > 1 ? resultado.FuenteInfracción :
				(conectorModeración ? CrearFuenteInfracción(conectorModeración, 'moderation.unsafe') : resultado.FuenteInfracción); // Una señal fuerte (más de una unidad) ya tiene una fuente específica y debe conservarse sin reemplazarla. Una señal genérica unsafe vale una unidad: se atribuye al conector que la produjo cuando podemos identificarlo. Si no se identifica el conector, se conserva la fuente que ya tenía el resultado como último respaldo.
			return { Estado: 'Inseguro', UnidadesInfracción: unidadesInfracción, FuenteInfracción: fuenteInfracción };

		}

		if (primeraLínea === 'safe')
			return { Estado: 'Seguro', UnidadesInfracción: resultado.UnidadesInfracción, FuenteInfracción: resultado.FuenteInfracción };

		return { Estado: 'Error', UnidadesInfracción: resultado.UnidadesInfracción, FuenteInfracción: resultado.FuenteInfracción }; // Formato inesperado: se falla cerrado para no dejar pasar contenido sin validar.

	} catch {
		return { Estado: 'Error', UnidadesInfracción: 0 };
	}

}


export function ObtenerConectorDesdeModeloOConector(entrada: string): string { // Resuelve primero el nombre técnico simplificado del modelo y después el conector directo con modelo y proveedor.

	const modeloEspecífico = ModelosIAEspecíficos[entrada];
	if (modeloEspecífico) {

		if (!(modeloEspecífico.conector in ConectoresIA))
			throw new Error(`${PrefijoErrorConfiguraciónIA} ModelosEspecíficos['${entrada}'].conector = '${modeloEspecífico.conector}' no existe en ConectoresIA.`);
		return modeloEspecífico.conector;

	}
	if (entrada in ConectoresIA) return entrada;
	throw new Error(`'${entrada}' no coincide con ninguna entrada en ModelosEspecíficos o ConectoresIA.`);

}


async function ConsultaIAProtegidaInterna(contexto: Contexto, señalUsuario: AbortSignal, detallarErroresProveedor = false,
	exigirIdRequest = false, devolverResultadoDirecto = false): Promise<Response | ResultadoIADirecto> { // Función de seguridad sobre ConsultarIA. Valida longitud del prompt y aplica moderación de contenido antes de llamar al modelo final. Los campos ModeloOConector y RespaldoModeloOConector admiten un nombre técnico simplificado del modelo o un conector directo con modelo y proveedor.

	const resultadoLectura = await LeerYValidarEntrada(contexto.Solicitud, exigirIdRequest, devolverResultadoDirecto);
	if (EsResultadoLecturaIAError(resultadoLectura)) return resultadoLectura;
	const entrada = resultadoLectura;

	if (entrada.Modo === 'Flujo') {
		const ignorarRespaldos = new URL(contexto.Solicitud.url).searchParams.get('ignorarRespaldos') === 'true';
		ValidarCompatibilidadFlujoModeraciónIntegradaOpenAI(entrada, ignorarRespaldos);
	}
 
	const idioma = entrada.Idioma;
	const { texto: textoVacío } = await ObtenerTextoEnIdioma(contexto, 'ia-consulta-vacía', idioma);
	const { texto: textoLargo } = await ObtenerTextoEnIdioma(contexto, 'ia-consulta-demasiado-larga', idioma);
	const { texto: textoNoPermitido } = await ObtenerTextoEnIdioma(contexto, 'ia-consulta-no-permitida', idioma);
	const { texto: textoNoValidado } = await ObtenerTextoEnIdioma(contexto, 'ia-consulta-no-validada', idioma);

	if (!entrada.MensajeUsuario) return ResponderErrorIA(textoVacío, CódigoErrorIA.SolicitudInválida, 400, devolverResultadoDirecto);

	const totalCarácteres = entrada.MensajeUsuario.length + (entrada.MensajeSistema?.length ?? 0);
	if (totalCarácteres > MáximosCarácteresMensajeUsuario)
		return ResponderErrorIA(textoLargo, CódigoErrorIA.SolicitudInválida, 400, devolverResultadoDirecto);

	const textoAModerar = entrada.MensajeSistema ? `${entrada.MensajeSistema}\n\n${entrada.MensajeUsuario}` : entrada.MensajeUsuario;
	const resultadoModeración = await ValidarConModeraciónContenido(contexto, señalUsuario, textoAModerar, entrada.Idioma);

	if (resultadoModeración.Estado === 'Inseguro') {

		const idUsuario = await ObtenerIdentificadorUsuarioParaTerceros(contexto.Autenticación); // ID opaco no reversible: seguro para registros.
		console.warn('La moderación bloqueó contenido inseguro', { Conector: entrada.Conector, IdUsuario: idUsuario ?? 'anónimo' });
		return ResponderErrorIA(textoNoPermitido, CódigoErrorIA.ContenidoNoPermitido, 403, devolverResultadoDirecto,
			Math.max(1, resultadoModeración.UnidadesInfracción) as UnidadesInfracciónIA, resultadoModeración.FuenteInfracción);

	}

	if (resultadoModeración.Estado === 'Error') {

		console.error('La moderación de contenido no está disponible: todos los validadores fallaron', { Conector: entrada.Conector });
		return ResponderErrorIA(textoNoValidado, CódigoErrorIA.ModeraciónNoDisponible, 503, devolverResultadoDirecto,
			resultadoModeración.UnidadesInfracción, resultadoModeración.FuenteInfracción);

	}

	if (resultadoModeración.Estado === 'Cancelada')
		return ResponderErrorIA('La solicitud fue cancelada por el usuario.', CódigoErrorIA.SolicitudCancelada, 400,
			devolverResultadoDirecto, resultadoModeración.UnidadesInfracción, resultadoModeración.FuenteInfracción);

	const resultadoConsulta = await ConsultarIAInterna(contexto, señalUsuario, detallarErroresProveedor, exigirIdRequest,
		devolverResultadoDirecto, entrada);

	if (resultadoConsulta instanceof Response) return resultadoConsulta; // La ruta normal devuelve una Response y debe conservarla intacta. Solo el modo directo devuelve un ResultadoIADirecto cuyos metadatos de moderación se pueden combinar en las siguientes líneas.

	return { ...resultadoConsulta, ...CombinarInfraccionesIA(resultadoModeración, resultadoConsulta) };

}


export async function ConsultarIA(contexto: Contexto, señalUsuario: AbortSignal, detallarErroresProveedor = false,
	exigirIdRequest = false): Promise<Response> {

	const resultado = await ConsultarIAInterna(contexto, señalUsuario, detallarErroresProveedor, exigirIdRequest, false);
	if (!(resultado instanceof Response)) throw new Error('ConsultarIA recibió un ResultadoIADirecto cuando esperaba una Response.');
	return resultado as Response;

}


export async function ConsultarIADirecto(contexto: Contexto, señalUsuario: AbortSignal, detallarErroresProveedor = false,
	exigirIdRequest = false): Promise<ResultadoIADirecto> {

	const resultado = await ConsultarIAInterna(contexto, señalUsuario, detallarErroresProveedor, exigirIdRequest, true);
	if (resultado instanceof Response)
		throw new Error('ConsultarIADirecto recibió una Response cuando esperaba un ResultadoIADirecto.');
	return resultado as ResultadoIADirecto;

}


async function ConsultarIAInterna(contexto: Contexto, señalUsuario: AbortSignal, detallarErroresProveedor = false,
	exigirIdRequest = false, devolverResultadoDirecto = false, entradaPrevalidada?: EntradaIA): Promise<Response | ResultadoIADirecto> {

	const ignorarRespaldos = new URL(contexto.Solicitud.url).searchParams.get('ignorarRespaldos') === 'true'; // Si es 'true', se omite el conectorRespaldo. Útil para pruebas aisladas por conector.

	let entrada: EntradaIA;
	if (entradaPrevalidada) {
		entrada = entradaPrevalidada;
	} else {

		const resultadoLectura = await LeerYValidarEntrada(contexto.Solicitud, exigirIdRequest, devolverResultadoDirecto);
		if (EsResultadoLecturaIAError(resultadoLectura)) return resultadoLectura;
		entrada = resultadoLectura;

	}

	if (entrada.Modo === 'Directo') {

		const resultado = await EjecutarModoDirecto(contexto, entrada, señalUsuario, ignorarRespaldos, detallarErroresProveedor,
			entrada.RespaldoConector ?? undefined, entrada.RespaldoRazonamiento);
		if (devolverResultadoDirecto) return resultado;
		return ResponderResultadoIADirecto(resultado);

	} else { // Modo flujo: NDJSON con eventos progresivos. Permite interfaz reactiva con retroalimentación instantánea al usuario.

		ValidarCompatibilidadFlujoModeraciónIntegradaOpenAI(entrada, ignorarRespaldos);
		const flujo = EjecutarModoFlujo(contexto, entrada, señalUsuario, ignorarRespaldos, entrada.RespaldoConector ?? undefined,
			entrada.RespaldoRazonamiento);
		return new Response(flujo, {
			status: 200,
			headers: {
				'content-type': 'application/x-ndjson; charset=utf-8',
				'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no'
			}
		});

	}

}


export async function ConsultaIAProtegida(contexto: Contexto, señalUsuario: AbortSignal, detallarErroresProveedor = false,
	exigirIdRequest = false): Promise<Response> {

	const resultado = await ConsultaIAProtegidaInterna(contexto, señalUsuario, detallarErroresProveedor, exigirIdRequest, false);
	if (!(resultado instanceof Response))
		throw new Error('ConsultaIAProtegida recibió un ResultadoIADirecto cuando esperaba una Response.');
	return resultado as Response;

}


export async function ConsultaIAProtegidaDirecto(contexto: Contexto, señalUsuario: AbortSignal, detallarErroresProveedor = false,
	exigirIdRequest = false): Promise<ResultadoIADirecto> {

	const resultado = await ConsultaIAProtegidaInterna(contexto, señalUsuario, detallarErroresProveedor, exigirIdRequest, true);
	if (resultado instanceof Response)
		throw new Error('ConsultaIAProtegidaDirecto recibió una Response cuando esperaba un ResultadoIADirecto.');
	return resultado as ResultadoIADirecto;

}


export function ResponderResultadoIADirecto(resultado: ResultadoIADirecto, estado: number | null = null): Response {

	const { UnidadesInfracción: _unidadesInfracción, FuenteInfracción: _fuenteInfracción,
		ProveedorBúsquedaWeb: _proveedorBúsquedaWeb,
		UsoTókenesTarifaExtendida: _usoTókenesTarifaExtendida, ...resultadoPúblico } = resultado; // Se extraen los metadatos internos con nombres prefijados con `_` para descartarlos, mientras `...resultadoPúblico` reúne todas las demás propiedades sin modificar `resultado`.
	return new Response(JSON.stringify(resultadoPúblico), {
		status: estado ?? (resultado.Tipo === 'Error' ? 502 : 200),
		headers: { 'content-type': 'application/json; charset=utf-8' }
	});

}


export function ResponderErrorIADirecto(mensaje: string, estado: number, código: CódigoErrorIA = CódigoErrorIA.SolicitudInválida): Response {
	return ResponderResultadoIADirecto(ErrorIADirecto([{ Código: código, Fuente: 'Solicitud', Error: mensaje }], 0), estado);
}


function ResponderErrorIA(mensaje: string, código: CódigoErrorIA, estado: number, devolverResultadoDirecto: boolean,
	unidadesInfracción: UnidadesInfracciónIA = 0, fuenteInfracción?: FuenteInfracciónIA): Response | ResultadoIADirecto {

	return devolverResultadoDirecto ? 
		ErrorIADirecto([{ Código: código, Fuente: 'Solicitud', Error: mensaje }], 0, unidadesInfracción, fuenteInfracción) :
		ResponderErrorIADirecto(mensaje, estado, código);

}


function EsResultadoLecturaIAError(resultadoLectura: EntradaIA | Response | ResultadoIADirecto): resultadoLectura is Response | ResultadoIADirecto {
	return resultadoLectura instanceof Response || 'Tipo' in resultadoLectura;
}


function ObtenerMensajeErrorIA(error: unknown): string {

	if (error instanceof ErrorParallel) { // Sanitizar los errores de búsqueda web evita exponer el proveedor y detalles internos al usuario, pero conserva el código HTTP cuando aporta un diagnóstico seguro.

		const estadoHttp = /HTTP\s+(\d{3})/.exec(error.message)?.[1];
		return estadoHttp === undefined ? 'El proveedor de búsqueda web falló.' // Oculta el proveedor interno en mensajes públicos y conserva el detalle original para registros internos.
			: `El proveedor de búsqueda web falló: HTTP ${estadoHttp}.`; // Expone solo el estado HTTP, sin revelar el nombre del proveedor.

	}
	const mensaje = ObtenerMensajeError(error);
	return mensaje.startsWith(PrefijoErrorConfiguraciónIA) ? MensajeErrorConfiguraciónIACliente : mensaje;

}


function EsErrorConfiguraciónIA(error: unknown): boolean {
	return ObtenerMensajeError(error).startsWith(PrefijoErrorConfiguraciónIA);
}


function EstimarTókenesAproximados(texto: string, idioma: Idioma | undefined): number {

	const bytes = new TextEncoder().encode(texto.trim()).length;
	let divisor: number;
	switch (idioma) {

		case 'es': divisor = 3.5; break;
		case 'en': divisor = 4; break;
		case undefined: // Sin idioma no hay divisor confiable, así que cae en el error de configuración del default.
		default: throw new Error(`${PrefijoErrorConfiguraciónIA} idioma no compatible '${idioma ?? 'undefined'}' en EstimarTókenesAproximados.`);

	}
	return Math.ceil(bytes / divisor);

}


function DebeInferirTókenesRazonamiento(valorRazonamiento: string | undefined, textoVisibleFinal: string | undefined,
	outputTokensTotales: number | undefined): boolean {
	return valorRazonamiento !== undefined && valorRazonamiento !== 'none'
		&& outputTokensTotales !== undefined && textoVisibleFinal !== undefined;
}


export function InferirUsoSalidaConRazonamiento(valorRazonamiento: string | undefined, idioma: Idioma | undefined,
	textoVisibleFinal: string | undefined, outputTokensTotales: number | undefined, razonamientoOutputProveedor: number | undefined)
	: Pick<UsoTókenes, 'SalidaRazonamiento' | 'FuenteSalidaRazonamiento' | 'SalidaNoRazonamiento'> {

	if (razonamientoOutputProveedor !== undefined) {

		return {
			SalidaRazonamiento: razonamientoOutputProveedor, FuenteSalidaRazonamiento: 'Proveedor',
			SalidaNoRazonamiento: Math.max(0, (outputTokensTotales ?? 0) - razonamientoOutputProveedor)
		};

    } else if (DebeInferirTókenesRazonamiento(valorRazonamiento, textoVisibleFinal, outputTokensTotales)) {

		const salidaVisibles = EstimarTókenesAproximados(textoVisibleFinal!, idioma);
		const salidaRazonamiento = Math.max(0, outputTokensTotales! - salidaVisibles);
		return {
			SalidaRazonamiento: salidaRazonamiento, FuenteSalidaRazonamiento: 'Inferido',
			SalidaNoRazonamiento: outputTokensTotales! - salidaRazonamiento
		};

	} else {
		return { SalidaRazonamiento: 0, FuenteSalidaRazonamiento: 'Proveedor', SalidaNoRazonamiento: outputTokensTotales ?? 0 };
	}

}


function ConstruirRespuestaError(errores: ErrorIA[]): { Texto: string; Errores: ErrorIA[]; } {

	const textoError = errores.length === 1 && errores[0].Fuente === 'Solicitud'
		? errores[0].Error : `${errores.length} conector${errores.length !== 1 ? 'es' : ''} IA fall${errores.length !== 1 ? 'aron' : 'ó'}.`;
	return { Texto: textoError, Errores: errores };

}


function ErrorIADirecto(errores: ErrorIA[], inferenciaTotalMilisegundos: number, unidadesInfracción: UnidadesInfracciónIA = 0,
	fuenteInfracción?: FuenteInfracciónIA): ResultadoIADirecto {

	const respuestaError = ConstruirRespuestaError(errores); // Política de negocio deliberada: el proyecto solo le cobra al usuario cuando recibe una respuesta completa y utilizable. Si OpenAI factura tókenes, cache o búsquedas web de una respuesta cancelada, incompleta o fallida, el proyecto asume ese costo y no lo traslada al usuario. Por eso los resultados de error conservan uso, costo y busquedas en cero aunque el proveedor haya alcanzado a consumir recursos. En particular, un límite de tókenes tampoco activa un respaldo: repetir la consulta duplicaría el costo sin resolver el límite, pero el intento incompleto original sigue siendo gratuito para el usuario. No convertir metadatos parciales del proveedor en un consumo cobrable sin una decisión expresa de producto que cambie esta política.
	return { Tipo: 'Error', Texto: respuestaError.Texto, Errores: respuestaError.Errores, ConectorEfectivo: null,
		ConsultasFallidas: ObtenerConsultasFallidas(errores), UsoTókenes: UsoTókenesCero,
		InferenciaMilisegundos: 0, InferenciaTotalMilisegundos: inferenciaTotalMilisegundos, CostoDólares: 0,
		BúsquedasWeb: 0, ProveedorBúsquedaWeb: null, Citas: [], UnidadesInfracción: unidadesInfracción, FuenteInfracción: fuenteInfracción
	};

}


function ObtenerConsultasFallidas(errores: ErrorIA[]): number {
	return errores.filter(error => error.Fuente !== 'Solicitud').length;
}


async function EjecutarModoDirecto(contexto: Contexto, entrada: EntradaIA, señalUsuario: AbortSignal, ignorarRespaldos = false,
	detallarErroresProveedor = false, primerRespaldo?: string, razonamientoPrimerRespaldo?: number): Promise<ResultadoIADirecto> {

	const nombresConectores = ResolverCadenaConectores(entrada.Conector, ignorarRespaldos, primerRespaldo);
	const erroresConectores: ErrorIA[] = [];
	let totalInferenciaMilisegundos = 0;
	let unidadesInfracción: UnidadesInfracciónIA = 0;
	let fuenteInfracción: FuenteInfracciónIA | undefined;

	for (const nombreConector of nombresConectores) {

		if (señalUsuario.aborted) { // Cortocircuito de cancelación: si el usuario abortó la petición, no tiene sentido intentar el siguiente respaldo.

			erroresConectores.push({ Código: CódigoErrorIA.SolicitudCancelada, Fuente: 'Solicitud',
				Error: 'Solicitud cancelada por el usuario.' });
			return ErrorIADirecto(erroresConectores, totalInferenciaMilisegundos, unidadesInfracción, fuenteInfracción);

		}

		const conector = ConectoresIA[nombreConector];
		if (!conector) throw new Error(`Conector '${nombreConector}' no se encontró en la configuración.`);
		const proveedor = ProveedoresIA[conector.Proveedor];
		if (!proveedor) throw new Error(`El proveedor del conector ${nombreConector} no se encontró en la configuración.`); // No se muestra el proveedor para no exponer información interna al cliente.
		const entradaEfectiva = (nombreConector === primerRespaldo && razonamientoPrimerRespaldo !== undefined)
			? { ...entrada, Razonamiento: razonamientoPrimerRespaldo } : entrada; // Si es el primer respaldo con razonamiento propio, se sobreescribe solo el razonamiento. El resto de parámetros (verbosidad, tókenes máximos, etc.) se conservan.
		const controladorLocal = new AbortController();
		const temporizador = setTimeout(() =>
			controladorLocal.abort(new Error(MensajeTimeoutConector)), entradaEfectiva.SegundosMáximos * 1000);
		const señalCombinada = AbortSignal.any([controladorLocal.signal, señalUsuario]); // Combina timeout local + cancelación del usuario: lo que ocurra primero aborta el fetch del conector.
		const inicioInferencia = Date.now(); // Cronómetro por conector: mide solo el tiempo del proveedor que finalmente respondió, sin acumular fallos anteriores.

		try {

			const resultadoConector = await EjecutarConectorDirecto(contexto, conector, proveedor, entradaEfectiva, señalCombinada,
				detallarErroresProveedor);
			
			const unidadesConector = resultadoConector.UnidadesInfracción ?? 0; // La respuesta exitosa también puede traer una señal de moderación integrada. Se conserva la señal más fuerte de toda la cadena sin sumar unidades de la misma solicitud.
			if (unidadesConector > unidadesInfracción) {
				unidadesInfracción = unidadesConector as UnidadesInfracciónIA;
				fuenteInfracción = resultadoConector.FuenteInfracción;
			}

			const { Texto: texto, Uso: uso, Citas: citas } = resultadoConector;
			const búsquedasWeb = resultadoConector.BúsquedasWeb ?? 0;
			const proveedorBúsquedaWeb = resultadoConector.ProveedorBúsquedaWeb;
			const costos = CalcularCostosConsultaDólares(conector, resultadoConector.UsoFacturable ?? uso, búsquedasWeb,
				proveedorBúsquedaWeb);
			clearTimeout(temporizador);
			const inferenciaMilisegundos = Date.now() - inicioInferencia; // Tiempo del conector que respondió en este intento.
			totalInferenciaMilisegundos += inferenciaMilisegundos;
			Registrar(contexto, {
				Conector: nombreConector, Proveedor: conector.Proveedor, Modelo: conector.Modelo, Modo: 'Directo',
				LargoEntrada: entradaEfectiva.MensajeUsuario.length + (entradaEfectiva.MensajeSistema?.length ?? 0),
				LargoSalida: texto.length, InferenciaMilisegundos: inferenciaMilisegundos,
				Razonamiento: entradaEfectiva.Razonamiento, Verbosidad: entradaEfectiva.Verbosidad,
				TókenesMáximos: entrada.TókenesMáximos, SegundosMáximos: entrada.SegundosMáximos, UsoTókenes: uso,
				BúsquedasWeb: búsquedasWeb, ProveedorBúsquedaWeb: proveedorBúsquedaWeb,
				DuraciónBúsquedasWebMilisegundos: resultadoConector.DuraciónBúsquedasWebMilisegundos,
				SolicitudesModelo: resultadoConector.SolicitudesModelo ?? 1,
				SolicitudesContextoLargo: resultadoConector.SolicitudesContextoLargo ?? 0,
				CostoModeloDólares: costos.CostoModeloDólares,
				CostoBúsquedasWebDólares: costos.CostoBúsquedasWebDólares,
				CostoTotalDólares: costos.CostoTotalDólares,
			});

			return { Tipo: 'Respuesta', Texto: texto, UsoTókenes: uso, InferenciaMilisegundos: inferenciaMilisegundos,
				InferenciaTotalMilisegundos: totalInferenciaMilisegundos,
				CostoDólares: costos.CostoTotalDólares, BúsquedasWeb: búsquedasWeb,
				UsoTókenesFacturables: resultadoConector.UsoFacturable ?? uso,
				ProveedorBúsquedaWeb: proveedorBúsquedaWeb ?? null,
				UsoTókenesTarifaExtendida: resultadoConector.UsoTókenesTarifaExtendida,
				Errores: erroresConectores, ConectorEfectivo: nombreConector, ConsultasFallidas: erroresConectores.length,
				Citas: citas, UnidadesInfracción: unidadesInfracción, FuenteInfracción: fuenteInfracción
			}; // Si hubo consultas fallidas antes, se conservan para auditoría y para contabilizar el total de tiempo.

		} catch (error) {

			clearTimeout(temporizador);
			const milisegundosFallido = Date.now() - inicioInferencia; // Tiempo que tardó este conector antes de fallar, para reportarlo al cliente.
			totalInferenciaMilisegundos += milisegundosFallido;
			const esErrorConfiguración = EsErrorConfiguraciónIA(error);
			const códigoError = ClasificarErrorConectorIA(error, señalUsuario.aborted, controladorLocal.signal.aborted);
			
			const unidadesError = ObtenerUnidadesInfracciónError(error); // Regla de negocio deliberada: cualquier rechazo de contenido emitido por un proveedor se conserva aunque un respaldo posterior responda correctamente, porque el objetivo de estas unidades no es servir de juez sobre la intención del usuario sino proteger las cuentas API del proyecto frente a tráfico que algún proveedor considere problemático. El éxito del respaldo con otro proveedor no invalida el riesgo ya señalado por el proveedor anterior para la cuenta de la API con ese proveedor anterior. Se usa el máximo, y no la suma, para registrar como máximo la señal más fuerte de cada solicitud mientras el historial acumulado decide gradualmente cuándo las consultas futuras deben pasar por moderación protegida.
			if (unidadesError > unidadesInfracción) {
				unidadesInfracción = unidadesError;
				fuenteInfracción = ObtenerFuenteInfracciónError(error);
			}

			const mensajeErrorDirecto = señalUsuario.aborted ? 'Solicitud cancelada por el usuario.' : ObtenerMensajeErrorIA(error);
			if (esErrorConfiguración)
				console.error('Error interno de configuración de IA al ejecutar un conector', { error: ObtenerMensajeError(error) });
			erroresConectores.push({ Código: códigoError, Fuente: nombreConector, Error: mensajeErrorDirecto, DuraciónMilisegundos: milisegundosFallido });

			if (señalUsuario.aborted)
				return ErrorIADirecto(erroresConectores, totalInferenciaMilisegundos, unidadesInfracción, fuenteInfracción); // Si el aborto vino del usuario, no probar respaldos: retornar inmediatamente.

			if (códigoError === CódigoErrorIA.LímiteTókenesAlcanzado) { // Alcanzar el presupuesto de salida significa que el proveedor sí procesó la solicitud y agotó exactamente el límite elegido, no que esté indisponible. Repetir desde cero con un respaldo duplicaría razonamiento, búsquedas web y costo sin corregir la causa, porque el respaldo recibe el mismo TókenesMáximos. Por eso se conserva el diagnóstico del intento y se termina la cadena. El cliente puede aumentar el límite o solicitar una respuesta más corta.
				RegistrarErrorIA(contexto, entrada, 'Directo', erroresConectores);
				return ErrorIADirecto(erroresConectores, totalInferenciaMilisegundos, unidadesInfracción, fuenteInfracción);
			}

			if (error instanceof ErrorParallel) {

				console.warn('El conector de IA falló en modo directo', { nombreConector, error: String(error) }); // Se conserva el diagnóstico interno aunque el error de búsqueda termine la cadena.
				RegistrarErrorIA(contexto, entrada, 'Directo', erroresConectores);
				return ErrorIADirecto(erroresConectores, totalInferenciaMilisegundos, unidadesInfracción, fuenteInfracción);

			}

			console.warn('El conector de IA falló en modo directo', { nombreConector, error: String(error) }); // Se registra y se sigue con el siguiente respaldo.

		}

	}

	const respuestaError = ConstruirRespuestaError(erroresConectores);
	console.error('Todos los conectores de IA fallaron en modo directo', respuestaError.Errores);
	RegistrarErrorIA(contexto, entrada, 'Directo', erroresConectores);
	return ErrorIADirecto(erroresConectores, totalInferenciaMilisegundos, unidadesInfracción, fuenteInfracción); // Agotados todos los conectores de la cadena sin éxito.

}


function EjecutarModoFlujo(contexto: Contexto, entrada: EntradaIA, señalUsuario: AbortSignal, ignorarRespaldos = false,
	primerRespaldo?: string, razonamientoPrimerRespaldo?: number): ReadableStream<Uint8Array> {

	const codificador = new TextEncoder();
	const nombresConectores = ResolverCadenaConectores(entrada.Conector, ignorarRespaldos, primerRespaldo);
    let controladorAbortoActivo: AbortController | null = null; // Variables del conector activo.
    let tiempoLímiteActivo: ReturnType<typeof setTimeout> | null = null;
    let tiempoSeñalesActivo: EstadoLatido | null = null;

    return new ReadableStream<Uint8Array>({

        async start(controlador): Promise<void> {

            const escribir = (evento: EventoIA): void => { controlador.enqueue(codificador.encode(JSON.stringify(evento) + '\n')); };

			escribir({ Tipo: 'Inicio' });

			let primerTokenEmitido = false; // Bandera crítica de fallo con respaldo
			const erroresConectores: ErrorIA[] = [];

            for (const nombreConector of nombresConectores) { // Fallo con respaldo lineal con flujo: intenta cada conector en orden hasta obtener respuesta exitosa o agotar la cadena.

				if (señalUsuario.aborted) { // Cortocircuito de cancelación: si el usuario abortó la petición, no tiene sentido intentar el siguiente respaldo.

					erroresConectores.push({ Código: CódigoErrorIA.SolicitudCancelada, Fuente: 'Solicitud',
						Error: 'Solicitud cancelada por el usuario.' });
					if (!primerTokenEmitido) escribir({ Tipo: 'Error', ...ConstruirRespuestaError(erroresConectores) });
					controlador.close();
					return;

				}

				const conector = ConectoresIA[nombreConector];
				if (!conector) throw new Error(`Conector '${nombreConector}' no se encontró en la configuración.`);
				const proveedor = ProveedoresIA[conector.Proveedor];

				if (!proveedor) throw new Error(`El proveedor del conector '${nombreConector}' no se encontró en la configuración.`); // No se muestra el proveedor para no exponer información interna al cliente.

				const entradaEfectiva = (nombreConector === primerRespaldo && razonamientoPrimerRespaldo !== undefined)
					? { ...entrada, Razonamiento: razonamientoPrimerRespaldo } : entrada; // Si es el primer respaldo con razonamiento propio, se sobreescribe solo el razonamiento. El resto de parámetros (verbosidad, tókenes máximos, etc.) se conservan.
				controladorAbortoActivo = new AbortController();
				tiempoLímiteActivo = setTimeout(() =>
					controladorAbortoActivo!.abort(new Error(MensajeTimeoutConector)), entradaEfectiva.SegundosMáximos * 1000); // Si se agota, el AbortSignal fuerza la cancelación y salta al siguiente respaldo.
				tiempoSeñalesActivo = ProgramarLatidos(escribir); // Señal de vida cada 10s para mantener viva la conexión HTTP mientras el modelo procesa, antes de recibir el primer token real.
				const señalCombinada = AbortSignal.any([controladorAbortoActivo.signal, señalUsuario]); // Combinar timeout local + cancelación del usuario: lo que ocurra primero aborta el fetch del conector.
				const inicioInferenciaFlujo = Date.now(); // Cronómetro por conector en milisegundos: mide solo el tiempo del proveedor que finalmente respondió, sin acumular fallos anteriores.

				let emitióTextoEsteConector = false;
				let carácteresSalida = 0; // Acumulador de carácteres de salida para el registro de inferencia.

                try {

					let usoFlujo: UsoTókenes = UsoTókenesCero;
					let búsquedasWebFlujo = 0;
					let proveedorBúsquedaWebFlujo: ProveedorBúsquedaWeb | undefined = entradaEfectiva.BúsquedaWeb
						? entradaEfectiva.ProveedorBúsquedaWeb : undefined; // El flujo nativo usa el proveedor seleccionado en la entrada, aunque el modelo decida no invocar la búsqueda.
					let duraciónBúsquedasWebFlujo = 0; // La búsqueda nativa en streaming no expone duración por búsqueda. Se conserva cero hasta disponer de ese dato.
					if (conector.SoportaFlujo) { // El conector soporta flujo nativo: delegar al método de flujo específico del proveedor.
						
						usoFlujo = await EjecutarConectorFlujo(contexto, conector, proveedor, entradaEfectiva, señalCombinada,
						cantidad => { búsquedasWebFlujo += cantidad; }, trozoTexto => {

								if (!primerTokenEmitido) { // Primera emisión de contenido real: marcar bandera y detener señales de vida porque ya hay datos fluyendo al cliente.
									primerTokenEmitido = true;
									if (tiempoSeñalesActivo) DetenerLatidos(tiempoSeñalesActivo); // Tras el primer token real ya no se necesitan señales-de-vida.
								}
								emitióTextoEsteConector = true; // Marcar que este conector emitió al menos un trozo de texto.
								carácteresSalida += trozoTexto.length;
								escribir({ Tipo: 'Respuesta', Texto: trozoTexto });

							});

						if (!emitióTextoEsteConector) throw new Error('El flujo del proveedor está vacío.');

					} else { // El conector no soporta flujo nativo: ejecutar en modo directo (bloqueante) y emitir el resultado completo como un único evento 'respuesta'.

						const resultadoConector = await EjecutarConectorDirecto(contexto, conector, proveedor, entradaEfectiva,
							señalCombinada);
						const { Texto: textoCompleto, Uso: usoDirecto } = resultadoConector;
						búsquedasWebFlujo = resultadoConector.BúsquedasWeb ?? 0;
						proveedorBúsquedaWebFlujo = resultadoConector.ProveedorBúsquedaWeb ?? proveedorBúsquedaWebFlujo;
						duraciónBúsquedasWebFlujo = resultadoConector.DuraciónBúsquedasWebMilisegundos ?? 0;
						usoFlujo = usoDirecto;
						primerTokenEmitido = true; // Marcar como emitido porque se envía todo el texto de una vez.
						emitióTextoEsteConector = true; // En modo directo, si se llega aquí es porque se obtuvo texto completo.
						carácteresSalida = textoCompleto.length;
						escribir({ Tipo: 'Respuesta', Texto: textoCompleto });

					}

					const inferenciaMsFlujo = Date.now() - inicioInferenciaFlujo; // Milisegundos de inferencia pura del proveedor.
					escribir({ Tipo: 'Fin', UsoTókenes: usoFlujo, BúsquedasWeb: búsquedasWebFlujo, InferenciaMilisegundos: inferenciaMsFlujo,
						Errores: erroresConectores.length > 0 ? erroresConectores : undefined }); // Éxito: notificar al cliente que el flujo terminó correctamente. Si hubo conectores fallidos antes, se incluyen para que el cliente pueda mostrar cuánto tiempo se perdió en intentos previos.
					Registrar(contexto, {
						Conector: nombreConector, Proveedor: conector.Proveedor, Modelo: conector.Modelo, Modo: 'Flujo',
						LargoEntrada: entradaEfectiva.MensajeUsuario.length + (entradaEfectiva.MensajeSistema?.length ?? 0),
						LargoSalida: carácteresSalida, InferenciaMilisegundos: inferenciaMsFlujo,
						Razonamiento: entradaEfectiva.Razonamiento, Verbosidad: entradaEfectiva.Verbosidad,
						TókenesMáximos: entradaEfectiva.TókenesMáximos, SegundosMáximos: entradaEfectiva.SegundosMáximos,
						UsoTókenes: usoFlujo, BúsquedasWeb: búsquedasWebFlujo,
						ProveedorBúsquedaWeb: proveedorBúsquedaWebFlujo, DuraciónBúsquedasWebMilisegundos: duraciónBúsquedasWebFlujo,
					});
						controlador.close();
						return;

				} catch (error) {

					const milisegundosFallidoFlujo = Date.now() - inicioInferenciaFlujo; // Tiempo que tardó este conector antes de fallar en modo flujo.
					const esErrorConfiguraciónFlujo = EsErrorConfiguraciónIA(error);
					const códigoErrorFlujo = ClasificarErrorConectorIA(error, señalUsuario.aborted,
						controladorAbortoActivo?.signal.aborted ?? false);
					const mensajeErrorFlujo = señalUsuario.aborted ? 'Solicitud cancelada por el usuario.' : ObtenerMensajeErrorIA(error);
					if (esErrorConfiguraciónFlujo)
						console.error('Error interno de configuración de IA al ejecutar un conector en flujo',
							{ error: ObtenerMensajeError(error) });
					erroresConectores.push({ Código: códigoErrorFlujo, Fuente: nombreConector, Error: mensajeErrorFlujo,
						DuraciónMilisegundos: milisegundosFallidoFlujo });
					if (!señalUsuario.aborted)
						console.warn('El conector de IA falló en modo flujo', { nombreConector, error: String(error) });

					if (señalUsuario.aborted) { // Aborto vino del usuario: no probar respaldos. Si aún no había tokens, notificar. Si ya había tokens, simplemente cerrar.

						if (!primerTokenEmitido) escribir({ Tipo: 'Error', ...ConstruirRespuestaError(erroresConectores) });
						controlador.close();
						return;

					}

					if (códigoErrorFlujo === CódigoErrorIA.LímiteTókenesAlcanzado) { // El límite de salida es una terminación deliberada del proveedor, no una indisponibilidad que otro modelo deba reparar. Incluso si el flujo no alcanzó a emitir texto visible porque consumió el presupuesto razonando, el respaldo repetiría la consulta con el mismo límite y podría duplicar búsquedas y costos. Se devuelve el error inmediatamente y se deja al cliente decidir si amplía TókenesMáximos.

						RegistrarErrorIA(contexto, entrada, 'Flujo', erroresConectores);
						escribir({ Tipo: 'Error', ...ConstruirRespuestaError(erroresConectores) });
						controlador.close();
						return;

					}

					if (primerTokenEmitido) { // Límite crítico de fallo con respaldo: ya se enviaron tokens al cliente, no se puede cambiar de proveedor a mitad de respuesta sin mezclar contenidos de distintos modelos. Abortar con error.

						RegistrarErrorIA(contexto, entrada, 'Flujo', erroresConectores);
						escribir({ Tipo: 'Error', ...ConstruirRespuestaError(erroresConectores) }); // Solo hay un conector en la lista ya que el fallo ocurrió tras emitir el primer token.
						controlador.close();
						return;

					} // En cualquier otro caso: aún no se ha emitido ningún token real y el aborto no vino del usuario: el fallo con respaldo es seguro y transparente para el cliente. Saltar al siguiente respaldo.

                } finally {

                    if (tiempoLímiteActivo !== null) clearTimeout(tiempoLímiteActivo);
                    if (tiempoSeñalesActivo !== null) DetenerLatidos(tiempoSeñalesActivo);
                    
                    controladorAbortoActivo = null; // Se limpian las referencias después de cada iteración para que el handler cancel del ReadableStream solo afecte al conector activo.
                    tiempoLímiteActivo = null;
                    tiempoSeñalesActivo = null;

                }

            }

         const respuestaErrorFlujo = ConstruirRespuestaError(erroresConectores);
			console.error('Todos los conectores de IA fallaron en modo flujo', respuestaErrorFlujo.Errores);
			RegistrarErrorIA(contexto, entrada, 'Flujo', erroresConectores);
			escribir({ Tipo: 'Error', ...respuestaErrorFlujo }); // Agotados todos los conectores de la cadena sin éxito.
            controlador.close();

        },

        cancel(): void { // El cliente del ReadableStream canceló la lectura (ej: navegador cerró la pestaña, fetch.abort()). Complementa señalUsuario porque puede dispararse en escenarios donde la Solicitud original no se aborta explícitamente.

            if (controladorAbortoActivo) controladorAbortoActivo.abort();
            if (tiempoLímiteActivo !== null) clearTimeout(tiempoLímiteActivo);
            if (tiempoSeñalesActivo !== null) DetenerLatidos(tiempoSeñalesActivo);

        }

    });

}


function ProgramarLatidos(escribir: (evento: EventoIA) => void): EstadoLatido {
    const id = setInterval(() => escribir({ Tipo: 'Latido' }), MilisegundosIntervaloLatido); // Primer envío exactamente a los 10s, luego cada 10s mientras siga vivo el polling/flujo sin datos reales.
    return { Id: id };
}


function DetenerLatidos(estado: EstadoLatido): void {
	clearInterval(estado.Id);
}


interface Registro {
	Conector: string;
	Proveedor: string;
	Modelo: string;
	Modo: ModoIA;
	LargoEntrada: number; // Carácteres totales del mensaje de usuario + sistema.
	LargoSalida: number; // Carácteres del texto de respuesta.
	InferenciaMilisegundos: number; // Milisegundos desde el inicio de inferencia del conector hasta respuesta completa.
	BúsquedasWeb?: number; // Cantidad de búsquedas web realizadas por el conector durante la inferencia.
	ProveedorBúsquedaWeb?: ProveedorBúsquedaWeb;
	DuraciónBúsquedasWebMilisegundos?: number;
	SolicitudesModelo?: number;
	SolicitudesContextoLargo?: number;
	CostoModeloDólares?: number;
	CostoBúsquedasWebDólares?: number;
	CostoTotalDólares?: number;
	Razonamiento: number | undefined; // Nivel de razonamiento solicitado por el cliente (1-5).
	Verbosidad: number | undefined; // Nivel de verbosidad solicitado por el cliente (1-5).
	TókenesMáximos: number; // Límite de tókenes de salida configurado por el cliente.
	SegundosMáximos: number; // Timeout configurado por el cliente.
	UsoTókenes: UsoTókenes;
}


function Registrar(contexto: Contexto, registro: Registro): void {

	const tókenesSalida = registro.UsoTókenes.SalidaNoRazonamiento + registro.UsoTókenes.SalidaRazonamiento;
	const totalTókenesEntrada = registro.UsoTókenes.EntradaCaché + registro.UsoTókenes.EntradaNoCaché + registro.UsoTókenes.EscrituraCaché;

	RegistrarEventoConPrefijo(contexto, 'IA.', 'Éxito', undefined, {
		Conector: registro.Conector,
		Proveedor: registro.Proveedor,
		Modelo: registro.Modelo,
		Modo: registro.Modo,
		LargoEntrada: registro.LargoEntrada,
		LargoSalida: registro.LargoSalida,
		InferenciaMilisegundos: registro.InferenciaMilisegundos,
		TotalTókenesEntrada: totalTókenesEntrada,
		TókenesEntradaCaché: registro.UsoTókenes.EntradaCaché,
		TókenesEntradaNoCaché: registro.UsoTókenes.EntradaNoCaché,
		TotalTókenesSalida: tókenesSalida,
		TókenesSalidaRazonamiento: registro.UsoTókenes.SalidaRazonamiento,
        FuenteSalidaRazonamiento: registro.UsoTókenes.FuenteSalidaRazonamiento,
		TókenesSalidaNoRazonamiento: registro.UsoTókenes.SalidaNoRazonamiento,
		TókenesEscrituraCaché: registro.UsoTókenes.EscrituraCaché,
		MinutosCachéManual: registro.UsoTókenes.MinutosCachéManual,
		Razonamiento: registro.Razonamiento ?? null,
		Verbosidad: registro.Verbosidad ?? null,
		TókenesMáximos: registro.TókenesMáximos,
		SegundosMáximos: registro.SegundosMáximos,
		BúsquedasWeb: registro.BúsquedasWeb ?? 0,
		ProveedorBúsquedaWeb: registro.ProveedorBúsquedaWeb ?? null,
		DuraciónBúsquedasWebMilisegundos: registro.DuraciónBúsquedasWebMilisegundos ?? 0,
		SolicitudesModelo: registro.SolicitudesModelo ?? 1,
		SolicitudesContextoLargo: registro.SolicitudesContextoLargo ?? 0,
		CostoModeloDólares: registro.CostoModeloDólares ?? null,
		CostoBúsquedasWebDólares: registro.CostoBúsquedasWebDólares ?? null,
		CostoTotalDólares: registro.CostoTotalDólares ?? null,
	});

}


function RegistrarErrorIA(contexto: Contexto, entrada: EntradaIA, modo: ModoIA, errores: ErrorIA[]): void {

	const respuestaError = ConstruirRespuestaError(errores);
	RegistrarEventoConPrefijo(contexto, 'IA.', 'Error', respuestaError.Texto, {
		Conector: entrada.Conector,
		Modo: modo,
		CuentaErrores: errores.length,
		FuentesErrores: errores.map(e => e.Fuente).join(',')
	});

}


export function ResolverCadenaConectores(nombreInicial: string, ignorarRespaldos = false, primerRespaldo?: string): string[] {

	const cadena: string[] = [];
	const principal = ConectoresIA[nombreInicial];
	if (!principal) return cadena;
	cadena.push(nombreInicial);

	if (primerRespaldo && !ignorarRespaldos) { // Respaldo explícito establecido por el cliente: se inserta antes de los respaldos configurados y tiene prioridad sobre ellos.

		if (!ConectoresIA[primerRespaldo])
			throw new Error(`${PrefijoErrorConfiguraciónIA} el conector declarado como 'primerRespaldo' no existe en ConectoresIA en configuracion.ts.`);
		cadena.push(primerRespaldo);

	}

	if (principal.Respaldo && !ignorarRespaldos) {

		if (!ConectoresIA[principal.Respaldo])
			throw new Error(`${PrefijoErrorConfiguraciónIA} un conector declarado como 'respaldo' no existe en ConectoresIA en configuracion.ts.`);
		cadena.push(principal.Respaldo); // El respaldo se usa solo como respaldo: sus propios respaldos se ignoran para evitar bucles.

	}

	if (principal.RespaldoFinal && !ignorarRespaldos) {

		if (!ConectoresIA[principal.RespaldoFinal])
			throw new Error(`${PrefijoErrorConfiguraciónIA} un conector declarado como 'respaldoFinal' no existe en ConectoresIA en configuracion.ts.`);
		cadena.push(principal.RespaldoFinal); // Igual con el respaldoFinal.

	}

	return [...new Set(cadena)]; // Deduplicación: evita que el mismo conector aparezca dos veces si respaldo o respaldoFinal coinciden con el principal.

}


async function NormalizarParámetros(contexto: Contexto, conector: ConectorIA, entrada: EntradaIA)
	: Promise<ParámetrosNormalizados> {

	if (!entrada.TókenesMáximos || entrada.TókenesMáximos <= 0) // Validación de contrato: máximosTokenes sigue siendo obligatorio en la interfaz para controlar costo en modelos generativos.
		throw new Error('TókenesMáximos es requerido y debe ser un número positivo.');

	const temperatura = entrada.Temperatura;

	const mapeoRazonamiento = ObtenerMapeoRazonamientoParaBúsquedaParallel(conector, entrada);
	const razonamiento = ResolverValorEscalado(entrada.Razonamiento, 1, 5, mapeoRazonamiento); // Escalar nivel 1..5 del frontend al mapa final del conector, que solo se adapta para Parallel con OpenAI cuando la búsqueda web está activa.
	const verbosidad = ResolverValorEscalado(entrada.Verbosidad, 1, 5, conector.MapeoVerbosidad); // Escalar nivel 1..5 del frontend al vector de valores literales declarado por el conector para verbosidad nativa. Si el conector no declara mapeo, queda undefined y se activa el respaldo por texto más abajo.

	const mensajeSistemaFinal = (verbosidad === undefined) // Respaldo automático para conectores sii verbosidad nativa: si el frontend pidió un nivel y el conector no expone el campo nativo, se antepone una instrucción de verbosidad como texto al inicio del mensaje de sistema, en el idioma del usuario. Esto preserva el control de verbosidad para proveedores donde la API no la soporta directamente (DeepSeek, Parasail, Novita, Anthropic, Gemini, Cloudflare).
		? await InyectarVerbosidadPorTexto(contexto, entrada.Idioma, entrada.MensajeSistema, entrada.Verbosidad)
		: entrada.MensajeSistema; // El conector tiene verbosidad nativa: el mensaje de sistema viaja sin modificar para no duplicar la señal.

	return { Idioma: entrada.Idioma, Temperatura: temperatura, Razonamiento: razonamiento, Verbosidad: verbosidad,
		MáximosTokenes: entrada.TókenesMáximos, MensajeSistemaFinal: mensajeSistemaFinal };

}


function ObtenerMapeoRazonamientoParaBúsquedaParallel(conector: ConectorIA, entrada: EntradaIA): readonly string[] {

	const esBúsquedaParallelOpenAI = entrada.BúsquedaWeb === true && entrada.ProveedorBúsquedaWeb === 'Parallel'
		&& conector.Proveedor === 'open-ai';

	if (esBúsquedaParallelOpenAI && conector.MapeoRazonamiento.length >= 2)
		return [conector.MapeoRazonamiento[0], ...conector.MapeoRazonamiento.slice(0, -1)]; // Las pruebas comparativas con GPT-5.6 Luna mostraron que, al entregar el mismo nivel al modelo mediante Parallel y mediante la búsqueda nativa de OpenAI, Parallel provoca muchas más llamadas a la herramienta externa: Medio llegó a 25,8 búsquedas y Alto alcanzó repetidamente el límite global de 30 mientras OpenAI nativo mantuvo cantidades mucho menores. La diferencia parece originarse en la forma en que el modelo de OpenAI razona cuando debe coordinar una herramienta externa como Parallel frente a su herramienta interna de búsqueda, por lo que esta adaptación intenta alinear ambos comportamientos sin descapar las 30 llamadas ni inventar límites diferentes por volumen de búsqueda. El desplazamiento conserva el nivel lógico solicitado y únicamente mueve un paso el literal final del mapa de cinco niveles, de [low, medium, high, xhigh, max] a [low, low, medium, high, xhigh]: volumen de búsqueda Bajo usa low, Medio usa medium y Alto usa high, de modo que el xhigh que antes recibía Alto nunca se envía y el high que antes recibía Medio queda como nuevo techo de Alto. La regla se aplica exclusivamente a búsquedas Parallel con conectores del proveedor OpenAI. OpenAI Search, las consultas sin búsqueda y todos los demás proveedores conservan su mapeo original. Los catálogos, la pareja lógica usada para presupuesto y registro y el único límite operativo global permanecen sin cambios.
	else
		return conector.MapeoRazonamiento;

}


export function ResolverValorEscalado(nivelFrontend: number | undefined, mínimoFrontend: number, máximoFrontend: number,
	mapeo: readonly string[]): string | undefined {

	if (nivelFrontend === undefined) return undefined; // El frontend no solicitó este parámetro: omitirlo.
	if (mapeo.length === 0) return undefined; // El conector no soporta este parámetro: omitirlo para evitar 400 por parámetro desconocido.
	if (mapeo.length === 1) return mapeo[0]; // Solo un nivel disponible: siempre se envía ese sin importar el nivel del frontend.
	const cantidadNiveles = máximoFrontend - mínimoFrontend + 1; // Distribución por buckets uniformes: el rango del frontend [mínimo..máximo] se divide en mapeo.length tramos consecutivos del mismo ancho. Para mapeo.length < cantidad de niveles del frontend esto produce una distribución simétrica con los extremos extendidos (ej: 5 niveles → 3 valores: 1 y 2→primero, 3→central, 4 y 5→último). Para mapeo.length >= cantidad de niveles del frontend produce una correspondencia directa (ej: 5 niveles → 5 valores: 1→0, 2→1, 3→2, 4→3, 5→4). Esto evita que el desarrollador tenga que escribir manualmente repeticiones tipo ['low','low','medium','high','high'] en el conector: basta con declarar los valores naturales únicos ['low','medium','high'] y el orquestador hace la equivalencia.
	if (cantidadNiveles <= 0) return mapeo[0]; // Protección contra rangos inválidos.
	const nivelAcotamiento = Math.min(máximoFrontend, Math.max(mínimoFrontend, nivelFrontend)); // Acotamiento por seguridad: aunque Valibot ya valida el rango, se protege contra llamadas internas con valores fuera de rango.
	const índice = Math.floor(((nivelAcotamiento - mínimoFrontend) + 0.5) / cantidadNiveles * mapeo.length);
	return mapeo[Math.min(mapeo.length - 1, Math.max(0, índice))]; // Acotamiento del índice por si la división produce mapeo.length por flotantes.

}


async function InyectarVerbosidadPorTexto(contexto: Contexto, idioma: Idioma, mensajeSistema: string | undefined,
	nivel: number | undefined): Promise<string | undefined> { // Respaldo de verbosidad para conectores que no la soportan nativamente: antepone una instrucción al mensaje de sistema, en el idioma del usuario, leída desde textos/<idioma>.json bajo claves ia-verbosidad-1..5. El idioma coincide con el del mensaje del usuario para que el modelo reciba todo el contexto en un solo idioma: mezclar idiomas en system prompt y user message confunde a modelos pequeños y puede producir respuestas en el idioma equivocado o mezcladas.

	if (nivel === undefined) return mensajeSistema; // El frontend no solicitó verbosidad: retornar el mensaje de sistema original sin modificar.
	const nivelNormalizado = Math.min(5, Math.max(1, Math.round(nivel))); // Acotamiento del nivel al rango 1..5 esperado por las claves de recursos.
	const claveTexto = `ia-verbosidad-${nivelNormalizado}`;
	const { texto: instrucción } = await ObtenerTextoEnIdioma(contexto, claveTexto, idioma);
	if (instrucción === claveTexto) throw new Error(`Hace falta la traducción de '${claveTexto}' en '${idioma}'`); // Clave no encontrada: el idioma no tiene traducción para este nivel de verbosidad. Funciona porque la función anterior devuelve la clave como texto si no encuentra la traducción, lo que permite detectar esta falla de configuración. Se lanza error porque sin la instrucción de verbosidad el respaldo pierde su sentido y es mejor fallar rápido que enviar un mensaje de sistema sin control de verbosidad a un modelo pequeño que se confunda y genere respuestas erráticas o en el idioma equivocado.
	if (!instrucción) return mensajeSistema; // Cadena vacía (nivel neutral): no inyectar nada y conservar el mensaje original.
	if (!mensajeSistema) return instrucción; // No hay mensaje de sistema original: retornar solo la instrucción de verbosidad.
	return `${instrucción}\n\n${mensajeSistema}`; // Anteponer la instrucción de verbosidad al mensaje de sistema original. No hay consenso sobre si ponerla de primera o última es mejor para que sea obedecida. 

}


async function EjecutarConectorDirecto(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA, entrada: EntradaIA,
	señal: AbortSignal, detallarErroresProveedor = false): Promise<ResultadoConectorDirecto> {

	if (proveedor.Formato === 'OpenAI Moderations')
		return EjecutarOpenAIModerationsDirecto(contexto, conector, proveedor, entrada, señal); // Endpoint clasificador: no usa parámetros generativos como temperatura, razonamiento o máximo de tókenes.

	const parámetros = await NormalizarParámetros(contexto, conector, entrada); // Normalizar parámetros según los mapas y capacidades declarados por el conector.

	switch (proveedor.Formato) { // Delegar la ejecución al método específico del proveedor según su formato de API.

		case 'OpenAI Chat':
			return EjecutarCompatibleOpenAIDirecto(contexto, conector, proveedor, entrada, parámetros, señal,
				detallarErroresProveedor); // Formato OpenAI Chat Completions clásico: usado por DeepSeek, Parasail, Novita y otros compatibles.
		case 'OpenAI Responses':
			return EjecutarOpenAIResponsesDirecto(contexto, conector, proveedor, entrada, parámetros, señal); // Formato OpenAI Responses API moderno (/v1/responses): razonamiento y verbosidad como objetos nativos.
		case 'Anthropic':
			return EjecutarAnthropicDirecto(contexto, conector, proveedor, entrada, parámetros, señal); // Formato Anthropic Messages API: usado por Claude.
		case 'Gemini':
			return EjecutarGoogleDirecto(contexto, conector, proveedor, entrada, parámetros, señal); // Formato Google Gemini generateContent: usado por Gemini.
		case 'Cloudflare': { // Cloudflare Workers AI: seleccionar el analizador por el contrato de respuesta declarado por el conector.

			const formatoRespuesta = ObtenerFormatoRespuestaCloudflare(conector);
			switch (formatoRespuesta) {

				case 'OpenAIChat':
					return EjecutarCompatibleOpenAIDirecto(contexto, conector, proveedor, entrada, parámetros, señal,
						detallarErroresProveedor);
				case 'CloudflareEstandar':
					return EjecutarCloudflareRespuestaDirecto(contexto, conector, entrada, parámetros, señal);
				case 'OpenAIResponses':
					throw new Error(`${PrefijoErrorConfiguraciónIA} el formato de respuesta Cloudflare 'OpenAIResponses' no está implementado.`);
				default:
					throw new Error(`${PrefijoErrorConfiguraciónIA} el formato de respuesta Cloudflare '${String(formatoRespuesta)}' no tiene analizador de respuesta directa implementado.`);

			}

		}

		default: throw new Error(`${PrefijoErrorConfiguraciónIA} un conector tiene un formato de proveedor no manejado en EjecutarConectorDirecto de ia.ts. Agrega un 'case' para este formato.`);

	}

}


async function EjecutarConectorFlujo(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA, entrada: EntradaIA,
	señal: AbortSignal, alContarBúsquedasWeb: (cantidad: number) => void,
	alRecibirTrozo: (trozo: string) => void): Promise<UsoTókenes> {

	const parámetros = await NormalizarParámetros(contexto, conector, entrada); // Normalizar parámetros según los mapas y capacidades declarados por el conector.

	switch (proveedor.Formato) { // Delegar la ejecución al método de flujo específico del proveedor según su formato de API.

		case 'OpenAI Chat': return EjecutarCompatibleOpenAIFlujo(contexto, conector, proveedor, entrada, parámetros, señal,
			alRecibirTrozo); // Flujo Chat Completions clásico: SSE con eventos 'data: {...}' y 'data: [DONE]'.
		case 'OpenAI Responses':
			return EjecutarOpenAIResponsesFlujo(contexto, conector, proveedor, entrada, parámetros, señal, alContarBúsquedasWeb,
				alRecibirTrozo); // Flujo Responses API: SSE con eventos 'response.output_text.delta' y 'response.completed'.
		case 'Anthropic': return EjecutarAnthropicFlujo(contexto, conector, proveedor, entrada, parámetros, señal, alRecibirTrozo); // Flujo Anthropic: SSE con eventos 'content_block_delta' y 'message_stop'.
		case 'Gemini': return EjecutarGoogleFlujo(contexto, conector, proveedor, entrada, parámetros, señal, alRecibirTrozo); // Flujo Gemini: SSE con parámetro alt=sse devolviendo chunks JSON.
		case 'Cloudflare': { // Cloudflare Workers AI: seleccionar el analizador de flujo por el contrato de respuesta declarado por el conector.

			const formatoRespuesta = ObtenerFormatoRespuestaCloudflare(conector);
			switch (formatoRespuesta) {

				case 'OpenAIChat':
					return EjecutarCompatibleOpenAIFlujo(contexto, conector, proveedor, entrada, parámetros, señal, alRecibirTrozo);
				case 'CloudflareEstandar':
					return EjecutarCloudflareRespuestaFlujo(contexto, conector, entrada, parámetros, señal, alRecibirTrozo);
				case 'OpenAIResponses':
					throw new Error(`${PrefijoErrorConfiguraciónIA} el formato de respuesta Cloudflare 'OpenAIResponses' no está implementado.`);
				default:
					throw new Error(`${PrefijoErrorConfiguraciónIA} el formato de respuesta Cloudflare '${String(formatoRespuesta)}' no tiene analizador de flujo implementado.`);

			}

		}
		case 'OpenAI Moderations': throw new Error(`${PrefijoErrorConfiguraciónIA} el formato 'OpenAI Moderations' es un clasificador y no se ejecuta en flujo: se usa con EjecutarConectorDirecto.`); // El endpoint de moderación responde de una sola vez, sin eventos de flujo, por eso solo lo atiende la ejecución directa.
		default: throw new Error(`${PrefijoErrorConfiguraciónIA} un conector tiene un formato de proveedor no manejado en EjecutarConectorFlujo de ia.ts. Agrega un 'case' para este formato.`);

	}

}


export function AplicarParámetrosOpcionales(destino: Record<string, unknown>, conector: ConectorIA, parámetros: ParámetrosNormalizados,
	formato: FormatoProveedorIA): void { // Aplica los parámetros opcionales comunes (temperatura, máximos tókenes, razonamiento y verbosidad) sobre el objeto destino que será serializado al JSON del proveedor. Los nombres de los campos y los valores literales se toman del conector para mantener al núcleo agnóstico: si el conector no declara un nombre o un mapeo, ese campo no se inyecta, evitando 400 por parámetro desconocido. El parámetro 'formato' sólo se usa para envolver razonamiento y verbosidad en objetos cuando el formato lo exige (ej: 'OpenAI Responses' espera Razonamiento: { effort } y text: { verbosity }). Para formatos planos (Chat Completions, Anthropic, Gemini, Cloudflare) el valor literal viaja como string escalar bajo el nombre declarado por el conector.

	if (conector.ModoEspecialOpenAI && (formato !== 'OpenAI Responses' || conector.Proveedor !== 'open-ai'))
		throw new Error(`${PrefijoErrorConfiguraciónIA} el conector '${conector.Nombre}' usa ModoEspecialOpenAI='${conector.ModoEspecialOpenAI}' fuera del proveedor OpenAI Responses.`);

	if (parámetros.Temperatura !== undefined && parámetros.Temperatura !== 1) destino.temperature = parámetros.Temperatura; // Solo se inyecta la temperatura si el cliente la solicitó explícitamente y es diferente al valor por defecto común documentado (1). Esto evita enviar el campo con valor por defecto que podría sobrescribir configuraciones específicas del conector.

	if (!conector.NombreParámetroMáximosTokenes) // Contrato obligatorio para formatos generativos: si el conector no lo declara, es un error de configuración que debe fallar temprano.
		throw new Error(`${PrefijoErrorConfiguraciónIA} a un conector le falta 'nombreParámetroMáximosTokenes' en ConectoresIA en configuracion.ts.`);
	const máximoTókenesProveedor
		= Math.min(ProveedoresIA[conector.Proveedor]?.MáximosTókenesSalidaTípicos ?? MáximoTókenesSalidaIA, MáximoTókenesSalidaIA);
	const tókenesMáximos = Math.min(parámetros.MáximosTokenes, máximoTókenesProveedor); // Cada intento conserva el límite menor del llamador y del proveedor. Un respaldo puede reducirlo, nunca aumentarlo.
	destino[conector.NombreParámetroMáximosTokenes] = tókenesMáximos;
	if (formato === 'OpenAI Responses' && ModoEspecialOpenAITieneFast(conector)) destino.service_tier = 'fast';

	if (parámetros.Razonamiento !== undefined && conector.RazonamientoConfigurable) {

		if (formato === 'OpenAI Responses') { // Responses API exige objeto reasoning: { effort: 'low'|'medium'|'high'|... }. El nombre del campo declarado por el conector se ignora porque la API fija el contrato.

			const razonamiento: Record<string, string> = { effort: parámetros.Razonamiento };
			if (ModoEspecialOpenAITienePro(conector)) razonamiento.mode = 'pro';
			destino.reasoning = razonamiento;

		} else if (formato === 'Gemini') { // Gemini 3.1 usa thinkingConfig: { thinkingLevel: 'minimal'|'low'|'medium'|'high' } dentro de generationConfig. includeThoughts se omite porque solo pide resúmenes de pensamiento que el adaptador descarta antes de responder al cliente.
			destino.thinkingConfig = { thinkingLevel: parámetros.Razonamiento };
		} else {

			if (!conector.EstiloRazonamiento)
				throw new Error(`${PrefijoErrorConfiguraciónIA} el conector '${conector.Modelo}' tiene razonamientoConfigurable=true pero no declaró estiloRazonamiento en configuracion.ts.`);
			const estilo: EstiloRazonamiento = conector.EstiloRazonamiento;

			switch (estilo) {

				case 'openai-effort': // Chat Completions: Ej: Novita.

					if (parámetros.Razonamiento === 'none')
						destino.enable_thinking = false;
					else if (parámetros.Razonamiento !== 'none')
						destino.reasoning = { effort: parámetros.Razonamiento };
					break;

				case 'thinking-type': // Chat Completions: thinking: { type: 'enabled'|'disabled' }. Ej: Kimi en Novita/Fireworks/Inceptron/Deepinfra.
					destino.thinking = parámetros.Razonamiento === 'none' ? { type: 'disabled' } : { type: 'enabled' };
					break;
				case 'deepseek-native': // API nativa DeepSeek: thinking: { type } + reasoning_effort escalar.

					if (parámetros.Razonamiento === 'none') {
						destino.thinking = { type: 'disabled' };
					} else {
						destino.thinking = { type: 'enabled' };
						destino.reasoning_effort = parámetros.Razonamiento;
					}
					break;

				case 'reasoning-effort': // Chat Completions: reasoning_effort escalar. Se omite si 'none'. Ej: Fireworks/Deepinfra DeepSeek.
					destino.reasoning_effort = parámetros.Razonamiento;
					break;
				case 'parasail-deepseek': // Parasail DeepSeek: chat_template_kwargs: { thinking, reasoning_effort }. Se omite si 'none'.

					if (parámetros.Razonamiento !== 'none')
						destino.chat_template_kwargs = { thinking: true, reasoning_effort: parámetros.Razonamiento };
					else
						destino.chat_template_kwargs = { thinking: false, reasoning_effort: parámetros.Razonamiento };
					break;

				case 'parasail-kimi': // Parasail/Cloudflare Kimi: chat_template_kwargs: { thinking: bool }.
					destino.chat_template_kwargs = { thinking: parámetros.Razonamiento !== 'none' };
					break;
				case 'enable-thinking':
					destino.enable_thinking = parámetros.Razonamiento !== 'none';
					break;
				default: {
					const _agotado: never = estilo;
					throw new Error(`${PrefijoErrorConfiguraciónIA} estiloRazonamiento no manejado '${_agotado}'. Agrega un 'case' para él en AplicarParámetrosOpcionales de ia.ts.`);
				}

			}

		}

	}

	if (parámetros.Verbosidad !== undefined && conector.VerbosidadConfigurable) {

		if (formato === 'OpenAI Responses') { // Responses API exige objeto text: { verbosity: 'low'|'medium'|'high' }. El nombre del campo declarado por el conector se ignora porque la API fija el contrato.
			const textoExistente = destino.text as Record<string, unknown> | undefined;
			destino.text = { ...(textoExistente ?? {}), verbosity: parámetros.Verbosidad };
		}

	}

}


export function ObtenerClaveApi(contexto: Contexto, proveedor: ProveedorIA): string {

    if (!proveedor.Clave) return ''; // Cloudflare Workers AI no requiere API key porque se usa el binding env.AI.
   
    const entorno = contexto.Entorno;
    let valor: string | undefined;
    switch (proveedor.Clave) { // Mapeo explícito: cada nombre declarado en ProveedoresIA[*].clave debe corresponder a un campo tipado de Entorno. Así se evita un index signature en Entorno y se obtiene error temprano si falta una clave.

        case 'CLAVE_OPENAI': valor = entorno.CLAVE_OPENAI; break;
        case 'CLAVE_ANTHROPIC': valor = entorno.CLAVE_ANTHROPIC; break;
        case 'CLAVE_GOOGLE': valor = entorno.CLAVE_GOOGLE; break;
        case 'CLAVE_DEEPSEEK': valor = entorno.CLAVE_DEEPSEEK; break;
        case 'CLAVE_PARASAIL': valor = entorno.CLAVE_PARASAIL; break;
		case 'CLAVE_NOVITA': valor = entorno.CLAVE_NOVITA; break;
		case 'CLAVE_FIREWORKS': valor = entorno.CLAVE_FIREWORKS; break;
		case 'CLAVE_INCEPTRON': valor = entorno.CLAVE_INCEPTRON; break;
		case 'CLAVE_DEEPINFRA': valor = entorno.CLAVE_DEEPINFRA; break;
		case 'CLAVE_TOGETHER': valor = entorno.CLAVE_TOGETHER; break;
		default: throw new Error(`${PrefijoErrorConfiguraciónIA} se configuró un nombre de clave de API no reconocido. Agrega un 'case' para él en ObtenerClaveApi de ia.ts.`);

    }
	if (!valor || valor.length === 0)
		throw new Error(`${PrefijoErrorConfiguraciónIA} La variable de entorno de la clave de API configurada está vacía o no está definida. Defínela en los secretos del Worker o en .dev.vars.`);
    return valor;

}


export async function AplicarIdentificadorUsuario(contexto: Contexto, conector: ConectorIA, cuerpo: Record<string, unknown>)
	: Promise<void> { // Identificador opaco no reversible. Nunca se registra el UUID real. 

	let campo: 'safety_identifier' | 'user_id' | 'user' | null;
	switch (conector.Proveedor) {

		case 'open-ai': campo = 'safety_identifier'; break; // Adjuntar esto sirve para que OpenAI bloquee el usuario puntual y no necesariamente (por lo menos no prematuramente) la cuenta del desarrollador https://developers.openai.com/api/docs/guides/safety-checks.
		case 'deepseek': campo = 'user_id'; break;
		case 'deepinfra': campo = 'user'; break;
		case 'anthropic': campo = null; break; // Anthropic no recibe el identificador en la raíz: se agrega después dentro de metadata.user_id.
		default: return;

	}

	const identificadorUsuario = await ObtenerIdentificadorUsuarioParaTerceros(contexto.Autenticación);
	if (!identificadorUsuario) return;

	if (campo) cuerpo[campo] = identificadorUsuario;
	else cuerpo.metadata = { user_id: identificadorUsuario }; // El null anterior indica esta forma anidada, no que se omita el identificador.

}


export function ProcesarEventoSse<TEvento>(líneaDatos: string,
	esError?: (evento: TEvento & EventoSseBase) => boolean): (TEvento & EventoSseBase) | null { // Procesa una línea 'data: ...' SSE de forma uniforme para todos los proveedores: descarta '[DONE]' y líneas no JSON, y lanza si el evento representa un error embebido (lo cual aborta el conector activo y permite el fallo con respaldo si aún no hubo primer token). Devuelve el evento tipado o nulo si la línea debe ignorarse.

    if (líneaDatos === '[DONE]') return null; // Centinela común de fin de flujo estilo OpenAI: no es un evento, se ignora.

    let evento: TEvento & EventoSseBase;
    try { evento = JSON.parse(líneaDatos) as TEvento & EventoSseBase; } catch { return null; } // Línea no JSON (keep-alive, comentario SSE o fragmento parcial): se ignora.

	if (evento?.type === 'error' || evento?.error || esError?.(evento)) { // Detección genérica + extensión por proveedor (p. ej. 'response.failed' en OpenAI Responses).

		const errorDirecto = evento.error; // Error directo en el evento (formato común de todos los proveedores).
		const errorResponse = (evento as { response?: { error?: { message?: string; code?: string; }; }; }).response?.error; // Error anidado en response.error (formato 'response.failed' de OpenAI Responses).
       const mensaje = typeof errorDirecto === 'string' ? errorDirecto : errorDirecto?.message ?? errorResponse?.message ?? errorResponse?.code;
		console.error('Recibido evento SSE error', JSON.stringify(evento));
		throw new Error(`Recibido SSE error: ${mensaje ?? 'error desconocido'}`);

	}

    return evento;

}


export async function ProcesarSseLineas(cuerpo: ReadableStream<Uint8Array>, señal: AbortSignal,
	alRecibirLínea: (líneaDatos: string) => void)
	: Promise<void> {

    const lector = cuerpo.getReader();
    const decodificador = new TextDecoder('utf-8');
    let búfer = '';

    if (señal.aborted) { await lector.cancel(); return; } // Si la señal ya estaba abortada antes de empezar a leer, cancelar inmediatamente.

    const alAbortar = (): void => { void lector.cancel(); }; // Vincular el aborto al reader: aunque fetch con signal ya cancela el body al abortar, este enlace cubre también a Cloudflare AI.run cuyo flujo no acepta signal externo.
    señal.addEventListener('abort', alAbortar, { once: true });

    try {

        while (true) {

			const { value, done } = await lector.read();
			if (done) break;
			const chunkLimpio = decodificador.decode(value, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
			búfer += chunkLimpio;

           let posSalto = búfer.indexOf('\n'); // SSE separa eventos por líneas. Se procesa por '\n' y se deja en el búfer cualquier resto sin terminar.
           while (posSalto !== -1) {

                const línea = búfer.slice(0, posSalto).trim();
                búfer = búfer.slice(posSalto + 1);
                if (línea.startsWith('data:')) alRecibirLínea(línea.slice(5).trim());
                posSalto = búfer.indexOf('\n');

            }

        }

        const líneaRestante = búfer.trim(); // Procesar la última línea si quedó contenido sin salto de línea final. Esto ocurre cuando el flujo termina sin enviar '\n' después del último evento 'data: ...'.
        if (líneaRestante.startsWith('data:')) alRecibirLínea(líneaRestante.slice(5).trim());

    } finally {
        señal.removeEventListener('abort', alAbortar);
    }

}
