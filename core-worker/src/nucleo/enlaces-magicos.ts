import { EnviarAlertaErrorCrítico } from './alertas';
import { type Contexto, type Entorno, ObtenerOrigenSolicitud, ModoAutenticación,
	RegistrarEventoConPrefijo, HorasRetenciónEnlacesMágicosViejos, Sanear } from './global';
import { ObtenerAutenticación, AbrirSesiónEnContexto, CerrarSesiónActual } from './autenticacion';
import { EnviarEnlaceMágico } from './correos';
import { GenerarTokenAleatorio, ObtenerHashToken, ObtenerHmac } from './tokenes';
import { NotificarUsuarioCreado } from './eventos';
import * as v from 'valibot';
import { ObtenerTextoConSustituciones } from './idiomas';
import { ResponderConMarco, ResponderErrorConMarco, TipoError, EstadoError, ResponderRedirección,
	ResponderSoloGetPermitido, ResponderSoloPostPermitido, ResponderSoloGetYPostPermitidos } from './respuestas';


const MilisegundosVigenciaEnlace = 10 * 60 * 1000; // 10 minutos de vigencia para el token de enlace mágico.

const MilisegundosMínimosRespuesta = 1000; // Tiempo mínimo de respuesta para prevenir enumeración de correos por análisis de duración de la respuesta.

const EsquemaCorreo = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email()); // El correo se normaliza a minúsculas y sin espacios para evitar problemas de duplicados por mayúsculas o espacios al inicio/final. La validación se hace con valibot para garantizar que el formato sea correcto y evitar correos basura en la base de datos y en los registros.

interface EnlaceIngresoBD { IdEnlace: string; Correo: string; FechaHoraCreado: string; FechaHoraUsado: string | null; }

interface UsuarioBD { IdUsuario: string; Rol: string; Estado: string; }

export enum ResultadoSolicitud { MensajeNeutro, CorreoInválido }

export enum ResultadoValidación { Válido, TokenFaltante, TokenInválido, TokenVencido }

export enum ResultadoEntrada {
	SesiónCreada, YaAutenticado, UsuarioNoActivo, TokenFaltante, TokenInválido, TokenVencido, MétodoNoPermitido, ErrorSesión
}

export interface ResultadoSolicitudEnlace { Resultado: ResultadoSolicitud; CorreoParaMostrar: string; }

export interface ResultadoValidaciónEnlace { Resultado: ResultadoValidación; TokenSaneado?: string; }

export interface DetalleResultadoEntrada { Resultado: ResultadoEntrada; Error?: string; IdUsuario?: string; }


async function EsperarTiempoMínimo(inicio: number): Promise<void> { // Garantiza que todas las respuestas tarden al menos MilisegundosMínimosRespuesta para evitar ataques de enumeración.

	const transcurrido = performance.now() - inicio;
	const restante = MilisegundosMínimosRespuesta - transcurrido;
	if (restante > 0) await new Promise(resolver => setTimeout(resolver, restante));

}


function NormalizarCorreo(correo: string): string | null { // Normaliza y valida el correo con Valibot. Devuelve null si no es válido.

	const resultado = v.safeParse(EsquemaCorreo, correo);
	if (!resultado.success) return null;
	return resultado.output;

}


function RegistrarEventoEnlace(contexto: Contexto, nombreEvento: string, detalles?: string,
	metadatos?: Record<string, string | number | boolean | null | undefined>): void { // Registro uniforme de eventos de observabilidad.
	RegistrarEventoConPrefijo(contexto, 'EnlaceMágico.', nombreEvento, detalles, metadatos);
}


export async function ProcesarSolicitudEnlace(contexto: Contexto, htmlCorreo: string,
	parámetrosEnlace: URLSearchParams = new URLSearchParams()): Promise<ResultadoSolicitudEnlace> { // Lógica completa de solicitud de enlace mágico: normaliza correo, aplica rate limiting, genera token, guarda hash en D1 y despacha correo en segundo plano.

	const tiempoInicio = performance.now();
	const entorno = contexto.Entorno;
	let correoNormalizado: string | null = null;

	try {

		const tipo = contexto.Solicitud.headers.get('Content-Type') ?? '';
		let correoCrudo = '';

        if (tipo.includes('application/x-www-form-urlencoded') || tipo.includes('multipart/form-data')) {
			const datos = await contexto.Solicitud.formData();
			correoCrudo = datos.get('correo')?.toString() ?? '';
		} else if (tipo.includes('application/json')) {
			const cuerpo = await contexto.Solicitud.json<{ correo?: string; }>();
			correoCrudo = cuerpo?.correo ?? '';
		}

		correoNormalizado = NormalizarCorreo(correoCrudo);

	} catch {
		correoNormalizado = null;
	}

	if (!correoNormalizado) {
		await EsperarTiempoMínimo(tiempoInicio); // Se espera el tiempo mínimo incluso en error de validación para no filtrar información por tiempos de consulta.
		return { Resultado: ResultadoSolicitud.CorreoInválido, CorreoParaMostrar: '' };
	}

	const hmacCorreo = await ObtenerHmac(correoNormalizado, entorno.CLAVE_HMAC); // Se usa HMAC del correo como clave del limitador para no exponer correos en registros de Cloudflare.
	const ip = contexto.Solicitud.headers.get('CF-Connecting-IP') ?? '0.0.0.0';
	const hmacIp = await ObtenerHmac(ip, entorno.CLAVE_HMAC);

	let resultadoCorreo: { success: boolean; } = { success: true };
	let resultadoIp: { success: boolean; } = { success: true };
	try {

		[resultadoCorreo, resultadoIp] = await Promise.all([
			entorno.LIMITADOR_CORREO_ENLACE_MAGICO.limit({ key: `email:${hmacCorreo}` }),
			entorno.LIMITADOR_IP_ENLACE_MAGICO.limit({ key: `ip:${hmacIp}` })
		]);

	} catch {
		RegistrarEventoEnlace(contexto, 'ErrorLimitador', 'El servicio de rate limiting falló. Se permite la solicitud.',
			{ hmacCorreo, hmacIp }); // Fallo abierto: si Cloudflare Rate Limiting no responde, se deja pasar la solicitud. El riesgo de abuso puntual es menor que el impacto de bloquear usuarios legítimos por una falla de infraestructura.
	}

	if (!resultadoCorreo.success || !resultadoIp.success) { // Cualquiera de los dos ejes de limitación puede bloquear la solicitud.

		RegistrarEventoEnlace(contexto, 'SolicitudBloqueada', 'Correo o IP excedió el límite de solicitudes.', { hmacCorreo, hmacIp });
		await EsperarTiempoMínimo(tiempoInicio); // Se responde con el mismo mensaje neutro y el mismo tiempo mínimo para no revelar si el bloqueo fue por correo o por IP.
		return { Resultado: ResultadoSolicitud.MensajeNeutro, CorreoParaMostrar: correoNormalizado };

	}

	const usuario = await entorno.BASE_DE_DATOS.prepare('SELECT IdUsuario, Rol, Estado FROM Usuarios WHERE Correo = ? LIMIT 1')
		.bind(correoNormalizado).first<UsuarioBD>();

	if (usuario && usuario.Estado !== 'Activo') { // Usuario bloqueado o eliminado: se envía correo informándole que no tiene acceso, pero la respuesta al navegador es idéntica al caso normal.

		contexto.Ejecución.waitUntil((async (): Promise<void> => {

			RegistrarEventoEnlace(contexto, 'SolicitudUsuarioNoActivo', 'Se solicitó enlace para usuario no activo.',
					{ hmacCorreo, estadoUsuario: usuario.Estado });
			await EnviarEnlaceMágico(contexto, correoNormalizado, '', htmlCorreo, false);

		})());

		await EsperarTiempoMínimo(tiempoInicio);
		return { Resultado: ResultadoSolicitud.MensajeNeutro, CorreoParaMostrar: correoNormalizado };

	}

	const token = await GenerarTokenAleatorio();
	const hashToken = await ObtenerHashToken(token);
	const ahora = new Date().toISOString();

	await entorno.BASE_DE_DATOS.prepare(
		`INSERT INTO EnlacesMágicos (IdEnlace, Correo, HashTokenEnlace, FechaHoraCreado, FechaHoraUsado) VALUES (?, ?, ?, ?, NULL)`)
		.bind(crypto.randomUUID(), correoNormalizado, hashToken, ahora).run();

	RegistrarEventoEnlace(contexto, 'SolicitudAceptada', 'Solicitud de enlace aceptada.', { hmacCorreo, hmacIp });

	contexto.Ejecución.waitUntil((async (): Promise<void> => { // Envío de correo en segundo plano para no bloquear la respuesta al usuario.

		try {

			const enlace = new URL('/entrar-con-correo/verificar', ObtenerOrigenSolicitud(contexto));
			enlace.searchParams.set('token', token);
			parámetrosEnlace.forEach((valor, clave): void => enlace.searchParams.set(clave, valor));
			await EnviarEnlaceMágico(contexto, correoNormalizado, enlace.toString(), htmlCorreo);

		} catch (error) {
			EnviarAlertaErrorCrítico(contexto, 'Error enviando correo de enlace mágico', `No se pudo enviar el correo de enlace.`,
              String(error));
		}

	})());

	await EsperarTiempoMínimo(tiempoInicio);
	return { Resultado: ResultadoSolicitud.MensajeNeutro, CorreoParaMostrar: correoNormalizado };

}


export async function ProcesarVerificaciónEnlace(contexto: Contexto, token: string): Promise<ResultadoValidaciónEnlace> { // Valida que el token parezca vigente sin consumirlo. Devuelve el token saneado si es válido.

	if (!token) return { Resultado: ResultadoValidación.TokenFaltante };

	const hashToken = await ObtenerHashToken(token);
	const enlace = await contexto.Entorno.BASE_DE_DATOS.prepare(
		'SELECT IdEnlace, Correo, FechaHoraCreado, FechaHoraUsado FROM EnlacesMágicos WHERE HashTokenEnlace = ? LIMIT 1')
		.bind(hashToken).first<EnlaceIngresoBD>();

	if (!enlace || enlace.FechaHoraUsado !== null) return { Resultado: ResultadoValidación.TokenInválido }; // Token no encontrado o ya fue consumido previamente.

	const milisegundosCreado = new Date(enlace.FechaHoraCreado).getTime();
	if (Date.now() - milisegundosCreado > MilisegundosVigenciaEnlace) return { Resultado: ResultadoValidación.TokenVencido };

	return { Resultado: ResultadoValidación.Válido };

}


export async function ProcesarEntradaConEnlace(contexto: Contexto, token: string)
   : Promise<DetalleResultadoEntrada> { // Consume el token, crea o reutiliza usuario y abre sesión. Devuelve resultado tipado mientras las cookies se registran directamente en el contexto.

	if (!token) {
		RegistrarEventoEnlace(contexto, 'TokenFaltante', 'Se intentó entrar sin token.');
		return { Resultado: ResultadoEntrada.TokenFaltante };
	}

	const hashToken = await ObtenerHashToken(token);
	const ahora = new Date().toISOString();
	const fechaHoraCreaciónMínima = new Date(Date.now() - MilisegundosVigenciaEnlace).toISOString(); // Umbral de creación mínimo: solo tókenes creados dentro del tiempo de vigencia pueden usarse. Esto permite que el UPDATE sea también la verificación de vigencia, sin un SELECT previo.
	const entorno = contexto.Entorno;

	const resultado = await entorno.BASE_DE_DATOS.prepare(
		'UPDATE EnlacesMágicos SET FechaHoraUsado = ? WHERE HashTokenEnlace = ? AND FechaHoraUsado IS NULL AND FechaHoraCreado >= ?')
		.bind(ahora, hashToken, fechaHoraCreaciónMínima).run(); // Uso atómico: el UPDATE solo gana si el token existe, no fue usado y no está vencido. Dos solicitudes concurrentes con el mismo token solo pueden afectar 1 fila en total. La que llega tarde obtiene meta.changes === 0. Antes era peligroso porque primero se leía el token y después se marcaba como usado, dejando una ventana de tiempo en la que dos solicitudes concurrentes podían validarlo al mismo tiempo. Otra carrera aceptada: la carrera entre dos enlaces válidos del mismo correo fue evaluada y se acepta explícitamente. Correo ya es UNIQUE en Usuarios, así que no hay riesgo de duplicación de cuentas. Si dos enlaces se usan casi al mismo tiempo, es aceptable que uno gane y el otro falle con el token ya consumido.

	if (resultado.meta.changes !== 1) { // Si no se actualizó exactamente una fila, el token no es válido para usar. Puede ser porque no existe, ya fue usado o está vencido. Se hace una lectura secundaria para clasificar el motivo exacto y registrar el evento correspondiente, pero sin abrir una nueva ventana de carrera porque el token ya fue marcado como usado (o nunca existió).

        const enlaceClasificación = await entorno.BASE_DE_DATOS.prepare(
			'SELECT FechaHoraCreado, FechaHoraUsado FROM EnlacesMágicos WHERE HashTokenEnlace = ? LIMIT 1')
			.bind(hashToken).first<Pick<EnlaceIngresoBD, 'FechaHoraCreado' | 'FechaHoraUsado'>>();

		if (!enlaceClasificación) {
			RegistrarEventoEnlace(contexto, 'TokenInexistente', 'Se intentó usar un token inexistente.');
			return { Resultado: ResultadoEntrada.TokenInválido };
		} else if (enlaceClasificación.FechaHoraUsado !== null) {
			RegistrarEventoEnlace(contexto, 'TokenYaUsado', 'Se intentó usar un token ya usado.');
			return { Resultado: ResultadoEntrada.TokenInválido };
		} else {
			RegistrarEventoEnlace(contexto, 'TokenVencido', 'Se intentó usar un token vencido.'); // Si llegó aquí: FechaHoraUsado es null pero no pasó el filtro de FechaHoraCreado >= umbral, es decir, está vencido.
			return { Resultado: ResultadoEntrada.TokenVencido };
		}

	}
	
  const enlaceConsumo = await entorno.BASE_DE_DATOS.prepare( // El token fue usado exitosamente. Se lee el Correo de la fila ya marcada para continuar el flujo.
		'SELECT Correo FROM EnlacesMágicos WHERE HashTokenEnlace = ? LIMIT 1')
		.bind(hashToken).first<Pick<EnlaceIngresoBD, 'Correo'>>();

  if (!enlaceConsumo) { // Situación inesperada: el UPDATE afectó 1 fila pero el SELECT no la encuentra.
		EnviarAlertaErrorCrítico(contexto, 'Error Enlace', 'El token fue usado, pero no se leyó el correo.');
		return { Resultado: ResultadoEntrada.TokenInválido };
	}

	const correo = enlaceConsumo.Correo;
	const hmacCorreo = await ObtenerHmac(correo, entorno.CLAVE_HMAC);

	await entorno.BASE_DE_DATOS.prepare('UPDATE EnlacesMágicos SET FechaHoraUsado = ? WHERE Correo = ? AND FechaHoraUsado IS NULL')
		.bind(ahora, correo).run(); // Invalidación de todos los demás enlaces vigentes del mismo correo, recién después de haber usado el token actual de forma atómica. Previene ataques de repetición con otros enlaces interceptados del mismo usuario.

	const usuario = await entorno.BASE_DE_DATOS.prepare('SELECT IdUsuario, Rol, Estado FROM Usuarios WHERE Correo = ? LIMIT 1')
		.bind(correo).first<UsuarioBD>();

	if (usuario && usuario.Estado !== 'Activo') { // Usuario bloqueado o eliminado: no se permite el ingreso.

		RegistrarEventoEnlace(contexto, 'UsuarioNoActivo', 'El enlace fue usado por usuario no activo.',
			{ hmacCorreo, estadoUsuario: usuario.Estado });
        return { Resultado: ResultadoEntrada.UsuarioNoActivo };

	}

	let idUsuario: string;
	let rol: string;

	if (usuario) { // Usuario activo existente, se abre sesión.
		idUsuario = usuario.IdUsuario;
		rol = usuario.Rol; // Si un usuario primero ingresa con el botón de Google y después ingresa usando el enlace mágico, en la tabla Identidades solo queda registrada una fila correspondiente al ingreso por Google. Para que se inserte una segunda fila correspondiente al ingreso por enlace, habría que agregar un INSERT OR IGNORE de la identidad Enlace. Pero se prefiere no hacerlo porque la convergencia de autenticación entre enlace mágico y botón de google ya funciona correctamente sin crear la identidad Enlace faltante, es decir queda entrando sin problemas con cualquiera de los dos métodos. Entonces se prefiere pecar por seguro ante la incertidumbre sobre si Cloudflare podría cobrar esta operación como escritura adicional en algunos escenarios. Si en el futuro se decide priorizar homogeneidad total en la tabla Identidades, el INSERT OR IGNORE que crea la identidad Enlace cuando falta está en el historial de Web Core, en la confirmación 7169683.
	} else { // Usuario nuevo: se crea con rol Usuario y se registra la identidad de tipo Enlace.

		idUsuario = crypto.randomUUID();
		rol = 'Usuario';

		try {

         await entorno.BASE_DE_DATOS.batch([

              entorno.BASE_DE_DATOS.prepare(
					`INSERT INTO Usuarios (IdUsuario, Correo, Estado, FechaHoraCreado, FechaHoraActualizado, Rol)
					VALUES (?, ?, 'Activo', ?, ?, 'Usuario')`).bind(idUsuario, correo, ahora, ahora),

              entorno.BASE_DE_DATOS.prepare(
					`INSERT INTO Identidades (IdIdentidad, IdUsuario, Proveedor, IdEnProveedor, Correo, CorreoVerificado, FechaHoraCreada,
					FechaHoraÚltimoUso) VALUES (?, ?, 'Enlace', ?, ?, 1, ?, ?)`)
					.bind(crypto.randomUUID(), idUsuario, correo, correo, ahora, ahora)

			]);

			RegistrarEventoEnlace(contexto, 'UsuarioCreado', 'Se creó un usuario nuevo éxitosamente con enlace.', { hmacCorreo });
			contexto.Ejecución.waitUntil(NotificarUsuarioCreado(contexto, { IdUsuario: idUsuario, Correo: correo,
				Proveedor: 'Enlace', IdEnProveedor: null, Rol: rol, FechaHoraCreado: ahora}).catch(error => {
				EnviarAlertaErrorCrítico(contexto, 'Error notificando usuario creado desde enlace',
					'Falló la notificación de usuario creado desde enlace.', String(error));
			}));

		} catch (e) {

			RegistrarEventoEnlace(contexto, 'ErrorCreandoUsuario', 'Hubo un error al crear el usuario después de usar el enlace.',
				{ hmacCorreo, error: String(e) }); // La causa más probable es una carrera de creación concurrente. No se resuelve aún: se registra para medir frecuencia real y decidir si amerita lógica de reconciliación.
			return { Resultado: ResultadoEntrada.ErrorSesión, Error: String(e) };

		}

	}

    const autenticaciónActual = await ObtenerAutenticación(contexto, ModoAutenticación.BaseDeDatos); // Primera llamada después de entrar: fuerza amr=BaseDeDatos y rehidrata la cookie de autenticación en cliente.

	if (autenticaciónActual.Usuario) {

		if (autenticaciónActual.Usuario.IdUsuario === idUsuario) { // Ya tiene sesión activa con el mismo usuario: no se crea sesión nueva, pero se usó el enlace y se invalidaron los demás.
			return { Resultado: ResultadoEntrada.YaAutenticado, IdUsuario: idUsuario };
        } else { // Sesión activa con otro usuario: se cierra la sesión actual antes de abrir la nueva. Si el usuario usa un enlace para iniciar sesión y la creación de la nueva sesión falla, es aceptable cerrar la sesión anterior y mostrar el error de inicio de sesión, dejando al usuario sin ninguna sesión abierta. Este comportamiento fue revisado y se considera válido.
			await CerrarSesiónActual(contexto); // Si bien el navegador aplica las cookies de manera secuencial y estas pueden ser borradas por las siguientes cookies de inicio de sesión, se prefiere dejarlas para los casos en los que pueda suceder excepción en el siguiente bloque de código.
		}

	}

	try {
		await AbrirSesiónEnContexto(contexto, idUsuario, rol); // No se necesita CrearUsuario: para este punto el usuario ya existe en base de datos porque el bloque if/else de arriba lo encontró (existente) o lo insertó (nuevo) antes de llegar aquí.
		RegistrarEventoEnlace(contexto, 'SesiónCreada', 'Sesión de usuario creada.', { hmacCorreo });
	} catch (error) {
		RegistrarEventoEnlace(contexto, 'ErrorSesión', 'Falló la creación de sesión después de usar el enlace.', { hmacCorreo });
		return { Resultado: ResultadoEntrada.ErrorSesión, Error: String(error) };
	}

   return { Resultado: ResultadoEntrada.SesiónCreada, IdUsuario: idUsuario };

}


export async function LimpiarEnlacesMágicosViejos(entorno: Entorno): Promise<void> { // Elimina enlaces mágicos no usados más antiguos que HorasRetenciónEnlacesMágicosViejos. Pensado para ejecutarse desde una tarea programada diaria, no desde el flujo de solicitud.

	await entorno.BASE_DE_DATOS.prepare(
		`DELETE FROM EnlacesMágicos WHERE FechaHoraCreado < datetime('now', '-${HorasRetenciónEnlacesMágicosViejos} hours')`)
		.run();

}


export async function ResponderSolicitudEnlaceMágico(contexto: Contexto, htmlFormulario: string, htmlMensaje: string,
	htmlCorreo: string, parámetrosEnlace: URLSearchParams = new URLSearchParams(),
	claveMensaje: string = 'enlace-mágico-mensaje-neutro'): Promise<Response> {

	if (!htmlMensaje.includes('[[respuesta]]')) throw new Error('htmlMensaje debe incluir la pseudovariable [[respuesta]].');

	if (contexto.Solicitud.method === 'GET') {
		return ResponderConMarco(contexto, htmlFormulario);
	} else if (contexto.Solicitud.method === 'POST') {

		const resultado = await ProcesarSolicitudEnlace(contexto, htmlCorreo, parámetrosEnlace);
		if (resultado.Resultado === ResultadoSolicitud.CorreoInválido) {
			return ResponderErrorConMarco(contexto, '{{enlace-mágico-correo-inválido}}', TipoError.EnlaceMágico);
		} else {

			const respuesta = await ObtenerTextoConSustituciones(contexto, claveMensaje,
				[{ 'correo-usuario': resultado.CorreoParaMostrar }]);

			return ResponderConMarco(contexto, htmlMensaje.replace('[[respuesta]]', respuesta));

		}

	} else return ResponderSoloGetYPostPermitidos(contexto, TipoError.EnlaceMágico);

}


export async function ResponderVerificaciónEnlaceMágico(contexto: Contexto, htmlConfirmación: string, htmlInicioEntrar: string,
	htmlFinEntrar: string): Promise<Response> {

	if (contexto.Solicitud.method !== 'GET') return ResponderSoloGetPermitido(contexto, TipoError.EnlaceMágico);
	if (!htmlConfirmación.includes('[[token]]')) throw new Error('htmlConfirmación debe incluir la pseudovariable [[token]].');

	const token = contexto.Url.searchParams.get('token') ?? '';
	const resultado = await ProcesarVerificaciónEnlace(contexto, token);
	const mensajeSolicitaNuevoEnlace = await ObtenerTextoConSustituciones(contexto, 'enlace-mágico-solicita-nuevo-token',
		[{ 'inicio-enlace-entrar-con-correo': htmlInicioEntrar }, { 'fin-enlace-entrar-con-correo': htmlFinEntrar }], true);

	switch (resultado.Resultado) {

		case ResultadoValidación.TokenFaltante:
			return ResponderErrorConMarco(contexto, '{{enlace-mágico-token-faltante}} ' + mensajeSolicitaNuevoEnlace,
				TipoError.EnlaceMágico, true);
		case ResultadoValidación.TokenInválido:
			return ResponderErrorConMarco(contexto, '{{enlace-mágico-token-inválido}} ' + mensajeSolicitaNuevoEnlace,
				TipoError.EnlaceMágico, true);
		case ResultadoValidación.TokenVencido:
			return ResponderErrorConMarco(contexto, '{{enlace-mágico-token-vencido}} ' + mensajeSolicitaNuevoEnlace,
				TipoError.EnlaceMágico, true);
		case ResultadoValidación.Válido: {
			return ResponderConMarco(contexto, htmlConfirmación.replace("[[token]]", Sanear(token)));
		}
		default:
            throw new Error(`Resultado de validación no soportado: ${String(resultado.Resultado)}`);

	}

}


export async function ResponderEntradaConEnlaceMágico(contexto: Contexto, rutaRedirecciónTrasIngreso: string,
	obtenerRutaTrasIngreso?: (idUsuario: string) => Promise<string | null>): Promise<Response> {

	if (contexto.Solicitud.method === 'POST') {

		let token = '';
		try {
			const datos = await contexto.Solicitud.formData();
			token = datos.get('token')?.toString() ?? '';
		} catch {
			return ResponderErrorConMarco(contexto, '{{enlace-mágico-token-faltante}}', TipoError.EnlaceMágico);
		}

		const resultado = await ProcesarEntradaConEnlace(contexto, token);

		switch (resultado.Resultado) {

			case ResultadoEntrada.TokenFaltante:
				return ResponderErrorConMarco(contexto, '{{enlace-mágico-token-faltante}}', TipoError.EnlaceMágico);
			case ResultadoEntrada.TokenInválido:
				return ResponderErrorConMarco(contexto, '{{enlace-mágico-token-inválido}}', TipoError.EnlaceMágico);
			case ResultadoEntrada.TokenVencido:
				return ResponderErrorConMarco(contexto, '{{enlace-mágico-token-vencido}}', TipoError.EnlaceMágico);
			case ResultadoEntrada.MétodoNoPermitido:
				return ResponderErrorConMarco(contexto, '{{enlace-mágico-método-no-permitido}}', TipoError.EnlaceMágico);
			case ResultadoEntrada.UsuarioNoActivo:
				return ResponderErrorConMarco(contexto, '{{enlace-mágico-usuario-no-activo}}', TipoError.Autenticación, false, null,
					EstadoError.NoAutorizado);
			case ResultadoEntrada.ErrorSesión:
				return ResponderErrorConMarco(contexto, '{{autenticación-sesión-error-crear}}', TipoError.Autenticación, false, null,
					EstadoError.ErrorServidor);
			case ResultadoEntrada.YaAutenticado:
			case ResultadoEntrada.SesiónCreada: {

				const rutaPersonalizada = resultado.IdUsuario && obtenerRutaTrasIngreso
					? await obtenerRutaTrasIngreso(resultado.IdUsuario) : null;
				return ResponderRedirección(contexto, rutaPersonalizada ?? rutaRedirecciónTrasIngreso);

			}
			default:
				throw new Error(`Resultado no soportado: ${String(resultado.Resultado)}`);

		}

	} else return ResponderSoloPostPermitido(contexto, TipoError.EnlaceMágico);

}
