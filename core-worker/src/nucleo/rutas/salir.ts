import type { Contexto } from '../global';
import { ResponderSalida } from '../autenticacion';
import { CargarHtmlLocal } from '../respuestas';
import HtmlSalirCompilado from '../../../static/html/nucleo/salir.html';


export async function Salir(contexto: Contexto): Promise<Response> {
	const htmlAlSalir = await CargarHtmlLocal(contexto, HtmlSalirCompilado, '/html/nucleo/salir.html');
	return ResponderSalida(contexto, htmlAlSalir);
}
