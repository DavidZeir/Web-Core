import { type Contexto } from '../global';
import { ResponderSolicitudEnlaceMágico, ResponderVerificaciónEnlaceMágico, ResponderEntradaConEnlaceMágico }
	from '../enlaces-magicos';
import { RutaTrasEntrar } from '../../configuracion';
import { CargarHtmlLocal } from '../respuestas';
import HtmlCorreoCompilado from '../../../static/html/nucleo/correo-enlace-magico.html';
import HtmlFormularioCompilado from '../../../static/html/nucleo/entrar-con-correo-formulario.html';
import HtmlRespuestaCompilado from '../../../static/html/nucleo/entrar-con-correo-respuesta.html';
import HtmlVerificaciónCompilado from '../../../static/html/nucleo/verificar-enlace-magico.html';


export async function SolicitarEnlaceMágico(contexto: Contexto): Promise<Response> { // Ruta /entrar-con-correo: muestra el formulario para solicitar el enlace mágico de ingreso.

	const [htmlRespuesta, htmlFormulario, htmlCorreo] = await Promise.all([
		CargarHtmlLocal(contexto, HtmlRespuestaCompilado, '/html/nucleo/entrar-con-correo-respuesta.html'),
		CargarHtmlLocal(contexto, HtmlFormularioCompilado, '/html/nucleo/entrar-con-correo-formulario.html'),
		CargarHtmlLocal(contexto, HtmlCorreoCompilado, '/html/nucleo/correo-enlace-magico.html')
	]);
	return ResponderSolicitudEnlaceMágico(contexto, htmlFormulario, htmlRespuesta, htmlCorreo);

}


export async function VerificarEnlaceMágico(contexto: Contexto): Promise<Response> { // Ruta /entrar-con-correo/verificar: muestra la pantalla de verificación del enlace mágico, que al confirmar hace un POST a /entrar-con-correo/entrar para completar el ingreso.

	const htmlConfirmación = await CargarHtmlLocal(contexto, HtmlVerificaciónCompilado, '/html/nucleo/verificar-enlace-magico.html');
	const htmlInicioEntrar = "<a href='/entrar-con-correo'>";
	const htmlFinEntrar = "</a>";
	return ResponderVerificaciónEnlaceMágico(contexto, htmlConfirmación, htmlInicioEntrar, htmlFinEntrar);

}


export async function EntrarConEnlaceMágico(contexto: Contexto): Promise<Response> { // Ruta /entrar-con-correo/entrar: procesa el POST del formulario de verificación del enlace mágico y completa el ingreso del usuario. Se hace el ingreso en dos pasos para evitar que los sistemas de protección de enlaces de los correos se 'gasten' el enlace de ingreso antes de que el usuario lo vea.
	return ResponderEntradaConEnlaceMágico(contexto, RutaTrasEntrar);
}
