import fs from "node:fs"; // IMPORTANTE: Cada vez que edites este archivo, corre sus pruebas con node Programas/pruebas-reglas-diseno.mts, desde la raíz del proyecto, porque el Verificador no las corre. Este archivo revisa que los colores, las fuentes, los pesos, los tamaños de letra, los interlineados, los redondeados, los bordes, los espacios, las sombras y la opacidad de lo desactivado de la web salgan de las variables de global.css, que el tema alternativo solo cambie colores y, si el proyecto declara un documento de marca, que esas variables salgan de él, para que no aparezcan colores casi iguales ni tamaños a un píxel de la escala. Es igual en todos los proyectos que salen de Web Core, y lo propio de cada uno va en reglas-diseno-proyecto.mts. Se corre con npm run reglas, y deploy lo corre antes de subir. Un proyecto que no la quiera la quita del script reglas de su package.json. Node lo carga sin compilarlo.
import path from "node:path";
import { pathToFileURL } from "node:url";


interface LoPropioDelProyecto { // Lo que cada proyecto puede agregar en Programas/reglas-diseno-proyecto.mts, cada cosa con un comentario que diga por qué.
	PáginasExcluidas?: string[]; // Las plantillas que no siguen la marca o no pueden usar variables, como static/html/pruebas.html.
	DocumentoDeMarca?: string; // La ruta, desde la raíz del proyecto, del documento con los colores, las fuentes, los pesos, los tamaños, los interlineados, los redondeados, los bordes, los espacios y las sombras aprobados, en tablas con el nombre de cada variable y su valor, como | color-primario | 802db3 | y | texto-m | 16 |.
	DocumentoDeDiseño?: string; // La ruta del documento con los colores de la interfaz, los del tema alternativo, el color de las sombras, la opacidad de lo desactivado y el ancho del contenido, en tablas con la misma forma. La regla los compara igual que los de la marca.
	VariablesDeTamaño?: string[]; // Las variables locales que guardan un tamaño de letra de la escala, como --pie-tamano, cuyo valor se revisa igual que el de font-size.
	FactorTamañoTextoEscritorio?: number; // Cuántas veces más grandes se ven los textos de la web en pantalla grande que los números del documento de marca, como 1.25 si la aplicación es compacta y la web se lee más grande. Vale 1 si no se declara.
	FactorTamañoTextoMóvil?: number; // Lo mismo dentro de un @media con max-width, como 0.875 si el documento trae los tamaños de pantalla grande y el teléfono los usa más pequeños. Vale 1 si no se declara.
	ColumnaDeLaEscala?: string; // La columna de la tabla de los tamaños que se compara, como Normal o Compacto, para un medio que necesita una escala más apretada. Vale Normal si no se declara.
}


interface Declaración {
	Archivo: string;
	Línea: number;
	Propiedad: string;
	Valor: string;
	EnPantallaAngosta: boolean; // Está dentro de un @media con max-width, donde las variables de texto se comparan con la marca usando el factor del móvil.
	EnTemaAlternativo: boolean; // Está dentro del tema alternativo, que solo puede cambiar colores, y cuyos colores solo se comparan con la marca si ella los trae.
	EnDesactivado: boolean; // Está dentro del bloque de un control desactivado, como button:disabled, o en el atributo style de uno, donde la opacidad sale de su variable.
}


const Carpeta = process.cwd(); // La carpeta del worker, donde npm run reglas abre este archivo.
const ArchivoVariables = "static/css/global.css"; // El único archivo donde se pueden escribir colores, fuentes, pesos, tamaños, interlineados, redondeados, bordes, espacios, sombras y la opacidad de lo desactivado, y solo como variables.
const RutaDelProyecto = path.join(import.meta.dirname, "reglas-diseno-proyecto.mts"); // Lo propio del proyecto. Se carga solo si existe, porque un proyecto nuevo todavía no tiene nada propio.
const DelProyecto: LoPropioDelProyecto = fs.existsSync(RutaDelProyecto) ? await import(pathToFileURL(RutaDelProyecto).href) : {};
const PáginasExcluidas = new Set([ // No siguen la marca o no pueden usar variables.
	"static/html/nucleo/correo-enlace-magico.html", // Es un correo, y muchos programas de correo no entienden variables.
	...(DelProyecto.PáginasExcluidas ?? []),
]);
const VariablesDeTamaño = new Set(DelProyecto.VariablesDeTamaño ?? []);
const DocumentoDeMarca = DelProyecto.DocumentoDeMarca ?? "";
const DocumentoDeDiseño = DelProyecto.DocumentoDeDiseño ?? "";
const DocumentosDeValores = [DocumentoDeMarca, DocumentoDeDiseño].filter(ruta => ruta !== "").join(" o "); // Para los mensajes, que dicen dónde se aprueba un valor.
const FactorTamañoTextoEscritorio = DelProyecto.FactorTamañoTextoEscritorio ?? 1;
const FactorTamañoTextoMóvil = DelProyecto.FactorTamañoTextoMóvil ?? 1;
const ColumnaDeLaEscala = DelProyecto.ColumnaDeLaEscala ?? "Normal";
const PíxelesPorRem = 16; // El tamaño normal de un rem en los navegadores, y el factor único para pasar de rem a los números del documento de marca, que son los de un programa de diseño.
const MargenDeMedida = 0.5; // Menos de medio píxel no se nota, y deja que 0.87rem, que da 13,92, coincida con el 14 del documento.
const Marca = `${LeerDocumento(DocumentoDeMarca)}\n${LeerDocumento(DocumentoDeDiseño)}`; // Los dos documentos se leen como uno solo, porque cada variable tiene su fila en uno de ellos.
const SecciónTemaAlternativo = Marca.split(/^(?=#)/m).find(sección => /^#+ +el tema (?:de color )?alternativo\b/.test(sección)) ?? ""; // Del título 'El tema de color alternativo' hasta el título siguiente. También vale 'El tema alternativo', el título que traen algunos documentos de diseño, para que su tabla no se lea como la del tema principal.
const [FilasDeLaMarca, FilasPendientes, ColumnaDeLaEscalaEncontrada] = LeerFilasDeLasTablas(Marca.replace(SecciónTemaAlternativo, "")); // Las del tema principal, y aparte las que todavía no se llenan. Mientras una familia no traiga valores, no hay contra qué comparar sus variables, y la regla solo exige usarlas.
const [FilasDelTemaAlternativo] = LeerFilasDeLasTablas(SecciónTemaAlternativo); // Sus pendientes no hacen falta, porque en el tema alternativo lo que el documento no trae ya queda libre.
const CómoAgregarColor = FamiliaTieneValores(FilasDeLaMarca, "color-") ? `pídele al Director que lo apruebe en ${DocumentosDeValores}, sin agregarlo tú` : `agrégalo como variable en ${ArchivoVariables}`; // Si la marca ya tiene valores, los nuevos los aprueba el Director, porque ese documento dice qué se puede usar.
const CómoAgregarTamaño = FamiliaTieneValores(FilasDeLaMarca, "texto-") ? `pídele al Director que lo apruebe en la escala de ${DocumentosDeValores}, sin agregarlo tú` : `agrégalo como variable --texto-... en ${ArchivoVariables}`;
const CómoAgregarRedondeado = FamiliaTieneValores(FilasDeLaMarca, "radio-") ? `pídele al Director que lo apruebe en ${DocumentosDeValores}, sin agregarlo tú` : `agrégalo como variable --radio-... en ${ArchivoVariables}`;
const CómoAgregarBorde = FamiliaTieneValores(FilasDeLaMarca, "borde-") ? `pídele al Director que lo apruebe en ${DocumentosDeValores}, sin agregarlo tú` : `agrégalo como variable --borde-... en ${ArchivoVariables}`;
const CómoAgregarInterlineado = FamiliaTieneValores(FilasDeLaMarca, "interlineado-") ? `pídele al Director que lo apruebe en ${DocumentosDeValores}, sin agregarlo tú` : `agrégalo como variable --interlineado-... en ${ArchivoVariables}`;
const CómoAgregarFuente = FamiliaTieneValores(FilasDeLaMarca, "fuente-") ? `pídele al Director que la apruebe en ${DocumentosDeValores}, sin agregarla tú` : `agrégala como variable --fuente-... en ${ArchivoVariables}`;
const CómoAgregarPeso = FamiliaTieneValores(FilasDeLaMarca, "peso-") ? `pídele al Director que lo apruebe en ${DocumentosDeValores}, sin agregarlo tú` : `agrégalo como variable --peso-... en ${ArchivoVariables}`;
const CómoAgregarSombra = FamiliaTieneValores(FilasDeLaMarca, "sombra-") ? `pídele al Director que la apruebe en ${DocumentosDeValores}, sin agregarla tú` : `agrégala como variable --sombra-... en ${ArchivoVariables}`;
const CómoAgregarOpacidad = FamiliaTieneValores(FilasDeLaMarca, "opacidad-") ? `pídele al Director que la apruebe en ${DocumentosDeValores}, sin agregarla tú` : `agrégala como variable --opacidad-... en ${ArchivoVariables}`;
const ExpresiónColor =
	/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|(?<![-\w])(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)(?![-\w(])/i; // Los hexadecimales, las funciones de color y los 148 nombres de color de CSS, sin confundir color-mix, grayscale, white-space ni la función tan, por las guardas de los dos lados.
const ExpresiónTamañoPermitido = /^var\(--texto-[a-z0-9-]+\)$|^clamp\(\s*var\(--texto-[a-z0-9-]+\)\s*,.+,\s*var\(--texto-[a-z0-9-]+\)\s*\)$|^\d*\.?\d+em$/; // Las variables de la escala, con letras y números en su nombre, como --texto-m o --texto-4xl, los títulos que se encogen, con un nivel de la escala como su mínimo y otro como su máximo, y en medio una medida libre, como 11vw, y los tamaños que dependen de su texto.
const ExpresiónRedondeadoPermitido = /^(?:0|inherit|var\(--radio-[a-z0-9-]+\))$/; // Las variables y lo que no depende de la marca: sin redondeado y lo heredado. La píldora y el círculo van con --radio-completo.
const ExpresiónPropiedadDeBorde = /^(?:border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?(?:-width)?|outline(?:-width)?)$/; // Las propiedades que llevan el grosor de un borde o de un contorno, como border, border-top, border-width y outline. Las del color, como border-color, y la del redondeado no son de estas.
const ExpresiónPropiedadDeColorDeBorde = /^(?:border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?-color|outline-color)$/; // Las propiedades que llevan solo el color de un borde o de un contorno, como border-color, border-top-color y outline-color.
const ExpresiónColorDeBordePermitido = /^(?:inherit|currentcolor|transparent|var\(--color-[a-z0-9-]+\)|color-mix\(.*\))$/i; // El color de un borde, también fuera del atajo border: una variable de color, o lo que no depende de la marca.
const Familias = ["color", "texto", "radio", "fuente", "peso", "interlineado", "borde", "espacio", "sombra", "opacidad", "ancho"]; // Las familias de las variables. Una variable es de la familia de la primera de estas palabras que lleve en su nombre, esté donde esté, para que una variable local también se reconozca con el nombre de su componente adelante, como pide USE CSS. Así, --tarjeta-color-borde es de color, y --color-texto-suave también, aunque lleve otra familia después.
const ExpresiónParteDeBordePermitida = /^(?:0|none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset|auto|inherit|currentcolor|transparent|var\(--(?:borde|color)-[a-z0-9-]+\)|color-mix\(.*\))$/i; // Cada parte de un borde: su grosor, que sale de las variables o es 0, su estilo y su color, que sale de una variable de color.
const ExpresiónVariableDeLaEscala = /--texto-[a-z0-9-]+|--(?:radio|fuente|peso|interlineado|borde|espacio|sombra|opacidad)-[a-z0-9-]+/g; // Las variables de las familias de la escala que no son colores, para revisar que las que se usan existan. Sus nombres llevan letras, números y guiones, como --texto-4xl o --espacio-2xl. Las de color se revisan aparte.
const ExpresiónFuentePermitida = /^(?:inherit|var\(--fuente-[a-z0-9-]+\))$/; // Las variables de la marca y lo heredado, para que un diseño use solo las fuentes definidas, sin importar cuál lleve cada cosa.
const ExpresiónPesoPermitido = /^(?:inherit|var\(--peso-[a-z0-9-]+\))$/; // Las variables de la marca y lo heredado, porque cada fuente trae sus propios pesos, y la marca decide cuál es su negrita.
const ExpresiónInterlineadoPermitido = /^(?:0|inherit|var\(--interlineado-[a-z0-9-]+\))$/; // Las variables de la marca, lo heredado y el 0, que no es un interlineado de la marca sino un recurso para que un texto no le sume alto a su caja y acomodarla con otras reglas. Si una marca quiere un interlineado más apretado, lo cambia en su variable.
const ExpresiónSombraPermitida = /^(?:none|inherit|var\(--sombra-[a-z0-9-]+\))$/; // Las sombras de la escala, ninguna o la heredada. Las de los textos y los filtros no se revisan, y se escriben con su valor.
const ExpresiónOpacidadPermitida = /^(?:inherit|var\(--opacidad-[a-z0-9-]+\))$/; // Las variables y lo heredado, para que todos los controles desactivados se vean igual de desteñidos.
const ExpresiónDesactivado = /:disabled\b|\[\s*disabled\b|\[\s*aria-disabled\s*(?:\]|=\s*["']?true\b)/; // Los selectores de un control desactivado: :disabled, [disabled], [aria-disabled] y [aria-disabled='true'], también con los espacios que CSS permite dentro de los corchetes, y no [aria-disabled='false'], que es uno activo.
const ExpresiónPropiedadDeEspacio = /^(?:padding|margin)(?:-[a-z-]+)?$|^(?:row-|column-)?gap$/; // Las propiedades de los espacios: padding, margin y gap, también con un solo lado, como margin-top o padding-inline.
const ExpresiónMedidaDePantalla = /^\d*\.?\d+(?:vw|vh|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|%)$/; // Lo que cambia con el tamaño de la pantalla, que solo vale dentro de clamp, min o max, con la escala en sus extremos.
const VariableDeEspacio = String.raw`var\(--espacio-[a-z0-9-]+\)`; // Una variable de la escala de los espacios, para armar las expresiones que siguen.
const ExpresiónVariableDeEspacio = new RegExp(`^${VariableDeEspacio}$`);
const ExpresiónAjusteFino = new RegExp(String.raw`^calc\(\s*${VariableDeEspacio}\s+[+-]\s+(\d*\.?\d+(?:px|rem))\s*\)$`); // Una sola variable más o menos un número, como calc(var(--espacio-m) + 1px). CSS exige los espacios alrededor de la suma y de la resta.
const ExpresiónMargenNegativo = new RegExp(
	String.raw`^calc\(\s*(?:${VariableDeEspacio}\s*\*\s*-1|-1\s*\*\s*${VariableDeEspacio})\s*\)$`); // Una variable por -1, lo único que se puede multiplicar, porque cambia la dirección del margen sin crear un tamaño. Multiplicar o dividir por otro número fabricaría un escalón que no está en la escala.


function FamiliaDeVariable(nombre: string): string | undefined { // La primera palabra de familia del nombre, como color en --tarjeta-color-borde, o nada si no lleva ninguna.
	return nombre.replace(/^--/, "").split("-").find(palabra => Familias.includes(palabra));
}


function NormalizarVariablesLocales(valor: string): string { // Escribe cada variable local como una de su familia, como var(--tarjeta-color-borde) como var(--color-local), para que las expresiones de lo permitido la reconozcan sin buscar la familia en cada una. Las de global.css quedan igual, porque su nombre ya empieza por su familia.

	return valor.replace(/var\((--[\w-]+)\)/g, (variable, nombre: string) => {

		const familia = FamiliaDeVariable(nombre);
		return familia === undefined || nombre.startsWith(`--${familia}-`) ? variable : `var(--${familia}-local)`;

	});

}


function LeerDocumento(ruta: string): string { // Queda vacío si el proyecto no lo declara. Si lo declara y no existe, falla aquí, para que la comparación no se apague en silencio. Se lee en minúsculas, para comparar sin importar cómo se escribió cada valor.
	return ruta === "" ? "" : fs.readFileSync(path.join(Carpeta, "..", ruta), "utf8").toLowerCase();
}


function LeerPrimeraFuente(fuentes: string): string { // El nombre de la fuente que se va a usar, sin los repuestos que la siguen ni sus comillas, y en minúsculas, como quedó leído el documento de marca.
	return fuentes.split(",")[0].replaceAll(/["']/g, "").trim().toLowerCase();
}


function LeerFilasDeLasTablas(texto: string): [Map<string, string>, Set<string>, boolean] { // Las filas de las tablas, con su nombre y su valor, como | color-fondo | fffdf9 |, con comillas invertidas o sin ellas, porque la fila ya dice qué es cada cosa. Una tabla empieza en su línea de guiones y termina en la primera línea sin barras. Lo que esté en otra parte del documento no cuenta, ni dentro de un bloque de código, porque puede ser un ejemplo o una nota, y las filas sin valor tampoco. Las que todavía tienen la marca de la plantilla entre corchetes dobles, como [[Lo decide el Director]], van aparte, como pendientes: el Director las puede dejar para después, y mientras tanto sus variables no se comparan, aunque su familia ya tenga otras filas llenas. El valor sale de la columna que se llama Valor, o, en la tabla de los tamaños, de la que se llama como ColumnaDeLaEscala, y una tabla sin ninguna de las dos no cuenta. También dice si alguna tabla tiene la columna de la escala.

	const filas = new Map<string, string>();
	const pendientes = new Set<string>();
	let enBloqueDeCódigo = false;
	let enTabla = false;
	let encabezado: string[] = []; // Las celdas de la línea anterior, que son el encabezado cuando la línea actual es la de los guiones.
	let columnaDelValor = -1;
	let columnaEncontrada = false;
	for (const línea of texto.split("\n").map(l => l.trim())) {

		if (línea.startsWith("```")) enBloqueDeCódigo = !enBloqueDeCódigo;
		const celdas = línea.replace(/^\|/, "").split("|").map(c => c.replaceAll("`", "").trim()); // Markdown permite escribir las filas sin la barra del principio, así que se quita para que el nombre siempre sea la primera celda.
		const valor = celdas[columnaDelValor] ?? "";
		const tieneValor = enTabla && valor !== "";
		if (tieneValor && valor.startsWith("[[")) pendientes.add(celdas[0]);
		if (tieneValor && !valor.startsWith("[[")) filas.set(celdas[0], valor);
		if (!línea.includes("|")) enTabla = false;
		if (!enBloqueDeCódigo && línea.includes("|") && /^[|:\s-]*-[|:\s-]*$/.test(línea)) {

			enTabla = true;
			const columnaDeLaEscala = encabezado.indexOf(ColumnaDeLaEscala.toLowerCase()); // Las columnas se buscan por su nombre, y no por su posición, en minúsculas, como quedó leído el documento.
			columnaDelValor = columnaDeLaEscala > 0 ? columnaDeLaEscala : encabezado.indexOf("valor");
			if (columnaDeLaEscala > 0) columnaEncontrada = true;

		}
		encabezado = celdas;

	}
	return [filas, pendientes, columnaEncontrada];

}


function FamiliaTieneValores(filas: Map<string, string>, prefijo: string): boolean { // Si el documento ya trae algún valor de esa familia, como los colores.
	return [...filas.keys()].some(nombre => nombre.startsWith(prefijo));
}


function Blanquear(texto: string): string { // Cambia cada carácter por un espacio, conservando los saltos de línea, para quitar un pedazo sin mover las posiciones ni los números de línea de los errores.
	return texto.replace(/[^\r\n]/g, " ");
}


function TieneColor(valor: string): boolean { // Una ruta o un texto entre comillas pueden contener un nombre de color sin serlo.
	return ExpresiónColor.test(valor.replace(/url\([^)]*\)|"[^"]*"|'[^']*'/g, ""));
}


function LeerDeclaraciones(archivo: string, css: string, líneaInicial: number): Declaración[] { // Recorre el CSS carácter por carácter, llevando la pila de bloques abiertos, para saber en qué @media queda cada declaración.

	const declaraciones: Declaración[] = [];
	const bloques: string[] = [];
	let pendiente = "";
	let línea = líneaInicial;
	let líneaPendiente = líneaInicial;
	let comilla = "";
	const agregar = (): void => {

		const separador = pendiente.indexOf(":");
		if (separador > 0 && !bloques.some(bloque => bloque.startsWith("@font-face"))) // Lo de un @font-face no cuenta, porque define una fuente y no la usa, y ahí CSS no acepta variables.
			declaraciones.push({ Archivo: archivo, Línea: líneaPendiente,
				Propiedad: pendiente.slice(0, separador).trim().toLowerCase(), Valor: pendiente.slice(separador + 1).trim(),
				EnPantallaAngosta: bloques.some(bloque => bloque.startsWith("@media") && bloque.includes("max-width")),
				EnTemaAlternativo: bloques.some(bloque => bloque.includes("data-tema")),
				EnDesactivado: bloques.some(bloque => ExpresiónDesactivado.test(bloque.replaceAll(/:not\([^)]*\)/g, ""))) }); // Lo que va dentro de :not() no cuenta, porque es lo contrario, como en button:not(:disabled):hover.
		pendiente = "";

	};

	for (const carácter of css.replace(/\/\*[\s\S]*?\*\//g, Blanquear)) { // Los comentarios no cuentan.

		if (carácter === "\n") línea++;
		if (comilla !== "") {
			if (carácter === comilla) comilla = "";
			pendiente += carácter;
		} else if (carácter === "\"" || carácter === "'") {
			comilla = carácter;
			pendiente += carácter;
		} else if (carácter === "{") {
			bloques.push(pendiente.trim());
			pendiente = "";
		} else if (carácter === "}") {
			agregar();
			bloques.pop();
		} else if (carácter === ";") {
			agregar();
		} else {
			if (pendiente.trim() === "" && !/\s/.test(carácter)) líneaPendiente = línea; // El error apunta a donde empieza la declaración, y no a donde termina.
			pendiente += carácter;
		}

	}

	agregar(); // La última declaración de un atributo style casi nunca termina en punto y coma.
	return declaraciones;

}


function LeerDeclaracionesDeHtml(archivo: string, html: string): Declaración[] { // Los bloques <style> y los atributos style de una plantilla. Los SVG dentro del HTML, como el logo de Google o un ícono exportado de un programa de dibujo, quedan por fuera con todos sus colores, también los de sus atributos style.

	const sinSvg = html.replace(/<svg\b[\s\S]*?<\/svg>/gi, Blanquear);
	const líneaDe = (posición: number): number => sinSvg.slice(0, posición).split("\n").length;
	const deBloques = [...sinSvg.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
		.flatMap(bloque => LeerDeclaraciones(archivo, bloque[1], líneaDe(bloque.index + bloque[0].indexOf(">") + 1)));
	const deAtributos = [...sinSvg.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].flatMap(atributo => {

		const fin = sinSvg.indexOf(">", atributo.index + atributo[0].length) + 1; // Donde termina la etiqueta que lleva el atributo.
		const etiqueta = sinSvg.slice(sinSvg.lastIndexOf("<", atributo.index), fin); // Para saber si es la de un control desactivado.
		const desactivada = /\sdisabled(?![\w-])/i.test(etiqueta.replaceAll(/"[^"]*"|'[^']*'/g, ""))
			|| /\saria-disabled\s*=\s*["']?true\b/i.test(etiqueta); // Con el atributo disabled, buscado fuera de los valores de los demás atributos, para que un título que diga disabled no cuente, o con aria-disabled en true.
		return LeerDeclaraciones(archivo, atributo[1] ?? atributo[2], líneaDe(atributo.index))
			.map(declaración => ({ ...declaración, EnDesactivado: desactivada }));

	});
	return [...deBloques, ...deAtributos];

}


function ListarArchivos(carpeta: string, extensión: string): string[] { // Los archivos con esa extensión que hay en la carpeta y en sus subcarpetas, con su ruta relativa al worker.

	return fs.readdirSync(path.join(Carpeta, carpeta), { withFileTypes: true, recursive: true })
		.filter(entrada => entrada.isFile() && entrada.name.endsWith(extensión))
		.map(entrada => path.relative(Carpeta, path.join(entrada.parentPath, entrada.name)).replaceAll("\\", "/"));

}


function PartirPorFuera(valor: string, separador: RegExp): string[] { // Parte un valor por los separadores que quedan por fuera de los paréntesis, para que calc(var(--espacio-m) + 1px) quede entero aunque tenga espacios.

	const partes: string[] = [];
	let actual = "";
	let nivel = 0;
	for (const carácter of valor) {

		if (carácter === "(") nivel++;
		if (carácter === ")") nivel--;
		if (nivel === 0 && separador.test(carácter)) {
			if (actual.trim() !== "") partes.push(actual.trim());
			actual = "";
		} else {
			actual += carácter;
		}

	}
	if (actual.trim() !== "") partes.push(actual.trim());
	return partes;

}


function EsEspacioPermitido(medida: string, primerEscalón: number): boolean { // Una medida de padding, margin o gap que respeta la escala: 0, auto, inherit, una variable, un número más pequeño que el primer escalón, un ajuste fino de menos que eso sobre una sola variable, una variable por -1, o clamp, min y max con la escala en sus extremos y lo que depende de la pantalla en el medio.

	const número = /^-?(\d*\.?\d+(?:px|rem))$/.exec(medida)?.[1] ?? ExpresiónAjusteFino.exec(medida)?.[1]; // El número suelto, sin su signo, o el del ajuste fino.
	const función = /^(clamp|min|max)\((.*)\)$/.exec(medida);
	if (/^(?:0|auto|inherit)$/.test(medida) || ExpresiónVariableDeEspacio.test(medida) || ExpresiónMargenNegativo.test(medida)) {
		return true;
	} else if (número !== undefined) {
		return (ConvertirAMedidaDeMarca(número, 1) ?? Infinity) < primerEscalón;
	} else if (función !== null) {

		const argumentos = PartirPorFuera(función[2], /,/);
		const deLaEscala = argumentos.map(argumento => EsEspacioPermitido(argumento, primerEscalón));
		const valen = argumentos.every((argumento, i) => deLaEscala[i] || ExpresiónMedidaDePantalla.test(argumento));
		return función[1] === "clamp" ? argumentos.length === 3 && valen && deLaEscala[0] && deLaEscala[2]
			: valen && deLaEscala.some(Boolean); // En clamp, el mínimo y el máximo salen de la escala. En min y max, al menos uno, que es el que pone el límite.

	} else {
		return false;
	}

}


function RevisarDeclaración(declaración: Declaración, nivelesDeLaEscala: Set<string>, variablesDefinidas: Set<string>,
	escalaDeEspacios: Map<string, number>, errores: string[]): void { // Un color, un tamaño o un espacio escrito a mano, fuera de lo que puede quedarse con su valor propio.

	const { Archivo: archivo, Línea: línea, Propiedad: propiedad, Valor: valor, EnDesactivado: enDesactivado,
		EnTemaAlternativo: enTemaAlternativo } = declaración;
	const lugar = `${archivo}:${línea}`;
	const esDefiniciónPermitida = archivo === ArchivoVariables && propiedad.startsWith("--");
	const valorConSuFamilia = NormalizarVariablesLocales(valor); // Para revisar lo permitido. La existencia de las variables se revisa con el valor tal cual, porque las locales no están en global.css.
	const familiaDeLaPropiedad = propiedad.startsWith("--") ? FamiliaDeVariable(propiedad) : undefined;
	const esLocalDe = (familia: string): boolean => familiaDeLaPropiedad === familia && !esDefiniciónPermitida; // Una variable local de esa familia, como --radio-m o --tarjeta-radio-esquina en una plantilla, se usa igual que la propiedad, así que su valor se revisa igual.
	const esSombra = propiedad.endsWith("-shadow") || valor.includes("drop-shadow(");
	if (TieneColor(valor) && !esDefiniciónPermitida && !esSombra)
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' tiene un color escrito a mano. Usa una variable de ${ArchivoVariables} o, si hace falta un color nuevo, ${CómoAgregarColor}.`);
	const usaColoresQueExisten = [...valor.matchAll(/--color-[a-z0-9-]+/g)].every(([nombre]) => nivelesDeLaEscala.has(nombre)); // Una variable de color que no existe no se notaría: el navegador ignora la declaración, también dentro de un color-mix, y el elemento se queda con otro color.
	if (!usaColoresQueExisten)
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' usa una variable de color que no existe en ${ArchivoVariables}. Usa una que exista o, si hace falta un color nuevo, ${CómoAgregarColor}.`);
	const localesQueNoExisten = [...valor.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, nombre]) => nombre).filter(nombre => {
		const familia = FamiliaDeVariable(nombre);
		return familia !== undefined && !nombre.startsWith(`--${familia}-`) && !variablesDefinidas.has(nombre);
	}); // Una variable local con una familia en su nombre, como --tarjeta-espacio-arriba, pasa por una de su familia en lo permitido, así que su existencia se revisa aquí, por su nombre real: con un nombre que no existe, el navegador descarta la declaración.
	if (localesQueNoExisten.length > 0)
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' usa una variable local que no está definida en ninguna plantilla ni en ${ArchivoVariables}: ${localesQueNoExisten.join(", ")}. Defínela o corrige su nombre, porque con una variable que no existe el navegador descarta lo que la usa.`);
	const esVariableDeTamaño = VariablesDeTamaño.has(propiedad) || esLocalDe("texto"); // Guardan un tamaño de letra en una plantilla, así que su valor se revisa igual que el de font-size, para que los tamaños a mano queden solo en la escala de global.css.
	const esTamaño = propiedad === "font-size" || esVariableDeTamaño || (propiedad === "font" && valor !== "inherit"); // El atajo font solo se acepta como inherit, porque esconde el tamaño entre sus partes y el proyecto usa font-size.
	const variableUsada = /^var\((--[\w-]+)\)$/.exec(valor)?.[1];
	const esVariableDelProyecto = variableUsada !== undefined && VariablesDeTamaño.has(variableUsada);
	const usaNivelesQueExisten = [...valor.matchAll(ExpresiónVariableDeLaEscala)]
		.every(([nombre]) => nivelesDeLaEscala.has(nombre)); // Un nombre que no existe no se notaría: el navegador lo descarta, y el texto hereda otro tamaño.
	if (esDefiniciónPermitida && !usaNivelesQueExisten)
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' usa una variable que no existe en ${ArchivoVariables}. Usa una que exista, porque con una que no existe, esta variable se queda sin valor, y lo que la usa también.`);
	if (esTamaño && !esVariableDelProyecto && !(ExpresiónTamañoPermitido.test(valorConSuFamilia) && usaNivelesQueExisten))
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa la escala de tamaños. Usa font-size con una variable --texto-... de ${ArchivoVariables} o, si hace falta un nivel nuevo, ${CómoAgregarTamaño}.`);
	const usaRedondeadosPermitidos = valorConSuFamilia.split(/\s+/).every(parte => ExpresiónRedondeadoPermitido.test(parte)); // Cada esquina puede llevar el suyo, como en var(--radio-m) var(--radio-m) 0 0.
	if ((propiedad.endsWith("-radius") || esLocalDe("radio")) && !(usaRedondeadosPermitidos && usaNivelesQueExisten))
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa los redondeados. Usa una variable --radio-... de ${ArchivoVariables}, como --radio-completo para una píldora o un círculo, 0 o inherit. Si hace falta uno nuevo, ${CómoAgregarRedondeado}.`);
	const usaBordesPermitidos = PartirPorFuera(valorConSuFamilia, /\s/)
		.every(parte => ExpresiónParteDeBordePermitida.test(parte) || TieneColor(parte)); // Cada parte de un borde, como en var(--borde-s) solid var(--color-borde). Un color escrito a mano ya lo reporta la regla de los colores, y aquí no se repite.
	if ((ExpresiónPropiedadDeBorde.test(propiedad) || esLocalDe("borde")) && !(usaBordesPermitidos && usaNivelesQueExisten))
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa los grosores de los bordes. Usa una variable --borde-... de ${ArchivoVariables}, 0 o none, y su color con una variable de color. Si hace falta uno nuevo, ${CómoAgregarBorde}.`);
	const usaColoresDeBordePermitidos = PartirPorFuera(valorConSuFamilia, /\s/)
		.every(parte => ExpresiónColorDeBordePermitido.test(parte) || TieneColor(parte)); // Un lado puede llevar su propio color, como en border-color: var(--color-borde) transparent.
	if (ExpresiónPropiedadDeColorDeBorde.test(propiedad) && !usaColoresDeBordePermitidos) // El color de un borde se revisa igual dentro del atajo border que fuera de él.
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa un color de la marca. Usa una variable de color, como var(--color-borde), o inherit, currentcolor o transparent.`);
	if ((propiedad === "font-family" || esLocalDe("fuente")) && !(ExpresiónFuentePermitida.test(valorConSuFamilia) && usaNivelesQueExisten))
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa las fuentes de la marca. Usa una variable --fuente-... de ${ArchivoVariables} o inherit. Si hace falta una nueva, ${CómoAgregarFuente}.`);
	if ((propiedad === "font-weight" || esLocalDe("peso")) && !(ExpresiónPesoPermitido.test(valorConSuFamilia) && usaNivelesQueExisten))
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa los pesos de la marca. Usa una variable --peso-... de ${ArchivoVariables} o inherit. Si hace falta uno nuevo, ${CómoAgregarPeso}.`);
	if ((propiedad === "line-height" || esLocalDe("interlineado")) && !(ExpresiónInterlineadoPermitido.test(valorConSuFamilia) && usaNivelesQueExisten))
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa los interlineados. Usa una variable --interlineado-... de ${ArchivoVariables}, inherit o 0 para que el texto no le sume alto a su caja. Si hace falta uno nuevo, ${CómoAgregarInterlineado}.`);
	const usaSombrasPermitidas = PartirPorFuera(valorConSuFamilia, /,/).every(parte => ExpresiónSombraPermitida.test(parte)); // Una caja puede llevar varias sombras, separadas por comas, cada una con su variable.
	if ((propiedad === "box-shadow" || esLocalDe("sombra")) && !(usaSombrasPermitidas && usaNivelesQueExisten))
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa las sombras. Usa una variable --sombra-... de ${ArchivoVariables}, none o inherit. Si hace falta una nueva, ${CómoAgregarSombra}.`);
	const esMedida = (parte: string): boolean => ConvertirAMedidaDeMarca(parte.replace(/^-/, ""), 1) !== null; // El signo va aparte, porque la conversión solo entiende números positivos.
	const capaConSuColor = (capa: string): boolean => ExpresiónSombraPermitida.test(capa)
		|| /^(?:var\(--color-sombra\)|color-mix\(in srgb, var\(--color-sombra\) \d*\.?\d+%, transparent\))$/
			.test(PartirPorFuera(capa, /\s/).filter(parte => parte !== "inset" && !esMedida(parte)).join(" ")); // Lo que no es una medida ni inset es el color, y tiene que ser esa variable, sola o más transparente, sin mezclarla con otro color. Más transparente sirve para que cada talla tenga su propia opacidad, porque una sombra grande y difusa se ve más oscura que una corta con la misma. Una capa que es otra sombra de la escala, ninguna o la heredada ya trae el suyo.
	if (esDefiniciónPermitida && propiedad.startsWith("--sombra-") && !PartirPorFuera(valor, /,/).every(capaConSuColor))
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa el color de las sombras. Usa var(--color-sombra) como el color de cada capa, solo o más transparente con color-mix(in srgb, var(--color-sombra) 50%, transparent), sin mezclarlo con otro color, para que todas las sombras tengan el mismo color y cambien juntas con el tema.`);
	const esOpacidadDeLaEscala = (propiedad === "opacity" && (enDesactivado || valorConSuFamilia.includes("--opacidad-")))
		|| esLocalDe("opacidad"); // La de un control desactivado, la que usa una variable de opacidad, para que exista, y la variable local de esa familia. Las demás, como la de un efecto o una animación, se escriben con su valor.
	if (esOpacidadDeLaEscala && !(ExpresiónOpacidadPermitida.test(valorConSuFamilia) && usaNivelesQueExisten))
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa la opacidad de lo desactivado. Usa una variable --opacidad-... de ${ArchivoVariables} o inherit, para que todos los controles desactivados se vean igual. Si hace falta una nueva, ${CómoAgregarOpacidad}.`);
	const esEspacio = ExpresiónPropiedadDeEspacio.test(propiedad) || esLocalDe("espacio");
	const primerEscalón = escalaDeEspacios.size > 0 ? Math.min(...escalaDeEspacios.values()) : 0; // El espacio más pequeño de la escala, que es el tope de los números sueltos y de los ajustes finos. Sin escala, ningún número pasa, para que falle con ruido.
	const usaEspaciosPermitidos = PartirPorFuera(valorConSuFamilia, /\s/).every(medida => EsEspacioPermitido(medida, primerEscalón)); // Cada lado puede llevar el suyo, como en var(--espacio-s) var(--espacio-m).
	if (esEspacio && !(usaEspaciosPermitidos && usaNivelesQueExisten)) {

		const grande = PartirPorFuera(valor, /\s/).map(medida => ConvertirAMedidaDeMarca(medida.replace(/^-/, ""), 1))
			.find((píxeles): píxeles is number => píxeles !== null && píxeles >= primerEscalón); // El primer número suelto que se pasa del tope, para sugerir el escalón más cercano.
		const cercano = grande === undefined ? undefined
			: [...escalaDeEspacios].sort((a, b) => Math.abs(a[1] - grande) - Math.abs(b[1] - grande))[0];
		const sugerencia = cercano === undefined ? "" : `, como var(${cercano[0]}), que es ${cercano[1]} px, en vez de ${grande} px`;
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no usa la escala de espacios. Usa una variable --espacio-... de ${ArchivoVariables}${sugerencia}. Un ajuste fino le suma o le resta a una sola variable menos de ${primerEscalón} px, con calc, como calc(var(--espacio-m) + 1px), y un número suelto solo puede ser menor de ${primerEscalón} px. Nada se multiplica ni se divide, salvo por -1 para un margen negativo, y lo que depende de la pantalla va en clamp, min o max, con la escala en sus extremos. Si hace falta un escalón nuevo, pídeselo al Director, sin agregarlo tú.`);

	}
	if (archivo === ArchivoVariables && propiedad.startsWith("--espacio-") && ConvertirAMedidaDeMarca(valor, 1) === null)
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' no es una medida en px o rem. La escala de los espacios lleva números, para que la regla sepa el tope de los ajustes finos y pueda sugerir el escalón más cercano.`);
	const cambiaLaEscala = esTamaño || esEspacio || propiedad.endsWith("-radius") || ExpresiónPropiedadDeBorde.test(propiedad)
		|| ["font-family", "font-weight", "line-height", "box-shadow", "opacity"].includes(propiedad)
		|| (familiaDeLaPropiedad !== undefined && familiaDeLaPropiedad !== "color"); // Los tamaños, los espacios, los redondeados, los bordes, las fuentes, los pesos, los interlineados, las sombras, las opacidades y los anchos, como propiedad o como variable. Lo que la regla no revisa en ninguna parte, como el display que esconde un enlace, tampoco lo revisa aquí.
	if (enTemaAlternativo && cambiaLaEscala)
		errores.push(
			`${lugar}: '${propiedad}: ${valor}' cambia en el tema alternativo algo que no es un color. Ese tema solo cambia colores: los tamaños, los espacios, los redondeados, los bordes, las fuentes, los pesos, los interlineados, las sombras, las opacidades y los anchos van fuera de él, iguales en los dos temas.`);

}


function LeerCapasDeSombra(texto: string, esDelDocumento: boolean): (number | "inset")[][] | null { // Pasa una sombra a sus números sin unidad, capa por capa: el desplazamiento horizontal, el vertical, el desenfoque y, si lo tiene, la extensión. El color no cuenta, porque cambia con el tema. En el documento los números ya vienen sin unidad, y en el código se convierten como los redondeados. Si una capa no tiene números, devuelve null, para que falle con ruido.

	const capas = PartirPorFuera(texto, /,/).map(capa => PartirPorFuera(capa, /\s/).flatMap((parte): (number | "inset")[] => {

		const medida = esDelDocumento ? Number(parte) : ConvertirAMedidaDeMarca(parte.replace(/^-/, ""), 1); // El signo va aparte, porque la conversión solo entiende números positivos.
		if (parte === "inset") {
			return ["inset"];
		} else if (medida === null || Number.isNaN(medida)) {
			return []; // Lo que no es una medida, como el color, se salta.
		} else {
			return [!esDelDocumento && parte.startsWith("-") ? -medida : medida];
		}

	}));
	return capas.length > 0 && capas.every(capa => capa.some(parte => typeof parte === "number")) ? capas : null;

}


function SombrasIguales(código: (number | "inset")[][], documento: (number | "inset")[][]): boolean { // Iguales si tienen las mismas capas, con los mismos números, con menos de medio píxel de diferencia.

	const partesIguales = (a: number | "inset", b: number | "inset"): boolean =>
		typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < MargenDeMedida : a === b;
	return código.length === documento.length
		&& código.every((capa, i) => capa.length === documento[i].length && capa.every((parte, j) => partesIguales(parte, documento[i][j])));

}


function LeerColorConOpacidad(valor: string): string | null { // Pasa un color de CSS con transparencia al formato del documento de diseño: el hexadecimal de 6 caracteres y la opacidad en porcentaje, como 000000 14. Entiende rgb, rgba y los hexadecimales de 6 y de 8 caracteres. Lo demás devuelve null, para que falle con ruido.

	const hexadecimal = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(valor);
	const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,\/]\s*(\d*\.?\d+)(%?))?\s*\)$/i.exec(valor); // Con comas o con espacios, y la opacidad después de una coma o de una barra, en porcentaje o de 0 a 1.
	if (hexadecimal !== null) {
		return `${hexadecimal[1].toLowerCase()} ${hexadecimal[2] === undefined ? 100 : Math.round(parseInt(hexadecimal[2], 16) / 255 * 100)}`;
	} else if (rgb !== null) {

		const color = [rgb[1], rgb[2], rgb[3]].map(canal => Number(canal).toString(16).padStart(2, "0")).join("");
		const opacidad = rgb[4] === undefined ? 100 : Number(rgb[4]) * (rgb[5] === "%" ? 1 : 100);
		return `${color} ${Math.round(opacidad * 100) / 100}`;

	} else {
		return null;
	}

}


function ConvertirAMedidaDeMarca(valor: string, factor: number): number | null { // Pasa un valor de CSS al número sin unidad del documento de marca. Lo que no se puede convertir, como un clamp, devuelve null, para que falle con ruido. Sin unidad solo se entiende el cero.

	const partes = /^(\d*\.?\d+)(rem|px)?$/.exec(valor);
	if (partes === null || (partes[2] === undefined && Number(partes[1]) !== 0)) return null;
	return Number(partes[1]) * (partes[2] === "rem" ? PíxelesPorRem : 1) / factor;

}


function ResolverVariable(valor: string, variables: Map<string, string>): string { // Sigue las variables que apuntan a otra, como var(--color-fondo), para comparar el valor que de verdad queda. Se detiene a las pocas vueltas, por si dos se apuntan entre sí, lo que CSS tampoco resuelve.

	let actual = valor;
	for (let vuelta = 0; vuelta < 10; vuelta++) actual = variables.get(/^var\((--[\w-]+)\)$/.exec(actual)?.[1] ?? "") ?? actual;
	return actual;

}


function RevisarVariablesContraLaMarca(declaraciones: Declaración[], errores: string[]): void { // Cada color, cada fuente, cada peso, cada tamaño, cada interlineado, cada redondeado, cada borde, cada espacio, cada ancho, cada sombra y cada opacidad de las variables tiene que ser igual al de la fila de su mismo nombre en los documentos del proyecto, para que cada valor lo apruebe el Director y dos variables no queden cruzadas. Una familia sin valores en el documento no se compara, y el redondeado completo tampoco, porque vale lo mismo en todos los proyectos y no es de la marca. El tema alternativo es opcional, fila por fila: solo se comparan los colores que el documento trae, y los demás quedan libres.

	if (DelProyecto.ColumnaDeLaEscala !== undefined && !ColumnaDeLaEscalaEncontrada) // Si el proyecto escogió una columna y ninguna tabla la tiene, falla con ruido, porque si no compararía en silencio la segunda.
		errores.push(`${DocumentosDeValores}: ninguna tabla tiene la columna ${ColumnaDeLaEscala}, la que pide ColumnaDeLaEscala en Programas/reglas-diseno-proyecto.mts.`);
	for (const [nombre, valor] of [...FilasDeLaMarca, ...FilasDelTemaAlternativo]) {

		const conOpacidad = nombre === "color-sombra"; // El color de las sombras es el único que lleva su opacidad, como 000000 14, porque sin transparencia una sombra tapa lo que tiene debajo.
		if (nombre.startsWith("color-") && !(conOpacidad ? /^[0-9a-f]{6}(?: \d*\.?\d+)?$/ : /^[0-9a-f]{6}$/).test(valor)) // Un solo formato, el que sale de los programas de diseño, para que las tablas se comparen igual desde cualquier tecnología. El documento ya se leyó en minúsculas, así que las mayúsculas también pasan.
			errores.push(`${DocumentosDeValores}: ${nombre} es '${valor}', que no es un color en hexadecimal de 6 caracteres, sin #, como 00ffff${conOpacidad ? ", con su opacidad, como 000000 14" : ""}.`);

	}

	const definiciones = declaraciones.filter(d => d.Archivo === ArchivoVariables && d.Propiedad.startsWith("--"));
	for (const { Archivo: archivo, Línea: línea, Propiedad: propiedad, Valor: valor, EnPantallaAngosta: enPantallaAngosta,
		EnTemaAlternativo: enTemaAlternativo } of declaraciones) {

		if (archivo === ArchivoVariables && propiedad.startsWith("--")) {

			const nombre = propiedad.slice(2);
			const filas = enTemaAlternativo ? FilasDelTemaAlternativo : FilasDeLaMarca;
			const enLaFila = filas.get(nombre);
			const aplicables = definiciones.filter(d => (!d.EnTemaAlternativo || enTemaAlternativo) && (!d.EnPantallaAngosta || enPantallaAngosta)); // Las que valen donde está esta declaración: las generales, y las del tema alternativo o del teléfono si ella está ahí.
			const valorReal = ResolverVariable(valor, new Map(aplicables.map((d): [string, string] => [d.Propiedad, d.Valor]))); // Si una se repite, manda la última, como en CSS.
			const sinComparar = enLaFila === undefined && (enTemaAlternativo || FilasPendientes.has(nombre)); // En el tema alternativo, lo que el documento no trae queda libre, y en el principal, lo que todavía va entre corchetes dobles espera la decisión del Director.
			const comparar = (familia: string, coincide: boolean, enElCódigo: string): void => {

				if (FamiliaTieneValores(filas, familia) && !coincide && !sinComparar)
					errores.push(
						`${archivo}:${línea}: ${propiedad} es ${valor}${enElCódigo === valor ? "" : `, o sea ${enElCódigo}`}, y la fila ${nombre} ${enLaFila === undefined ? "no tiene valor" : `dice ${enLaFila}`}, en ${DocumentosDeValores}. Usa ese valor o pídele al Director que apruebe el nuevo allá, sin cambiarlo tú.`);

			};
			const compararMedida = (familia: string, factor: number): void => {

				const medida = ConvertirAMedidaDeMarca(valorReal, factor);
				const coincide = medida !== null && Math.abs(medida - Number(enLaFila)) < MargenDeMedida;
				comparar(familia, coincide, medida === null ? valorReal : String(Math.round(medida * 100) / 100));

			};
			if (propiedad.startsWith("--fuente-")) {
				comparar("fuente-", LeerPrimeraFuente(valorReal) === LeerPrimeraFuente(enLaFila ?? ""), LeerPrimeraFuente(valorReal)); // Solo el primer nombre, porque los demás son repuestos de la web, y al documento le basta con decir Georgia.
			} else if (propiedad.startsWith("--peso-")) {
				comparar("peso-", valorReal === enLaFila, valorReal);
			} else if (propiedad.startsWith("--interlineado-")) {
				comparar("interlineado-", valorReal === enLaFila, valorReal);
			} else if (propiedad.startsWith("--texto-")) {
				compararMedida("texto-", enPantallaAngosta ? FactorTamañoTextoMóvil : FactorTamañoTextoEscritorio);
			} else if (propiedad.startsWith("--radio-") && propiedad !== "--radio-completo") {
				compararMedida("radio-", 1); // Los redondeados no llevan factor, porque se ven igual en todos los medios.
			} else if (propiedad.startsWith("--borde-")) {
				compararMedida("borde-", 1); // Los bordes tampoco llevan factor, porque su grosor es el mismo en todas las pantallas.
			} else if (propiedad.startsWith("--espacio-")) {
				compararMedida("espacio-", 1); // Los espacios tampoco llevan factor, porque su escala es una sola en todas las pantallas.
			} else if (propiedad.startsWith("--ancho-")) {
				compararMedida("ancho-", 1); // Los anchos tampoco llevan factor. Solo se comparan las variables, porque los demás anchos, como el de un campo de un formulario, son propios de cada elemento y se escriben con su número, sin variable.
			} else if (propiedad.startsWith("--sombra-")) { // Las tallas de las sombras, sin su color, que es --color-sombra.
				const enElCódigo = LeerCapasDeSombra(valorReal, false);
				const enElDocumento = LeerCapasDeSombra(enLaFila ?? "", true);
				comparar("sombra-", enElCódigo !== null && enElDocumento !== null && SombrasIguales(enElCódigo, enElDocumento),
					enElCódigo === null ? valorReal : enElCódigo.map(capa => capa.join(" ")).join(", "));
			} else if (propiedad === "--color-sombra") { // El color va con su opacidad, como 000000 14, porque sin transparencia una sombra tapa lo que tiene debajo.
				const enElCódigo = LeerColorConOpacidad(valorReal);
				const [colorDelCódigo, opacidadDelCódigo] = (enElCódigo ?? "").split(" ");
				const [colorDeLaFila, opacidadDeLaFila = "100"] = (enLaFila ?? "").toLowerCase().split(/\s+/); // Sin opacidad, el color es sólido.
				const coincide = enElCódigo !== null && colorDelCódigo === colorDeLaFila
					&& Math.abs(Number(opacidadDelCódigo) - Number(opacidadDeLaFila)) < MargenDeMedida;
				comparar("color-", coincide, enElCódigo ?? valorReal);
			} else if (propiedad.startsWith("--opacidad-")) { // En porcentaje sin el signo, como en un programa de diseño, así que 0.5 en el código es 50 en el documento.
				const porcentaje = /^(\d*\.?\d+)(%?)$/.exec(valorReal);
				const enElCódigo = porcentaje === null ? null : Number(porcentaje[1]) * (porcentaje[2] === "%" ? 1 : 100);
				comparar("opacidad-", enElCódigo !== null && Math.abs(enElCódigo - Number(enLaFila)) < MargenDeMedida,
					enElCódigo === null ? valorReal : String(Math.round(enElCódigo * 100) / 100));
			} else if (propiedad.startsWith("--color-") || (TieneColor(valor) && !propiedad.startsWith("--sombra-"))) { // Las sombras se comparan en sus propias ramas, y no como colores de la paleta.
				const colorSinNumeral = valorReal.replace(/^#/, "").toLowerCase(); // Las tablas traen los colores sin # y ya leídos en minúsculas.
				comparar("color-", colorSinNumeral === enLaFila, colorSinNumeral);
			}

		}

	}

}


const Errores: string[] = []; // Las reglas que no se cumplen, cada una con lo que hay que hacer para arreglarla.
const Declaraciones = [
	...ListarArchivos("static/css", ".css")
		.flatMap(archivo => LeerDeclaraciones(archivo, fs.readFileSync(path.join(Carpeta, archivo), "utf8"), 1)),
	...ListarArchivos("static/html", ".html").filter(archivo => !PáginasExcluidas.has(archivo))
		.flatMap(archivo => LeerDeclaracionesDeHtml(archivo, fs.readFileSync(path.join(Carpeta, archivo), "utf8"))),
];
const NivelesDeLaEscala = new Set(Declaraciones.filter(d => d.Archivo === ArchivoVariables
	&& /^--(?:texto|radio|fuente|peso|interlineado|espacio|color|sombra|opacidad|borde)-/.test(d.Propiedad)).map(d => d.Propiedad)); // Los nombres de esas diez familias que se pueden usar.
const EscalaDeEspacios = new Map(Declaraciones
	.filter(d => d.Archivo === ArchivoVariables && d.Propiedad.startsWith("--espacio-") && !d.EnTemaAlternativo && !d.EnPantallaAngosta)
	.map((d): [string, number | null] => [d.Propiedad, ConvertirAMedidaDeMarca(d.Valor, 1)])
	.filter((escalón): escalón is [string, number] => escalón[1] !== null)); // Los escalones de los espacios en px, para el tope de los ajustes finos y para sugerir el más cercano. La escala es una sola, así que el tema alternativo y el teléfono no la cambian.
const VariablesDefinidas = new Set(Declaraciones.filter(d => d.Propiedad.startsWith("--")).map(d => d.Propiedad)); // Todas las variables que define alguna plantilla o global.css, también las locales, para revisar que existan las que se usan.
for (const declaración of Declaraciones) RevisarDeclaración(declaración, NivelesDeLaEscala, VariablesDefinidas, EscalaDeEspacios, Errores);
RevisarVariablesContraLaMarca(Declaraciones, Errores);
if (Errores.length > 0) {
	console.error(`Reglas de diseño que no se cumplen:\n${Errores.map(error => `- ${error}`).join("\n")}`);
	process.exitCode = 1; // Hace fallar a npm run reglas, y con él a deploy.
}
