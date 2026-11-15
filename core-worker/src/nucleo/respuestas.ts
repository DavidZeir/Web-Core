import { AplicarIdiomaYCanonicalARespuestaHtml, ObtenerTextoEnIdioma } from './idiomas';
import { ObtenerTipoContenidoDesdeExtensión, Sanear, type Contexto } from './global';
import { ActivarTraducciónHtml, IdiomasSoportados } from '../configuracion';
import { type BaseIssue } from 'valibot';
import { ActualizarOCrearEtiquetasSeo } from './metadatos';
import { EstablecerAtributoTema } from './temas';
import HtmlErrorApiCompilado from '../../static/html/nucleo/error-api.html';
import HtmlErrorAutenticaciónCompilado from '../../static/html/nucleo/error-autenticacion.html';
import HtmlErrorEnlaceMágicoCompilado from '../../static/html/nucleo/error-enlace-magico.html';
import HtmlMarcoCompilado from '../../static/html/marco.html';


type CreadorRespuesta = (contexto: Contexto, contenido: string, estado: number, cabeceras?: Headers) => Response;

export interface InserciónFragmento { Selector: string; Contenido: string; ComoHtml: boolean; }

export enum TipoRespuesta { Json = 'json', Html = 'html', Texto = 'txt' }

export enum EstadoError {
	SolicitudInválida = 400, NoAutorizado = 401, NoEncontrado = 404, MétodoNoPermitido = 405,
	ErrorServidor = 500, ServicioNoDisponible = 503
}

export enum TipoError { Api, Autenticación, EnlaceMágico, PáginaPropia } // Con PáginaPropia, el mensaje ya trae la página de error entera, con su título y sus acciones, así que no lleva plantilla.


export interface DetallesError {
	MensajeAUsuario?: string;
	ErroresValidación?: BaseIssue<unknown>[];
	Estado?: number;
	SelectorUbicación?: string; // Para inyección en fragmentos HTML.
	TipoError?: TipoError; // Determina qué template HTML se usa al mostrar el error al usuario.
	PermitirHtml?: boolean; // Cuando es verdadero el mensaje se inserta sin sanear, permitiendo HTML en el contenido del error.
}


function CrearRespuestaHtml(contexto: Contexto, contenidoHtml: string, estado = 200, cabeceras = new Headers()): Response {

	cabeceras.set('content-type', 'text/html; charset=utf-8');
	cabeceras.set('X-Frame-Options', 'DENY'); // Evita el Clickjacking. Al impedir mostrar la respuesta en <iframe>, <frame> o <object> de otro sitio web.
	cabeceras.set('X-Content-Type-Options', 'nosniff'); // Para que los navegadores no traten de adivinar el tipo del contenido si no que obedezcan a lo que se le puso en content-type.
	cabeceras.set('Referrer-Policy', 'strict-origin-when-cross-origin'); // Omite path y query en solicitudes cross-origin, evitando que tokens en URL viajen en el header Referer hacia recursos externos, sin romper pasarelas de pago ni afiliados que necesiten saber el dominio de origen.
	cabeceras.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); // Prohíbe que cualquier script, incluyendo terceros como Cloudflare Insights, solicite acceso a cámara, micrófono o geolocalización.
	const directivasCspCierre = "base-uri 'self'; form-action 'self'; frame-ancestors 'none';"; // Directivas de cierre de superficie: base-uri evita que un <base> inyectado redirija URLs relativas a otro dominio, form-action restringe el destino de formularios (relevante en un framework HTML-first con HTMX), frame-ancestors es la versión moderna de X-Frame-Options y bloquea clickjacking desde iframes externos.

	if (contexto.Local) {
		cabeceras.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' http://127.0.0.1:3000; " +
			`style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:3000 http://127.0.0.1:3000; ${directivasCspCierre}`); // Necesario para que funcione Browser Sync.
	} else {

		cabeceras.set('Content-Security-Policy', "default-src 'self'; script-src 'self' static.cloudflareinsights.com; " +
			`style-src 'self' 'unsafe-inline'; connect-src 'self' cloudflareinsights.com; ${directivasCspCierre}`); // Bloquea scripts malignos, permite Cloudflare Insights.
		cabeceras.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); // Exige HTTPS siempre. HSTS: Solo se aplica si no se está en localhost.

	}
	return new Response(contenidoHtml, { status: estado, headers: cabeceras });

}


function CrearRespuestaJson(_contexto: Contexto, contenidoJson: string, estado = 200, cabeceras = new Headers()): Response { // Recibe el contexto sin usarlo porque todos los creadores de respuestas comparten la firma de CreadorRespuesta, y el de HTML sí lo necesita.

	cabeceras.set('content-type', 'application/json; charset=utf-8');
	cabeceras.set('X-Content-Type-Options', 'nosniff');
	cabeceras.set('X-Frame-Options', 'DENY');
	return new Response(contenidoJson, { status: estado, headers: cabeceras });

}


function CrearRespuestaTexto(_contexto: Contexto, contenidoTexto: string, estado = 200, cabeceras = new Headers()): Response { // Recibe el contexto sin usarlo porque todos los creadores de respuestas comparten la firma de CreadorRespuesta, y el de HTML sí lo necesita.

	cabeceras.set('content-type', 'text/plain; charset=utf-8');
	cabeceras.set('X-Content-Type-Options', 'nosniff');
	cabeceras.set('X-Frame-Options', 'DENY');
	return new Response(contenidoTexto, { status: estado, headers: cabeceras });

}


function ObtenerCreadorRespuesta(tipoContenido: TipoRespuesta): CreadorRespuesta {

	switch (tipoContenido) {

		case TipoRespuesta.Json:
			return CrearRespuestaJson;
		case TipoRespuesta.Html:
			return CrearRespuestaHtml;
		case TipoRespuesta.Texto:
			return CrearRespuestaTexto;
		default:
			throw new Error(`Tipo de contenido no soportado: ${String(tipoContenido)}`);

	}

}


/**
 * Procesa el contenido de una respuesta para devolver ls respuesta adecuada.
 * @param contenido Lo que definitivamente se va a mostrar al usuario.
 * @param estado El estado HTTP de la respuesta.
 * @param tipoRespuesta El tipo de contenido esperado (HTML, TXT o JSON).
 * @param detallesError Opciones de error para el registro y control de respuesta.
 * @returns Una respuesta con el contenido procesado.
 */
export async function Responder(contexto: Contexto, contenido: string, tipoRespuesta: TipoRespuesta, estado?: number,
	detallesError?: DetallesError): Promise<Response> {

	const creadorRespuesta = ObtenerCreadorRespuesta(tipoRespuesta);
	const cabeceras = new Headers();
	const estadoEfectivo = estado ?? 200; // Si no se proporciona estado, usar 200 por defecto.
	const { contenidoRespuesta } = await ResolverContenidoRespuesta(contexto, contenido, estadoEfectivo, tipoRespuesta, detallesError);

	AgregarCookiesACabeceras(cabeceras, contexto.CookiesRespuesta);

	const esPeticiónHtmx = contexto.Solicitud.headers.get('HX-Request')?.toLowerCase() === 'true';
	const respuestaProcesada = creadorRespuesta(contexto, contenidoRespuesta, estadoEfectivo, cabeceras);

	if (tipoRespuesta === TipoRespuesta.Html && esPeticiónHtmx && !contenidoRespuesta.includes('{{')) return respuestaProcesada; // Se omite el rewriter por eficiencia solo en fragmentos HTMX sin placeholders {{ }}.

	if (tipoRespuesta === TipoRespuesta.Html) return VerificarAplicarIdiomaYCanonicalARespuestaHtml(contexto, respuestaProcesada);

	return respuestaProcesada;

}


export async function ResponderHtmlConNonce(contexto: Contexto, contenidoHtml: string, usarMarco: boolean = false, estado?: number,
	detallesError?: DetallesError): Promise<Response> { // Se usa para páginas administrativas, vistas de prueba y otros HTML que deben conservar un script inline por ergonomía o por ser una demo diagnóstica que no justifica crearle archivos .ts independientes, pero que igualmente tienen que pasar la CSP de producción sin abrir `unsafe-inline`. La funcion inserta el nonce en el primer <script> embebido y ajusta la CSP de esa respuesta. Exige exactamente un <script> embebido porque reemplazar varios requeriría parsear el HTML para distinguir los inline de las referencias externas. Los casos actuales, como ejemplo-texto-a-voz, solo tienen un script, y esta función está diseñada para esos casos concretos, no como reemplazo genérico de ResponderConMarco.

	const cantidadScripts = (contenidoHtml.match(/<script[\s>]/gi) || []).length;
	if (cantidadScripts !== 1)
		throw new Error(`ResponderHtmlConNonce espera exactamente 1 <script>, pero encontró ${cantidadScripts}.`);

	const bytesNonce = crypto.getRandomValues(new Uint8Array(16));
	const nonce = btoa(String.fromCharCode(...bytesNonce));
	const htmlConNonce = contenidoHtml.replace('<script>', `<script nonce='${nonce}'>`);
	const respuesta = usarMarco
		? await ResponderConMarco(contexto, htmlConNonce)
		: await Responder(contexto, htmlConNonce, TipoRespuesta.Html, estado, detallesError);
	const cabeceras = new Headers(respuesta.headers);
	const csp = cabeceras.get('Content-Security-Policy') ?? '';
	cabeceras.set('Content-Security-Policy', csp.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`));
	return new Response(respuesta.body, { status: respuesta.status, headers: cabeceras });

}


/**
 * Procesa una plantilla HTML con inserciones y control opcional de errores.
 * @param htmlMarco Plantilla base que se transformará con fragmentos.
 * @param inserciones Lista de fragmentos a insertar por selector.
 * @param transformaciónAdicional Transformador HTML opcional para ajustes adicionales.
 * @param detallesError Opciones de error para estado, registro e inserción de error en selector.
 * @returns Una respuesta HTML transformada o una respuesta de fallback ante error.
 */
export async function ResponderConFragmentos(contexto: Contexto, htmlMarco: string, inserciones: InserciónFragmento[],
	transformaciónAdicional?: (transformadorHtml: HTMLRewriter) => HTMLRewriter, detallesError?: DetallesError)
	: Promise<Response> {

	const estadoRespuestaEfectivo = detallesError?.Estado ?? 200;
	const resultadoRespuesta
		= await ResolverContenidoRespuesta(contexto, htmlMarco, estadoRespuestaEfectivo, TipoRespuesta.Html, detallesError);
	const selectorUbicaciónError = detallesError?.SelectorUbicación;

	if (resultadoRespuesta.hayError && !selectorUbicaciónError)
		return Responder(contexto, htmlMarco, TipoRespuesta.Html, estadoRespuestaEfectivo, detallesError);

	const debeInsertarError = resultadoRespuesta.hayError && !!selectorUbicaciónError;
	const respuestaBase = CrearRespuestaHtml(contexto, htmlMarco, estadoRespuestaEfectivo); // Se mantiene un estado HTTP real (y no 200 como se hace con los fragmentos de HTMX sueltos) por varias razones: 1. Monitoreo más limpio. 2. Caché: Los resultados 200 son naturalmente cacheables y no se quiere cachear un página con error. 3. SEO: No es correcto que los buscadores categoricen páginas con error como válidas.
	let transformadorHtml = new HTMLRewriter();

	if (inserciones.length > 0 || transformaciónAdicional || debeInsertarError) {

		if (inserciones.length > 0) {

			for (const inserción of inserciones) {

				transformadorHtml = transformadorHtml.on(inserción.Selector, {
					element(elemento) {
						elemento.setInnerContent(inserción.Contenido, { html: inserción.ComoHtml }); // El valor por defecto es falso para forzar a que se use en verdadero cuando de verdad se esté usando HTML. Se hace así por seguridad.
					}
				});

			}

		}

		if (debeInsertarError)
			transformadorHtml = transformadorHtml.on(selectorUbicaciónError, {
				element(elemento) { elemento.setInnerContent(resultadoRespuesta.contenidoRespuesta, { html: true }); }
			});

		if (transformaciónAdicional) transformadorHtml = transformaciónAdicional(transformadorHtml);

		const respuestaTransformada = TransformarHtmlConCookies(contexto, respuestaBase, transformadorHtml);
		return VerificarAplicarIdiomaYCanonicalARespuestaHtml(contexto, respuestaTransformada);

	} else {
		return Responder(contexto, htmlMarco, TipoRespuesta.Html, estadoRespuestaEfectivo, detallesError);
	}

}


export async function ResponderConMarco(contexto: Contexto, htmlContenido: string,
	transformaciónAdicional?: (transformadorHtml: HTMLRewriter) => HTMLRewriter,
	selectorContenido: string = '#contenido'): Promise<Response> {

	const htmlMarco = await ObtenerHtmlMarco(contexto);
	return ResponderConFragmentos(contexto, htmlMarco, [{ Selector: selectorContenido, Contenido: htmlContenido, ComoHtml: true }],
		transformaciónAdicional);

}


export async function ResponderErrorConMarco(contexto: Contexto, mensajeError: string, tipoError: TipoError,
	permitirHtml: boolean = false, htmlMarco: string | null = null, estadoError: EstadoError = EstadoError.SolicitudInválida,
	erroresValidación: BaseIssue<unknown>[] = [], selectorError: string = '#contenido')
	: Promise<Response> {

	const htmlMarcoEfectivo = htmlMarco ?? await ObtenerHtmlMarco(contexto);
	return ResponderConFragmentos(contexto, htmlMarcoEfectivo, [], undefined,
		CrearDetallesError(tipoError, estadoError, selectorError, mensajeError, erroresValidación, permitirHtml));

}


export function ResponderRedirección(contexto: Contexto, ruta: string, estado: number = 302): Response { // Redirección HTTP con cookies adjuntas usando el contexto como fuente única de salida.

	const cabeceras = new Headers({ 'Location': ruta });
	AgregarCookiesACabeceras(cabeceras, contexto.CookiesRespuesta);
	return new Response(null, { status: estado, headers: cabeceras });

}


export function ResponderRedirecciónHtmx(contexto: Contexto, ruta: string): Response { // Redirección para una petición de HTMX: responde 200 con el encabezado HX-Redirect, para que HTMX cargue la página nueva completa en vez de meter la respuesta de una redirección 302 dentro del fragmento. Adjunta las cookies del contexto, igual que ResponderRedirección().

	const cabeceras = new Headers({ 'HX-Redirect': ruta });
	AgregarCookiesACabeceras(cabeceras, contexto.CookiesRespuesta);
	return new Response(null, { status: 200, headers: cabeceras });

}


export function ResponderSinContenido(contexto: Contexto): Response { // Confirma operaciones ya completadas sin contenido, conservando las cookies acumuladas en el contexto.

	const cabeceras = new Headers();
	AgregarCookiesACabeceras(cabeceras, contexto.CookiesRespuesta);
	return new Response(null, { status: 204, headers: cabeceras });

}


export function ResponderBinario(contexto: Contexto, cuerpo: BodyInit | null, extensiónArchivo: string, estado: number = 200,
	cabeceras: Headers = new Headers()): Response { // Recibe extensión y la traduce al MIME correcto antes de responder.
	return CrearRespuestaBinaria(contexto, cuerpo, ObtenerTipoContenidoDesdeExtensión(extensiónArchivo), estado, cabeceras);
}


export function CrearRespuestaBinaria(contexto: Contexto, cuerpo: BodyInit | null, tipoContenido: string, estado: number,
	cabeceras: Headers): Response { // Versión más genérica de ResponderBinario() que recibe el tipo de contenido ya resuelto, para casos donde no se tenga una extensión de archivo clara o se quiera especificar un MIME específico.

	cabeceras.set('content-type', tipoContenido);
	cabeceras.set('X-Content-Type-Options', 'nosniff');
	cabeceras.set('X-Frame-Options', 'DENY');
	AgregarCookiesACabeceras(cabeceras, contexto.CookiesRespuesta);
	return new Response(cuerpo, { status: estado, headers: cabeceras });

}


export async function ResponderMétodoNoPermitido(contexto: Contexto, mensajeError: string, tipoError: TipoError,
	métodosPermitidos: string[]): Promise<Response> { // Respuesta 405 con cabecera Allow correcta y marco de error, eliminando el patrón repetido de mutar cabeceras en las rutas.

	const respuesta = await ResponderErrorConMarco(contexto, mensajeError, tipoError);
	const cabeceras = new Headers(respuesta.headers);
	cabeceras.set('Allow', métodosPermitidos.join(', '));
	return new Response(respuesta.body, { status: EstadoError.MétodoNoPermitido, headers: cabeceras });

}


export async function ResponderSoloPostPermitido(contexto: Contexto, tipoError: TipoError = TipoError.Api): Promise<Response> {
	const { texto } = await ObtenerTextoEnIdioma(contexto, 'respuesta-solo-post-permitido', contexto.Idioma);
	return ResponderMétodoNoPermitido(contexto, texto, tipoError, ['POST']);
}


export async function ResponderSoloGetPermitido(contexto: Contexto, tipoError: TipoError = TipoError.Api): Promise<Response> {
	const { texto } = await ObtenerTextoEnIdioma(contexto, 'respuesta-solo-get-permitido', contexto.Idioma);
	return ResponderMétodoNoPermitido(contexto, texto, tipoError, ['GET']);
}


export async function ResponderSoloGetYPostPermitidos(contexto: Contexto, tipoError: TipoError = TipoError.Api): Promise<Response> {
	const { texto } = await ObtenerTextoEnIdioma(contexto, 'respuesta-solo-get-post-permitido', contexto.Idioma);
	return ResponderMétodoNoPermitido(contexto, texto, tipoError, ['GET', 'POST']);
}


export async function ResponderErrorJson(contexto: Contexto, mensajeError: string, 
	estado: EstadoError = EstadoError.SolicitudInválida): Promise<Response> {
	return Responder(contexto, JSON.stringify({ Mensaje: `{{error-api-prefijo}}${mensajeError}` }), TipoRespuesta.Json, estado);
}


export async function VerificarAplicarIdiomaYCanonicalARespuestaHtml(contexto: Contexto, respuestaBase: Response)
	: Promise<Response> {

	const respuestaConIdioma = IdiomasSoportados.length > 1 || ActivarTraducciónHtml
		? await AplicarIdiomaYCanonicalARespuestaHtml(contexto, respuestaBase)
		: await ActualizarOCrearEtiquetasSeo(contexto, respuestaBase);
	return EstablecerAtributoTema(contexto, new HTMLRewriter()).transform(respuestaConIdioma); // El tema va aparte del idioma, porque un sitio de un solo idioma y sin traducción también lo tiene.

}


function TransformarHtmlConCookies(contexto: Contexto, respuestaBase: Response, transformadorHtml: HTMLRewriter): Response {
	const respuestaTransformada = transformadorHtml.transform(respuestaBase); // Shell estable mas fragmentos insertados por selector.
	return AdjuntarCookiesSeguro(contexto, respuestaTransformada);
}


async function ObtenerContenidoError(contexto: Contexto, tipoRespuesta: TipoRespuesta, mensajeAlUsuario: string, tipoError?: TipoError,
	permitirHtml: boolean = false): Promise<string> {

	switch (tipoRespuesta) {

		case TipoRespuesta.Json:
			return JSON.stringify({ Mensaje: `{{error-api-prefijo}}${mensajeAlUsuario}` });
		case TipoRespuesta.Html: {

			const mensajeFinal = permitirHtml ? mensajeAlUsuario : Sanear(mensajeAlUsuario);
			if (tipoError === TipoError.PáginaPropia) {
				return mensajeFinal; // Otra plantilla alrededor dejaría un panel dentro de otro, con dos títulos.
			} else if (tipoError === TipoError.Autenticación) {

				const htmlAutenticación = await CargarHtmlLocal(contexto, HtmlErrorAutenticaciónCompilado,
					'/html/nucleo/error-autenticacion.html');
				return htmlAutenticación.replace('{{mensaje-error-usuario}}', mensajeFinal);

			} else if (tipoError === TipoError.EnlaceMágico) {

				const htmlEnlaceMágico = await CargarHtmlLocal(contexto, HtmlErrorEnlaceMágicoCompilado,
					'/html/nucleo/error-enlace-magico.html');
				return htmlEnlaceMágico.replace('{{mensaje-error-usuario}}', mensajeFinal);

			} else {
				const htmlErrorApi = await CargarHtmlLocal(contexto, HtmlErrorApiCompilado, '/html/nucleo/error-api.html');
				return htmlErrorApi.replace('{{mensaje-error-usuario}}', mensajeFinal); // Se sanea solo porque es fácil en este caso que debe ser solo un valor. De todas maneras en el resto del sitio sigue existiendo riesgo de HTML no sanitizado porque no se pueden escapar los fragmentos HTML que vienen del servidor porque rompería el funcionamiento de HTMX.
			}

		}
		case TipoRespuesta.Texto:
			return `{{error-api-prefijo}}${mensajeAlUsuario}`;
		default:
			throw new Error(`Tipo de contenido no soportado: ${String(tipoRespuesta)}`);

	}

}


async function ResolverContenidoRespuesta(contexto: Contexto, contenido: string, estado: number, tipoRespuesta: TipoRespuesta,
	detallesError?: DetallesError): Promise<{ contenidoRespuesta: string; hayError: boolean; }> {

	let contenidoRespuesta = contenido;
	const hayError = estado < 200 || estado >= 300;

	if (hayError) {

		const mensajeAlUsuario
			= detallesError?.MensajeAUsuario?.trim() ? detallesError.MensajeAUsuario : '{{error-api-mensaje-servidor-no-respondió}}';
		let detalleErrorCompleto: string;

		if (contexto.Local) { // No se escribe el detalle del error de validación en producción para no exponer posibles datos de los usuarios en el registro de errores de CloudFlare.

			const erroresValidación = detallesError?.ErroresValidación;
			detalleErrorCompleto = erroresValidación !== undefined
				? `Mensaje al usuario: ${mensajeAlUsuario}\nErrores de validación: ${JSON.stringify(erroresValidación, null, 2)}`
				: `Mensaje al usuario: ${mensajeAlUsuario}`;

		} else {
			detalleErrorCompleto = `Mensaje al usuario: ${mensajeAlUsuario}`;
		}
		console.error(`Error detectado: ${estado}. ${detalleErrorCompleto}`);
		contenidoRespuesta = await ObtenerContenidoError(contexto, tipoRespuesta, mensajeAlUsuario, detallesError?.TipoError,
			detallesError?.PermitirHtml);

	}

	return { contenidoRespuesta, hayError };

}


export function AgregarCookiesACabeceras(cabeceras: Headers, cookies: string[] | null): void {

	if (cookies?.length) {

		for (const cookie of cookies) {
			cabeceras.append('Set-Cookie', cookie);
		}

	}

}


function AdjuntarCookiesSeguro(contexto: Contexto, respuestaOriginal: Response): Response {

	if (!contexto.CookiesRespuesta.length) return respuestaOriginal;

	const nuevosEncabezados = new Headers(respuestaOriginal.headers);
	AgregarCookiesACabeceras(nuevosEncabezados, contexto.CookiesRespuesta);

	const respuestaFinal = new Response(respuestaOriginal.body, { // Al usar new Headers(respuestaOriginal.headers) y envolver el cuerpo original en un new Response, se asegura cero desperdicio de RAM (sin clonación el body) y se garantiza que el Worker nunca explote al intentar mutar una respuesta que viene de HTMLRewriter
		status: respuestaOriginal.status, statusText: respuestaOriginal.statusText, headers: nuevosEncabezados
	});

	return respuestaFinal;

}


export async function CargarHtmlLocal(contexto: Contexto, htmlCompilado: string, rutaEnStatic: string): Promise<string> { // Carga un HTML local de forma dinámica en desarrollo (para que se puedan modificar y actualizar con F5 en el navegador) o usa la versión compilada en producción.

	if (contexto.Local) {

		let error = false;
		try {

			const respuesta = await contexto.Entorno.RECURSOS.fetch(new Request(`https://assets.local${rutaEnStatic}`)); // El binding RECURSOS siempre resuelve contra la carpeta definida en wrangler.jsonc.
			if (respuesta.ok) {
				return await respuesta.text();
			} else {
				error = true;
			}

		} catch (e) {
			error = true;
		}

		if (error)
			console.warn(`No se pudo cargar ${rutaEnStatic} dinámicamente, así que se usa la versión en memoria. Recargar con F5 en el navegador no actualizará los fragmentos HTML.`);

	}

	return htmlCompilado;

}


export async function ObtenerHtmlMarco(contexto: Contexto): Promise<string> {
	return await CargarHtmlLocal(contexto, HtmlMarcoCompilado, '/html/marco.html');
}


export function CrearDetallesError(tipoError: TipoError, estado: EstadoError, selector: string, mensajeAUsuario: string,
	erroresValidación?: BaseIssue<unknown>[], permitirHtml: boolean = false): DetallesError {
	return { TipoError: tipoError, Estado: estado, SelectorUbicación: selector, MensajeAUsuario: mensajeAUsuario,
		ErroresValidación: erroresValidación, PermitirHtml: permitirHtml };
}


export async function ExigirAdministrador(contexto: Contexto): Promise<Response | null> {

	if (contexto.Autenticación?.Usuario?.Rol === 'Administrador') return null;
	return ResponderErrorConMarco(contexto, '{{admin-formularios-solo-administrador}}', TipoError.Autenticación, false, null,
		EstadoError.NoAutorizado);

}
