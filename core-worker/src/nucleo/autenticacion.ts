import { EnviarAlertaErrorCrítico } from './alertas';
import { type Contexto, MilisegundosRefrescoActividadUsuarioEnBD, ModoAutenticación, type Entorno, NombreCookieSesión,
	NombreCookieClienteJwt, DíasRetenciónSesionesViejas, Autenticación, DecodificarBase64Url, SanearUrl } from './global';
import { CrearCookieVencida, CrearCookieSesión, CrearCookieJwtCliente, ObtenerValorCookie,
	AgregarCookieRespuesta } from './cookies';
import { GenerarTokenAleatorio, ObtenerHashToken, FirmarJwt } from './tokenes';
import { OpcionesCookies, ObtenerHtml } from './api';
import { Responder, TipoRespuesta, ResponderConFragmentos, type InserciónFragmento, type DetallesError, CrearDetallesError,
	EstadoError, TipoError, ObtenerHtmlMarco, ResponderErrorConMarco, ResponderSoloPostPermitido, CargarHtmlLocal } from './respuestas';
import HtmlSesionCreadaCompilado from '../../static/html/nucleo/sesion-creada.html';
import { SegundosDuraciónAutenticaciónEnCliente, ActivarAutenticaciónEnCliente, SegundosMáximosInactividadSesión }
	from '../configuracion';


interface SesiónBD { IdSesión: string; IdUsuario: string; FechaHoraÚltimaActividad: string; }

interface UsuarioBD { IdUsuario: string; Rol: string; } // Contrato base de usuario leído desde la base de datos. Rol puede quedar sin poblar si la consulta no lo selecciona, siempre que no se acceda a él.

interface SesiónUsuarioBD extends SesiónBD, UsuarioBD { } // Unión de ambos para consultas que necesiten datos de sesión y usuario juntos, evitando hacer dos consultas separadas. Typscript permite que dos interfaces extendidas tengan la misma propiedad siempre que el tipo sea idéntico en ambas por eso no es problema repetir IdUsuario.

export type FunciónProtegida = (contexto: Contexto) => Promise<Response>;


export interface OpcionesConAutenticación {
	TipoRespuestaError?: TipoRespuesta.Html | TipoRespuesta.Json;
	ColumnasExtra?: readonly string[];
}


export interface ContenidoCookieCliente { // No cambiar los nombres de estas propiedades porque se usan para construir la cookie. Contenido mínimo que viaja dentro de la cookie JWT de cliente. Nunca sale del Worker hacia la API.
	sub: string; // IdUsuario.
	role: string; // Rol estático.
	sid: string; // IdSesión, para reconstruir IUsuarioAutenticado sin consultar D1.
	exp: number; // Unix seconds.
}

function AgregarCookiesAutenticación(contexto: Contexto, cookie: string | null, cookieCliente: string | null): void {
	if (cookie) AgregarCookieRespuesta(contexto, cookie, true);
	if (cookieCliente) AgregarCookieRespuesta(contexto, cookieCliente, true);
}


function CrearCookiesVencidas(contexto: Contexto): { cookie: string; cookieCliente: string; } {

	const cookie = CrearCookieVencida(contexto, NombreCookieSesión); // Elimina la cookie de sesión en el navegador como parte del protocolo de Limpieza Total.
	const cookieCliente = CrearCookieVencida(contexto, NombreCookieClienteJwt); // Elimina la cookie JWT de cliente del navegador como parte del protocolo de Limpieza Total.
	return { cookie, cookieCliente };

}


function CrearResultadoCerrandoSesión(contexto: Contexto, mensaje: string): Autenticación {

	const { cookie, cookieCliente } = CrearCookiesVencidas(contexto);
	AgregarCookiesAutenticación(contexto, cookie, cookieCliente);
	return { Usuario: null, ModoResuelto: ModoAutenticación.BaseDeDatos, Mensaje: mensaje };

}


export async function CrearSesión(contexto: Contexto, idUsuario: string): Promise<{ token: string; idSesión: string; }> { // Crea una nueva sesión en la base de datos para el usuario dado, generando un token aleatorio que se devuelve para enviar en la cookie junto al IdSesión asignado. El token se almacena solo como hash en la base de datos por seguridad y nunca se persiste ni se compara directamente.

	const token = await GenerarTokenAleatorio();
	const hashToken = await ObtenerHashToken(token);
	const ahora = new Date().toISOString();
	const idSesión = crypto.randomUUID();

    await contexto.Entorno.BASE_DE_DATOS.prepare(
		`INSERT INTO Sesiones (IdSesión, IdUsuario, HashTokenSesión, FechaHoraCreada, FechaHoraÚltimaActividad)
		 VALUES (?, ?, ?, ?, ?)`)
		.bind(idSesión, idUsuario, hashToken, ahora, ahora).run();

	return { token, idSesión }; // Se devuelve el token vivo para enviarlo en la cookie. Nunca se persiste el token vivo.

}


export async function AbrirSesiónEnContexto(contexto: Contexto, idUsuario: string, rol: string): Promise<{ idSesión: string; }> {

	const { token, idSesión } = await CrearSesión(contexto, idUsuario);
	const cookieSesión = CrearCookieSesión(contexto, token); // Establece la cookie de sesión con el token recién creado.
	let cookieCliente: string | null = null;

	if (ActivarAutenticaciónEnCliente) { // Al crear la sesión se emite también la cookie JWT de cliente para que esté disponible desde la primera solicitud.
		const jwtCliente = await EmitirCookieClienteJwt(idUsuario, rol, idSesión, contexto.Entorno.CLAVE_IDENTIDAD_USUARIO_CLIENTE);
		cookieCliente = CrearCookieJwtCliente(contexto, jwtCliente); // Emite la cookie JWT de cliente con la duración estándar.
	}

	AgregarCookiesAutenticación(contexto, cookieSesión, cookieCliente);
	return { idSesión };

}


export async function ObtenerAutenticación(contexto: Contexto, modoAutenticaciónRequerido:
	ModoAutenticación = ModoAutenticación.BaseDeDatos, opciones?: OpcionesConAutenticación): Promise<Autenticación> { // Bifurca entre validación criptográfica en Edge (Cliente) y validación de estado contra D1 (BaseDeDatos). Si el conmutador global está apagado, eleva automáticamente a BaseDeDatos.

	const baseDeDatos = contexto.Entorno.BASE_DE_DATOS;

	const nombresColumnasExtra = opciones?.ColumnasExtra ?? [];
	if (nombresColumnasExtra.length > 0 && modoAutenticaciónRequerido !== ModoAutenticación.BaseDeDatos)
		throw new Error('ObtenerAutenticación con columnas extra requiere ModoAutenticación.BaseDeDatos.');
	for (const columna of nombresColumnasExtra) {
		if (!EsNombreColumnaExtraVálido(columna)) throw new Error(`Columna extra no válida en autenticación: ${columna}`);
	}

	const modoRequeridoEfectivo = ActivarAutenticaciónEnCliente ? modoAutenticaciónRequerido : ModoAutenticación.BaseDeDatos; // Regla global: con ActivarAutenticaciónEnCliente = false, el modo Cliente queda deshabilitado y se fuerza consulta a la base de datos siempre.
	if (modoRequeridoEfectivo === ModoAutenticación.Cliente) { // Validación criptográfica pura sin consulta a la base de datos.

		const jwtCliente = ObtenerValorCookie(contexto, NombreCookieClienteJwt);
		if (jwtCliente) {

			const contenido = await ValidarCookieClienteJwt(jwtCliente, contexto.Entorno.CLAVE_IDENTIDAD_USUARIO_CLIENTE);
			if (contenido)
				return { Usuario: { IdUsuario: contenido.sub, Rol: contenido.role, IdSesión: contenido.sid },
					ModoResuelto: ModoAutenticación.Cliente, Mensaje: '' };

		}
		
	} // Si la cookie JWT de cliente falta o expiró, se cae al camino BaseDeDatos para rehidratar.

	const token = ObtenerValorCookie(contexto, NombreCookieSesión);
	if (!token) return { Usuario: null, ModoResuelto: ModoAutenticación.BaseDeDatos, Mensaje: '{{autenticación-mensaje-sin-sesión}}' };

	const hashToken = await ObtenerHashToken(token);
	const selecciónExtraSql = nombresColumnasExtra.length > 0 ? `, "${nombresColumnasExtra.join('", "')}"` : '';

	const sesiónYUsuarioActivos = await baseDeDatos.prepare(`SELECT s.IdSesión, s.IdUsuario, s.FechaHoraÚltimaActividad, u.Rol${selecciónExtraSql}
		FROM Sesiones s JOIN Usuarios u ON s.IdUsuario = u.IdUsuario
		WHERE s.HashTokenSesión = ? AND s.FechaHoraCerrada IS NULL AND u.Estado = 'Activo' LIMIT 1`)
		.bind(hashToken).first<SesiónUsuarioBD & Record<string, unknown>>();

	if (!sesiónYUsuarioActivos) return CrearResultadoCerrandoSesión(contexto, '{{autenticación-mensaje-sin-sesión}}'); // Fallo no técnico en base de datos: la sesión no existe o fue revocada. Se ejecuta Limpieza Total borrando token opaco y cookie JWT de cliente.
		
	const últimaActividad = new Date(sesiónYUsuarioActivos.FechaHoraÚltimaActividad).getTime();
	const ahora = Date.now();
	const inactividadMs = SegundosMáximosInactividadSesión * 1000;

	if (ahora - últimaActividad > inactividadMs) { // La sesión ya se venció por tiempo de inactividad.

        contexto.Ejecución.waitUntil(baseDeDatos.prepare(
			'UPDATE Sesiones SET FechaHoraCerrada = ?, MotivoCierre = ? WHERE IdSesión = ?')
			.bind(new Date().toISOString(), 'Inactividad', sesiónYUsuarioActivos.IdSesión).run()); // Se marca cerrada por inactividad en segundo plano para no bloquear la respuesta.

		return CrearResultadoCerrandoSesión(contexto, '{{autenticación-mensaje-sesión-expirada}}');

	} else { // La sesión está vigente.

		let cookieNueva: string | null = null;
		if (ahora - últimaActividad > MilisegundosRefrescoActividadUsuarioEnBD) {  // Se hace esta verificación para evitar escribir en la base de datos frecuentemente.

			cookieNueva = CrearCookieSesión(contexto, token); // Renueva la cookie de sesión con el mismo token para extender el tiempo de inactividad.
            contexto.Ejecución.waitUntil(baseDeDatos.prepare('UPDATE Sesiones SET FechaHoraÚltimaActividad = ? WHERE IdSesión = ?')
				.bind(new Date().toISOString(), sesiónYUsuarioActivos.IdSesión).run()); // Se refresca la actividad en segundo plano solo si superó el umbral.

		}

		let cookieClienteNueva: string | null = null;
		if (ActivarAutenticaciónEnCliente) { // Tras una resolución exitosa por BaseDeDatos se renueva la cookie de cliente (ventana criptográfica) para que próximas lecturas puedan evitar la consulta a la base de datos.

			const jwtCliente = await EmitirCookieClienteJwt(sesiónYUsuarioActivos.IdUsuario, sesiónYUsuarioActivos.Rol,
				sesiónYUsuarioActivos.IdSesión, contexto.Entorno.CLAVE_IDENTIDAD_USUARIO_CLIENTE);
			cookieClienteNueva = CrearCookieJwtCliente(contexto, jwtCliente); // Renueva la cookie JWT de cliente con la duración estándar.

		}

		AgregarCookiesAutenticación(contexto, cookieNueva, cookieClienteNueva);

		const { IdSesión: idSesión, IdUsuario: idUsuario, Rol: rol, FechaHoraÚltimaActividad: fechaHoraÚltimaActividad, ...columnasExtra } = sesiónYUsuarioActivos;
		return { Usuario: { IdUsuario: String(idUsuario), Rol: String(rol), IdSesión: String(idSesión),
			ColumnasExtra: Object.keys(columnasExtra).length > 0 ? columnasExtra : undefined },
			ModoResuelto: ModoAutenticación.BaseDeDatos, Mensaje: '' };

	}

}


function EsNombreColumnaExtraVálido(columna: string): boolean {
	return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_]+$/.test(columna);
}


export async function CerrarSesiónActual(contexto: Contexto): Promise<void> { // Cierra la sesión actual y ejecuta Salida Manual: borra token opaco y cookie JWT de cliente en el navegador.

	const token = ObtenerValorCookie(contexto, NombreCookieSesión);
	const cookiesLimpieza = CrearCookiesVencidas(contexto); // Elimina la cookie de sesión y JWT de cliente en el navegador como parte de la Salida Manual.
	AgregarCookiesAutenticación(contexto, cookiesLimpieza.cookie, cookiesLimpieza.cookieCliente);
	if (!token) return;

	const hashToken = await ObtenerHashToken(token);

    await contexto.Entorno.BASE_DE_DATOS.prepare(
		'UPDATE Sesiones SET FechaHoraCerrada = ?, MotivoCierre = ? WHERE HashTokenSesión = ? AND FechaHoraCerrada IS NULL')
		.bind(new Date().toISOString(), 'Salió', hashToken).run(); // Se cierra solo la sesión actual identificada por el hash del token de la cookie.

}


export async function ResponderAutenticado(contexto: Contexto, html: string): Promise<Response> { // Centraliza el patrón de respuesta para rutas protegidas: adjunta siempre la cookie (de limpieza o de renovación) sin que cada ruta tenga que recordarlo.

	if (!contexto.Autenticación) throw new Error('ResponderAutenticado requiere contexto.autenticación resuelta.');

	if (contexto.Autenticación.Usuario) {
        return Responder(contexto, html, TipoRespuesta.Html, 200);
	} else {
		return Responder(contexto, '', TipoRespuesta.Html, EstadoError.NoAutorizado,
            CrearDetallesError(TipoError.Autenticación, EstadoError.NoAutorizado, '', contexto.Autenticación.Mensaje));
	}

}


export async function ResponderConFragmentosAutenticado(contexto: Contexto, htmlMarco: string, selectorError: string,
	inserciones: InserciónFragmento[], transformaciónAdicional?: (transformadorHtml: HTMLRewriter) => HTMLRewriter,
	detallesError?: DetallesError)
	: Promise<Response> { // Variante de ResponderAutenticado para rutas protegidas con marco HTML e inserciones de fragmentos. Si no hay usuario inserta el mensaje de acceso denegado en selectorError dentro del marco, preservando el layout.

	if (!contexto.Autenticación) throw new Error('ResponderConFragmentosAutenticado requiere contexto.autenticación resuelta.');

	if (contexto.Autenticación.Usuario) {
		return ResponderConFragmentos(contexto, htmlMarco, inserciones, transformaciónAdicional, detallesError);
	} else {
		return ResponderConFragmentos(contexto, htmlMarco, [], undefined,
			CrearDetallesError(TipoError.Autenticación, EstadoError.NoAutorizado, selectorError, contexto.Autenticación.Mensaje));
	}

}


export async function ResponderConMarcoAutenticado(contexto: Contexto, htmlContenido: string,
	transformaciónAdicional?: (transformadorHtml: HTMLRewriter) => HTMLRewriter, detallesError?: DetallesError,
	selectorContenidoYError: string = '#contenido'): Promise<Response> {

	if (!contexto.Autenticación) throw new Error('ResponderConMarcoAutenticado requiere contexto.autenticación resuelta.');

	const htmlMarco = await ObtenerHtmlMarco(contexto);
	
	return ResponderConFragmentosAutenticado(contexto, htmlMarco, selectorContenidoYError,
		[{ Selector: selectorContenidoYError, Contenido: htmlContenido, ComoHtml: true }], transformaciónAdicional, detallesError);

}


/**
* Función simple para los casos en los que el Worker simplemente pasa derecho la respuesta de la API al cliente.
* Requiere que contexto.autenticación ya venga resuelta desde ConAutenticación.
*/
export async function ObtenerHtmlYResponderConMarcoAutenticado(contexto: Contexto, ruta: string, parámetros?: Record<string, string>,
	opcionesCookies?: OpcionesCookies, transformaciónAdicional?: (transformadorHtml: HTMLRewriter) => HTMLRewriter,
	selectorContenidoYError: string = '#contenido'): Promise<Response> {

	if (!contexto.Autenticación) throw new Error('ObtenerHtmlYResponderConMarcoAutenticado requiere contexto.autenticación resuelta.');

	const [respuesta, htmlMarco] = await Promise.all([ObtenerHtml(contexto, ruta, parámetros, opcionesCookies),
		ObtenerHtmlMarco(contexto)]); // Disparo paralelo: la llamada a la API y la carga del marco corren al mismo tiempo.
	const contenido = respuesta.Éxito ? [{ Selector: selectorContenidoYError, Contenido: respuesta.Html, ComoHtml: true }] : [];
	const detallesError = !respuesta.Éxito
		? CrearDetallesError(TipoError.Api, respuesta.Estado as EstadoError, selectorContenidoYError, respuesta.Html, undefined, true)
		: undefined;

	return ResponderConFragmentosAutenticado(contexto, htmlMarco, selectorContenidoYError, contenido, transformaciónAdicional,
		detallesError);

}


/**
* Función simple para los casos de uso desde HTMX en los que el Worker simplemente pasa derecho la respuesta autenticada
de la API al cliente. Requiere que contexto.autenticación ya venga resuelta desde ConAutenticación.
*/
export async function ObtenerHtmlYResponderHtmxAutenticado(contexto: Contexto, ruta: string, parámetros?: Record<string, string>,
	opcionesCookies?: OpcionesCookies): Promise<Response> {

	if (!contexto.Autenticación) throw new Error('ObtenerHtmlYResponderHtmxAutenticado requiere contexto.autenticación resuelta.');

	const respuesta = await ObtenerHtml(contexto, ruta, parámetros, opcionesCookies);
	return ResponderAutenticado(contexto, respuesta.Html);

}


async function CrearSesiónUsuario(contexto: Contexto, idUsuario: string, rol: string, htmlMarco: string, selectorContenido: string,
	selectorError: string, rutaRedirecciónTrasIngreso: string): Promise<Response> {

	try {

		await AbrirSesiónEnContexto(contexto, idUsuario, rol);

        if (rol === 'Administrador')
			EnviarAlertaErrorCrítico(contexto, 'Ingreso de administrador', `El administrador ${idUsuario} inició sesión.`); // Alerta de seguridad: cualquier ingreso de administrador debe generar una alerta.

		const htmlSesiónCreada = (await CargarHtmlLocal(contexto, HtmlSesionCreadaCompilado, '/html/nucleo/sesion-creada.html'))
			.replaceAll('[[ruta-redireccion-tras-ingreso]]', SanearUrl(rutaRedirecciónTrasIngreso));

		return ResponderConFragmentos(contexto, htmlMarco, [{
				Selector: selectorContenido,
				Contenido: htmlSesiónCreada,
				ComoHtml: true
            }]);

	} catch {
		return ResponderErrorConMarco(contexto, '{{autenticación-sesión-error-crear}}', TipoError.Autenticación, false, htmlMarco,
			EstadoError.ErrorServidor, [], selectorError);
	}

}


export async function CrearSesiónUsuarioPorId(contexto: Contexto, idUsuario: string, htmlMarco: string,
	rutaRedirecciónTrasIngreso: string, selectorContenido: string = '#contenido',
	selectorError: string = '#contenido'): Promise<Response> {

	const usuario = await contexto.Entorno.BASE_DE_DATOS.prepare(
		"SELECT IdUsuario, Rol FROM Usuarios WHERE IdUsuario = ? AND Estado = 'Activo' LIMIT 1")
		.bind(idUsuario).first<UsuarioBD>(); // Para la función CrearSesiónUsuario() solo se necesita el ID usuario que se proporciona como parámetro en esta función, pero se requiere hacer esta consulta principalmente para verificar que el usuario se encuentre activo. Y además porque aunque se puede forzar que la base de datos D1 saque error al intentar crear una sesión con un ID de usuario no existente en la tabla de usuarios (con PRAGMA foreign_keys = ON), eso se consideraría un antipatrón.

	if (usuario) {
       return CrearSesiónUsuario(contexto, usuario.IdUsuario, usuario.Rol, htmlMarco, selectorContenido, selectorError,
			rutaRedirecciónTrasIngreso);
	} else {
       return ResponderErrorConMarco(contexto, '{{autenticación-sesión-usuario-no-encontrado}}', TipoError.Autenticación, false,
          htmlMarco, EstadoError.NoEncontrado, [], selectorError);
	}

}


export async function CrearSesiónUsuarioPorCorreo(contexto: Contexto, correo: string, htmlMarco: string,
	rutaRedirecciónTrasIngreso: string, selectorContenido: string = '#contenido',
	selectorError: string = '#contenido'): Promise<Response> {

	const usuario = await contexto.Entorno.BASE_DE_DATOS.prepare(
		"SELECT IdUsuario, Rol FROM Usuarios WHERE Correo = ? AND Estado = 'Activo' LIMIT 1")
		.bind(correo).first<UsuarioBD>();

	if (usuario) {
       return CrearSesiónUsuario(contexto, usuario.IdUsuario, usuario.Rol, htmlMarco, selectorContenido, selectorError,
			rutaRedirecciónTrasIngreso);
	} else {
       return ResponderErrorConMarco(contexto, '{{autenticación-sesión-usuario-no-encontrado}}', TipoError.Autenticación, false,
          htmlMarco, EstadoError.NoEncontrado, [], selectorError);
	}

}


/**
* Aunque en teoría se debería usar cuando el Worker debía realizar una acción soberana (como escribir en D1 o ejecutar lógica sensible) que requiera verificar que el usuario no ha sido bloqueado o ha cerrado todas sus sesiones antes de hacer cualquier acción. Se prefirió usar siempre para todas las páginas que requieren
autenticación porque esto permite centralizar la información de autenticación en enrutador.ts y no genera
mayores efectos negativos adicionales hacerlo con todas las rutas (incluyendo las que no tienen lógica
que se deba proteger en el Worker.
*/
export async function ConAutenticación(contexto: Contexto, modoRequerido: ModoAutenticación, funciónProtegida: FunciónProtegida,
	opciones: OpcionesConAutenticación = {}): Promise<Response> {

	contexto.ModoAutenticaciónRequerido = modoRequerido;
	const autenticación = await ObtenerAutenticación(contexto, modoRequerido, opciones);
	contexto.Autenticación = autenticación;
	const esInválido = !autenticación.Usuario ||
		(modoRequerido === ModoAutenticación.BaseDeDatos && autenticación.ModoResuelto === ModoAutenticación.Cliente); // Si no hay usuario o el modo resuelto es inferior al requerido.
	const mensajeEfectivo = (!autenticación.Usuario) ? autenticación.Mensaje : '{{error-sesión-no-encontrada-en-bd}}';
	if (esInválido) return ResponderErrorAutenticación(contexto, mensajeEfectivo, opciones);
	return funciónProtegida(contexto); // Solo si llega aquí, se ejecuta la lógica protegida con la autenticación ya validada y el nivel de modo garantizado.

}


function ResponderErrorAutenticación(contexto: Contexto, mensaje: string, opciones: OpcionesConAutenticación): Promise<Response> {

	if (opciones.TipoRespuestaError === TipoRespuesta.Json)
		return Responder(contexto, '', TipoRespuesta.Json, EstadoError.NoAutorizado,
			CrearDetallesError(TipoError.Autenticación, EstadoError.NoAutorizado, '', mensaje));

	return ResponderErrorConMarco(contexto, mensaje, TipoError.Autenticación);

}


export async function ResponderSalida(contexto: Contexto, htmlAlSalir: string): Promise<Response> {

	if (contexto.Solicitud.method === 'POST') {
		await CerrarSesiónActual(contexto); // Salida Manual: borra token opaco y cookie JWT de cliente en un solo paso.
		return Responder(contexto, htmlAlSalir, TipoRespuesta.Html);
	} else {
		return ResponderSoloPostPermitido(contexto);
	}

}


// #region JWT

export async function EmitirCookieClienteJwt(idUsuario: string, rol: string, idSesión: string, claveSecreta: string): Promise<string> { // Genera el JWT de la cookie de cliente usada exclusivamente dentro del Worker para validación criptográfica en Edge sin consultar D1.

	const ahora = Math.floor(Date.now() / 1000);
	const contenido: ContenidoCookieCliente = {
		sub: idUsuario, role: rol, sid: idSesión,
		exp: ahora + SegundosDuraciónAutenticaciónEnCliente
	};
	return await FirmarJwt(contenido, claveSecreta);

}


export async function ValidarCookieClienteJwt(jwt: string, claveSecreta: string): Promise<ContenidoCookieCliente | null> { // Valida la firma y expiración del JWT de la cookie de cliente. Devuelve el contenido si es válido y vigente, o null si no se puede usar para resolver la autenticación en modo Cliente.

	const partes = jwt.split('.');
	if (partes.length !== 3) return null;

	const contenidoSinFirma = `${partes[0]}.${partes[1]}`;
	const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(claveSecreta), { name: 'HMAC', hash: 'SHA-256' },
		false, ['verify']);

	let firmaRecibida: Uint8Array;
	try {
		firmaRecibida = DecodificarBase64Url(partes[2]);
	} catch {
		return null;
	}

	const firmaVálida = await crypto.subtle.verify('HMAC', clave, firmaRecibida as unknown as ArrayBuffer,
		new TextEncoder().encode(contenidoSinFirma)); // El cast a ArrayBuffer es necesario para esquivar el choque entre ArrayBufferLike y ArrayBuffer en las definiciones de Workers.
	if (!firmaVálida) return null;

	let contenido: ContenidoCookieCliente;
	try {
		contenido = JSON.parse(new TextDecoder().decode(DecodificarBase64Url(partes[1]))) as ContenidoCookieCliente;
	} catch {
		return null;
	}

	const ahora = Math.floor(Date.now() / 1000);
	if (!contenido.sub || !contenido.sid || !contenido.role || typeof contenido.role !== 'string'
		|| typeof contenido.exp !== 'number')
			return null;
	if (contenido.exp < ahora) return null; // Si la ventana criptográfica expiró, el Worker debe elevar a BaseDeDatos antes de confiar en la cookie.

	return contenido;

}

// #endregion


export async function LimpiarSesionesViejas(entorno: Entorno): Promise<void> { // Elimina sesiones antiguas en dos pasadas. Pensado para ejecutarse desde una tarea programada diaria, no desde el flujo de solicitud.

	await entorno.BASE_DE_DATOS.batch([

		entorno.BASE_DE_DATOS.prepare( // Sesiones cerradas explícitamente: se eliminan 90 días después del cierre.
			`DELETE FROM Sesiones WHERE FechaHoraCerrada IS NOT NULL
			AND FechaHoraCerrada < datetime('now', '-${DíasRetenciónSesionesViejas} days')`),

		entorno.BASE_DE_DATOS.prepare( // Sesiones abandonadas (nunca cerradas): se eliminan 90 días después de cumplir el umbral de inactividad de 30 días.
			`DELETE FROM Sesiones WHERE FechaHoraCerrada IS NULL
			AND FechaHoraÚltimaActividad < datetime('now',
			'-${SegundosMáximosInactividadSesión / (24 * 60 * 60) + DíasRetenciónSesionesViejas} days')`),

	]);

}
