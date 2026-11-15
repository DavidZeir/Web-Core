import { type Contexto, Sanear } from '../../nucleo/global';
import { ResponderConMarco } from '../../nucleo/respuestas';
import { ObtenerMensajeEjemplo } from '../ejemplo';


export async function Ejemplo(contexto: Contexto): Promise<Response> {

	const htmlMarco =
		`<main>
			<h1>Ejemplo</h1>
			<p>${Sanear(ObtenerMensajeEjemplo())}</p>
		</main>`;

	/**
	 * Responder: Devuelve contenido directo en HTML, JSON o texto plano, aplica el tipo de respuesta indicado, adjunta cookies y además resuelve errores visibles usando el estado HTTP y los detalles de error que se le pasen.
	 * ResponderConFragmentos: Toma un HTML base y permite inyectar uno o varios fragmentos por selector, aplicar transformaciones adicionales con HTMLRewriter y mostrar errores dentro de un selector concreto sin perder el marco de la página.
	 * ResponderConMarco: Es la opción para páginas completas normales, porque carga el marco principal del sitio y pone dentro el HTML de contenido en el selector indicado, manteniendo el flujo estándar de páginas renderizadas.
	 * ResponderErrorConMarco: Sirve para mostrar errores visibles al usuario dentro del marco principal, usando la plantilla de error correspondiente, con estado HTTP, mensaje, validaciones y posibilidad de permitir HTML si el caso lo requiere.
	 * ResponderRedirección: Genera una redirección HTTP al destino indicado, conserva las cookies acumuladas en el contexto y se usa cuando la ruta debe enviar al usuario a otra URL en vez de devolver contenido.
	 * ResponderMétodoNoPermitido: Devuelve un error 405 con la cabecera Allow correctamente poblada y un error visible con marco, por lo que se usa cuando la ruta recibe un método HTTP que no está permitido.
	 */
	return ResponderConMarco(contexto, htmlMarco);

}
