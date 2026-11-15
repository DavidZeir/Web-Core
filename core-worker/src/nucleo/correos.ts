import { EnviarAlertaErrorCrítico, EnviarAlertaErrorCríticoEnSegundoPlano } from './alertas';
import { type Contexto, ObtenerCorreoAdministrador, ObtenerMensajeError, RegistrarEventoConPrefijo, Sanear, ServicioCorreo } from "./global";
import { NombreSitio, CorreoEnvíoEnlacesMágicos, ServicioCorreoActivo } from '../configuracion';
import { ObtenerTextoEnIdioma } from "./idiomas";
import type { Entorno } from './global';


interface CuerposDelCorreo { htmlbody: string; textbody: string; } // No cambiar estos nombres, se deben dejar para que la API de ZeptoMail los entienda.


function DecodificarEntidadesHtml(texto: string): string {
	return texto.replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}


function ConvertirHtmlATextoPlano(html: string): string {

	return DecodificarEntidadesHtml(html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/<\/(p|div|h1|h2|h3|li|tr|section|article)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<li>/gi, "• ")
			.replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim());

}


function ObtenerCuerpos(html: string): CuerposDelCorreo {
	return { htmlbody: html, textbody: ConvertirHtmlATextoPlano(html) };
}


async function EnviarCorreoConZeptoMail(contexto: Contexto, correoDestinatario: string, asunto: string, html: string,
	alertarErrores = true): Promise<boolean> {

	const cuerpos = ObtenerCuerpos(html); // El texto plano se genera automáticamente a partir del HTML. Se envía explícitamente texto plano para asegurar compatibilidad con todos los clientes de correo y evitar que algunos muestren el HTML como adjunto o no lo rendericen correctamente. Además, al proporcionar versión en texto plano los servidores de correo le pueden subir el puntaje de entregabilidad al correo.

	try {

		const respuesta = await fetch("https://api.zeptomail.com/v1.1/email", {
           method: "POST", headers: { Authorization: contexto.Entorno.TOKEN_ENVIO_ENLACES, "Content-Type": "application/json", },
			body: JSON.stringify({
				from: { address: CorreoEnvíoEnlacesMágicos, name: NombreSitio, },
				to: [{ email_address: { address: correoDestinatario } }],
				subject: asunto, ...cuerpos })});

		if (!respuesta.ok) {

			const error = await respuesta.text();
			if (alertarErrores)
				EnviarAlertaErrorCrítico(contexto, 'ErrorZeptoMail', 'Fallo al enviar correo vía ZeptoMail.',
					`Estado: ${respuesta.status}. Detalle: ${error}`);
			return false;

		}

		return true;

	} catch (error) {

		if (alertarErrores)
			EnviarAlertaErrorCrítico(contexto, "ErrorZeptoMail", "Excepción al enviar correo vía ZeptoMail.",
				ObtenerMensajeError(error, true));
		return false;

	}

}


function EnviarCorreo(contexto: Contexto, correoDestinatario: string, asunto: string, html: string, alertarErrores = true)
	: Promise<boolean> {

	if (ServicioCorreoActivo === ServicioCorreo.ZeptoMail) {
		return EnviarCorreoConZeptoMail(contexto, correoDestinatario, asunto, html, alertarErrores);
	} else if (ServicioCorreoActivo === ServicioCorreo.CloudflareEmail) {
		return EnviarCorreoConCloudflareEmail(contexto, correoDestinatario, asunto, html);
	} else {
		throw new Error(`Servicio de correo no implementado: ${ServicioCorreoActivo}.`);
	}

}


export function EnviarCorreoAlAdministrador(contexto: Contexto, asunto: string, textoPlano: string): Promise<boolean> {
	const html = `<pre style="white-space: pre-wrap; font-family: sans-serif;">${Sanear(textoPlano)}</pre>`;
	return EnviarCorreo(contexto, ObtenerCorreoAdministrador(contexto.Entorno), asunto, html, false);
}


async function EnviarCorreoConCloudflareEmail(_contexto: Contexto, _correoDestinatario: string, _asunto: string,
	_html: string): Promise<boolean> {
	throw new Error('EnviarCorreoConCloudflareEmail: no implementado. Configurar el canal nativo de Cloudflare Email Routing antes de usar este servicio.');
}


export async function EnviarEnlaceMágico(contexto: Contexto, correoDestinatario: string, enlaceMágico: string, htmlCorreo: string,
	usuarioActivo: boolean = true): Promise<boolean> {

    const idioma = contexto.Idioma;
    const { texto: textoEntrarA } = await ObtenerTextoEnIdioma(contexto, "correo-enlace-magico-asunto", idioma);

	let textoInstrucción;
	if (usuarioActivo) {
       textoInstrucción = await ObtenerTextoEnIdioma(contexto, "correo-enlace-magico-instruccion", idioma);
	} else {
		enlaceMágico = '';
       textoInstrucción = await ObtenerTextoEnIdioma(contexto, "correo-enlace-magico-instruccion-no-activo", idioma);
	}
	
	const html = htmlCorreo.replaceAll('{{correo-enlace-magico-instruccion}}', textoInstrucción.texto)
		.replaceAll('{{correo-enlace-magico-enlace}}', enlaceMágico);
	return EnviarCorreo(contexto, correoDestinatario, `${textoEntrarA} ${NombreSitio}`, html);

}


// #region Procesamiento de correos

export type ProcesadorCorreo = (mensaje: ForwardableEmailMessage, entorno: Entorno, contexto: ExecutionContext) => Promise<boolean>;

let Procesador: ProcesadorCorreo | null = null;

export function EstablecerProcesadorCorreo(función: ProcesadorCorreo): void { Procesador = función; }


export async function ProcesarCorreo(mensaje: ForwardableEmailMessage, entorno: Entorno, contexto: ExecutionContext): Promise<boolean> { // Se encarga de procesar los correos entrantes utilizando el procesador definido. Devuelve verdadero si el correo fue procesado o falso si no hay procesador definido, el procesador no maneja el correo (devuelve false) o lanza un error. En caso de error, también se registra un evento con el detalle del error.

	if (Procesador) {

		try {
			return await Procesador(mensaje, entorno, contexto);
		} catch (error) {

			RegistrarEventoConPrefijo(null, 'ProcesadorCorreos.', 'Error', ObtenerMensajeError(error));
			EnviarAlertaErrorCríticoEnSegundoPlano(entorno, contexto, 'ProcesadorCorreos. Error',
				'Falló el procesador de correos entrantes.', ObtenerMensajeError(error));
			return false;

		}

	}	

	return false;

}

// #endregion
