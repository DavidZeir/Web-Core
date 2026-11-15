import { AlertaBajoValorDinero, FormatoDinero, MáximoValorDinero, MínimoValorDinero } from '../configuracion';
import { type Contexto } from './global';
import { Decimal, ValidarMicrosEnRangoSeguro, AdvertirValorBajo, CrearLímites, InferirSeparadoresDeFormato,
	FormatearMicrosConFormato } from './decimal';


const LímitesDineroValidados = CrearLímites(MáximoValorDinero, MínimoValorDinero);

const { SeparadorMiles: SeparadorMilesDinero, SeparadorDecimales: SeparadorDecimalesDinero } =
	InferirSeparadoresDeFormato(FormatoDinero);


export class Dinero extends Decimal {


	private constructor(micros: number) {
		super(micros);
	}


	override ATexto(formato: string = FormatoDinero): string {
		return FormatearMicrosConFormato(this.AMicros(), formato, SeparadorDecimalesDinero, SeparadorMilesDinero, true);
	}


	static override DesdeMicros(cantidadMicros: number): Dinero {

		const decimal = Decimal.DesdeMicros(cantidadMicros);
		const micros = decimal.AMicros();
		ValidarMicrosEnRangoSeguro(BigInt(micros), 'Dinero.Micros', LímitesDineroValidados.MáximoMicros);
		return new Dinero(micros);

	}


	static override DesdeValor(valor: number, contexto: Contexto | null = null, alertarValorBajo = true): Dinero {

		const decimal = Decimal.DesdeValor(valor, contexto, alertarValorBajo);
		const micros = decimal.AMicros();
		ValidarMicrosEnRangoSeguro(BigInt(micros), 'Dinero.Valor', LímitesDineroValidados.MáximoMicros);
		AdvertirValorBajo(micros, 'valor', LímitesDineroValidados.MínimoMicros, 'MínimoValorDinero', 'Dinero.', contexto,
			alertarValorBajo && AlertaBajoValorDinero); // Solo se verifica aquí porque es el único punto de entrada de valores de usuarios. Los micros crudos no se advierten aunque sean bajos, porque pueden ser parte de cálculos internos o valores persistidos que ya sacaron alerta cuando fueron persistidos.
		return new Dinero(micros);

	}


	override Sumar(otro: Dinero): Dinero { // Los límites de Dinero se aplican sobre todo en la entrada externa. Las operaciones internas usan la validez base del Decimal y no estan pensadas para revalidar el tope de negocio en cada paso.
		const resultado = super.Sumar(otro);
		return new Dinero(resultado.AMicros());
	}


	override Restar(otro: Dinero): Dinero {
		const resultado = super.Restar(otro);
		return new Dinero(resultado.AMicros());
	}


	override Negar(): Dinero {
		const resultado = super.Negar();
		return new Dinero(resultado.AMicros());
	}


	override ValorAbsoluto(): Dinero {
		const resultado = super.ValorAbsoluto();
		return new Dinero(resultado.AMicros());
	}


	override Multiplicar(cantidad: number): Dinero {
		const resultado = super.Multiplicar(cantidad);
		return new Dinero(resultado.AMicros());
	}


	override MultiplicarDecimal(factor: Decimal): Dinero {
		const resultado = super.MultiplicarDecimal(factor);
		return new Dinero(resultado.AMicros());
	}


	override Dividir(cantidad: number): Dinero {
		const resultado = super.Dividir(cantidad);
		return new Dinero(resultado.AMicros());
	}


	override DividirDecimal(divisor: Decimal): Dinero {
		const resultado = super.DividirDecimal(divisor);
		return new Dinero(resultado.AMicros());
	}


	override Porcentaje(porcentaje: number): Dinero {
		const resultado = super.Porcentaje(porcentaje);
		return new Dinero(resultado.AMicros());
	}


}


export function ExigirDineroMicrosCorrectos(valorMicros: number): number {
	return Dinero.DesdeMicros(valorMicros).AMicros(); // No transforma el valor, lo valida bajo las reglas centrales de Dinero antes de usarlo: debe ser number, entero, finito, seguro para JavaScript y estar dentro del rango de negocio permitido.
}
