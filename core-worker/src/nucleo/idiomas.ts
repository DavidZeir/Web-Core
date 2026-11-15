import { Sanear, type Contexto, type Idioma, DetallesIdioma, EsIdiomaSoportado, XIdioma, NombreCookieIdioma, ValidarRutaInterna } from './global';
import { ActivarTraducciónHtml, IdiomaPredeterminado, IdiomaRespaldo, IdiomasSoportados } from '../configuracion';
import { RegistrarEtiquetasSeo } from './metadatos';
import { CrearCookieIdioma } from './cookies';


type DiccionarioTextos = Record<string, string>;

const CachéTextos = new Map<Idioma, DiccionarioTextos>(); // Se mantiene en memoria del Worker mientras el contenedor siga vivo.

const PromesasCargaTextos = new Map<Idioma, Promise<DiccionarioTextos | null>>(); // Evita cargas duplicadas en paralelo para el mismo idioma. Una carga que falló entrega null.

if (!IdiomasSoportados.includes(IdiomaRespaldo)) // Se comprueba al cargar el módulo, como ValidarMapaSeo, para que el worker no inicie con un respaldo que el sitio no tiene. Sin esto, un navegador en otro idioma recibiría un 302 a /xx, ExtraerIdiomaDeRuta no reconocería ese prefijo y cada página entraría en un bucle de redirecciones, a /xx/xx, /xx/xx/xx y así.
	throw new Error(`IdiomaRespaldo '${IdiomaRespaldo}', de configuracion.ts, no está en IdiomasSoportados (${IdiomasSoportados.join(', ')}). Debe ser uno de ellos, o el mismo IdiomaPredeterminado si no se quiere un respaldo distinto.`);


// #region Funciones generales de idioma

export function ObtenerIdiomaDesdeCookie(paqueteCookies: string | null): Idioma | null {

	if (!paqueteCookies) return null;
	const cookies = paqueteCookies.split(';').map(cookie => cookie.trim());
	const cookieIdioma = cookies.find(cookie => cookie.startsWith(`${NombreCookieIdioma}=`));
	if (!cookieIdioma) return null;
	const valorIdioma = cookieIdioma.slice(`${NombreCookieIdioma}=`.length);
	if (EsIdiomaSoportado(valorIdioma)) return valorIdioma;
	return null;

}


export function ExtraerIdiomaDeRuta(ruta: string): { rutaConIdioma: Idioma | null; rutaSinIdioma: string; } {

	const segmentos = ruta.split('/').filter(segmento => segmento.length > 0);
	if (segmentos.length === 0) return { rutaConIdioma: null, rutaSinIdioma: '/' };
	const primerSegmento = segmentos[0].toLowerCase();
	if (!EsIdiomaSoportado(primerSegmento)) return { rutaConIdioma: null, rutaSinIdioma: ruta };
	const restoSegmentos = segmentos.slice(1);
	const rutaSinIdioma = restoSegmentos.length === 0 ? '/' : `/${restoSegmentos.join('/')}`;
	return { rutaConIdioma: primerSegmento, rutaSinIdioma };

}


export function ConstruirRutaConIdioma(idioma: Idioma, rutaSinIdioma: string): string {

	if (idioma === IdiomaPredeterminado) return rutaSinIdioma;
	if (rutaSinIdioma === '/') return `/${idioma}`;
	return `/${idioma}${rutaSinIdioma}`;

}


export async function CargarTextosIdioma(contexto: Contexto, idioma: Idioma): Promise<DiccionarioTextos> {

	const textosExistentes = CachéTextos.get(idioma);
	if (textosExistentes) return textosExistentes;

	const promesaExistente = PromesasCargaTextos.get(idioma);
	if (promesaExistente) return (await promesaExistente) ?? {};

	const promesaCarga = CargarTextosDesdeArchivo(contexto, idioma);
	PromesasCargaTextos.set(idioma, promesaCarga);

	try {

		const textos = await promesaCarga;
		if (textos !== null) CachéTextos.set(idioma, textos); // Una carga que falló no se guarda en memoria, para que la solicitud siguiente lo vuelva a intentar. Si se guardara el diccionario vacío, ese Worker mostraría las claves en vez de los textos hasta reiniciarse. Lo cuida la prueba 'Error arreglado: si la carga falla, no deja los textos vacíos en memoria' de pruebas/ligeras/idiomas.test.ts.
		return textos ?? {}; // Mientras tanto, esta solicitud sigue sin textos, y muestra las claves.

	} finally {
		PromesasCargaTextos.delete(idioma);
	}

}


async function CargarTextosDesdeArchivo(contexto: Contexto, idioma: Idioma): Promise<DiccionarioTextos | null> { // Los textos del idioma, o null si no se pudieron cargar.

	try {

        const respuesta = await contexto.Entorno.RECURSOS.fetch(new Request(`https://assets.local/textos/${idioma}.json`)); // En el binding de assets de Cloudflare Workers el hostname es irrelevante: env.RECURSOS.fetch(...) usa el pathname del Request para buscar el archivo estático.

		if (respuesta.ok) {
			const textos = await respuesta.json<DiccionarioTextos>();
			return textos;
		}

		console.warn(`No se pudo cargar textos/${idioma}.json. Estado: ${respuesta.status}.`);
		return null;

	} catch (error) {
		console.error(`Error cargando textos/${idioma}.json`, error);
		return null;
	}

}


export async function ObtenerTextoEnIdioma(contexto: Contexto, claveTexto: string, idioma: Idioma)
	: Promise<{ texto: string; encontrado: boolean; }> {

   const textosIdiomas = await CargarTextosIdioma(contexto, idioma);
	if (textosIdiomas[claveTexto] !== undefined) {
		return { texto: textosIdiomas[claveTexto], encontrado: true };
	} else {

		console.warn(`No se encontró la clave de texto '${claveTexto}' en textos/${idioma}.json.`);

		if (idioma !== IdiomaPredeterminado) {

			const textosPredeterminados = await CargarTextosIdioma(contexto, IdiomaPredeterminado);
			if (textosPredeterminados[claveTexto] !== undefined) {
				return { texto: textosPredeterminados[claveTexto], encontrado: true };
			} else {
				console.error(`No se encontró la clave de texto '${claveTexto}' en textos/${IdiomaPredeterminado}.json.`);
				return { texto: claveTexto, encontrado: false };
			}

		} else {
			return { texto: claveTexto, encontrado: false }; // Es el mismo idioma, no hay nada que hacer si no se encontró en el punto anterior.
		}

	}

}


export async function ObtenerTextoConSustituciones(contexto: Contexto, claveTexto: string, sustituciones: Record<string, string>[],
	permitirHtml: boolean = false): Promise<string> { // Resuelve un texto localizado y aplica sustituciones de pseudoclaves [[clave]]. Los valores se sanean antes de insertarse porque el resultado es siempre para HTML.

    const { texto } = await ObtenerTextoEnIdioma(contexto, claveTexto, contexto.Idioma);
	const mapa = Object.assign({}, ...sustituciones);

	return texto.replace(/\[\[([^\]]+)\]\]/g, (_coincidencia, clave: string) => {
		const valor = mapa[clave.trim()];
		return valor !== undefined ? (permitirHtml ? valor : Sanear(valor)) : `[[${clave}]]`;
	});

}

// #endregion


// #region Funciones manipulación de HTML para reemplazar {{clave}} por el texto localizado, establecer hreflang y canonical.

export function CrearSolicitudConIdioma(contexto: Contexto, idioma: string, rutaSinIdioma: string): Request {

	const cabeceras = new Headers(contexto.Solicitud.headers);
	cabeceras.set(XIdioma, idioma);
	cabeceras.set('X-Ruta-Sin-Idioma', rutaSinIdioma);
	return new Request(contexto.Solicitud, { headers: cabeceras });

}


function ObtenerTextoDinámico(clave: string, detallesIdioma: DetallesIdioma): { texto: string; existe: boolean; } {
	if (clave === 'ruta-actual-codificada') return { texto: detallesIdioma.RutaActualCodificada, existe: true };
    return { texto: '', existe: false };
}


function ObtenerTexto(clave: string, detallesIdioma: DetallesIdioma): { texto: string; existe: boolean; } {

	const valorDinamico = ObtenerTextoDinámico(clave, detallesIdioma);
	if (valorDinamico.existe) return valorDinamico;

	const textoLocalizado = detallesIdioma.TextosIdioma[clave];
	if (textoLocalizado !== undefined) return { texto: textoLocalizado, existe: true };

	const textoPredeterminado = detallesIdioma.TextosPredeterminados[clave];
	if (textoPredeterminado !== undefined) return { texto: textoPredeterminado, existe: true };

	return { texto: clave, existe: false };

}


function ReemplazarClaves(textoOriginal: string, detallesIdioma: DetallesIdioma): { textoFinal: string; huboCambio: boolean; } {

	const textoFinal = textoOriginal.replace(/\{\{([^}]+)\}\}/g, (_coincidencia, claveCruda: string) => {

		const clave = claveCruda.trim();
		const { texto, existe } = ObtenerTexto(clave, detallesIdioma);

		if (!existe) {
			console.error(`No se encontró la traducción de la clave '${clave}' en el idioma '${detallesIdioma.Idioma}' ni en el idioma predeterminado. Se mostró la clave sin traducir.`);
			return `<span class='texto-rojo'>{{${clave}}}</span>`; // Si falta la clave en todos los diccionarios, se expone visualmente para detectar deuda de traduccion.
		}

		return texto;

	});

	return { textoFinal, huboCambio: textoFinal !== textoOriginal };

}


function ReemplazarClavesEnAtributo(valorOriginal: string, detallesIdioma: DetallesIdioma)
	: { valorFinal: string; huboCambio: boolean; } {

	const valorFinal = valorOriginal.replace(/\{\{([^}]+)\}\}/g, (_coincidencia, claveCruda: string) => {

		const clave = claveCruda.trim();
		const { texto, existe } = ObtenerTexto(clave, detallesIdioma);

		if (!existe) {
			console.error(`No se encontró la traducción de la clave '${clave}' en el idioma '${detallesIdioma.Idioma}' ni en el idioma predeterminado. Se mostró la clave sin traducir.`);
			return `{{${clave}}}`;
		}

		return Sanear(texto); // Se sanitiza para evitar que una traduccion con HTML rompa atributos o inyecte HTML.

	});

	return { valorFinal, huboCambio: valorFinal !== valorOriginal };

}


function ReemplazosContenido(transformadorHtml: HTMLRewriter, detallesIdioma: DetallesIdioma): HTMLRewriter {

	const selectorContenido = '[trad], [trad] *';
	return transformadorHtml.on(selectorContenido, {

		text(texto) {

			if (!texto.text.includes('{{')) return;
			const { textoFinal, huboCambio } = ReemplazarClaves(texto.text, detallesIdioma);
			if (huboCambio) texto.replace(textoFinal, { html: true });

		}

	});

}


function ReemplazosAtributos(transformadorHtml: HTMLRewriter, detallesIdioma: DetallesIdioma): HTMLRewriter {

	return transformadorHtml.on('[trad], [trad] *', {

		element(elemento) {

			const elementoAtributos = elemento as unknown as {
				attributes: IterableIterator<string[]>; setAttribute: (nombre: string, valor: string) => unknown;
			};
			const atributos = Array.from(elementoAtributos.attributes); // Snapshot antes de iterar para evitar el error de modificación durante la iteración.

			for (const [nombreAtributo, valorAtributo] of atributos) {

				if (nombreAtributo === 'trad' || !valorAtributo.includes('{{')) continue;
				const { valorFinal, huboCambio } = ReemplazarClavesEnAtributo(valorAtributo, detallesIdioma);
				if (huboCambio) elemento.setAttribute(nombreAtributo, valorFinal);

			}

		}

	});

}


function LimpiezaAtributoTrad(transformadorHtml: HTMLRewriter): HTMLRewriter {

	return transformadorHtml.on('[trad], [trad] *', {

		element(elemento) {
			if (elemento.getAttribute('trad') !== null) elemento.removeAttribute('trad');
		}

	});

}


function EstablecerAtributoIdioma(transformadorHtml: HTMLRewriter, idioma: Idioma): HTMLRewriter {
	return transformadorHtml.on('html', { element(elemento) { elemento.setAttribute('lang', idioma); }});
}


async function ObtenerContextoIdiomas(contexto: Contexto): Promise<DetallesIdioma> {

	const idioma = contexto.Idioma;
	const textosIdioma = ActivarTraducciónHtml ? await CargarTextosIdioma(contexto, idioma) : {};
	const textosPredeterminados = ActivarTraducciónHtml
		? (idioma === IdiomaPredeterminado ? textosIdioma : await CargarTextosIdioma(contexto, IdiomaPredeterminado))
		: {};
	const urlOrigen = contexto.Url.origin;
	const rutaActualCodificada = encodeURIComponent(`${contexto.Url.pathname}${contexto.Url.search}`);
	const rutaCanónicaSinPrefijo = contexto.Solicitud.headers.get('X-Ruta-Sin-Idioma') ?? contexto.Url.pathname;
	return { Idioma: idioma, TextosIdioma: textosIdioma, TextosPredeterminados: textosPredeterminados, UrlOrigen: urlOrigen,
		RutaCanónicaSinPrefijo: rutaCanónicaSinPrefijo, RutaActualCodificada: rutaActualCodificada };

}


export async function AplicarIdiomaYCanonicalARespuestaHtml(contexto: Contexto, respuestaBase: Response): Promise<Response> {

	if (contexto.Local && ActivarTraducciónHtml) {

		const htmlBase = await respuestaBase.text();

		if (htmlBase.includes('{{') && !htmlBase.includes(' trad ') && !htmlBase.includes(' trad>'))
			throw new Error("El HTML tiene un marcador '{{...}}' sin un atributo 'trad' que lo cubra. Opciones válidas: agregar 'trad' al elemento más cercano o a un contenedor padre que cubra todo el bloque.");
		respuestaBase = new Response(htmlBase, respuestaBase);

	}

	const detallesIdioma = await ObtenerContextoIdiomas(contexto);
	let transformadorHtml = new HTMLRewriter();

	if (ActivarTraducciónHtml) {
		transformadorHtml = ReemplazosContenido(transformadorHtml, detallesIdioma);
		transformadorHtml = ReemplazosAtributos(transformadorHtml, detallesIdioma);
	}

	transformadorHtml = EstablecerAtributoIdioma(transformadorHtml, detallesIdioma.Idioma);
	transformadorHtml = RegistrarEtiquetasSeo(contexto, transformadorHtml, detallesIdioma);
	transformadorHtml = LimpiezaAtributoTrad(transformadorHtml);
	return transformadorHtml.transform(respuestaBase);

}

// #endregion


// #region Rutas y redirecciones

export function ResolverMultidioma(contexto: Contexto): { rutaSinIdioma: string;
	solicitudConIdioma: Request | null; urlRedirección: URL | null; códigoRedirección: number | null; } {

	let urlRedirección: URL | null = null;
	let códigoRedirección: number | null = null;
	let solicitudConIdioma: Request | null = null;

	const idiomaCookie = ObtenerIdiomaDesdeCookie(contexto.Solicitud.headers.get('Cookie'));
	const { rutaConIdioma, rutaSinIdioma } = ExtraerIdiomaDeRuta(contexto.Url.pathname);
	const redirecciónPermitida = contexto.Solicitud.method === 'GET' || contexto.Solicitud.method === 'HEAD'; // Solo se redirigen por idioma las solicitudes GET y HEAD. En POST y demás métodos se resuelve el idioma internamente para evitar problemas con redirecciones que puedan cambiar el método o perder el cuerpo.

	if (rutaConIdioma === IdiomaPredeterminado) {

        if (redirecciónPermitida) {

			urlRedirección = new URL(contexto.Solicitud.url);
			urlRedirección.pathname = rutaSinIdioma;
			códigoRedirección = 301;

		} else {
			solicitudConIdioma = CrearSolicitudConIdioma(contexto, IdiomaPredeterminado, rutaSinIdioma);
		}

	} else {

		const idiomaAcceptLanguage = ObtenerIdiomaDesdeAcceptLanguage(contexto.Solicitud.headers.get('Accept-Language'));
		const idiomaEfectivo = rutaConIdioma ?? idiomaCookie ?? idiomaAcceptLanguage ?? IdiomaPredeterminado;	
		const debeRedirigirPorIdiomaCookie = !rutaConIdioma && ((idiomaCookie !== null && idiomaCookie !== IdiomaPredeterminado));
		const debeRedirigirPorIdiomaAcceptLanguage = !rutaConIdioma && idiomaCookie === null 
			&& ((idiomaAcceptLanguage !== null && idiomaAcceptLanguage !== IdiomaPredeterminado)); // Solo se redirige si el usuario no ha seleccionado un idioma manualmente (cookie) o si no está visitando una versión con prefijo de idioma.

       if ((debeRedirigirPorIdiomaCookie || debeRedirigirPorIdiomaAcceptLanguage) && redirecciónPermitida) {

			const rutaConIdiomaRedirección = debeRedirigirPorIdiomaCookie
				? ConstruirRutaConIdioma(idiomaCookie, rutaSinIdioma)
				: ConstruirRutaConIdioma(idiomaAcceptLanguage, rutaSinIdioma);
			urlRedirección = new URL(contexto.Solicitud.url);
			urlRedirección.pathname = rutaConIdiomaRedirección;
			códigoRedirección = 302;

		} else {
           solicitudConIdioma = CrearSolicitudConIdioma(contexto, idiomaEfectivo, rutaSinIdioma);
		}

	}

	return { rutaSinIdioma, solicitudConIdioma, urlRedirección, códigoRedirección };

}


function ObtenerIdiomaDesdeAcceptLanguage(header: string | null): Idioma { // Elige, de los idiomas del sitio, el que el navegador prefiere más según su valor q. Si la lista no trae ninguno, devuelve IdiomaRespaldo, porque el navegador sí dijo qué idiomas quiere y el predeterminado no está entre ellos.

	if (!header) return IdiomaPredeterminado; // Sin el encabezado, como en los buscadores y en los programas que no lo mandan, no hay ninguna preferencia y se usa el idioma predeterminado, para que los buscadores sigan viendo las rutas sin prefijo en ese idioma.

	let mejorIdioma: Idioma | null = null;
	let mejorQ = -1;

	for (const parte of header.split(',')) {

		const partesPuntoyComa = parte.trim().split(';');
		const tag = partesPuntoyComa[0].trim().toLowerCase();
		const qParte = partesPuntoyComa.find(p => p.trim().startsWith('q='));
		const q = qParte ? Number(qParte.trim().slice(2)) : 1;

		if (!tag || q <= mejorQ) continue;

		const idiomaCompleto = tag === '*' ? IdiomaPredeterminado : tag; // El comodín '*' acepta cualquier idioma, así que vale como el predeterminado, con su valor q, y no cae al respaldo como un idioma que el sitio no tiene.
		const idiomaCorto = tag.slice(0, 2);

		if (EsIdiomaSoportado(idiomaCompleto)) {

			mejorIdioma = idiomaCompleto;
			mejorQ = q;
			continue;

		}

		if (EsIdiomaSoportado(idiomaCorto)) {
			mejorIdioma = idiomaCorto;
			mejorQ = q;
		}

	}

	return mejorIdioma ?? IdiomaRespaldo; // Una lista sin ningún idioma del sitio, como la de un navegador solo en francés, va al idioma de respaldo.

}


export function ResolverCambioManualIdioma(url: URL): { idioma: string; urlRedirección: string; } | null {

	const coincidencia = /^\/cambiar-idioma\/([^/]+)$/i.exec(url.pathname);
	if (!coincidencia) return null;
	const idioma = coincidencia[1].toLowerCase();
	const urlRedirección = url.searchParams.get('redirigir-a') ?? '/';
	return { idioma, urlRedirección };

}


export function CrearRespuestaCambioIdioma(contexto: Contexto, datosCambio: { idioma: string; urlRedirección: string; }): Response {

	if (!EsIdiomaSoportado(datosCambio.idioma)) return new Response('Idioma no soportado', { status: 400 });

	const url = contexto.Url;
	const rutaSegura = ValidarRutaInterna(datosCambio.urlRedirección); // Se valida que la ruta de retorno sea interna (evitar Open Redirect).
	if (rutaSegura === null) return new Response('urlRedirección inválido', { status: 400 });

	const urlAuxiliar = new URL(rutaSegura, 'https://retorno.local'); // Se usa una base ficticia para poder usar el constructor de URL de forma segura.
	const { rutaSinIdioma } = ExtraerIdiomaDeRuta(urlAuxiliar.pathname);
	const nuevaRutaConIdioma = ConstruirRutaConIdioma(datosCambio.idioma, rutaSinIdioma);
	const urlEfectiva = new URL(url.toString());
	urlEfectiva.pathname = nuevaRutaConIdioma;
	urlEfectiva.search = urlAuxiliar.search;

	const cabeceras = new Headers();
	cabeceras.append('Set-Cookie', CrearCookieIdioma(contexto, datosCambio.idioma)); // Se actualiza la cookie antes de la redireccion final para evitar el rebote por regla de consistencia.
	cabeceras.set('Location', urlEfectiva.toString());
	return new Response(null, { status: 302, headers: cabeceras });

}

// #endregion
