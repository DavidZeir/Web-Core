import { EnviarAlertaErrorCrítico } from './alertas';
import { type Contexto, ObtenerOrigenSolicitud, ModoAutenticación, 
	RegistrarEventoConPrefijo, NombreCookieEstadoGoogle, NombreCookieNonceGoogle, DecodificarBase64Url } from './global';
import { RutaTrasEntrar } from '../configuracion';
import { ObtenerAutenticación, AbrirSesiónEnContexto, CerrarSesiónActual } from './autenticacion';
import { ObtenerValorCookie, CrearCookie, AgregarCookiesRespuesta } from './cookies';
import { GenerarTokenAleatorio, ObtenerHmac } from './tokenes';
import { NotificarUsuarioCreado } from './eventos';
import { EstadoError, ResponderErrorConMarco, ResponderRedirección, ResponderSoloGetPermitido,
	TipoError } from './respuestas';


interface UsuarioBD { IdUsuario: string; Rol: string; Estado: string; }

interface IdentidadBD { IdIdentidad: string; IdUsuario: string; Correo: string; }

export interface ResultadoEntradaGoogle {
	Resultado: ResultadoGoogle;
	Error?: string;
	UrlRedirección?: string;
	IdUsuario?: string;
}

export enum ResultadoGoogle {
	Redirigido, SesiónCreada, YaAutenticado, UsuarioNoActivo, EstadoInválido, CorreoNoVerificado, ErrorIntercambioToken,
	ErrorSesión, MétodoNoPermitido, CorreoEnOtroUsuario
}

const MilisegundosEsperaGoogle = 10000; // Tiempo máximo de espera para llamadas externas a Google. Si Google tarda más, se aborta y se trata como error de red para no dejar la petición colgada.


async function FetchConTimeout(url: string, opciones: RequestInit, fetchImpl: typeof fetch = fetch): Promise<Response> {

	const controlador = new AbortController();
	const idTiempoMáximo = setTimeout(() => controlador.abort(), MilisegundosEsperaGoogle);

	try {
		return await fetchImpl(url, { ...opciones, signal: controlador.signal });
	} finally {
		clearTimeout(idTiempoMáximo);
	}

}


function RegistrarEventoGoogle(contexto: Contexto, nombreEvento: string, detalles?: string,
	metadatos?: Record<string, string | number | boolean | null | undefined>): void {
	RegistrarEventoConPrefijo(contexto, 'BotónGoogle.', nombreEvento, detalles, metadatos);
}


export async function IniciarEntradaConGoogle(contexto: Contexto): Promise<ResultadoEntradaGoogle> { // Genera la URL de autorización de Google con estado HMAC anti-CSRF y redirige al usuario a la pantalla de consentimiento de Google.

	if (contexto.Solicitud.method !== 'GET') return { Resultado: ResultadoGoogle.MétodoNoPermitido };

    const tiquete = await GenerarTokenAleatorio(); // Valor aleatorio que actúa como ticket para el state. Se firma con HMAC y se envía tanto en cookie como en el parámetro state a Google.
    const sello = await ObtenerHmac(tiquete, contexto.Entorno.CLAVE_HMAC); // El sello HMAC del ticket se usa para verificar autenticidad al regresar de la respuesta sin consultar la base de datos.
    const valorEstado = `${tiquete}.${sello}`;
	const cookieEstado = CrearCookie(contexto, NombreCookieEstadoGoogle, valorEstado, 600); // Cookie temporal para transportar el estado HMAC durante el flujo OAuth. Max-Age de 10 minutos porque el flujo de Google no debería durar más.
	const nonce = await GenerarTokenAleatorio(); // Valor aleatorio de un solo uso para prevenir replay attacks. Se envía a Google y se verifica en la propiedad nonce del id_token al regresar.
	const cookieNonce = CrearCookie(contexto, NombreCookieNonceGoogle, nonce, 600); // Cookie temporal para transportar el nonce anti-replay durante el flujo OAuth. Mismo TTL que la cookie de estado.

	const origen = ObtenerOrigenSolicitud(contexto);
	const urlRedirección = `${origen}/entrar-con-google/entrando`;

	const parámetros = new URLSearchParams({
		client_id: contexto.Entorno.ID_CLIENTE_GOOGLE, redirect_uri: urlRedirección, response_type: 'code', scope: 'openid email',
		state: valorEstado, nonce, prompt: 'select_account'
	});

	const urlAutorización = `https://accounts.google.com/o/oauth2/v2/auth?${parámetros.toString()}`;
	AgregarCookiesRespuesta(contexto, [cookieEstado, cookieNonce], true);

    return { Resultado: ResultadoGoogle.Redirigido, UrlRedirección: urlAutorización };

}


export async function ProcesarRespuestaGoogle(contexto: Contexto): Promise<ResultadoEntradaGoogle> { // Procesa la respuesta de Google: valida state HMAC, intercambia code por id_token, busca o crea usuario, y abre sesión.

	if (contexto.Solicitud.method !== 'GET') return { Resultado: ResultadoGoogle.MétodoNoPermitido };

	const código = contexto.Url.searchParams.get('code');
    const estado = contexto.Url.searchParams.get('state');
	const cookieBorrada = CrearCookie(contexto, NombreCookieEstadoGoogle, '', 0); // Se borra la cookie google_auth_state una vez cumplida su función en la respuesta de Google para no dejar basura en el navegador.
	const cookieNonceBorrada = CrearCookie(contexto, NombreCookieNonceGoogle, '', 0); // Se borra la cookie google_auth_nonce una vez que el flujo termina, con éxito o error.
    AgregarCookiesRespuesta(contexto, [cookieBorrada, cookieNonceBorrada], true); // Ambas cookies de flujo se borran juntas en cualquier salida, exitosa o fallida.
	const errorGoogle = contexto.Url.searchParams.get('error');
	const baseDeDatos = contexto.Entorno.BASE_DE_DATOS;

    if (errorGoogle) { // Google devolvió un error explícito (usuario canceló, acceso denegado, etc.).
        RegistrarEventoGoogle(contexto, 'ErrorGoogle', 'Google devolvió un error.', { error: errorGoogle });
		return { Resultado: ResultadoGoogle.EstadoInválido, Error: errorGoogle };
    }

    if (!código || !estado) {
        RegistrarEventoGoogle(contexto, 'ParámetrosFaltantes', 'Faltan code o state.');
		return { Resultado: ResultadoGoogle.EstadoInválido };
    }

    const estadoEnCookie = ObtenerValorCookie(contexto, NombreCookieEstadoGoogle);
    if (!estadoEnCookie) { // Si no hay cookie de estado, el flujo no se originó desde el Worker o la cookie expiró.
        RegistrarEventoGoogle(contexto, 'CookieEstadoFaltante', 'No se encontró la cookie google_auth_state.');
		return { Resultado: ResultadoGoogle.EstadoInválido };
    }

	const partesEstadoRecibido = estado.split('.');
	if (partesEstadoRecibido.length !== 2) {
        RegistrarEventoGoogle(contexto, 'EstadoMalformado', 'El estado recibido no tiene el formato ticket.sello.');
		return { Resultado: ResultadoGoogle.EstadoInválido };
    }

    if (estado !== estadoEnCookie) { // Comparación directa: el estado que Google devuelve debe ser idéntico al que se guardó en la cookie.
		RegistrarEventoGoogle(contexto, 'EstadoNoCoincide', 'El estado de Google no coincide con la cookie.');
		return { Resultado: ResultadoGoogle.EstadoInválido };
    }

	const [tiquete, selloRecibido] = partesEstadoRecibido;
	const selloRecalculado = await ObtenerHmac(tiquete, contexto.Entorno.CLAVE_HMAC); // Se recalcula el HMAC del ticket para verificar que nadie alteró el estado. No se consulta la base de datos para esta verificación.
	if (selloRecalculado !== selloRecibido) {
		RegistrarEventoGoogle(contexto, 'HmacInválido', 'La firma HMAC del estado no coincide al recalcularla.');
		return { Resultado: ResultadoGoogle.EstadoInválido };
	}

	const nonceEnCookie = ObtenerValorCookie(contexto, NombreCookieNonceGoogle); // El nonce se lee después de validar el state para mantener el mismo orden de seguridad que el flujo existente.
	if (!nonceEnCookie) {
		RegistrarEventoGoogle(contexto, 'CookieNonceFaltante', 'No se encontró la cookie google_auth_nonce.');
		return { Resultado: ResultadoGoogle.EstadoInválido };
	}

	const origen = ObtenerOrigenSolicitud(contexto);
	const urlRedirección = `${origen}/entrar-con-google/entrando`;

    let respuestaToken: Response;
	try {

        const cuerpoToken = new URLSearchParams({
            code: código, client_id: contexto.Entorno.ID_CLIENTE_GOOGLE, client_secret: contexto.Entorno.CLAVE_CLIENTE_GOOGLE, redirect_uri: urlRedirección,
            grant_type: 'authorization_code'
        });

		respuestaToken = await FetchConTimeout('https://oauth2.googleapis.com/token', { // Intercambio del code por id_token usando POST con Content-Type application/x-www-form-urlencoded según la especificación de Google.
			method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: cuerpoToken.toString()
		}, fetch);

	} catch (error) {

        RegistrarEventoGoogle(contexto, 'ErrorSolicitudToken', 'Falló la solicitud al endpoint de token de Google.',
        	{ error: String(error) });
        return { Resultado: ResultadoGoogle.ErrorIntercambioToken, Error: '' };

    }

    if (!respuestaToken.ok) {

        const cuerpoError = await respuestaToken.text();
		RegistrarEventoGoogle(contexto, 'ErrorRespuestaToken', 'Google devolvió error al intercambiar el code.',
            { estado: respuestaToken.status, cuerpo: cuerpoError });
		return { Resultado: ResultadoGoogle.ErrorIntercambioToken, Error: cuerpoError };

    }

	let datosToken: { id_token?: string; };
	try {
		datosToken = await respuestaToken.json() as { id_token?: string; };
	} catch {
		RegistrarEventoGoogle(contexto, 'ErrorLecturaToken', 'No se pudo leer la respuesta JSON del token de Google.');
		return { Resultado: ResultadoGoogle.ErrorIntercambioToken };
	}

	if (!datosToken.id_token) {
		RegistrarEventoGoogle(contexto, 'IdTokenFaltante', 'La respuesta de Google no contiene id_token.');
		return { Resultado: ResultadoGoogle.ErrorIntercambioToken };
	}

	const resultadoVerificación = await VerificarIdTokenGoogle(datosToken.id_token,
		{ audience: contexto.Entorno.ID_CLIENTE_GOOGLE, nonce: nonceEnCookie });
	if (!resultadoVerificación.esValido) {

		RegistrarEventoGoogle(contexto, 'IdTokenInválido', 'El id_token de Google no superó la verificación.',
			{ motivo: resultadoVerificación.motivo });
		return { Resultado: ResultadoGoogle.ErrorIntercambioToken };

	}
	const datos = resultadoVerificación.datos;

    if (!datos.email_verified) { // Si Google no verificó el correo se rechaza la entrada y se le sugiere usar enlace mágico. Esto previene que alguien use una cuenta de Google con correo sin verificar para acceder a una cuenta ajena.

		RegistrarEventoGoogle(contexto, 'CorreoNoVerificado', 'El correo de Google no está verificado.',
            { correo: await ObtenerHmac(datos.email, contexto.Entorno.CLAVE_HMAC) });
		return { Resultado: ResultadoGoogle.CorreoNoVerificado };

    }

    const correo = datos.email.trim().toLowerCase();
    const idEnProveedor = datos.sub;
	const hmacCorreo = await ObtenerHmac(correo, contexto.Entorno.CLAVE_HMAC);
    const ahora = new Date().toISOString();

	const identidadExistente = await baseDeDatos.prepare( // Buscar por huella (IdEnProveedor). Si existe, ese es el usuario dueño de la cuenta Google sin importar qué correo traiga ahora.
        "SELECT IdIdentidad, IdUsuario, Correo FROM Identidades WHERE Proveedor = 'Google' AND IdEnProveedor = ? LIMIT 1")
        .bind(idEnProveedor).first<IdentidadBD>();

    let idUsuario: string;
    let rol: string;

    if (identidadExistente) { // La huella Google ya existe: este es el usuario dueño independientemente del correo actual.

		const usuario = await baseDeDatos.prepare('SELECT IdUsuario, Rol, Estado FROM Usuarios WHERE IdUsuario = ? LIMIT 1')
            .bind(identidadExistente.IdUsuario).first<UsuarioBD>();

        if (!usuario) { // Situación inesperada: la identidad apunta a un usuario que no existe en Usuarios.
			EnviarAlertaErrorCrítico(contexto, 'Error Google', 'Identidad huérfana sin usuario.');
			return { Resultado: ResultadoGoogle.ErrorSesión };
        }

        if (usuario.Estado !== 'Activo') { // Validación de estado inmediatamente después de encontrar al usuario.

            RegistrarEventoGoogle(contexto, 'UsuarioNoActivo', 'Usuario encontrado por huella no está activo.',
                { hmacCorreo, estadoUsuario: usuario.Estado });
			return { Resultado: ResultadoGoogle.UsuarioNoActivo };

        }

        idUsuario = usuario.IdUsuario;
        rol = usuario.Rol;

        if (identidadExistente.Correo !== correo) { // El correo que trae Google cambió respecto al que se tenía guardado. La identidad Google manda: se actualiza el correo en Identidades y en Usuarios.

			const usuarioConNuevoCorreo = await baseDeDatos.prepare( // Verificar que el nuevo correo no pertenezca ya a otro usuario en Usuarios para evitar conflicto de unicidad.
				'SELECT IdUsuario FROM Usuarios WHERE Correo = ? LIMIT 1')
				.bind(correo).first<{ IdUsuario: string; }>();

            if (usuarioConNuevoCorreo && usuarioConNuevoCorreo.IdUsuario !== idUsuario) { // El nuevo correo ya pertenece a otro IdUsuario existente. Se le dice al usuario que ingrese directamente con enlace mágico.

                RegistrarEventoGoogle(contexto, 'CorreoEnOtroUsuario', 'El nuevo correo de Google ya pertenece a otro usuario.',
                    { hmacCorreo, idUsuarioExistente: usuarioConNuevoCorreo.IdUsuario });
				return { Resultado: ResultadoGoogle.CorreoEnOtroUsuario };

            }

			await baseDeDatos.batch([ // Actualización atómica de correo en Usuarios, Identidad Google e Identidades Enlace del mismo IdUsuario para evitar estados inconsistentes si falla la mitad de la operación. Si no existen identidades Enlace el tercer UPDATE simplemente afecta 0 filas sin error.
				baseDeDatos.prepare('UPDATE Usuarios SET Correo = ?, FechaHoraActualizado = ? WHERE IdUsuario = ?')
                    .bind(correo, ahora, idUsuario),
				baseDeDatos.prepare('UPDATE Identidades SET Correo = ?, CorreoVerificado = 1, FechaHoraÚltimoUso = ? WHERE IdIdentidad = ?')
                    .bind(correo, ahora, identidadExistente.IdIdentidad),
				baseDeDatos.prepare("UPDATE Identidades SET Correo = ? WHERE IdUsuario = ? AND Proveedor = 'Enlace'") // Se propaga el nuevo correo a las identidades Enlace del mismo usuario para mantener coherencia interna. FechaHoraÚltimoUso no se toca porque el usuario no usó el enlace ahora.
                    .bind(correo, idUsuario)
            ]);

            RegistrarEventoGoogle(contexto, 'CorreoActualizado',
            	'El correo cambió y se actualizó en Usuarios, Identidad Google e Identidades Enlace.',
				{ hmacCorreo, hmacCorreoAnterior: await ObtenerHmac(identidadExistente.Correo, contexto.Entorno.CLAVE_HMAC) });

        } else { // El correo no cambió, solo se actualiza FechaHoraÚltimoUso en Identidades.
			contexto.Ejecución.waitUntil(baseDeDatos.prepare('UPDATE Identidades SET FechaHoraÚltimoUso = ? WHERE IdIdentidad = ?')
                .bind(ahora, identidadExistente.IdIdentidad).run());
        }

    } else { // No hay huella Google. Buscar por correo en Usuarios.

        const usuarioExistente = await baseDeDatos.prepare('SELECT IdUsuario, Rol, Estado FROM Usuarios WHERE Correo = ? LIMIT 1')
            .bind(correo).first<UsuarioBD>();

        if (usuarioExistente) { // El correo ya existe en Usuarios: se vincula la cuenta Google con ese usuario existente.

            if (usuarioExistente.Estado !== 'Activo') { // Validación de estado inmediatamente después de encontrar al usuario.

                RegistrarEventoGoogle(contexto, 'UsuarioNoActivo', 'Usuario encontrado por correo no está activo.',
                    { hmacCorreo, estadoUsuario: usuarioExistente.Estado });
				return { Resultado: ResultadoGoogle.UsuarioNoActivo };

            }

            idUsuario = usuarioExistente.IdUsuario;
            rol = usuarioExistente.Rol;

            await baseDeDatos.prepare(
                `INSERT INTO Identidades (IdIdentidad, IdUsuario, Proveedor, IdEnProveedor, Correo, CorreoVerificado, FechaHoraCreada,
                FechaHoraÚltimoUso) VALUES (?, ?, 'Google', ?, ?, 1, ?, ?)`)
                .bind(crypto.randomUUID(), idUsuario, idEnProveedor, correo, ahora, ahora).run();

            RegistrarEventoGoogle(contexto, 'IdentidadVinculada', 'Se vinculó identidad Google a usuario existente.', { hmacCorreo });

        } else { // No hay nada. Usuario completamente nuevo: se crea en Usuarios e Identidades.

            idUsuario = crypto.randomUUID();
			rol = 'Usuario';

			try {

				 await baseDeDatos.batch([

					  baseDeDatos.prepare(`INSERT INTO Usuarios (IdUsuario, Correo, Estado, FechaHoraCreado, FechaHoraActualizado, Rol)
							VALUES (?, ?, 'Activo', ?, ?, 'Usuario')`).bind(idUsuario, correo, ahora, ahora),

					  baseDeDatos.prepare(
							`INSERT INTO Identidades (IdIdentidad, IdUsuario, Proveedor, IdEnProveedor, Correo, CorreoVerificado, FechaHoraCreada,
							FechaHoraÚltimoUso) VALUES (?, ?, 'Google', ?, ?, 1, ?, ?)`)
							.bind(crypto.randomUUID(), idUsuario, idEnProveedor, correo, ahora, ahora)

				]);

				RegistrarEventoGoogle(contexto, 'UsuarioCreado', 'Se creó un usuario nuevo exitosamente con Google.', { hmacCorreo });
				contexto.Ejecución.waitUntil(NotificarUsuarioCreado(contexto, { IdUsuario: idUsuario, Correo: correo,
					Proveedor: 'Google', IdEnProveedor: idEnProveedor, Rol: rol, FechaHoraCreado: ahora }).catch(error => {
						EnviarAlertaErrorCrítico(contexto, 'Error notificando usuario creado desde Google',
							'Falló la notificación de usuario creado desde Google.', String(error));
				}));

			} catch (e) {

				RegistrarEventoGoogle(contexto, 'ErrorCreandoUsuario', 'Hubo un error al crear el usuario con Google.',
					{ hmacCorreo, error: String(e) }); // La causa más probable es una carrera de creación concurrente. No se resuelve aún: se registra para medir frecuencia real y decidir si amerita lógica de reconciliación.
				return { Resultado: ResultadoGoogle.ErrorSesión, Error: String(e) };

			}

        }

    }

	const autenticaciónActual = await ObtenerAutenticación(contexto, ModoAutenticación.BaseDeDatos); // Primera llamada después de entrar: fuerza amr=BaseDeDatos y rehidrata la cookie de autenticación en cliente.

    if (autenticaciónActual.Usuario) {

        if (autenticaciónActual.Usuario.IdUsuario === idUsuario) { // Ya tiene sesión activa con el mismo usuario.
			return { Resultado: ResultadoGoogle.YaAutenticado, IdUsuario: idUsuario };
        } else { // Sesión activa con otro usuario: se cierra la sesión anterior antes de abrir la nueva.
			await CerrarSesiónActual(contexto);
        }

    }

    try {
		await AbrirSesiónEnContexto(contexto, idUsuario, rol);
        RegistrarEventoGoogle(contexto, 'SesiónCreada', 'Sesión de usuario creada con Google.', { hmacCorreo });
	} catch (error) {

        RegistrarEventoGoogle(contexto, 'ErrorSesión', 'Falló la creación de sesión después de autenticar con Google.',
			{ hmacCorreo, error: String(error) });
		return { Resultado: ResultadoGoogle.ErrorSesión, Error: ''};

    }

   return { Resultado: ResultadoGoogle.SesiónCreada, UrlRedirección: RutaTrasEntrar, IdUsuario: idUsuario };

}


export async function ResponderEntradaConGoogle(contexto: Contexto): Promise<Response> {

	const resultado = await IniciarEntradaConGoogle(contexto);

	switch (resultado.Resultado) {

		case ResultadoGoogle.Redirigido:
			return ResponderRedirección(contexto, resultado.UrlRedirección!);
		case ResultadoGoogle.MétodoNoPermitido:
			return ResponderSoloGetPermitido(contexto, TipoError.Autenticación);
		case ResultadoGoogle.SesiónCreada: // IniciarEntradaConGoogle solo devuelve Redirigido o MétodoNoPermitido. Los demás resultados salen de procesar la respuesta de Google, así que llegar aquí es un error de programación.
		case ResultadoGoogle.YaAutenticado:
		case ResultadoGoogle.UsuarioNoActivo:
		case ResultadoGoogle.EstadoInválido:
		case ResultadoGoogle.CorreoNoVerificado:
		case ResultadoGoogle.ErrorIntercambioToken:
		case ResultadoGoogle.ErrorSesión:
		case ResultadoGoogle.CorreoEnOtroUsuario:
		default:
			throw new Error(`Resultado no soportado: ${String(resultado.Resultado)}`);

	}

}


export async function ResponderEntrandoConGoogle(contexto: Contexto, htmlError: string,
	obtenerRutaTrasIngreso?: (idUsuario: string) => Promise<string | null>)
	: Promise<Response> {

	if (!htmlError.includes('[[error]]')) throw new Error('htmlError debe incluir la pseudovariable [[error]].');

	const resultado = await ProcesarRespuestaGoogle(contexto);

	switch (resultado.Resultado) {

		case ResultadoGoogle.MétodoNoPermitido:
			return ResponderSoloGetPermitido(contexto, TipoError.Autenticación);
		case ResultadoGoogle.SesiónCreada:
		case ResultadoGoogle.YaAutenticado: {

			const rutaPersonalizada = resultado.IdUsuario && obtenerRutaTrasIngreso
				? await obtenerRutaTrasIngreso(resultado.IdUsuario) : null;
			return ResponderRedirección(contexto, rutaPersonalizada ?? resultado.UrlRedirección ?? RutaTrasEntrar);

		}
		case ResultadoGoogle.EstadoInválido:
			return ResponderErrorConMarcoLocal(contexto, htmlError, '{{google-estado-inválido}}');
		case ResultadoGoogle.CorreoNoVerificado:
			return ResponderErrorConMarcoLocal(contexto, htmlError, '{{google-correo-no-verificado}}');
		case ResultadoGoogle.ErrorIntercambioToken:
			return ResponderErrorConMarcoLocal(contexto, htmlError, '{{google-error-intercambio}}', EstadoError.ErrorServidor);
		case ResultadoGoogle.UsuarioNoActivo:
			return ResponderErrorConMarcoLocal(contexto, htmlError, '{{google-usuario-no-activo}}', EstadoError.NoAutorizado);
		case ResultadoGoogle.ErrorSesión:
			return ResponderErrorConMarcoLocal(contexto, htmlError, '{{autenticación-sesión-error-crear}}', EstadoError.ErrorServidor);
		case ResultadoGoogle.CorreoEnOtroUsuario:
			return ResponderErrorConMarcoLocal(contexto, htmlError, '{{google-correo-en-otro-usuario}}');
		case ResultadoGoogle.Redirigido: // ProcesarRespuestaGoogle nunca devuelve Redirigido, que solo sale de IniciarEntradaConGoogle, así que llegar aquí es un error de programación.
		default:
			throw new Error(`Resultado no soportado: ${String(resultado.Resultado)}`);

	}

}


async function ResponderErrorConMarcoLocal(contexto: Contexto, htmlError: string, mensajeError: string,
	estadoError: EstadoError = EstadoError.SolicitudInválida): Promise<Response> { // Responde con el error correspondiente cuando el flujo de Google falla, manteniendo la sesión actual si existía.
	return ResponderErrorConMarco(contexto, htmlError.replace("[[error]]", mensajeError), TipoError.PáginaPropia, true, null,
		estadoError);
}


// #region Verificación criptográfica de Google ID Tokens. Solo usa Web Crypto API, compatible con Cloudflare Workers runtime. No depende de Node.js crypto, Buffer ni librerías externas.

export interface DatosGoogleVerificados { // No renombrar ninguna de las propiedades para mantener compatibilidad con Google.
	sub: string; email: string; email_verified: boolean; iss: string; aud: string; exp: number;
	nonce?: string;
}

export type ResultadoVerificaciónGoogle = { esValido: true; datos: DatosGoogleVerificados; } | { esValido: false; motivo: string; };

export interface OpcionesVerificación { audience: string; nonce?: string; fetchImpl?: typeof fetch; } // No renombrar ninguna de las propiedades para mantener compatibilidad con Google.

interface CabeceraJwt { alg: string; kid: string; typ?: string; } // No renombrar ninguna de las propiedades para mantener compatibilidad con Google.

interface ContenidoJwt {
	sub?: unknown; email?: unknown; email_verified?: unknown; iss?: unknown; aud?: unknown; exp?: unknown; nonce?: unknown; // No renombrar ninguna de las propiedades para mantener compatibilidad con Google.
}

interface ClaveJwk { kid: string; n: string; e: string; kty: string; alg: string; use: string; } // No renombrar ninguna de las propiedades para mantener compatibilidad con Google.

interface RespuestaJwks { keys: ClaveJwk[]; } // No renombrar ninguna de las propiedades para mantener compatibilidad con Google.

const MilisegundosVigenciaJwksPorDefecto = 5 * 60 * 1000; // 5 minutos si Google no devuelve Cache-Control. Cloudflare Workers puede reutilizar la instancia del Worker entre solicitudes del mismo isolate, por lo que esta caché en módulo persiste entre invocaciones mientras el isolate esté vivo. No es una caché duradera entre deploys ni entre distintos Workers, pero reduce fetches en ráfagas de tráfico.

const UrlJwksGoogle = 'https://www.googleapis.com/oauth2/v3/certs';

interface EntradaCachéJwks { claves: ClaveJwk[]; expiraEn: number; }

let CachéJwks: EntradaCachéJwks | null = null;

let PromesaCargaJwks: Promise<ClaveJwk[]> | null = null; // Evita que solicitudes simultáneas hagan múltiples consultas a Google cuando la caché expira al mismo tiempo.


function DecodificarBase64UrlAJson<T>(valor: string): T | null {

	try {
		const json = new TextDecoder().decode(DecodificarBase64Url(valor));
		return JSON.parse(json) as T;
	} catch {
		return null;
	}

}


function SepararPartesJwt(idToken: string): [string, string, string] | null {

	const partes = idToken.split('.');
	if (partes.length !== 3) return null;
	return [partes[0], partes[1], partes[2]];

}


function ExtraerMaxAgeDeCacheControl(cabecera: string | null): number | null {

	if (!cabecera) return null;
	const coincidencia = /max-age=(\d+)/i.exec(cabecera);
	if (!coincidencia) return null;

	const segundos = parseInt(coincidencia[1], 10);
	return isNaN(segundos) ? null : segundos * 1000;

}


async function ObtenerClavesJwks(fetchImpl: typeof fetch): Promise<ClaveJwk[]> {

	const ahora = Date.now();
	if (CachéJwks && CachéJwks.expiraEn > ahora) return CachéJwks.claves; // Usar caché vigente.

	if (!PromesaCargaJwks) PromesaCargaJwks = CargarClavesJwksDesdeGoogle(fetchImpl).finally(() => { PromesaCargaJwks = null; });

	return await PromesaCargaJwks;

}


async function CargarClavesJwksDesdeGoogle(fetchImpl: typeof fetch): Promise<ClaveJwk[]> {

	const ahora = Date.now();

	let respuesta: Response;
	try {
		respuesta = await FetchConTimeout(UrlJwksGoogle, {}, fetchImpl);
	} catch (error) {
		throw new Error(`Error de red al obtener JWKS de Google: ${String(error)}`);
	}

	if (!respuesta.ok) throw new Error(`Google JWKS devolvió HTTP ${respuesta.status}.`);

	let cuerpo: RespuestaJwks;
	try {
		cuerpo = await respuesta.json() as RespuestaJwks;
	} catch {
		throw new Error('No se pudo parsear el JWKS de Google como JSON.');
	}

	if (!Array.isArray(cuerpo.keys) || cuerpo.keys.length === 0) throw new Error('El JWKS de Google no contiene claves.');

	const ttlMs = ExtraerMaxAgeDeCacheControl(respuesta.headers.get('Cache-Control')) ?? MilisegundosVigenciaJwksPorDefecto;
	CachéJwks = { claves: cuerpo.keys, expiraEn: ahora + ttlMs };

	return cuerpo.keys;

}


function SeleccionarClaveJwk(claves: ClaveJwk[], kid: string): ClaveJwk | null {
	return claves.find(c => c.kid === kid) ?? null;
}


async function ImportarClaveRsa(claveJwk: ClaveJwk): Promise<CryptoKey> {
	const jwk: JsonWebKey = { kty: claveJwk.kty, n: claveJwk.n, e: claveJwk.e, alg: 'RS256', use: 'sig', ext: true }; // Web Crypto exige que el objeto JWK tenga exactamente los campos que necesita para RSA-PKCS1-v1_5 / SHA-256. Cloudflare Workers soporta SubtleCrypto.importKey con formato 'jwk' para RS256 sin restricciones adicionales.
	return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'] );
}


async function VerificarFirmaRs256(clavePublica: CryptoKey, firma: Uint8Array<ArrayBuffer>, mensajeAFirmar: string ): Promise<boolean> {

	const encoder = new TextEncoder();
	const datos = encoder.encode(mensajeAFirmar);
	return crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, clavePublica, firma, datos);

}


function ValidarPropiedades(contenido: ContenidoJwt, audience: string, nonce?: string): string | null { // Devuelve null si todo es válido, o el motivo del rechazo.

	if (typeof contenido.iss !== 'string') return 'Propiedad iss ausente o inválido.';

	if (contenido.iss !== 'accounts.google.com' && contenido.iss !== 'https://accounts.google.com')
		return `Emisor inesperado: ${contenido.iss}`;

	if (typeof contenido.aud !== 'string') return 'Propiedad aud ausente o inválido.';
	if (contenido.aud !== audience) return `Audience no coincide: esperado '${audience}', recibido '${contenido.aud}'.`;

	if (typeof contenido.exp !== 'number') return 'Propiedad exp ausente o inválido.';
	const ahoraEnSegundos = Math.floor(Date.now() / 1000);
	if (contenido.exp <= ahoraEnSegundos) return `Token expirado (exp=${contenido.exp}, ahora=${ahoraEnSegundos}).`;

	if (typeof contenido.sub !== 'string' || !contenido.sub) return 'Propiedad sub ausente o vacío.';
	if (typeof contenido.email !== 'string' || !contenido.email) return 'Propiedad email ausente o vacío.';
	if (typeof contenido.email_verified !== 'boolean') return 'Propiedad email_verified debe ser boolean.';

	if (nonce !== undefined) {
		if (typeof contenido.nonce !== 'string') return 'Se esperaba la propiedad nonce pero está ausente.';
		if (contenido.nonce !== nonce) return 'Propiedad nonce no coincide.';
	}

	return null;

}


export async function VerificarIdTokenGoogle(idToken: string, opciones: OpcionesVerificación): Promise<ResultadoVerificaciónGoogle> {

	const fetchImpl = opciones.fetchImpl ?? fetch;

	const partes = SepararPartesJwt(idToken); // 1. Separar las tres partes del JWT.
	if (!partes) return { esValido: false, motivo: 'El token no tiene el formato JWT (3 partes separadas por punto).' };
	const [cabeceraB64, contenidoB64, firmaB64] = partes;

	const cabecera = DecodificarBase64UrlAJson<CabeceraJwt>(cabeceraB64); // 2. Leer cabecera.
	if (!cabecera) return { esValido: false, motivo: 'No se pudo leer la cabecera JWT.' };
	if (cabecera.alg !== 'RS256') return { esValido: false, motivo: `Algoritmo no soportado: ${cabecera.alg}. Solo se acepta RS256.` };
	if (!cabecera.kid) return { esValido: false, motivo: 'La cabecera JWT no contiene kid.' };

	const contenido = DecodificarBase64UrlAJson<ContenidoJwt>(contenidoB64); // 3. Leer contenido.
	if (!contenido) return { esValido: false, motivo: 'No se pudo leer el contenido JWT.' };

	let clavesJwks: ClaveJwk[]; // 4. Obtener JWKS de Google (con caché).
	try {
		clavesJwks = await ObtenerClavesJwks(fetchImpl);
	} catch (error) {
		return { esValido: false, motivo: String(error) };
	}

	let claveJwk = SeleccionarClaveJwk(clavesJwks, cabecera.kid);  // 5. Seleccionar la clave correcta por kid.
	if (!claveJwk) { // Google rota claves periódicamente. Si el kid no está en caché, se descarta la caché y se reintenta una vez.

		CachéJwks = null;
		try {
			clavesJwks = await ObtenerClavesJwks(fetchImpl);
		} catch (error) {
			return { esValido: false, motivo: String(error) };
		}
		claveJwk = SeleccionarClaveJwk(clavesJwks, cabecera.kid);
		if (!claveJwk)
			return { esValido: false, motivo: `No se encontró clave pública para kid='${cabecera.kid}' ni tras refrescar el JWKS.` };

	}

	if (claveJwk.kty !== 'RSA') return { esValido: false, motivo: `La clave seleccionada no es RSA (kty='${claveJwk.kty}').` }; // 6. Importar la JWK como CryptoKey.
	if (claveJwk.use !== undefined && claveJwk.use !== 'sig')
		return { esValido: false, motivo: `La clave seleccionada no es de firma (use='${claveJwk.use}').` };

	let clavePublica: CryptoKey;
	try {
		clavePublica = await ImportarClaveRsa(claveJwk);
	} catch (error) {
		return { esValido: false, motivo: `Error al importar la clave pública JWK: ${String(error)}` };
	}

	let firmaBytes: Uint8Array<ArrayBuffer>; // 7. Verificar la firma.
	try {
		firmaBytes = DecodificarBase64Url(firmaB64) as Uint8Array<ArrayBuffer>;
	} catch {
		return { esValido: false, motivo: 'La firma del token contiene carácteres base64url inválidos.' };
	}

	let firmaVálida: boolean;
	try {
		firmaVálida = await VerificarFirmaRs256(clavePublica, firmaBytes, `${cabeceraB64}.${contenidoB64}`);
	} catch (error) {
		return { esValido: false, motivo: `Error durante la verificación de firma: ${String(error)}` };
	}

	if (!firmaVálida) return { esValido: false, motivo: 'La firma del token no es válida.' };

	const motivoInválido = ValidarPropiedades(contenido, opciones.audience, opciones.nonce); // 8. Validar propiedades semánticas (issuer, audience, expiración, campos obligatorios, nonce).
	if (motivoInválido) return { esValido: false, motivo: motivoInválido };


	const datos: DatosGoogleVerificados = { // 9. Construir y devolver resultado verificado. Los cast son seguros porque ValidarPropiedades garantizó los tipos.
		sub: contenido.sub as string,
		email: contenido.email as string,
		email_verified: contenido.email_verified as boolean,
		iss: contenido.iss as string,
		aud: contenido.aud as string,
		exp: contenido.exp as number,
		...(typeof contenido.nonce === 'string' ? { nonce: contenido.nonce } : {}),
	};

	return { esValido: true, datos };

}

// #endregion
