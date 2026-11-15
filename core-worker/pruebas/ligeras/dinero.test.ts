import { describe, expect, it, vi } from 'vitest';
import { Dinero } from '../../src/nucleo/dinero';
import { Cantidad } from '../../src/nucleo/cantidad';
import { ErrorDecimal } from '../../src/nucleo/decimal';


const ContextoNulo = null;
const SinAlerta = ContextoNulo;


describe('Dinero', () => {

	it('construye desde valores de dinero normal y escala a micros', () => {
		expect(Dinero.DesdeValor(1, SinAlerta).AMicros()).toBe(1_000_000);
		expect(Dinero.DesdeValor(0.000001, SinAlerta).AMicros()).toBe(1);
		expect(Dinero.DesdeValor(0.0000001, SinAlerta).AMicros()).toBe(0);
		expect(Dinero.DesdeValor(-1.25, SinAlerta).AMicros()).toBe(-1_250_000);
		expect(Dinero.DesdeValor(120_000, SinAlerta).AMicros()).toBe(120_000_000_000);
	});

	it('valida micros crudos al construir desde valores persistidos', () => {
		expect(() => Dinero.DesdeMicros(1.5)).toThrow(ErrorDecimal);
		expect(() => Dinero.DesdeMicros(Number.NaN)).toThrow(ErrorDecimal);
		expect(() => Dinero.DesdeMicros(Number.POSITIVE_INFINITY)).toThrow(ErrorDecimal);
		expect(() => Dinero.DesdeMicros(Number.MAX_SAFE_INTEGER)).toThrow(ErrorDecimal);
		expect(Dinero.DesdeMicros(1).AMicros()).toBe(1);
		expect(Dinero.DesdeMicros(-1).AMicros()).toBe(-1);
	});

	it('rechaza valores de dinero normal fuera del limite de dominio o técnico', () => {
		expect(() => Dinero.DesdeValor(Number.MAX_SAFE_INTEGER, SinAlerta)).toThrow(ErrorDecimal);
	});

	it('describe el limite de dominio como valor absoluto para micros positivos y negativos', () => {

		const mensaje = /supera el valor absoluto permitido de 1000000000000000/;

		expect(() => Dinero.DesdeMicros(1_000_000_000_000_001)).toThrow(mensaje);
		expect(() => Dinero.DesdeMicros(-1_000_000_000_000_001)).toThrow(mensaje);

	});

	it('no expone Micros ni Texto como propiedades públicas', () => {
		const dinero = Dinero.DesdeMicros(1);
		const registro = dinero as unknown as Record<string, unknown>;

		expect('Micros' in dinero).toBe(false);
		expect('Texto' in dinero).toBe(false);
		expect(registro.Micros).toBeUndefined();
		expect(registro.Texto).toBeUndefined();
		expect(dinero.AMicros()).toBe(1);
	});

	it('mantiene las instancias inmutables y cada operación devuelve otra instancia', () => {
		const a = Dinero.DesdeValor(10, SinAlerta);
		const b = a.Sumar(Dinero.DesdeValor(5, SinAlerta));

		expect(Object.isFrozen(a)).toBe(true);
		expect(a).not.toBe(b);
		expect(a.AMicros()).toBe(10_000_000);
		expect(b.AMicros()).toBe(15_000_000);
	});

	it('advierte por valores sospechosamente bajos al convertir desde valor de dinero normal', () => {
		const advertir = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		try {
			Dinero.DesdeValor(0.09, SinAlerta);
			expect(advertir).toHaveBeenCalledTimes(1);

			advertir.mockClear();
			Dinero.DesdeMicros(90_000);
			expect(advertir).not.toHaveBeenCalled();

			advertir.mockClear();
			Dinero.DesdeValor(0.09, SinAlerta);
			expect(advertir).toHaveBeenCalledTimes(1);
		} finally {
			advertir.mockRestore();
		}
	});

	it('suma, resta y multiplica usando solo los limites internos seguros de Decimal', () => {
		const maximo = Dinero.DesdeValor(1_000_000_000, SinAlerta);
		const unMicro = Dinero.DesdeMicros(1);

		expect(maximo.Sumar(unMicro).AMicros()).toBe(1_000_000_000_000_001);
		expect(maximo.Multiplicar(2).AMicros()).toBe(2_000_000_000_000_000);
		expect(maximo.Negar().Restar(unMicro).AMicros()).toBe(-1_000_000_000_000_001);
	});

	it('calcula porcentajes con micros exactos', () => {
		expect(Dinero.DesdeMicros(1_000_000).Porcentaje(19.0002).AMicros()).toBe(190_002);
	});

	it('redondea al micro mas cercano al dividir y multiplicar cuando el resultado no cabe exacto en micros', () => {
		expect(Dinero.DesdeMicros(7).Dividir(5).AMicros()).toBe(1);
		expect(Dinero.DesdeMicros(8).Dividir(5).AMicros()).toBe(2);
		expect(Dinero.DesdeMicros(7).Multiplicar(0.2).AMicros()).toBe(1);
		expect(Dinero.DesdeMicros(8).Multiplicar(0.2).AMicros()).toBe(2);
	});

	it('multiplica por otro decimal sin sacar los micros a number normal', () => {
		expect(Dinero.DesdeMicros(25_000_000).MultiplicarDecimal(Cantidad.DesdeMicros(1_500_000)).AMicros()).toBe(37_500_000);
		expect(Dinero.DesdeMicros(1).MultiplicarDecimal(Cantidad.DesdeMicros(500_000)).AMicros()).toBe(1);
	});

	it('divide por otro decimal sin sacar los micros a number normal', () => {
		expect(Dinero.DesdeMicros(25_000_000).DividirDecimal(Cantidad.DesdeMicros(1_500_000)).AMicros()).toBe(16_666_667);
		expect(Dinero.DesdeMicros(1).DividirDecimal(Cantidad.DesdeMicros(500_000)).AMicros()).toBe(2);
	});

	it('redondea divisiones con signo de forma simetrica al micro mas cercano', () => {
		expect(Dinero.DesdeMicros(-7).Dividir(5).AMicros()).toBe(-1);
		expect(Dinero.DesdeMicros(-8).Dividir(5).AMicros()).toBe(-2);
		expect(Dinero.DesdeMicros(7).Dividir(-5).AMicros()).toBe(-1);
		expect(Dinero.DesdeMicros(8).Dividir(-5).AMicros()).toBe(-2);
	});

	it('redondea porcentajes fraccionarios al micro mas cercano', () => {
		expect(Dinero.DesdeMicros(7).Porcentaje(20).AMicros()).toBe(1);
		expect(Dinero.DesdeMicros(8).Porcentaje(20).AMicros()).toBe(2);
		expect(Dinero.DesdeMicros(2).Porcentaje(20).AMicros()).toBe(0);
		expect(Dinero.DesdeMicros(-8).Porcentaje(20).AMicros()).toBe(-2);
	});

	it('niega y obtiene valor absoluto sin mutar el valor original', () => {
		const negativo = Dinero.DesdeValor(-5, SinAlerta);
		const negado = negativo.Negar();
		const absoluto = negativo.ValorAbsoluto();

		expect(negativo.AMicros()).toBe(-5_000_000);
		expect(negado.AMicros()).toBe(5_000_000);
		expect(absoluto.AMicros()).toBe(5_000_000);
	});

	it('expone comparadores semanticos sin obligar a leer micros', () => {
		const uno = Dinero.DesdeValor(1, SinAlerta);
		const otroUno = Dinero.DesdeMicros(1_000_000);
		const dos = Dinero.DesdeValor(2, SinAlerta);
		const negativo = Dinero.DesdeValor(-1, SinAlerta);
		const cero = Dinero.DesdeValor(0, SinAlerta);

		expect(uno.EsIgual(otroUno)).toBe(true);
		expect(dos.EsMayor(uno)).toBe(true);
		expect(dos.EsMayorOIgual(uno)).toBe(true);
		expect(uno.EsMayorOIgual(otroUno)).toBe(true);
		expect(uno.EsMenor(dos)).toBe(true);
		expect(uno.EsMenorOIgual(dos)).toBe(true);
		expect(uno.EsMenorOIgual(otroUno)).toBe(true);
		expect(cero.EsCero()).toBe(true);
		expect(uno.EsPositivo()).toBe(true);
		expect(negativo.EsNegativo()).toBe(true);
		expect(cero.EsPositivo()).toBe(false);
		expect(cero.EsNegativo()).toBe(false);
		expect(uno.Comparar(dos)).toBe(-1);
		expect(dos.Comparar(uno)).toBe(1);
		expect(uno.Comparar(otroUno)).toBe(0);
	});

	it('formatea y serializa solo bajo demanda desde micros', () => {
		const dinero = Dinero.DesdeMicros(1_234_567);

		expect(dinero.ATexto()).toBe('1,23 $');
		expect(dinero.ATextoJson()).toBe('1.234567');
		expect(Dinero.DesdeValor(120_000, SinAlerta).ATexto()).toBe('120\u202f000 $');
	});

	it('serializa automáticamente a micros con JSON.stringify', () => {
		const dinero = Dinero.DesdeMicros(123);

		expect(JSON.stringify(dinero)).toBe('123');
		expect(JSON.stringify({ PrecioMicros: dinero })).toBe('{"PrecioMicros":123}');
	});

	it('respeta una mascara con decimales obligatorios exactos', async () => {
		const configuracionReal = await vi.importActual<typeof import('../../src/configuracion')>('../../src/configuracion');
		vi.resetModules();
		vi.doMock('../../src/configuracion', () => ({
			...configuracionReal,
			FormatoDinero: '### ### ##0,000',
		}));

		try {
			const móduloDinero = await import('../../src/nucleo/dinero');
			expect(móduloDinero.Dinero.DesdeMicros(1_234_567).ATexto()).toBe('1,235');
			expect(móduloDinero.Dinero.DesdeMicros(1_200_000).ATexto()).toBe('1,200');
		} finally {
			vi.doUnmock('../../src/configuracion');
			vi.resetModules();
		}
	});

	it('agrupa miles de a tres aunque la mascara ponga separadores en posiciones no estandar', async () => {
		const configuracionReal = await vi.importActual<typeof import('../../src/configuracion')>('../../src/configuracion');
		vi.resetModules();
		vi.doMock('../../src/configuracion', () => ({
			...configuracionReal,
			FormatoDinero: '## ## ##.00',
		}));

		try {
			const moduloDinero = await import('../../src/nucleo/dinero');
			expect(moduloDinero.Dinero.DesdeValor(123_456, SinAlerta).ATexto()).toBe('123 456.00');
			expect(moduloDinero.Dinero.DesdeValor(12_345_678, SinAlerta).ATexto()).toBe('12 345 678.00');
		} finally {
			vi.doUnmock('../../src/configuracion');
			vi.resetModules();
		}
	});

	it('trata # como decimal opcional real', async () => {
		const configuracionReal = await vi.importActual<typeof import('../../src/configuracion')>('../../src/configuracion');
		vi.resetModules();
		vi.doMock('../../src/configuracion', () => ({
			...configuracionReal,
			FormatoDinero: '### ### ##0,0### $COP',
		}));

		try {
			const moduloDinero = await import('../../src/nucleo/dinero');
			expect(moduloDinero.Dinero.DesdeMicros(1_200_000).ATexto()).toBe('1,2 $COP');
			expect(moduloDinero.Dinero.DesdeMicros(1_234_500).ATexto()).toBe('1,2345 $COP');
			expect(moduloDinero.Dinero.DesdeMicros(1_000_000).ATexto()).toBe('1,0 $COP');
		} finally {
			vi.doUnmock('../../src/configuracion');
			vi.resetModules();
		}
	});

	it('respeta ceros obligatorios a la izquierda en una máscara sin decimales ni separadores', async () => {
		const configuracionReal = await vi.importActual<typeof import('../../src/configuracion')>('../../src/configuracion');
		vi.resetModules();
		vi.doMock('../../src/configuracion', () => ({
			...configuracionReal,
			FormatoDinero: '000000',
		}));

		try {
			const moduloDinero = await import('../../src/nucleo/dinero');
			expect(moduloDinero.Dinero.DesdeValor(12.05, SinAlerta).ATexto()).toBe('000012');
			expect(moduloDinero.Dinero.DesdeValor(1_234.9, SinAlerta).ATexto()).toBe('001235');
			expect(moduloDinero.Dinero.DesdeValor(123_456, SinAlerta).ATexto()).toBe('123456');
		} finally {
			vi.doUnmock('../../src/configuracion');
			vi.resetModules();
		}
	});

	it('respeta prefijo, sufijo, ceros obligatorios y redondeo sin decimales', async () => {
		const configuracionReal = await vi.importActual<typeof import('../../src/configuracion')>('../../src/configuracion');
		vi.resetModules();
		vi.doMock('../../src/configuracion', () => ({
			...configuracionReal,
			FormatoDinero: 'USD 0000 COP',
		}));

		try {
			const moduloDinero = await import('../../src/nucleo/dinero');
			expect(moduloDinero.Dinero.DesdeMicros(1_499_999).ATexto()).toBe('USD 0001 COP');
			expect(moduloDinero.Dinero.DesdeMicros(1_500_000).ATexto()).toBe('USD 0002 COP');
			expect(moduloDinero.Dinero.DesdeMicros(-12_500_000).ATexto()).toBe('USD -0013 COP');
		} finally {
			vi.doUnmock('../../src/configuracion');
			vi.resetModules();
		}
	});

	it('interpreta un único separador como separador decimal sin miles', async () => {
		const configuracionReal = await vi.importActual<typeof import('../../src/configuracion')>('../../src/configuracion');
		vi.resetModules();
		vi.doMock('../../src/configuracion', () => ({
			...configuracionReal,
			FormatoDinero: '0000,00',
		}));

		try {
			const moduloDinero = await import('../../src/nucleo/dinero');
			expect(moduloDinero.Dinero.DesdeValor(12.34, SinAlerta).ATexto()).toBe('0012,34');
			expect(moduloDinero.Dinero.DesdeValor(1234.56, SinAlerta).ATexto()).toBe('1234,56');
		} finally {
			vi.doUnmock('../../src/configuracion');
			vi.resetModules();
		}
	});

	it('lanza error si la máscara usa tres separadores distintos entre marcadores numericos', async () => {
		const configuracionReal = await vi.importActual<typeof import('../../src/configuracion')>('../../src/configuracion');
		vi.resetModules();
		vi.doMock('../../src/configuracion', () => ({
			...configuracionReal,
			FormatoDinero: '# #,##.00',
		}));

		try {
			await expect(import('../../src/nucleo/dinero')).rejects.toMatchObject({ name: 'ErrorDecimal' });
		} finally {
			vi.doUnmock('../../src/configuracion');
			vi.resetModules();
		}
	});

	it('no advierte cuando el valor es exactamente cero aunque la alerta esté activa', () => {

		const advertir = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		try {
			Dinero.DesdeValor(0, null, true);
			expect(advertir).not.toHaveBeenCalled();
		} finally {
			advertir.mockRestore();
		}

	});


	it('lanza error al dividir entre cero', () => {
		expect(() => Dinero.DesdeMicros(1_000_000).Dividir(0)).toThrow(ErrorDecimal);
	});


	it('lanza error cuando las operaciones binarias reciben algo que no es Dinero', () => {

		const dinero = Dinero.DesdeMicros(1_000_000);
		const noEsDinero = { AMicros: () => 1_000_000 } as unknown as Dinero;

		expect(() => dinero.Sumar(noEsDinero)).toThrow(ErrorDecimal);
		expect(() => dinero.Restar(noEsDinero)).toThrow(ErrorDecimal);
		expect(() => dinero.Comparar(noEsDinero)).toThrow(ErrorDecimal);
		expect(() => dinero.EsIgual(noEsDinero)).toThrow(ErrorDecimal);

	});


	it('rechaza factores no finitos en Multiplicar, Dividir y Porcentaje', () => {

		const dinero = Dinero.DesdeMicros(1_000_000);

		expect(() => dinero.Multiplicar(Number.NaN)).toThrow(ErrorDecimal);
		expect(() => dinero.Multiplicar(Number.POSITIVE_INFINITY)).toThrow(ErrorDecimal);
		expect(() => dinero.Dividir(Number.NaN)).toThrow(ErrorDecimal);
		expect(() => dinero.Dividir(Number.NEGATIVE_INFINITY)).toThrow(ErrorDecimal);
		expect(() => dinero.Porcentaje(Number.NaN)).toThrow(ErrorDecimal);

	});


	it('rechaza factores cuyo valor escalado supera el rango seguro de JavaScript', () => {

		const dinero = Dinero.DesdeMicros(1);
		expect(() => dinero.Multiplicar(Number.MAX_SAFE_INTEGER)).toThrow(ErrorDecimal);

	});


	it('lanza error si la máscara no contiene marcadores númericos 0 o #', async () => {
		const configuracionReal = await vi.importActual<typeof import('../../src/configuracion')>('../../src/configuracion');
		vi.resetModules();
		vi.doMock('../../src/configuracion', () => ({
			...configuracionReal,
			FormatoDinero: 'USD',
		}));

		try {
			await expect(import('../../src/nucleo/dinero')).rejects.toMatchObject({ name: 'ErrorDecimal' });
		} finally {
			vi.doUnmock('../../src/configuracion');
			vi.resetModules();
		}
	});


	it('formatea el cero respetando el cero obligatorio mínimo en la parte entera', () => {
		expect(Dinero.DesdeMicros(0).ATexto()).toBe('0 $');
	});


	it('serializa a JSON valores negativos manteniendo el signo en el texto decimal', () => {
		expect(Dinero.DesdeMicros(-1_234_567).ATextoJson()).toBe('-1.234567');
	});


	it('no advierte cuando el valor coincide exactamente con MínimoValorDinero', () => {

		const advertir = vi.spyOn(console, 'log').mockImplementation(() => undefined);
		try {
			Dinero.DesdeValor(0.1, null, true);
			expect(advertir).not.toHaveBeenCalled();
		} finally {
			advertir.mockRestore();
		}

	});


	it('mantiene el cero al negar o tomar valor absoluto sin introducir signo negativo', () => {

		const cero = Dinero.DesdeMicros(0);

		expect(cero.Negar().AMicros()).toBe(0);
		expect(cero.ValorAbsoluto().AMicros()).toBe(0);

	});


	it('lanza error ante coerciones accidentales a primitivo en aritmética, comparación y concatenación', () => {

		const a = Dinero.DesdeMicros(1);
		const b = Dinero.DesdeMicros(2);
		const aCualquiera = a as unknown as number;
		const bCualquiera = b as unknown as number;

		expect(() => aCualquiera + bCualquiera).toThrow(ErrorDecimal);
		expect(() => aCualquiera > bCualquiera).toThrow(ErrorDecimal);
		expect(() => aCualquiera < bCualquiera).toThrow(ErrorDecimal);
		expect(() => `${a}`).toThrow(ErrorDecimal);
		expect(() => Number(a)).toThrow(ErrorDecimal);
		expect(() => String(a)).toThrow(ErrorDecimal);

	});

});
