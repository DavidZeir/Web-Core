import { execFileSync } from "node:child_process"; // Prueba a Programas/reglas-diseno.mts por sí sola, sin mirar la web: le da documentos y variables de ejemplo, hechos a propósito, y cuenta los errores que responde, para saber que se queja cuando debe y que no se queja cuando no debe. Trabaja en una carpeta aparte de Temporal, que crea y borra, sin tocar nada del proyecto. Se corre a mano, con node Programas/pruebas-reglas-diseno.mts, cada vez que se edita la regla, y no está en el Verificador porque la regla cambia muy poco.
import fs from "node:fs";
import path from "node:path";


interface OpcionesDelCaso { // Lo que cambia cada caso. Lo que no diga queda como en los ejemplos, que no dan ningún error.
	Marca?: string;
	Diseño?: string | null; // Con null, el proyecto no declara su documento de diseño.
	Variables?: string;
	Propio?: string; // Lo que se agrega a reglas-diseno-proyecto.mts, como un factor.
	CssAparte?: string; // Un archivo CSS distinto de global.css.
	HtmlAparte?: string; // Una plantilla.
}


const Raíz = path.join(import.meta.dirname, "..");
const Carpeta = path.join(Raíz, "Temporal", "pruebas-reglas-diseno");
const CarpetaWorker = path.join(Carpeta, "worker");

const VariablesDeEjemplo = `:root {
	--color-primario: #195d59;
	--color-secundario: #f2b544;
	--color-fondo: #fffdf9;
	--color-texto: #3d4a49;
	--color-error: #b3261e;
	--color-sombra: rgb(0 0 0 / 14%);
	--sombra-suave: 0 1px 2px var(--color-sombra);
	--fuente-destacada: Georgia, 'Times New Roman', serif;
	--fuente-normal: system-ui, sans-serif;
	--peso-normal: 400;
	--peso-negrita: 700;
	--interlineado-s: 1.2;
	--interlineado-m: 1.5;
	--texto-l: 1.25rem;
	--texto-m: 1rem;
	--texto-s: 0.87rem;
	--radio-s: 0.25rem;
	--radio-m: 0.5rem;
	--radio-completo: 999px;
	--borde-s: 1px;
	--borde-m: 2px;
	--espacio-xs: 5px;
	--espacio-s: 10px;
	--espacio-m: 20px;
	--espacio-l: 30px;
}

:root[data-tema='alternativo'] {
	--color-fondo: #141a1a;
	--color-texto: #e8e2d6;
}
`;

const MarcaDeEjemplo = `# Marca

| Colores | Valor |
|---|---|
| \`color-primario\` | \`195d59\` |
| \`color-secundario\` | \`f2b544\` |
| \`color-fondo\` | \`fffdf9\` |
| \`color-texto\` | \`3d4a49\` |

| Letras | Valor |
|---|---|
| \`fuente-destacada\` | \`Georgia\` |
| \`fuente-normal\` | \`system-ui\` |
| \`peso-normal\` | \`400\` |
| \`peso-negrita\` | \`700\` |
| \`interlineado-s\` | \`1.2\` |
| \`interlineado-m\` | \`1.5\` |
| \`texto-l\` | \`20\` |
| \`texto-m\` | \`16\` |
| \`texto-s\` | \`14\` |

| Redondeados | Valor |
|---|---|
| \`radio-s\` | \`4\` |
| \`radio-m\` | \`8\` |
`;

const DiseñoDeEjemplo = `# Diseño

| Estados | Valor |
|---|---|
| \`color-error\` | \`b3261e\` |

| Sombras | Valor |
|---|---|
| \`color-sombra\` | \`000000 14\` |

### El tema de color alternativo

| Tema alternativo | Valor |
|---|---|
| \`color-fondo\` | |

## La web
`;

const TextosAgrandados = VariablesDeEjemplo.replace("--texto-l: 1.25rem", "--texto-l: 1.5625rem").replace("--texto-m: 1rem", "--texto-m: 1.25rem")
	.replace("--texto-s: 0.87rem", "--texto-s: 1.0875rem"); // Los mismos textos, multiplicados por 1,25.

const FactorDeEscritorio = "export const FactorTamañoTextoEscritorio = 1.25;\n";

const MarcaConDosEscalas = `${Cambiar(MarcaDeEjemplo, "| \`texto-l\` | \`20\` |\n| \`texto-m\` | \`16\` |\n| \`texto-s\` | \`14\` |\n", "")}
| Tamaños | Compacto | Normal |
|---|---|---|
| \`texto-l\` | \`16\` | \`20\` |
| \`texto-m\` | \`13\` | \`16\` |
| \`texto-s\` | \`11\` | \`14\` |
`; // La marca de ejemplo con sus tamaños en una tabla de dos escalas. La Normal va de última, para probar que se busca por su nombre y no por su posición.

const MarcaConEspacios = `${MarcaDeEjemplo}
| Espacios | Valor |
|---|---|
| \`espacio-xs\` | \`5\` |
| \`espacio-s\` | \`10\` |
| \`espacio-m\` | \`20\` |
| \`espacio-l\` | \`30\` |
`; // La marca de ejemplo con su escala de espacios. Va aparte porque los ejemplos no la traen, para que los demás casos no comparen los espacios.

const DiseñoConAncho = `${DiseñoDeEjemplo}
| La web | Valor |
|---|---|
| \`ancho-contenido\` | \`1120\` |
`; // El documento de diseño de ejemplo con el ancho del contenido. Va aparte porque los ejemplos no lo traen, para que los demás casos no lo comparen.

const VariablesConAncho = Cambiar(VariablesDeEjemplo, "--espacio-l: 30px;", "--espacio-l: 30px;\n\t--ancho-contenido: 70rem;"); // Las variables de ejemplo con el ancho del contenido, de 70rem, que son 1120.

const MarcaConSombras = `${MarcaDeEjemplo}
| Sombras | Valor |
|---|---|
| \`sombra-suave\` | \`0 1 2\` |
`; // La marca de ejemplo con su sombra, en px sin unidad. Va aparte porque los ejemplos no la traen, para que los demás casos no comparen las sombras.

const MarcaConBordes = `${MarcaDeEjemplo}
| Bordes | Valor |
|---|---|
| \`borde-s\` | \`1\` |
| \`borde-m\` | \`2\` |
`; // La marca de ejemplo con sus bordes, en px sin unidad. Va aparte porque los ejemplos no los traen, para que los demás casos no comparen los bordes.

const DiseñoConOpacidad = `${DiseñoDeEjemplo}
| Controles | Valor |
|---|---|
| \`opacidad-desactivado\` | \`50\` |
`; // El documento de diseño de ejemplo con la opacidad de lo desactivado, en porcentaje sin el signo.

const VariablesConOpacidad = Cambiar(VariablesDeEjemplo, "--espacio-l: 30px;", "--espacio-l: 30px;\n\t--opacidad-desactivado: 0.5;"); // Las variables de ejemplo con la opacidad de lo desactivado.

const Casos: [string, number, OpcionesDelCaso][] = [
	["Los ejemplos, sin cambios", 0, {}],
	["Documentos sin llenar", 0, { Marca: Vaciar(MarcaDeEjemplo), Diseño: Vaciar(DiseñoDeEjemplo) }],
	["Documento sin tablas, con valores en un párrafo", 0, { Marca: "# Marca\n\nEl primario es `#123456`, o `abcdef`, y el texto normal es `99`.\n", Diseño: null }],

	["Un color distinto al del código", 1, { Marca: CambiarFila(MarcaDeEjemplo, "color-primario", "`123456`") }],
	["Un color en mayúsculas", 0, { Marca: CambiarFila(MarcaDeEjemplo, "color-primario", "`195D59`") }],
	["Un color con #, que falla por la forma y por no coincidir", 2, { Marca: CambiarFila(MarcaDeEjemplo, "color-primario", "`#195d59`") }],
	["Un color de 3 caracteres, que falla por la forma y por no coincidir", 2, { Marca: CambiarFila(MarcaDeEjemplo, "color-primario", "`abc`") }],
	["Dos colores cruzados", 2, { Marca: CambiarFila(CambiarFila(MarcaDeEjemplo, "color-primario", "`f2b544`"), "color-secundario", "`195d59`") }],
	["Una variable de color sin valor en su fila", 1, { Marca: CambiarFila(MarcaDeEjemplo, "color-primario", "") }],
	["Una fila que todavía va entre corchetes dobles no se compara", 0, { Marca: CambiarFila(MarcaDeEjemplo, "color-primario", "[[Lo decide el Director]]") }],
	["Una variable que apunta a otra de otro color", 1, { Variables: Cambiar(VariablesDeEjemplo, "--color-primario: #195d59", "--color-primario: var(--color-secundario)") }],
	["Una variable que apunta a otra del color de su fila", 0, { Marca: CambiarFila(MarcaDeEjemplo, "color-primario", "`f2b544`"), Variables: Cambiar(VariablesDeEjemplo, "--color-primario: #195d59", "--color-primario: var(--color-secundario)") }],
	["Un color a mano en un archivo CSS", 1, { CssAparte: "p {\n\tcolor: #123456;\n}\n" }],
	["Un color a mano en una plantilla", 1, { HtmlAparte: "<p style=\"color: #123456\">Hola</p>\n" }],
	["Una mezcla de colores de la paleta, también con transparent", 0, { CssAparte: "p {\n\tbackground: color-mix(in srgb, var(--color-primario) 20%, var(--color-fondo));\n}\n\nb {\n\tbackground: color-mix(in srgb, var(--color-primario) 20%, transparent);\n}\n" }],
	["Una mezcla con un color escrito a mano", 1, { CssAparte: "p {\n\tbackground: color-mix(in srgb, var(--color-primario) 20%, white);\n}\n" }],
	["Una variable de color que no existe, sola o en una mezcla", 2, { CssAparte: "p {\n\tcolor: var(--color-inventado);\n}\n\nb {\n\tbackground: color-mix(in srgb, var(--color-inventado) 20%, var(--color-fondo));\n}\n" }],

	["Filas sin espacios, sin comillas invertidas y sin barras", 0, { Marca: Cambiar(Cambiar(MarcaDeEjemplo, "| `color-primario` | `195d59` |", "|color-primario|195d59|"), "| `color-secundario` | `f2b544` |", "   color-secundario   |   f2b544") }],
	["Una línea con barra fuera de una tabla no cuenta", 1, { Marca: `${CambiarFila(MarcaDeEjemplo, "color-primario", "")}\ncolor-primario | 195d59\n` }],
	["Un color en un párrafo no reemplaza a su fila", 1, { Marca: `${CambiarFila(MarcaDeEjemplo, "color-primario", "")}\nEl primario es \`195d59\`.\n` }],
	["Una tabla en un bloque de código no cambia la fila", 0, { Marca: `${MarcaDeEjemplo}\n\`\`\`\n| Colores | Valor |\n|---|---|\n| color-primario | ff0000 |\n\`\`\`\n` }],
	["Una tabla sin el nombre de una variable en su primera columna no se compara", 0, { Marca: `${MarcaDeEjemplo}\n| Estilo | Fuente |\n|---|---|\n| Título principal | \`fuente-inventada\` |\n` }],
	["Un documento con saltos de línea de Windows sigue comparando", 1, { Marca: CambiarFila(MarcaDeEjemplo, "color-primario", "`123456`").replaceAll("\n", "\r\n") }],

	["Un tema alternativo con una sola fila, igual al código", 0, { Diseño: CambiarFila(DiseñoDeEjemplo, "color-fondo", "`141a1a`") }],
	["Un tema alternativo con una fila distinta al código", 1, { Diseño: CambiarFila(DiseñoDeEjemplo, "color-fondo", "`123456`") }],
	["El título anterior del tema alternativo también vale", 0, { Diseño: CambiarFila(Cambiar(DiseñoDeEjemplo, "### El tema de color alternativo", "### El tema alternativo"), "color-fondo", "`141a1a`") }],
	["Una tabla del tema alternativo bajo otro título se lee como la del tema principal", 1, { Diseño: CambiarFila(Cambiar(DiseñoDeEjemplo, "### El tema de color alternativo", "### Los colores oscuros"), "color-fondo", "`141a1a`") }],
	["Un estado distinto al del código, en el documento de diseño", 1, { Diseño: CambiarFila(DiseñoDeEjemplo, "color-error", "`123456`") }],
	["Sin declarar el documento de diseño, el estado y el color de las sombras quedan sin fila", 2, { Diseño: null }],

	["Un tamaño distinto al del código", 1, { Marca: CambiarFila(MarcaDeEjemplo, "texto-m", "`18`") }],
	["Un tamaño con unidad en el documento", 1, { Marca: CambiarFila(MarcaDeEjemplo, "texto-m", "`16px`") }],
	["Un tamaño con clamp en las variables", 1, { Variables: Cambiar(VariablesDeEjemplo, "--texto-m: 1rem", "--texto-m: clamp(1rem, 2vw, 2rem)") }],
	["Un redondeado distinto al del código", 1, { Marca: CambiarFila(MarcaDeEjemplo, "radio-m", "`9`") }],
	["Un redondeado con decimales, igual en el documento y en el código", 0, { Marca: CambiarFila(MarcaDeEjemplo, "radio-s", "`3.5`"), Variables: Cambiar(VariablesDeEjemplo, "--radio-s: 0.25rem", "--radio-s: 0.21875rem") }],
	["Un redondeado con medio píxel de diferencia", 1, { Variables: Cambiar(VariablesDeEjemplo, "--radio-s: 0.25rem", "--radio-s: 0.21875rem") }],
	["Los bordes de la marca, iguales a los del código", 0, { Marca: MarcaConBordes }],
	["Un borde distinto al del código", 1, { Marca: CambiarFila(MarcaConBordes, "borde-m", "`3`") }],
	["Los bordes no se comparan si la marca no trae ninguno", 0, { Variables: Cambiar(VariablesDeEjemplo, "--borde-m: 2px", "--borde-m: 3px") }],
	["Los espacios de la marca, iguales a los del código en px y en rem", 0, { Marca: MarcaConEspacios, Variables: Cambiar(VariablesDeEjemplo, "--espacio-m: 20px", "--espacio-m: 1.25rem") }],
	["Un espacio distinto al del código", 1, { Marca: CambiarFila(MarcaConEspacios, "espacio-m", "`21`") }],
	["Un escalón del código sin fila, cuando la marca ya trae espacios", 1, { Marca: MarcaConEspacios, Variables: Cambiar(VariablesDeEjemplo, "--espacio-l: 30px;", "--espacio-l: 30px;\n\t--espacio-xl: 40px;") }],
	["Los espacios no se comparan si la marca no trae ninguno", 0, { Variables: Cambiar(VariablesDeEjemplo, "--espacio-m: 20px", "--espacio-m: 21px") }],
	["El ancho del documento de diseño, igual al del código", 0, { Diseño: DiseñoConAncho, Variables: VariablesConAncho }],
	["Un ancho distinto al del código", 1, { Diseño: CambiarFila(DiseñoConAncho, "ancho-contenido", "`1200`"), Variables: VariablesConAncho }],
	["El ancho no se compara si el documento de diseño no lo trae", 0, { Variables: VariablesConAncho }],
	["La sombra de la marca, igual a la del código", 0, { Marca: MarcaConSombras }],
	["Una sombra distinta a la del código", 1, { Marca: CambiarFila(MarcaConSombras, "sombra-suave", "`0 2 4`") }],
	["Una sombra en rem, igual a la de la marca", 0, { Marca: MarcaConSombras, Variables: Cambiar(VariablesDeEjemplo, "--sombra-suave: 0 1px 2px", "--sombra-suave: 0 0.0625rem 0.125rem") }],
	["Las tallas de las sombras se comparan sin su color", 0, { Marca: MarcaConSombras, Diseño: CambiarFila(DiseñoDeEjemplo, "color-sombra", "`000000 30`"), Variables: Cambiar(VariablesDeEjemplo, "--color-sombra: rgb(0 0 0 / 14%);", "--color-sombra: rgba(0, 0, 0, 0.3);") }],
	["Las sombras no se comparan si la marca no trae ninguna", 0, { Variables: Cambiar(VariablesDeEjemplo, "--sombra-suave: 0 1px 2px", "--sombra-suave: 0 3px 9px") }],
	["Un color de sombras con otra opacidad", 1, { Diseño: CambiarFila(DiseñoDeEjemplo, "color-sombra", "`000000 20`") }],
	["Un color de sombras escrito con rgba, igual al del documento", 0, { Variables: Cambiar(VariablesDeEjemplo, "--color-sombra: rgb(0 0 0 / 14%);", "--color-sombra: rgba(0, 0, 0, 0.14);") }],
	["El color de las sombras sin fila, cuando la marca ya tiene colores", 1, { Diseño: Cambiar(DiseñoDeEjemplo, "| `color-sombra` | `000000 14` |\n", "") }],
	["Un color de sombras que no está en hexadecimal", 2, { Diseño: CambiarFila(DiseñoDeEjemplo, "color-sombra", "`negro 14`") }],
	["La opacidad de lo desactivado, igual a la del documento de diseño", 0, { Diseño: DiseñoConOpacidad, Variables: VariablesConOpacidad }],
	["Una opacidad distinta a la del código", 1, { Diseño: CambiarFila(DiseñoConOpacidad, "opacidad-desactivado", "`65`"), Variables: VariablesConOpacidad }],
	["Una opacidad en porcentaje, igual a la del documento", 0, { Diseño: DiseñoConOpacidad, Variables: Cambiar(VariablesConOpacidad, "--opacidad-desactivado: 0.5;", "--opacidad-desactivado: 50%;") }],
	["La opacidad no se compara si el documento no la trae", 0, { Variables: VariablesConOpacidad }],
	["Factor de 1,25 con los textos agrandados", 0, { Propio: FactorDeEscritorio, Variables: TextosAgrandados }],
	["Factor de 1,25 con los textos sin agrandar", 3, { Propio: FactorDeEscritorio }],
	["Una escala con las columnas Compacto y Normal compara la Normal, aunque no sea la segunda", 0, { Marca: MarcaConDosEscalas }],
	["Una escala que compara la columna Compacto, porque así se configuró", 3, { Marca: MarcaConDosEscalas, Propio: "export const ColumnaDeLaEscala = \"Compacto\";\n" }],
	["Una columna configurada que ninguna tabla tiene", 1, { Propio: "export const ColumnaDeLaEscala = \"Compacto\";\n" }],
	["Una tabla sin la columna Valor ni la de la escala no se compara", 0, { Marca: `${MarcaDeEjemplo}\n| Colores | Hexadecimal |\n|---|---|\n| \`color-primario\` | \`000000\` |\n` }],
	["Factor móvil de 1 con su talla en el teléfono", 0, { Propio: FactorDeEscritorio, Variables: `${TextosAgrandados}\n@media (max-width: 40rem) {\n\t:root {\n\t\t--texto-m: 1rem;\n\t}\n}\n` }],
	["Un alias en el teléfono se resuelve con los valores del teléfono", 1, { Propio: FactorDeEscritorio, Variables: `${TextosAgrandados}\n@media (max-width: 40rem) {\n\t:root {\n\t\t--texto-m: 1rem;\n\t\t--texto-l: var(--texto-m);\n\t}\n}\n` }],

	["Un tamaño a mano", 1, { CssAparte: "p {\n\tfont-size: 13px;\n}\n" }],
	["Un tamaño de la escala", 0, { CssAparte: "p {\n\tfont-size: var(--texto-s);\n}\n" }],
	["Un tamaño con una variable que no existe", 1, { CssAparte: "p {\n\tfont-size: var(--texto-2xl);\n}\n" }],
	["Un tamaño en em", 0, { CssAparte: "p {\n\tfont-size: 1.2em;\n}\n" }],
	["Una fuente a mano", 1, { CssAparte: "p {\n\tfont-family: Arial, sans-serif;\n}\n" }],
	["Una fuente de la marca o heredada", 0, { CssAparte: "p {\n\tfont-family: var(--fuente-normal);\n}\n\nb {\n\tfont-family: inherit;\n}\n" }],
	["Una fuente propia definida con @font-face", 0, { CssAparte: "@font-face {\n\tfont-family: 'Fuente Propia';\n\tfont-weight: 400;\n\tsrc: url('/fuentes/propia.ttf');\n}\n" }],
	["Una fuente del documento distinta a la del código", 1, { Marca: CambiarFila(MarcaDeEjemplo, "fuente-normal", "`Arial`") }],
	["Un peso a mano, con número o con palabra", 2, { CssAparte: "p {\n\tfont-weight: 700;\n}\n\nb {\n\tfont-weight: bold;\n}\n" }],
	["Un peso a mano en una plantilla", 1, { HtmlAparte: "<b style=\"font-weight: 700\">Hola</b>\n" }],
	["Un peso de la marca o heredado", 0, { CssAparte: "p {\n\tfont-weight: var(--peso-negrita);\n}\n\nb {\n\tfont-weight: inherit;\n}\n" }],
	["Un peso con una variable que no existe", 1, { CssAparte: "p {\n\tfont-weight: var(--peso-gruesa);\n}\n" }],
	["Un peso del documento distinto al del código", 1, { Marca: CambiarFila(MarcaDeEjemplo, "peso-negrita", "`600`") }],
	["Un interlineado a mano", 1, { CssAparte: "p {\n\tline-height: 1.35;\n}\n" }],
	["Un interlineado de 1 a mano", 1, { CssAparte: "p {\n\tline-height: 1;\n}\n" }],
	["Un interlineado de la marca o heredado", 0, { CssAparte: "p {\n\tline-height: var(--interlineado-m);\n}\n\ni {\n\tline-height: inherit;\n}\n" }],
	["Un interlineado del documento distinto al del código", 1, { Marca: CambiarFila(MarcaDeEjemplo, "interlineado-s", "`1.3`") }],
	["Un redondeado a mano, también en una sola esquina", 2, { CssAparte: "p {\n\tborder-radius: 4px;\n}\n\nb {\n\tborder-top-left-radius: 4px;\n}\n" }],
	["Un círculo y una píldora a mano", 2, { CssAparte: "p {\n\tborder-radius: 50%;\n}\n\nb {\n\tborder-radius: 999px;\n}\n" }],
	["Sin redondeado, completo y uno distinto en cada esquina", 0, { CssAparte: "p {\n\tborder-radius: 0;\n}\n\nb {\n\tborder-radius: var(--radio-completo);\n}\n\ni {\n\tborder-radius: var(--radio-m) var(--radio-m) 0 0;\n}\n" }],
	["El redondeado completo no tiene fila en la marca, y no se compara", 0, { Variables: Cambiar(VariablesDeEjemplo, "--radio-completo: 999px", "--radio-completo: 9999px") }],
	["Una fuente, un peso, un interlineado y un redondeado redefinidos fuera de global.css", 4, { CssAparte: ".tarjeta {\n\t--fuente-normal: Arial;\n\t--peso-negrita: 800;\n\t--interlineado-m: 1.8;\n\t--radio-m: 16px;\n}\n" }],
	["Un grosor de borde a mano, también en un solo lado o en un contorno", 3, { CssAparte: "p {\n\tborder: 1px solid var(--color-texto);\n}\n\nb {\n\tborder-top-width: 2px;\n}\n\ni {\n\toutline: thin solid var(--color-primario);\n}\n" }],
	["Bordes de la escala, en cero o sin borde", 0, { CssAparte: "p {\n\tborder: var(--borde-s) solid var(--color-texto);\n}\n\nb {\n\tborder: 0;\n}\n\ni {\n\tborder-bottom: none;\n}\n\nu {\n\tborder-width: var(--borde-s) 0;\n\tborder-color: var(--color-primario);\n}\n" }],
	["Un borde con una variable que no existe, o con una que no es de los bordes", 2, { CssAparte: "p {\n\tborder: var(--borde-inventado) solid;\n}\n\nb {\n\tborder: var(--espacio-s) solid;\n}\n" }],
	["Un borde redefinido fuera de global.css", 1, { CssAparte: ".tarjeta {\n\t--borde-s: 3px;\n}\n" }],
	["Un borde con su color escrito a mano falla solo por el color", 1, { CssAparte: "p {\n\tborder: var(--borde-s) solid #123456;\n}\n" }],
	["Las variables locales de color, con el nombre de su componente adelante, dentro y fuera del atajo border", 0, { CssAparte: ".tarjeta {\n\t--tarjeta-color-borde: var(--color-primario);\n\tborder: var(--borde-s) solid var(--tarjeta-color-borde);\n\tborder-top-color: var(--tarjeta-color-borde);\n\toutline-color: var(--color-texto);\n}\n" }],
	["Un color de borde que no es una variable de color, también fuera del atajo border", 2, { CssAparte: "p {\n\tborder-color: var(--espacio-s);\n}\n\nb {\n\toutline-color: var(--borde-s) transparent;\n}\n" }],
	["Una variable local de redondeado con el nombre de su componente adelante se revisa como un redondeado", 1, { CssAparte: ".tarjeta {\n\t--tarjeta-radio-esquina: 7px;\n\tborder-radius: var(--tarjeta-radio-esquina);\n}\n" }],
	["Una variable local de color que también nombra otra familia sigue siendo de color", 0, { CssAparte: ".tarjeta {\n\t--tarjeta-color-texto-suave: var(--color-texto);\n\tcolor: var(--tarjeta-color-texto-suave);\n}\n" }],
	["Una sombra de la escala, varias juntas o ninguna", 0, { CssAparte: "p {\n\tbox-shadow: var(--sombra-suave);\n}\n\nb {\n\tbox-shadow: var(--sombra-suave), var(--sombra-suave);\n}\n\ni {\n\tbox-shadow: none;\n}\n" }],
	["Una sombra a mano", 1, { CssAparte: "p {\n\tbox-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);\n}\n" }],
	["Una sombra con una variable que no existe", 1, { CssAparte: "p {\n\tbox-shadow: var(--sombra-inventada);\n}\n" }],
	["Sombras de la escala con otro color, con el suyo mezclado con otro color o sin color", 4, { Variables: Cambiar(VariablesDeEjemplo, "--sombra-suave: 0 1px 2px var(--color-sombra);", "--sombra-suave: 0 1px 2px red;\n\t--sombra-media: 0 2px 4px rgb(0 0 0 / 90%), 0 4px 8px var(--color-sombra);\n\t--sombra-mezclada: 0 1px 2px color-mix(in srgb, var(--color-sombra) 50%, red);\n\t--sombra-sin-color: 0 1px 2px;") }],
	["Una sombra de la escala con su color más transparente", 0, { Variables: Cambiar(VariablesDeEjemplo, "--sombra-suave: 0 1px 2px var(--color-sombra);", "--sombra-suave: 0 1px 2px color-mix(in srgb, var(--color-sombra) 50%, transparent);") }],
	["Una variable de global.css que apunta a otra que no existe, también en una sombra", 2, { Variables: Cambiar(VariablesDeEjemplo, "--sombra-suave: 0 1px 2px var(--color-sombra);", "--sombra-suave: 0 1px 2px var(--color-sombra);\n\t--sombra-tarjeta: var(--sombra-inventada);\n\t--ancho-tarjeta: var(--espacio-inventado);") }],
	["Sombras de la escala hacia adentro, que apuntan a otra o sin sombra", 0, { Variables: Cambiar(VariablesDeEjemplo, "--sombra-suave: 0 1px 2px var(--color-sombra);", "--sombra-suave: 0 1px 2px var(--color-sombra);\n\t--sombra-hundida: inset 0 1px 2px var(--color-sombra), 0 -1px 0 var(--color-sombra);\n\t--sombra-tarjeta: var(--sombra-suave);\n\t--sombra-plana: none;") }],
	["La opacidad de un control desactivado escrita a mano, también anidada o con aria-disabled, con espacios o sin ellos", 4, { CssAparte: "button:disabled {\n\topacity: 0.65;\n}\n\ninput {\n\t&:disabled {\n\t\topacity: 0.4;\n\t}\n}\n\n.boton[aria-disabled='true'] {\n\topacity: 0.5;\n}\n\n.otro[ aria-disabled = 'true' ] {\n\topacity: 0.65;\n}\n" }],
	["La opacidad de un control desactivado con su variable", 0, { Variables: VariablesConOpacidad, CssAparte: "button:disabled {\n\topacity: var(--opacidad-desactivado);\n}\n" }],
	["La opacidad en el atributo style de un control desactivado, escrita a mano", 2, { HtmlAparte: "<button disabled style=\"opacity: 0.65\">Hola</button>\n<button aria-disabled='true' style='opacity: 0.6'>Hola</button>\n" }],
	["Las demás opacidades se escriben con su valor", 0, { CssAparte: "p {\n\topacity: 0.8;\n}\n\nbutton:not(:disabled):hover {\n\topacity: 0.9;\n}\n\n.boton[aria-disabled='false'] {\n\topacity: 0.8;\n}\n\n.otro[aria-disabled = 'false'] {\n\topacity: 0.8;\n}\n", HtmlAparte: "<button title=\"Queda disabled\" style=\"opacity: 0.8\">Hola</button>\n" }],
	["Una opacidad redefinida fuera de global.css o con una variable que no existe", 2, { Variables: VariablesConOpacidad, CssAparte: ".tarjeta {\n\t--opacidad-desactivado: 0.3;\n}\n\np {\n\topacity: var(--opacidad-inventada);\n}\n" }],

	["Espacios de la escala, en cero, automáticos o heredados", 0, { CssAparte: "p {\n\tmargin: 0 auto;\n}\n\nb {\n\tpadding: var(--espacio-s) var(--espacio-m);\n}\n\ni {\n\tgap: inherit;\n}\n" }],
	["Un espacio a mano, también en un solo lado", 2, { CssAparte: "p {\n\tgap: 16px;\n}\n\nb {\n\tmargin-top: 1rem;\n}\n" }],
	["Un espacio a mano en una plantilla", 1, { HtmlAparte: "<p style=\"margin-top:16px\">Hola</p>\n" }],
	["Un ajuste fino sobre una variable", 0, { CssAparte: "p {\n\tpadding: calc(var(--espacio-m) + 1px);\n}\n\nb {\n\tmargin-bottom: calc(var(--espacio-s) - 0.25rem);\n}\n" }],
	["Un ajuste del tamaño del primer escalón o más", 1, { CssAparte: "p {\n\tpadding: calc(var(--espacio-m) + 5px);\n}\n" }],
	["Dos escalones sumados", 1, { CssAparte: "p {\n\tpadding: calc(var(--espacio-l) + var(--espacio-xs));\n}\n" }],
	["Un escalón multiplicado o dividido, que solo pasa por -1", 2, { CssAparte: "p {\n\tmargin: calc(var(--espacio-xs) * 3.2);\n}\n\nb {\n\tpadding: calc(var(--espacio-l) / 2);\n}\n\ni {\n\tmargin-top: calc(var(--espacio-m) * -1);\n}\n\nu {\n\tmargin-top: calc(-1 * var(--espacio-m));\n}\n" }],
	["Números sueltos más pequeños que el primer escalón", 0, { CssAparte: "p {\n\tmargin: 2px;\n}\n\nb {\n\tpadding: 0.1rem 4px;\n}\n\ni {\n\tmargin-top: -3px;\n}\n" }],
	["Lo que depende de la pantalla, con la escala en sus extremos o sin ella", 2, { CssAparte: "p {\n\tpadding: clamp(var(--espacio-m), 5vw, var(--espacio-l));\n}\n\nb {\n\tpadding-inline: max(var(--espacio-s), 4vw);\n}\n\ni {\n\tpadding: clamp(10px, 5vw, 40px);\n}\n\nu {\n\tpadding: 3vw;\n}\n" }],
	["Un espacio con una variable que no existe", 1, { CssAparte: "p {\n\tgap: var(--espacio-2xl);\n}\n" }],
	["Un espacio redefinido fuera de global.css", 1, { CssAparte: ".tarjeta {\n\t--espacio-m: 13px;\n}\n" }],
	["El tema alternativo no cambia lo que no es un color, como variable ni como propiedad", 3, { Variables: Cambiar(VariablesDeEjemplo, "--color-texto: #e8e2d6;", "--color-texto: #e8e2d6;\n\t--espacio-m: 100px;\n\t--texto-m: 1.2rem;"), CssAparte: "[data-tema='alternativo'] p {\n\tpadding: var(--espacio-l);\n}\n" }],
	["El tema alternativo cambia colores, y lo que la regla no revisa", 0, { Variables: Cambiar(VariablesDeEjemplo, "--color-texto: #e8e2d6;", "--color-texto: #e8e2d6;\n\tcolor-scheme: dark;"), CssAparte: "[data-tema='alternativo'] p {\n\tcolor: var(--color-secundario);\n\t--p-fondo: var(--color-fondo);\n\tdisplay: none;\n}\n" }],
	["El tema alternativo no cambia los bordes, y su color sí", 2, { Variables: Cambiar(VariablesDeEjemplo, "--color-texto: #e8e2d6;", "--color-texto: #e8e2d6;\n\t--borde-s: 2px;"), CssAparte: "[data-tema='alternativo'] p {\n\tborder: var(--borde-s) solid var(--color-texto);\n\tborder-color: var(--color-primario);\n}\n" }],
	["Un escalón de la escala que no es una medida", 1, { Variables: Cambiar(VariablesDeEjemplo, "--espacio-m: 20px", "--espacio-m: clamp(1rem, 2vw, 2rem)") }],
	["Nombres con números en los espacios, los bordes y las sombras", 0, { Variables: Cambiar(VariablesDeEjemplo, "--espacio-l: 30px;", "--espacio-l: 30px;\n\t--espacio-2xl: 40px;\n\t--borde-2xl: 4px;\n\t--sombra-2xl: 0 8px 16px var(--color-sombra);"), CssAparte: "p {\n\tpadding: var(--espacio-2xl);\n\tborder: var(--borde-2xl) solid var(--color-primario);\n\tbox-shadow: var(--sombra-2xl);\n}\n" }],
	["Un color con números en su nombre, también en un borde", 0, { Marca: Cambiar(MarcaDeEjemplo, "| `color-texto` | `3d4a49` |", "| `color-texto` | `3d4a49` |\n| `color-gris-2` | `3d4a49` |"), Variables: Cambiar(VariablesDeEjemplo, "--color-texto: #3d4a49;", "--color-texto: #3d4a49;\n\t--color-gris-2: #3d4a49;"), CssAparte: "p {\n\tcolor: var(--color-gris-2);\n\tborder-color: var(--color-gris-2);\n}\n" }],
	["Variables locales con familia que ninguna plantilla define, en un espacio y en un color", 2, { CssAparte: ".tarjeta {\n\tpadding: var(--tarjeta-espacio-inventado);\n\tcolor: var(--tarjeta-color-inventado);\n}\n" }],
];


function Cambiar(texto: string, viejo: string, nuevo: string): string { // Si lo que se quiere cambiar no está, el caso no probaría nada, así que falla con ruido.

	if (!texto.includes(viejo)) throw new Error(`El ejemplo no trae: ${viejo}`);
	return texto.replace(viejo, nuevo);

}


function CambiarFila(documento: string, nombre: string, valor: string): string { // Cambia el valor de una fila, que queda vacía si el valor viene vacío.

	const fila = new RegExp(`\\| \`${nombre}\` \\|[^\\n]*\\|`);
	if (!fila.test(documento)) throw new Error(`El ejemplo no trae la fila ${nombre}.`);
	return documento.replace(fila, `| \`${nombre}\` | ${valor} |`);

}


function Vaciar(documento: string): string { // Deja todas las filas sin valor, como una plantilla.
	return documento.replace(/^(\| `[\w-]+` \|)[^\n]*\|$/gm, "$1 |");
}


function ContarErrores(opciones: OpcionesDelCaso): number { // Escribe los archivos del caso y corre la regla como lo hace npm run reglas, desde la carpeta del worker. Si la regla se detiene sin reportar errores, es que se dañó, y eso se deja ver.

	const { Marca: marca = MarcaDeEjemplo, Diseño: diseño = DiseñoDeEjemplo, Variables: variables = VariablesDeEjemplo, Propio: propio = "", CssAparte: cssAparte = "", HtmlAparte: htmlAparte = "" } = opciones;
	fs.writeFileSync(path.join(Carpeta, "Bases", "Marca.md"), marca);
	fs.writeFileSync(path.join(Carpeta, "Bases", "Diseño.md"), diseño ?? "");
	fs.writeFileSync(path.join(CarpetaWorker, "static", "css", "global.css"), variables);
	fs.writeFileSync(path.join(CarpetaWorker, "static", "css", "aparte.css"), cssAparte);
	fs.writeFileSync(path.join(CarpetaWorker, "static", "html", "aparte.html"), htmlAparte);
	const declaraciónDeDiseño = diseño === null ? "" : "export const DocumentoDeDiseño = \"Bases/Diseño.md\";\n";
	fs.writeFileSync(path.join(Carpeta, "Programas", "reglas-diseno-proyecto.mts"), `export const DocumentoDeMarca = "Bases/Marca.md";\n${declaraciónDeDiseño}${propio}`);
	let errores = 0;
	try {
		execFileSync(process.execPath, [path.join("..", "Programas", "reglas-diseno.mts")], { cwd: CarpetaWorker, encoding: "utf8", stdio: "pipe" });
	} catch (error) {

		errores = (error as { stderr: string }).stderr.split("\n").filter(línea => línea.startsWith("- ")).length;
		if (errores === 0) throw error;

	}
	return errores;

}


fs.rmSync(Carpeta, { recursive: true, force: true });
fs.mkdirSync(path.join(Carpeta, "Bases"), { recursive: true });
fs.mkdirSync(path.join(Carpeta, "Programas"), { recursive: true });
fs.mkdirSync(path.join(CarpetaWorker, "static", "css"), { recursive: true });
fs.mkdirSync(path.join(CarpetaWorker, "static", "html"), { recursive: true });
fs.copyFileSync(path.join(import.meta.dirname, "reglas-diseno.mts"), path.join(Carpeta, "Programas", "reglas-diseno.mts"));
const Fallidos = Casos.filter(([rótulo, esperados, opciones]) => {

	const errores = ContarErrores(opciones);
	if (errores !== esperados) console.error(`- ${rótulo}: dio ${errores} errores, y se esperaban ${esperados}.`);
	return errores !== esperados;

});
fs.rmSync(Carpeta, { recursive: true, force: true });
console.log(`Pruebas de la regla de diseño: pasaron ${Casos.length - Fallidos.length} de ${Casos.length}.`);
if (Fallidos.length > 0) process.exitCode = 1; // Hace fallar al Verificador.
