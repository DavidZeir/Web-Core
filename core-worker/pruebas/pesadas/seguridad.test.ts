import { env, applyD1Migrations, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Worker, { CrearContexto } from '../../src/nucleo/inicio';
import { AbrirSesiónEnContexto, CerrarSesiónActual, ObtenerAutenticación } from '../../src/nucleo/autenticacion';
import { ProcesarEntradaConEnlace, ProcesarVerificaciónEnlace, ResultadoEntrada, ResultadoValidación }
	from '../../src/nucleo/enlaces-magicos';
import { type Contexto, type Entorno, ModoAutenticación, NombreCookieClienteJwt, NombreCookieSesión,
	CodificarBase64UrlBytes, CodificarBase64UrlTexto } from '../../src/nucleo/global';
import { ObtenerHashToken } from '../../src/nucleo/tokenes';
import { SegundosDuraciónAutenticaciónEnCliente, SegundosMáximosInactividadSesión } from '../../src/configuracion';
import { type DatosGoogleVerificados, VerificarIdTokenGoogle } from '../../src/nucleo/boton-google';
import { EstablecerProcesadorCorreo } from '../../src/nucleo/correos';

// Una sola suite evita cargar el entorno y el núcleo en tres Workers distintos.
describe('enlaces y sesiones con D1 local', () => {
	const IdUsuario = 'usuario-autenticacion-prueba';
	const Correo = 'autenticacion@ejemplo.test';

	beforeAll(() => applyD1Migrations(env.BASE_DE_DATOS, env.MIGRACIONES_PRUEBAS));

	beforeEach(async () => {
		vi.spyOn(console, 'log').mockImplementation(() => undefined);
		await env.BASE_DE_DATOS.batch(['Sesiones', 'Identidades', 'EnlacesMágicos', 'Usuarios']
			.map(tabla => env.BASE_DE_DATOS.prepare(`DELETE FROM ${tabla}`)));
	});

	afterEach(() => { vi.restoreAllMocks(); });


	function ContextoPrueba(cookies = ''): Contexto {
		const entorno = { ...env, MODO_EJECUCION: 'local', CLAVE_HMAC: 'hmac-solo-pruebas',
			CLAVE_IDENTIDAD_USUARIO_CLIENTE: 'identidad-solo-pruebas' } as unknown as Entorno;
		return CrearContexto(entorno, new Request('https://ejemplo.test/inicio', { headers: { Cookie: cookies } }),
			createExecutionContext(), crypto.randomUUID());
	}

	async function CrearUsuario(): Promise<void> {
		const ahora = new Date().toISOString();
		await env.BASE_DE_DATOS.prepare(`INSERT INTO Usuarios
			(IdUsuario, Correo, Estado, FechaHoraCreado, FechaHoraActualizado, Rol) VALUES (?, ?, 'Activo', ?, ?, 'Usuario')`)
			.bind(IdUsuario, Correo, ahora, ahora).run();
	}

	async function CrearEnlace(minutosAntigüedad = 0): Promise<string> {
		const token = crypto.randomUUID();
		await env.BASE_DE_DATOS.prepare(`INSERT INTO EnlacesMágicos
			(IdEnlace, Correo, HashTokenEnlace, FechaHoraCreado, FechaHoraUsado) VALUES (?, ?, ?, ?, NULL)`)
			.bind(crypto.randomUUID(), Correo, await ObtenerHashToken(token),
				new Date(Date.now() - minutosAntigüedad * 60_000).toISOString()).run();
		return token;
	}

	async function CrearSesiónConCookies(): Promise<string> {
		await CrearUsuario();
		const contexto = ContextoPrueba();
		await AbrirSesiónEnContexto(contexto, IdUsuario, 'Usuario');
		return contexto.CookiesRespuesta.map(cookie => cookie.split(';')[0]).join('; ');
	}

	async function ContarSesiones(): Promise<number> {
		return (await env.BASE_DE_DATOS.prepare('SELECT COUNT(*) AS Total FROM Sesiones').first<number>('Total'))!;
	}


	it('crea el usuario y una sesión con un enlace válido, y rechaza su reutilización', async () => {
		const token = await CrearEnlace();
		expect((await ProcesarVerificaciónEnlace(ContextoPrueba(), token)).Resultado).toBe(ResultadoValidación.Válido);
		const contexto = ContextoPrueba();
		expect((await ProcesarEntradaConEnlace(contexto, token)).Resultado).toBe(ResultadoEntrada.SesiónCreada);
		await waitOnExecutionContext(contexto.Ejecución);
		expect(contexto.CookiesRespuesta).toEqual(expect.arrayContaining([
			expect.stringContaining(`${NombreCookieSesión}=`), expect.stringContaining(`${NombreCookieClienteJwt}=`),
		]));
		expect(await env.BASE_DE_DATOS.prepare('SELECT Correo FROM Usuarios').first<string>('Correo')).toBe(Correo);
		expect((await ProcesarEntradaConEnlace(ContextoPrueba(), token)).Resultado).toBe(ResultadoEntrada.TokenInválido);
		expect(await ContarSesiones()).toBe(1);
	});

	it('rechaza un enlace vencido sin consumirlo ni abrir una sesión', async () => {
		const token = await CrearEnlace(11);
		expect((await ProcesarVerificaciónEnlace(ContextoPrueba(), token)).Resultado).toBe(ResultadoValidación.TokenVencido);
		expect((await ProcesarEntradaConEnlace(ContextoPrueba(), token)).Resultado).toBe(ResultadoEntrada.TokenVencido);
		expect(await env.BASE_DE_DATOS.prepare('SELECT FechaHoraUsado FROM EnlacesMágicos').first('FechaHoraUsado')).toBeNull();
		expect(await ContarSesiones()).toBe(0);
	});

	it('dos ingresos simultáneos con el mismo token crean exactamente una sesión', async () => {
		await CrearUsuario();
		const token = await CrearEnlace();
		const contextos = [ContextoPrueba(), ContextoPrueba()];
		const resultados = await Promise.all(contextos.map(contexto => ProcesarEntradaConEnlace(contexto, token)));
		await Promise.all(contextos.map(contexto => waitOnExecutionContext(contexto.Ejecución)));
		expect(resultados.map(r => r.Resultado)).toEqual(expect.arrayContaining([
			ResultadoEntrada.SesiónCreada, ResultadoEntrada.TokenInválido,
		]));
		expect(await ContarSesiones()).toBe(1);
		expect(contextos.filter(contexto => contexto.CookiesRespuesta.length > 0)).toHaveLength(1);
	});

	it('consume el enlace de un usuario bloqueado sin abrir sesión', async () => {
		await CrearUsuario();
		await env.BASE_DE_DATOS.prepare("UPDATE Usuarios SET Estado = 'Bloqueado'").run();
		const token = await CrearEnlace();
		expect((await ProcesarEntradaConEnlace(ContextoPrueba(), token)).Resultado).toBe(ResultadoEntrada.UsuarioNoActivo);
		expect(await ContarSesiones()).toBe(0);
	});
	it.each(['activa', 'cerrada', 'bloqueada', 'inactiva'])('resuelve contra D1 la sesión $0', async estado => {
		const cookies = await CrearSesiónConCookies();
		if (estado === 'cerrada') await CerrarSesiónActual(ContextoPrueba(cookies));
		if (estado === 'bloqueada') await env.BASE_DE_DATOS.prepare("UPDATE Usuarios SET Estado = 'Bloqueado'").run();
		if (estado === 'inactiva') await env.BASE_DE_DATOS.prepare('UPDATE Sesiones SET FechaHoraÚltimaActividad = ?')
			.bind(new Date(Date.now() - (SegundosMáximosInactividadSesión + 60) * 1000).toISOString()).run();
		const contexto = ContextoPrueba(cookies);
		const resultado = await ObtenerAutenticación(contexto, ModoAutenticación.BaseDeDatos);
		await waitOnExecutionContext(contexto.Ejecución);
		expect(resultado.Usuario?.IdUsuario ?? null).toBe(estado === 'activa' ? IdUsuario : null);
		expect(resultado.ModoResuelto).toBe(ModoAutenticación.BaseDeDatos);
		if (estado !== 'activa') {
			expect(contexto.CookiesRespuesta).toHaveLength(2);
			expect(contexto.CookiesRespuesta.every(cookie => cookie.includes('Max-Age=0'))).toBe(true);
		}
		if (estado === 'inactiva') expect(await env.BASE_DE_DATOS.prepare('SELECT MotivoCierre FROM Sesiones')
			.first<string>('MotivoCierre')).toBe('Inactividad');
	});

	it('el modo Cliente conserva la ventana aceptada y consulta la base al vencer', async () => {
		const cookies = await CrearSesiónConCookies();
		await env.BASE_DE_DATOS.prepare("UPDATE Usuarios SET Estado = 'Bloqueado'").run();
		const resultadoVigente = await ObtenerAutenticación(ContextoPrueba(cookies), ModoAutenticación.Cliente);
		expect(resultadoVigente.Usuario?.IdUsuario).toBe(IdUsuario);
		expect(resultadoVigente.ModoResuelto).toBe(ModoAutenticación.Cliente);
		const ahora = Date.now();
		vi.spyOn(Date, 'now').mockReturnValue(ahora + (SegundosDuraciónAutenticaciónEnCliente + 60) * 1000);
		const resultadoVencido = await ObtenerAutenticación(ContextoPrueba(cookies), ModoAutenticación.Cliente);
		expect(resultadoVencido.Usuario).toBeNull();
		expect(resultadoVencido.ModoResuelto).toBe(ModoAutenticación.BaseDeDatos);
	});
});

describe('tokens de Google con firma RSA real', () => {
	const Audiencia = 'cliente-google-de-prueba';
	const Nonce = 'nonce-del-flujo-de-prueba';
	let Claves: CryptoKeyPair;
	let ClavePública: JsonWebKey;

	beforeAll(async () => {
		Claves = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
		ClavePública = await crypto.subtle.exportKey('jwk', Claves.publicKey);
	});


	async function CrearToken(cambios: Partial<DatosGoogleVerificados> = {}, alterarFirma = false): Promise<string> {
		const cabecera = CodificarBase64UrlTexto(JSON.stringify({ alg: 'RS256', kid: 'clave-prueba', typ: 'JWT' }));
		const contenido = CodificarBase64UrlTexto(JSON.stringify({
			sub: 'usuario-google', email: 'google@ejemplo.test', email_verified: true,
			iss: 'https://accounts.google.com', aud: Audiencia, exp: Math.floor(Date.now() / 1000) + 300,
			nonce: Nonce, ...cambios,
		}));
		const firma = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', Claves.privateKey,
			new TextEncoder().encode(`${cabecera}.${contenido}`)));
		if (alterarFirma) firma[0] ^= 1;
		return `${cabecera}.${contenido}.${CodificarBase64UrlBytes(firma)}`;
	}

	function Verificar(token: string) {
		return VerificarIdTokenGoogle(token, { audience: Audiencia, nonce: Nonce,
			fetchImpl: async () => Response.json({ keys: [{ ...ClavePública, kid: 'clave-prueba', alg: 'RS256', use: 'sig' }] },
				{ headers: { 'Cache-Control': 'max-age=0' } }),
		});
	}


	it('acepta un token de Google válido firmado con RSA', async () => {
		expect(await Verificar(await CrearToken())).toMatchObject({ esValido: true, datos: { sub: 'usuario-google' } });
	});

	it.each([
		{ nombre: 'firma alterada', cambios: {}, alterarFirma: true, motivo: 'firma del token no es válida' },
		{ nombre: 'audiencia distinta', cambios: { aud: 'otro-cliente' }, motivo: 'Audience no coincide' },
		{ nombre: 'emisor distinto', cambios: { iss: 'https://atacante.test' }, motivo: 'Emisor inesperado' },
		{ nombre: 'expirado', cambios: { exp: 1 }, motivo: 'Token expirado' },
		{ nombre: 'nonce distinto', cambios: { nonce: 'otro-flujo' }, motivo: 'nonce no coincide' },
		{ nombre: 'nonce ausente', cambios: { nonce: undefined }, motivo: 'nonce pero está ausente' },
	])('rechaza token de Google: $nombre', async ({ cambios, alterarFirma, motivo }) => {
		expect(await Verificar(await CrearToken(cambios, alterarFirma))).toMatchObject({
			esValido: false, motivo: expect.stringContaining(motivo),
		});
	});
});

describe('alertas ante errores del Worker', () => {
	const RegistroErrores = vi.fn();

	beforeEach(() => {
		RegistroErrores.mockClear();
		vi.spyOn(console, 'error').mockImplementation(RegistroErrores);
		EstablecerProcesadorCorreo(async () => false);
	});

	afterEach(() => {
		EstablecerProcesadorCorreo(async () => false);
		vi.restoreAllMocks();
	});

	function EntornoPrueba(cola?: Queue): Entorno {
		return { ...env, API_URL: 'url-invalida-para-provocar-error', COLA_ALERTAS_SUPERVISOR: cola } as unknown as Entorno;
	}


	it('responde 500 sin esperar a la cola y mantiene el envío en waitUntil', async () => {
		let terminarEnvío!: () => void;
		const envío = new Promise<void>(resolver => { terminarEnvío = resolver; });
		const send = vi.fn().mockReturnValue(envío);
		const ejecución = createExecutionContext();
		const waitUntil = vi.spyOn(ejecución, 'waitUntil');
		try {
			const respuesta = await Worker.fetch(new Request('https://ejemplo.test') as Parameters<typeof Worker.fetch>[0],
				EntornoPrueba({ send } as unknown as Queue), ejecución);
			expect(respuesta.status).toBe(500);
			expect(waitUntil).toHaveBeenCalledOnce();
			expect(send).toHaveBeenCalledWith(expect.objectContaining({ TipoEvento: 'Error no manejado en el Worker' }));
		} finally {
			terminarEnvío();
			await waitOnExecutionContext(ejecución);
		}
	});

	it.each(['ausente', 'rechazada'])('captura el fallo de una cola $0 sin otro rechazo pendiente', async modo => {
		const ejecución = createExecutionContext();
		const cola = modo === 'ausente' ? undefined
			: { send: vi.fn().mockRejectedValue(new Error('Cola no disponible')) } as unknown as Queue;
		const respuesta = await Worker.fetch(new Request('https://ejemplo.test') as Parameters<typeof Worker.fetch>[0], EntornoPrueba(cola), ejecución);
		expect(respuesta.status).toBe(500);
		await expect(waitOnExecutionContext(ejecución)).resolves.toBeUndefined();
		expect(RegistroErrores).toHaveBeenCalledWith('No se pudo enviar la alerta crítica.',
			expect.objectContaining({ tipoEvento: 'Error no manejado en el Worker', error: expect.any(String), idSolicitud: expect.any(String) }));
	});

	it.each([
		{ modo: 'reenvío', tipoEvento: 'Error reenviando correo entrante' },
		{ modo: 'procesador', tipoEvento: 'ProcesadorCorreos. Error' },
	])('captura el fallo de la alerta de $modo y conserva el reenvío', async ({ modo, tipoEvento }) => {
		if (modo === 'procesador') EstablecerProcesadorCorreo(async () => { throw new Error('Procesador no disponible'); });
		const ejecución = createExecutionContext();
		const waitUntil = vi.spyOn(ejecución, 'waitUntil');
		const forward = vi.fn(async () => { if (modo === 'reenvío') throw new Error('Reenvío no disponible'); });
		await Worker.email({ forward } as unknown as ForwardableEmailMessage, EntornoPrueba(), ejecución);
		await expect(waitOnExecutionContext(ejecución)).resolves.toBeUndefined();
		expect(forward).toHaveBeenCalledOnce();
		expect(waitUntil).toHaveBeenCalledOnce();
		expect(RegistroErrores).toHaveBeenCalledWith('No se pudo enviar la alerta crítica.', expect.objectContaining({ tipoEvento }));
	});
});
