import { type Contexto } from '../global';
import { ResponderEntradaConGoogle, ResponderEntrandoConGoogle } from '../boton-google';
import { CargarHtmlLocal } from '../respuestas';
import HtmlErrorGoogleCompilado from '../../../static/html/nucleo/error-google.html';


export async function EntrarConGoogle(contexto: Contexto): Promise<Response> { // Ruta /entrar-con-google: redirige al usuario a la pantalla de consentimiento de Google con state HMAC anti-CSRF.
	return ResponderEntradaConGoogle(contexto);
}


export async function EntrandoConGoogle(contexto: Contexto): Promise<Response> { // Ruta /entrar-con-google/entrando: respuesta de Google OAuth que procesa el code y state, crea sesión y redirige.
	const htmlError = await CargarHtmlLocal(contexto, HtmlErrorGoogleCompilado, '/html/nucleo/error-google.html');
	return ResponderEntrandoConGoogle(contexto, htmlError);
}
