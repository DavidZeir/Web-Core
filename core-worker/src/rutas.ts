import { ConAutenticación } from './nucleo/autenticacion';
import { DatosSeo, Manejador, ModoAutenticación } from './nucleo/global';
import { ValidarMapaSeo } from './nucleo/seo';
import { ManejadoresNúcleo, RutasExcluidasDeSitemapNúcleo } from './nucleo/rutas';
import { Ejemplo } from './proyecto/rutas/ejemplo';
import { EjemploIA } from './proyecto/rutas/ejemplo-ia';
import { EjemploAlerta } from './proyecto/rutas/ejemplo-alerta';
import { EjemploTextoAVoz } from './proyecto/rutas/ejemplo-texto-a-voz';


/**
 * CONVENCIÓN RUTAS CANÓNICAS, PARÁMETROS URL Y SEO:
 *
 * Toda URL que se quiera tratar como página real, estable, enlazable e indexable por buscadores debe tener una ruta canónica, un manejador, una entrada SEO propia en MapaSeo y no debe estar en RutasExcluidasDeSitemap.
 *
 * Usar segmentos de ruta para valores que definan contenido principal: categorías (/ropa/camisetas), localizaciones con contenido propio (/co/bogota), recursos estables (/articulos/i18n-edge) y paginación indexable (/epps/cascos/p2).
 *
 * Usar parámetros de URL para valores que modifiquen, filtren, ordenen o contextualicen una página base sin crear una URL canónica nueva: orden, filtros internos, búsqueda, vista de interfaz, tabs, modales, analítica, depuración, valores técnicos y experimentos A/B.
 *
 * Canonical, hreflang, og:url y sitemap deben construirse desde la ruta canónica sin parámetros de URL. Por eso, si una combinación de filtros se quiere posicionar en SEO, debe promoverse a página con ruta propia, por ejemplo /camiseta-verde-para-gimnasio. La combinación de filtros sigue existiendo internamente como parámetros, pero los enlaces públicos deben privilegiar la ruta SEO.
 *
 * El título SEO debe ser único por idioma para cada URL canónica indexable. Título y descripción no deben superar los máximos definidos en configuracion.ts. Si dos rutas indexables necesitan compartir contenido, revisar si realmente son dos canónicas distintas o si una debe redirigir, excluirse del sitemap o usar canonical hacia la ruta principal.
 */
export const Manejadores: Record<string, Manejador> = { // Para agregar una nueva página: 1. Crear src/nombre del proyecto/rutas/mi-pagina.ts creando una función export async function ManejarMiPágina(...). 2. Añadir el manejador al inicio de este archivo. 3. Añadir una entrada a continuación, así: '/mi-pagina': ManejarMiPágina. 4. Añadir a MapaSeo. 5. Si se agrega HTML nuevo, se debe agregar la variable de HTML compilado nuevo en respuestas.ts.
	...ManejadoresNúcleo, // Ejemplo página autenticada: '/pagina-autenticada': c => ConAutenticación(c, ModoAutenticación.Cliente, PáginaAutenticada),
	'/ejemplo': Ejemplo,
	'/ejemplo-alerta': c => ConAutenticación(c, ModoAutenticación.Cliente, EjemploAlerta),
	'/ejemplo-ia': c => ConAutenticación(c, ModoAutenticación.Cliente, EjemploIA),
	'/ejemplo-texto-a-voz': c => ConAutenticación(c, ModoAutenticación.Cliente, EjemploTextoAVoz), // Ejemplo página autenticada con datos extra del usuario: '/pagina-requiere-datos-extra-de-usuario': c => ConAutenticación(c, ModoAutenticación.BaseDeDatos, PáginaDatosExtra, { columnasExtra: 'ColumnaExtra1' }),
};


export const RutasExcluidasDeSitemap: string[] = [ // Añadir aquí rutas que no deben aparecer en el sitemap.xml, como páginas de prueba, internas que requieren autenticación, de HTMX o cualquier ruta que no sea relevante para SEO. Esto es importante para evitar que motores de búsqueda indexen páginas que no aportan valor y mantenerlos enfocados en las páginas principales del sitio.
	...RutasExcluidasDeSitemapNúcleo, '/ejemplo', '/ejemplo-ia', '/ejemplo-alerta', '/ejemplo-texto-a-voz',
];


const DatosSeoPredeterminados = {
	es: {
		Título: 'Web Core - Título de Web Core',
		Descripción: 'Descripción de Web Core',
		Imagen: '/img/imagen-redes.png'
	},
	en: {
		Título: 'Web Core - Web Core Title',
		Descripción: 'Web Core Description',
		Imagen: '/img/imagen-redes.png'
	}
};


export const MapaSeo: Record<string, Record<string, DatosSeo>> = ValidarMapaSeo({
	default: DatosSeoPredeterminados,
	'/': DatosSeoPredeterminados,
	'/inicio': DatosSeoPredeterminados,
	'/sitemap.xml': DatosSeoPredeterminados,
}, Manejadores, RutasExcluidasDeSitemap);
