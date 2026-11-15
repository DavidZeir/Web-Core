import { type Contexto, ObtenerMensajeError, Sanear } from '../../nucleo/global';
import { ErrorTextoAVozNoReintentable, GenerarTextoAVozDirecto } from '../../nucleo/texto-a-voz';
import { VocesGeminiTextoAVoz, VocesKokoroTextoAVoz } from '../../configuracion';
import { CargarHtmlLocal, CrearRespuestaBinaria, EstadoError, ResponderErrorConMarco, ResponderHtmlConNonce,
	ResponderSoloGetYPostPermitidos, TipoError } from '../../nucleo/respuestas';
import HtmlEjemploTextoAVozCompilado from '../../../static/html/ejemplo-texto-a-voz.html';


const MarcadorOpcionesVocesTextoAVoz = '[[opciones-voces-texto-a-voz]]';
const VocesKokoroCombinadasEjemploTextoAVoz = [ 
	'em_alex+ef_dora',
	'em_santa+ef_dora',
	'em_alex+em_santa',
	'em_alex+em_santa+ef_dora'
] as const;


export async function EjemploTextoAVoz(contexto: Contexto): Promise<Response> {

	if (contexto.Autenticación?.Usuario?.Rol !== 'Administrador')
		return ResponderErrorConMarco(contexto, 'Ingresa con la cuenta del administrador para probar texto a voz.',
			TipoError.Autenticación, false, null, EstadoError.NoAutorizado);

	if (contexto.Solicitud.method === 'GET') return ResponderPaginaEjemploTextoAVoz(contexto);
	if (contexto.Solicitud.method !== 'POST') return ResponderSoloGetYPostPermitidos(contexto);

	try {

		const cuerpo = await LeerCuerpoEjemploTextoAVoz(contexto);
		const texto = LeerTextoRequerido(cuerpo.Texto, 'Texto es obligatorio.');
		const instruccionesVoz = cuerpo.InstruccionesVoz;
		const idioma = LeerTextoRequerido(cuerpo.Idioma, 'Idioma es obligatorio.'); // El núcleo decide si ese proveedor acepta idioma base o exige locale.
		const modeloOConector = LeerTextoRequerido(cuerpo.ModeloOConector, 'ModeloOConector es obligatorio.');
		const voz = cuerpo.Voz;
		const velocidadReproducción = cuerpo.VelocidadReproduccion;

		const resultado = await GenerarTextoAVozDirecto(contexto, { Texto: texto, InstruccionesVoz: instruccionesVoz,
			Idioma: idioma, ModeloOConector: modeloOConector, RespaldoModeloOConector: null, Voz: voz, VozRespaldo: null,
			VelocidadReproducción: velocidadReproducción, SegundosMáximosPrincipal: 60, SegundosMáximosRespaldo: 60 });
		if (resultado.Tipo === 'Error') {

			const detalles = resultado.Errores.map(error => {

				const duracion = error.DuraciónMilisegundos === undefined ? ''
					: `<br>Duración: ${Sanear(String(error.DuraciónMilisegundos))} ms`;
				return `Código: ${Sanear(String(error.Código))}<br>Conector: ${Sanear(error.Fuente)}<br>Detalle: ${Sanear(error.Error)}${duracion}`;

			}).join('<br><br>');
			const contenidoError = `${Sanear(resultado.Texto)}${detalles ? `<br><br>${detalles}` : ''}`;
			const mensajeError = `<span style="display:block;max-height:70vh;overflow:auto;overflow-wrap:anywhere;white-space:normal;font-size:var(--texto-xs);line-height:var(--interlineado-m);text-align:left;">${contenidoError}</span>`;
			return ResponderErrorConMarco(contexto, mensajeError, TipoError.Api, true, null, EstadoError.ErrorServidor);

		}
		const cabeceras = new Headers();
		cabeceras.set('Cache-Control', 'no-store');
		cabeceras.set('Content-Disposition', `attachment; filename="${CrearNombreArchivo(resultado)}"`);
		cabeceras.set('X-Proveedor-Texto-A-Voz', resultado.Proveedor);
		cabeceras.set('X-Conector-Texto-A-Voz', resultado.Conector);
		cabeceras.set('X-Modelo-Texto-A-Voz', resultado.Modelo);
		cabeceras.set('X-Idioma-Texto-A-Voz', resultado.Idioma);
		if (resultado.Voz) cabeceras.set('X-Voz-Texto-A-Voz', resultado.Voz);
		cabeceras.set('X-Velocidad-Reproduccion-Texto-A-Voz', String(velocidadReproducción));
		cabeceras.set('X-Caracteres-Entrada', String(resultado.CarácteresEntrada));
		cabeceras.set('X-Duracion-Audio-Segundos', String(resultado.DuraciónAudioSegundos));
		cabeceras.set('X-Costo-Dolares-Texto-A-Voz', String(resultado.CostoDólares));
		cabeceras.set('X-Inferencia-Milisegundos', String(resultado.InferenciaMilisegundos));

		return CrearRespuestaBinaria(contexto, resultado.Audio as BodyInit, resultado.TipoContenido, 200, cabeceras);

	} catch (error) {
		return ResponderErrorConMarco(contexto, ObtenerMensajeError(error), TipoError.Api, false, null, EstadoError.ErrorServidor);
	}

}


async function ResponderPaginaEjemploTextoAVoz(contexto: Contexto): Promise<Response> {

	const htmlBase = await CargarHtmlLocal(contexto, HtmlEjemploTextoAVozCompilado, '/html/ejemplo-texto-a-voz.html');
	const html = htmlBase.replace(MarcadorOpcionesVocesTextoAVoz, CrearOpcionesVocesTextoAVoz());
	return ResponderHtmlConNonce(contexto, html, true);

}


function CrearOpcionesVocesTextoAVoz(): string {

	return [
		'\t\t\t\t<option value="" data-familia="" selected disabled>Selecciona una voz</option>',
		...VocesGeminiTextoAVoz.map(voz => CrearOpciónVozTextoAVoz(voz, 'gemini')),
		...VocesKokoroTextoAVoz.map(voz => CrearOpciónVozTextoAVoz(voz, 'kokoro')),
		...VocesKokoroCombinadasEjemploTextoAVoz.map(voz => CrearOpciónVozTextoAVoz(voz, 'kokoro'))
	].join('\n');

}


function CrearOpciónVozTextoAVoz(voz: string, familia: 'gemini' | 'kokoro'): string {
	const vozSaneada = Sanear(voz);
	return `\t\t\t\t<option value="${vozSaneada}" data-familia="${familia}">${vozSaneada}</option>`;
}


function LeerTextoRequerido(valor: string, mensaje: string): string {
	if (valor.trim() === '') throw new Error(mensaje);
	return valor.trim();
}


async function LeerCuerpoEjemploTextoAVoz(contexto: Contexto)
	: Promise<{Texto: string; InstruccionesVoz: string; Idioma: string; ModeloOConector: string; Voz: string;
		VelocidadReproduccion: number;}> {

	if (contexto.Solicitud.headers.get('content-type')?.toLowerCase().includes('application/json')) {

		const cuerpo = await contexto.Solicitud.json<Record<string, unknown>>().catch(() => null);
		if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo))
			throw new Error('El cuerpo de la solicitud debe ser un objeto JSON válido.');
		return {
			Texto: LeerTextoJsonPresente(cuerpo, 'Texto'),
			InstruccionesVoz: LeerTextoJsonPresente(cuerpo, 'InstruccionesVoz'),
			Idioma: LeerTextoJsonPresente(cuerpo, 'Idioma'),
			ModeloOConector: LeerTextoJsonPresente(cuerpo, 'ModeloOConector'),
			Voz: LeerTextoJsonPresente(cuerpo, 'Voz'),
			VelocidadReproduccion: LeerNúmeroRequerido(cuerpo?.VelocidadReproduccion, 'VelocidadReproduccion')
		};

	}

	const formulario = await contexto.Solicitud.formData();
	return {
		Texto: LeerTextoFormularioPresente(formulario, 'Texto'),
		InstruccionesVoz: LeerTextoFormularioPresente(formulario, 'InstruccionesVoz'),
		Idioma: LeerTextoFormularioPresente(formulario, 'Idioma'),
		ModeloOConector: LeerTextoFormularioPresente(formulario, 'ModeloOConector'),
		Voz: LeerVozFormulario(formulario),
		VelocidadReproduccion: LeerNúmeroFormularioRequerido(formulario, 'VelocidadReproduccion')
	};

}


function LeerNúmeroRequerido(valor: unknown, nombre: string): number {

	if (valor === undefined || valor === null || valor === '') throw new Error(`${nombre} es obligatorio.`);
	if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new Error(`${nombre} debe ser numero.`);
	return valor;

}


function LeerNúmeroFormularioRequerido(formulario: FormData, nombre: string): number {

	const valor = formulario.get(nombre);
	if (typeof valor !== 'string' || valor.trim() === '') throw new Error(`${nombre} es obligatorio.`);
	const número = Number(valor.trim());
	if (!Number.isFinite(número)) throw new Error(`${nombre} debe ser numero.`);
	return número;

}


function LeerTextoJsonPresente(cuerpo: Record<string, unknown> | null, nombre: string): string {

	const valor = cuerpo?.[nombre];
	if (typeof valor !== 'string') throw new Error(`${nombre} es obligatorio y debe ser texto.`);
	return valor.trim();

}


function LeerTextoFormularioPresente(formulario: FormData, nombre: string): string {

	const valor = formulario.get(nombre);
	if (typeof valor !== 'string') throw new Error(`${nombre} es obligatorio y debe ser texto.`);
	return valor.trim();

}


function LeerVozFormulario(formulario: FormData): string {

	const valor = formulario.get('Voz');
	if (valor === null) return ''; // El selector de voz se deshabilita cuando el modelo no usa voz.
if (typeof valor !== 'string') throw new Error('Voz debe ser texto.');
	return valor.trim();

}


function CrearNombreArchivo(resultado: { Modelo: string; Voz: string | null; ExtensiónArchivo: string; }): string {

	const modelo = NormalizarSegmentoNombreArchivo(resultado.Modelo);
	const voz = resultado.Voz ? NormalizarSegmentoNombreArchivo(resultado.Voz) : '';
	const nombreBase = voz ? `${modelo}-${voz}` : modelo;
	return `${nombreBase}.${resultado.ExtensiónArchivo}`;

}


function NormalizarSegmentoNombreArchivo(segmento: string): string {

	const segmentoNormalizado = segmento.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
	if (!segmentoNormalizado) throw new ErrorTextoAVozNoReintentable('Modelo o voz no produce un nombre de archivo válido.');
	return segmentoNormalizado;

}
