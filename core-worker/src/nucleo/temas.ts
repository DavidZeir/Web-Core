import { CrearCookie, CrearCookieVencida, ObtenerValorCookie } from './cookies';
import { type Contexto, NombreCookieTema, ValidarRutaInterna } from './global';


const TemaPrincipal = 'principal';

const TemaAlternativo = 'alternativo';

const SegundosDuraciónCookieTema = 31536000; // Un año, igual que la cookie del idioma.


/**
 * Por decisión, Web Core no sigue el modo claro u oscuro del sistema del usuario. Una marca se piensa en un tema principal, sea claro u oscuro, y al pasarla sola al otro modo por lo general pierde su esencia. Por eso el sitio siempre carga con el tema principal, y el usuario pasa al tema alternativo con el botón del encabezado. Se llama alternativo, y no oscuro, porque depende de la marca: si su tema principal es oscuro, el alternativo será claro.
 */
export function ResolverCambioTema(contexto: Contexto): Response | null {

	const coincidencia = /^\/cambiar-tema\/([^/]+)$/i.exec(contexto.Url.pathname);
	if (!coincidencia) return null;
	const tema = coincidencia[1].toLowerCase();
	if (tema !== TemaPrincipal && tema !== TemaAlternativo) return new Response('Tema no soportado', { status: 400 });
	const rutaSegura = ValidarRutaInterna(contexto.Url.searchParams.get('redirigir-a') ?? '/'); // Se valida que la ruta de retorno sea interna, para evitar redirecciones abiertas.
	if (rutaSegura === null) return new Response('Ruta de retorno inválida', { status: 400 });

	const cabeceras = new Headers();
	const cookie = tema === TemaAlternativo // El tema principal no necesita cookie, porque es el que carga si no hay ninguna.
		? CrearCookie(contexto, NombreCookieTema, TemaAlternativo, SegundosDuraciónCookieTema)
		: CrearCookieVencida(contexto, NombreCookieTema);
	cabeceras.append('Set-Cookie', cookie);
	cabeceras.set('Location', new URL(rutaSegura, contexto.Url).toString());
	return new Response(null, { status: 302, headers: cabeceras });

}


export function EstablecerAtributoTema(contexto: Contexto, transformadorHtml: HTMLRewriter): HTMLRewriter { // El servidor pone el atributo antes de enviar la página, para que llegue con su tema sin parpadeo y sin JavaScript.
	if (ObtenerValorCookie(contexto, NombreCookieTema) !== TemaAlternativo) return transformadorHtml;
	return transformadorHtml.on('html', { element(elemento) { elemento.setAttribute('data-tema', TemaAlternativo); }});
}
