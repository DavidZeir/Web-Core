import { Contexto, NombreCookieClienteJwt, NombreCookieSesión, NombreCookieIdioma } from "./global";
import { SegundosDuraciónAutenticaciónEnCliente, SegundosMáximosInactividadSesión } from "../configuracion";


export function CrearCookie(contexto: Contexto, nombreCookie: string, valorCookie: string, segundosDuraciónCookie: number): string {

	const partes = [`${nombreCookie}=${valorCookie}`, `Max-Age=${segundosDuraciónCookie}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
	AgregarSecureYDomainACookie(contexto, partes);
	return partes.join('; ');

}


export function CrearCookieVencida(contexto: Contexto, nombreCookie: string): string { // Elimina la cookie en el navegador fijando Max-Age=0, aplicando las mismas políticas de seguridad para garantizar el borrado en todos los casos.
	return CrearCookie(contexto, nombreCookie, '', 0);
}


export function CrearCookieSesión(contexto: Contexto, token: string): string { // Establece la cookie de sesión con el token opaco y el tiempo estándar de inactividad definido en SegundosMáximosInactividadSesión.
	return CrearCookie(contexto, NombreCookieSesión, token, SegundosMáximosInactividadSesión);
}


export function CrearCookieJwtCliente(contexto: Contexto, jwt: string): string { // Establece la cookie JWT de cliente con la duración estándar definida en MinutosDuraciónAutenticaciónEnCliente.
	return CrearCookie(contexto, NombreCookieClienteJwt, jwt, SegundosDuraciónAutenticaciónEnCliente);
}


export function CrearCookieSesiónVencida(contexto: Contexto): string { // Vence la cookie de sesión del navegador sin necesidad de conocer el nombre de la cookie en el punto de llamada.
	return CrearCookieVencida(contexto, NombreCookieSesión);
}


export function CrearCookieIdioma(contexto: Contexto, idioma: string): string { // Cookie de preferencia de idioma con un año de duración. Política idéntica al resto del sistema salvo que no propaga Domain para mantener el comportamiento original.

	const partes = [`${NombreCookieIdioma}=${idioma}`, 'Max-Age=31536000', 'Path=/', 'HttpOnly', 'SameSite=Lax'];
	if (!contexto.Local) partes.push('Secure');
	return partes.join('; ');

}


export function ObtenerValorCookie(contexto: Contexto, nombreCookie: string): string | null {

	const paqueteCookies = contexto.Solicitud.headers.get('Cookie');
	if (!paqueteCookies) return null;

	for (const cookie of paqueteCookies.split(';')) {

		const separador = cookie.indexOf('=');
		if (separador === -1) continue;
		const nombre = cookie.slice(0, separador).trim();
		const valor = cookie.slice(separador + 1).trim();
		if (nombre === nombreCookie && valor) return valor;

	}

	return null;

}


export function AgregarCookieRespuesta(contexto: Contexto, cookie: string, permitirReescritura: boolean = false): void {

	const nombreCookieNuevo = cookie.split('=')[0]?.trim();
	if (!nombreCookieNuevo)
		throw new Error('No se pudo registrar la cookie porque el encabezado Set-Cookie no contiene un nombre valido.');

	const índiceCookieExistente = contexto.CookiesRespuesta.findIndex(cookieExistente => {
		const nombreCookieExistente = cookieExistente.split('=')[0]?.trim();
		return nombreCookieExistente === nombreCookieNuevo;
	});

	if (índiceCookieExistente >= 0) {

		if (!permitirReescritura)
			throw new Error(`La cookie '${nombreCookieNuevo}' ya estaba registrada en contexto.cookiesAEstablecer.`);
		contexto.CookiesRespuesta[índiceCookieExistente] = cookie;

	} else {
		contexto.CookiesRespuesta.push(cookie);
	}

}


export function AgregarCookiesRespuesta(contexto: Contexto, cookies: string[] | null, permitirReescritura: boolean = false): void {

	if (cookies?.length) {

		for (const cookieAEstablecer of cookies) {
			AgregarCookieRespuesta(contexto, cookieAEstablecer, permitirReescritura);
		}

	}

}


export function AgregarSecureYDomainACookie(contexto: Contexto, partesCookie: string[]): void {
	if (!contexto.Local) partesCookie.push('Secure');
	if (!contexto.Local && contexto.DominioCookies) partesCookie.push(`Domain=${contexto.DominioCookies}`);
}
