import { execFileSync } from "node:child_process"; // Revisa las reglas del AGENTS.md de la plantilla que el linter no puede revisar, porque dependen de varios archivos: que todo texto visible esté en static/textos con las mismas claves en todos los idiomas, que .dev.vars no vaya en git y que el JavaScript de las páginas esté en src-ui y no dentro del HTML. Es igual en todos los proyectos que salen de Web Core. Se corre con npm run reglas, y deploy lo corre antes de subir. Node lo carga sin compilarlo, igual que reglas-typescript.mts.
import fs from "node:fs";
import path from "node:path";


const Carpeta = process.cwd(); // La carpeta del worker. Este archivo está en Programas, pero se corre con npm run reglas, que lo abre en la carpeta del worker, tanto desde el Verificador como desde deploy.
const ClavesQueLlenaElCódigo = ["ruta-actual-codificada"]; // Claves entre llaves dobles que no tienen texto en static/textos porque las llena el núcleo, en idiomas.ts.


function LeerIdiomasSoportados(): string[] { // Lee la lista IdiomasSoportados de src/configuracion.ts, que dice qué archivos de static/textos debe haber. La lee como texto, porque Node no puede cargar ese archivo sin compilar el resto del proyecto.

	const configuración = fs.readFileSync(path.join(Carpeta, "src", "configuracion.ts"), "utf8");
	const lista = /const IdiomasSoportados\b[^=]*=\s*\[([^\]]*)\]/.exec(configuración);
	if (lista === null) throw new Error("No se encontró la lista IdiomasSoportados en src/configuracion.ts.");
	return [...lista[1].matchAll(/['"]([^'"]+)['"]/g)].map(coincidencia => coincidencia[1]);

}


function BuscarClavesEnHtml(carpeta: string, claves: Map<string, string>): void { // Recorre static/html y anota cada clave entre llaves dobles con el primer archivo donde aparece.

	for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {

		const ruta = path.join(carpeta, entrada.name);
		if (entrada.isDirectory()) {
			BuscarClavesEnHtml(ruta, claves);
		} else if (entrada.name.endsWith(".html")) {

			for (const coincidencia of fs.readFileSync(ruta, "utf8").matchAll(/\{\{([^{}]+)\}\}/g)) {
				const clave = coincidencia[1].trim();
				if (!claves.has(clave)) claves.set(clave, path.relative(Carpeta, ruta).replaceAll("\\", "/"));
			}

		}

	}

}


function RevisarTextos(errores: string[]): void { // Revisa la regla del AGENTS.md de la plantilla que pide todo texto visible en static/textos, en los idiomas de IdiomasSoportados: todos tienen las mismas claves, y cada clave que usa el HTML tiene su texto.

	const clavesPorIdioma = new Map<string, Set<string>>();
	for (const idioma of LeerIdiomasSoportados()) {
		const textos = JSON.parse(fs.readFileSync(path.join(Carpeta, "static", "textos", `${idioma}.json`), "utf8")) as Record<string, unknown>;
		clavesPorIdioma.set(idioma, new Set(Object.keys(textos)));
	}
	const todasLasClaves = new Set([...clavesPorIdioma.values()].flatMap(claves => [...claves]));
	for (const [idioma, claves] of clavesPorIdioma) {

		for (const clave of todasLasClaves) {
			if (!claves.has(clave))
				errores.push(`La clave '${clave}' falta en static/textos/${idioma}.json: agrégala con su texto en ese idioma.`);
		}

	}
	const clavesDelHtml = new Map<string, string>();
	BuscarClavesEnHtml(path.join(Carpeta, "static", "html"), clavesDelHtml);
	for (const [clave, archivo] of clavesDelHtml) {
		if (!todasLasClaves.has(clave) && !ClavesQueLlenaElCódigo.includes(clave))
			errores.push(
				`La clave {{${clave}}} de ${archivo} no tiene texto en static/textos: agrégala en todos los idiomas, o escríbela entre corchetes dobles si es un hueco que llena el código.`);
	}

}


function EstáIgnoradoPorGit(archivo: string): boolean { // Pregunta a git si ignora el archivo. git check-ignore termina con 0 si lo ignora, con 1 si no lo ignora y con otro código si algo falla.

	let ignorado = true;
	try {
		execFileSync("git", ["check-ignore", "-q", archivo], { cwd: Carpeta });
	} catch (error) {
		if ((error as { status?: number; }).status !== 1) throw error; // Otro código de salida es una falla de git, no un archivo sin ignorar, y se deja ver tal cual.
		ignorado = false;
	}
	return ignorado;

}


function RevisarSecretos(errores: string[]): void { // Revisa la regla del AGENTS.md de la plantilla que pide los secretos fuera del repositorio: .dev.vars, donde van los secretos locales, está ignorado por git y no está rastreado.

	const rastreado = execFileSync("git", ["ls-files", ".dev.vars"], { cwd: Carpeta, encoding: "utf8" }).trim() !== "";
	if (rastreado) errores.push(".dev.vars está en git: sácalo con git rm --cached .dev.vars, porque guarda los secretos locales.");
	if (!EstáIgnoradoPorGit(".dev.vars")) errores.push(".dev.vars no está en .gitignore: agrégalo, porque guarda los secretos locales.");

}


function ListarArchivos(carpeta: string, extensión: string): string[] { // Los archivos con esa extensión que hay en la carpeta y en sus subcarpetas, con su ruta completa.

	return fs.readdirSync(carpeta, { withFileTypes: true, recursive: true })
		.filter(entrada => entrada.isFile() && entrada.name.endsWith(extensión))
		.map(entrada => path.join(entrada.parentPath, entrada.name));

}


function BuscarPáginasConNonce(): Set<string> { // Las páginas de static/html que alguna ruta responde con ResponderHtmlConNonce, la única forma de responder un HTML con un script escrito adentro, porque le agrega el nonce que pide la política de seguridad. Las saca de los archivos de src que llaman a esa función, de las rutas '/html/...' que cargan con CargarHtmlLocal.

	const páginas = new Set<string>();
	for (const archivo of ListarArchivos(path.join(Carpeta, "src"), ".ts")) {

		const código = fs.readFileSync(archivo, "utf8");
		if (código.includes("ResponderHtmlConNonce(")) {
			for (const coincidencia of código.matchAll(/['"]\/html\/([^'"]+\.html)['"]/g)) páginas.add(coincidencia[1]);
		}

	}
	return páginas;

}


function RevisarScriptsEnHtml(errores: string[]): void { // Revisa la regla del AGENTS.md de la plantilla que pide el JavaScript de las páginas en src-ui. En producción, la política de seguridad bloquea los scripts escritos dentro del HTML, y en local no, así que el error solo aparecería al desplegar. Solo se permiten en las páginas que se responden con ResponderHtmlConNonce.

	const páginasConNonce = BuscarPáginasConNonce();
	const carpetaHtml = path.join(Carpeta, "static", "html");
	for (const archivo of ListarArchivos(carpetaHtml, ".html")) {

		const página = path.relative(carpetaHtml, archivo).replaceAll("\\", "/");
		const etiquetas = [...fs.readFileSync(archivo, "utf8").matchAll(/<script\b([^>]*)>/gi)];
		const tieneScriptAdentro = etiquetas.some(etiqueta => !/\bsrc\s*=/i.test(etiqueta[1])); // Un script sin src lleva su código escrito dentro del HTML.
		if (tieneScriptAdentro && !páginasConNonce.has(página))
			errores.push(
				`static/html/${página} tiene un <script> escrito dentro del HTML, que la política de seguridad bloquea en producción: pasa su JavaScript a src-ui/, o, si es una página de prueba, respóndela con ResponderHtmlConNonce.`);

	}

}


const Errores: string[] = []; // Las reglas que no se cumplen, cada una con lo que hay que hacer para arreglarla.
RevisarTextos(Errores);
RevisarSecretos(Errores);
RevisarScriptsEnHtml(Errores);
if (Errores.length > 0) {
	console.error(`Reglas de la plantilla que no se cumplen:\n${Errores.map(error => `- ${error}`).join("\n")}`);
	process.exitCode = 1; // Hace fallar a npm run reglas, y con él a deploy.
}
