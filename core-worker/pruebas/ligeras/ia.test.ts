import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import {
	CódigoErrorIA,
	ClasificarErrorConectorIA,
	ResolverValorEscalado,
    LimpiarRazonamientoTipoThink,
    FiltrarRazonamientoTipoThink,
    FinalizarFiltroRazonamiento,
	ResolverCadenaConectores,
	ObtenerConectorDesdeModeloOConector,
	ConsultarIADirecto,
	ConsultarIA,
	ConsultaIAProtegida,
	ConsultaIAProtegidaDirecto,
	DetectarBloqueoProveedor,
	ResponderResultadoIADirecto,
	ValidarEntradaIA,
	AplicarParámetrosOpcionales,
	EstadoFiltroRazonamiento,
	type ParámetrosNormalizados,
} from '../../src/nucleo/ia';
import { ConectoresIA, ProveedoresIA } from '../../src/configuracion';
import type { Contexto } from '../../src/nucleo/global';
import { ModelosIAEspecíficos } from '../../src/configuracion';
import { CrearEstadoBúsquedaParallel, EjecutarBúsquedasParallel } from '../../src/nucleo/ia/parallel';


const enviarAlertaErrorCriticoMock = vi.hoisted(() => vi.fn());
const EnlaceCitaParallelPrueba = '([ejemplo.test](https://ejemplo.test/fuente))';
const SegundoEnlaceCitaParallelPrueba = '([otra.test](https://otra.test/dato))';

vi.mock('../../src/nucleo/alertas', () => ({
	EnviarAlertaErrorCrítico: enviarAlertaErrorCriticoMock,
}));


function CrearContextoConsultaOpenAI(modo: 'Directo' | 'Flujo', modelo = 'gpt-5.5-in-openai', razonamiento = 1,
	campos: Record<string, unknown> = {}, ignorarRespaldos = true): Contexto {

	return {
		IdSolicitud: `solicitud-cache-${modo.toLowerCase()}`,
		Solicitud: new Request(`https://ejemplo.test/ia${ignorarRespaldos ? '?ignorarRespaldos=true' : ''}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				Modo: modo, IdSolicitud: `solicitud-cache-${modo.toLowerCase()}`,
				ModeloOConector: modelo, MensajeUsuario: 'consulta de prueba',
				Razonamiento: razonamiento, Verbosidad: 1, TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es', ...campos
			}),
		}),
		Entorno: { CLAVE_OPENAI: 'clave-prueba' },
		Ejecución: { waitUntil: vi.fn() },
		Autenticación: null,
	} as unknown as Contexto;

}


function CrearContextoConsultaGemini(modo: 'Directo' | 'Flujo', razonamiento = 3,
	campos: Record<string, unknown> = {}, ignorarRespaldos = true): Contexto {

	return {
		IdSolicitud: `solicitud-gemini-${modo.toLowerCase()}`,
		Solicitud: new Request(`https://ejemplo.test/ia${ignorarRespaldos ? '?ignorarRespaldos=true' : ''}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				Modo: modo, IdSolicitud: `solicitud-gemini-${modo.toLowerCase()}`,
				ModeloOConector: 'gemini-3.7-flash', MensajeUsuario: 'consulta de prueba',
				Razonamiento: razonamiento, Verbosidad: 1, TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es', ...campos
			}),
		}),
		Entorno: {
			CLAVE_GOOGLE: 'clave-prueba',
			RECURSOS: { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ 'ia-verbosidad-1': 'Responde de forma concisa.' }), {
				status: 200, headers: { 'content-type': 'application/json' }
			})) }
		},
		Ejecución: { waitUntil: vi.fn() },
		Autenticación: null,
	} as unknown as Contexto;

}


function CrearContextoConsultaProtegida(modo: 'Directo' | 'Flujo' = 'Directo'): Contexto {

	return {
		IdSolicitud: 'solicitud-moderacion',
		Solicitud: new Request('https://ejemplo.test/ia', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				Modo: modo, IdSolicitud: 'solicitud-moderacion', ModeloOConector: 'gpt-5.5-in-openai',
				MensajeUsuario: 'consulta de prueba', Razonamiento: 1, Verbosidad: 1, TókenesMáximos: 100,
				SegundosMáximos: 30, Idioma: 'es'
			}),
		}),
		Entorno: {
			CLAVE_OPENAI: 'clave-prueba', CLAVE_DEEPINFRA: 'clave-prueba',
			RECURSOS: { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
				'ia-consulta-vacía': 'La consulta está vacía.', 'ia-consulta-demasiado-larga': 'La consulta es demasiado larga.',
				'ia-consulta-no-permitida': 'La consulta no está permitida.', 'ia-consulta-no-validada': 'La consulta no pudo validarse.',
				'ia-verbosidad-1': ''
			}))) },
			IA: { run: vi.fn().mockRejectedValue(new Error('Cloudflare Workers AI no disponible.')) },
		},
		Ejecución: { waitUntil: vi.fn() },
		Autenticación: null,
	} as unknown as Contexto;

}


const NombreConectorAnthropicPrueba = 'claude-prueba-in-anthropic';
const IdentificadorUsuarioEsperado = 'u_fd5cc8e6435ebf949188fe149336cf91';
const ConectoresIdentificadorPrueba = [
	'gpt-5.5-in-openai', 'deepseek-v4-flash-in-deepseek', 'llama-guard-4-12b-in-deepinfra',
	NombreConectorAnthropicPrueba
];


function CrearContextoConsultaProveedor(modo: 'Directo' | 'Flujo', conector: string,
	campos: Record<string, unknown> = {}, ignorarRespaldos = true): Contexto {

	const contexto = CrearContextoConsultaOpenAI(modo, conector, 1, {
		safety_identifier: 'falso', user_id: 'falso', user: 'falso', metadata: { user_id: 'falso' }, ...campos
	}, ignorarRespaldos);
	Object.assign(contexto.Entorno, {
		CLAVE_DEEPSEEK: 'clave-prueba', CLAVE_DEEPINFRA: 'clave-prueba', CLAVE_ANTHROPIC: 'clave-prueba',
		CLAVE_PARASAIL: 'clave-prueba', CLAVE_PARALLEL: 'clave-parallel-prueba',
		RECURSOS: { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
			'ia-verbosidad-1': 'Responde de forma concisa.'
		}))) }
	});
	contexto.Autenticación = { Usuario: { IdUsuario: ' Usuario-Identificador ' } } as Contexto['Autenticación'];
	return contexto;

}


function ObtenerIdentificadoresDeCuerpos(cuerpos: Record<string, unknown>[]): unknown[] {

	return [
		cuerpos[0].safety_identifier,
		cuerpos[1].user_id,
		cuerpos[2].user,
		(cuerpos[3].metadata as Record<string, unknown>).user_id
	];

}


function CrearFetchCapturador(cuerpos: Record<string, unknown>[]): ReturnType<typeof vi.fn> {

	return vi.fn().mockImplementation((_entrada: string | URL | Request, opciones?: RequestInit) => {

		cuerpos.push(JSON.parse(String(opciones?.body)) as Record<string, unknown>);
		return Promise.reject(new Error('Fallo intencional después de capturar el cuerpo.'));

	});

}


describe('Máximos de salida por proveedor', () => {

	const parámetrosBase: ParámetrosNormalizados = {
		Idioma: 'es', Temperatura: undefined, Razonamiento: undefined, Verbosidad: undefined,
		MáximosTokenes: 200_000, MensajeSistemaFinal: undefined,
	};

	it('acota el límite del llamador al máximo típico de Gemini', () => {
		const destino: Record<string, unknown> = {};
		AplicarParámetrosOpcionales(destino, ConectoresIA['gemini-3.7-flash-in-google'], parámetrosBase, 'Gemini');
		expect(destino.maxOutputTokens).toBe(65_536);
	});

	it('permite el máximo típico de DeepSeek', () => {
		const destino: Record<string, unknown> = {};
		AplicarParámetrosOpcionales(destino, ConectoresIA['deepseek-v4-pro-in-deepseek'], parámetrosBase, 'OpenAI Chat');
		expect(destino.max_tokens).toBe(200_000);
	});

});


describe('Moderación protegida', () => {

	it('envía alerta crítica cuando fallan todos los conectores de moderación', async () => {

		enviarAlertaErrorCriticoMock.mockReset();
		const contexto = CrearContextoConsultaProtegida();
		const fetchMock = vi.fn().mockRejectedValue(new Error('Proveedor de moderación no disponible.'));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultaIAProtegidaDirecto(contexto, new AbortController().signal);

			expect(resultado.Tipo).toBe('Error');
			expect(resultado.Errores[0].Código).toBe(CódigoErrorIA.ModeraciónNoDisponible);
			expect(resultado.UnidadesInfracción).toBe(0);
			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect((contexto.Entorno.IA as unknown as { run: ReturnType<typeof vi.fn>; }).run).toHaveBeenCalledTimes(1);
			expect(enviarAlertaErrorCriticoMock).toHaveBeenCalledWith(contexto, 'IAModeraciónConectoresFallidos',
				'Fallaron todos los conectores de moderación de contenido.', expect.stringContaining('omni-moderation-latest-in-openai'));
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('asigna una unidad cuando la moderación rechaza el contenido', async () => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			results: [{ flagged: true, categories: { violence: true } }]
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultaIAProtegidaDirecto(CrearContextoConsultaProtegida(),
				new AbortController().signal);

			expect(resultado.Tipo).toBe('Error');
			expect(resultado.Errores[0].Código).toBe(CódigoErrorIA.ContenidoNoPermitido);
			expect(resultado.UnidadesInfracción).toBe(1);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('conserva la señal del moderador si el usuario cancela después del bloqueo', async () => {

		const cancelación = new AbortController();
		const fetchMock = vi.fn().mockImplementation(async () => {
			cancelación.abort();
			return new Response(JSON.stringify({ error: { code: 'content_filter' } }), {
				status: 400, headers: { 'content-type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultaIAProtegidaDirecto(CrearContextoConsultaProtegida(), cancelación.signal);

			expect(resultado.Tipo).toBe('Error');
			expect(resultado.Errores[0].Código).toBe(CódigoErrorIA.SolicitudCancelada);
		expect(resultado.UnidadesInfracción).toBe(1);
			expect(resultado.FuenteInfracción).toEqual(expect.objectContaining({
				Conector: 'omni-moderation-latest-in-openai', Proveedor: 'open-ai-moderations',
				Modelo: 'omni-moderation-latest', Señal: 'code:content_filter', EstadoHttp: 400
			}));
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			vi.unstubAllGlobals();
		}

	});

});


describe('Unidades de infracción de proveedores', () => {

	it('clasifica únicamente las finalizaciones de Gemini atribuidas al contenido', () => {

		for (const [razón, unidades] of [
			['SAFETY', 3], ['PROHIBITED_CONTENT', 3], ['BLOCKLIST', 0], ['RECITATION', 0], ['LANGUAGE', 0],
			['SPII', 0], ['IMAGE_SAFETY', 0]
		] as const) {
			const bloqueo = DetectarBloqueoProveedor({ candidates: [{ finishReason: razón }] }, 200, 'google');
			expect(bloqueo?.UnidadesInfracción).toBe(unidades);
		}
		for (const razón of ['OTHER', 'FINISH_REASON_UNSPECIFIED', 'RAZON_DESCONOCIDA'])
			expect(DetectarBloqueoProveedor({ candidates: [{ finishReason: razón }] }, 200, 'google')).toBeNull();

	});

	it('clasifica razones explícitas de bloqueo del prompt Gemini salvo la no especificada', () => {

		for (const [razón, unidades] of [
			['SAFETY', 3], ['PROHIBITED_CONTENT', 3], ['BLOCKLIST', 0], ['OTHER', 0], ['IMAGE_SAFETY', 0],
			['RAZON_FUTURA_EXPLICITA', 0]
		] as const) {
			const bloqueo = DetectarBloqueoProveedor({ promptFeedback: { blockReason: razón } }, 200, 'google');
			expect(bloqueo?.UnidadesInfracción).toBe(unidades);
		}
		expect(DetectarBloqueoProveedor({
			promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' }
		}, 200, 'google')).toBeNull();

	});

	it('prioriza las señales estructuradas de rechazo sobre el estado HTTP', () => {

		const bloqueoCódigo = DetectarBloqueoProveedor({
			error: { code: 'content_filter', message: 'Safety service temporarily unavailable' }
		}, 503, 'open-ai');
		const bloqueoCódigoGoogle = DetectarBloqueoProveedor({
			error: { code: 'content_filter' }
		}, 400, 'google');
		const bloqueoCódigoPolítica = DetectarBloqueoProveedor({
			error: { code: 'content_policy_violation' }
		}, 403, 'open-ai');
		const bloqueoFinalización = DetectarBloqueoProveedor({
			choices: [{ finish_reason: 'content_filter' }]
		}, 503, 'deepseek');
		const bloqueoRechazo = DetectarBloqueoProveedor({
			choices: [{ message: { refusal: "I can't assist with that request" } }]
		}, 503, 'open-ai');
		const bloqueoRechazoResponses = DetectarBloqueoProveedor({
			output: [{ content: [{ type: 'refusal', refusal: 'I cannot help with that request.' }] }]
		}, 200, 'open-ai');
		const bloqueoAnthropic = DetectarBloqueoProveedor({ stop_reason: 'refusal' }, 503, 'anthropic');
		const bloqueoAnthropicDetalles = DetectarBloqueoProveedor({ stop_details: { type: 'refusal' } }, 200, 'anthropic');
		const bloqueoMensajeGoogle = DetectarBloqueoProveedor({
			error: { message: 'Request blocked by safety policy' }
		}, 403, 'google');

		expect(bloqueoCódigo?.UnidadesInfracción).toBe(3);
		expect(bloqueoCódigoGoogle?.UnidadesInfracción).toBe(0);
		expect(bloqueoCódigoPolítica?.UnidadesInfracción).toBe(3);
		expect(bloqueoFinalización?.UnidadesInfracción).toBe(3);
		expect(bloqueoRechazo?.UnidadesInfracción).toBe(3);
		expect(bloqueoRechazoResponses?.UnidadesInfracción).toBe(3);
		expect(bloqueoAnthropic?.UnidadesInfracción).toBe(3);
		expect(bloqueoAnthropicDetalles?.UnidadesInfracción).toBe(3);
		expect(bloqueoMensajeGoogle?.UnidadesInfracción).toBe(0);

	});

	it('descarta errores operativos inequívocos antes de analizar mensajes ambiguos', () => {

		for (const [datos, estado] of [
			[{ error: { message: 'Safety service temporarily unavailable' } }, 503],
			[{ error: { message: 'Account blocked' } }, 403],
			[{ error: { code: 'content_filter_unavailable' } }, 400],
			[{ error: { type: 'overloaded_error', message: 'Policy service overloaded' } }, 400],
			[{ error: { message: 'Policy validation failed because of rate limit' } }, 429],
			[{ error: { message: 'Content filter unavailable' } }, 400],
			[{ error: { message: 'Your API key was reported as leaked. Please use another API key.' } }, 403],
			[{ error: { message: 'Invalid moderation policy configuration' } }, 400],
			[{ error: { message: 'Invalid content policy configuration' } }, 400],
			[{ error: { message: 'Content filter is not configured' } }, 400]
		] as const) expect(DetectarBloqueoProveedor(datos, estado, 'open-ai')).toBeNull();

	});

	it('usa fragmentos textuales especificos sin contar palabras aisladas', () => {

		for (const mensaje of [
			'Request blocked by content filter', 'Output blocked by safety filter',
			'Prohibited content detected', 'Unsafe content detected'
		]) {
			const bloqueo = DetectarBloqueoProveedor({ error: { message: mensaje } }, 403, 'open-ai');
			expect(bloqueo?.Razón).toBe('message');
			expect(bloqueo?.UnidadesInfracción).toBe(1);
		}

		for (const mensaje of ['Safety checks are enabled', 'Invalid moderation policy configuration', 'The response policy was applied'])
			expect(DetectarBloqueoProveedor({ error: { message: mensaje } }, 400, 'open-ai')).toBeNull();

	});

	it('mantiene como infracción un rechazo textual no operativo', () => {

		const bloqueo = DetectarBloqueoProveedor({
			error: { message: 'Request blocked by safety policy' }
		}, 403, 'open-ai');

		expect(bloqueo?.Razón).toBe('message');
		expect(bloqueo?.UnidadesInfracción).toBe(1);

	});

	it('conserva un rechazo duro aunque un respaldo entregue respuesta y no lo expone en HTTP', async () => {

		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'content_filter' } }), {
				status: 400, headers: { 'content-type': 'application/json' }
			}))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				status: 'completed', output_text: 'respuesta', usage: { input_tokens: 1, output_tokens: 1 }
			}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-5.5-in-openai', 1,
				{ RespaldoModeloOConector: 'gpt-5.4-mini-in-openai', RespaldoRazonamiento: 1 }, false),
				new AbortController().signal);
			const cuerpoPúblico = await ResponderResultadoIADirecto(resultado).json() as Record<string, unknown>;

			expect(resultado.Tipo).toBe('Respuesta');
			expect(resultado.UnidadesInfracción).toBe(3);
			expect(resultado.FuenteInfracción).toEqual(expect.objectContaining({
				Conector: 'gpt-5.5-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.5', Señal: 'code:content_filter', EstadoHttp: 400
			}));
			expect(cuerpoPúblico.UnidadesInfracción).toBeUndefined();
			expect(cuerpoPúblico.FuenteInfracción).toBeUndefined();
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('no conserva unidades de un error operativo cuando el respaldo entrega respuesta', async () => {

		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				error: { type: 'overloaded_error', message: 'Safety service temporarily unavailable' }
			}), { status: 503, headers: { 'content-type': 'application/json' } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				status: 'completed', output_text: 'respuesta', usage: { input_tokens: 1, output_tokens: 1 }
			}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-5.5-in-openai', 1,
				{ RespaldoModeloOConector: 'gpt-5.4-mini-in-openai', RespaldoRazonamiento: 1 }, false),
				new AbortController().signal);

			expect(resultado.Tipo).toBe('Respuesta');
			expect(resultado.UnidadesInfracción).toBe(0);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('incluye la moderación integrada en Responses y suma una unidad por entrada marcada', async () => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta',
			moderation: {
				input: { type: 'moderation_result', flagged: true },
				output: { type: 'moderation_result', flagged: false }
			},
			usage: { input_tokens: 1, output_tokens: 1 }
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo'),
				new AbortController().signal);
			const cuerpo = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>;

			expect(cuerpo.moderation).toEqual({
				model: 'omni-moderation-latest',
				policy: { input: { mode: 'score' }, output: { mode: 'score' } }
			});
			expect(resultado.Tipo).toBe('Respuesta');
			expect(resultado.UnidadesInfracción).toBe(1);
			expect(resultado.FuenteInfracción).toEqual(expect.objectContaining({
				Conector: 'gpt-5.5-in-openai', Proveedor: 'open-ai', Señal: 'moderation.input.flagged', EstadoHttp: null
			}));
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('descarta la marca de salida y no duplica unidades cuando ambas están marcadas', async () => {

		const crearRespuesta = (entradaMarcada: boolean, salidaMarcada: boolean) => new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta',
			moderation: {
				input: { type: 'moderation_result', flagged: entradaMarcada },
				output: { type: 'moderation_result', flagged: salidaMarcada }
			},
			usage: { input_tokens: 1, output_tokens: 1 }
		}), { headers: { 'content-type': 'application/json' } });
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(crearRespuesta(false, true))
			.mockResolvedValueOnce(crearRespuesta(true, true));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const soloSalida = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo'), new AbortController().signal);
			const entradaYSalida = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo'), new AbortController().signal);

			expect(soloSalida.UnidadesInfracción).toBe(0);
			expect(entradaYSalida.UnidadesInfracción).toBe(1);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('ignora resultados de moderación ausentes, de error o con flagged no booleano', async () => {

		const crearRespuesta = (moderation: unknown) => new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta', moderation, usage: { input_tokens: 1, output_tokens: 1 }
		}), { headers: { 'content-type': 'application/json' } });
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(crearRespuesta({ input: { type: 'error', flagged: true } }))
			.mockResolvedValueOnce(crearRespuesta({ output: { type: 'moderation_result', flagged: true } }))
			.mockResolvedValueOnce(crearRespuesta({ input: { type: 'moderation_result', flagged: 'true' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			for (let intento = 0; intento < 3; intento++) {
				const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo'),
					new AbortController().signal);
				expect(resultado.Tipo).toBe('Respuesta');
				expect(resultado.UnidadesInfracción).toBe(0);
			}
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('conserva una marca de entrada del respaldo OpenAI después de un error operativo del principal', async () => {

		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				error: { type: 'overloaded_error', message: 'Safety service temporarily unavailable' }
			}), { status: 503, headers: { 'content-type': 'application/json' } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				status: 'completed', output_text: 'respuesta',
				moderation: { input: { type: 'moderation_result', flagged: true } },
				usage: { input_tokens: 1, output_tokens: 1 }
			}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-5.5-in-openai', 1,
				{ RespaldoModeloOConector: 'gpt-5.4-mini-in-openai', RespaldoRazonamiento: 1 }, false),
				new AbortController().signal);

			expect(resultado.Tipo).toBe('Respuesta');
			expect(resultado.UnidadesInfracción).toBe(1);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('asigna tres unidades a un content_filter de Responses aunque la respuesta quede incompleta', async () => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output: []
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo'),
				new AbortController().signal);

			expect(resultado.Tipo).toBe('Error');
			expect(resultado.UnidadesInfracción).toBe(3);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('rechaza el flujo OpenAI antes de llamar al proveedor con moderación integrada activa', async () => {

		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		try {
			await expect(ConsultarIA(CrearContextoConsultaOpenAI('Flujo'), new AbortController().signal))
				.rejects.toThrow('El modo Flujo no es compatible con UsarModeraciónIntegradaOpenAI=true. Desactiva UsarModeraciónIntegradaOpenAI para usar Flujo.');
			expect(fetchMock).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('rechaza el flujo protegido OpenAI antes de moderar o llamar al proveedor', async () => {

		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		try {
			await expect(ConsultaIAProtegida(CrearContextoConsultaProtegida('Flujo'), new AbortController().signal))
				.rejects.toThrow('El modo Flujo no es compatible con UsarModeraciónIntegradaOpenAI=true');
			expect(fetchMock).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}

	});

});


describe('Identificador de usuario para proveedores de IA', () => {

	beforeAll(() => {

		ConectoresIA[NombreConectorAnthropicPrueba] = {
			...ConectoresIA['gpt-5.5-in-openai'],
			Nombre: NombreConectorAnthropicPrueba, Proveedor: 'anthropic', Modelo: 'claude-prueba',
			RangoTemperaturaSoportado: [0, 1],
			RazonamientoConfigurable: false, MapeoRazonamiento: [], VerbosidadConfigurable: false, MapeoVerbosidad: [],
			NombreParámetroMáximosTokenes: 'max_tokens', Respaldo: null, RespaldoFinal: null
		};

	});

	afterAll(() => { delete ConectoresIA[NombreConectorAnthropicPrueba]; });

	it('mapea el identificador por proveedor en directo y flujo sin filtrarlo a proveedores no compatibles', async () => {

		for (const modo of ['Directo', 'Flujo'] as const) {
			const cuerpos: Record<string, unknown>[] = [];
			vi.stubGlobal('fetch', CrearFetchCapturador(cuerpos));

			try {
				for (const conector of ConectoresIdentificadorPrueba) {
					const contexto = CrearContextoConsultaProveedor(modo, conector);
					if (modo === 'Directo') await ConsultarIADirecto(contexto, new AbortController().signal);
					else if (conector === 'gpt-5.5-in-openai')
						await expect(ConsultarIA(contexto, new AbortController().signal))
							.rejects.toThrow('El modo Flujo no es compatible con UsarModeraciónIntegradaOpenAI=true');
					else await (await ConsultarIA(contexto, new AbortController().signal)).text();
				}

				const identificadores = modo === 'Flujo'
					? [cuerpos[0].user_id, cuerpos[1].user, (cuerpos[2].metadata as Record<string, unknown>).user_id]
					: ObtenerIdentificadoresDeCuerpos(cuerpos);
				expect(identificadores).toEqual(Array(modo === 'Flujo' ? 3 : 4).fill(IdentificadorUsuarioEsperado));
				if (modo === 'Directo') {
					await ConsultarIADirecto(CrearContextoConsultaProveedor(modo, 'kimi-k2.6-in-parasail'),
						new AbortController().signal);
					for (const campo of ['safety_identifier', 'user_id', 'user', 'metadata'])
						expect(cuerpos[4]).not.toHaveProperty(campo);
				}
			} finally {
				vi.unstubAllGlobals();
			}
		}

	});

	it('cuenta refusal de Anthropic con tres unidades en directo y en flujo', async () => {
		const respuestaDirecta = new Response(JSON.stringify({
			stop_reason: 'refusal', stop_details: { type: 'refusal' }
		}), { headers: { 'content-type': 'application/json' } });
		const flujo = [
			`data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'refusal', stop_details: { type: 'refusal' } } })}\n\n`,
			'data: {"type":"message_stop"}\n\n',
		].join('');
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(respuestaDirecta)
			.mockResolvedValueOnce(new Response(flujo, { headers: { 'content-type': 'text/event-stream' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultadoDirecto = await ConsultarIADirecto(CrearContextoConsultaProveedor('Directo', NombreConectorAnthropicPrueba),
				new AbortController().signal);
			const respuestaFlujo = await ConsultarIA(CrearContextoConsultaProveedor('Flujo', NombreConectorAnthropicPrueba),
				new AbortController().signal);
			const eventosFlujo = (await respuestaFlujo.text()).trim().split('\n').map(linea => JSON.parse(linea) as {
				Tipo: string; Errores?: { Código: string; }[];
			});

			expect(resultadoDirecto.Tipo).toBe('Error');
			expect(resultadoDirecto.UnidadesInfracción).toBe(3);
			expect(eventosFlujo.find(evento => evento.Tipo === 'Error')?.Errores?.[0].Código)
				.toBe(CódigoErrorIA.ContenidoNoPermitido);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllGlobals();
		}

	});

});


describe('Conectores Gemini', () => {

	it('resuelve el modelo específico y serializa la petición con el adaptador Gemini existente', async () => {

		expect(ObtenerConectorDesdeModeloOConector('gemini-3.7-flash')).toBe('gemini-3.7-flash-in-google');
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'respuesta' }] } }],
			usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaGemini('Directo'), new AbortController().signal);
			const llamada = fetchMock.mock.calls[0];
			const cuerpo = JSON.parse(String(llamada[1].body)) as Record<string, unknown>;
			const configuración = cuerpo.generationConfig as Record<string, unknown>;

			expect(String(llamada[0])).toContain('/models/gemini-3.7-flash:generateContent');
			expect(configuración.maxOutputTokens).toBe(100);
			expect(configuración.thinkingConfig).toEqual({ thinkingLevel: 'medium' });
			expect(configuración.temperature).toBeUndefined();
			expect(resultado.Texto).toBe('respuesta');
			expect(resultado.UsoTókenes).toMatchObject({ EntradaNoCaché: 10, SalidaRazonamiento: 2, SalidaNoRazonamiento: 5 });
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('declara Gemini 3.8 Flash con los parámetros nativos y la tarifa estándar', async () => {

		const conector = ConectoresIA['gemini-3.8-flash-in-google'];
		expect(ObtenerConectorDesdeModeloOConector('gemini-3.8-flash')).toBe('gemini-3.8-flash-in-google');
		expect(conector).toBeDefined();
		expect(conector.Modelo).toBe('gemini-3.8-flash');
		expect(conector.RangoTemperaturaSoportado).toBeNull();
		expect(conector.SoportaFlujo).toBe(true);
		expect(conector.RazonamientoConfigurable).toBe(true);
		expect(conector.MapeoRazonamiento).toEqual(['low', 'medium', 'high']);
		expect(conector.NombreParámetroMáximosTokenes).toBe('maxOutputTokens');
		expect(conector.MáximoTókenesEntradaTarifaEstándar).toBeUndefined();
		expect(conector.TarifaContextoLargo).toBeUndefined();
		expect(conector.Precios).toMatchObject({
			EntradaCaché: 0.075, EntradaNoCaché: 0.75, SalidaRazonamiento: 3.75, SalidaNoRazonamiento: 3.75,
			AlmacenamientoCachéPorHora: 0.50,
		});

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'respuesta' }] } }],
			usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaGemini('Directo', 3,
				{ ModeloOConector: 'gemini-3.8-flash-in-google' }), new AbortController().signal);
			const llamada = fetchMock.mock.calls[0];
			const cuerpo = JSON.parse(String(llamada[1].body)) as Record<string, unknown>;
			const configuración = cuerpo.generationConfig as Record<string, unknown>;

			expect(String(llamada[0])).toContain('/models/gemini-3.8-flash:generateContent');
			expect(configuración.maxOutputTokens).toBe(100);
			expect(configuración.thinkingConfig).toEqual({ thinkingLevel: 'medium' });
			expect(configuración.temperature).toBeUndefined();
			expect(resultado.Texto).toBe('respuesta');
			expect(resultado.UsoTókenes).toMatchObject({ EntradaNoCaché: 10, SalidaRazonamiento: 2, SalidaNoRazonamiento: 5 });
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('aplica la tarifa de contexto largo de Gemini 3.1 Pro solo por encima de 200.000 tokens', async () => {

		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({
				candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'respuesta estándar' }] } }],
				usageMetadata: { promptTokenCount: 200_000, candidatesTokenCount: 10, thoughtsTokenCount: 5 },
			}), { headers: { 'content-type': 'application/json' } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({
				candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'respuesta extendida' }] } }],
				usageMetadata: { promptTokenCount: 200_001, cachedContentTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 5 },
			}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const crearContexto = (): Contexto => CrearContextoConsultaGemini('Directo', 3,
				{ ModeloOConector: 'gemini-3.1-pro-in-google' });
			const resultadoEstándar = await ConsultarIADirecto(crearContexto(), new AbortController().signal);
			const resultadoExtendido = await ConsultarIADirecto(crearContexto(), new AbortController().signal);

			expect(resultadoEstándar.UsoTókenesTarifaExtendida).toEqual({
				EntradaCaché: 0, EntradaNoCaché: 0, EscrituraCaché: 0,
				SalidaRazonamiento: 0, SalidaNoRazonamiento: 0,
			});
			expect(resultadoEstándar.CostoDólares).toBeCloseTo((200_000 * 2 + 15 * 12) / 1_000_000, 12);
			expect(resultadoExtendido.UsoTókenesTarifaExtendida).toEqual({
				EntradaCaché: 100, EntradaNoCaché: 199_901, EscrituraCaché: 0,
				SalidaRazonamiento: 5, SalidaNoRazonamiento: 10,
			});
			expect(resultadoExtendido.CostoDólares).toBeCloseTo(
				(100 * 0.2 * 2 + 199_901 * 2 * 2 + (5 + 10) * 12 * 1.5) / 1_000_000, 12);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('distingue recitación de una finalización desconocida en modo directo', async () => {

		const fetchMock = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: 'RECITATION' }] }), {
				headers: { 'content-type': 'application/json' }
			}))
			.mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ finishReason: 'OTHER' }] }), {
				headers: { 'content-type': 'application/json' }
			}));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultadoRecitación = await ConsultarIADirecto(CrearContextoConsultaGemini('Directo'),
				new AbortController().signal);
			const resultadoOtro = await ConsultarIADirecto(CrearContextoConsultaGemini('Directo'),
				new AbortController().signal);

			expect(resultadoRecitación.Errores[0].Código).toBe(CódigoErrorIA.ContenidoNoPermitido);
			expect(resultadoRecitación.UnidadesInfracción).toBe(0);
			expect(resultadoOtro.Errores[0].Código).toBe(CódigoErrorIA.ProveedorNoDisponible);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('aplica la misma clasificación Gemini en modo flujo', async () => {

		const crearRespuestaSse = (finishReason: string): Response => new Response(
			`data: ${JSON.stringify({ candidates: [{ finishReason }] })}\n\n`,
			{ headers: { 'content-type': 'text/event-stream' } });
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(crearRespuestaSse('RECITATION'))
			.mockResolvedValueOnce(crearRespuestaSse('OTHER'));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const textoRecitación = await (await ConsultarIA(CrearContextoConsultaGemini('Flujo'),
				new AbortController().signal)).text();
			const textoOtro = await (await ConsultarIA(CrearContextoConsultaGemini('Flujo'),
				new AbortController().signal)).text();
			const eventosRecitación = textoRecitación.trim().split('\n').map(línea => JSON.parse(línea) as {
				Tipo: string; Errores?: { Código: string; }[];
			});
			const eventosOtro = textoOtro.trim().split('\n').map(línea => JSON.parse(línea) as {
				Tipo: string; Errores?: { Código: string; }[];
			});

			expect(eventosRecitación.find(evento => evento.Tipo === 'Error')?.Errores?.[0].Código)
				.toBe(CódigoErrorIA.ContenidoNoPermitido);
			expect(eventosOtro.find(evento => evento.Tipo === 'Error')?.Errores?.[0].Código)
				.toBe(CódigoErrorIA.ProveedorNoDisponible);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('rechaza temperaturas distintas de 1 cuando el conector declara rango nulo', () => {

		expect(() => ValidarEntradaIA({
			Modo: 'Directo', ModeloOConector: 'gemini-3.7-flash', MensajeUsuario: 'consulta', Temperatura: 0.5,
			Razonamiento: 3, Verbosidad: 1, TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
		})).toThrow(/no admite el parámetro temperature/);

	});

	it('valida los límites numéricos del rango declarado por el conector', () => {

		const nombre = 'gpt-rango-temperatura-prueba-in-openai';
		ConectoresIA[nombre] = {
			...ConectoresIA['gpt-5.5-in-openai'], Nombre: nombre, Modelo: 'gpt-rango-temperatura-prueba',
			RangoTemperaturaSoportado: [0, 1],
		};
		try {
			const base = {
				Modo: 'Directo', ModeloOConector: nombre, MensajeUsuario: 'consulta', Razonamiento: 1, Verbosidad: 1,
				TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
			};
			expect(() => ValidarEntradaIA({ ...base, Temperatura: 0.5 })).not.toThrow();
			expect(() => ValidarEntradaIA({ ...base, Temperatura: 1.1 })).toThrow(/admite valores entre 0 y 1/);
		} finally {
			delete ConectoresIA[nombre];
		}

	});

});


describe('Uso de caché en OpenAI Responses', () => {

	it('separa lectura, escritura y entrada no cacheada y cobra la escritura', async () => {

		const conector = ConectoresIA['gpt-5.5-in-openai'];
		const precioEscrituraAnterior = conector.Precios.EscrituraCachéLargaDuración;
		conector.Precios.EscrituraCachéLargaDuración = 6.25;
		const respuestaProveedor = {
			status: 'completed', output_text: 'respuesta',
			usage: {
				input_tokens: 1_000,
				input_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 },
				output_tokens: 10, output_tokens_details: { reasoning_tokens: 2 }
			},
		};
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(respuestaProveedor), {
			headers: { 'content-type': 'application/json' },
		}));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo'), new AbortController().signal);

			expect(resultado.Tipo).toBe('Respuesta');
			expect(resultado.UsoTókenes.EscrituraCaché).toBe(300);
			expect(resultado.UsoTókenes.EntradaCaché).toBe(200);
			expect(resultado.UsoTókenes.EntradaNoCaché).toBe(500);
			expect(resultado.UsoTókenes.SalidaRazonamiento).toBe(2);
			expect(resultado.CostoDólares).toBeCloseTo(0.004775, 12);
		} finally {
			conector.Precios.EscrituraCachéLargaDuración = precioEscrituraAnterior;
			vi.unstubAllGlobals();
		}

	});

	it('mantiene cero escritura cuando OpenAI no reporta cache_write_tokens', async () => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta',
			usage: { input_tokens: 1_000, input_tokens_details: { cached_tokens: 200 }, output_tokens: 10 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo'), new AbortController().signal);

			expect(resultado.UsoTókenes.EscrituraCaché).toBe(0);
			expect(resultado.UsoTókenes.EntradaNoCaché).toBe(800);
		} finally {
			vi.unstubAllGlobals();
		}

	});

});


describe('Tarifa de contexto largo en OpenAI Responses', () => {

	it.each([
		{ nombre: 'umbral inclusivo', conector: 'gpt-5.6-luna-in-openai', entrada: 272_000, costo: 0.0389132,
			extendido: false },
		{ nombre: 'primer token largo', conector: 'gpt-5.6-luna-in-openai', entrada: 272_001, costo: 0.0778202,
			extendido: true },
		{ nombre: 'primer token largo Fast', conector: 'gpt-5.6-luna-fast-in-openai', entrada: 272_001, costo: 0.1556404,
			extendido: true },
	])('aplica correctamente $nombre sin alterar los tókenes reales', async ({ conector, entrada, costo, extendido }) => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta', service_tier: conector.includes('-fast-') ? 'priority' : 'default',
			usage: {
				input_tokens: entrada,
				input_tokens_details: { cached_tokens: 100_000, cache_write_tokens: 50_000 },
				output_tokens: 11, output_tokens_details: { reasoning_tokens: 3 },
			},
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', conector),
				new AbortController().signal);

			expect(resultado.UsoTókenes).toMatchObject({
				EntradaCaché: 100_000, EntradaNoCaché: entrada - 150_000, EscrituraCaché: 50_000,
				SalidaRazonamiento: 3, SalidaNoRazonamiento: 8,
			});
			expect(resultado.UsoTókenesTarifaExtendida).toEqual(extendido ? {
				EntradaCaché: 100_000, EntradaNoCaché: entrada - 150_000, EscrituraCaché: 50_000,
				SalidaRazonamiento: 3, SalidaNoRazonamiento: 8,
			} : {
				EntradaCaché: 0, EntradaNoCaché: 0, EscrituraCaché: 0,
				SalidaRazonamiento: 0, SalidaNoRazonamiento: 0,
			});
			const respuestaPública = await ResponderResultadoIADirecto(resultado).json() as Record<string, unknown>;
			expect(respuestaPública.UsoTókenesTarifaExtendida).toBeUndefined();
			expect(resultado.CostoDólares).toBeCloseTo(costo, 12);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it.each([
		{ caso: 'dos rondas de 150 000', entradas: [150_000, 150_000], costo: 0.061024,
			extendido: { EntradaNoCaché: 0, SalidaNoRazonamiento: 0 } },
		{ caso: 'una ronda de 150 000 y otra de 300 000', entradas: [150_000, 300_000], costo: 0.15103,
			extendido: { EntradaNoCaché: 300_000, SalidaNoRazonamiento: 10 } },
	])('decide la tarifa antes de acumular en Parallel: $caso', async ({ entradas, costo, extendido }) => {

		let rondaModelo = 0;
		const fetchMock = vi.fn().mockImplementation((entradaFetch: string | URL | Request) => {
			if (String(entradaFetch) === 'https://api.parallel.ai/v1/search')
				return Promise.resolve(new Response(JSON.stringify({
					search_id: 'search-1', session_id: 'solicitud-cache-directo',
					results: [{ url: 'https://ejemplo.test/fuente', title: 'Fuente', excerpts: ['Dato'] }],
				}), { headers: { 'content-type': 'application/json' } }));
			const índice = rondaModelo++;
			const salida = índice === 0 ? [{
				type: 'function_call', name: 'search_web', call_id: 'call-1',
				arguments: JSON.stringify({ objective: 'Objetivo', search_queries: ['consulta'] }),
			}] : [];
			return Promise.resolve(new Response(JSON.stringify({
				id: `resp-${índice + 1}`, status: 'completed', output: salida,
				output_text: índice === 1 ? 'Respuesta [S1]' : undefined,
				usage: { input_tokens: entradas[índice], output_tokens: 10 },
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);
		const contexto = CrearContextoConsultaOpenAI('Directo', 'gpt-5.6-luna-in-openai', 1, {
			BúsquedaWeb: true, ProveedorBúsquedaWeb: 'Parallel', ForzarBúsquedaWeb: true,
		});
		Object.assign(contexto.Entorno, { CLAVE_PARALLEL: 'clave-parallel-prueba' });

		try {
			const resultado = await ConsultarIADirecto(contexto, new AbortController().signal);

			expect(resultado.UsoTókenes.EntradaNoCaché).toBe(entradas[0] + entradas[1]);
			expect(resultado.UsoTókenes.SalidaNoRazonamiento).toBe(20);
			expect(resultado.UsoTókenesTarifaExtendida).toEqual({
				EntradaCaché: 0, EntradaNoCaché: extendido.EntradaNoCaché, EscrituraCaché: 0,
				SalidaRazonamiento: 0, SalidaNoRazonamiento: extendido.SalidaNoRazonamiento,
			});
			expect(resultado.BúsquedasWeb).toBe(1);
			expect(resultado.CostoDólares).toBeCloseTo(costo, 12);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('Error arreglado: reproduce el incidente de seis rondas largas y 25 búsquedas sin exponer tókenes equivalentes', async () => {

		let rondaModelo = 0;
		let búsquedasParallel = 0;
		const registro = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const fetchMock = vi.fn().mockImplementation((entradaFetch: string | URL | Request) => {
			if (String(entradaFetch) === 'https://api.parallel.ai/v1/search') {
				búsquedasParallel += 1;
				return Promise.resolve(new Response(JSON.stringify({
					search_id: `search-${búsquedasParallel}`, session_id: 'solicitud-cache-directo',
					results: [{ url: `https://ejemplo.test/${búsquedasParallel}`, title: 'Fuente', excerpts: ['Dato'] }],
				}), { headers: { 'content-type': 'application/json' } }));
			}
			const índice = rondaModelo++;
			const esFinal = índice === 5;
			const entradaRonda = índice === 0 ? 310_117 : índice === 5 ? 309_775 : 309_773;
			const detallesEntrada = índice === 0
				? { cached_tokens: 0, cache_write_tokens: 309_581 }
				: { cached_tokens: entradaRonda, cache_write_tokens: 0 };
			const salidaRonda = esFinal ? 23_117 : 1_000;
			const razonamientoRonda = esFinal ? 14_594 : 500;
			const llamadas = esFinal ? [] : Array.from({ length: 5 }, (_, índiceLlamada) => ({
				type: 'function_call', name: 'search_web', call_id: `call-${índice}-${índiceLlamada}`,
				arguments: JSON.stringify({ objective: `Objetivo ${índiceLlamada}`, search_queries: [`consulta ${índiceLlamada}`] }),
			}));
			return Promise.resolve(new Response(JSON.stringify({
				id: `resp-${índice + 1}`, status: 'completed', output: llamadas,
				output_text: esFinal ? 'Respuesta final' : undefined,
				usage: {
					input_tokens: entradaRonda, input_tokens_details: detallesEntrada,
					output_tokens: salidaRonda, output_tokens_details: { reasoning_tokens: razonamientoRonda },
				},
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);
		const contexto = CrearContextoConsultaOpenAI('Directo', 'gpt-5.6-luna-in-openai', 5, {
			BúsquedaWeb: true, ProveedorBúsquedaWeb: 'Parallel', ForzarBúsquedaWeb: true,
			ExtensiónBúsquedaWeb: 'Alta',
		});
		Object.assign(contexto.Entorno, { CLAVE_PARALLEL: 'clave-parallel-prueba' });

		try {
			const resultado = await ConsultarIADirecto(contexto, new AbortController().signal);
			const evento = registro.mock.calls.map(([mensaje]) => JSON.parse(String(mensaje)) as {
				Evento: string; Metadatos: Record<string, unknown>;
			}).find(carga => carga.Evento === 'IA.Éxito');

			expect(resultado.UsoTókenes).toMatchObject({
				EntradaCaché: 1_548_867, EntradaNoCaché: 536, EscrituraCaché: 309_581,
				SalidaRazonamiento: 17_094, SalidaNoRazonamiento: 11_023,
			});
			expect(resultado.UsoTókenesTarifaExtendida).toEqual({
				EntradaCaché: 1_548_867, EntradaNoCaché: 536, EscrituraCaché: 309_581,
				SalidaRazonamiento: 17_094, SalidaNoRazonamiento: 11_023,
			});
			expect(resultado.BúsquedasWeb).toBe(25);
			expect(búsquedasParallel).toBe(25);
			expect(resultado.CostoDólares).toBeCloseTo(0.29257018, 12);
			expect(evento?.Metadatos).toMatchObject({
				SolicitudesModelo: 6, SolicitudesContextoLargo: 6,
				TotalTókenesEntrada: 1_858_984, TókenesEntradaCaché: 1_548_867,
				TókenesEntradaNoCaché: 536, TókenesEscrituraCaché: 309_581,
				TotalTókenesSalida: 28_117, TókenesSalidaRazonamiento: 17_094,
				TókenesSalidaNoRazonamiento: 11_023,
				CostoModeloDólares: expect.closeTo(0.26757018, 12),
				CostoBúsquedasWebDólares: 0.025,
				CostoTotalDólares: expect.closeTo(0.29257018, 12),
			});
		} finally {
			registro.mockRestore();
			vi.unstubAllGlobals();
		}

	});

});


describe('Web search en OpenAI Responses', () => {

	it('no agrega tools en una solicitud normal', async () => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta', usage: { input_tokens: 1, output_tokens: 1 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo'), new AbortController().signal);
			const cuerpo = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>;

			expect(cuerpo.tools).toBeUndefined();
			expect(cuerpo.tool_choice).toBeUndefined();
			expect(resultado.Citas).toEqual([]);
			expect(resultado.BúsquedasWeb).toBe(0);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('no ejecuta el respaldo cuando el principal agota el límite de tókenes', async () => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
			output: [], usage: { input_tokens: 100, output_tokens: 16_000 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI(
				'Directo', 'gpt-5.6-luna-in-openai', 5,
				{ RespaldoModeloOConector: 'gpt-5.4-mini-in-openai', TókenesMáximos: 16_000 }, false),
				new AbortController().signal);

			expect(resultado.Tipo).toBe('Error');
			expect(resultado.Errores).toHaveLength(1);
			expect(resultado.Errores[0].Código).toBe(CódigoErrorIA.LímiteTókenesAlcanzado);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it.each([
		{ nivel: 1, esperado: 'low' },
		{ nivel: 2, esperado: 'medium' },
		{ nivel: 3, esperado: 'high' },
		{ nivel: 4, esperado: 'xhigh' },
	])('mantiene GPT-5.6 paralelo a Astra con búsqueda: nivel $nivel envía $esperado', async ({ nivel, esperado }) => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta', usage: { input_tokens: 1, output_tokens: 1 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-5.6-sol-in-openai', nivel, {
				BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false, PaísBúsquedaWeb: 'CO',
			}), new AbortController().signal);
			const cuerpo = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { reasoning: { effort: string; }; };

			expect(cuerpo.reasoning.effort).toBe(esperado);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('conserva max en GPT-5.6 cuando no hay búsqueda web', async () => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta', usage: { input_tokens: 1, output_tokens: 1 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-5.6-sol-in-openai', 5),
				new AbortController().signal);
			const cuerpo = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { reasoning: { effort: string; }; };

			expect(cuerpo.reasoning).toEqual({ effort: 'max' });
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('mantiene el mapa de cinco niveles en todos los conectores GPT-5.6 y conserva Fast y Pro', async () => {

		enviarAlertaErrorCriticoMock.mockReset();
		const fetchMock = vi.fn().mockImplementation((_url: string, opciones: RequestInit) => {
			const cuerpo = JSON.parse(String(opciones.body)) as Record<string, unknown>;
			return Promise.resolve(new Response(JSON.stringify({
				status: 'completed', output_text: 'respuesta',
				service_tier: cuerpo.service_tier === 'fast' ? 'priority' : 'default',
				usage: { input_tokens: 1, output_tokens: 1 },
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);

		try {
			const conectores = Object.entries(ConectoresIA)
				.filter(([, conector]) => conector.Proveedor === 'open-ai' && conector.Modelo.startsWith('gpt-5.6-'));
			expect(conectores).toHaveLength(12);

			for (const [nombre, conector] of conectores) {
				await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', nombre, 5,
					{ BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false, PaísBúsquedaWeb: 'CO' }),
					new AbortController().signal);
				const llamada = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
				const cuerpo = JSON.parse(String(llamada[1].body)) as Record<string, unknown>;
				const usaFast = conector.ModoEspecialOpenAI === 'Fast' || conector.ModoEspecialOpenAI === 'Fast Pro';
				const usaPro = conector.ModoEspecialOpenAI === 'Pro' || conector.ModoEspecialOpenAI === 'Fast Pro';

				expect(cuerpo.reasoning, nombre).toEqual(usaPro
					? { effort: 'max', mode: 'pro' } : { effort: 'max' });
				expect(cuerpo.service_tier, nombre).toBe(usaFast ? 'fast' : undefined);
			}
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it.each([
		{ modelo: 'gpt-5.5-in-openai', nivel: 1, esperado: 'none' },
		{ modelo: 'gpt-5.5-in-openai', nivel: 5, esperado: 'xhigh' },
		{ modelo: 'gpt-5.4-in-openai', nivel: 1, esperado: 'none' },
		{ modelo: 'gpt-5.4-in-openai', nivel: 5, esperado: 'xhigh' },
		{ modelo: 'gpt-5.4-mini-in-openai', nivel: 1, esperado: 'none' },
		{ modelo: 'gpt-5.4-mini-in-openai', nivel: 5, esperado: 'xhigh' },
		{ modelo: 'gpt-5.4-nano-in-openai', nivel: 1, esperado: 'none' },
		{ modelo: 'gpt-5.4-nano-in-openai', nivel: 5, esperado: 'xhigh' },
	])('conserva el mapeo anterior en $modelo para el nivel $nivel', async ({ modelo, nivel, esperado }) => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta', usage: { input_tokens: 1, output_tokens: 1 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', modelo, nivel,
				{ BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false, PaísBúsquedaWeb: 'CO' }),
				new AbortController().signal);
			const cuerpo = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { reasoning: { effort: string; }; };

			expect(cuerpo.reasoning.effort).toBe(esperado);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('cuenta únicamente las acciones search y suma su costo al costo total', async () => {

		const respuestaProveedor = {
			status: 'completed', output_text: 'respuesta',
			output: [
				{ type: 'web_search_call', action: { type: 'search', queries: ['una', 'dos'] } },
				{ type: 'web_search_call', action: { type: 'open_page' } },
				{ type: 'web_search_call', action: { type: 'find_in_page' } },
				{ type: 'web_search_call', action: { type: 'search', query: 'tres' } },
				{ type: 'message', content: [{ type: 'output_text', text: 'respuesta', annotations: [] }] },
			],
			usage: { input_tokens: 0, output_tokens: 0 },
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(respuestaProveedor), {
			headers: { 'content-type': 'application/json' },
		})));

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-5.5-in-openai', 1, {
				BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: true, PaísBúsquedaWeb: 'CO'
			}), new AbortController().signal);

			expect(resultado.BúsquedasWeb).toBe(2);
			expect(resultado.CostoDólares).toBeCloseTo(0.02, 12);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it.each([
		{ extension: 'Baja', valorOpenAI: 'low' },
		{ extension: 'Media', valorOpenAI: 'medium' },
		{ extension: 'Alta', valorOpenAI: 'high' },
	] as const)('mapea ExtensiónBúsquedaWeb=$extension a $valorOpenAI', async ({ extension: extensión, valorOpenAI }) => { // La clave de cada fila va sin tilde, porque vitest solo reemplaza en el título los $nombre con letras sin tilde.

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta', usage: { input_tokens: 1, output_tokens: 1 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-5.5-in-openai', 1, {
				BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false,
				ExtensiónBúsquedaWeb: extensión, PaísBúsquedaWeb: 'co'
			}), new AbortController().signal);
			const cuerpo = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>;
			const herramienta = (cuerpo.tools as Record<string, unknown>[])[0];

			expect(herramienta).toEqual({
				type: 'web_search', search_context_size: valorOpenAI,
				user_location: { type: 'approximate', country: 'CO' },
			});
			expect(cuerpo.tool_choice).toBe('auto');
			expect(cuerpo.return_token_budget).toBeUndefined();
			expect(cuerpo.filters).toBeUndefined();
			expect(cuerpo.include).toBeUndefined();
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('envía required y conserva únicamente las citas url_citation completas sin modificar el texto', async () => {

		const citas = [{
			type: 'url_citation',
			url: 'https://ejemplo.test/fuente', title: 'Fuente', start_index: 0, end_index: 12,
		}, {
			type: 'url_citation',
			url: 'https://ejemplo.test/segunda', title: 'Segunda fuente', start_index: 13, end_index: 25,
		}];
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'texto intacto',
			output: [{ type: 'message', content: [{ type: 'output_text', text: 'texto intacto', annotations: [
				citas[0], { type: 'file_citation', filename: 'archivo.txt' },
				{ type: 'url_citation', url: 'https://ejemplo.test/incompleta', start_index: 26, end_index: 35 }, citas[1]
			] }] }],
			usage: { input_tokens: 1, output_tokens: 1 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-5.5-in-openai', 1, {
				BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: true,
				ExtensiónBúsquedaWeb: 'Alta', PaísBúsquedaWeb: 'CO'
			}), new AbortController().signal);
			const cuerpo = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>;

			expect(cuerpo.tool_choice).toBe('required');
			expect(resultado.Texto).toBe('texto intacto');
			expect(resultado.Citas).toEqual([
				{ URL: citas[0].url, Título: citas[0].title, Inicio: citas[0].start_index, Fin: citas[0].end_index },
				{ URL: citas[1].url, Título: citas[1].title, Inicio: citas[1].start_index, Fin: citas[1].end_index },
			]);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('valida y normaliza el país como código de dos letras', () => {

		const entrada = ValidarEntradaIA({
			Modo: 'Directo', ModeloOConector: 'gpt-5.5-in-openai', MensajeUsuario: 'consulta',
			BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false,
			PaísBúsquedaWeb: ' co ', Razonamiento: 1, Verbosidad: 1,
			TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
		});

		expect(entrada.PaísBúsquedaWeb).toBe('CO');
		expect(() => ValidarEntradaIA({
			Modo: 'Directo', ModeloOConector: 'gpt-5.5-in-openai', MensajeUsuario: 'consulta',
			BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false,
			PaísBúsquedaWeb: 'COL', Razonamiento: 1, Verbosidad: 1,
			TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
		})).toThrow(/PaísBúsquedaWeb/);
		expect(() => ValidarEntradaIA({
			Modo: 'Directo', ModeloOConector: 'gpt-5.5-in-openai', MensajeUsuario: 'consulta',
			BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', PaísBúsquedaWeb: 'CO', Razonamiento: 1, Verbosidad: 1,
			TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
		})).toThrow(/ForzarBúsquedaWeb/);
		expect(() => ValidarEntradaIA({
			Modo: 'Directo', ModeloOConector: 'gemini-3-flash-in-google', MensajeUsuario: 'consulta',
			BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false,
			PaísBúsquedaWeb: 'CO', Razonamiento: 1, Verbosidad: 1,
			TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
		})).toThrow(/OpenAI Responses/);

	});

	it('aplica el rango de GPT-5.6 sin condicionarlo al esfuerzo de razonamiento', () => {

		expect(() => ValidarEntradaIA({
			Modo: 'Directo', ModeloOConector: 'gpt-5.6-luna-in-openai', MensajeUsuario: 'consulta',
			BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false,
			PaísBúsquedaWeb: 'CO', Temperatura: 2, Razonamiento: 1, Verbosidad: 1,
			TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
		})).not.toThrow();
		expect(() => ValidarEntradaIA({
			Modo: 'Directo', ModeloOConector: 'gpt-5.6-luna-in-openai', MensajeUsuario: 'consulta',
			BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false,
			PaísBúsquedaWeb: 'CO', Temperatura: 0.2, Razonamiento: 2, Verbosidad: 1,
			TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
		})).not.toThrow();

	});

	it('usa Parallel con DeepSeek, conserva el límite de salida por ronda y devuelve citas CitaIA', async () => {

		let llamadasDeepSeek = 0;
		const cuerposDeepSeek: Record<string, unknown>[] = [];
		let cuerpoParallel: Record<string, unknown> | undefined;
		const fetchMock = vi.fn().mockImplementation((entrada: string | URL | Request, opciones?: RequestInit) => {
			const url = String(entrada);
			const cuerpo = JSON.parse(String(opciones?.body)) as Record<string, unknown>;
			if (url === 'https://api.parallel.ai/v1/search') {
				cuerpoParallel = cuerpo;
				return Promise.resolve(new Response(JSON.stringify({
					search_id: 'search-1', session_id: 'solicitud-cache-directo',
					results: [
						{ url: 'https://ejemplo.test/fuente', title: 'Fuente de prueba', excerpts: ['Contenido completo'] },
						{ url: 'https://otra.test/dato', title: 'Otra fuente', excerpts: ['Otro contenido'] },
					],
				}), { headers: { 'content-type': 'application/json' } }));
			}
			cuerposDeepSeek.push(cuerpo);
			llamadasDeepSeek += 1;
			if (llamadasDeepSeek === 1) return Promise.resolve(new Response(JSON.stringify({
				choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{
					id: 'call-1', type: 'function', function: { name: 'search_web', arguments: JSON.stringify({
						objective: 'Averiguar el dato actual', search_queries: ['dato actual'],
					}) },
				}] } }],
				usage: { prompt_tokens: 10, completion_tokens: 2 },
			}), { headers: { 'content-type': 'application/json' } }));
			return Promise.resolve(new Response(JSON.stringify({
				choices: [{ finish_reason: 'stop', message: { content: 'Respuesta [S1] [S2]' } }],
				usage: { prompt_tokens: 20, completion_tokens: 3 },
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaProveedor('Directo',
				'deepseek-v4-flash-in-deepseek', {
					BúsquedaWeb: true, ProveedorBúsquedaWeb: 'Parallel', ForzarBúsquedaWeb: true,
					ExtensiónBúsquedaWeb: 'Media', PaísBúsquedaWeb: 'CO', TókenesMáximos: 321, Razonamiento: 3,
				}), new AbortController().signal);

			expect(resultado.Tipo).toBe('Respuesta');
			expect(resultado.Texto).toBe(`Respuesta ${EnlaceCitaParallelPrueba} ${SegundoEnlaceCitaParallelPrueba}`);
			expect(resultado.BúsquedasWeb).toBe(1);
			expect(resultado.ProveedorBúsquedaWeb).toBe('Parallel');
			const finPrimeraCita = 10 + EnlaceCitaParallelPrueba.length;
			expect(resultado.Citas).toEqual([{
				URL: 'https://ejemplo.test/fuente', Título: 'Fuente de prueba', Inicio: 10, Fin: finPrimeraCita,
			}, {
				URL: 'https://otra.test/dato', Título: 'Otra fuente', Inicio: finPrimeraCita + 1,
				Fin: finPrimeraCita + 1 + SegundoEnlaceCitaParallelPrueba.length,
			}]);
			expect(resultado.UsoTókenes.EntradaNoCaché).toBe(30);
			expect(cuerposDeepSeek).toHaveLength(2);
			expect(cuerposDeepSeek.every(cuerpo => cuerpo.max_tokens === 321)).toBe(true);
			expect(cuerposDeepSeek.every(cuerpo => cuerpo.tool_choice === undefined)).toBe(true);
			expect(cuerpoParallel).toMatchObject({
				mode: 'fast', max_chars_total: 25_000, session_id: 'solicitud-cache-directo',
				advanced_settings: { max_results: 10 },
			});
			expect(cuerpoParallel?.objective).toBe('Averiguar el dato actual');
			expect(cuerpoParallel?.search_queries).toEqual(['dato actual']);
			const respuestaPública = await ResponderResultadoIADirecto(resultado).json() as Record<string, unknown>;
			expect(respuestaPública.ProveedorBúsquedaWeb).toBeUndefined();
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('envía a Parallel las ubicaciones nativas admitidas además de los ejemplos iniciales', async () => {
		const cuerposParallel: Record<string, unknown>[] = [];
		const fetchMock = vi.fn().mockImplementation((_entrada: string | URL | Request, opciones?: RequestInit) => {
			cuerposParallel.push(JSON.parse(String(opciones?.body)) as Record<string, unknown>);
			return Promise.resolve(new Response(JSON.stringify({ results: [] }), {
				headers: { 'content-type': 'application/json' },
			}));
		});
		vi.stubGlobal('fetch', fetchMock);

		try {
			const contexto = CrearContextoConsultaProveedor('Directo', 'deepseek-v4-flash-in-deepseek');
			const estado = CrearEstadoBúsquedaParallel(contexto);
			await EjecutarBúsquedasParallel(contexto, [{ objective: 'Noticias recientes', search_queries: ['noticias'] }],
				estado, undefined, 'AR', new AbortController().signal);

			expect(cuerposParallel).toHaveLength(1);
			expect(cuerposParallel[0].advanced_settings).toEqual({ max_results: 10, location: 'ar' });
			expect(cuerposParallel[0].objective).toBe('Noticias recientes');
			expect(cuerposParallel[0].search_queries).toEqual(['noticias']);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('acepta Parallel auto sin ejecutar búsquedas cuando el modelo responde directamente', async () => {

		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			choices: [{ finish_reason: 'stop', message: { content: 'Respuesta directa' } }],
			usage: { prompt_tokens: 2, completion_tokens: 1 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaProveedor('Directo',
				'deepseek-v4-flash-in-deepseek', {
					BúsquedaWeb: true, ProveedorBúsquedaWeb: 'Parallel', ForzarBúsquedaWeb: false, PaísBúsquedaWeb: 'CO',
				}), new AbortController().signal);
			expect(resultado.Tipo).toBe('Respuesta');
			expect(resultado.BúsquedasWeb).toBe(0);
			expect(resultado.Citas).toEqual([]);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('ejecuta Parallel también desde OpenAI Responses sin activar OpenAI Search', async () => {

		let rondasResponses = 0;
		let búsquedasParallel = 0;
		const cuerposResponses: Record<string, unknown>[] = [];
		let cuerpoParallel: Record<string, unknown> | undefined;
		const fetchMock = vi.fn().mockImplementation((entrada: string | URL | Request, opciones?: RequestInit) => {
			const url = String(entrada);
			const cuerpo = JSON.parse(String(opciones?.body)) as Record<string, unknown>;
			if (url === 'https://api.parallel.ai/v1/search') {
				búsquedasParallel += 1;
				cuerpoParallel = cuerpo;
				return Promise.resolve(new Response(JSON.stringify({
					search_id: 'search-1', session_id: 'solicitud-cache-directo',
					results: [{ url: 'https://ejemplo.test/responses', title: 'Fuente Responses', excerpts: ['Dato'] }],
				}), { headers: { 'content-type': 'application/json' } }));
			}
			cuerposResponses.push(cuerpo);
			rondasResponses += 1;
			if (rondasResponses === 1) return Promise.resolve(new Response(JSON.stringify({
				id: 'resp-1', status: 'completed', output: Array.from({ length: 6 }, (_, índice) => ({
					type: 'function_call', name: 'search_web', call_id: `call-${índice + 1}`,
					arguments: JSON.stringify({ objective: `Objetivo ${índice + 1}`, search_queries: [`consulta ${índice + 1}`] }),
				})),
				usage: { input_tokens: 4, output_tokens: 2 },
			}), { headers: { 'content-type': 'application/json' } }));
			return Promise.resolve(new Response(JSON.stringify({
				id: 'resp-2', status: 'completed', output_text: 'Dato [S1]', output: [],
				usage: { input_tokens: 6, output_tokens: 3 },
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);
		const contexto = CrearContextoConsultaOpenAI('Directo', 'gpt-5.5-in-openai', 1, {
			BúsquedaWeb: true, ProveedorBúsquedaWeb: 'Parallel', ForzarBúsquedaWeb: true, PaísBúsquedaWeb: 'US',
		});
		Object.assign(contexto.Entorno, { CLAVE_PARALLEL: 'clave-parallel-prueba' });

		try {
			const resultado = await ConsultarIADirecto(contexto, new AbortController().signal);
			const enlaceCita = '([ejemplo.test](https://ejemplo.test/responses))';
			expect(resultado.Tipo).toBe('Respuesta');
			expect(resultado.Texto).toBe(`Dato ${enlaceCita}`);
			expect(resultado.BúsquedasWeb).toBe(6);
			expect(búsquedasParallel).toBe(6);
			expect(resultado.Citas[0]).toEqual({
				URL: 'https://ejemplo.test/responses', Título: 'Fuente Responses', Inicio: 5,
				Fin: 5 + enlaceCita.length,
			});
			expect(cuerposResponses).toHaveLength(2);
			expect((cuerposResponses[0].tools as Record<string, unknown>[])[0].type).toBe('function');
			expect(cuerposResponses[0].previous_response_id).toBeUndefined();
			expect(cuerposResponses[1].previous_response_id).toBe('resp-1');
			expect(cuerposResponses[1].tool_choice).toBe('auto');
			expect(cuerposResponses[1].moderation).toBeUndefined();
			expect(cuerpoParallel?.advanced_settings).toEqual({ max_results: 10, location: 'us' });
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('conserva las unidades de moderación inicial si Parallel falla', async () => {

		const fetchMock = vi.fn().mockImplementation((entrada: string | URL | Request) => {
			if (String(entrada) === 'https://api.parallel.ai/v1/search')
				return Promise.resolve(new Response('caído', { status: 503 }));
			return Promise.resolve(new Response(JSON.stringify({
				id: 'resp-1', status: 'completed',
				output: [{ type: 'function_call', name: 'search_web', call_id: 'call-1',
					arguments: JSON.stringify({ objective: 'Objetivo', search_queries: ['consulta'] }) }],
				moderation: { input: { type: 'moderation_result', flagged: true } },
				usage: { input_tokens: 1, output_tokens: 1 },
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);
		const contexto = CrearContextoConsultaOpenAI('Directo', 'gpt-5.5-in-openai', 1, {
			BúsquedaWeb: true, ProveedorBúsquedaWeb: 'Parallel', ForzarBúsquedaWeb: true, PaísBúsquedaWeb: 'US',
		});
		Object.assign(contexto.Entorno, { CLAVE_PARALLEL: 'clave-parallel-prueba' });

		try {
			const resultado = await ConsultarIADirecto(contexto, new AbortController().signal);
			expect(resultado.Tipo).toBe('Error');
			expect(resultado.UnidadesInfracción).toBe(1);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('finaliza con las fuentes disponibles cuando Chat supera el límite de llamadas Parallel', async () => {

		let rondaModelo = 0;
		let búsquedasParallel = 0;
		const crearLlamada = (id: string) => ({ id, type: 'function', function: { name: 'search_web',
			arguments: JSON.stringify({ objective: `Objetivo ${id}`, search_queries: [`consulta ${id}`] }) } });
		const cuerposChat: Record<string, unknown>[] = [];
		const fetchMock = vi.fn().mockImplementation((entrada: string | URL | Request, opciones?: RequestInit) => {
			const url = String(entrada);
			if (url === 'https://api.parallel.ai/v1/search') {
				búsquedasParallel += 1;
				return Promise.resolve(new Response(JSON.stringify({
					search_id: `search-${búsquedasParallel}`, session_id: 'solicitud-cache-directo',
					results: [{ url: `https://ejemplo.test/${búsquedasParallel}`, title: `Fuente ${búsquedasParallel}`, excerpts: ['Dato'] }],
				}), { headers: { 'content-type': 'application/json' } }));
			}
			const cuerpo = JSON.parse(String(opciones?.body)) as Record<string, unknown>;
			cuerposChat.push(cuerpo);
			if (rondaModelo++ === 0) return Promise.resolve(new Response(JSON.stringify({
				choices: [{ finish_reason: 'tool_calls', message: { content: null,
					tool_calls: Array.from({ length: 31 }, (_, índice) => crearLlamada(`p${índice + 1}`)) } }],
				usage: { prompt_tokens: 1, completion_tokens: 1 },
			}), { headers: { 'content-type': 'application/json' } }));
			return Promise.resolve(new Response(JSON.stringify({
				choices: [{ finish_reason: 'stop', message: { content: 'Respuesta con fuentes [S1]' } }],
				usage: { prompt_tokens: 1, completion_tokens: 1 },
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaProveedor('Directo',
				'deepseek-v4-flash-in-deepseek', {
					BúsquedaWeb: true, ProveedorBúsquedaWeb: 'Parallel', ForzarBúsquedaWeb: true, PaísBúsquedaWeb: 'CO',
				}), new AbortController().signal);

			expect(resultado.Tipo).toBe('Respuesta');
			expect(resultado.ConsultasFallidas).toBe(0);
			expect(resultado.ConectorEfectivo).toBe('deepseek-v4-flash-in-deepseek');
			expect(resultado.BúsquedasWeb).toBe(30);
			expect(búsquedasParallel).toBe(30);
			expect(resultado.Citas[0].URL).toBe('https://ejemplo.test/1');
			expect(cuerposChat[1].tool_choice).toBe('none');
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('termina la cadena completa y no cobra cuando Parallel falla', async () => {

		let llamadasModelo = 0;
		const fetchMock = vi.fn().mockImplementation((entrada: string | URL | Request) => {
			if (String(entrada) === 'https://api.parallel.ai/v1/search')
				return Promise.resolve(new Response('caído', { status: 503 }));
			llamadasModelo += 1;
			return Promise.resolve(new Response(JSON.stringify({
				choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{
					id: 'call-1', type: 'function', function: { name: 'search_web',
						arguments: JSON.stringify({ objective: 'Objetivo', search_queries: ['consulta'] }) },
				}] } }], usage: { prompt_tokens: 1, completion_tokens: 1 },
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaProveedor('Directo',
				'deepseek-v4-flash-in-deepseek', {
					BúsquedaWeb: true, ProveedorBúsquedaWeb: 'Parallel', ForzarBúsquedaWeb: true, PaísBúsquedaWeb: 'CO',
					RespaldoModeloOConector: 'deepseek-v4-pro-in-deepseek',
				}, false), new AbortController().signal);
			expect(resultado.Tipo).toBe('Error');
			expect(resultado.CostoDólares).toBe(0);
			expect(resultado.BúsquedasWeb).toBe(0);
			expect(llamadasModelo).toBe(1);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			vi.unstubAllGlobals();
		}

	});

		it('exige el proveedor y valida los parámetros de búsqueda', () => {

		const base = {
			Modo: 'Directo' as const, ModeloOConector: 'deepseek-v4-flash-in-deepseek', MensajeUsuario: 'consulta',
			Razonamiento: 1, Verbosidad: 1, TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es' as const,
		};
		expect(() => ValidarEntradaIA({ ...base, BúsquedaWeb: true, ForzarBúsquedaWeb: false,
			PaísBúsquedaWeb: 'CO' })).toThrow(/ProveedorBúsquedaWeb/);
		expect(() => ValidarEntradaIA({ ...base, BúsquedaWeb: true, ProveedorBúsquedaWeb: 'Parallel',
			ForzarBúsquedaWeb: false })).not.toThrow();
		expect(() => ValidarEntradaIA({ ...base, ProveedorBúsquedaWeb: 'Parallel' }))
			.toThrow(/solo se permiten cuando BúsquedaWeb es true/);
		expect(() => ValidarEntradaIA({ ...base, Modo: 'Flujo', BúsquedaWeb: true,
			ProveedorBúsquedaWeb: 'Parallel', ForzarBúsquedaWeb: false, PaísBúsquedaWeb: 'CO' }))
			.toThrow(/Parallel solo está disponible en Modo Directo/);

	});

});


// ─── ResolverValorEscalado ────────────────────────────────────────────────────

describe('Conectores GPT-5.6', () => {

	it('resuelve los cinco niveles de razonamiento a low, medium, high, xhigh y max', () => {

		const niveles = ['low', 'medium', 'high', 'xhigh', 'max'];
		for (const nombre of ['gpt-5.6-sol-in-openai', 'gpt-5.6-terra-in-openai', 'gpt-5.6-luna-in-openai']) {
			const conector = ConectoresIA[nombre];
			expect(conector).toBeDefined();
			expect(conector.MapeoRazonamiento).toEqual(niveles);
			for (let nivel = 1; nivel <= 5; nivel++)
				expect(ResolverValorEscalado(nivel, 1, 5, conector.MapeoRazonamiento)).toBe(niveles[nivel - 1]);
		}

	});

	it('omite el modo especial en los conectores que no lo tienen', () => {
		for (const [nombre, conector] of Object.entries(ConectoresIA)) {
			if (!['Fast', 'Pro', 'Fast Pro'].includes(conector.ModoEspecialOpenAI ?? ''))
				expect(conector.ModoEspecialOpenAI, nombre).toBeUndefined();
		}
	});

	it('declara los nueve pseudo-modelos con el modo y las tarifas correctas', () => {
		const perfiles: Record<string, { modo: string; entrada: number; salida: number; escritura: number; }> = {
			'gpt-5.6-sol-fast-in-openai': { modo: 'Fast', entrada: 8, salida: 40, escritura: 10 },
			'gpt-5.6-sol-pro-in-openai': { modo: 'Pro', entrada: 4, salida: 20, escritura: 5 },
			'gpt-5.6-sol-fast-pro-in-openai': { modo: 'Fast Pro', entrada: 8, salida: 40, escritura: 10 },
			'gpt-5.6-terra-fast-in-openai': { modo: 'Fast', entrada: 4, salida: 24, escritura: 5 },
			'gpt-5.6-terra-pro-in-openai': { modo: 'Pro', entrada: 2, salida: 12, escritura: 2.5 },
			'gpt-5.6-terra-fast-pro-in-openai': { modo: 'Fast Pro', entrada: 4, salida: 24, escritura: 5 },
			'gpt-5.6-luna-fast-in-openai': { modo: 'Fast', entrada: 0.4, salida: 2.4, escritura: 0.5 },
			'gpt-5.6-luna-pro-in-openai': { modo: 'Pro', entrada: 0.2, salida: 1.2, escritura: 0.25 },
			'gpt-5.6-luna-fast-pro-in-openai': { modo: 'Fast Pro', entrada: 0.4, salida: 2.4, escritura: 0.5 },
		};

		for (const [nombre, esperado] of Object.entries(perfiles)) {
			const conector = ConectoresIA[nombre];
			expect(conector.ModoEspecialOpenAI).toBe(esperado.modo);
			expect(conector.Precios.EntradaNoCaché).toBe(esperado.entrada);
			expect(conector.Precios.SalidaNoRazonamiento).toBe(esperado.salida);
			expect(conector.Precios.EscrituraCachéLargaDuración).toBe(esperado.escritura);
		}
	});

	it('configura el umbral y los multiplicadores en normales, Pro, Fast y Fast Pro', () => {
		const nombres = Object.keys(ConectoresIA).filter(nombre => nombre.startsWith('gpt-5.6-'));

		expect(nombres).toHaveLength(12);
		for (const nombre of nombres) {
			const conector = ConectoresIA[nombre];
			expect(conector.MáximoTókenesEntradaTarifaEstándar, nombre).toBe(272_000);
			expect(conector.TarifaContextoLargo, nombre).toEqual({ MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 });
		}
		expect(ConectoresIA['gpt-5.6-sol-in-openai'].Precios).toMatchObject({
			EntradaCaché: 0.4, EntradaNoCaché: 4, EscrituraCachéLargaDuración: 5,
			SalidaRazonamiento: 20, SalidaNoRazonamiento: 20,
		});
	});

});


describe('Conector GPT-6 Astra', () => {

	const nombres = [
		'gpt-6-astra-in-openai', 'gpt-6-astra-fast-in-openai',
		'gpt-6-astra-pro-in-openai', 'gpt-6-astra-fast-pro-in-openai',
	];

	it('resuelve el modelo específico y declara sus cuatro perfiles con tarifas oficiales', () => {

		expect(ObtenerConectorDesdeModeloOConector('gpt-6-astra')).toBe('gpt-6-astra-in-openai');
		expect(Object.keys(ConectoresIA).filter(nombre => nombre.startsWith('gpt-6-astra-'))).toEqual(nombres);
		for (const nombre of nombres) {
			const conector = ConectoresIA[nombre];
			expect(conector.Modelo, nombre).toBe('gpt-6-astra');
			expect(conector.RangoTemperaturaSoportado, nombre).toBeNull();
			expect(conector.MapeoRazonamiento, nombre).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
			expect(conector.MapeoVerbosidad, nombre).toEqual(['low', 'medium', 'high']);
			expect(conector.MáximoTókenesEntradaTarifaEstándar, nombre).toBe(272_000);
			expect(conector.TarifaContextoLargo, nombre).toEqual({ MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 });
		}
		expect(ConectoresIA['gpt-6-astra-in-openai'].Precios).toMatchObject({
			EntradaCaché: 1, EntradaNoCaché: 10, EscrituraCachéLargaDuración: 12.5,
			SalidaRazonamiento: 50, SalidaNoRazonamiento: 50,
		});
		expect(ConectoresIA['gpt-6-astra-fast-in-openai'].Precios).toMatchObject({
			EntradaCaché: 2, EntradaNoCaché: 20, EscrituraCachéLargaDuración: 25,
			SalidaRazonamiento: 100, SalidaNoRazonamiento: 100,
		});
		expect(ConectoresIA['gpt-6-astra-pro-in-openai'].ModoEspecialOpenAI).toBe('Pro');
		expect(ConectoresIA['gpt-6-astra-fast-pro-in-openai'].ModoEspecialOpenAI).toBe('Fast Pro');

	});

	it('mantiene low..max con búsqueda web nativa y serializa Fast y Pro', async () => {

		const fetchMock = vi.fn().mockImplementation((_url: string | URL | Request, opciones: RequestInit) => {
			const cuerpo = JSON.parse(String(opciones.body)) as Record<string, unknown>;
			return Promise.resolve(new Response(JSON.stringify({
				status: 'completed', output_text: 'respuesta',
				service_tier: cuerpo.service_tier === 'fast' ? 'priority' : 'default',
				usage: { input_tokens: 1, output_tokens: 1 },
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);

		try {
			for (const nombre of nombres) {
				await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', nombre, 1, {
					BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false, PaísBúsquedaWeb: 'CO',
				}), new AbortController().signal);
				const cuerpo = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body)) as Record<string, unknown>;
				const conector = ConectoresIA[nombre];
				const modo = conector.ModoEspecialOpenAI;
				expect(cuerpo.reasoning, nombre).toEqual(modo === 'Pro' || modo === 'Fast Pro'
					? { effort: 'low', mode: 'pro' } : { effort: 'low' });
				expect(cuerpo.service_tier, nombre).toBe(modo === 'Fast' || modo === 'Fast Pro' ? 'fast' : undefined);
			}

			await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-6-astra-in-openai', 5, {
				BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false, PaísBúsquedaWeb: 'CO',
			}), new AbortController().signal);
			const cuerpoMáximo = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body)) as {
				reasoning: { effort: string; };
			};
			expect(cuerpoMáximo.reasoning.effort).toBe('max');
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('restringe temperature según el rango declarado y no según el nombre del modelo', () => {

		const base = {
			Modo: 'Directo', MensajeUsuario: 'consulta', Razonamiento: 1, Verbosidad: 1,
			TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
		};
		expect(() => ValidarEntradaIA({ ...base, ModeloOConector: 'gpt-6-astra-in-openai', Temperatura: 0.5 }))
			.toThrow(/no admite el parámetro temperature/);
		expect(() => ValidarEntradaIA({ ...base, ModeloOConector: 'gpt-6-astra-in-openai', Temperatura: 1 }))
			.not.toThrow();

		const nombreFuturo = 'gpt-7-prueba-in-openai';
		const conectorFuturo = {
			...ConectoresIA['gpt-6-astra-in-openai'], Nombre: nombreFuturo, Modelo: 'gpt-7-futuro',
			RangoTemperaturaSoportado: [0, 2] as const,
		};
		ConectoresIA[nombreFuturo] = conectorFuturo;
		try {
			expect(() => ValidarEntradaIA({ ...base, ModeloOConector: nombreFuturo, Temperatura: 0.5 }))
			.not.toThrow();
		} finally {
			delete ConectoresIA[nombreFuturo];
		}

	});

});


describe('Conectores GPT-6 Sol y Luna', () => {

	const perfiles: Record<string, { modelo: string; modo?: string; entradaCaché: number; entrada: number; salida: number; escritura: number; }> = {
		'gpt-6-sol-in-openai': { modelo: 'gpt-6-sol', entradaCaché: 0.2, entrada: 2, salida: 10, escritura: 2.5 },
		'gpt-6-sol-fast-in-openai': { modelo: 'gpt-6-sol', modo: 'Fast', entradaCaché: 0.4, entrada: 4, salida: 20, escritura: 5 },
		'gpt-6-sol-pro-in-openai': { modelo: 'gpt-6-sol', modo: 'Pro', entradaCaché: 0.2, entrada: 2, salida: 10, escritura: 2.5 },
		'gpt-6-sol-fast-pro-in-openai': { modelo: 'gpt-6-sol', modo: 'Fast Pro', entradaCaché: 0.4, entrada: 4, salida: 20, escritura: 5 },
		'gpt-6-luna-in-openai': { modelo: 'gpt-6-luna', entradaCaché: 0.01, entrada: 0.1, salida: 0.5, escritura: 0.125 },
		'gpt-6-luna-fast-in-openai': { modelo: 'gpt-6-luna', modo: 'Fast', entradaCaché: 0.02, entrada: 0.2, salida: 1, escritura: 0.25 },
		'gpt-6-luna-pro-in-openai': { modelo: 'gpt-6-luna', modo: 'Pro', entradaCaché: 0.01, entrada: 0.1, salida: 0.5, escritura: 0.125 },
		'gpt-6-luna-fast-pro-in-openai': { modelo: 'gpt-6-luna', modo: 'Fast Pro', entradaCaché: 0.02, entrada: 0.2, salida: 1, escritura: 0.25 },
	};

	it('resuelve los modelos específicos y declara los ocho perfiles con tarifas oficiales', () => {

		expect(ObtenerConectorDesdeModeloOConector('gpt-6-sol')).toBe('gpt-6-sol-in-openai');
		expect(ObtenerConectorDesdeModeloOConector('gpt-6-luna')).toBe('gpt-6-luna-in-openai');
		expect(ObtenerConectorDesdeModeloOConector('gpt-6-luna-fast')).toBe('gpt-6-luna-fast-in-openai');
		expect(Object.keys(ConectoresIA).filter(nombre => /^gpt-6-(sol|luna)-/.test(nombre)).sort())
			.toEqual(Object.keys(perfiles).sort());

		for (const [nombre, esperado] of Object.entries(perfiles)) {
			const conector = ConectoresIA[nombre];
			expect(conector.Modelo, nombre).toBe(esperado.modelo);
			expect(conector.ModoEspecialOpenAI, nombre).toBe(esperado.modo);
			expect(conector.RangoTemperaturaSoportado, nombre).toBeNull();
			expect(conector.MapeoRazonamiento, nombre).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
			expect(conector.MapeoVerbosidad, nombre).toEqual(['low', 'medium', 'high']);
			expect(conector.MáximoTókenesEntradaTarifaEstándar, nombre).toBe(272_000);
			expect(conector.TarifaContextoLargo, nombre).toEqual({ MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 });
			expect(conector.Precios, nombre).toMatchObject({
				EntradaCaché: esperado.entradaCaché, EntradaNoCaché: esperado.entrada, EscrituraCachéLargaDuración: esperado.escritura,
				SalidaRazonamiento: esperado.salida, SalidaNoRazonamiento: esperado.salida,
			});
		}

	});

	it('mantiene low..max con búsqueda web nativa, omite temperature y serializa Fast y Pro', async () => {

		const fetchMock = vi.fn().mockImplementation((_url: string | URL | Request, opciones: RequestInit) => {
			const cuerpo = JSON.parse(String(opciones.body)) as Record<string, unknown>;
			return Promise.resolve(new Response(JSON.stringify({
				status: 'completed', output_text: 'respuesta',
				service_tier: cuerpo.service_tier === 'fast' ? 'priority' : 'default',
				usage: { input_tokens: 1, output_tokens: 1 },
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);

		try {
			for (const [nombre, esperado] of Object.entries(perfiles)) {
				for (const [nivel, esfuerzo] of [[1, 'low'], [5, 'max']] as const) {
					await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', nombre, nivel, {
						BúsquedaWeb: true, ProveedorBúsquedaWeb: 'OpenAI', ForzarBúsquedaWeb: false, PaísBúsquedaWeb: 'CO',
					}), new AbortController().signal);
					const cuerpo = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body)) as Record<string, unknown>;
					const usaFast = esperado.modo === 'Fast' || esperado.modo === 'Fast Pro';
					const usaPro = esperado.modo === 'Pro' || esperado.modo === 'Fast Pro';

					expect(cuerpo.model, nombre).toBe(esperado.modelo);
					expect(cuerpo.temperature, nombre).toBeUndefined();
					expect(cuerpo.reasoning, nombre).toEqual(usaPro ? { effort: esfuerzo, mode: 'pro' } : { effort: esfuerzo });
					expect(cuerpo.service_tier, nombre).toBe(usaFast ? 'fast' : undefined);
				}
			}
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('rechaza temperature distinta de 1 igual que Astra', () => {

		const base = {
			Modo: 'Directo', MensajeUsuario: 'consulta', Razonamiento: 1, Verbosidad: 1,
			TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
		};
		for (const nombre of ['gpt-6-sol-in-openai', 'gpt-6-luna-in-openai']) {
			expect(() => ValidarEntradaIA({ ...base, ModeloOConector: nombre, Temperatura: 0.5 }), nombre)
				.toThrow(/no admite el parámetro temperature/);
			expect(() => ValidarEntradaIA({ ...base, ModeloOConector: nombre, Temperatura: 1 }), nombre)
				.not.toThrow();
		}

	});

});


describe('Conectores DeepSeek V4 Flash 0731', () => {

	const perfiles: Record<string, { proveedor: string; modelo: string; estilo: string; mapeo: string[]; entradaCaché: number; entrada: number; salida: number; máximos: string; }> = {
		'deepseek-v4-flash-0731-in-deepinfra': { proveedor: 'deepinfra', modelo: 'deepseek-ai/DeepSeek-V4-Flash-0731', estilo: 'reasoning-effort', mapeo: ['none', 'low', 'high', 'max'], entradaCaché: 0.016, entrada: 0.06, salida: 0.18, máximos: 'max_tokens' },
		'deepseek-v4-flash-0731-in-novita': { proveedor: 'novita', modelo: 'deepseek/deepseek-v4-flash-0731', estilo: 'openai-effort', mapeo: ['none', 'low', 'high', 'max'], entradaCaché: 0.028, entrada: 0.44, salida: 1.32, máximos: 'max_tokens' },
		'deepseek-v4-flash-0731-in-fireworks': { proveedor: 'fireworks', modelo: 'accounts/fireworks/models/deepseek-v4-flash-0731', estilo: 'reasoning-effort', mapeo: ['none', 'low', 'high', 'max'], entradaCaché: 0.007, entrada: 0.22, salida: 0.66, máximos: 'max_tokens' },
		'deepseek-v4-flash-0731-in-inceptron': { proveedor: 'inceptron', modelo: 'deepseek-ai/DeepSeek-V4-Flash-0731', estilo: 'reasoning-effort', mapeo: ['none', 'high', 'max'], entradaCaché: 0.03, entrada: 0.13, salida: 0.28, máximos: 'max_tokens' },
		'deepseek-v4-flash-0731-in-parasail': { proveedor: 'parasail', modelo: 'deepseek-ai/DeepSeek-V4-Flash-0731', estilo: 'parasail-deepseek', mapeo: ['none', 'high', 'max'], entradaCaché: 0.07, entrada: 0.14, salida: 0.28, máximos: 'max_completion_tokens' },
		'deepseek-v4-flash-0731-in-cloudflare': { proveedor: 'cloudflare', modelo: '@cf/deepseek-ai/deepseek-v4-flash-0731', estilo: 'reasoning-effort', mapeo: ['low', 'medium', 'high'], entradaCaché: 0.014, entrada: 0.44, salida: 1.32, máximos: 'max_completion_tokens' },
		'deepseek-v4-flash-0731-in-together': { proveedor: 'together', modelo: 'deepseek-ai/DeepSeek-V4-Flash-0731', estilo: 'reasoning-effort', mapeo: ['none', 'high', 'max'], entradaCaché: 0.03, entrada: 0.14, salida: 0.28, máximos: 'max_tokens' },
	};

	it('declara solo los proveedores disponibles y resuelve el modelo específico', () => {

		expect(ProveedoresIA.together).toEqual({ Clave: 'CLAVE_TOGETHER', Url: 'https://api.together.xyz/v1', Formato: 'OpenAI Chat', MáximosTókenesSalidaTípicos: 128_000 });
		expect(Object.keys(perfiles)).toEqual([
			'deepseek-v4-flash-0731-in-deepinfra', 'deepseek-v4-flash-0731-in-novita',
			'deepseek-v4-flash-0731-in-fireworks', 'deepseek-v4-flash-0731-in-inceptron', 'deepseek-v4-flash-0731-in-parasail',
			'deepseek-v4-flash-0731-in-cloudflare', 'deepseek-v4-flash-0731-in-together',
		]);
		expect(ObtenerConectorDesdeModeloOConector('deepseek-v4-flash-0731')).toBe('deepseek-v4-flash-0731-in-parasail');

		for (const [nombre, esperado] of Object.entries(perfiles)) {
			const conector = ConectoresIA[nombre];
			expect(conector, nombre).toBeDefined();
			expect(conector.Proveedor, nombre).toBe(esperado.proveedor);
			expect(conector.Modelo, nombre).toBe(esperado.modelo);
			expect(conector.RangoTemperaturaSoportado, nombre).toEqual([0, 2]);
			expect(conector.RazonamientoConfigurable, nombre).toBe(true);
			expect(conector.EstiloRazonamiento, nombre).toBe(esperado.estilo);
			expect(conector.MapeoRazonamiento, nombre).toEqual(esperado.mapeo);
			expect(conector.NombreParámetroMáximosTokenes, nombre).toBe(esperado.máximos);
			expect(conector.Precios, nombre).toMatchObject({ EntradaCaché: esperado.entradaCaché, EntradaNoCaché: esperado.entrada, SalidaRazonamiento: esperado.salida, SalidaNoRazonamiento: esperado.salida });
		}

	});

});


describe('Conectores DeepSeek V4.1 Flash', () => {

	const perfiles: Record<string, { proveedor: string; modelo: string; estilo: string; mapeo: string[]; entradaCaché: number; entrada: number; salida: number; máximos: string; }> = {
		'deepseek-v4.1-flash-in-deepinfra': { proveedor: 'deepinfra', modelo: 'deepseek-ai/DeepSeek-V4.1-Flash', estilo: 'reasoning-effort', mapeo: ['none', 'low', 'medium', 'high'], entradaCaché: 0.006, entrada: 0.30, salida: 1.20, máximos: 'max_tokens' },
		'deepseek-v4.1-flash-in-novita': { proveedor: 'novita', modelo: 'deepseek/deepseek-v4.1-flash', estilo: 'openai-effort', mapeo: ['none', 'low', 'high'], entradaCaché: 0.006, entrada: 0.30, salida: 1.20, máximos: 'max_tokens' },
		'deepseek-v4.1-flash-in-fireworks': { proveedor: 'fireworks', modelo: 'accounts/fireworks/models/deepseek-v4p1-flash', estilo: 'reasoning-effort', mapeo: ['none', 'low', 'medium', 'high', 'max'], entradaCaché: 0.007, entrada: 0.22, salida: 0.66, máximos: 'max_tokens' },
	};

	it('declara los tres conectores con sus identificadores y tarifas actuales', () => {

		expect(Object.keys(ConectoresIA).filter(nombre => nombre.startsWith('deepseek-v4.1-flash-in-'))).toEqual(Object.keys(perfiles));
		expect(ObtenerConectorDesdeModeloOConector('deepseek-v4.1-flash')).toBe('deepseek-v4.1-flash-in-fireworks');

		for (const [nombre, esperado] of Object.entries(perfiles)) {
			const conector = ConectoresIA[nombre];
			expect(conector, nombre).toBeDefined();
			expect(conector.Proveedor, nombre).toBe(esperado.proveedor);
			expect(conector.Modelo, nombre).toBe(esperado.modelo);
			expect(conector.RangoTemperaturaSoportado, nombre).toEqual([0, 2]);
			expect(conector.RazonamientoConfigurable, nombre).toBe(true);
			expect(conector.EstiloRazonamiento, nombre).toBe(esperado.estilo);
			expect(conector.MapeoRazonamiento, nombre).toEqual(esperado.mapeo);
			expect(conector.NombreParámetroMáximosTokenes, nombre).toBe(esperado.máximos);
			expect(conector.Precios, nombre).toMatchObject({ EntradaCaché: esperado.entradaCaché, EntradaNoCaché: esperado.entrada, SalidaRazonamiento: esperado.salida, SalidaNoRazonamiento: esperado.salida });
		}

	});

});


describe('Conectores DeepSeek V4 Pro 0813', () => {

	const perfiles: Record<string, { proveedor: string; modelo: string; estilo: string; mapeo: string[]; entradaCaché: number; entrada: number; salida: number; máximos: string; formatoCloudflare?: string; }> = {
		'deepseek-v4-pro-0813-in-deepinfra': { proveedor: 'deepinfra', modelo: 'deepseek-ai/DeepSeek-V4-Pro-0813', estilo: 'reasoning-effort', mapeo: ['none', 'low', 'high', 'max'], entradaCaché: 0.10, entrada: 1.30, salida: 2.60, máximos: 'max_tokens' },
		'deepseek-v4-pro-0813-in-novita': { proveedor: 'novita', modelo: 'deepseek/deepseek-v4-pro-0813', estilo: 'openai-effort', mapeo: ['none', 'low', 'high', 'max'], entradaCaché: 0.132, entrada: 1.32, salida: 3.96, máximos: 'max_tokens' },
		'deepseek-v4-pro-0813-in-fireworks': { proveedor: 'fireworks', modelo: 'accounts/fireworks/models/deepseek-v4-pro-0813', estilo: 'reasoning-effort', mapeo: ['none', 'low', 'high', 'max'], entradaCaché: 0.044, entrada: 1.32, salida: 3.96, máximos: 'max_tokens' },
		'deepseek-v4-pro-0813-in-parasail': { proveedor: 'parasail', modelo: 'deepseek-ai/DeepSeek-V4-Pro-0813', estilo: 'parasail-deepseek', mapeo: ['none', 'high', 'max'], entradaCaché: 0.10, entrada: 1.32, salida: 3.96, máximos: 'max_completion_tokens' },
		'deepseek-v4-pro-0813-in-cloudflare': { proveedor: 'cloudflare', modelo: '@cf/deepseek-ai/deepseek-v4-pro-0813', estilo: 'reasoning-effort', mapeo: ['none', 'low', 'medium', 'high'], entradaCaché: 0.044, entrada: 1.32, salida: 3.96, máximos: 'max_completion_tokens', formatoCloudflare: 'OpenAIChat' },
		'deepseek-v4-pro-0813-in-together': { proveedor: 'together', modelo: 'deepseek-ai/DeepSeek-V4-Pro-0813', estilo: 'reasoning-effort', mapeo: ['none', 'low', 'high', 'max'], entradaCaché: 0.13, entrada: 1.32, salida: 3.96, máximos: 'max_tokens' },
	};

	it('declara los seis proveedores disponibles y resuelve el modelo específico', () => {

		expect(Object.keys(perfiles)).toEqual([
			'deepseek-v4-pro-0813-in-deepinfra', 'deepseek-v4-pro-0813-in-novita',
			'deepseek-v4-pro-0813-in-fireworks', 'deepseek-v4-pro-0813-in-parasail',
			'deepseek-v4-pro-0813-in-cloudflare', 'deepseek-v4-pro-0813-in-together',
		]);
		expect(ObtenerConectorDesdeModeloOConector('deepseek-v4-pro-0813')).toBe('deepseek-v4-pro-0813-in-parasail');

		for (const [nombre, esperado] of Object.entries(perfiles)) {
			const conector = ConectoresIA[nombre];
			expect(conector, nombre).toBeDefined();
			expect(conector.Proveedor, nombre).toBe(esperado.proveedor);
			expect(conector.Modelo, nombre).toBe(esperado.modelo);
			expect(conector.RangoTemperaturaSoportado, nombre).toEqual([0, 2]);
			expect(conector.RazonamientoConfigurable, nombre).toBe(true);
			expect(conector.EstiloRazonamiento, nombre).toBe(esperado.estilo);
			expect(conector.MapeoRazonamiento, nombre).toEqual(esperado.mapeo);
			expect(conector.NombreParámetroMáximosTokenes, nombre).toBe(esperado.máximos);
			expect(conector.Precios, nombre).toMatchObject({ EntradaCaché: esperado.entradaCaché, EntradaNoCaché: esperado.entrada, SalidaRazonamiento: esperado.salida, SalidaNoRazonamiento: esperado.salida });
			if (esperado.formatoCloudflare) expect(conector.FormatoRespuestaCloudflare, nombre).toBe(esperado.formatoCloudflare);
		}

	});

});


describe('Conectores GLM 5.3 Flash', () => {

	const perfiles: Record<string, { proveedor: string; modelo: string; estilo: string; mapeo: string[]; entradaCaché: number; entrada: number; salida: number; máximos: string; formatoCloudflare?: string; }> = {
		'glm-5.3-flash-in-deepinfra': { proveedor: 'deepinfra', modelo: 'zai-org/GLM-5.3-Flash', estilo: 'reasoning-effort', mapeo: ['low', 'high', 'max'], entradaCaché: 0.03, entrada: 0.15, salida: 0.50, máximos: 'max_tokens' },
		'glm-5.3-flash-in-novita': { proveedor: 'novita', modelo: 'zai-org/glm-5.3-flash', estilo: 'reasoning-effort', mapeo: ['low', 'high', 'max'], entradaCaché: 0.03, entrada: 0.15, salida: 0.50, máximos: 'max_tokens' },
		'glm-5.3-flash-in-fireworks': { proveedor: 'fireworks', modelo: 'accounts/fireworks/models/glm-5p3-flash', estilo: 'reasoning-effort', mapeo: ['low', 'high', 'max'], entradaCaché: 0.03, entrada: 0.15, salida: 0.50, máximos: 'max_tokens' },
		'glm-5.3-flash-in-parasail': { proveedor: 'parasail', modelo: 'zai-org/GLM-5.3-Flash', estilo: 'reasoning-effort', mapeo: ['low', 'high', 'max'], entradaCaché: 0.03, entrada: 0.15, salida: 0.50, máximos: 'max_completion_tokens' },
		'glm-5.3-flash-in-cloudflare': { proveedor: 'cloudflare', modelo: '@cf/zai-org/glm-5.3-flash', estilo: 'reasoning-effort', mapeo: ['low', 'medium', 'high'], entradaCaché: 0.03, entrada: 0.15, salida: 0.50, máximos: 'max_completion_tokens', formatoCloudflare: 'OpenAIChat' },
		'glm-5.3-flash-in-together': { proveedor: 'together', modelo: 'zai-org/GLM-5.3-Flash', estilo: 'reasoning-effort', mapeo: ['low', 'high', 'max'], entradaCaché: 0.03, entrada: 0.15, salida: 0.50, máximos: 'max_tokens' },
	};

	it('declara solo los proveedores disponibles y resuelve el modelo específico', () => {

		const nombresEsperados = [
			'glm-5.3-flash-in-deepinfra', 'glm-5.3-flash-in-novita', 'glm-5.3-flash-in-fireworks',
			'glm-5.3-flash-in-parasail', 'glm-5.3-flash-in-cloudflare', 'glm-5.3-flash-in-together',
		];
		expect(Object.keys(perfiles)).toEqual(nombresEsperados);
		expect(Object.keys(ConectoresIA).filter(nombre => nombre.startsWith('glm-5.3-flash-in-'))).toEqual(nombresEsperados);
		expect(ConectoresIA['glm-5.3-flash-in-inceptron']).toBeUndefined();
		expect(ObtenerConectorDesdeModeloOConector('glm-5.3-flash')).toBe('glm-5.3-flash-in-parasail');

		for (const [nombre, esperado] of Object.entries(perfiles)) {
			const conector = ConectoresIA[nombre];
			expect(conector, nombre).toBeDefined();
			expect(conector.Proveedor, nombre).toBe(esperado.proveedor);
			expect(conector.Modelo, nombre).toBe(esperado.modelo);
			expect(conector.RangoTemperaturaSoportado, nombre).toEqual([0, 2]);
			expect(conector.RazonamientoConfigurable, nombre).toBe(true);
			expect(conector.EstiloRazonamiento, nombre).toBe(esperado.estilo);
			expect(conector.MapeoRazonamiento, nombre).toEqual(esperado.mapeo);
			expect(conector.NombreParámetroMáximosTokenes, nombre).toBe(esperado.máximos);
			expect(conector.Precios, nombre).toMatchObject({ EntradaCaché: esperado.entradaCaché, EntradaNoCaché: esperado.entrada, SalidaRazonamiento: esperado.salida, SalidaNoRazonamiento: esperado.salida });
			if (esperado.formatoCloudflare) expect(conector.FormatoRespuestaCloudflare, nombre).toBe(esperado.formatoCloudflare);
		}

	});

});


describe('Conectores MiMo V2.6', () => {

	const perfiles: Record<string, { modelo: string; entradaCaché: number; entrada: number; salida: number; }> = {
		'mimo-v2.6-pro-in-deepinfra': { modelo: 'XiaomiMiMo/MiMo-V2.6-Pro', entradaCaché: 0.004, entrada: 0.435, salida: 0.87 },
		'mimo-v2.6-flash-in-deepinfra': { modelo: 'XiaomiMiMo/MiMo-V2.6-Flash', entradaCaché: 0.003, entrada: 0.14, salida: 0.28 },
	};

	it('declara solo los conectores de DeepInfra y resuelve los modelos específicos', () => {

		expect(Object.keys(ConectoresIA).filter(nombre => nombre.startsWith('mimo-'))).toEqual(Object.keys(perfiles));
		expect(ObtenerConectorDesdeModeloOConector('mimo-v2.6-pro')).toBe('mimo-v2.6-pro-in-deepinfra');
		expect(ObtenerConectorDesdeModeloOConector('mimo-v2.6-flash')).toBe('mimo-v2.6-flash-in-deepinfra');

		for (const [nombre, esperado] of Object.entries(perfiles)) {
			const conector = ConectoresIA[nombre];
			expect(conector, nombre).toBeDefined();
			expect(conector.Proveedor, nombre).toBe('deepinfra');
			expect(conector.Modelo, nombre).toBe(esperado.modelo);
			expect(conector.RangoTemperaturaSoportado, nombre).toBeNull();
			expect(conector.RazonamientoConfigurable, nombre).toBe(true);
			expect(conector.EstiloRazonamiento, nombre).toBe('reasoning-effort');
			expect(conector.MapeoRazonamiento, nombre).toEqual(['none', 'low', 'medium', 'high']);
			expect(conector.NombreParámetroMáximosTokenes, nombre).toBe('max_tokens');
			expect(conector.Respaldo, nombre).toBeNull();
			expect(conector.RespaldoFinal, nombre).toBeNull();
			expect(conector.Precios, nombre).toMatchObject({ EntradaCaché: esperado.entradaCaché, EntradaNoCaché: esperado.entrada, SalidaRazonamiento: esperado.salida, SalidaNoRazonamiento: esperado.salida });
		}

	});

	it.each([
		{ nivel: 1, esperado: 'none' },
		{ nivel: 3, esperado: 'medium' },
		{ nivel: 5, esperado: 'high' },
	])('envía reasoning_effort $esperado en el nivel $nivel y omite temperature', async ({ nivel, esperado }) => {

		const cuerpos: Record<string, unknown>[] = [];
		const fetchMock = vi.fn().mockImplementation((_entrada: string | URL | Request, opciones?: RequestInit) => {
			cuerpos.push(JSON.parse(String(opciones?.body)) as Record<string, unknown>);
			return Promise.resolve(new Response(JSON.stringify({
				choices: [{ finish_reason: 'stop', message: { content: 'respuesta' } }],
				usage: { prompt_tokens: 1, completion_tokens: 1 },
			}), { headers: { 'content-type': 'application/json' } }));
		});
		vi.stubGlobal('fetch', fetchMock);

		try {
			for (const [nombre, esperadoPerfil] of Object.entries(perfiles)) {
				const resultado = await ConsultarIADirecto(CrearContextoConsultaProveedor('Directo', nombre, { Razonamiento: nivel }),
					new AbortController().signal);
				const cuerpo = cuerpos.at(-1);

				expect(resultado.Tipo, nombre).toBe('Respuesta');
				expect(fetchMock.mock.calls.at(-1)?.[0], nombre).toBe('https://api.deepinfra.com/v1/openai/chat/completions');
				expect(cuerpo?.model, nombre).toBe(esperadoPerfil.modelo);
				expect(cuerpo?.reasoning_effort, nombre).toBe(esperado);
				expect(cuerpo?.temperature, nombre).toBeUndefined();
				expect(cuerpo?.max_tokens, nombre).toBe(100);
			}
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('rechaza temperature distinta de 1', () => {

		const base = {
			Modo: 'Directo', MensajeUsuario: 'consulta', Razonamiento: 1, Verbosidad: 1,
			TókenesMáximos: 100, SegundosMáximos: 30, Idioma: 'es',
		};
		for (const nombre of Object.keys(perfiles)) {
			expect(() => ValidarEntradaIA({ ...base, ModeloOConector: nombre, Temperatura: 0.5 }), nombre)
				.toThrow(/no admite el parámetro temperature/);
			expect(() => ValidarEntradaIA({ ...base, ModeloOConector: nombre, Temperatura: 1 }), nombre)
				.not.toThrow();
		}

	});

});


describe('Modos especiales de OpenAI', () => {

	it.each([
		{ modo: null, modelo: 'gpt-5.6-terra-in-openai', serviceTier: 'default' },
		{ modo: 'Fast', modelo: 'gpt-5.6-terra-fast-in-openai', serviceTier: 'priority' },
		{ modo: 'Pro', modelo: 'gpt-5.6-terra-pro-in-openai', serviceTier: 'default' },
		{ modo: 'Fast Pro', modelo: 'gpt-5.6-terra-fast-pro-in-openai', serviceTier: 'priority' },
		{ modo: null, modelo: 'gpt-6-astra-in-openai', serviceTier: 'default' },
		{ modo: 'Fast', modelo: 'gpt-6-astra-fast-in-openai', serviceTier: 'priority' },
		{ modo: 'Pro', modelo: 'gpt-6-astra-pro-in-openai', serviceTier: 'default' },
		{ modo: 'Fast Pro', modelo: 'gpt-6-astra-fast-pro-in-openai', serviceTier: 'priority' },
	] as const)('serializa correctamente el perfil $modo', async ({ modo, modelo, serviceTier }) => {

		enviarAlertaErrorCriticoMock.mockReset();
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta', service_tier: serviceTier,
			usage: { input_tokens: 10, output_tokens: 5 },
		}), { headers: { 'content-type': 'application/json' } }));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', modelo), new AbortController().signal);
			const opciones = fetchMock.mock.calls[0][1] as RequestInit;
			const cuerpo = JSON.parse(String(opciones.body)) as Record<string, unknown>;

			expect(resultado.Tipo).toBe('Respuesta');
			expect(cuerpo.service_tier).toBe(modo === 'Fast' || modo === 'Fast Pro' ? 'fast' : undefined);
			expect(cuerpo.reasoning).toEqual(modo === 'Pro' || modo === 'Fast Pro'
				? { effort: 'low', mode: 'pro' } : { effort: 'low' });
			expect(enviarAlertaErrorCriticoMock).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('alerta cuando Fast recibe service_tier default en respuesta directa', async () => {

		enviarAlertaErrorCriticoMock.mockReset();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta', service_tier: 'default', usage: { input_tokens: 1, output_tokens: 1 },
		}), { headers: { 'content-type': 'application/json' } })));

		try {
			const contexto = CrearContextoConsultaOpenAI('Directo', 'gpt-5.6-terra-fast-in-openai');
			const resultado = await ConsultarIADirecto(contexto, new AbortController().signal);

			expect(resultado.Tipo).toBe('Respuesta');
			expect(enviarAlertaErrorCriticoMock).toHaveBeenCalledWith(contexto, 'OpenAIFastDegradado',
				expect.stringContaining('degradó'), expect.stringContaining('gpt-5.6-terra-fast-in-openai'));
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('cobra el precio Fast del pseudo-modelo aunque el tier efectivo sea default', async () => {

		enviarAlertaErrorCriticoMock.mockReset();
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
			status: 'completed', output_text: 'respuesta', service_tier: 'default',
			usage: {
				input_tokens: 1_000,
				input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 },
				output_tokens: 100, output_tokens_details: { reasoning_tokens: 20 },
			},
		}), { headers: { 'content-type': 'application/json' } })));

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-5.6-terra-fast-in-openai'), new AbortController().signal);

			expect(resultado.CostoDólares).toBeCloseTo(0.00624, 12);
		} finally {
			vi.unstubAllGlobals();
		}

	});

});


describe('ResolverValorEscalado', () => {

    it('devuelve undefined si nivelFrontend es undefined', () => {
        expect(ResolverValorEscalado(undefined, 1, 5, ['low', 'medium', 'high'])).toBeUndefined();
    });

    it('devuelve undefined si el mapeo está vacío', () => {
        expect(ResolverValorEscalado(3, 1, 5, [])).toBeUndefined();
    });

    it('devuelve el único valor si el mapeo tiene un solo elemento', () => {
        expect(ResolverValorEscalado(1, 1, 5, ['only'])).toBe('only');
        expect(ResolverValorEscalado(5, 1, 5, ['only'])).toBe('only');
    });

    it('mapea 5 niveles → 3 valores con distribución correcta (1,2→primero; 3→central; 4,5→último)', () => {
        const mapeo = ['low', 'medium', 'high'] as const;
        expect(ResolverValorEscalado(1, 1, 5, mapeo)).toBe('low');
        expect(ResolverValorEscalado(2, 1, 5, mapeo)).toBe('low');
        expect(ResolverValorEscalado(3, 1, 5, mapeo)).toBe('medium');
        expect(ResolverValorEscalado(4, 1, 5, mapeo)).toBe('high');
        expect(ResolverValorEscalado(5, 1, 5, mapeo)).toBe('high');
    });

    it('mapea 5 niveles → 2 valores con distribución correcta (1,2→none; 3,4,5→enabled)', () => {
        const mapeo = ['none', 'enabled'] as const;
        expect(ResolverValorEscalado(1, 1, 5, mapeo)).toBe('none');
        expect(ResolverValorEscalado(2, 1, 5, mapeo)).toBe('none');
        expect(ResolverValorEscalado(3, 1, 5, mapeo)).toBe('enabled');
        expect(ResolverValorEscalado(4, 1, 5, mapeo)).toBe('enabled');
        expect(ResolverValorEscalado(5, 1, 5, mapeo)).toBe('enabled');
    });

    it('acota un nivel inferior al mínimo al primer valor del mapeo', () => {
        const mapeo = ['low', 'medium', 'high'] as const;
        expect(ResolverValorEscalado(0, 1, 5, mapeo)).toBe('low');
    });

    it('acota un nivel superior al máximo al último valor del mapeo', () => {
        const mapeo = ['low', 'medium', 'high'] as const;
        expect(ResolverValorEscalado(9, 1, 5, mapeo)).toBe('high');
    });

    it('mapea 5 niveles → 4 valores con distribución correcta (MINIMAL,LOW,MEDIUM,MEDIUM,HIGH)', () => {
        const mapeo = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
        expect(ResolverValorEscalado(1, 1, 5, mapeo)).toBe('MINIMAL');
        expect(ResolverValorEscalado(2, 1, 5, mapeo)).toBe('LOW');
        expect(ResolverValorEscalado(3, 1, 5, mapeo)).toBe('MEDIUM');
        expect(ResolverValorEscalado(4, 1, 5, mapeo)).toBe('MEDIUM'); // El nivel central se repite porque 5 niveles no caben simétricamente en 4 buckets.
        expect(ResolverValorEscalado(5, 1, 5, mapeo)).toBe('HIGH');
    });

});


// ─── LimpiarRazonamientoTipoThink ─────────────────────────────────────────────

describe('LimpiarRazonamientoTipoThink', () => {

    it('elimina múltiples bloques <think>...</think>', () => {
        expect(LimpiarRazonamientoTipoThink('<think>uno</think>texto<think>dos</think>final')).toBe('textofinal');
    });

    it('elimina bloque <think> sin cierre hasta el final del string', () => {
        expect(LimpiarRazonamientoTipoThink('visible<think>razonamiento sin cierre')).toBe('visible');
    });

    it('preserva texto que no contiene ninguna etiqueta', () => {
        expect(LimpiarRazonamientoTipoThink('texto limpio')).toBe('texto limpio');
    });

    it('elimina bloque con saltos de línea internos', () => {
        expect(LimpiarRazonamientoTipoThink('<think>línea1\nlínea2\nlínea3</think>respuesta')).toBe('respuesta');
    });

    it('preserva texto antes del bloque <think>', () => {
        expect(LimpiarRazonamientoTipoThink('introducción<think>oculto</think> continuación')).toBe('introducción continuación');
    });

    it('no elimina etiquetas similares pero distintas', () => {
        expect(LimpiarRazonamientoTipoThink('<thinking>algo</thinking>')).toBe('<thinking>algo</thinking>');
    });

});


// ─── FiltrarRazonamientoTipoThink + FinalizarFiltroRazonamiento ───────────────

function simularFlujo(trozos: string[]): string {

    const estado: EstadoFiltroRazonamiento = { EnRazonamiento: false, Búfer: '' };
    const emitido: string[] = [];
    const emitir = (t: string): void => { emitido.push(t); };
    for (const trozo of trozos) FiltrarRazonamientoTipoThink(estado, trozo, emitir);
    FinalizarFiltroRazonamiento(estado, emitir);
    return emitido.join('');

}


describe('FiltrarRazonamientoTipoThink', () => {

    it('descarta bloque <think>...</think> en un solo trozo', () => {
        expect(simularFlujo(['antes<think>oculto</think>después'])).toBe('antesdespués');
    });

    it('descarta bloque <think>...</think> partido en dos trozos', () => {
        expect(simularFlujo(['antes<thi', 'nk>oculto</think>después'])).toBe('antesdespués');
    });

    it('descarta etiqueta de cierre partida entre dos trozos', () => {
        expect(simularFlujo(['<think>oculto</thi', 'nk>después'])).toBe('después');
    });

    it('descarta múltiples bloques distribuidos en trozos distintos', () => {
        expect(simularFlujo(['texto1<think>r1</think>', 'texto2<think>r2</think>', 'texto3'])).toBe('texto1texto2texto3');
    });

    it('emite el búfer residual al finalizar si no hay razonamiento abierto', () => {
        // 'hola <thi' no contiene '<think>' completo; el algoritmo retiene los últimos 6 chars ('<think>' mide 7, así N-1=6)
        // como posible inicio de etiqueta partida. FinalizarFiltroRazonamiento los emite todos al cerrar el flujo.
        expect(simularFlujo(['hola <thi'])).toBe('hola <thi');
    });

    it('descarta el búfer residual si el flujo termina dentro de un bloque <think>', () => {
        expect(simularFlujo(['<think>razonamiento sin cierre'])).toBe('');
    });

    it('descarta bloque <think> cuando la etiqueta de apertura queda exactamente en el límite de dos trozos', () => {
        expect(simularFlujo(['<think', '>oculto</think>fin'])).toBe('fin');
    });

    it('emite correctamente texto después de múltiples trozos sin etiquetas', () => {
        expect(simularFlujo(['uno', 'dos', 'tres'])).toBe('unodostres');
    });

    it('maneja trozo vacío sin errores', () => {
        expect(simularFlujo(['antes', '', 'después'])).toBe('antesdespués');
    });

    it('descarta razonamiento cuando la etiqueta de cierre queda partida en el carácter final', () => {
        expect(simularFlujo(['<think>datos</thin', 'k>visible'])).toBe('visible');
    });

});


describe('FinalizarFiltroRazonamiento', () => {

    it('no emite nada si el búfer está vacío y no hay razonamiento abierto', () => {
        const estado: EstadoFiltroRazonamiento = { EnRazonamiento: false, Búfer: '' };
        const emitido: string[] = [];
        FinalizarFiltroRazonamiento(estado, t => emitido.push(t));
        expect(emitido).toHaveLength(0);
    });

});


// ─── ResolverCadenaConectores ─────────────────────────────────────────────────

describe('ResolverCadenaConectores', () => {

    it('devuelve cadena vacía para un conector inexistente', () => {
        expect(ResolverCadenaConectores('no-existe')).toEqual([]);
    });

    it('devuelve solo el conector principal si no tiene respaldos', () => {
        const resultado = ResolverCadenaConectores('gemini-3.1-pro-in-google');
        expect(resultado).toEqual(['gemini-3.1-pro-in-google']);
    });

    it('la cadena tiene como máximo 3 elementos (principal + respaldo + respaldoFinal)', () => {
        const resultado = ResolverCadenaConectores('gpt-5.5-in-openai');
        expect(resultado.length).toBeLessThanOrEqual(3);
    });

    it('mantiene la cadena en un solo elemento cuando los respaldos están desactivados', () => {

        const conectorConRespaldos = 'omni-moderation-latest-in-openai';
        expect(ResolverCadenaConectores(conectorConRespaldos).length).toBeGreaterThan(1); // Comprueba primero que el conector sí tiene respaldos, para que la prueba falle en vez de quedar vacía si un día la configuración se los quita.
        expect(ResolverCadenaConectores(conectorConRespaldos, true)).toEqual([conectorConRespaldos]);

    });

});


// ─── ObtenerConectorDesdeModeloOConector ───────────────────────────────────────

describe('ObtenerConectorDesdeModeloOConector', () => {

    it('falla con error de configuración si un modelo específico apunta a un conector inexistente', () => {
        ModelosIAEspecíficos['modelo-roto-test'] = { conector: 'conector-inexistente-test' };
        try {
            expect(() => ObtenerConectorDesdeModeloOConector('modelo-roto-test'))
                .toThrow("ModelosEspecíficos['modelo-roto-test'].conector = 'conector-inexistente-test' no existe en ConectoresIA");
        } finally {
            delete ModelosIAEspecíficos['modelo-roto-test'];
        }
    });

});


describe('Clasificación de errores de conectores IA', () => {

	it('distingue el límite máximo de tokens', () => {
		expect(ClasificarErrorConectorIA(new Error('La respuesta no pudo completarse porque se alcanzó el límite máximo de tókenes. Aumenta TókenesMáximos o solicita una respuesta más corta.')))
			.toBe(CódigoErrorIA.LímiteTókenesAlcanzado);
	});

	it('distingue una respuesta truncada por la ventana de contexto', () => {
		expect(ClasificarErrorConectorIA(new Error('La respuesta se truncó por la ventana de contexto.')))
			.toBe(CódigoErrorIA.RespuestaDemasiadoLarga);
	});

	it('trata cierres incompletos como indisponibilidad del proveedor sin atribuirlos a la longitud', () => {
		expect(ClasificarErrorConectorIA(new Error('Respuesta incompleta del proveedor: incomplete')))
			.toBe(CódigoErrorIA.ProveedorNoDisponible);
		expect(ClasificarErrorConectorIA(new Error('El flujo finalizó sin un evento de completado.')))
			.toBe(CódigoErrorIA.ProveedorNoDisponible);
		expect(ClasificarErrorConectorIA(new Error('El proveedor finalizó el flujo silenciosamente.')))
			.toBe(CódigoErrorIA.ProveedorNoDisponible);
	});

	it('distingue contenido bloqueado, cancelación, timeout y configuración', () => {
		expect(ClasificarErrorConectorIA(new Error('La respuesta fue bloqueada por el filtro de contenido.')))
			.toBe(CódigoErrorIA.ContenidoNoPermitido);
		expect(ClasificarErrorConectorIA(new Error('Proveedor bloqueó el contenido: SAFETY')))
			.toBe(CódigoErrorIA.ContenidoNoPermitido);
		expect(ClasificarErrorConectorIA(new Error('cancelada'), true)).toBe(CódigoErrorIA.SolicitudCancelada);
		expect(ClasificarErrorConectorIA(new Error('timeout'), false, true)).toBe(CódigoErrorIA.TiempoEsperaAgotado);
		expect(ClasificarErrorConectorIA(new Error('Error de configuración: falta una clave')))
			.toBe(CódigoErrorIA.ConfiguraciónInválida);
	});

	it('no asigna unidades a un Error normal aunque su texto parezca un bloqueo', async () => {

		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Proveedor bloqueó el contenido: SAFETY')));

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo'), new AbortController().signal);
			expect(resultado.Errores[0].Código).toBe(CódigoErrorIA.ContenidoNoPermitido);
			expect(resultado.UnidadesInfracción).toBe(0);
		} finally {
			vi.unstubAllGlobals();
		}

	});

	it('conserva proveedor no disponible para errores desconocidos', () => {
		expect(ClasificarErrorConectorIA(new Error('HTTP 503'))).toBe(CódigoErrorIA.ProveedorNoDisponible);
	});

	it('registra detalles seguros del error HTTP sin cambiar el error público', async () => {

		const registro = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			error: { code: 'rate_limit_exceeded', type: 'rate_limit_error', message: 'Too many requests' },
		}), {
			status: 429,
			headers: { 'content-type': 'application/json', 'x-request-id': 'req-prueba', 'retry-after': '7' },
		}));
		vi.stubGlobal('fetch', fetchMock);

		try {
			const resultado = await ConsultarIADirecto(CrearContextoConsultaOpenAI('Directo', 'gpt-5.5-in-openai'),
				new AbortController().signal);
			const evento = registro.mock.calls
				.map(([mensaje]) => JSON.parse(String(mensaje)) as { Evento: string; Metadatos: Record<string, unknown>; })
				.find(carga => carga.Evento === 'IA.ErrorHTTPProveedor');

			expect(resultado.Tipo).toBe('Error');
			expect(resultado.Errores[0].Error).toBe('Proveedor HTTP 429 [Directo].');
			expect(evento?.Metadatos).toMatchObject({
				Conector: 'gpt-5.5-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.5', Modo: 'Directo',
				EstadoHttp: 429, CódigoErrorProveedor: 'rate_limit_exceeded', TipoErrorProveedor: 'rate_limit_error',
				MensajeErrorProveedor: 'Too many requests', IdSolicitudProveedor: 'req-prueba', ReintentarDespués: '7',
			});
		} finally {
			registro.mockRestore();
			vi.unstubAllGlobals();
		}

	});

});
