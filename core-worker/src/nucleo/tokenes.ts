import { AudienciaJwtIdentidad, EmisorJwtIdentidad } from '../configuracion';
import { CodificarBase64UrlBytes, CodificarBase64UrlTexto, ModoAutenticación } from "./global";


const LongitudTokenBytes = 32; // 256 bits de entropía, suficiente para resistir fuerza bruta sobre el token opaco.

const SegundosExpiraciónJwtWorkerApi = 60; // El JWT expira en 60 segundos porque solo viaja del Worker a la API en la misma petición. Este tiempo es suficiente para que se dé la conexión y como solo se necesita en la conexión inicial, no representa restricción para tareas que se tarden mucho tiempo en la API.

const EncabezadoJwt = CodificarBase64UrlTexto(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); // Base64url del header estático, calculado una sola vez.


export async function GenerarTokenAleatorio(): Promise<string> {
	const bytes = crypto.getRandomValues(new Uint8Array(LongitudTokenBytes));
	return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); // Hex porque es seguro en cookies sin codificación extra.
}


export async function ObtenerHashToken(token: string): Promise<string> {

	const codificador = new TextEncoder();
	const datos = codificador.encode(token);
	const buffer = await crypto.subtle.digest('SHA-256', datos); // SHA-256 nativo de Web Crypto, sin librerías externas.
	return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

}


export async function EmitirJwtIdentidad(idUsuario: string, rol: string, claveSecreta: string,
	modoAutenticación: ModoAutenticación): Promise<string> { // Genera un JWT HS256 efímero con la identidad del usuario y la propiedad amr que expresa el modo de autenticación delegado a la API.

	const ahora = Math.floor(Date.now() / 1000);
	const contenido = {
		iss: EmisorJwtIdentidad, aud: AudienciaJwtIdentidad, sub: idUsuario, role: rol, amr: modoAutenticación,
		iat: ahora, exp: ahora + SegundosExpiraciónJwtWorkerApi
	}; // La propiedad amr es el único transporte reconocido por la API para discriminar entre modos Cliente y BaseDeDatos.
	return await FirmarJwt(contenido, claveSecreta);

}


export async function FirmarJwt(contenido: object, claveSecreta: string): Promise<string> {

	const contenidoCodificado = CodificarBase64UrlTexto(JSON.stringify(contenido));
	const contenidoSinFirma = `${EncabezadoJwt}.${contenidoCodificado}`;

	const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(claveSecreta), { name: 'HMAC', hash: 'SHA-256' },
		false, ['sign']); // Importa la clave simétrica para HMAC-SHA256 usando Web Crypto API nativa del Worker.

	const firma = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(contenidoSinFirma));
	const firmaCodificada = CodificarBase64UrlBytes(firma);

	return `${contenidoSinFirma}.${firmaCodificada}`;

}


export async function ObtenerHmac(texto: string, secreto: string): Promise<string> { // HMAC con secreto del servidor para que los registros de Cloudflare no almacenen correos ni IPs en texto plano.

	const codificador = new TextEncoder();
	const clave = await crypto.subtle.importKey('raw', codificador.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false,
		['sign']);
	const firma = await crypto.subtle.sign('HMAC', clave, codificador.encode(texto));
	return Array.from(new Uint8Array(firma)).map(b => b.toString(16).padStart(2, '0')).join('');

}

