import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contexto } from '../../src/nucleo/global';


const enviarAlertaErrorCriticoMock = vi.hoisted(() => vi.fn());


vi.mock('../../src/nucleo/alertas', () => ({
	EnviarAlertaErrorCrítico: enviarAlertaErrorCriticoMock,
}));


const { GenerarTextoAVozDirecto } = await import('../../src/nucleo/texto-a-voz');


beforeEach(() => {
	enviarAlertaErrorCriticoMock.mockReset();
});


describe('duración MP3 CBR, Xing e Info', () => {

	it('calcula la duración CBR usando bytes y bitrate sin alerta crítica', async () => {
		const audio = CrearAudioCbr(8000);
		const contexto = CrearContexto(audio);

		const resultado = await GenerarTextoAVozDirecto(contexto, CrearEntrada());

		expect(resultado.Tipo).toBe('Respuesta');
		expect(resultado.DuraciónAudioSegundos).toBeCloseTo(1, 10);
		expect(enviarAlertaErrorCriticoMock).not.toHaveBeenCalled();
	});


	it('calcula la duración usando frames Xing sin alerta crítica', async () => {
		const audio = CrearAudioXing(1, 1617);
		const contexto = CrearContexto(audio);

		const resultado = await GenerarTextoAVozDirecto(contexto, CrearEntrada());

		expect(resultado.Tipo).toBe('Respuesta');
		expect(resultado.DuraciónAudioSegundos).toBeCloseTo(1617 * 576 / 24000, 10);
		expect(enviarAlertaErrorCriticoMock).not.toHaveBeenCalled();
	});


	it('Error arreglado: calcula la duración usando frames Info de Together sin alerta crítica', async () => {
		const audio = CrearAudioInfoTogether();
		const contexto = CrearContexto(audio);

		const resultado = await GenerarTextoAVozDirecto(contexto, CrearEntrada());

		expect(resultado.Tipo).toBe('Respuesta');
		expect(resultado.DuraciónAudioSegundos).toBeCloseTo(1513 * 576 / 24000, 10);
		expect(enviarAlertaErrorCriticoMock).not.toHaveBeenCalled();
	});


	it('devuelve error explícito y alerta cuando los frames Xing no caben en el audio', async () => {
		const contexto = CrearContexto(CrearAudioXing(1, 1617, 64));

		const resultado = await GenerarTextoAVozDirecto(contexto, CrearEntrada());

		expect(resultado.Tipo).toBe('Error');
		expect(resultado.Texto).toContain('no se puede calcular su duración');
		expect(resultado.Errores[0]?.Error).toContain('no se puede calcular su duración');
		expect(enviarAlertaErrorCriticoMock).toHaveBeenCalledTimes(1);
		expect(enviarAlertaErrorCriticoMock).toHaveBeenCalledWith(
			expect.anything(), 'TextoAVozMP3VBR', expect.any(String), expect.stringContaining('Xing'));
	});

});


function CrearEntrada() {
	return {
		Texto: 'Prueba', InstruccionesVoz: '', Idioma: 'es', ModeloOConector: 'melotts-in-cloudflare',
		RespaldoModeloOConector: null, Voz: '', VozRespaldo: null, VelocidadReproducción: 1,
		SegundosMáximosPrincipal: 30, SegundosMáximosRespaldo: 30,
	};
}


function CrearContexto(audio: Uint8Array): Contexto {
	return {
		Solicitud: new Request('https://ejemplo.test/texto-a-voz'),
		Entorno: { IA: { run: vi.fn(async () => audio) } },
	} as unknown as Contexto;
}


function CrearAudioCbr(bytesAudio: number): Uint8Array {
	const audio = new Uint8Array(bytesAudio);
	audio.set([0xff, 0xf3, 0x84, 0xc4]); // MPEG-2 Layer III, 24 kHz, mono, 64 kbps.
	return audio;
}


function CrearAudioXing(flags: number, frames: number, bytesAudio: number = 192 + frames * 24): Uint8Array {
	const audio = CrearAudioCbr(bytesAudio);
	audio.set([0x58, 0x69, 0x6e, 0x67], 13); // Xing después de los 9 bytes de información mono MPEG-2.
	EscribirEntero32Grande(audio, 17, flags);
	EscribirEntero32Grande(audio, 21, frames);
	return audio;
}


function CrearAudioInfoTogether(): Uint8Array {
	const inicioMpeg = 45;
	const bytesAudioMpeg = 145440;
	const audio = new Uint8Array(inicioMpeg + bytesAudioMpeg);
	audio.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23]); // ID3 de 45 bytes.
	audio.set([0xff, 0xf3, 0x84, 0xc0], inicioMpeg); // MPEG-2 Layer III, 24 kHz, mono, 64 kbps.
	audio.set([0x49, 0x6e, 0x66, 0x6f], inicioMpeg + 13);
	EscribirEntero32Grande(audio, inicioMpeg + 17, 15);
	EscribirEntero32Grande(audio, inicioMpeg + 21, 1513);
	EscribirEntero32Grande(audio, inicioMpeg + 25, bytesAudioMpeg);
	return audio;
}


function EscribirEntero32Grande(destino: Uint8Array, posición: number, valor: number): void {
	destino[posición] = Math.floor(valor / 0x1000000) & 0xff;
	destino[posición + 1] = Math.floor(valor / 0x10000) & 0xff;
	destino[posición + 2] = Math.floor(valor / 0x100) & 0xff;
	destino[posición + 3] = valor & 0xff;
}
