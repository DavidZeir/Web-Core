import { type Contexto, Sanear } from '../global';
import { ResponderConMarcoAutenticado } from '../autenticacion';
import { CargarHtmlLocal } from '../respuestas';
import HtmlInicioCompilado from '../../../static/html/nucleo/inicio.html';


export async function Inicio(contexto: Contexto): Promise<Response> {

	const detallesDesarrollo = contexto.Local
		? `<section>
			<h2>{{inicio-detalles-desarrollo-título}}</h2>
			<p>{{inicio-id-usuario}}: ${Sanear(contexto.Autenticación?.Usuario?.IdUsuario)}</p>
			<p>{{inicio-rol}}: ${Sanear(contexto.Autenticación?.Usuario?.Rol)}</p>
		</section>`
		: '';
	const htmlPágina = (await CargarHtmlLocal(contexto, HtmlInicioCompilado, '/html/nucleo/inicio.html'))
		.replaceAll('[[detalles-desarrollo]]', detallesDesarrollo);

	return ResponderConMarcoAutenticado(contexto, htmlPágina);

}
