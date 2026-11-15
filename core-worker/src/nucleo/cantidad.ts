import { AlertaBajoValorCantidad, FormatoCantidad, MáximoValorCantidad, MínimoValorCantidad } from '../configuracion';
import { type Contexto } from './global';
import { Decimal, ValidarMicrosEnRangoSeguro, AdvertirValorBajo, CrearLímites, InferirSeparadoresDeFormato,
	FormatearMicrosConFormato } from './decimal';


const LímitesCantidadValidados = CrearLímites(MáximoValorCantidad, MínimoValorCantidad);

const { SeparadorMiles: SeparadorMilesCantidad, SeparadorDecimales: SeparadorDecimalesCantidad } =
	InferirSeparadoresDeFormato(FormatoCantidad);


export class Cantidad extends Decimal {


	private constructor(micros: number) {
		super(micros);
	}


	override ATexto(formato: string = FormatoCantidad): string {
		return FormatearMicrosConFormato(this.AMicros(), formato, SeparadorDecimalesCantidad, SeparadorMilesCantidad, true);
	}


	static override DesdeMicros(cantidadMicros: number): Cantidad {

		const decimal = Decimal.DesdeMicros(cantidadMicros);
		const micros = decimal.AMicros();
		ValidarMicrosEnRangoSeguro(BigInt(micros), 'Cantidad.Micros', LímitesCantidadValidados.MáximoMicros);
		return new Cantidad(micros);

	}


	static override DesdeValor(valor: number, contexto: Contexto | null = null, alertarValorBajo = true): Cantidad {

		const decimal = Decimal.DesdeValor(valor, contexto, alertarValorBajo);
		const micros = decimal.AMicros();
		ValidarMicrosEnRangoSeguro(BigInt(micros), 'Cantidad.Valor', LímitesCantidadValidados.MáximoMicros);
		AdvertirValorBajo(micros, 'valor', LímitesCantidadValidados.MínimoMicros, 'MínimoValorCantidad', 'Cantidad.', contexto,
			alertarValorBajo && AlertaBajoValorCantidad); // Solo se verifica aquí porque es el único punto de entrada de valores de usuarios. Los micros crudos no se advierten aunque sean bajos, porque pueden ser parte de cálculos internos o valores persistidos que ya sacaron alerta cuando fueron persistidos.
		return new Cantidad(micros);

	}


	override Sumar(otro: Cantidad): Cantidad { // Los límites de Cantidad se aplican sobre todo en la entrada externa. Las operaciones internas usan la validez base del Decimal y no estan pensadas para revalidar el tope de negocio en cada paso.
		const resultado = super.Sumar(otro);
		return new Cantidad(resultado.AMicros());
	}


	override Restar(otro: Cantidad): Cantidad {
		const resultado = super.Restar(otro);
		return new Cantidad(resultado.AMicros());
	}


	override Negar(): Cantidad {
		const resultado = super.Negar();
		return new Cantidad(resultado.AMicros());
	}


	override ValorAbsoluto(): Cantidad {
		const resultado = super.ValorAbsoluto();
		return new Cantidad(resultado.AMicros());
	}


	override Multiplicar(cantidad: number): Cantidad {
		const resultado = super.Multiplicar(cantidad);
		return new Cantidad(resultado.AMicros());
	}


	override MultiplicarDecimal(factor: Decimal): Cantidad {
		const resultado = super.MultiplicarDecimal(factor);
		return new Cantidad(resultado.AMicros());
	}


	override Dividir(cantidad: number): Cantidad {
		const resultado = super.Dividir(cantidad);
		return new Cantidad(resultado.AMicros());
	}


	override DividirDecimal(divisor: Decimal): Cantidad {
		const resultado = super.DividirDecimal(divisor);
		return new Cantidad(resultado.AMicros());
	}


	override Porcentaje(porcentaje: number): Cantidad {
		const resultado = super.Porcentaje(porcentaje);
		return new Cantidad(resultado.AMicros());
	}


}


export function ExigirCantidadMicrosCorrectos(valorMicros: number): number {
	return Cantidad.DesdeMicros(valorMicros).AMicros(); // No transforma el valor, lo valida bajo las reglas centrales de Cantidad antes de usarlo: debe ser number, entero, finito, seguro para JavaScript y estar dentro del rango de negocio permitido.
}
