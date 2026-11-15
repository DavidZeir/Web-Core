import { Manejadores, RutasExcluidasDeSitemap } from '../../rutas';
import { IdiomasSoportados } from '../../configuracion';
import { Contexto, ObtenerOrigenSolicitud, Sanear } from '../global';
import { ConstruirRutaConIdioma } from '../idiomas';


export async function Sitemap(contexto: Contexto): Promise<Response> {

	const origen = ObtenerOrigenSolicitud(contexto);
	const rutasBase = Object.keys(Manejadores).filter(ruta => !RutasExcluidasDeSitemap.includes(ruta));
	const rutas = IdiomasSoportados.length > 1
		? [...new Set(rutasBase.flatMap(ruta => IdiomasSoportados.map(idioma => ConstruirRutaConIdioma(idioma, ruta))))]
		: rutasBase;
	const urls = rutas.map(ruta => `\t<url><loc>${Sanear(new URL(ruta, origen).toString())}</loc></url>`);
	const xml =
		`<?xml version='1.0' encoding='UTF-8'?>\n
		<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>\n${urls.join('\n')}\n</urlset>`;

	return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });

}
