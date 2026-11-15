import type { Contexto } from './global';
import { RegistrarEventoConPrefijo } from './global';


/**
 * Motivación y contrato de esta clase
 *
 * Esta clase existe para representar decimales de forma segura dentro del Worker y al
 * persistirlos en Cloudflare D1. El decimal se guarda como un entero de micros, donde
 * 1 unidad decimal normal equivale a 1_000_000 micros. La razón principal es evitar
 * que valores decimales de negocio dependan de floats binarios al momento de leer,
 * escribir, sumar, restar o serializar datos. D1 almacena enteros de forma exacta,
 * así que usar campos terminados en *Micros hace visible desde el nombre que el valor
 * persistido no está en unidades decimales normales sino en micros. Esa convención de
 * nombres no la impone esta clase por sí sola, pero sí forma parte de su diseño: el
 * código queda mucho más legible y cualquier mezcla accidental entre valor normal y
 * valor en micros se vuelve ruidosa por la gran diferencia de escala.
 *
 * La primera defensa es precisamente esa explicitud en el modelo de datos. La segunda
 * defensa es esta clase estructurada, que concentra la representación decimal y evita
 * que cada módulo invente su propia conversión o sus propias reglas aritméticas. La
 * tercera defensa es el encapsulamiento: los micros viven en #Micros, no se exponen
 * como campo modificable, la instancia se congela y toda operación crea un decimal
 * nuevo. Así, nadie puede 'corregir' el valor internamente por fuera de los puntos
 * autorizados ni saltarse sin querer las validaciones de rango seguro, overflow,
 * comparación y redondeo definidas por el módulo.
 *
 * Encima de esas tres defensas base hay dos apoyos prácticos. El primero son las
 * funciones propias de conversión y operación del módulo: DesdeValor(), DesdeMicros(),
 * AMicros(), ATexto(), ATextoJson(), Sumar(), Restar(), Multiplicar(), Dividir() y
 * Porcentaje(). La idea es que el resto del sistema no haga cuentas manuales ni
 * escalados ad hoc por fuera de esta API, porque ahí es donde suelen aparecer los
 * errores silenciosos. El segundo apoyo es la validación del rango seguro real de
 * JavaScript con esta escala de 1e6, que ronda los 9_007_199_254.740991 en unidades
 * decimales normales antes de salir de Number.MAX_SAFE_INTEGER. Los límites de negocio
 * pertenecen a clases derivadas como Dinero o Cantidad.
 *
 * Esta escala de micros también está pensada para que los fallos sean ruidosos. Si
 * un desarrollador olvida convertir y persiste un valor humano como si ya fueran
 * micros, el sistema no lo 'arregla' ni lo disfraza: el valor resultante se verá
 * absurdamente pequeño o grande y eso lo vuelve detectable en pruebas, logs,
 * inspección manual e interfaz. En otras palabras, además de dar precisión, la
 * escala ayuda a que un error de unidad quede a la vista. El módulo no promete
 * adivinar todas las intenciones del llamador, pero sí ofrece un carril único y
 * coherente para mover decimal entre valor humano, micros persistidos y operaciones
 * sin dejar que el detalle de la escala quede regado por todo el código.
 */


interface PartesFormatoDecimal {
	Prefijo: string;
	ParteEntera: string;
	ParteDecimal: string;
	Sufijo: string;
}


export interface SeparadoresFormatoDecimal {
	SeparadorMiles: string;
	SeparadorDecimales: string;
}


export interface LímitesDecimal {
	MáximoMicros: bigint;
	MínimoMicros: bigint;
}

export class ErrorDecimal extends Error {


	constructor(mensaje: string) {
		super(mensaje);
		this.name = 'ErrorDecimal';
	}


}


const FactorMicros = 1_000_000; // Decisión estructural: 1 unidad decimal = 1_000_000 micros. Cambiarlo requiere migración de base de datos de las columnas *Micros.

const FactorMicrosBigInt = BigInt(FactorMicros); // Escala base del modelo decimal: 1 unidad de negocio = 1_000_000 micros. Se usa cuando ya tenemos dos valores del dominio representados en micros y queremos operar entre ellos sin pasar por un factor intermedio. En la práctica, esto significa que una multiplicación o división entre dos Decimal trabaja con un valor que ya viene expresado en la misma unidad interna que se persiste en D1. Si este factor cambiara, cambiaría la unidad estructural de todo el modelo, no solo una fórmula aislada, por eso vive como constante de identidad del decimal y no como un número cualquiera.

const DecimalesDecimalMicros = CalcularDecimalesDecimalMicros(FactorMicros);

const EscalaFactorOperaciones = 1_000_000; // Escala auxiliar para factores de entrada tipo number. Cuando la operación recibe un factor o divisor humano como 1.5, 0.2 o 19.0002, primero lo convertimos a un entero escalado con esta constante para poder seguir trabajando en BigInt y evitar errores binarios de IEEE 754. Elegir 1e6 conserva 6 decimales de precision en el factor, que es suficiente para las operaciones de negocio actuales y mantiene el numero escalado dentro del rango seguro de JavaScript en la mayor parte de casos practicos. Esta escala no representa la unidad de negocio del decimal. Solo existe para normalizar factores externos antes de combinarlos con micros.

const EscalaFactorOperacionesBigInt = BigInt(EscalaFactorOperaciones);

const MáximoEnteroSeguroBigInt = BigInt(Number.MAX_SAFE_INTEGER);

const MínimoEnteroSeguroBigInt = BigInt(Number.MIN_SAFE_INTEGER);

const FormatoDecimal: string = '### ### ### ##0,####';

const FormatoDecimalJson = '0.######';

const SeparadorDecimalesJson = '.';

const SeparadorMilesJson = '';

const CachéPartesFormatoDecimal = new Map<string, PartesFormatoDecimal>(); // Se debe poner primero porque ObtenerPartesFormatoDecimalValidadas lo usa y ambos formatos comunes se validan al cargar el módulo.

const { SeparadorMiles: SeparadorMiles, SeparadorDecimales: SeparadorDecimales } = InferirSeparadoresDeFormato(FormatoDecimal); // FormatoDecimal es la única fuente de verdad de los separadores visuales. Se derivan una sola vez al cargar el módulo para no recalcularlos en cada llamada a ATexto. La inferencia solo mira los carácteres no marcadores que aparecen entre el primer y el último '#' o '0' de la máscara.

const PartesFormatoDecimalNormalesValidadas = ObtenerPartesFormatoDecimalValidadas(FormatoDecimal, SeparadorDecimales, SeparadorMiles);

const PartesFormatoDecimalJsonValidadas = ObtenerPartesFormatoDecimalValidadas(FormatoDecimalJson, SeparadorDecimalesJson,
	SeparadorMilesJson);


function CalcularDecimalesDecimalMicros(factorDecimalADecimalMicros: number): number {

	const textoFactor = factorDecimalADecimalMicros.toString();
	const esPotenciaDeDiez = /^10*$/.test(textoFactor);
	if (!esPotenciaDeDiez)
		throw new ErrorDecimal(`factorDecimalADecimalMicros inválido: '${textoFactor}' debe ser una potencia de 10`);

	return textoFactor.length - 1;

}


export function CrearLímites(máximoValor: number, mínimoValor: number): LímitesDecimal {

	if (typeof máximoValor !== 'number' || !Number.isFinite(máximoValor) || máximoValor < 0)
		throw new ErrorDecimal('El valor máximo debe ser un número finito mayor o igual a cero');

	if (typeof mínimoValor !== 'number' || !Number.isFinite(mínimoValor))
		throw new ErrorDecimal('El valor mínimo debe ser un número finito');

	if (mínimoValor > máximoValor) throw new ErrorDecimal('El valor mínimo no puede superar el valor máximo');

	const factorMicrosNúmero = FactorMicros;
	if (!Number.isSafeInteger(factorMicrosNúmero) || factorMicrosNúmero <= 0)
		throw new ErrorDecimal('El factor de micros debe ser un entero seguro mayor que cero');

	const máximoMicrosNúmero = Math.round(máximoValor * factorMicrosNúmero);
	if (!Number.isSafeInteger(máximoMicrosNúmero))
		throw new ErrorDecimal('El valor máximo convertido a micros supera el rango seguro de JavaScript');
	const máximoMicros = BigInt(máximoMicrosNúmero);
	if (máximoMicros > MáximoEnteroSeguroBigInt)
		throw new ErrorDecimal('El valor máximo convertido a micros supera el rango seguro de JavaScript');

	const mínimoMicrosNúmero = Math.round(mínimoValor * factorMicrosNúmero);
	if (!Number.isSafeInteger(mínimoMicrosNúmero))
		throw new ErrorDecimal('El valor mínimo convertido a micros supera el rango seguro de JavaScript');

	return { MáximoMicros: máximoMicros, MínimoMicros: BigInt(mínimoMicrosNúmero) };

}


function ObtenerPartesFormatoDecimalValidadas(formatoDecimal: string, separadorDecimales: string,
	separadorMiles: string): PartesFormatoDecimal {

	const claveFormato = `${formatoDecimal}\u0000${separadorDecimales}\u0000${separadorMiles}`;
	const partesEnCaché = CachéPartesFormatoDecimal.get(claveFormato);
	if (partesEnCaché) return partesEnCaché;

	const partesValidadas = CrearPartesFormatoDecimalValidadas(formatoDecimal, separadorDecimales, separadorMiles);
	CachéPartesFormatoDecimal.set(claveFormato, partesValidadas);
	return partesValidadas;

}


function CrearPartesFormatoDecimalValidadas(formatoDecimal: string, separadorDecimales: string, separadorMiles: string): PartesFormatoDecimal {

	if (separadorDecimales !== '' && separadorDecimales === separadorMiles)
		throw new ErrorDecimal('FormatoDecimal inválido: los separadores deben existir y ser distintos');

	let primerMarcador = -1;
	let últimoMarcador = -1;
	for (let índice = 0; índice < formatoDecimal.length; índice++) {

		const carácter = formatoDecimal[índice];
		if (carácter === '#' || carácter === '0') {
			if (primerMarcador === -1) primerMarcador = índice;
			últimoMarcador = índice;
		}

	}

	if (primerMarcador === -1 || últimoMarcador === -1) throw new ErrorDecimal('FormatoDecimal inválido: debe contener # o 0');

	const prefijo = formatoDecimal.slice(0, primerMarcador);
	const cuerpo = formatoDecimal.slice(primerMarcador, últimoMarcador + 1);
	const sufijo = formatoDecimal.slice(últimoMarcador + 1);
	const índiceDecimal = separadorDecimales === '' ? -1 : cuerpo.lastIndexOf(separadorDecimales);
	const parteEntera = índiceDecimal >= 0 ? cuerpo.slice(0, índiceDecimal) : cuerpo;
	const parteDecimal = índiceDecimal >= 0 ? cuerpo.slice(índiceDecimal + separadorDecimales.length) : '';
	return { Prefijo: prefijo, ParteEntera: parteEntera, ParteDecimal: parteDecimal, Sufijo: sufijo };

}


export function InferirSeparadoresDeFormato(formatoDecimal: string): SeparadoresFormatoDecimal { // Recorre la máscara y, entre el primer y el último marcador numérico ('#' o '0'), reúne los carácteres separadores distintos preservando su orden de aparición. Reglas: Cero separadores distintos: ambos vacíos. Uno: el separador de miles es '' y el de decimales es ese único. Dos: El primero que aparece es el separador de miles y el segundo el de decimales. Tres o más distintos: se considera un FormatoDecimal inválido.

	let primerMarcador = -1;
	let últimoMarcador = -1;
	for (let índice = 0; índice < formatoDecimal.length; índice++) {

		const carácter = formatoDecimal[índice];
		if (carácter === '#' || carácter === '0') {
			if (primerMarcador === -1) primerMarcador = índice;
			últimoMarcador = índice;
		}

	}

	if (primerMarcador === -1 || últimoMarcador === -1) throw new ErrorDecimal('FormatoDecimal inválido: debe contener # o 0');

	const separadoresDistintos: string[] = [];
	for (let índice = primerMarcador + 1; índice < últimoMarcador; índice++) {

		const carácter = formatoDecimal[índice];
		if (carácter === '#' || carácter === '0') continue;
		if (!separadoresDistintos.includes(carácter)) separadoresDistintos.push(carácter);

	}

	if (separadoresDistintos.length >= 3)
		throw new ErrorDecimal(`FormatoDecimal inválido: se encontraron ${separadoresDistintos.length} separadores distintos entre los marcadores numéricos y solo se permiten hasta dos`);

	if (separadoresDistintos.length === 0) return { SeparadorMiles: '', SeparadorDecimales: '' };
	if (separadoresDistintos.length === 1) return { SeparadorMiles: '', SeparadorDecimales: separadoresDistintos[0] };
	return { SeparadorMiles: separadoresDistintos[0], SeparadorDecimales: separadoresDistintos[1] };

}


export class Decimal {


	readonly #Micros: number; // Fuente de verdad privada: protege el entero escalado para que otros módulos no hagan cálculos directos saltándose redondeo, overflow y validaciones.

	protected constructor(microsValidados: number) {
		this.#Micros = microsValidados;
		Object.freeze(this); // Refuerza la inmutabilidad evitando propiedades públicas accidentales. El estado real ya queda protegido por #Micros readonly y cada cálculo devuelve un decimal nuevo.
	}


	static DesdeMicros(cantidadMicros: number): Decimal {
		const microsValidados = ValidarMicrosComoNúmero(cantidadMicros, 'Decimal.Micros');
		return new Decimal(microsValidados);
	}


	static DesdeValor(valorDecimal: number, contexto: Contexto | null = null, alertarValorBajo = true): Decimal {

		void contexto;
		void alertarValorBajo;
		const micros = ConvertirNúmeroDecimalAMicros(valorDecimal, 'valorDecimal');
		return new Decimal(micros);

	}


	AMicros(): number {
		return this.#Micros; // Salida explícita para persistir en D1 o serializar. Los cálculos externos deben usar los métodos de decimal, no este número crudo. Se proporciona por completitud.
	}


	AValor(): number { // Advertencia: convierte micros a number dividiendo por FactorMicros. Para valores cercanos o superiores a Number.MAX_SAFE_INTEGER pierde precisión entera. Hoy los límites de Dinero y Cantidad estan por debajo, pero usar con cuidado si se aumentan.
		return this.#Micros / FactorMicros;
	}


	ATexto(): string {
		return FormatearMicrosComoTexto(this.#Micros); // El texto es solo representación visual derivada. Nunca participa en cálculos.
	}


	ATextoJson(): string {
		return ConvertirMicrosAValorJson(this.#Micros); // Esta salida usa la unidad decimal normal como texto decimal exacto para JSON, sin máscara de usuario ni separadores visuales.
	}


	toJSON(): number {
		return this.AMicros(); // JSON.stringify solo llama automáticamente a toJSON(), así que este método existe para serializar decimal como micros sin exponer #Micros.
	}


	[Symbol.toPrimitive](hint: 'number' | 'string' | 'default'): never { // Bloquea coerciones accidentales como a > b, a + b, `${decimal}` o Number(decimal) que de otro modo devolverían NaN o '[object Object]' silenciosamente. JSON.stringify no se ve afectado porque V8 prioriza toJSON sobre Symbol.toPrimitive.
		throw new ErrorDecimal(`Decimal no se puede convertir a primitivo (hint='${hint}'). Usa AMicros(), ATexto(), ATextoJson() o los comparadores semánticos.`);
	}


	Sumar(otro: Decimal): Decimal {
		const otroDecimal = ValidarDecimal(otro, 'otro');
		return Decimal.CrearDesdeMicrosBigInt(BigInt(this.#Micros) + BigInt(otroDecimal.#Micros), 'resultado de Sumar');
	}


	Restar(otro: Decimal): Decimal {
		const otroDecimal = ValidarDecimal(otro, 'otro');
		return Decimal.CrearDesdeMicrosBigInt(BigInt(this.#Micros) - BigInt(otroDecimal.#Micros), 'resultado de Restar');
	}


	Negar(): Decimal {
		return Decimal.CrearDesdeMicrosBigInt(-BigInt(this.#Micros), 'resultado de Negar');
	}


	ValorAbsoluto(): Decimal {

		const microsBigInt = BigInt(this.#Micros);
		const absoluto = microsBigInt < 0n ? -microsBigInt : microsBigInt;
		return Decimal.CrearDesdeMicrosBigInt(absoluto, 'resultado de ValorAbsoluto');

	}


	Multiplicar(cantidad: number): Decimal {

		const factorEscalado = EscalarFactorAEnteroBigInt(cantidad, 'cantidad'); // Convierte el number recibido a un entero BigInt escalado por EscalaFactorOperaciones (1e6) en vez de pasarlo crudo a la multiplicación. La razón es que this.#Micros se maneja como BigInt para soportar montos grandes sin perder enteros, y si se multiplicara directamente por un number se tendría que sacar los micros a number perdiendo precisión para montos altos, o se introducirían errores binarios de IEEE 754 al multiplicar. Al escalar el factor a un entero (por ejemplo 1.005 pasa a ser 1_005_000n) la multiplicación se hace 100% en BigInt y luego se divide por la misma escala, conservando exactos los micros del decimal de entrada y la representación decimal normalizada del factor. El error no queda acotado a 1 micro del resultado final: depende de cuánto se haya redondeado el factor y del tamaño del decimal. Ejemplo: Decimal de 1_000_000 micros (1 unidad) multiplicado por 1.005 produce factorEscalado = 1_005_000n, luego 1_000_000n * 1_005_000n / 1_000_000n = 1_005_000n micros exactos. Otro ejemplo: 3_000_000 micros multiplicado por 1/3 produce factorEscalado = Math.round(0.3333333333333333 * 1e6) = 333_333n, y 3_000_000n * 333_333n / 1_000_000n = 999_999n micros, con un error de 1 micro respecto del ideal 1_000_000. Con montos mayores ese error crece proporcionalmente.
		const resultado = DividirBigIntConRedondeoAlMásCercano(BigInt(this.#Micros) * factorEscalado, EscalaFactorOperacionesBigInt); // Aquí ya no estamos preservando fracciones arbitrarias del factor sino aterrizando el resultado final otra vez en micros enteros. Por eso sí conviene redondear al micro más cercano en vez de truncar hacia cero silenciosamente, para que operaciones como 1 micro * 0.5 o montos con factores no exactos no queden sesgados sistemáticamente hacia abajo en positivos y hacia arriba en negativos.
		return Decimal.CrearDesdeMicrosBigInt(resultado, 'resultado de Multiplicar');

	}


	MultiplicarDecimal(factor: Decimal): Decimal {

		const decimal = ValidarDecimal(factor, 'factor');
		const resultado = DividirBigIntConRedondeoAlMásCercano(BigInt(this.#Micros) * BigInt(decimal.#Micros), FactorMicrosBigInt);
		return Decimal.CrearDesdeMicrosBigInt(resultado, 'resultado de MultiplicarDecimal');

	}


	Dividir(cantidad: number): Decimal {

		const divisorEscalado = EscalarFactorAEnteroBigInt(cantidad, 'cantidad'); // Aquí el divisor es un factor externo en number, no otro Decimal. Por eso primero se lleva a un entero escalado por EscalaFactorOperaciones: así se evita convertir micros a float y se sigue haciendo toda la cuenta en BigInt. La división se resuelve como (micros * escala) / divisorEscalado, y luego se redondea al micro mas cercano para no sesgar siempre hacia abajo.  Ejemplo: Decimal de 1_000_000 micros (1 unidad) dividido entre 4 produce divisorEscalado = 4_000_000n, y (1_000_000n * 1_000_000n) / 4_000_000n = 250_000n micros, que corresponde a 0.25 unidades, exacto. Ejemplo con divisor no exacto: 1_000_000 micros dividido entre 3 produce divisorEscalado = 3_000_000n, y el resultado redondeado queda en 333_333n micros. El cero se valida explícitamente porque tras escalar también produce 0n y dispararía división por cero del BigInt. Se prefiere lanzar un error de dominio claro.
		if (divisorEscalado === 0n) throw new ErrorDecimal('División inválida: cantidad no puede ser cero');
		const resultado = DividirBigIntConRedondeoAlMásCercano(BigInt(this.#Micros) * EscalaFactorOperacionesBigInt, divisorEscalado); // Igual que en el formateo visual, aquí la división entera pura introduciría un sesgo sistemático. La diferencia es que ahora el redondeo se aplica al micro final de negocio y no a un decimal mostrado, así que debe funcionar también con signos para mantener simetría entre valores positivos y negativos.
		return Decimal.CrearDesdeMicrosBigInt(resultado, 'resultado de Dividir');

	}


	DividirDecimal(divisor: Decimal): Decimal {

		const decimal = ValidarDecimal(divisor, 'divisor');
		if (decimal.#Micros === 0) throw new ErrorDecimal('División inválida: el divisor no puede ser cero');
		const resultado = DividirBigIntConRedondeoAlMásCercano(BigInt(this.#Micros) * FactorMicrosBigInt, BigInt(decimal.#Micros)); // Aquí ambos operandos ya son Decimal, así que no se necesita la escala auxiliar de factores humanos. Se usa directamente la escala estructural del modelo, que es la misma que vive en D1: micros / micros. El truco es mantener el numerador escalado una vez más para no perder la fracción al dividir enteros BigInt, y luego redondear al micro mas cercano para conservar el comportamiento estable del resto del modulo.
		return Decimal.CrearDesdeMicrosBigInt(resultado, 'resultado de DividirDecimal');

	}


	/**
	 * Calcula un porcentaje del valor actual. El parámetro se expresa como porcentaje normal, por ejemplo 15 = 15%, 100 = 100% y 0.5 = 0.5%.
	 * @param porcentaje Porcentaje normal. Por ejemplo, para 15% se debe pasar 15 y no 0.15. Se permiten valores menores, mayores o negativos cuando el cálculo de negocio lo requiera.
	 * @returns Nuevo Decimal con el porcentaje aplicado al valor actual.
	 */
	Porcentaje(porcentaje: number): Decimal {

		const porcentajeEscalado = EscalarFactorAEnteroBigInt(porcentaje, 'porcentaje'); // Aplica el mismo principio que Multiplicar: el porcentaje recibido como number se lleva primero a entero BigInt escalado por EscalaFactorOperaciones (1e6), así toda la operación vive en BigInt y los micros nunca pasan por number. La diferencia respecto a Multiplicar es que además hay que dividir por 100 al final, porque un porcentaje representa centésimas: 15 quiere decir 15/100 del valor. Para no perder precisión por pasos intermedios se divide una sola vez al final por (EscalaFactorOperaciones * 100), y el resultado se redondea al micro más cercano. Ejemplo: Decimal de 1_000_000 micros (1 unidad) al 15% produce porcentajeEscalado = 15_000_000n, y (1_000_000n * 15_000_000n) / 100_000_000n = 150_000n micros, equivalente a 0.15 unidades, exacto. Ejemplo con decimales: 1_000_000 micros al 0.5% produce porcentajeEscalado = 500_000n, y (1_000_000n * 500_000n) / 100_000_000n = 5_000n micros, equivalente a 0.005 unidades, exacto. Si el porcentaje tiene más de 6 decimales o representa una fracción infinita, el desvío del factor normalizado se multiplica por el decimal de entrada.
		const resultado = DividirBigIntConRedondeoAlMásCercano(BigInt(this.#Micros) * porcentajeEscalado,
			EscalaFactorOperacionesBigInt * 100n); // Porcentaje también termina aterrizando en micros enteros. Redondear al micro más cercano evita que porcentajes pequeños o fraccionarios acumulen el mismo sesgo de truncamiento que ya corregimos en el formateo visual.
		return Decimal.CrearDesdeMicrosBigInt(resultado, 'resultado de Porcentaje');

	}


	EsIgual(otro: Decimal): boolean { return this.Comparar(otro) === 0; }


	EsMayor(otro: Decimal): boolean { return this.Comparar(otro) === 1; }


	EsMayorOIgual(otro: Decimal): boolean { return this.Comparar(otro) >= 0; }


	EsMenor(otro: Decimal): boolean { return this.Comparar(otro) === -1; }


	EsMenorOIgual(otro: Decimal): boolean { return this.Comparar(otro) <= 0; }


	EsCero(): boolean { return this.#Micros === 0; }


	EsPositivo(): boolean { return this.#Micros > 0; }


	EsNegativo(): boolean { return this.#Micros < 0; }


	Comparar(otro: Decimal): -1 | 0 | 1 {

		const decimal = ValidarDecimal(otro, 'otro');
		if (this.#Micros < decimal.#Micros) return -1;
		if (this.#Micros > decimal.#Micros) return 1;
		return 0;

	}


	protected static CrearDesdeMicrosBigInt(cantidadMicros: bigint, nombre: string): Decimal {
		const microsValidados = ValidarMicrosComoBigInt(cantidadMicros, nombre);
		return new Decimal(microsValidados); // Cada operación crea una instancia nueva para conservar inmutabilidad y recalcular salidas bajo demanda desde #Micros.
	}


}


function ValidarDecimal(valor: unknown, nombre: string): Decimal {
	if (!(valor instanceof Decimal)) throw new ErrorDecimal(`${nombre} inválido: debe ser una instancia de Decimal`);
	return valor;
}


function ConvertirNúmeroDecimalAMicros(valorDecimal: number, nombre: string): number {

	const valorDecimalValidado = ValidarNúmeroFinito(valorDecimal, nombre); // DesdeValor no parsea texto: toma el number recibido y lo escala al micro más cercano. Cualquier error residual de IEEE 754 por debajo del micro se descarta con Math.round, lo cual es aceptable porque 1 micro es una millonésima de unidad decimal y diferencias por debajo de ese umbral no tienen relevancia práctica en decimal. Ejemplo: 1.5 unidades → Math.round(1.5 * 1_000_000) = 1_500_000 micros. Ejemplo con valor que internamente IEEE 754 desplaza: 0.1 + 0.2 entra como 0.30000000000000004 y produce Math.round(300_000.00000000006) = 300_000 micros, que es exactamente lo esperado.
	const micros = Math.round(valorDecimalValidado * FactorMicros);
	return ValidarMicrosComoNúmero(micros, 'Decimal.Micros');

}


function ConvertirMicrosAValorJson(cantidadMicros: number): string {
	return FormatearMicrosConFormato(cantidadMicros, FormatoDecimalJson, SeparadorDecimalesJson, SeparadorMilesJson, true);
}


function EscalarFactorAEnteroBigInt(valor: unknown, nombre: string): bigint {

	const número = ValidarNúmeroFinito(valor, nombre); // Convierte un number recibido como factor/divisor en un entero BigInt escalado por EscalaFactorOperaciones (1e6). El objetivo es que las operaciones aritméticas posteriores (Multiplicar, Dividir, Porcentaje) puedan vivir 100% en BigInt usando los micros tal cual, sin tener que convertir los micros a number (lo que rompería para valores grandes) y sin introducir error binario adicional al multiplicar BigInt * number. Cualquier precisión por debajo de 1/1e6 del factor se pierde con Math.round. El impacto final no es fijo, porque depende del decimal contra el que se aplique ese factor. Ejemplo: 1.005 → 1_005_000n. Ejemplo: 1/3 entra como 0.3333333333333333 y se transforma en 333_333n, que al usarse contra 3_000_000 micros da 999_999n (un micro menos que el ideal exacto 1_000_000n), pero contra valores mayores produce un desvío proporcionalmente mayor. Ejemplo: 100 (como porcentaje o factor) → 100_000_000n.
	const escalado = Math.round(número * EscalaFactorOperaciones);
	if (!Number.isSafeInteger(escalado)) // Si el factor recibido es tan grande que al escalarlo por 1e6 ya pasa Number.MAX_SAFE_INTEGER, perderíamos enteros al hacer Math.round antes de pasar a BigInt y el resultado quedaría silenciosamente corrupto. Se prefiere fallar con un error claro de dominio: factores tan grandes no tienen sentido práctico para Multiplicar/Dividir/Porcentaje y casi siempre indican un bug en el código que llama.
		throw new ErrorDecimal(`${nombre} inválido: el factor escalado supera el rango seguro de JavaScript`);
	return BigInt(escalado);

}


function ValidarMicrosComoNúmero(cantidadMicros: unknown, nombre: string): number {

	if (typeof cantidadMicros !== 'number') throw new ErrorDecimal(`${nombre} inválido: debe ser numérico`);
	if (Number.isNaN(cantidadMicros)) throw new ErrorDecimal(`${nombre} inválido: no puede ser NaN`);
	if (!Number.isFinite(cantidadMicros)) throw new ErrorDecimal(`${nombre} inválido: debe ser finito`);
	if (!Number.isInteger(cantidadMicros)) throw new ErrorDecimal(`${nombre} inválido: debe ser un entero`);
	if (!Number.isSafeInteger(cantidadMicros)) throw new ErrorDecimal(`${nombre} inválido: fuera del rango seguro de JavaScript`);
	return ValidarMicrosComoBigInt(BigInt(cantidadMicros), nombre);

}


export function ValidarMicrosEnRangoSeguro(cantidadMicros: bigint, nombre: string, máximoMicrosPermitido: bigint | null): number {

	if (cantidadMicros > MáximoEnteroSeguroBigInt || cantidadMicros < MínimoEnteroSeguroBigInt)
		throw new ErrorDecimal(`${nombre} inválido: fuera del rango seguro de JavaScript`);

	if (máximoMicrosPermitido !== null && (cantidadMicros > máximoMicrosPermitido || cantidadMicros < -máximoMicrosPermitido))
		throw new ErrorDecimal(`${nombre} inválido: supera el valor absoluto permitido de ${máximoMicrosPermitido}`);

	return Number(cantidadMicros);

}


function ValidarMicrosComoBigInt(cantidadMicros: bigint, nombre: string): number {
	return ValidarMicrosEnRangoSeguro(cantidadMicros, nombre, null);
}


function ValidarNúmeroFinito(valor: unknown, nombre: string): number {

	if (typeof valor !== 'number') throw new ErrorDecimal(`${nombre} inválido: debe ser numérico`);
	if (Number.isNaN(valor)) throw new ErrorDecimal(`${nombre} inválido: no puede ser NaN`);
	if (!Number.isFinite(valor)) throw new ErrorDecimal(`${nombre} inválido: debe ser finito`);
	return valor;

}


export function AdvertirValorBajo(cantidadMicros: number, origen: string, mínimoMicros: bigint, nombreLímite: string,
	prefijoEvento: string, contexto: Contexto | null = null, alertarPredeterminado = true): void {

	if (!alertarPredeterminado || cantidadMicros === 0) return;

	const microsAbsolutos = cantidadMicros < 0 ? -BigInt(cantidadMicros) : BigInt(cantidadMicros);
	if (microsAbsolutos < mínimoMicros) {

		const detalles = `${origen} bajo: ${cantidadMicros} micros equivalen a menos de ${nombreLímite} (${mínimoMicros}).`;
		RegistrarEventoConPrefijo(contexto, prefijoEvento, 'Valor Bajo', detalles, {
			origen, cantidadMicros, nombreLímite });

	}

}


function FormatearMicrosComoTexto(cantidadMicros: number): string {
	return FormatearMicrosConFormato(cantidadMicros, FormatoDecimal, SeparadorDecimales, SeparadorMiles, true);
}


export function FormatearMicrosConFormato(cantidadMicros: number, formatoDecimal: string, separadorDecimales: string,
	separadorMiles: string, microsYaValidados = false): string {

	const microsValidados = microsYaValidados ? cantidadMicros : ValidarMicrosComoNúmero(cantidadMicros, 'Decimal.Micros');
	const partes = formatoDecimal === FormatoDecimalJson && separadorDecimales === SeparadorDecimalesJson && separadorMiles === SeparadorMilesJson
		? PartesFormatoDecimalJsonValidadas
		: formatoDecimal === FormatoDecimal && separadorDecimales === SeparadorDecimales && separadorMiles === SeparadorMiles
			? PartesFormatoDecimalNormalesValidadas
			: ObtenerPartesFormatoDecimalValidadas(formatoDecimal, separadorDecimales, separadorMiles);
	const microsBigInt = BigInt(microsValidados);
	const negativo = microsBigInt < 0n;
	const microsAbsolutos = negativo ? -microsBigInt : microsBigInt;
	const cantidadDecimales = ContarMarcadoresDecimales(partes.ParteDecimal);
	const valorEscalado = EscalarMicrosParaFormato(microsAbsolutos, cantidadDecimales); // ATexto respeta la máscara visual: si la máscara tiene 2 decimales, se muestran 2.
	const escalaDecimal = cantidadDecimales > 0 ? PotenciaDiez(cantidadDecimales) : 1n;
	const unidades = valorEscalado / escalaDecimal;
	const decimales = cantidadDecimales > 0
		? FormatearDecimales(valorEscalado % escalaDecimal, partes.ParteDecimal, cantidadDecimales)
		: '';
	const enteros = FormatearEnteros(unidades, partes.ParteEntera, separadorMiles);
	const signo = negativo ? '-' : '';
	const separadorYDecimales = decimales === '' ? '' : `${separadorDecimales}${decimales}`;
	return `${partes.Prefijo}${signo}${enteros}${separadorYDecimales}${partes.Sufijo}`;

}


function FormatearEnteros(unidades: bigint, máscaraEntera: string, separadorMiles: string): string {

	const mínimosEnteros = ContarCerosObligatorios(máscaraEntera);
	const textoBase = unidades.toString().padStart(mínimosEnteros, '0');
	if (separadorMiles === '') return textoBase;
	if (!máscaraEntera.includes(separadorMiles)) return textoBase;

	const grupos: string[] = [];
	for (let fin = textoBase.length; fin > 0; fin -= 3) {
		const inicio = Math.max(0, fin - 3);
		grupos.unshift(textoBase.slice(inicio, fin));
	}

	return grupos.join(separadorMiles);

}


function ContarMarcadoresDecimales(máscaraDecimal: string): number {

	let total = 0;
	for (const carácter of máscaraDecimal) {
		if (carácter === '#' || carácter === '0') total++;
	}
	return total;

}


function EscalarMicrosParaFormato(microsAbsolutos: bigint, cantidadDecimales: number): bigint {

	if (cantidadDecimales === DecimalesDecimalMicros) return microsAbsolutos;
	if (cantidadDecimales > DecimalesDecimalMicros) {
		return microsAbsolutos * PotenciaDiez(cantidadDecimales - DecimalesDecimalMicros);
	} else {
		const divisor = PotenciaDiez(DecimalesDecimalMicros - cantidadDecimales);
		return DividirBigIntConRedondeoAlMásCercano(microsAbsolutos, divisor);
	}
	
}


function DividirBigIntConRedondeoAlMásCercano(dividendo: bigint, divisor: bigint): bigint { // Esta función convierte la truncación natural de la división entera de BigInt en un redondeo normal al entero más cercano dentro de la escala que se esté resolviendo. Es útil tanto al reducir micros para mostrar menos decimales que los reales, donde evita que formatos como '#.#' o '#.##' siempre se vayan hacia abajo, como al cerrar operaciones internas que deben volver a caer en micros enteros. En esas divisiones no siempre es posible conservar todos los micros porque el resultado real puede quedar entre dos micros vecinos, así que esta función evita un sesgo silencioso y elige el micro o la unidad visual más cercana. Valores como 1.25 con '#.#' pasan correctamente a 1.3, 1.24 sigue en 1.2 y una división decimal cuyo resultado ideal cae entre dos micros se redondea al micro más cercano en vez de truncarse siempre.

	if (divisor === 0n) throw new ErrorDecimal('División inválida: el divisor no puede ser cero');

	const negativo = (dividendo < 0n) !== (divisor < 0n);
	const dividendoAbsoluto = dividendo < 0n ? -dividendo : dividendo;
	const divisorAbsoluto = divisor < 0n ? -divisor : divisor;
	const mitad = divisorAbsoluto / 2n;
	const cocienteRedondeado = (dividendoAbsoluto + mitad) / divisorAbsoluto;
	return negativo ? -cocienteRedondeado : cocienteRedondeado;

}


function FormatearDecimales(valorDecimal: bigint, máscaraDecimal: string, cantidadDecimales: number): string {

	const mínimosDecimales = ContarCerosObligatoriosDecimales(máscaraDecimal);
	const textoCompleto = valorDecimal.toString().padStart(cantidadDecimales, '0');
	let longitudVisible = textoCompleto.length;

	while (longitudVisible > mínimosDecimales && textoCompleto[longitudVisible - 1] === '0'
		&& máscaraDecimal[longitudVisible - 1] === '#') {
		longitudVisible--;
	}

	return textoCompleto.slice(0, longitudVisible);

}


function ContarCerosObligatorios(texto: string): number {

	let total = 0;
	for (const carácter of texto) {
		if (carácter === '0') total++;
	}
	return Math.max(total, 1);

}


function ContarCerosObligatoriosDecimales(texto: string): number {

	let total = 0;
	for (const carácter of texto) {
		if (carácter === '0') total++;
	}
	return total;

}


function PotenciaDiez(exponente: number): bigint {

	if (!Number.isSafeInteger(exponente) || exponente < 0)
		throw new ErrorDecimal('Potencia decimal inválida: el exponente debe ser un entero seguro mayor o igual a cero');
	return 10n ** BigInt(exponente);

}
