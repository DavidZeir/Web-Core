import { IdiomasSoportados, MáximosCarácteresDescripciónSeo, MáximosCarácteresTítuloSeo } from "../configuracion";
import type { DatosSeo, Manejador } from "./global";


export function ValidarMapaSeo(mapaSeo: Record<string, Record<string, DatosSeo>>, manejadores: Record<string, Manejador>,
	rutasExcluidasDeSitemap: string[]): Record<string, Record<string, DatosSeo>> {

	const rutasIndexables = Object.keys(manejadores).filter(ruta => !rutasExcluidasDeSitemap.includes(ruta));
	const idiomasSeo = IdiomasSoportados;
	const títulosPorIdioma = new Map<string, Map<string, string>>();
	const errores: string[] = [];

	for (const idioma of idiomasSeo) títulosPorIdioma.set(idioma, new Map<string, string>());

	for (const ruta of rutasIndexables) {

		const datosSeoPorIdioma = mapaSeo[ruta];

		if (!datosSeoPorIdioma) {
			errores.push(`La ruta canónica indexable '${ruta}' no tiene entrada SEO propia en MapaSeo.`);
			continue;
		}

		for (const idioma of idiomasSeo) {

			const título = NormalizarTextoSeo(datosSeoPorIdioma[idioma]?.Título ?? '');
			const descripción = NormalizarTextoSeo(datosSeoPorIdioma[idioma]?.Descripción ?? '');

			if (!título) {
				errores.push(`La ruta canónica indexable '${ruta}' no tiene título SEO para el idioma '${idioma}'.`);
				continue;
			}

			if (título.length > MáximosCarácteresTítuloSeo)
				errores.push(`El título SEO de la ruta canónica indexable '${ruta}' para el idioma '${idioma}' tiene ${título.length} carácteres. El máximo permitido es ${MáximosCarácteresTítuloSeo}.`);

			if (!descripción) {
				errores.push(`La ruta canónica indexable '${ruta}' no tiene descripción SEO para el idioma '${idioma}'.`);
				continue;
			}

			if (descripción.length > MáximosCarácteresDescripciónSeo)
				errores.push(`La descripción SEO de la ruta canónica indexable '${ruta}' para el idioma '${idioma}' tiene ${descripción.length} carácteres. El máximo permitido es ${MáximosCarácteresDescripciónSeo}.`);

			const títuloNormalizado = NormalizarTítuloSeo(título);
			const títulosRegistrados = títulosPorIdioma.get(idioma);
			const rutaExistente = títulosRegistrados?.get(títuloNormalizado);

			if (rutaExistente) {
				errores.push(`El título SEO '${título}' está repetido para el idioma '${idioma}' en las rutas canónicas indexables '${rutaExistente}' y '${ruta}'.`);
				continue;
			}

			títulosRegistrados?.set(títuloNormalizado, ruta);

		}

	}

	if (errores.length > 0) throw new Error(`Configuración SEO inválida:\n${errores.map(error => `- ${error}`).join('\n')}`);
	return mapaSeo;

}


function NormalizarTextoSeo(texto: string): string {
	return texto.replace(/\s+/g, ' ').trim();
}


function NormalizarTítuloSeo(título: string): string {
	return NormalizarTextoSeo(título).toLowerCase();
}
