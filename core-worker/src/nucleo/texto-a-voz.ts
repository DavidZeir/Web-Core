import { CodificarBase64UrlBytes, CodificarBase64UrlTexto, type Contexto, ExigirEnteroSeguroPositivo, ExigirTextoNoVacío,
	EsIdiomaSoportado, type Idioma, ObtenerMensajeError, DecodificarBase64, RegistrarEventoConPrefijo } from './global';
import { EnviarAlertaErrorCrítico } from './alertas';
import { CódigoErrorIA, CombinarInfraccionesIA, ValidarConModeraciónContenido, type ErrorIA, type FuenteInfracciónIA,
	type UnidadesInfracciónIA } from './ia';
import { ConectorTextoAVoz, PreciosTextoAVoz, ProveedorTextoAVoz } from './tipos';
import { ProveedoresTextoAVoz, ConectoresTextoAVoz, VocesGeminiTextoAVoz, VocesKokoroTextoAVoz,
	CarácteresMáximosTextoAVoz, FactorCarácteresATókenesTextoAVoz, IdiomaPredeterminado,
	SegundosMáximosSolicitudTextoAVoz } from '../configuracion';


export interface EntradaTextoAVoz {
	Texto: string;
	InstruccionesVoz: string;
	Idioma: string;
	ModeloOConector: string;
	RespaldoModeloOConector: string | null;
	Voz: string;
	VozRespaldo: string | null;
	VelocidadReproducción: number;
	SegundosMáximosPrincipal: number;
	SegundosMáximosRespaldo: number;
	ConectoresDesactivados?: readonly string[];
	PermitirConector?: (nombreConector: string) => Promise<boolean>;
}

export interface ResultadoTextoAVoz {
	Tipo: 'Respuesta' | 'Error';
	Texto: string;
	Errores: ErrorIA[];
	Audio: Uint8Array;
	TipoContenido: 'audio/mpeg' | 'audio/wav';
	ExtensiónArchivo: 'mp3' | 'wav';
	Proveedor: string;
	Conector: string;
	ConectorEfectivo: string | null;
	ConsultasFallidas: number;
	Modelo: string;
	Idioma: string;
	Voz: string | null;
	CarácteresEntrada: number;
	TókenesEntrada: number;
	DuraciónAudioSegundos: number;
	CostoDólares: number;
	Precios: PreciosTextoAVoz;
	InferenciaMilisegundos: number;
	InferenciaTotalMilisegundos: number;
	UsadoConectorRespaldo: boolean;
	UnidadesInfracción: UnidadesInfracciónIA;
	FuenteInfracción?: FuenteInfracciónIA;
}

interface ResultadoConectorTextoAVoz {
	Audio: Uint8Array;
	DuraciónAudioSegundos: number;
	Proveedor: ProveedorTextoAVoz;
	Conector: ConectorTextoAVoz;
	Idioma: string;
	Voz: string | null;
	CarácteresEntrada: number;
	InferenciaMilisegundos: number;
	UsadoConectorRespaldo: boolean;
	Errores: ErrorIA[];
	UnidadesInfracción: UnidadesInfracciónIA;
	FuenteInfracción?: FuenteInfracciónIA;
}

interface ErrorConectorTextoAVoz extends ErrorIA { }

const MensajeTiempoEsperaAgotadoTextoAVoz = 'Tiempo de espera agotado consultando texto a voz.';

const MensajeErrorConfiguraciónTextoAVoz = 'Error interno de configuración de texto a voz.';

const MensajeErrorClaveGoogleCloudNoValida = 'La clave privada de Google Cloud no es válida. Verifica que CLAVE_GOOGLE_CLOUD contenga un PEM PKCS#8 y que no tenga comillas dobles al principio o al final.';

export const MensajeConectorTextoAVozDesactivado = 'Conector de texto a voz desactivado temporalmente por el servidor.';

const MensajeContenidoNoPermitidoTextoAVoz = 'El contenido de texto a voz no está permitido.';


export class ErrorTextoAVozNoReintentable extends Error {


	constructor(mensaje: string) {
		super(mensaje);
		this.name = 'ErrorTextoAVozNoReintentable';
	}


}


class ErrorProveedorTextoAVozReintentable extends Error {


	constructor(mensaje: string) {
		super(mensaje);
		this.name = 'ErrorProveedorTextoAVozReintentable';
	}


}


class ErrorContenidoBloqueadoTextoAVoz extends ErrorProveedorTextoAVozReintentable {


	constructor(mensaje: string, readonly UnidadesInfracción: UnidadesInfracciónIA, readonly FuenteInfracción: FuenteInfracciónIA) {
		super(mensaje);
		this.name = 'ErrorContenidoBloqueadoTextoAVoz';
	}


}


class ErrorClaveGoogleCloudNoValida extends Error {


	constructor() {
		super(MensajeErrorClaveGoogleCloudNoValida);
		this.name = 'ErrorClaveGoogleCloudNoValida';
	}


}


class ErrorTextoAVozConErrores extends Error {


	constructor(public readonly Errores: ErrorIA[], mensaje?: string, readonly UnidadesInfracción: UnidadesInfracciónIA = 0,
		readonly FuenteInfracción?: FuenteInfracciónIA) {
		super(mensaje ?? CrearMensajeErrorTextoAVoz(Errores));
		this.name = 'ErrorTextoAVozConErrores';
	}


}


export async function GenerarTextoAVoz(contexto: Contexto, entrada: EntradaTextoAVoz, señal: AbortSignal = contexto.Solicitud.signal)
	: Promise<ResultadoTextoAVoz> { // Premodera la entrada y, si es segura, ejecuta el mismo flujo directo de proveedores y respaldos.

	const textoAModerar = CrearTextoAModerar(entrada.Texto, entrada.InstruccionesVoz);
	if (textoAModerar === null) return GenerarTextoAVozDirecto(contexto, entrada, señal);

	const resultadoModeración = await ValidarConModeraciónContenido(contexto, señal, textoAModerar,
		ResolverIdiomaModeraciónTextoAVoz(entrada.Idioma));
	if (resultadoModeración.Estado !== 'Seguro') {

		const código = resultadoModeración.Estado === 'Inseguro' ? CódigoErrorIA.ContenidoNoPermitido
			: resultadoModeración.Estado === 'Cancelada' ? CódigoErrorIA.SolicitudCancelada
				: CódigoErrorIA.ModeraciónNoDisponible;

		const mensaje = resultadoModeración.Estado === 'Inseguro' ? MensajeContenidoNoPermitidoTextoAVoz
			: resultadoModeración.Estado === 'Cancelada' ? 'La solicitud fue cancelada por el usuario.'
				: 'No se pudo validar el contenido de texto a voz.';

		return ResultadoErrorTextoAVoz(mensaje, [{ Código: código, Fuente: 'Solicitud', Error: mensaje }],
			resultadoModeración.UnidadesInfracción, resultadoModeración.FuenteInfracción);

	}

	const resultado = await GenerarTextoAVozDirecto(contexto, entrada, señal);
	return { ...resultado, ...CombinarInfraccionesIA(resultadoModeración, resultado) };

}


export async function GenerarTextoAVozDirecto(contexto: Contexto, entrada: EntradaTextoAVoz,
	señal: AbortSignal = contexto.Solicitud.signal): Promise<ResultadoTextoAVoz> { // Genera audio sin premoderación usando el conector principal y, si falla, un respaldo.

	try {
		const resultado = await GenerarTextoAVozRespuesta(contexto, entrada, señal);
		return resultado;
	} catch (error) {

		if (error instanceof ErrorTextoAVozConErrores)
			return ResultadoErrorTextoAVoz(error.message, error.Errores, error.UnidadesInfracción, error.FuenteInfracción);
		if (error instanceof ErrorTextoAVozNoReintentable) {

			const mensaje = ObtenerMensajeError(error);
			return ResultadoErrorTextoAVoz(mensaje,
				[{ Código: CódigoErrorIA.SolicitudInválida, Fuente: 'Solicitud', Error: mensaje }]);

		}

		const mensaje = ObtenerMensajeError(error);
		const detalle = mensaje || 'No se pudo generar el audio.';
		return ResultadoErrorTextoAVoz(detalle, [{ Código: CódigoErrorIA.ErrorInterno, Fuente: 'Solicitud', Error: detalle }]);

	}

}


function CrearTextoAModerar(texto: unknown, instruccionesVoz: unknown): string | null {

	if (typeof texto !== 'string' || texto.trim() === '' || typeof instruccionesVoz !== 'string') return null;
	const textoNormalizado = texto.trim();
	const instruccionesNormalizadas = instruccionesVoz.trim();
	if (textoNormalizado.length + instruccionesNormalizadas.length > CarácteresMáximosTextoAVoz) return null;
	return instruccionesNormalizadas ? `${textoNormalizado}\n\n${instruccionesNormalizadas}` : textoNormalizado;

}


function ResolverIdiomaModeraciónTextoAVoz(idioma: unknown): Idioma {

	if (typeof idioma !== 'string') return IdiomaPredeterminado;
	const idiomaBase = idioma.trim().toLowerCase().split('-')[0];
	return EsIdiomaSoportado(idiomaBase) ? idiomaBase : IdiomaPredeterminado;

}


async function GenerarTextoAVozRespuesta(contexto: Contexto, entrada: EntradaTextoAVoz, señal: AbortSignal): Promise<ResultadoTextoAVoz> {

	const texto = ExigirTextoNoVacío(entrada.Texto, 'Texto debe ser texto no vacío');
	const instruccionesVoz = NormalizarInstruccionesVoz(entrada.InstruccionesVoz);
	const conector = ResolverConector(entrada.ModeloOConector,'ModeloOConector');
	const conectorRespaldo = ResolverRespaldoModeloOConector(entrada.RespaldoModeloOConector, conector);
	const proveedor = ProveedoresTextoAVoz[conector.Proveedor];
	const idioma = NormalizarIdioma(entrada.Idioma, proveedor);
	const voz = NormalizarVoz(entrada.Voz, conector);

	if (instruccionesVoz && proveedor.Formato !== 'Google Cloud TTS')
		throw new ErrorTextoAVozNoReintentable(`InstruccionesVoz no está soportado por ${proveedor.Formato}.`);

	const carácteresEntrada = texto.length + instruccionesVoz.length;
	if (carácteresEntrada > CarácteresMáximosTextoAVoz)
		throw new ErrorTextoAVozNoReintentable(`Texto e InstruccionesVoz no pueden superar ${CarácteresMáximosTextoAVoz} carácteres.`);

	if (entrada.VozRespaldo === undefined)
		throw new ErrorTextoAVozNoReintentable('VozRespaldo es obligatoria y debe ser texto o null.');

	let idiomaRespaldo: string | null = null;
	let vozRespaldo: string | null = null;
	if (conectorRespaldo === null) {
		if (entrada.VozRespaldo !== null)
			throw new ErrorTextoAVozNoReintentable('VozRespaldo debe ser null cuando no existe RespaldoModeloOConector.');
	} else {

		if (typeof entrada.VozRespaldo !== 'string')
			throw new ErrorTextoAVozNoReintentable('VozRespaldo debe ser texto cuando existe RespaldoModeloOConector.');
		const proveedorRespaldo = ProveedoresTextoAVoz[conectorRespaldo.Proveedor];
		const idiomaRespaldoNormalizado = NormalizarIdioma(entrada.Idioma, proveedorRespaldo);
		idiomaRespaldo = conectorRespaldo.GrupoVoces === 'kokoro' ? ObtenerIdiomaBase(idiomaRespaldoNormalizado) :
			idiomaRespaldoNormalizado; // Gemini conserva el locale completo, mientras Kokoro recibe únicamente el código base de dos letras que exige su proveedor. Esta conversión solo afecta al intento de respaldo y no altera el idioma principal.
		vozRespaldo = NormalizarVoz(entrada.VozRespaldo, conectorRespaldo); // El respaldo conserva el mismo texto, idioma y velocidad, pero su voz se valida por separado porque puede pertenecer a la familia Kokoro.

	}

	const velocidadReproducción = NormalizarVelocidadReproducción(entrada.VelocidadReproducción);
	const segundosMáximosPrincipal = NormalizarSegundosMáximos(entrada.SegundosMáximosPrincipal, 'SegundosMáximosPrincipal');
	const segundosMáximosRespaldo = NormalizarSegundosMáximos(entrada.SegundosMáximosRespaldo, 'SegundosMáximosRespaldo');
	const conectoresDesactivados = NormalizarConectoresDesactivados(entrada.ConectoresDesactivados);
	const inicio = Date.now();

	const conectores = conectorRespaldo === null ? [conector] : [conector, conectorRespaldo];
	const resultadoConector = await EjecutarCadenaConectores(contexto, conectores, texto, instruccionesVoz, idioma, idiomaRespaldo,
		voz, vozRespaldo, velocidadReproducción, segundosMáximosPrincipal, segundosMáximosRespaldo, conectoresDesactivados,
		entrada.PermitirConector, señal);
	const conectorEfectivo = resultadoConector.Conector; // El conector exitoso determina los metadatos y el cobro. Así una respuesta Kokoro informa em_alex y su precio aunque Gemini haya sido el primer intento.
	const audio = resultadoConector.Audio;
	const duraciónAudioSegundos = resultadoConector.DuraciónAudioSegundos;
	const costoDólares = ObtenerCosto(conectorEfectivo, resultadoConector.CarácteresEntrada, duraciónAudioSegundos); // Solo se cobran los caracteres realmente enviados al proveedor efectivo. Si Kokoro fue respaldo, las instrucciones exclusivas de Gemini no forman parte de su entrada ni de su costo.
	const inferenciaTotalMilisegundos = Math.max(1, Date.now() - inicio);

	return { Tipo: 'Respuesta', Texto: '', Errores: resultadoConector.Errores, Audio: audio, TipoContenido: conectorEfectivo.TipoContenido,
		ExtensiónArchivo: conectorEfectivo.ExtensiónArchivo, Proveedor: resultadoConector.Proveedor.Nombre,
		Conector: conectorEfectivo.Nombre, ConectorEfectivo: conectorEfectivo.Nombre,
		ConsultasFallidas: ObtenerConsultasFallidas(resultadoConector.Errores), Modelo: conectorEfectivo.Modelo,
		Idioma: resultadoConector.Idioma, Voz: resultadoConector.Voz,
		CarácteresEntrada: resultadoConector.CarácteresEntrada,
		TókenesEntrada: Math.ceil(resultadoConector.CarácteresEntrada / FactorCarácteresATókenesTextoAVoz),
		DuraciónAudioSegundos: duraciónAudioSegundos, CostoDólares: costoDólares,
		Precios: conectorEfectivo.Precios,
		InferenciaMilisegundos: resultadoConector.InferenciaMilisegundos,
		InferenciaTotalMilisegundos: inferenciaTotalMilisegundos,
		UsadoConectorRespaldo: resultadoConector.UsadoConectorRespaldo,
		UnidadesInfracción: resultadoConector.UnidadesInfracción,
		FuenteInfracción: resultadoConector.FuenteInfracción };

}


function ResultadoErrorTextoAVoz(mensajeError: string, errores: ErrorIA[], unidadesInfracción: UnidadesInfracciónIA = 0,
	fuenteInfracción?: FuenteInfracciónIA): ResultadoTextoAVoz {

	return { Tipo: 'Error', Texto: mensajeError, Audio: new Uint8Array(), TipoContenido: 'audio/mpeg',
		Errores: errores,
		ExtensiónArchivo: 'mp3', Proveedor: '', Conector: '', ConectorEfectivo: null, ConsultasFallidas: ObtenerConsultasFallidas(errores),
		Modelo: '', Idioma: '', Voz: null, CarácteresEntrada: 0,
		TókenesEntrada: 0, DuraciónAudioSegundos: 0, CostoDólares: 0, Precios: { MinutoAudio: 0, MillónTókenesTextoEntrada: 0, MillónCarácteresAudio: 0 },
		InferenciaMilisegundos: 0, InferenciaTotalMilisegundos: ObtenerInferenciaTotalErrores(errores), UsadoConectorRespaldo: false,
		UnidadesInfracción: unidadesInfracción, FuenteInfracción: fuenteInfracción };

}


function ObtenerInferenciaTotalErrores(errores: ErrorIA[]): number {
	return errores.reduce((total, error) => total + (error.DuraciónMilisegundos ?? 0), 0);
}


function ObtenerConsultasFallidas(errores: ErrorIA[]): number {
	return errores.filter(error => error.Fuente !== 'Solicitud'
		&& error.Error !== MensajeConectorTextoAVozDesactivado).length;
}


function CrearMensajeErrorTextoAVoz(errores: ErrorConectorTextoAVoz[]): string {
	if (errores.length === 1 && errores[0].Fuente === 'Solicitud') return errores[0].Error;
	return `${errores.length} conector${errores.length !== 1 ? 'es' : ''} de texto a voz fall${errores.length !== 1 ? 'aron' : 'ó'}.`;
}


function NormalizarInstruccionesVoz(instruccionesVoz: string): string { // Normaliza las instrucciones de voz para el modelo de texto a voz y valida que no exceda el límite de carácteres.

	if (typeof instruccionesVoz !== 'string')
		throw new ErrorTextoAVozNoReintentable('InstruccionesVoz es obligatorio. Pasa al menos un espacio vacío.');
	const instruccionesNormalizadas = instruccionesVoz.trim();
	return instruccionesNormalizadas;

}


export function ResolverConector(modeloOConector: string, nombreCampo: string): ConectorTextoAVoz { // Resuelve el conector de texto a voz por su modelo-proveedor o modelo y lanza error si no existe.

	const nombre = modeloOConector.trim();
	if (!nombre) throw new ErrorTextoAVozNoReintentable(`${nombreCampo} es obligatorio.`);

	if (nombre in ConectoresTextoAVoz) return ConectoresTextoAVoz[nombre as keyof typeof ConectoresTextoAVoz];

	const conectorPorModelo = Object.values(ConectoresTextoAVoz).find(c => c.Modelo === nombre);
	if (conectorPorModelo) return conectorPorModelo;

	throw new ErrorTextoAVozNoReintentable(`${nombreCampo} de texto a voz no existe.`);

}


function ResolverRespaldoModeloOConector(respaldoModeloOConector: string | null, conectorPrincipal: ConectorTextoAVoz)
	: ConectorTextoAVoz | null { // Resuelve el conector de respaldo y solo impide repetir el principal. Las familias pueden diferir porque cada intento valida su propia voz antes de llamar al proveedor.

	if (respaldoModeloOConector === null) return null;
	if (typeof respaldoModeloOConector !== 'string') throw new ErrorTextoAVozNoReintentable('RespaldoModeloOConector debe ser texto.');
	const nombre = respaldoModeloOConector.trim();
	if (!nombre) return null;

	const conectorRespaldo = ResolverConector(nombre, 'RespaldoModeloOConector');
	if (conectorRespaldo.Nombre === conectorPrincipal.Nombre)
		throw new ErrorTextoAVozNoReintentable('RespaldoModeloOConector debe resolver a un conector distinto al principal.');
	return conectorRespaldo;

}


function NormalizarIdioma(idioma: string, proveedor: ProveedorTextoAVoz): string { // Normaliza el idioma para el modelo de texto a voz y valida que sea un código de idioma válido, según el proveedor.

	if (typeof idioma !== 'string' || idioma === '' || idioma.trim() !== idioma || idioma.length > 20)
		throw new ErrorTextoAVozNoReintentable('Idioma de texto a voz inválido.');

	const requiereLocaleCompleto = proveedor.Formato === 'Google Cloud TTS'; // Google Cloud Gemini-TTS publica idiomas como códigos BCP-47 completos.
	if (requiereLocaleCompleto && !idioma.includes('-'))
		throw new ErrorTextoAVozNoReintentable('Google Cloud TTS requiere idioma completo, por ejemplo es-MX.');

	const permiteIdiomaBase = proveedor.Formato !== 'Google Cloud TTS'; // Cloudflare y Together aceptan idioma base, DeepInfra no usa idioma.
	if (permiteIdiomaBase && idioma.split('-').length > 2)
		throw new ErrorTextoAVozNoReintentable('Los locales de tres partes no están soportados. Usa un idioma base o un locale de dos partes, por ejemplo es o es-MX.');
	if (permiteIdiomaBase && !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(idioma))
		throw new ErrorTextoAVozNoReintentable('Idioma debe ser código base o locale, por ejemplo es o es-MX.');

	return idioma;

}


function NormalizarVoz(voz: string, conector: ConectorTextoAVoz): string | null { // Normaliza la voz para el modelo de texto a voz y valida que sea una voz soportada por el grupo de voces del conector.

	if (conector.GrupoVoces === 'ninguno') return null;
	if (typeof voz !== 'string') throw new ErrorTextoAVozNoReintentable('Voz debe ser texto.');

	const vozNormalizada = voz.trim();
	if (!vozNormalizada) throw new ErrorTextoAVozNoReintentable('Voz es obligatoria.');

	switch (conector.GrupoVoces) {

		case 'gemini':
			if (!VocesGeminiTextoAVoz.includes(vozNormalizada as VozGemini))
				throw new ErrorTextoAVozNoReintentable('Voz de texto a voz no soportada.');
			return vozNormalizada;
		case 'kokoro':
			return NormalizarVozKokoro(vozNormalizada);
		default:
			throw new Error('GrupoVoces de texto a voz no soportado.');

	}

}


function NormalizarSegundosMáximos(segundosMáximos: number | undefined, nombreCampo: string): number {

	if (segundosMáximos === undefined) throw new ErrorTextoAVozNoReintentable(`${nombreCampo} es obligatorio.`);
	const valor = ExigirEnteroSeguroPositivo(segundosMáximos, `${nombreCampo} debe ser un entero seguro mayor que cero`);
	if (valor > SegundosMáximosSolicitudTextoAVoz)
		throw new ErrorTextoAVozNoReintentable(`${nombreCampo} no puede superar ${SegundosMáximosSolicitudTextoAVoz} segundos.`);
	return valor;

}


function NormalizarVelocidadReproducción(velocidadReproducción: number): number {

	if (typeof velocidadReproducción !== 'number' || !Number.isFinite(velocidadReproducción)
		|| velocidadReproducción <= 0 || velocidadReproducción > 3)
			throw new ErrorTextoAVozNoReintentable('VelocidadReproduccion debe ser un numero finito mayor que cero y máximo 3.');
	return velocidadReproducción;

}


export function ObtenerCosto(conector: ConectorTextoAVoz, carácteresEntrada: number, duraciónAudioSegundos: number): number {

	const precios = conector.Precios;
	if (duraciónAudioSegundos < 0 || (precios.MinutoAudio > 0 && duraciónAudioSegundos === 0))
		throw new Error('No se pudo calcular el costo de texto a voz porque la duración del audio es inválida.');

	const tókenesEntradaEstimados = Math.ceil(carácteresEntrada / FactorCarácteresATókenesTextoAVoz); // Estimación aproximada de 4 carácteres por tóken, para calcular el costo de entrada de texto. De todas maneras este costo es muy bajo comparado con el costo de audio.
	return (
		(duraciónAudioSegundos / 60) * precios.MinutoAudio +
		(tókenesEntradaEstimados * precios.MillónTókenesTextoEntrada) / 1_000_000 +
		(carácteresEntrada * precios.MillónCarácteresAudio) / 1_000_000
	);

}


function NormalizarConectoresDesactivados(conectoresDesactivados: readonly string[] | undefined): ReadonlySet<string> {

	if (conectoresDesactivados === undefined) return new Set<string>();
	if (!Array.isArray(conectoresDesactivados))
		throw new ErrorTextoAVozNoReintentable('ConectoresDesactivados debe ser una lista de nombres de conectores.');

	const conectoresNormalizados = new Set<string>();
	for (const nombreConector of conectoresDesactivados) {

		if (typeof nombreConector !== 'string' || nombreConector.trim() !== nombreConector || !(nombreConector in ConectoresTextoAVoz))
			throw new ErrorTextoAVozNoReintentable('ConectoresDesactivados contiene un conector de texto a voz inválido.');
		conectoresNormalizados.add(nombreConector);

	}
	return conectoresNormalizados;

}


async function EjecutarCadenaConectores(contexto: Contexto, conectores: ConectorTextoAVoz[], texto: string, instruccionesVoz: string,
	idioma: string, idiomaRespaldo: string | null, voz: string | null, vozRespaldo: string | null, velocidadReproducción: number,
	segundosMáximosPrincipal: number, segundosMáximosRespaldo: number, conectoresDesactivados: ReadonlySet<string>,
	permitirConector: ((nombreConector: string) => Promise<boolean>) | undefined, señal: AbortSignal)
	: Promise<ResultadoConectorTextoAVoz> { // Conserva la cadena original y selecciona los parámetros principales o de respaldo por índice. La voz, el idioma y las instrucciones cambian solo cuando el intento cambia de conector.

	const errores: ErrorConectorTextoAVoz[] = [];
	let unidadesInfracción: UnidadesInfracciónIA = 0;
	let fuenteInfracción: FuenteInfracciónIA | undefined;
	for (let índice = 0; índice < conectores.length; índice++) {

		const conector = conectores[índice];
		const proveedor = ProveedoresTextoAVoz[conector.Proveedor];
		const esRespaldo = índice > 0;
		const instruccionesAplicables = esRespaldo && proveedor.Formato !== 'Google Cloud TTS' ? '' : instruccionesVoz; // Las instrucciones solo se retiran para el respaldo que no las soporta. El intento principal mantiene la validación anterior y nunca cambia silenciosamente de proveedor.
		const idiomaAplicable = esRespaldo ? idiomaRespaldo! : idioma;
		const vozAplicable = esRespaldo ? vozRespaldo : voz;
		const segundosMáximosAplicables = esRespaldo ? segundosMáximosRespaldo : segundosMáximosPrincipal; // El cliente decide el tiempo de cada intento porque conoce la configuración concreta de lectura. El Worker solo validó antes que ambos valores respetaran el límite general de seguridad.
		const carácteresEntradaAplicables = texto.length + instruccionesAplicables.length;

		let conectorDesactivado = conectoresDesactivados.has(conector.Nombre);
		if (!conectorDesactivado && permitirConector !== undefined) conectorDesactivado = !(await permitirConector(conector.Nombre));
		if (conectorDesactivado) {

			errores.push({ Código: CódigoErrorIA.ProveedorNoDisponible, Fuente: conector.Nombre, 
				Error: MensajeConectorTextoAVozDesactivado, DuraciónMilisegundos: 0 });
			if (índice < conectores.length - 1) continue;
			RegistrarErroresConectoresTextoAVoz(contexto, errores);
			throw new ErrorTextoAVozConErrores(errores, undefined, unidadesInfracción, fuenteInfracción);

		}

		const inicioInferencia = Date.now();
		try {

			const audio = await EjecutarConector(contexto, proveedor, conector, texto, instruccionesAplicables, idiomaAplicable,
				vozAplicable, velocidadReproducción, segundosMáximosAplicables, señal);

			let duraciónAudioSegundos: number;
			try {
				duraciónAudioSegundos = ObtenerDuraciónAudio(contexto, audio, conector);
			} catch (errorAudio) {
				throw new ErrorProveedorTextoAVozReintentable(ObtenerMensajeError(errorAudio));
			}

			return { Audio: audio, DuraciónAudioSegundos: duraciónAudioSegundos,
				Proveedor: proveedor, Conector: conector, Idioma: idiomaAplicable,
				Voz: vozAplicable, CarácteresEntrada: carácteresEntradaAplicables,
				InferenciaMilisegundos: Math.max(1, Date.now() - inicioInferencia),
				UsadoConectorRespaldo: índice > 0, Errores: errores,
				UnidadesInfracción: unidadesInfracción, FuenteInfracción: fuenteInfracción };

		} catch (error) {

			const mensajeError = ObtenerMensajeError(error);
			if (error instanceof ErrorContenidoBloqueadoTextoAVoz && error.UnidadesInfracción > unidadesInfracción) {
				unidadesInfracción = error.UnidadesInfracción;
				fuenteInfracción = error.FuenteInfracción;
			}
			const esErrorClaveGoogleCloud = error instanceof ErrorClaveGoogleCloudNoValida;
			const esErrorConfiguración = esErrorClaveGoogleCloud || EsErrorConfiguraciónTextoAVoz(mensajeError);
			const esTiempoEsperaAgotado = mensajeError === MensajeTiempoEsperaAgotadoTextoAVoz;
			const esSolicitudCancelada = señal.aborted; // La cancelación del cliente debe tener prioridad sobre el timeout para no contar el cierre de la conexión como un fallo del proveedor ni intentar otros conectores.
			const código = error instanceof ErrorTextoAVozNoReintentable ? CódigoErrorIA.SolicitudInválida
				: esSolicitudCancelada ? CódigoErrorIA.SolicitudCancelada
					: error instanceof ErrorContenidoBloqueadoTextoAVoz ? CódigoErrorIA.ContenidoNoPermitido
					: esTiempoEsperaAgotado ? CódigoErrorIA.TiempoEsperaAgotado
						: esErrorConfiguración ? CódigoErrorIA.ConfiguraciónInválida : CódigoErrorIA.ProveedorNoDisponible;
			const errorConector: ErrorConectorTextoAVoz = {
				Código: código, Fuente: conector.Nombre,
				Error: esErrorConfiguración && !esErrorClaveGoogleCloud ? MensajeErrorConfiguraciónTextoAVoz
					: esSolicitudCancelada ? 'Solicitud cancelada por el usuario.' : mensajeError,
				DuraciónMilisegundos: Math.max(1, Date.now() - inicioInferencia)
			};
			errores.push(errorConector);
			if (esErrorConfiguración)
				console.error('Error interno de configuración de texto a voz al ejecutar un conector', { error: mensajeError });

			const esErrorNoReintentable = error instanceof ErrorTextoAVozNoReintentable; // Marca fallos de validación o capacidad que no deben saltar al respaldo.
			const esReintentable =
				esErrorConfiguración || esTiempoEsperaAgotado || error instanceof TypeError
				|| error instanceof ErrorProveedorTextoAVozReintentable
				|| /\bHTTP\s+\d{3}\b/i.test(errorConector.Error); // Igual que IA: la configuración puede ser específica del conector y el respaldo podría estar correctamente configurado.

			if (esErrorNoReintentable || esSolicitudCancelada || !esReintentable)
				throw new ErrorTextoAVozConErrores(errores, undefined, unidadesInfracción, fuenteInfracción);

			if (índice < conectores.length - 1) {

				RegistrarEventoConPrefijo(contexto, 'TextoAVoz.', 'ConectorPrincipalFallido',
					'El conector principal de texto a voz falló; se intentará el respaldo.',
					{ conector: conector.Nombre, error: errorConector.Error });
				continue;

			}
			RegistrarErroresConectoresTextoAVoz(contexto, errores);
			throw new ErrorTextoAVozConErrores(errores,
				error instanceof ErrorContenidoBloqueadoTextoAVoz ? MensajeContenidoNoPermitidoTextoAVoz
					: error instanceof ErrorProveedorTextoAVozReintentable && errores.length === 1 ? mensajeError : undefined,
				unidadesInfracción, fuenteInfracción);

		}

	}

	throw new ErrorTextoAVozConErrores([{ Código: CódigoErrorIA.ErrorInterno, Fuente: 'Solicitud', Error: 'No hay conectores de texto a voz disponibles.' }]);

}


function EsErrorConfiguraciónTextoAVoz(mensaje: string): boolean {

	return mensaje.startsWith('No está configurada la clave del proveedor de texto a voz')
		|| mensaje.startsWith('Clave de proveedor de texto a voz no soportada:')
		|| mensaje.startsWith('Formato de proveedor de texto a voz no soportado:')
		|| mensaje.startsWith('GrupoVoces de texto a voz no soportado.');

}


function RegistrarErroresConectoresTextoAVoz(contexto: Contexto, errores: ErrorConectorTextoAVoz[]): void {

	if (errores.length < 2) return;
	RegistrarEventoConPrefijo(contexto, 'TextoAVoz.', 'ConectoresFallidos', 'Fallaron todos los conectores de texto a voz.',
		{ conectores: errores.map(error => error.Fuente).join(','), errores: JSON.stringify(errores).slice(0, 1000) });

}


async function EjecutarConector(contexto: Contexto, proveedor: ProveedorTextoAVoz, conector: ConectorTextoAVoz, texto: string,
	instruccionesVoz: string, idioma: string, voz: string | null, velocidadReproducción: number, segundosMáximos: number,
	señal: AbortSignal): Promise<Uint8Array> { // Ejecuta un conector de texto a voz y devuelve el audio resultante o lanza error si falla.

	if (instruccionesVoz && proveedor.Formato !== 'Google Cloud TTS')
		throw new ErrorTextoAVozNoReintentable(`InstruccionesVoz no está soportado por ${proveedor.Formato}.`);

	return EjecutarConTiempoMáximo(segundosMáximos, señal, señalConTiempoMáximo => {

		let consulta: Promise<Uint8Array>;
		switch (proveedor.Formato) {

			case 'Cloudflare Workers AI':
				consulta = LlamarCloudflare(contexto, conector, texto, ObtenerIdiomaBase(idioma), señalConTiempoMáximo);
				break;
			case 'Google Gemini Interactions':
				throw new Error('Google Gemini Interactions no está habilitado para texto a voz. Usa Google Cloud TTS.'); // Deshabilitado porque genera archivos WAV que no son tan convenientes como los MP3 que genera Google Cloud TTS. La implementación está en el historial de Web Core, en la confirmación 7169683.
			case 'Google Cloud TTS':
				consulta = LlamarGoogleCloudTTS(contexto, proveedor, conector, texto, instruccionesVoz, idioma, ExigirVoz(voz),
					velocidadReproducción, señalConTiempoMáximo);
				break;
			case 'Together Speech':
				consulta = LlamarTogether(contexto, proveedor, conector, texto, ObtenerIdiomaBase(idioma), ExigirVoz(voz),
					velocidadReproducción, señalConTiempoMáximo);
				break;
			case 'DeepInfra Inference':
				consulta = LlamarDeepInfra(contexto, proveedor, conector, texto, ExigirVoz(voz), velocidadReproducción,
					señalConTiempoMáximo);
				break;
			default:
				throw new Error(`Formato de proveedor de texto a voz no soportado: ${proveedor.Formato}`);

		}

		return consulta;

	});

}


function ExigirVoz(voz: string | null): string {
	if (!voz) throw new ErrorTextoAVozNoReintentable('Voz es obligatoria.');
	return voz;
}


function ObtenerIdiomaBase(idioma: string): string {
	return idioma.split('-')[0];
}


async function EjecutarConTiempoMáximo<T>(segundosMáximos: number, señal: AbortSignal,
	consultar: (señalConTiempoMáximo: AbortSignal) => Promise<T>): Promise<T> {

	let idTemporizador: ReturnType<typeof setTimeout> | null = null;
	const controladorTiempoMáximo = new AbortController();
	const señalConTiempoMáximo = AbortSignal.any([controladorTiempoMáximo.signal, señal]);

	try {

		idTemporizador = setTimeout(() =>
			controladorTiempoMáximo.abort(new Error(MensajeTiempoEsperaAgotadoTextoAVoz)), segundosMáximos * 1000);
		return await consultar(señalConTiempoMáximo);

	} finally {
		if (idTemporizador !== null) clearTimeout(idTemporizador);
	}

}


function ObtenerClaveApi(contexto: Contexto, proveedor: ProveedorTextoAVoz): string {

	let clave: string;
	if (proveedor.Clave === '') return '';
	if (proveedor.Clave === 'CLAVE_GOOGLE') clave = contexto.Entorno.CLAVE_GOOGLE;
	else if (proveedor.Clave === 'CLAVE_TOGETHER') clave = contexto.Entorno.CLAVE_TOGETHER;
	else if (proveedor.Clave === 'CLAVE_DEEPINFRA') clave = contexto.Entorno.CLAVE_DEEPINFRA;
	else throw new Error(`Clave de proveedor de texto a voz no soportada: ${proveedor.Clave}`);

	if (typeof clave !== 'string' || clave.trim() === '')
		throw new Error(`No está configurada la clave del proveedor de texto a voz ${proveedor.Nombre}.`);

	return clave.trim();

}


// #region Cloudflare Workers AI

type SalidaMeloTTS = RespuestaMeloTTS | Uint8Array | ArrayBuffer;

interface RespuestaMeloTTS {
	audio?: string;
}

async function LlamarCloudflare(contexto: Contexto, conector: ConectorTextoAVoz, texto: string, idioma: string,
	señal: AbortSignal): Promise<Uint8Array> {

	if (señal.aborted) throw new Error('La operación se abortó antes de empezar.');
	const promesaAI = contexto.Entorno.IA.run(conector.Modelo as keyof AiModels,
		{ prompt: texto, lang: idioma } as never) as Promise<SalidaMeloTTS>;
	let rechazarAborto!: (error: Error) => void;
	const promesaAborto = new Promise<never>((_, rechazar) => { rechazarAborto = rechazar; });
	const alAbortar = (): void => rechazarAborto(new Error(ObtenerMensajeError(señal.reason)));
	señal.addEventListener('abort', alAbortar, { once: true });
	try {
		const respuesta = await Promise.race([promesaAI, promesaAborto]);
		return ObtenerAudioMeloTTS(respuesta);
	} finally {
		señal.removeEventListener('abort', alAbortar);
	}

}


function ObtenerAudioMeloTTS(respuesta: SalidaMeloTTS): Uint8Array {

	if (respuesta instanceof Uint8Array) return respuesta;
	if (respuesta instanceof ArrayBuffer) return new Uint8Array(respuesta);

	const audioBase64 = respuesta?.audio;
	if (typeof audioBase64 !== 'string' || audioBase64.trim() === '') throw new Error('El modelo de texto a voz no devolvió audio.');
	return DecodificarBase64(audioBase64);

}

// #endregion


// #region Google Cloud TTS

type VozGemini = typeof VocesGeminiTextoAVoz[number];

interface RespuestaGoogleCloudTTS {
	audioContent?: string;
	error?: {
		message?: string;
		code?: string | number;
		status?: string;
	};
}

interface RespuestaLeídaGoogleCloudTTS {
	DatosJson: RespuestaGoogleCloudTTS;
	CuerpoCrudo: string;
}

const CódigosBloqueoDuroGoogleCloudTTS = [
	'62263041', // Contenido peligroso.
	'57734940', // Acoso.
	'90789179', // Contenido sexual explícito.
	'78610348', // Discurso de odio.
] as const; // Códigos documentados por Gemini-TTS: https://docs.cloud.google.com/text-to-speech/docs/gemini-tts. El código no especificado 54702341 y los desconocidos permanecen como errores operativos con cero unidades.


interface RespuestaTokenGoogleCloud {
	access_token?: string;
	token_type?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
}

interface CacheTokenGoogleCloud {
	Token: string;
	ExpiraEn: number;
	CorreoCliente: string;
}

const MargenExpiraciónTokenGoogleCloudMs = 60 * 1000;

const TtlTokenGoogleCloudPorDefectoMs = 50 * 60 * 1000;

const MilisegundosTiempoEsperaTokenGoogleCloud = 10 * 1000;

let CacheTokenGoogleCloud: CacheTokenGoogleCloud | null = null;

let PromesaTokenGoogleCloud: Promise<string> | null = null;

let CorreoPromesaTokenGoogleCloud: string | null = null;


async function LlamarGoogleCloudTTS(contexto: Contexto, proveedor: ProveedorTextoAVoz, conector: ConectorTextoAVoz, texto: string,
	instruccionesVoz: string, idioma: string, voz: string, velocidadReproducción: number, señal: AbortSignal)
	: Promise<Uint8Array> {

	const tokenAcceso = await ObtenerTokenAccesoGoogleCloud(contexto);
	const respuesta = await fetch(proveedor.Url, {
		method: 'POST',
		signal: señal,
		headers: {
			'authorization': `Bearer ${tokenAcceso}`,
			'content-type': 'application/json',
			'x-goog-user-project': ObtenerIdProyectoGoogleCloud(contexto)
		},
		body: JSON.stringify({
			input: {
				text: texto,
				...(instruccionesVoz ? { prompt: instruccionesVoz } : {})
			},
			voice: {
				languageCode: idioma,
				name: voz,
				model_name: conector.Modelo
			},
			audioConfig: {
				audioEncoding: 'MP3',
				speakingRate: velocidadReproducción
			}
		})
	});

	const respuestaLeída = await LeerRespuestaGoogleCloudTTS(respuesta);
	const datos = respuestaLeída.DatosJson;
	if (!respuesta.ok) {

		const códigoBloqueo = ExtraerCódigoBloqueoDuroGoogleCloudTTS(datos, respuestaLeída.CuerpoCrudo);
		if (códigoBloqueo !== null)
			throw new ErrorContenidoBloqueadoTextoAVoz(`Google Cloud TTS bloqueó el contenido. Código de soporte: ${códigoBloqueo}.`,
				3,
				{ Conector: conector.Nombre, Proveedor: conector.Proveedor, Modelo: conector.Modelo, Señal: `support_code:${códigoBloqueo}`,
					EstadoHttp: respuesta.status });

		throw new Error(ObtenerMensajeErrorGoogleCloudTTS(datos, respuesta.status));

	}
	try {
		return ObtenerAudioGoogleCloudTTS(datos);
	} catch (error) {
		throw new ErrorProveedorTextoAVozReintentable(ObtenerMensajeError(error));
	}

}


async function ObtenerTokenAccesoGoogleCloud(contexto: Contexto): Promise<string> {

	const correoCliente = ObtenerCorreoClienteGoogleCloud(contexto);
	const ahora = Date.now();
	if (CacheTokenGoogleCloud && CacheTokenGoogleCloud.CorreoCliente === correoCliente && CacheTokenGoogleCloud.ExpiraEn > ahora)
		return CacheTokenGoogleCloud.Token;

	if (!PromesaTokenGoogleCloud || CorreoPromesaTokenGoogleCloud !== correoCliente) {

		CorreoPromesaTokenGoogleCloud = correoCliente;
		PromesaTokenGoogleCloud = CargarTokenAccesoGoogleCloud(contexto, correoCliente,
			AbortSignal.timeout(MilisegundosTiempoEsperaTokenGoogleCloud)).finally(() => { // Esta carga obtiene un token que pueden usar varias solicitudes al mismo tiempo. Por eso no debe depender del aviso de cancelación de un solo cliente, porque si ese cliente cierra la conexión se cancelaría también para los demás que todavía esperan el token. El límite de tiempo propio permite que la carga continúe aunque el primer cliente se desconecte y evita que quede esperando indefinidamente.
			PromesaTokenGoogleCloud = null;
			CorreoPromesaTokenGoogleCloud = null;
		});

	}
	return await PromesaTokenGoogleCloud;

}


async function CargarTokenAccesoGoogleCloud(contexto: Contexto, correoCliente: string, señal: AbortSignal): Promise<string> {

	const jwt = await CrearJwtGoogleCloud(contexto, correoCliente);
	const cuerpo = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt });
	const respuesta = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: señal,
		headers: {'content-type': 'application/x-www-form-urlencoded'}, body: cuerpo });
	const datos = await LeerRespuestaJsonTokenGoogleCloud(respuesta);
	if (!respuesta.ok) throw new Error(ObtenerMensajeErrorTokenGoogleCloud(datos, respuesta.status));
	const token = datos.access_token;
	if (typeof token !== 'string' || token.trim() === '') throw new Error('Google Cloud OAuth no devolvió access_token.');
	const ttlMs = ObtenerTtlTokenGoogleCloud(datos);
	CacheTokenGoogleCloud = { Token: token, ExpiraEn: Date.now() + ttlMs, CorreoCliente: correoCliente };
	return token;

}


function ObtenerTtlTokenGoogleCloud(datos: RespuestaTokenGoogleCloud): number {

	const segundos = datos.expires_in;
	if (typeof segundos !== 'number' || !Number.isFinite(segundos) || segundos <= 0) return TtlTokenGoogleCloudPorDefectoMs;
	return Math.max(0, segundos * 1000 - MargenExpiraciónTokenGoogleCloudMs);

}


async function CrearJwtGoogleCloud(contexto: Contexto, correoCliente: string): Promise<string> {

	const ahora = Math.floor(Date.now() / 1000);
	const cabecera = CodificarBase64UrlTexto(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const carga = CodificarBase64UrlTexto(JSON.stringify({ iss: correoCliente,
		scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', exp: ahora + 3600,
		iat: ahora }));
	const contenido = `${cabecera}.${carga}`;
	const clave = await ImportarClavePrivadaGoogleCloud(contexto);
	const firma = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, clave, new TextEncoder().encode(contenido));
	return `${contenido}.${CodificarBase64UrlBytes(new Uint8Array(firma))}`;

}


async function ImportarClavePrivadaGoogleCloud(contexto: Contexto): Promise<CryptoKey> {

	const clavePrivada = ObtenerClavePrivadaGoogleCloud(contexto);
	const base64 = clavePrivada.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '')
		.replace(/\s/g, '');
	if (!base64) throw new Error('CLAVE_GOOGLE_CLOUD no contiene una clave privada PEM válida.');
	try {

		const bytes = DecodificarBase64(base64);
		const datosClave = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
		return await crypto.subtle.importKey('pkcs8', datosClave, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);

	} catch {
		throw new ErrorClaveGoogleCloudNoValida();
	}

}


function ObtenerIdProyectoGoogleCloud(contexto: Contexto): string {

	const valor = contexto.Entorno.ID_PROYECTO_GOOGLE_CLOUD.trim();
	if (!valor) throw new Error('No está configurado ID_PROYECTO_GOOGLE_CLOUD.');
	return valor;

}


function ObtenerCorreoClienteGoogleCloud(contexto: Contexto): string {

	const valor = contexto.Entorno.CORREO_CLIENTE_GOOGLE_CLOUD.trim();
	if (!valor) throw new Error('No está configurado CORREO_CLIENTE_GOOGLE_CLOUD.');
	return valor;

}


function ObtenerClavePrivadaGoogleCloud(contexto: Contexto): string {

	const valor = contexto.Entorno.CLAVE_GOOGLE_CLOUD.replace(/\\n/g, '\n').trim();
	if (!valor) throw new Error('No está configurada CLAVE_GOOGLE_CLOUD.');
	return valor;

}


async function LeerRespuestaGoogleCloudTTS(respuesta: Response): Promise<RespuestaLeídaGoogleCloudTTS> {

	const cuerpo = await respuesta.text().catch(() => '');
	if (!cuerpo.trim()) return { DatosJson: {}, CuerpoCrudo: '' };
	try {

		const datos = JSON.parse(cuerpo) as unknown;
		return { DatosJson: datos !== null && typeof datos === 'object' && !Array.isArray(datos)
			? datos as RespuestaGoogleCloudTTS : {}, CuerpoCrudo: cuerpo };

	} catch {
		return { DatosJson: {}, CuerpoCrudo: cuerpo };
	}

}


function ExtraerCódigoBloqueoDuroGoogleCloudTTS(datos: RespuestaGoogleCloudTTS, cuerpo: string): string | null {

	const valores = [datos.error?.message, datos.error?.status, datos.error?.code, cuerpo]
		.filter((valor): valor is string | number => typeof valor === 'string' || typeof valor === 'number')
		.map(valor => String(valor));
	for (const código of CódigosBloqueoDuroGoogleCloudTTS)
		if (valores.some(valor => valor.includes(código))) return código;
	return null;

}


async function LeerRespuestaJsonTokenGoogleCloud(respuesta: Response): Promise<RespuestaTokenGoogleCloud> {

	try {
		return await respuesta.json<RespuestaTokenGoogleCloud>();
	} catch {
		return {};
	}

}


function ObtenerMensajeErrorTokenGoogleCloud(datos: RespuestaTokenGoogleCloud, estadoHttp: number): string {

	const mensaje = datos.error_description ?? datos.error;
	if (mensaje) return `Google Cloud OAuth HTTP ${estadoHttp}: ${mensaje}`;
	return `Google Cloud OAuth HTTP ${estadoHttp}.`;

}


function ObtenerMensajeErrorGoogleCloudTTS(datos: RespuestaGoogleCloudTTS, estadoHttp: number): string {

	const mensaje = datos.error?.message ?? datos.error?.status ?? datos.error?.code;
	if (mensaje) return `Google Cloud TTS texto a voz HTTP ${estadoHttp}: ${mensaje}`;
	return `Google Cloud TTS texto a voz HTTP ${estadoHttp}.`;

}


function ObtenerAudioGoogleCloudTTS(datos: RespuestaGoogleCloudTTS): Uint8Array {

	const audioBase64 = datos.audioContent;
	if (typeof audioBase64 !== 'string' || audioBase64.trim() === '')
		throw new Error('Google Cloud TTS texto a voz no devolvió audioContent.');
	return DecodificarBase64(audioBase64);

}

// #endregion


// #region Together Speech

async function LlamarTogether(contexto: Contexto, proveedor: ProveedorTextoAVoz, conector: ConectorTextoAVoz, texto: string,
	idioma: string, voz: string, velocidadReproducción: number, señal: AbortSignal): Promise<Uint8Array> {

	const claveApi = ObtenerClaveApi(contexto, proveedor);
	const cuerpo: Record<string, unknown> = { model: conector.Modelo, input: texto, voice: voz, language: idioma, response_format: 'mp3',
		stream: false, speed: velocidadReproducción };
	const respuesta = await fetch(`${proveedor.Url}/audio/speech`, { method: 'POST', signal: señal,
		headers: { 'authorization': `Bearer ${claveApi}`, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });

	if (!respuesta.ok) throw new Error(await ObtenerMensajeErrorTogether(respuesta));
	return new Uint8Array(await respuesta.arrayBuffer());

}


async function ObtenerMensajeErrorTogether(respuesta: Response): Promise<string> {

	const cuerpo = await respuesta.text().catch(() => '');
	if (!cuerpo.trim()) return `Together texto a voz HTTP ${respuesta.status}.`;
	try {

		const datos = JSON.parse(cuerpo) as { error?: { message?: string; code?: string | number; }; message?: string; };
		const mensaje = datos.error?.message ?? datos.error?.code ?? datos.message;
		if (mensaje) return `Together texto a voz HTTP ${respuesta.status}: ${mensaje}`;

	} catch { // Together puede devolver texto plano cuando falla antes de serializar JSON.
	}
	return `Together texto a voz HTTP ${respuesta.status}: ${cuerpo.slice(0, 800)}`;

}

// #endregion


// #region DeepInfra Inference

interface RespuestaDeepInfra {
	audio?: string | null;
	request_id?: string | null;
	output_format?: string;
	error?: string | { message?: string; };
	detail?: string;
	message?: string;
	inference_status?: {
		status?: string;
		runtime_ms?: number;
		cost?: number;
		output_length?: number;
	};
}


async function LlamarDeepInfra(contexto: Contexto, proveedor: ProveedorTextoAVoz, conector: ConectorTextoAVoz, texto: string,
	voz: string, velocidadReproducción: number, señal: AbortSignal): Promise<Uint8Array> {

	const claveApi = ObtenerClaveApi(contexto, proveedor);
	const respuesta = await fetch(`${proveedor.Url}/inference/${conector.Modelo}`, {
		method: 'POST',
		signal: señal,
		headers: {
			'authorization': `bearer ${claveApi}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			text: texto,
			output_format: 'mp3',
			preset_voice: ObtenerPartesVozKokoro(voz),
			speed: velocidadReproducción,
			stream: false
		})
	});

	const datos = await LeerRespuestaJsonDeepInfra(respuesta);
	if (!respuesta.ok) throw new Error(ObtenerMensajeErrorDeepInfra(datos, respuesta.status));
	try {
		return ObtenerAudioDeepInfra(datos);
	} catch (error) {
		throw new ErrorProveedorTextoAVozReintentable(ObtenerMensajeError(error));
	}

}


async function LeerRespuestaJsonDeepInfra(respuesta: Response): Promise<RespuestaDeepInfra> {

	try {
		return await respuesta.json<RespuestaDeepInfra>();
	} catch {
		return {};
	}

}


function ObtenerMensajeErrorDeepInfra(datos: RespuestaDeepInfra, estadoHttp: number): string {

	const mensajeError = typeof datos.error === 'string' ? datos.error : datos.error?.message;
	const mensaje = mensajeError ?? datos.detail ?? datos.message ?? datos.inference_status?.status;
	if (mensaje) return `DeepInfra texto a voz HTTP ${estadoHttp}: ${mensaje}`;
	return `DeepInfra texto a voz HTTP ${estadoHttp}.`;

}


function ObtenerAudioDeepInfra(datos: RespuestaDeepInfra): Uint8Array {

	const audioBase64 = datos.audio;
	if (typeof audioBase64 !== 'string' || audioBase64.trim() === '')
		throw new Error(`DeepInfra texto a voz no devolvió audio. Forma recibida: ${DescribirFormaDeepInfra(datos)}`);
	return DecodificarBase64(ExtraerBase64(audioBase64));

}


function DescribirFormaDeepInfra(datos: RespuestaDeepInfra): string {

	return JSON.stringify({
		TieneAudio: typeof datos.audio === 'string' && datos.audio.length > 0,
		OutputFormat: datos.output_format ?? '',
		RequestId: datos.request_id ?? '',
		Status: datos.inference_status?.status ?? ''
	}).slice(0, 800);

}


function ObtenerPartesVozKokoro(voz: string): VozKokoro[] {

	const partes = NormalizarVozKokoro(voz).split('+');
	if (partes.some(parte => parte.includes('(')))
		throw new ErrorTextoAVozNoReintentable('DeepInfra Kokoro no soporta pesos por voz en preset_voice.');
	return partes as VozKokoro[];

}

// #endregion


// #region Kokoro

type VozKokoro = typeof VocesKokoroTextoAVoz[number];

function NormalizarVozKokoro(voz: string): string {

	const partes = voz.split('+').map(parte => parte.trim());
	if (partes.length === 0 || partes.some(parte => parte === ''))
		throw new ErrorTextoAVozNoReintentable('Voz de texto a voz inválida.');
	return partes.map(NormalizarParteVozKokoro).join('+');

}


function NormalizarParteVozKokoro(parte: string): string {

	const coincidencia = parte.match(/^([a-z]{2}_[a-z0-9_]+)(?:\((\d+(?:\.\d+)?)\))?$/);
	if (!coincidencia) throw new ErrorTextoAVozNoReintentable('Voz de texto a voz inválida.');
	const nombre = coincidencia[1];
	if (!VocesKokoroTextoAVoz.includes(nombre as VozKokoro))
		throw new ErrorTextoAVozNoReintentable('Voz de texto a voz no soportada.');
	const peso = coincidencia[2];
	if (peso !== undefined && Number(peso) <= 0) throw new ErrorTextoAVozNoReintentable('Voz de texto a voz inválida.');
	return peso === undefined ? nombre : `${nombre}(${peso})`;

}

// #endregion


// #region Audio

function ObtenerDuraciónAudio(contexto: Contexto, audio: Uint8Array, conector: ConectorTextoAVoz): number {

	if (audio.byteLength === 0) throw new Error('El modelo de texto a voz devolvió audio vacío.');
	if (conector.TipoContenido === 'audio/wav')
		throw new Error("La duración del audio en formato WAV no está habilitada. Descomenta ObtenerDuraciónWav() y las funciones relacionadas."); // ? ObtenerDuraciónWav(audio):
	return ObtenerDuraciónMp3(contexto, audio, conector);

}


function ObtenerDuraciónMp3(contexto: Contexto, audio: Uint8Array, conector: ConectorTextoAVoz): number {

	const inicio = ObtenerInicioMpeg(audio);
	const encabezado = LeerEncabezadoMp3(audio, inicio);
	if (!encabezado) throw new Error('No se pudo determinar la duración del audio MP3.');
	const offsetInformacion = inicio + 4 + (encabezado.Versión === 3
		? (encabezado.EsMono ? 17 : 32) : (encabezado.EsMono ? 9 : 17));
	const marcadorVbr = LeerAscii(audio, offsetInformacion, 4);
	if (marcadorVbr === 'Xing' || marcadorVbr === 'Info') { // Info es el mismo encabezado que Xing, pero en un MP3 de tasa constante, y es el que traen los audios de Together. Antes se trataba como un VBR no compatible: la duración fallaba y salía una alerta crítica. Lo cuida la prueba 'Error arreglado: calcula la duración usando frames Info de Together sin alerta crítica' de pruebas/ligeras/texto-a-voz-mp3.test.ts.

		const duraciónXing = ObtenerDuraciónXing(audio, offsetInformacion, encabezado, audio.byteLength - inicio);
		if (duraciónXing !== null) return duraciónXing;
		AlertarMP3VbrNoCalculable(contexto, conector, marcadorVbr,
			`El encabezado ${marcadorVbr} no contiene un número de frames válido y compatible con el tamaño del audio.`, encabezado,
			audio.byteLength);
		throw new Error(`El audio MP3 con encabezado ${marcadorVbr} no se puede calcular su duración con este método.`);

	}

	if (LeerAscii(audio, inicio + 32, 4) === 'VBRI') {

		AlertarMP3VbrNoCalculable(contexto, conector, marcadorVbr || 'VBRI',
			'El encabezado MP3 usa un formato VBR no compatible con el cálculo actual.', encabezado, audio.byteLength);
		throw new Error('El audio MP3 es de bitrate variable y no se puede calcular su duración con este método.');

	}

	return (audio.byteLength - inicio) * 8 / (encabezado.Bitrate * 1000);

}


function ObtenerDuraciónXing(audio: Uint8Array, offsetInformacion: number,
	encabezado: { Bitrate: number; Versión: number; FrecuenciaMuestreo: number; }, bytesAudioMpeg: number): number | null {

	const flags = LeerEntero32Grande(audio, offsetInformacion + 4);
	const frames = LeerEntero32Grande(audio, offsetInformacion + 8);
	if (flags === null || frames === null || (flags & 1) === 0 || frames <= 0 || encabezado.FrecuenciaMuestreo <= 0) return null;
	const factorLongitudFrame = encabezado.Versión === 3 ? 144 : 72;
	const bitrateMínimo = encabezado.Versión === 3 ? 32 : 8;
	const bytesPrimerFrame = Math.floor(factorLongitudFrame * encabezado.Bitrate * 1000 / encabezado.FrecuenciaMuestreo);
	const bytesMínimosPorFrame = Math.floor(factorLongitudFrame * bitrateMínimo * 1000 / encabezado.FrecuenciaMuestreo);
	if (bytesPrimerFrame + frames * bytesMínimosPorFrame > bytesAudioMpeg) return null;
	const muestrasPorFrame = encabezado.Versión === 3 ? 1152 : 576;
	const duración = frames * muestrasPorFrame / encabezado.FrecuenciaMuestreo;
	return Number.isFinite(duración) && duración > 0 ? duración : null;

}


function AlertarMP3VbrNoCalculable(contexto: Contexto, conector: ConectorTextoAVoz, marcador: string, motivo: string,
	encabezado: { Bitrate: number; }, bytesAudio: number): void {

	EnviarAlertaErrorCrítico(contexto, 'TextoAVozMP3VBR',
		'Se detectó audio MP3 VBR en texto a voz. No se pudo calcular la duración del audio.',
		JSON.stringify({ Conector: conector.Nombre, Modelo: conector.Modelo, Marcador: marcador, Motivo: motivo,
			BitratePrimerFrameKbps: encabezado.Bitrate, BytesAudio: bytesAudio }));

}


function ObtenerInicioMpeg(audio: Uint8Array): number {

	return audio.byteLength > 10 && LeerAscii(audio, 0, 3) === 'ID3'
		? 10 + ((audio[6] & 0x7f) << 21) + ((audio[7] & 0x7f) << 14) + ((audio[8] & 0x7f) << 7) + (audio[9] & 0x7f)
		: 0;

}


function LeerEncabezadoMp3(audio: Uint8Array, posición: number)
	: {Bitrate: number; Versión: number; FrecuenciaMuestreo: number; EsMono: boolean; } | null {

	if (posición + 4 > audio.byteLength || audio[posición] !== 0xff || (audio[posición + 1] & 0xe0) !== 0xe0) return null;
	const versión = (audio[posición + 1] >> 3) & 0x03;
	const capa = (audio[posición + 1] >> 1) & 0x03;
	const índiceBitrate = (audio[posición + 2] >> 4) & 0x0f;
	if (versión === 1 || capa !== 1 || índiceBitrate === 0 || índiceBitrate === 15) return null;
	const bitrate = ObtenerBitrateMp3(versión, índiceBitrate);
	const índiceFrecuenciaMuestreo = (audio[posición + 2] >> 2) & 0x03;
	return bitrate > 0 ? { Bitrate: bitrate, Versión: versión,
		FrecuenciaMuestreo: ObtenerFrecuenciaMuestreoMp3(versión, índiceFrecuenciaMuestreo),
		EsMono: ((audio[posición + 3] >> 6) & 0x03) === 3 } : null;

}


function ObtenerBitrateMp3(versión: number, índice: number): number {

	const mpeg1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
	const mpeg2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
	const tabla = versión === 3 ? mpeg1 : mpeg2;
	if (índice < 0 || índice >= tabla.length) return 0;
	return tabla[índice];

}


function ObtenerFrecuenciaMuestreoMp3(versión: number, índice: number): number {

	const mpeg1 = [44100, 48000, 32000];
	const mpeg2 = [22050, 24000, 16000];
	const mpeg25 = [11025, 12000, 8000];
	const tabla = versión === 3 ? mpeg1 : versión === 2 ? mpeg2 : versión === 0 ? mpeg25 : [];
	return tabla[índice] ?? 0;

}


function LeerEntero32Grande(origen: Uint8Array, posición: number): number | null {
	if (posición < 0 || posición + 4 > origen.byteLength) return null;
	return ((origen[posición] * 256 + origen[posición + 1]) * 256 + origen[posición + 2]) * 256 + origen[posición + 3];
}


function LeerAscii(origen: Uint8Array, inicio: number, longitud: number): string {

	let texto = '';
	for (let i = 0; i < longitud && inicio + i < origen.byteLength; i++) texto += String.fromCharCode(origen[inicio + i]);
	return texto;

}


function ExtraerBase64(valor: string): string {

	const limpio = valor.trim();
	const índiceComa = limpio.indexOf(',');
	return limpio.startsWith('data:') && índiceComa >= 0 ? limpio.slice(índiceComa + 1) : limpio;

}

// #endregion
