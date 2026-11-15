import { CorreoAdministrador, DominioProducción, IdiomasSoportados } from "../configuracion"; // Este módulo no debe tener ninguna importación desde otros módulos a excepción de configuracion.ts para las variables particulares del sitio. Sólo se agregan aquí funciones que sean usadas por dos o más módulos. Si se empiezan a agregar varias funciones globales que están relacionadas con el mismo tema, es preferible mover esas funciones a su propio módulo.
import { ConectorIA, Idioma, ProveedorIA, ServicioCorreo, FormatoProveedorIA, FormatoRespuestaCloudflare, EstiloRazonamiento, ModoEspecialOpenAI } from "./tipos";
export type { ConectorIA, Idioma, ProveedorIA, FormatoProveedorIA, FormatoRespuestaCloudflare, EstiloRazonamiento, ModoEspecialOpenAI }; // Como el archivo tipos.ts es solo un artificio para evitar ciclos entre nucleo/global.ts > configuracion.ts se reexportan los tipos en este archivo para que el consumidor de estos no tenga que buscarlos en tipos.ts si no directamente en global.
export { ServicioCorreo };


export interface Entorno {
	API_URL?: string;
	MODO_EJECUCION?: string; // En .dev.vars se establece con valor 'local' para forzar comportamiento de desarrollo.
	CORREO_ADMINISTRADOR_PRIVADO?: string; // Sobreescritura privada opcional para alertas, reenvíos y avisos internos. Se usa cuando no se quiere que el CorreoAdministrador escrito en el código aparezca en repositorios públicos.
	CLAVE_BLINDAJE_API: string; // Clave que el Worker inyecta en X-Clave-Blindaje-API para autenticarse con la API.
	COLA_ALERTAS_SUPERVISOR?: Queue<MensajeAlerta>; // Necesaria para el supervisor de servicios.
	RECURSOS: Fetcher; // Necesario para obtener los recursos (archivos html) en depuración y que se actualicen con F5 en el navegador y los textos de localización.
	ARCHIVOS_PUBLICOS: R2Bucket; // Bucket de R2 para archivos públicos del proyecto.
	ARCHIVOS_PRIVADOS: R2Bucket; // Bucket de R2 para archivos internos o sensibles del proyecto.
	CORREOS_RECIBIDOS: R2Bucket; // Bucket de R2 configurado como receptor de correos entrantes para el dominio, necesario para procesar correos relevantes como reportes DMARC o correos administrativos que se quieran procesar desde el Worker.
	BASE_DE_DATOS: D1Database; // Necesaria para la base de datos y para la autenticación.
	LIMITADOR_CORREO_ENLACE_MAGICO: RateLimit; // Necesario para el enlace mágico. Limitación por correo normalizado para solicitudes de enlace mágico.
	LIMITADOR_IP_ENLACE_MAGICO: RateLimit; // Necesario para el enlace mágico. Limitación por IP para solicitudes de enlace mágico.
	CLAVE_HMAC: string; // Necesario para el enlace mágico. Clave del servidor para generar HMAC de claves de limitación a partir de correo e IP, evitando almacenar correos o IPs en texto plano en los registros de Cloudflare.
	TOKEN_ENVIO_ENLACES: string; // Necesario para el envío de correos.
	ID_CLIENTE_GOOGLE: string; // Necesario para el botón de Google. Client ID de la aplicación registrada en Google Cloud Console.
	CLAVE_CLIENTE_GOOGLE: string; // Necesario para el botón de Google. Client Secret de la aplicación registrada en Google Cloud Console.
	CLAVE_IDENTIDAD_USUARIO_API: string; // Clave dedicada para firmar el JWT efímero de identidad delegada del usuario hacia la API.
	CLAVE_IDENTIDAD_USUARIO_CLIENTE: string; // Clave dedicada para firmar y verificar la cookie JWT de cliente usada exclusivamente en el Worker para autenticación criptográfica sin necesidad de consultar la base de datos.
	IA: Ai; // Cloudflare Workers AI para el proveedor Cloudflare. Solo se usa cuando el conector apunta a un modelo @cf/.
	CLAVE_OPENAI: string; // Clave de la API del proveedor OpenAI. Referenciada por nombre desde ProveedoresIA['open-ai'].clave.
	CLAVE_ANTHROPIC: string; // Clave de la API del proveedor Anthropic. Referenciada por nombre desde ProveedoresIA['anthropic'].clave.
	CLAVE_GOOGLE: string; // Clave de la API del proveedor Google Gemini. Referenciada por nombre desde ProveedoresIA['google'].clave.
	ID_PROYECTO_GOOGLE_CLOUD: string; // ID del proyecto de Google Cloud para servicios que requieren credenciales de cuenta de servicio.
	CORREO_CLIENTE_GOOGLE_CLOUD: string; // Correo del cliente de la cuenta de servicio de Google Cloud.
	CLAVE_GOOGLE_CLOUD: string; // Clave privada de la cuenta de servicio de Google Cloud. No se deben agregar comillas dobles al inicio y al final. Debe iniciar con: -----BEGIN PRIVATE y finalizar con: -----END PRIVATE KEY-----\n
	CLAVE_DEEPSEEK: string; // Clave de la API del proveedor DeepSeek. Referenciada por nombre desde ProveedoresIA['deepseek'].clave.
	CLAVE_PARASAIL: string; // Clave de la API del proveedor Parasail. Referenciada por nombre desde ProveedoresIA['parasail'].clave.
	CLAVE_NOVITA: string; // Clave de la API del proveedor Novita. Referenciada por nombre desde ProveedoresIA['novita'].clave.
	CLAVE_FIREWORKS: string; // Clave de la API del proveedor Fireworks. Referenciada por nombre desde ProveedoresIA['fireworks'].clave.
	CLAVE_INCEPTRON: string; // Clave de la API del proveedor Inceptron. Referenciada por nombre desde ProveedoresIA['inceptron'].clave.
	CLAVE_DEEPINFRA: string; // Clave de la API del proveedor DeepInfra. Referenciada por nombre desde ProveedoresIA['deepinfra'].clave.
	CLAVE_PARALLEL: string; // Clave de Parallel Search, usada exclusivamente por el proveedor externo de búsqueda web.
	CLAVE_TOGETHER: string; // Clave de la API de Together, usada por ProveedoresIA['together'] y ProveedoresTextoAVoz['together'].
}


export interface MensajeAlerta { // Necesario para alertas internas y para el supervisor de servicios.
	Origen: "polling" | "tail" | "aplicacion";
	Servicio: string;
	TipoEvento: string;
	Mensaje: string;
	Detalles?: string;
	FechaHora: string;
	IdSolicitud?: string; // Correlaciona la alerta con la traza completa de la petición.
}


export interface UsuarioAutenticado {
	IdUsuario: string;
	Rol: string;
	IdSesión: string;
	ColumnasExtra?: Record<string, unknown>;
}


export interface DetallesIdioma {
    Idioma: Idioma; // Ejemplo: 'es'. Idioma para traducir contenido, construir canonical y generar hreflang.
    TextosIdioma: Record<string, string>; // Ejemplo: { saludar: 'Hola' }. Diccionario cargado del idioma actual detectado para esta respuesta.
    TextosPredeterminados: Record<string, string>; // Ejemplo: { saludar: 'Hello' }. Diccionario base de respaldo para resolver claves que falten en el idioma actual.
    UrlOrigen: string; // Ejemplo: 'https://dominio.com'. Origen absoluto actual del sitio, usado para construir URLs SEO completas.
    RutaCanónicaSinPrefijo: string; // Ejemplo: '/saludar'. Ruta canónica sin prefijo de idioma, reutilizada para canonical y hreflang.
    RutaActualCodificada: string; // Ejemplo: '%2Fsaludar%3Fmodo%3Ddemo'. Ruta actual relativa con query codificada para reutilizarla en enlaces internos.
}


export interface Contexto {
	readonly Entorno: Entorno;
	Solicitud: Request; // Sin readonly, por si se necesita clonarla y reemplazarla.
	readonly Ejecución: ExecutionContext;
	readonly Url: URL;
	readonly Local: boolean; // Verdadero cuando la URL base efectiva apunta a localhost o 127.0.0.1.
	readonly TieneApi: boolean; // Verdadero cuando API_URL está configurada y el sitio debe comunicarse con una API de un servidor tradicional.
	readonly OrigenEsperado: string; // Origin base efectivo (protocolo + host + puerto). En sitios con API se usa para validar que las URLs construidas no desvíen a otro esquema o puerto.
	readonly DominioCookies: string; // Dominio compartido derivado desde la URL base efectiva quitando el prefijo 'api.' del hostname.
	readonly IdSolicitud: string;
	readonly Cliente: DatosCliente;
	readonly DatosSeo: DatosSeo | null; // Textos para SEO resueltos por ruta e idioma para poblar title, description e imagen social. En estos textos está pendiente reemplazar las sustituciones de variables de tipo [[marca]] con valores que vengan de la API o con lógica intermedia del Worker que se escriben en sustitucionesSeo.
	readonly SustitucionesSeo: Record<string, string>; // Se inicializa como vacío {}. Necesario para reemplazar con valores de la base de datos o del usuario, ya sea que vengan desde la API o desde el Worker usando variables (por ejemplo [[marca]]) que están definidas en los textos para las etiquetas SEO: título, descripción e imagen en MapaSeo. Al recibir las sustituciones de la API se le da prioridad a las sustituciones establecidas en el Worker.
	readonly Idioma: Idioma;
	CookiesRespuesta: string[]; // Lista mutable de salida para acumular cookies Set-Cookie que se adjuntarán al cliente al final del flujo.
	Autenticación: Autenticación | null; // Null aplica cuando no se ha hecho la autenticación.
	ModoAutenticaciónRequerido: ModoAutenticación | null; // Cada punto de consulta tiene un modo de autenticación requerido, definido en el enrutador. Aunque la autenticación ya se pasa completa en este mismo contexto, en algunos casos podría ser útil conocer cuál es el modo de autenticación requerido de ese punto de consulta y realizar acciones específicas. Null aplica para páginas públicas.
}

export type Manejador = (contexto: Contexto) => Promise<Response>;

export interface DatosSeo {
	Título: string;
	Descripción: string; // Es lo que aparece en el texto gris de los resultados de búsqueda.
	Imagen: string; // Una imagen de 1200x630px para compartir en redes sociales.
}

export interface DatosCliente { País: string | null; Ciudad: string | null; Robot: boolean; Tipo: TipoCliente; }

export enum TipoCliente { Móvil = 'Móvil', Escritorio = 'Escritorio' }

export type Autenticación = { Usuario: UsuarioAutenticado | null; ModoResuelto: ModoAutenticación; Mensaje: string; };

export enum ModoAutenticación { Cliente = 'Cliente', BaseDeDatos = 'BaseDeDatos' } // Valor estándar para amr. Controla la bifurcación entre el método de autenticación apoyado por cookie en el cliente (criptográfica en Edge) vs el método de autenticación que solo consulta en base de datos.

export const DominioYPuertoLocal = "127.0.0.1:3000"; // Necesario para probar los enlaces mágicos. Usar 127.0.0.1:8787 si no se está usando Browser Sync.

export const XIdioma = 'X-Idioma';

export const XIdSolicitud = 'X-Id-Solicitud';

export const XClaveIdentidadUsuario = 'X-Clave-Identidad-Usuario'; // Encabezado HTTP que transporta el JWT de identidad del usuario en el Worker a la API.

export const XClaveBlindajeApi = 'X-Clave-Blindaje-API'; // Encabezado HTTP que el Worker inyecta en cada petición a la API para autenticarse como origen autorizado.

export const MilisegundosRefrescoActividadUsuarioEnBD = 1 * 60 * 60 * 1000; // 1 hora en milisegundos. Si pasó más de este tiempo desde FechaHoraÚltimaActividad, se actualiza en D1 con ctx.waitUntil().

export const DíasRetenciónSesionesViejas = 90; // Días de gracia tras la muerte efectiva de una sesión antes de eliminarla físicamente. Aplica tanto a sesiones cerradas explícitamente como a sesiones abandonadas (que se suman a los 30 días de inactividad).

export const HorasRetenciónEnlacesMágicosViejos = 24; // Horas tras las cuales un enlace mágico no usado se considera basura y puede eliminarse. Mayor que la vigencia real de 10 minutos para absorber desfases de reloj.

export const NombreCookieSesión = 'sesion-token-opaco'; // Cookie de sesión tradicional con token opaco que se valida contra D1. La API la recibe para validar el estado de la sesión, pero no la consume directamente para autenticación porque el token opaco solo es útil para comparar su hash en la base de datos, no para extraer información de identidad o rol.

export const NombreCookieClienteJwt = 'sesion-jwt-cliente'; // Cookie JWT firmada que solo el Worker consume para validar sin consultar D1. La API nunca la recibe.

export const NombreCookieEstadoGoogle = 'google_auth_state'; // Cookie temporal del flujo OAuth de Google que transporta el estado HMAC anti-CSRF.

export const NombreCookieNonceGoogle = 'google_auth_nonce'; // Cookie temporal del flujo OAuth de Google que transporta el nonce anti-replay.

export const NombreCookieIdioma = 'idioma'; // Cookie de preferencia de idioma del usuario.

export const NombreCookieTema = 'tema'; // Cookie del tema alternativo. Si no existe, el sitio carga con el tema principal.


export const CookiesNoEnviadasAApi: readonly string[] = [
	NombreCookieClienteJwt, // JWT de cliente: exclusivo del Worker, la API no lo necesita ni debe recibirlo.
	NombreCookieEstadoGoogle, // Estado HMAC temporal del flujo OAuth de Google, no tiene significado fuera del Worker.
	NombreCookieNonceGoogle, // Nonce anti-replay temporal del flujo OAuth de Google, no tiene significado fuera del Worker.
]; // Se usa modelo de lista negra en lugar de lista blanca intencionalmente: el Worker y la API son ambos extremos controlados, blindados con CLAVE_BLINDAJE_API. Esto favorece transparencia en el flujo de cookies sin transformaciones implícitas. Si la API fuera pública o compartida, se debería migrar a lista blanca por defecto, iniciando con [NombreCookieSesión] y agregando explícitamente cada cookie adicional que la API deba recibir.


export function Sanear(textoPlano?: string): string { // Toma un texto plano y devuelve una versión segura para incluir en HTML, reemplazando carácteres especiales por sus entidades HTML correspondientes. Esto ayuda a prevenir ataques de Cross-Site Scripting (XSS) al asegurarse de que cualquier contenido dinámico insertado en la página no pueda ejecutar código malicioso. Sólo es para texto dentro de HTML/atributos simples. No usar dentro de <script>, <style> ni JSON embebido.

	if (!textoPlano) return '';
	return textoPlano.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;').replaceAll('`', '&#96;');

}


export function SanearUrl(url?: string): string { // Valida que la URL tenga un esquema seguro (http, https o relativa) antes de sanitizarla para evitar inyecciones de esquemas peligrosos como 'javascript:' o 'data:' en atributos href/src.

	if (!url) return '';
	const recortada = url.trim();
	if (recortada.startsWith('//')) return ''; // URLs protocol-relative como '//evil.com' se rechazan porque el navegador las interpreta como externas y pueden usarse para redirigir al usuario fuera del sitio.
	const esRelativa = recortada.startsWith('/') || recortada.startsWith('./') || recortada.startsWith('../') || recortada.startsWith('#') || recortada.startsWith('?');
	if (esRelativa) return Sanear(recortada);
	const esquemaSeguro = /^https?:\/\//i.test(recortada);
	if (!esquemaSeguro) return '';
	return Sanear(recortada);

}


export function ObtenerTipoContenidoDesdeExtensión(extensiónArchivo: string): string { // Convierte una extensión conocida a su MIME para servir archivos binarios sin repetir ternarios en cada ruta.

	let extensiónNormalizada = extensiónArchivo.trim().toLowerCase();
	if (!extensiónNormalizada.startsWith('.')) extensiónNormalizada = `.${extensiónNormalizada}`;
	switch (extensiónNormalizada) {

		case '.png':
			return 'image/png';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.gif':
			return 'image/gif';
		case '.webp':
			return 'image/webp';
		case '.svg':
			return 'image/svg+xml';
		case '.pdf':
			return 'application/pdf';
		case '.txt':
			return 'text/plain; charset=utf-8';
		default:
			return 'application/octet-stream';

	}

}


export function EsIdiomaSoportado(idioma: string): idioma is Idioma {
    return (IdiomasSoportados as readonly string[]).includes(idioma);
}


export function ObtenerIdiomaSolicitud(solicitud: Request, idiomaPredeterminado: Idioma): Idioma {

	const idiomaCabecera = solicitud.headers.get(XIdioma)?.toLowerCase();
	if (!idiomaCabecera) return idiomaPredeterminado;
	return EsIdiomaSoportado(idiomaCabecera) ? idiomaCabecera : idiomaPredeterminado;

}


export function RegistrarEventoConPrefijo(contexto: Contexto | null, prefijoEvento: string, nombreEvento: string, detalles?: string,
	metadatos?: Record<string, string | number | boolean | null | undefined>): void {

	const idSolicitud = contexto?.IdSolicitud ?? '';
	const cargaEvento = {
		Evento: prefijoEvento + nombreEvento, detalles: detalles ?? null,
		Metadatos: metadatos ?? {}, idSolicitud
	};
	console.log(JSON.stringify(cargaEvento));

}


export async function ObtenerIdentificadorUsuarioParaTerceros(autenticación: Autenticación | null): Promise<string | undefined> { // Genera un identificador opaco y no reversible para enviar a proveedores externos como OpenAI `safety_identifier`. Devuelve undefined si no hay usuario autenticado. No expone el UUID real del usuario.

	const idUsuario = autenticación?.Usuario?.IdUsuario;
	if (!idUsuario) return undefined;
	const datos = new TextEncoder().encode(idUsuario.trim().toLowerCase());
	const hash = await crypto.subtle.digest('SHA-256', datos);
	const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
	return `u_${hex.slice(0, 32)}`;

}


export function ObtenerOrigenSolicitud(contexto: Contexto): string { // Centraliza la extracción del origen del sitio para que el ajuste por modo local quede en un único lugar.
	if (contexto.Local) return `http://${DominioYPuertoLocal}`;
	else return `https://${DominioProducción}`;
}


export function ObtenerCorreoAdministrador(entorno: Entorno): string { // Permite usar un correo privado de operación sin guardarlo en el repositorio. Si no existe, usa el correo público configurado del proyecto.
	return entorno.CORREO_ADMINISTRADOR_PRIVADO?.trim() || CorreoAdministrador;
}


export function ExigirEnteroSeguro(valor: unknown, mensajeError: string = 'Solicitud inválida.'): number {
	if (typeof valor !== 'number' || !Number.isSafeInteger(valor)) throw new Error(mensajeError);
	return valor;
}


export function ExigirEnteroSeguroPositivo(valor: unknown, mensajeError: string = 'Solicitud inválida.'): number {
	if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0) throw new Error(mensajeError);
	return valor;
}


export function ExigirEnteroSeguroNoNegativo(valor: unknown, mensajeError: string = 'Solicitud inválida.'): number {
	if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor < 0) throw new Error(mensajeError);
	return valor;
}


export function ExigirNúmeroFinitoPositivo(valor: unknown, mensajeError: string = 'Solicitud inválida.'): number {

	const valorNúmero = typeof valor === 'string' ? Number(valor.trim()) : valor;
	if (typeof valorNúmero !== 'number' || !Number.isFinite(valorNúmero) || valorNúmero <= 0) throw new Error(mensajeError);
	return valorNúmero;

}


export function ExigirTextoNoVacío(valor: unknown, mensajeError: string = 'Solicitud inválida.'): string {
	if (typeof valor !== 'string' || valor.trim() === '') throw new Error(mensajeError);
	return valor.trim();
}


export function LeerEnteroPositivoFormulario(formulario: FormData, nombre: string, mensajeError: string): number {
	return ExigirEnteroSeguroPositivo(Number(ExigirTextoNoVacío(formulario.get(nombre), mensajeError)), mensajeError);
}


export function LeerNúmeroOpcional(formulario: FormData, nombre: string, mensajeError: string,
	validador: (valor: number, mensajeError: string) => number): number | null {

	const valor = formulario.get(nombre);
	if (typeof valor !== 'string' || valor.trim() === '') return null;
	return validador(Number(valor.trim()), mensajeError);

}


export function LeerEnteroPositivoOpcional(formulario: FormData, nombre: string, mensajeError: string): number | null {
	return LeerNúmeroOpcional(formulario, nombre, mensajeError, ExigirEnteroSeguroPositivo);
}


export function LeerEnteroSeguroNoNegativoOpcional(formulario: FormData, nombre: string, mensajeError: string): number | null {
	return LeerNúmeroOpcional(formulario, nombre, mensajeError, ExigirEnteroSeguroNoNegativo);
}


export function NormalizarTexto(texto: string): string { // Trim, minúsculas y colapsa espacios consecutivos en uno solo. Útil para claves canónicas, comparaciones insensibles a mayúsculas y normalización de entrada de usuario.
	return texto.trim().toLowerCase().replace(/\s+/g, ' ');
}


export function EsJsonObjeto(valor: string): boolean { // Reutilizable para validar cadenas JSON con forma de objeto antes de guardarlas o procesarlas.

	try {
		const json = JSON.parse(valor);
		return typeof json === 'object' && json !== null && !Array.isArray(json);
	} catch {
		return false;
	}

}


export function EsJsonArregloNoVacío(valor: string): boolean { // Reutilizable para validar cadenas JSON con forma de arreglo no vacío antes de guardarlas o procesarlas.

	try {
		const json = JSON.parse(valor);
		return Array.isArray(json) && json.length > 0;
	} catch {
		return false;
	}

}


export function ObtenerMensajeError(error: unknown, mensajeParaAdministrador: boolean = false): string {

	if (error instanceof Error) {
		if (mensajeParaAdministrador) return error.stack ?? error.message;
		return error.message;
	}

	if (typeof error === 'string') return error;

	try {
		const mensaje = JSON.stringify(error);
		return mensaje ?? String(error);
	} catch {
		return String(error);
	}

}


export function CodificarBase64UrlTexto(texto: string): string {
	return CodificarBase64UrlBytes(new TextEncoder().encode(texto));
}


export function CodificarBase64UrlBytes(datos: Uint8Array | ArrayBuffer): string {

	const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
	let binario = '';
	for (const byte of bytes) binario += String.fromCharCode(byte);
	return btoa(binario).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');

}


export function DecodificarBase64Url(base64Url: string): Uint8Array {

	const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
	const relleno = (4 - base64.length % 4) % 4;
	const binario = atob(base64 + '='.repeat(relleno));
	const bytes = new Uint8Array(binario.length);
	for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
	return bytes;

}


export function DecodificarBase64(base64: string): Uint8Array {

	const constructorBytes = Uint8Array as typeof Uint8Array & {
		fromBase64?: (texto: string, opciones?: { alphabet?: 'base64' | 'base64url'; }) => Uint8Array;
	};
	if (constructorBytes.fromBase64) return constructorBytes.fromBase64(base64); // Si el entorno soporta la función nativa, se usa directamente para mayor eficiencia. Esto aplica en entornos modernos como Cloudflare Workers y Deno.

	const textoBinario = atob(base64);
	const bytes = new Uint8Array(textoBinario.length);
	for (let i = 0; i < textoBinario.length; i++) bytes[i] = textoBinario.charCodeAt(i);
	return bytes;

}


export function NormalizarCorreo(correo: string): string {
	return correo.trim().replace(/^<|>$/g, '').toLowerCase();
}


export function EscaparExpresiónRegular(texto: string): string {
	return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


export function ListaContieneTexto(lista: readonly string[], texto: string): boolean {
	const textoNormalizado = texto.trim().toLowerCase();
	return lista.some(valor => valor.trim().toLowerCase() === textoNormalizado);
}


export function TextoContieneTodos(texto: string, textosBuscados: readonly string[]): boolean {
	const textoNormalizado = texto.toLowerCase();
	return textosBuscados.every(textoBuscado => textoNormalizado.includes(textoBuscado.toLowerCase()));
}


export function DecodificarContenidoCorreo(contenidoCorreo: string): string { // Se decodifica primero quoted-printable convirtiendo =XX en %XX, luego se pasa por decodeURIComponent. Si el contenido original contenía un % no escapado primero se convierte a quoted-printable.

	const contenidoTextoPlano = contenidoCorreo.match(/Content-Type:\s*text\/plain\b[\s\S]*?\r?\n\r?\n([\s\S]*?)(?:\r?\n--)/)?.[1] ?? contenidoCorreo; // El correo viene como multipart con texto plano y HTML, aquí se toma solo la parte text/plain porque es la que sirve para extraer datos y evita que el HTML, CSS, headers, firmas DKIM, imágenes y links rastreadores dañen la decodificación.

	const descodificado = contenidoTextoPlano.replace(/=\r?\n/g, "") // En quoted-printable, un '=' al final de línea no es un carácter real, solo indica que el correo partió una línea larga y que toca pegarla con la siguiente.
		.replace(/%/g, "%25") // Antes de usar decodeURIComponent se protegen los porcentajes que ya venían en el correo, para que textos como '100%' o links con '%20' no revienten el decodificador.
		.replace(/=([0-9A-Fa-f]{2})/g, "%$1"); // quoted-printable escribe bytes UTF-8 como '=C3=A1', y esta línea los convierte a '%C3%A1', que decodeURIComponent sí sabe convertir en carácteres normales como 'á'.

	try {
		return decodeURIComponent(descodificado).replace(/\s+/g, " ").trim(); // Aquí ya se convierte el texto quoted-printable a texto normal y se compactan espacios y saltos para que los regex encuentren frases completas sin pelear con el formato del correo.
	} catch {
		return contenidoTextoPlano.replace(/=\r?\n/g, "").replace(/\s+/g, " ").trim(); // Si aparece algún caso raro que decodeURIComponent no soporte, se devuelve al menos el texto plano con líneas pegadas y espacios normalizados, para no tumbar todo el procesamiento del correo.
	}

}


export function ObtenerFechaISO(fecha: Date): string { // Convierte una fecha en la representación UTC ISO AAAA-MM-DD, útil para comparar días sin depender de la zona horaria local.
	return fecha.toISOString().slice(0, 10);
}


export function EsFechaISOVálida(valor: string): boolean { // Comprueba que una cadena AAAA-MM-DD represente una fecha UTC real y no solo una secuencia con formato aparente.

	const coincidencia = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!coincidencia) return false;
	const año = Number(coincidencia[1]);
	const mes = Number(coincidencia[2]);
	const día = Number(coincidencia[3]);
	const fecha = new Date(Date.UTC(año, mes - 1, día));
	return fecha.getUTCFullYear() === año && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === día;

}


export function ValidarRutaInterna(urlRedirección: string): string | null { // Solo acepta rutas de este mismo sitio, para que un enlace no pueda redirigir a otro. Se resuelve con URL, igual que hace el navegador, porque él convierte /\otro-sitio en //otro-sitio y quita las tabulaciones y los saltos de línea, y mirar solo el texto no lo detecta.

	const baseFicticia = 'https://ruta-interna.invalid';
	if (!urlRedirección.startsWith('/') || !URL.canParse(urlRedirección, baseFicticia)) return null;
	return new URL(urlRedirección, baseFicticia).origin === baseFicticia ? urlRedirección : null;

}
