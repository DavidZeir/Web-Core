import type { Contexto } from '../global';
import { CargarHtmlLocal, ResponderConMarco } from '../respuestas';
import HtmlEntrarCompilado from '../../../static/html/nucleo/entrar.html';


export async function Entrar(contexto: Contexto): Promise<Response> {
	const htmlPágina = await CargarHtmlLocal(contexto, HtmlEntrarCompilado, '/html/nucleo/entrar.html');
	return ResponderConMarco(contexto, htmlPágina);
}
