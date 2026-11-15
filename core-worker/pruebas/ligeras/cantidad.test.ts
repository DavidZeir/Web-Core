import { describe, expect, it } from 'vitest';
import { Cantidad, ExigirCantidadMicrosCorrectos } from '../../src/nucleo/cantidad';
import { Dinero } from '../../src/nucleo/dinero';
import { CrearLímites } from '../../src/nucleo/decimal';


const SinAlerta = null;


describe('Cantidad — construcción', () => {

	it('construye desde valor normal y escala a micros', () => {
		expect(Cantidad.DesdeValor(1, SinAlerta).AMicros()).toBe(1_000_000);
		expect(Cantidad.DesdeValor(0.000001, SinAlerta).AMicros()).toBe(1);
		expect(Cantidad.DesdeValor(-1.25, SinAlerta).AMicros()).toBe(-1_250_000);
		expect(Cantidad.DesdeValor(120_000, SinAlerta).AMicros()).toBe(120_000_000_000);
	});

	it('construye desde micros crudos', () => {
		expect(Cantidad.DesdeMicros(1).AMicros()).toBe(1);
		expect(Cantidad.DesdeMicros(0).AMicros()).toBe(0);
		expect(Cantidad.DesdeMicros(-5_000_000).AMicros()).toBe(-5_000_000);
	});

	it('rechaza micros no enteros', () => {
		expect(() => Cantidad.DesdeMicros(1.5)).toThrow();
		expect(() => Cantidad.DesdeMicros(Number.NaN)).toThrow();
		expect(() => Cantidad.DesdeMicros(Number.POSITIVE_INFINITY)).toThrow();
	});

	it('rechaza micros fuera del rango seguro de JavaScript', () => {
		expect(() => Cantidad.DesdeMicros(Number.MAX_SAFE_INTEGER + 1)).toThrow();
		expect(() => Cantidad.DesdeMicros(Number.MIN_SAFE_INTEGER - 1)).toThrow();
	});

});


describe('Cantidad — aritmética', () => {

	it('suma dos valores exactos', () => {
		const a = Cantidad.DesdeValor(10, SinAlerta);
		const b = Cantidad.DesdeValor(5, SinAlerta);
		expect(a.Sumar(b).AMicros()).toBe(15_000_000);
	});

	it('resta dos valores', () => {
		const a = Cantidad.DesdeValor(10, SinAlerta);
		const b = Cantidad.DesdeValor(3, SinAlerta);
		expect(a.Restar(b).AMicros()).toBe(7_000_000);
	});

	it('multiplica por un factor decimal', () => {
		const a = Cantidad.DesdeValor(100, SinAlerta);
		expect(a.Multiplicar(1.5).AMicros()).toBe(150_000_000);
		expect(a.Multiplicar(0.25).AMicros()).toBe(25_000_000);
	});

	it('divide entre un divisor decimal', () => {
		const a = Cantidad.DesdeValor(100, SinAlerta);
		expect(a.Dividir(4).AMicros()).toBe(25_000_000);
		expect(a.Dividir(3).AMicros()).toBe(33_333_333);
	});

	it('divide por otro decimal en micros sin convertir a number normal', () => {
		expect(Cantidad.DesdeMicros(25_000_000).DividirDecimal(Cantidad.DesdeMicros(1_500_000)).AMicros()).toBe(16_666_667);
		expect(Cantidad.DesdeMicros(1).DividirDecimal(Cantidad.DesdeMicros(500_000)).AMicros()).toBe(2);
	});

	it('calcula porcentajes', () => {
		const a = Cantidad.DesdeValor(200, SinAlerta);
		expect(a.Porcentaje(15).AMicros()).toBe(30_000_000);
		expect(a.Porcentaje(100).AMicros()).toBe(200_000_000);
		expect(a.Porcentaje(0.5).AMicros()).toBe(1_000_000);
	});

	it('niega y devuelve valor absoluto', () => {
		const a = Cantidad.DesdeValor(-50, SinAlerta);
		expect(a.Negar().AMicros()).toBe(50_000_000);
		expect(a.ValorAbsoluto().AMicros()).toBe(50_000_000);
	});

	it('divide y multiplica con otro decimal desde el mismo nucleo de escala', () => {
		expect(Dinero.DesdeMicros(25_000_000).DividirDecimal(Cantidad.DesdeMicros(1_500_000)).AMicros()).toBe(16_666_667);
		expect(Cantidad.DesdeMicros(25_000_000).MultiplicarDecimal(Cantidad.DesdeMicros(1_500_000)).AMicros()).toBe(37_500_000);
	});

});


describe('Cantidad — comparación', () => {

	it('compara igualdad', () => {
		const a = Cantidad.DesdeValor(10, SinAlerta);
		const b = Cantidad.DesdeValor(10, SinAlerta);
		const c = Cantidad.DesdeValor(20, SinAlerta);
		expect(a.EsIgual(b)).toBe(true);
		expect(a.EsIgual(c)).toBe(false);
	});

	it('compara mayor y menor', () => {
		const a = Cantidad.DesdeValor(10, SinAlerta);
		const b = Cantidad.DesdeValor(20, SinAlerta);
		expect(a.EsMenor(b)).toBe(true);
		expect(b.EsMayor(a)).toBe(true);
		expect(a.EsMayorOIgual(b)).toBe(false);
		expect(b.EsMenorOIgual(a)).toBe(false);
	});

});


describe('Cantidad — validaciones exportadas', () => {

	it('ExigirCantidadMicrosCorrectos valida y devuelve micros', () => {
		expect(ExigirCantidadMicrosCorrectos(1_000_000)).toBe(1_000_000);
		expect(ExigirCantidadMicrosCorrectos(0)).toBe(0);
		expect(() => ExigirCantidadMicrosCorrectos(1.5)).toThrow();
		expect(() => ExigirCantidadMicrosCorrectos(Number.NaN)).toThrow();
	});

	it('CrearLímites rechaza configuración inválida', () => {
		expect(() => CrearLímites(-1, 1)).toThrow();
		expect(() => CrearLímites(100, 200)).toThrow();
	});

});


describe('Cantidad — formato de micros', () => {

	it('ATexto maneja valores negativos y grandes', () => {
		const a = Cantidad.DesdeValor(-1000, SinAlerta);
		expect(a.ATexto()).toContain('-');
		const b = Cantidad.DesdeValor(1_000_000, SinAlerta);
		expect(b.ATexto().length).toBeGreaterThan(0);
	});

});
