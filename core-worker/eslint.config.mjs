import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import stylistic from "@stylistic/eslint-plugin"; // Paquete unificado de ESLint Stylistic, que reemplaza al viejo @stylistic/eslint-plugin-ts. Se queda en la versión 4 porque la 5 dejó de revisar las llaves de interface y enum, y ninguna otra regla las revisa.
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import reglasTypeScript, { ComplementoGeneral } from "../Programas/reglas-typescript.mts"; // Las reglas generales de TypeScript, con el complemento de las reglas generales propias. El original es el de Web Core, y cada proyecto hecho desde Core guarda una copia idéntica, que no se edita: se edita el original y se vuelve a copiar. Node carga el .mts directamente, sin compilarlo.
const __dirname = path.dirname(fileURLToPath(import.meta.url)); // Esto da la ruta real de la carpeta donde está este archivo.
const rutaReglasPersonales = path.join(__dirname, "..", "Programas", "reglas-personales.mts"); // Reglas de estilo personales de quien trabaja en el proyecto, junto a las reglas generales de TypeScript. En los proyectos que se publican el archivo no va en git, para no imponérselas a todos los que los usan.
const reglasPersonales = existsSync(rutaReglasPersonales) ? await import(pathToFileURL(rutaReglasPersonales).href) : undefined; // Se cargan solo si el archivo existe. Si no existe, el proyecto usa solo las reglas generales.
const SelectoresContexto = [ // Revisan la regla del AGENTS.md de la plantilla que pide que las funciones que necesitan el contexto lo reciban como primer parámetro y con el nombre contexto. Solo miran los parámetros de tipo Contexto, así que un contexto opcional, como 'contexto: Contexto | null = null', queda por fuera.
	{ selector: ":function > Identifier.params[typeAnnotation.typeAnnotation.typeName.name='Contexto']:not(:first-child)", message: "Una función que necesita el contexto lo recibe como primer parámetro: contexto: Contexto." },
	{ selector: ":function > Identifier.params[typeAnnotation.typeAnnotation.typeName.name='Contexto']:not([name=/^_?contexto$/])", message: "El parámetro del contexto se llama contexto: contexto: Contexto." }, // También vale _contexto, el nombre de descarte de una función que no lo usa.
];
const MensajePatrónRuta = "Las rutas siguen el patrón export async function NombreRuta(contexto: Contexto): Promise<Response>."; // Mensaje común de los tres selectores que revisan el patrón de las rutas.
const MensajeCookies = "En las rutas no se escriben cookies en los encabezados: acumúlalas en contexto.CookiesRespuesta o usa las funciones de src/nucleo/autenticacion.ts y src/nucleo/respuestas.ts."; // Mensaje común de los dos selectores de las cookies.
const MensajePáginaCompleta = "La página completa no va en el TypeScript de la ruta: su HTML va en un archivo propio en static/html."; // Mensaje común de los dos selectores del HTML completo.
const SelectoresRutas = [ // Revisan las reglas del AGENTS.md de la plantilla que son solo para las rutas de cada proyecto.
	{ selector: "NewExpression[callee.name='Response']", message: "En las rutas no se crea new Response(): usa las funciones Responder de src/nucleo/respuestas.ts, como Responder(), ResponderConMarco() o ResponderRedirección()." },
	{ selector: "CallExpression[callee.property.name=/^(set|append)$/][arguments.0.value=/^set-cookie$/i]", message: MensajeCookies }, // Un headers.set('Set-Cookie', ...) o un headers.append('Set-Cookie', ...).
	{ selector: "Property[key.value=/^set-cookie$/i]", message: MensajeCookies }, // Un 'Set-Cookie' dentro de un objeto de encabezados.
	{ selector: "TemplateElement[value.raw=/<(html|head|body)[\\s>]|<!doctype/i]", message: MensajePáginaCompleta }, // Un documento HTML completo dentro de una plantilla de texto.
	{ selector: "Literal[value=/<(html|head|body)[\\s>]|<!doctype/i]", message: MensajePáginaCompleta }, // Un documento HTML completo dentro de un texto entre comillas.
	{ selector: "ExportNamedDeclaration > FunctionDeclaration[returnType.typeAnnotation.typeName.name='Response']", message: MensajePatrónRuta }, // Una ruta que devuelve Response sin Promise, porque no es async. Una función exportada que devuelve otra cosa, como un envoltorio que devuelve un Manejador, no es una ruta y queda por fuera.
	{ selector: "ExportNamedDeclaration > FunctionDeclaration[returnType.typeAnnotation.typeName.name='Promise'][returnType.typeAnnotation.typeArguments.params.0.typeName.name='Response'][async=false]", message: MensajePatrónRuta }, // Una ruta que devuelve Promise<Response> sin ser async.
	{ selector: "ExportNamedDeclaration > FunctionDeclaration[returnType.typeAnnotation.typeName.name='Promise'][returnType.typeAnnotation.typeArguments.params.0.typeName.name='Response']:not([params.0.name=/^_?contexto$/][params.0.typeAnnotation.typeAnnotation.typeName.name='Contexto'])", message: MensajePatrónRuta }, // Una ruta cuyo primer parámetro no es contexto: Contexto.
];

export default [
	{
		files: ["**/*.ts"],
		ignores: ["pruebas/**"], // Las pruebas tienen su propio bloque, al final.
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: path.join(__dirname, "tsconfig.json"), // Necesario para que naming-convention funcione al 100%.
			},
		},
		plugins: {
			"@typescript-eslint": tsPlugin,
			"@stylistic": stylistic,
			"generales": ComplementoGeneral, // Las reglas generales propias, para lo que ESLint no trae.
			...(reglasPersonales === undefined ? {} : { "personales": reglasPersonales.ComplementoPersonal }), // El complemento con las reglas personales, solo si su archivo existe.
		},
		rules: { ...reglasTypeScript, ...(reglasPersonales === undefined ? {} : reglasPersonales.default) } // Las reglas generales de TypeScript, más las personales cuando su archivo existe. Las propias de esta plantilla van en los bloques siguientes.
	},
	{
		files: ["src/nucleo/*.ts"], // Archivos de la raíz del núcleo, que es el mismo en todos los workers y por eso no puede depender del código propio de un proyecto.
		rules: {
			"no-restricted-imports": ["error", { patterns: [{ regex: "^\\.\\./(?!configuracion$|rutas$|\\.\\./static/)", message: "El núcleo solo importa del núcleo, de configuracion.ts, de rutas.ts y de static: lo propio de cada proyecto no se importa desde el núcleo." }] }] // Desde la raíz del núcleo, '../' ya sale del núcleo: solo se permite llegar a configuracion.ts, a rutas.ts y a static.
		}
	},
	{
		files: ["src/nucleo/*/*.ts"], // Archivos de las subcarpetas del núcleo, como rutas e ia, que necesitan un '../' más para salir del núcleo.
		rules: {
			"no-restricted-imports": ["error", { patterns: [{ regex: "^\\.\\./\\.\\./(?!configuracion$|rutas$|\\.\\./static/)", message: "El núcleo solo importa del núcleo, de configuracion.ts, de rutas.ts y de static: lo propio de cada proyecto no se importa desde el núcleo." }] }] // Desde una subcarpeta, '../../' sale del núcleo: solo se permite llegar a configuracion.ts, a rutas.ts y a static.
		}
	},
	{
		files: ["src/**/*.ts"], // Todo el código del worker, también el núcleo.
		rules: {
			"no-restricted-syntax": ["error", ...SelectoresContexto] // El contexto como primer parámetro. Las rutas repiten estos selectores en su bloque, porque ESLint no suma las opciones de una misma regla entre bloques: el último reemplaza al anterior.
		}
	},
	{
		files: ["src/**/*.ts"], // El código propio de cada proyecto, sin el núcleo, que es el que implementa los registros.
		ignores: ["src/nucleo/**"],
		rules: {
			"no-restricted-globals": ["error", { name: "console", message: "No se usa console: los eventos se registran con RegistrarEventoConPrefijo() de src/nucleo/global.ts." }] // Revisa la regla del AGENTS.md de la plantilla que pide registros estructurados en vez de registros sueltos.
		}
	},
	{
		files: ["src/*/rutas/**/*.ts"], // Las rutas de cada proyecto. Las del núcleo quedan por fuera, como sitemap.ts, que devuelve XML.
		ignores: ["src/nucleo/**"],
		rules: {
			"no-restricted-syntax": ["error", ...SelectoresContexto, ...SelectoresRutas] // Las reglas de las rutas, más las del contexto, que este bloque reemplazaría si no las repitiera.
		}
	},
	{
		files: ["pruebas/**/*.ts"], // Las pruebas pasan solo por las reglas generales que revisan el texto del código. Las demás reglas son para el código del worker, y muchas necesitan sus tipos.
		languageOptions: { parser: tsParser },
		plugins: { "generales": ComplementoGeneral },
		rules: {
			"generales/caracteres-invisibles-con-escape": reglasTypeScript["generales/caracteres-invisibles-con-escape"],
			"generales/titulos-each-sin-tildes": reglasTypeScript["generales/titulos-each-sin-tildes"]
		} // Con el mismo nivel que les dan las reglas generales.
	}
];
