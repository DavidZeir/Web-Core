import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Contexto } from '../../src/nucleo/global';
import { CódigoErrorIA } from '../../src/nucleo/ia';
import { GenerarTextoAVozDirecto, MensajeConectorTextoAVozDesactivado } from '../../src/nucleo/texto-a-voz';


afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});


describe('cadena Kokoro con cortacircuitos', () => {

	it('omite DeepInfra sin fetch y usa Together inmediatamente', async () => {

		const fetchMock = vi.fn(async (url: string) => {
			expect(url).toContain('api.together.xyz');
			return new Response(CrearAudioCbr(8000), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
		});
		vi.stubGlobal('fetch', fetchMock);
		const registro = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		const resultado = await GenerarTextoAVozDirecto(CrearContexto(),
			CrearEntrada({ ConectoresDesactivados: ['kokoro-82m-in-deepinfra'] }));

		expect(resultado.Tipo).toBe('Respuesta');
		expect(resultado.ConectorEfectivo).toBe('kokoro-82m-in-together');
		expect(resultado.UsadoConectorRespaldo).toBe(true);
		expect(resultado.ConsultasFallidas).toBe(0);
		expect(resultado.Errores).toContainEqual(expect.objectContaining({
			Código: CódigoErrorIA.ProveedorNoDisponible,
			Fuente: 'kokoro-82m-in-deepinfra',
			Error: MensajeConectorTextoAVozDesactivado,
			DuraciónMilisegundos: 0,
		}));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(registro).not.toHaveBeenCalledWith(expect.stringContaining('ConectorPrincipalFallido'));

	});

	it.each([
		{ nombre: 'JSON inválido', respuesta: new Response('{', { status: 200 }) },
		{ nombre: 'audio ausente', respuesta: new Response(JSON.stringify({ request_id: 'sin-audio' }), { status: 200 }) },
		{ nombre: 'Base64 inválido', respuesta: new Response(JSON.stringify({ audio: '%' }), { status: 200 }) },
		{ nombre: 'audio MP3 inválido', respuesta: new Response(JSON.stringify({ audio: 'AQID' }), { status: 200 }) },
	])('salta a Together cuando DeepInfra devuelve $nombre', async ({ respuesta }) => {

		const fetchMock = vi.fn()
			.mockResolvedValueOnce(respuesta)
			.mockResolvedValueOnce(new Response(CrearAudioCbr(8000), { status: 200,
				headers: { 'content-type': 'audio/mpeg' } }));
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(console, 'log').mockImplementation(() => undefined);

		const resultado = await GenerarTextoAVozDirecto(CrearContexto(), CrearEntrada());

		expect(resultado.Tipo).toBe('Respuesta');
		expect(resultado.ConectorEfectivo).toBe('kokoro-82m-in-together');
		expect(resultado.UsadoConectorRespaldo).toBe(true);
		expect(resultado.ConsultasFallidas).toBe(1);
		expect(resultado.Errores[0]).toEqual(expect.objectContaining({
			Código: CódigoErrorIA.ProveedorNoDisponible,
			Fuente: 'kokoro-82m-in-deepinfra',
		}));
		expect(fetchMock).toHaveBeenCalledTimes(2);

	});

	it('prioriza la cancelación del cliente aunque coincida con el mensaje de timeout', async () => {

		const cancelación = new AbortController();
		const fetchMock = vi.fn(async () => {
			cancelación.abort();
			throw new Error('Tiempo de espera agotado consultando texto a voz.');
		});
		vi.stubGlobal('fetch', fetchMock);

		const resultado = await GenerarTextoAVozDirecto(CrearContexto(cancelación.signal), CrearEntrada());

		expect(resultado.Tipo).toBe('Error');
		expect(resultado.Errores).toHaveLength(1);
		expect(resultado.Errores[0]).toEqual(expect.objectContaining({
			Código: CódigoErrorIA.SolicitudCancelada,
			Fuente: 'kokoro-82m-in-deepinfra',
			Error: 'Solicitud cancelada por el usuario.',
		}));
		expect(fetchMock).toHaveBeenCalledTimes(1);

	});

});


function CrearEntrada(sobrescrituras: { ConectoresDesactivados?: readonly string[]; } = {}) {
	return {
		Texto: 'Prueba', InstruccionesVoz: '', Idioma: 'es', ModeloOConector: 'kokoro-82m-in-deepinfra',
		RespaldoModeloOConector: 'kokoro-82m-in-together', Voz: 'em_alex', VozRespaldo: 'em_alex',
		VelocidadReproducción: 1, SegundosMáximosPrincipal: 30, SegundosMáximosRespaldo: 30,
		...sobrescrituras,
	};
}


function CrearContexto(señal: AbortSignal = new AbortController().signal): Contexto {
	return {
		IdSolicitud: 'texto-a-voz-cortacircuitos',
		Solicitud: new Request('https://ejemplo.test/texto-a-voz', { signal: señal }),
		Entorno: { CLAVE_DEEPINFRA: 'deepinfra-prueba', CLAVE_TOGETHER: 'together-prueba' },
	} as unknown as Contexto;
}


function CrearAudioCbr(bytesAudio: number): Uint8Array<ArrayBuffer> { // Con ArrayBuffer y no con el ArrayBufferLike genérico, porque Response solo acepta arreglos sobre un ArrayBuffer normal.
	const audio = new Uint8Array(bytesAudio);
	audio.set([0xff, 0xf3, 0x84, 0xc4]); // MPEG-2 Layer III, 24 kHz, mono, 64 kbps.
	return audio;
}
