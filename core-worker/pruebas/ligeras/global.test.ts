import { describe, expect, it } from 'vitest';
import { DecodificarContenidoCorreo, ObtenerTipoContenidoDesdeExtensión } from '../../src/nucleo/global';


describe('DecodificarContenidoCorreo', () => {

	it('decodifica quoted-printable y compacta espacios', () => {

		const contenido = [
			'Content-Type: text/plain; charset=utf-8',
			'Content-Transfer-Encoding: quoted-printable',
			'',
			'=C2=A1Listo! Todo sali=C3=B3 bien con tus movimientos Bancolombia.',
			'Recibiste una=',
			' transferencia por $5,000.00.',
			'--separador',
		].join('\r\n');

		expect(DecodificarContenidoCorreo(contenido))
			.toBe('¡Listo! Todo salió bien con tus movimientos Bancolombia. Recibiste una transferencia por $5,000.00.');

	});


	it('usa solo la parte text/plain cuando el correo es multipart', () => {

		const contenido = [
			'Content-Type: multipart/alternative; boundary="separador"',
			'',
			'--separador',
			'Content-Type: text/plain; charset=utf-8',
			'Content-Transfer-Encoding: quoted-printable',
			'',
			'Texto bueno con fecha el 13/06/26 a las 07:21.',
			'--separador',
			'Content-Type: text/html; charset=utf-8',
			'',
			'<html><style>.ruido { color: red; }</style><body>Texto malo</body></html>',
			'--separador--',
		].join('\r\n');

		expect(DecodificarContenidoCorreo(contenido))
			.toBe('Texto bueno con fecha el 13/06/26 a las 07:21.');

	});


	it('mantiene porcentajes originales sin romper decodeURIComponent', () => {

		const contenido = [
			'Content-Type: text/plain; charset=utf-8',
			'Content-Transfer-Encoding: quoted-printable',
			'',
			'Sali=C3=B3 al 100% con enlace https://ejemplo.test/a%20b.', // La tilde en quoted-printable obliga a pasar por decodeURIComponent. Sin proteger el %, el 100% lo haría fallar y el respaldo devolvería el =C3=B3 sin decodificar.
			'--separador',
		].join('\r\n');

		expect(DecodificarContenidoCorreo(contenido))
			.toBe('Salió al 100% con enlace https://ejemplo.test/a%20b.');

	});


	it('devuelve texto normalizado si la decodificacion URI falla', () => {

		const contenido = [
			'Content-Type: text/plain; charset=utf-8',
			'',
			'Texto con byte invalido =E9 y linea=',
			' pegada.',
			'--separador',
		].join('\r\n');

		expect(DecodificarContenidoCorreo(contenido))
			.toBe('Texto con byte invalido =E9 y linea pegada.');

	});

});


describe('MimeTiposArchivo', () => {

	it('mapea extensiones comunes a su tipo de contenido', () => {

		expect(ObtenerTipoContenidoDesdeExtensión('.png')).toBe('image/png');
		expect(ObtenerTipoContenidoDesdeExtensión('png')).toBe('image/png');
		expect(ObtenerTipoContenidoDesdeExtensión('.jpg')).toBe('image/jpeg');
		expect(ObtenerTipoContenidoDesdeExtensión('jpg')).toBe('image/jpeg');
		expect(ObtenerTipoContenidoDesdeExtensión('.jpeg')).toBe('image/jpeg');
		expect(ObtenerTipoContenidoDesdeExtensión('.webp')).toBe('image/webp');

	});

});
