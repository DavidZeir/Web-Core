import { type Contexto, XIdioma, XIdSolicitud, XClaveIdentidadUsuario, XClaveBlindajeApi,
	CookiesNoEnviadasAApi, Sanear } from './global';
import { AgregarCookiesRespuesta, AgregarSecureYDomainACookie } from './cookies';
import { EmitirJwtIdentidad } from './tokenes';
import { CrearDetallesError, EstadoError, ObtenerHtmlMarco, Responder, ResponderConFragmentos, TipoError, TipoRespuesta }
	from './respuestas';


interface OpcionesSolicitudApi {
	Ruta: string; // Ruta de la API a invocar. Ejemplo: /html/resultado.
	Método: MétodoSolicitudApi; // Verbo HTTP de la solicitud. Ejemplo: 'POST'.
	Parámetros?: Record<string, string>; // Query string opcional para GET. Ejemplo: { id: '42' }.
	CabecerasExtra?: HeadersInit; // Encabezados adicionales por llamada. Ejemplo: { 'X-Trace-Id': 'abc' }.
	Cuerpo?: BodyInit | null; // Cuerpo opcional de la solicitud. Ejemplo: JSON.stringify({ nombre: 'Ana' }).
	TipoContenido?: string; // Content-Type del cuerpo enviado. Ejemplo: 'application/json'.
	TipoAceptado: string; // Accept esperado por la API. Ejemplo: 'text/html'.
	TipoEsperado: string; // Tipo de respuesta que valida el Worker. Ejemplo: 'text/html'.
	OpcionesCookies?: OpcionesCookies; // Reglas de cookies para esta llamada. Ejemplo: { omitirCookies: true }.
}


export interface OpcionesCookies {
	ListaNegra?: string[] | null; // Nombres de cookies a excluir hacia la API, además de las de CookiesNoEnviadasAApi que siempre se excluyen.
	ListaBlanca?: string[] | null; // Nombres de cookies a incluir hacia la API.
	CookiesNoHttpOnly?: string[] | null; // Nombres de cookies exentas de la imposición de HttpOnly.
	CookiesSameSiteStrict?: string[] | null; // Nombres de cookies con SameSite=Strict.
	CookiesSameSiteNone?: string[] | null; // Nombres de cookies con SameSite=None.
	OmitirCookies?: boolean | null; // Permite omitir el envío de cookies hacia la API para rutas como /salud.
}


interface ResultadoHtml { Html: string; Estado: number; Éxito: boolean; } // Contrato de retorno HTML-first: nunca se lanza excepción, siempre se devuelve fragmento consumible.

interface ResultadoTexto { Texto: string; Estado: number; Éxito: boolean; }

interface ResultadoJson<T = unknown> { Json: T | null; Estado: number; Éxito: boolean; }

type MétodoSolicitudApi = 'GET' | 'POST';

type DatosFormulario = URLSearchParams | FormData | Record<string, string>;

const TiempoMáximoMs = 5000; // Valor de seguridad razonable para evitar que el Worker cuelgue esperando la API.


async function EnviarSolicitudApi(contexto: Contexto, opciones: OpcionesSolicitudApi)
	: Promise<{ cuerpo: string; estado: number; éxito: boolean; }> {

	const url = ConstruirUrl(contexto, opciones.Ruta, opciones.Parámetros);
	if (url === null) return { cuerpo: '{{error-api-mensaje-url-inválida}}', estado: 500, éxito: false };
	const omitirCookies = opciones.OpcionesCookies?.OmitirCookies ?? false;

	const controlador = new AbortController(); // AbortController permite cancelar el fetch nativo si supera el tiempo máximo.
	const idTiempoMáximo = setTimeout(() => controlador.abort(), TiempoMáximoMs);

	const cabeceras = new Headers(opciones.CabecerasExtra);
	cabeceras.set(XClaveBlindajeApi, contexto.Entorno.CLAVE_BLINDAJE_API); // Inyección automática del blindaje en cada petición, sin repetir lógica en cada ruta.

	if (contexto.Autenticación?.Usuario) { // Si contexto ya trae usuario autenticado, se delega su identidad a la API con un JWT efímero firmado con HMAC-SHA256.

		if (!contexto.Entorno.CLAVE_IDENTIDAD_USUARIO_API)
			throw Error('Falta configurar CLAVE_IDENTIDAD_USUARIO_API en las variables de entorno para habilitar la delegación de identidad a la API.');
		const jwt = await EmitirJwtIdentidad(contexto.Autenticación.Usuario.IdUsuario, contexto.Autenticación.Usuario.Rol,
			contexto.Entorno.CLAVE_IDENTIDAD_USUARIO_API, contexto.Autenticación.ModoResuelto);
		cabeceras.set(XClaveIdentidadUsuario, jwt);

	}

	cabeceras.set('Accept', opciones.TipoAceptado);
	cabeceras.set(XIdioma, contexto.Idioma); // Encabezado hacia API. Se propaga el idioma ya resuelto en contexto para que la API formatee fechas, monedas y cultura sin traducir texto.
	cabeceras.set(XIdSolicitud, contexto.IdSolicitud); // Correlación: se propaga el ID único al llegar a la API para trazabilidad completa.
	if (opciones.TipoContenido) cabeceras.set('Content-Type', opciones.TipoContenido);

	if (!omitirCookies) {

		const cookiesOriginales = contexto.Solicitud.headers.get('Cookie');
		if (cookiesOriginales) {

			const cookiesFiltradas = FiltrarCookies(cookiesOriginales, opciones.OpcionesCookies?.ListaNegra,
				opciones.OpcionesCookies?.ListaBlanca);
			if (cookiesFiltradas) cabeceras.set('Cookie', cookiesFiltradas);

		}

	}

	let respuesta: Response;

	try {

		const opcionesFetch: RequestInit = { method: opciones.Método, signal: controlador.signal, headers: cabeceras, redirect: 'manual' };
		if (opciones.Cuerpo !== undefined && opciones.Cuerpo !== null) opcionesFetch.body = opciones.Cuerpo;
		respuesta = await fetch(url, opcionesFetch);

	} catch (e) {
		return { cuerpo: '{{error-api-mensaje-no-disponible}}', estado: 503, éxito: false };
	} finally {
		clearTimeout(idTiempoMáximo);
	}

	for (const [nombreCabecera, valorCabecera] of respuesta.headers) {

		const nombreCabeceraNormalizado = nombreCabecera.toLowerCase();
		if (!nombreCabeceraNormalizado.startsWith('x-seo-')) continue;

		const claveSeo = nombreCabeceraNormalizado.slice('x-seo-'.length);
		if (!(claveSeo in contexto.SustitucionesSeo)) { // Solo se toma la primera ocurrencia de cada encabezado SEO para evitar inconsistencias. Si la clave SEO aún no existe en contexto.sustitucionesSeo, se toma el valor recibido desde la API. Si ya existía, se conserva el valor previo. Esto da prioridad a cualquier sustitución establecida antes por el Worker y también evita sobrescribir la primera ocurrencia recibida para una misma clave. Advertencia: 'X-SEO-*' es un canal de confianza implícita: cualquier clave SEO no establecida previamente por el Worker se adopta sin validación adicional. El riesgo es bajo porque la API está blindada con CLAVE_BLINDAJE_API, pero si la API fuera comprometida podría inyectar metadatos SEO arbitrarios.
			contexto.SustitucionesSeo[claveSeo] = valorCabecera;
		} else {
			console.error(`Encabezado SEO duplicado en la API o ya definido en el Worker: ${claveSeo}. Se ignora el valor: ${valorCabecera}`);
		}

	}

	if (respuesta.status >= 300 && respuesta.status < 400)
		return { cuerpo: '{{error-api-mensaje-redirección-no-permitida}}', estado: 502, éxito: false }; // El Worker no maneja redirecciones de la API. Si la API responde con un 3xx, se asume que es un error de configuración o de lógica en la API, porque el Worker siempre espera un 200 con el fragmento HTML, JSON o texto a consumir. Esto se hace por seguridad porque las redirecciones pueden ser un vector de ataque para enviar al usuario a un sitio malicioso si la API es comprometida o mal configurada, y porque el manejo de redirecciones en el contexto de un Worker que actúa como backend para un SPA puede ser complejo y propenso a errores.

	const cookiesCrudas = ObtenerSetCookies(respuesta);
	const cookiesRespuesta = cookiesCrudas.length > 0
		? ProcesarCookiesApi(contexto, cookiesCrudas, opciones.OpcionesCookies?.CookiesNoHttpOnly,
			opciones.OpcionesCookies?.CookiesSameSiteStrict, opciones.OpcionesCookies?.CookiesSameSiteNone)
		: [];

	AgregarCookies(contexto, cookiesRespuesta);

	if (respuesta.status === 401 || respuesta.status === 403 || respuesta.status === 412) {

		const detalleError = respuesta.headers.get('X-Debug-Error');
		const motivoSeguridad = detalleError ? detalleError : '';
		const cuerpoError = await respuesta.text();
		const mensajeExtra = detalleError ? ` (Motivo: ${motivoSeguridad})` : '';
		return {
			cuerpo: `{{error-api-mensaje-blindaje-denegado}} ${cuerpoError} ${mensajeExtra}`, estado: respuesta.status,
			éxito: false
		};

	}

	if (respuesta.status === 404) return { cuerpo: '{{error-api-mensaje-recurso-no-encontrado}}', estado: 404, éxito: false };

	if (respuesta.status >= 500) return { cuerpo: '{{error-api-mensaje-error-servidor}}', estado: respuesta.status, éxito: false };

	if (respuesta.status < 200 || respuesta.status >= 300) // Cualquier estado fuera de 2xx que no fue capturado arriba se trata como error de cliente no controlado.
		return { cuerpo: '{{error-api-mensaje-error-cliente}}', estado: respuesta.status, éxito: false };

	const tipoContenido = respuesta.headers.get('Content-Type') ?? ''; // Si la API omite el header se trata como formato desconocido.
	if (!tipoContenido.includes(opciones.TipoEsperado))
		return {
			cuerpo: `{{error-api-mensaje-formato-inesperado}} '${tipoContenido}'. Se esperaba ${opciones.TipoEsperado}.`,
			estado: 502, éxito: false
		};

	const cuerpo = await respuesta.text();
	return { cuerpo, estado: respuesta.status, éxito: true };

}


async function ObtenerFragmento(contexto: Contexto, ruta: string, parámetros: Record<string, string> | undefined, tipoAceptado: string,
	tipoEsperado: string, opcionesCookies?: OpcionesCookies): Promise<{ cuerpo: string; estado: number; éxito: boolean; }> {
	return EnviarSolicitudApi(contexto, { Ruta: ruta, Método: 'GET', Parámetros: parámetros, TipoAceptado: tipoAceptado,
	TipoEsperado: tipoEsperado, OpcionesCookies: opcionesCookies });
}


export async function ObtenerTexto(contexto: Contexto, ruta: string, parámetros?: Record<string, string>,
	opcionesCookies?: OpcionesCookies): Promise<ResultadoTexto> {

	const { cuerpo, estado, éxito }
		= await ObtenerFragmento(contexto, ruta, parámetros, 'text/plain', 'text/plain', opcionesCookies);
	return { Texto: cuerpo, Estado: estado, Éxito: éxito };

}


export async function ObtenerJson<T = unknown>(contexto: Contexto, ruta: string, parámetros?: Record<string, string>,
	opcionesCookies?: OpcionesCookies): Promise<ResultadoJson<T>> {

	const { cuerpo, estado, éxito }
		= await ObtenerFragmento(contexto, ruta, parámetros, 'application/json', 'application/json', opcionesCookies);
	if (!éxito) return { Json: null, Estado: estado, Éxito: false };

	try {
		const json = JSON.parse(cuerpo) as T;
		return { Json: json, Estado: estado, Éxito: true };
	} catch {
		return { Json: null, Estado: 502, Éxito: false };
	}

}


export async function ObtenerHtml(contexto: Contexto, ruta: string, parámetros?: Record<string, string>,
	opcionesCookies?: OpcionesCookies): Promise<ResultadoHtml> {

	const { cuerpo, estado, éxito }
		= await ObtenerFragmento(contexto, ruta, parámetros, 'text/html', 'text/html', opcionesCookies);
	if (!éxito) return ObtenerHtmlError(cuerpo, estado);
	return { Html: cuerpo, Estado: estado, Éxito: éxito };

}


export async function EnviarJsonYObtenerHtml<T = unknown>(contexto: Contexto, ruta: string, datos: T,
	opcionesCookies?: OpcionesCookies, cabecerasExtra?: HeadersInit): Promise<ResultadoHtml> {

	let cuerpoJson: string | undefined;
	const mensajeErrorSerialización = '{{error-api-mensaje-json-inválido}}';

	try {
		cuerpoJson = JSON.stringify(datos); // Se controla aquí el fallo de serialización para mantener el contrato HTML-first.
	} catch {
		return ObtenerHtmlError(mensajeErrorSerialización, 500);
	}

	if (typeof cuerpoJson !== 'string')	return ObtenerHtmlError(mensajeErrorSerialización, 500);

	const { cuerpo, estado, éxito } = await EnviarSolicitudApi(contexto, { Ruta: ruta, Método: 'POST',
		CabecerasExtra: cabecerasExtra, Cuerpo: cuerpoJson, TipoContenido: 'application/json', TipoAceptado: 'text/html',
		TipoEsperado: 'text/html', OpcionesCookies: opcionesCookies });

	if (!éxito) return ObtenerHtmlError(cuerpo, estado);
	return { Html: cuerpo, Estado: estado, Éxito: éxito };

}


export async function EnviarJsonYObtenerJson<TRespuesta = unknown, TDatos = unknown>(contexto: Contexto, ruta: string, datos: TDatos,
	opcionesCookies?: OpcionesCookies, cabecerasExtra?: HeadersInit): Promise<ResultadoJson<TRespuesta>> {

	let cuerpoJson: string | undefined;

	try {
		cuerpoJson = JSON.stringify(datos); // Se controla aquí la serializacion para no romper el flujo con excepciones crudas.
	} catch {
		return { Json: null, Estado: 500, Éxito: false };
	}

	if (typeof cuerpoJson !== 'string') return { Json: null, Estado: 500, Éxito: false };

	const { cuerpo, estado, éxito } = await EnviarSolicitudApi(contexto, { Ruta: ruta, Método: 'POST',
		CabecerasExtra: cabecerasExtra, Cuerpo: cuerpoJson, TipoContenido: 'application/json', TipoAceptado: 'application/json',
		TipoEsperado: 'application/json', OpcionesCookies: opcionesCookies });

	if (!éxito) return { Json: null, Estado: estado, Éxito: false };

	try {
		const json = JSON.parse(cuerpo) as TRespuesta;
		return { Json: json, Estado: estado, Éxito: true };
	} catch {
		return { Json: null, Estado: 502, Éxito: false };
	}

}


export async function EnviarFormularioYObtenerHtml(contexto: Contexto, ruta: string, datos: DatosFormulario,
	opcionesCookies?: OpcionesCookies, cabecerasExtra?: HeadersInit): Promise<ResultadoHtml> {

	let cuerpoFormulario: BodyInit | null = null;
	let tipoContenido: string | undefined;
	const mensajeErrorFormulario = '{{error-api-mensaje-formulario-inválido}}';

	try {

		if (datos instanceof URLSearchParams) {
			cuerpoFormulario = datos;
			tipoContenido = 'application/x-www-form-urlencoded;charset=UTF-8';
		} else if (datos instanceof FormData) {
			cuerpoFormulario = datos;
		} else if (EsObjetoPlanoDeTexto(datos)) {
			cuerpoFormulario = new URLSearchParams(datos);
			tipoContenido = 'application/x-www-form-urlencoded;charset=UTF-8';
		} else {
			return ObtenerHtmlError(mensajeErrorFormulario, 500);
		}

	} catch {
		return ObtenerHtmlError(mensajeErrorFormulario, 500);
	}

	if (cuerpoFormulario === null) return ObtenerHtmlError(mensajeErrorFormulario, 500);

	const { cuerpo, estado, éxito } = await EnviarSolicitudApi(contexto, { Ruta: ruta, Método: 'POST',
		CabecerasExtra: cabecerasExtra, Cuerpo: cuerpoFormulario, TipoContenido: tipoContenido, TipoAceptado: 'text/html',
		TipoEsperado: 'text/html', OpcionesCookies: opcionesCookies });

	if (!éxito) return ObtenerHtmlError(cuerpo, estado);
	return { Html: cuerpo, Estado: estado, Éxito: éxito };

}


function ConstruirUrl(contexto: Contexto, ruta: string, parámetros?: Record<string, string>): string | null {

	if (!contexto.TieneApi)
		throw new Error(`No se puede construir la URL de la API para '${ruta}' porque API_URL no está configurada.`);
	const apiUrl = contexto.Entorno.API_URL?.trim();
	if (!apiUrl) throw new Error(`No se puede construir la URL de la API para '${ruta}' porque API_URL está vacía.`);

	try {

		const url = new URL(ruta, apiUrl); // Construcción segura con URL nativa, sin concatenación manual de strings.
		if (url.origin !== contexto.OrigenEsperado) return null; // Rechaza cualquier URL cuyo protocolo, host o puerto difieran del origen registrado en el constructor. URL(path, base) resuelve rutas relativas contra API_URL, pero no impide que un path absoluto desvíe a otro esquema o puerto del mismo host. Comparar origin lo previene.

		if (parámetros) {
			const searchParams = new URLSearchParams(parámetros); // URLSearchParams maneja encoding automáticamente, sin concatenación frágil.
			url.search = searchParams.toString();
		}

		return url.toString();

	} catch {
		return null;
	}

}


function FiltrarCookies(cookiesOriginales: string, listaNegra?: string[] | null, listaBlanca?: string[] | null): string { // Aplica listas negra y blanca sobre el header Cookie crudo antes de relevarlo a la API.

	const cookies = cookiesOriginales.split(';').map(c => c.trim()).filter(c => c.length > 0);
	const listaNegraEfectiva = listaNegra?.length
		? [...CookiesNoEnviadasAApi, ...listaNegra]
		: CookiesNoEnviadasAApi;

	const cookiesFiltradas = cookies.filter(cookie => {

		const nombre = cookie.split('=')[0].trim();

		if (listaBlanca) {
			return listaBlanca.includes(nombre) && !listaNegraEfectiva.includes(nombre);
		} else {
			return !listaNegraEfectiva.includes(nombre);
		}

	});

	return cookiesFiltradas.join('; ');

}


function ObtenerSetCookies(respuesta: Response): string[] { // Extrae multiples Set-Cookie con fallbacks ordenados por seguridad. Nunca divide por coma: es ambigua en valores como 'Expires=Thu, 01 Jan...'.

	if (typeof respuesta.headers.getSetCookie === 'function') return respuesta.headers.getSetCookie(); // Opcion estandar: disponible en Cloudflare Workers y navegadores modernos.

	const headersExtendidos = respuesta.headers as unknown as { getAll?: (name: string) => string[]; };
	if (typeof headersExtendidos.getAll === 'function') return headersExtendidos.getAll('Set-Cookie'); // Disponible en algunos runtimes no estandar como Deno o versiones antiguas de Node/undici.

	const cookiesIteradas: string[] = [];

	for (const [nombre, valor] of respuesta.headers) {
		if (nombre.toLowerCase() === 'set-cookie') cookiesIteradas.push(valor); // Algunos runtimes exponen cada Set-Cookie como entrada separada al iterar los headers.
	}

	if (cookiesIteradas.length > 1) return cookiesIteradas; // Se usa 1 porque en algunos runtimes la iteración podría devolverte una sola entrada combinada de set-cookie.

	const headerCrudo = respuesta.headers.get('Set-Cookie');
	if (!headerCrudo) return [];
	console.warn('Set-Cookie: runtime limitado. Solo se expone un string combinado; no es posible separar multiples cookies de forma confiable porque las comas en Expires son ambiguas. Se trata como una sola cookie.'); // Caso limite: se devuelve el string completo sin parsear para no corromper datos.
	return [headerCrudo];

}


function ProcesarCookiesApi(contexto: Contexto, cookies: string[], cookiesNoHttpOnly?: string[] | null,
	cookiesSameSiteStrict?: string[] | null, cookiesSameSiteNone?: string[] | null): string[] { // Fuerza la politica de seguridad del Worker sobre cada Set-Cookie de la API, independientemente de lo que la API haya enviado.

	return cookies.map(cookie => {

		const nombreCookie = cookie.split('=')[0].trim();
		const cookieLimpia = cookie.replace(/;\s*HttpOnly/gi, '').replace(/;\s*Secure/gi, '').replace(/;\s*SameSite=[^;]*/gi, '')
			.replace(/;\s*Domain=[^;]*/gi, '');
		const partes = [cookieLimpia];

		const esHttpOnly = !cookiesNoHttpOnly?.includes(nombreCookie);
		if (esHttpOnly) partes.push('HttpOnly');

		if (cookiesSameSiteStrict?.includes(nombreCookie)) {
			partes.push('SameSite=Strict');
		} else if (cookiesSameSiteNone?.includes(nombreCookie)) {
			partes.push('SameSite=None');
		} else {
			partes.push('SameSite=Lax');
		}

		AgregarSecureYDomainACookie(contexto, partes); // Se aplica una sola vez la política de Secure + Domain para que coincida con el resto del Worker.
		return partes.join('; ');

	});

}


export async function ObtenerHtmlYResponderHtmx(contexto: Contexto, ruta: string, parámetros?: Record<string, string>,
	opcionesCookies?: OpcionesCookies): Promise<Response> { // Función simple para los casos de uso con HTMX en los que el Worker simplemente pasa derecho la respuesta de la API al cliente. Aplicable para funciones que no requieren autenticación. Se responde siempre con HTML renderizable porque este flujo está pensado para HTMX y reemplazo de fragmentos: un error en el bloque parcial no debe tratarse necesariamente como fallo total de la página.
	const respuesta = await ObtenerHtml(contexto, ruta, parámetros, opcionesCookies);
	return Responder(contexto, respuesta.Html, TipoRespuesta.Html);
}


export async function ObtenerHtmlYResponderConMarco(contexto: Contexto, ruta: string, parámetros?: Record<string, string>,
	opcionesCookies?: OpcionesCookies, transformaciónAdicional?: (transformadorHtml: HTMLRewriter) => HTMLRewriter,
	selectorContenido: string = '#contenido'): Promise<Response> { // Función simple para los casos de uso en los que el Worker simplemente pasa derecho la respuesta de la API al cliente. Aplicable para funciones que no requieren autenticación.

	const [respuesta, htmlMarco] = await Promise.all([ObtenerHtml(contexto, ruta, parámetros, opcionesCookies),
	ObtenerHtmlMarco(contexto)]);
	const contenido = respuesta.Éxito ? [{ Selector: selectorContenido, Contenido: respuesta.Html, ComoHtml: true }] : [];
	const detallesError = !respuesta.Éxito
		? CrearDetallesError(TipoError.Api, respuesta.Estado as EstadoError, selectorContenido, respuesta.Html, undefined, true)
		: undefined;
	return ResponderConFragmentos(contexto, htmlMarco, contenido, transformaciónAdicional, detallesError);

}


function EsObjetoPlanoDeTexto(valor: unknown): valor is Record<string, string> {

	if (valor === null || typeof valor !== 'object') return false;
	const prototipo = Object.getPrototypeOf(valor);
	if (prototipo !== Object.prototype && prototipo !== null) return false;
	return Object.values(valor).every(v => typeof v === 'string');

}


function ObtenerHtmlError(mensaje: string, código: number): ResultadoHtml { // Centraliza la UI de error: los errores de red o API nunca se filtran como excepciones al manejador.
	const html = `<div class="api-error" data-codigo="${código}"><strong>{{error-api-titulo}} ${código}:</strong> ${Sanear(mensaje)}</div>`;
	return { Html: html, Estado: código, Éxito: false };
}


function AgregarCookies(contexto: Contexto, cookies: string[] | null): void {
	if (cookies?.length) AgregarCookiesRespuesta(contexto, cookies);
}


export async function ResponderSalud(contexto: Contexto): Promise<Response> {

	if (contexto.TieneApi) {

		const resultado = await ObtenerTexto(contexto, '/salud', undefined, { OmitirCookies: true });
		if (resultado.Éxito) {
			return new Response('ok', { status: resultado.Estado });
		} else {
			return new Response(resultado.Texto, { status: resultado.Estado });
		}

	} else {
		return new Response('ok', { status: 200 });
	}

}
