import HtmlEjemploPrincipalCompilado from '../../../static/html/ejemplo-principal.html';
import type { Contexto } from '../global';
import { CargarHtmlLocal, ResponderConMarco } from '../respuestas';


export async function Principal(contexto: Contexto): Promise<Response> { // La portada de ejemplo de Web Core. Cada proyecto la cambia por la suya.
	const htmlPágina = await CargarHtmlLocal(contexto, HtmlEjemploPrincipalCompilado, '/html/ejemplo-principal.html');
	return ResponderConMarco(contexto, htmlPágina);
}
