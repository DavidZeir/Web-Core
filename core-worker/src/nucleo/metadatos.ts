import { Sanear, DetallesIdioma, Contexto } from "./global";
import { IdiomasSoportados, IdiomaRespaldo } from '../configuracion';
import { ConstruirRutaConIdioma } from "./idiomas";


export function RealizarSustitucionesSeo(plantilla: string, sustituciones: Record<string, string>): string {

	return plantilla.replace(/\[\[(.*?)]]/g, (_coincidencia, claveCruda: string) => {

		const clave = claveCruda.trim();
		const valor = sustituciones[clave];

		if (valor !== undefined) return Sanear(valor);

        console.error(`No se encontró la sustitución SEO '${clave}'. Se quitaron los marcadores [[ y ]] y el valor '${clave}' quedó visible para el usuario, para no degradar la experiencia.`);
		return Sanear(clave);

	});

}


function ConstruirEtiquetaCanonical(urlOrigen: string, rutaCanónica: string): string {
	const urlCanónicaAbsoluta = `${urlOrigen}${rutaCanónica}`;
	return `<link rel='canonical' href='${Sanear(urlCanónicaAbsoluta)}'>`;
}


function ConstruirEtiquetasHreflang(detallesIdioma: DetallesIdioma): string {

	let etiquetasHreflang = '';

	for (const idioma of IdiomasSoportados) {
		const href = `${detallesIdioma.UrlOrigen}${ConstruirRutaConIdioma(idioma, detallesIdioma.RutaCanónicaSinPrefijo)}`;
		etiquetasHreflang += `<link rel='alternate' hreflang='${idioma}' href='${href}'>`;
	}

	const hrefRespaldo = `${detallesIdioma.UrlOrigen}${ConstruirRutaConIdioma(IdiomaRespaldo, detallesIdioma.RutaCanónicaSinPrefijo)}`; // El x-default es la versión que los buscadores les muestran a los usuarios cuyo idioma no está en el sitio, y es la del idioma de respaldo, el mismo que ResolverMultidioma les da a esos navegadores.
	etiquetasHreflang += `<link rel='alternate' hreflang='x-default' href='${hrefRespaldo}'>`;

	return etiquetasHreflang;

}


function ConstruirUrlAbsolutaImagen(contexto: Contexto, imagen: string): string {

	try {
		return new URL(imagen, contexto.Url.origin).toString();
	} catch {

		const origin = contexto.Url.origin.replace(/\/+$/, '');
		const path = imagen.replace(/^\/+/, '');
		return `${origin}/${path}`;

	}

}


function ConstruirEtiquetasRedesSociales(título: string, descripción: string, imagen: string, url: string): string {

	return `<meta property='og:title' content='${título}'><meta property='og:description' content='${descripción}'>`
		+ `<meta property='og:image' content='${Sanear(imagen)}'><meta property='og:url' content='${Sanear(url)}'>`
		+ `<meta property='og:type' content='website'><meta name='twitter:card' content='summary_large_image'>`;

}


export function RegistrarEtiquetasSeo(contexto: Contexto, transformadorHtml: HTMLRewriter, detallesIdioma?: DetallesIdioma): HTMLRewriter {

	const urlOrigen: string = detallesIdioma?.UrlOrigen ?? contexto.Url.origin;
	const rutaCanónica = detallesIdioma ? ConstruirRutaConIdioma(detallesIdioma.Idioma, detallesIdioma.RutaCanónicaSinPrefijo) : contexto.Url.pathname;
	const etiquetaCanónica = ConstruirEtiquetaCanonical(urlOrigen, rutaCanónica);
	const hrefCanónica = Sanear(`${urlOrigen}${rutaCanónica}`);
	const datosSeo = contexto.DatosSeo;
	const títuloSeo = datosSeo ? RealizarSustitucionesSeo(datosSeo.Título, contexto.SustitucionesSeo) : 'Título';
	const descripciónSeo = datosSeo ? RealizarSustitucionesSeo(datosSeo.Descripción, contexto.SustitucionesSeo) : 'Descripción';
	const imagenSeo = datosSeo ? ConstruirUrlAbsolutaImagen(contexto,
		RealizarSustitucionesSeo(datosSeo.Imagen, contexto.SustitucionesSeo)) : '';
	const urlSeo = `${urlOrigen}${rutaCanónica}`;
	const estadoEtiquetasSeo = { canonicalEncontrada: false, headProcesado: false, títuloEncontrado: false, descripciónEncontrada: false };

	transformadorHtml = transformadorHtml.on('title', {

		element(elemento) {
			estadoEtiquetasSeo.títuloEncontrado = true;
			elemento.setInnerContent(títuloSeo, { html: true });
		}

	});

	transformadorHtml = transformadorHtml.on('meta[name]', {

		element(elemento) {

			const nombre = elemento.getAttribute('name')?.toLowerCase();
			if (nombre === 'description') {
				estadoEtiquetasSeo.descripciónEncontrada = true;
				elemento.setAttribute('content', descripciónSeo);
			}

		}

	});

	transformadorHtml = transformadorHtml.on('link[rel]', {

		element(elemento) {

			const rel = elemento.getAttribute('rel')?.toLowerCase();
			if (rel === 'canonical') {
				elemento.setAttribute('href', hrefCanónica);
				estadoEtiquetasSeo.canonicalEncontrada = true;
			}

		}

	});

	return transformadorHtml.on('head', {

		element(elemento) {

			if (estadoEtiquetasSeo.headProcesado) return;
			estadoEtiquetasSeo.headProcesado = true;

			elemento.onEndTag(etiquetaFinal => {

				let etiquetasSeoPendientes = '';

				if (!estadoEtiquetasSeo.títuloEncontrado) etiquetasSeoPendientes += `<title>${títuloSeo}</title>`;
				if (!estadoEtiquetasSeo.descripciónEncontrada)
					etiquetasSeoPendientes += `<meta name='description' content='${descripciónSeo}'>`;
				if (!estadoEtiquetasSeo.canonicalEncontrada) etiquetasSeoPendientes += etiquetaCanónica;
				if (detallesIdioma && IdiomasSoportados.length > 1)
					etiquetasSeoPendientes += ConstruirEtiquetasHreflang(detallesIdioma);
				if (datosSeo) etiquetasSeoPendientes += ConstruirEtiquetasRedesSociales(títuloSeo, descripciónSeo, imagenSeo, urlSeo);
				if (etiquetasSeoPendientes) etiquetaFinal.before(etiquetasSeoPendientes, { html: true });

			});

		}

	});

}


export async function ActualizarOCrearEtiquetasSeo(contexto: Contexto, respuestaHtml: Response): Promise<Response> {

	let transformadorHtml = new HTMLRewriter();
	transformadorHtml = RegistrarEtiquetasSeo(contexto, transformadorHtml);
	return transformadorHtml.transform(respuestaHtml);

}


export function EstablecerSustituciónSeo(contexto: Contexto, clave: string, valor: string): void {

	const claveNormalizada = clave.trim().toLowerCase();
    if (!claveNormalizada) throw new Error('La clave de reemplazo SEO es obligatoria.');
	contexto.SustitucionesSeo[claveNormalizada] = valor;

}
