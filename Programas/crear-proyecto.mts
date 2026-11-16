/**
 * Crea un proyecto nuevo desde Web Core. Copia la plantilla, le cambia el nombre a la carpeta del worker y reemplaza los
 * valores propios de Core por los del proyecto nuevo, solo en los lugares que conoce y siempre con el elemento completo, como
 * "name": "core-worker" por "name": "nuevo-worker". Antes de escribir nada, revisa que cada elemento aparezca las veces que espera
 * y que en la copia no quede ningún valor de Core, y si algo no cuadra, se detiene sin crear nada. Nunca escribe en git ni instala nada.
 * Solo funciona en Web Core Público, github.com/DavidZeir/Web-Core, o en un clon suyo: en la copia privada, donde se desarrolla
 * Web Core con sus bases, se detiene.
 *
 * Se corre con todos los argumentos, por ejemplo:
 * node Programas/crear-proyecto.mts --destino "D:\Proyectos\Web Nuevo" --nombre nuevo --nombre-correcto "Nuevo" --dominio nuevo.com
 *   --correo-administrador administrador@nuevo.com --numero-proyecto 1004 --id-base-de-datos pendiente
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';


type Valores = { Destino: string; Nombre: string; NombreCorrecto: string; Dominio: string; CorreoAdministrador: string;
	NúmeroProyecto: string; IdBaseDeDatos: string; };
type Cambio = [viejo: string, nuevo: string, veces: number]; // El elemento completo que tiene Core, el que lo reemplaza y cuántas veces debe aparecer en su archivo.
type Archivo = { Origen: string; Destino: string; Contenido: Buffer | string; }; // Cada archivo de la copia, con su ruta en la plantilla, su ruta en el proyecto nuevo y lo que se escribe: el texto ya reemplazado o, si no está en la lista, sus bytes tal cual.

const Plantilla = path.resolve(import.meta.dirname, '..'); // La carpeta de Web Core, un nivel arriba de Programas, la carpeta de este archivo.
const EsteArchivo = path.relative(Plantilla, import.meta.filename).replaceAll(path.sep, '/'); // Su ruta desde la plantilla, con /, como la da git, para no copiarlo: los proyectos nuevos no necesitan el generador.
const ValoresDeCore = ['core-worker', 'core-api', 'core.test', 'bd-core', 'id-bd-core', '999901', '999902']; // Ninguno puede quedar en la copia. El nombre visible, Web Core, no está, porque también aparece como referencia a la plantilla, como en el pie de página o en los comentarios.

Exigir(!fs.existsSync(path.join(Plantilla, 'Bases')), // Los proyectos solo salen de la copia pública, que no trae la carpeta Bases, porque las bases son del desarrollo de Web Core y no de los proyectos que salen de él. La copia privada se reconoce por esa carpeta, y no por el nombre de la carpeta de la plantilla ni por su remoto, que cambian en cada computador y en cada clon.
	'Esta es la copia privada de Web Core, donde se desarrolla con sus bases. Los proyectos se crean desde Web Core Público, github.com/DavidZeir/Web-Core, o desde un clon suyo.');
const Valores = LeerValores(process.argv.slice(2));
const Raíz = path.basename(Valores.Destino).toLowerCase().replace(/\s+/g, '-'); // El nombre del package.json de la raíz sale de la carpeta del proyecto, como web-pago-gratis de Web Pago Gratis.
const Worker = `${Valores.Nombre}-worker`; // La carpeta del worker, que en Core es core-worker.
const NombreCorrecto = Valores.NombreCorrecto;
const Reemplazos: Record<string, Cambio[]> = { // Por cada archivo de Core, los elementos completos que se reemplazan. Ningún otro texto se toca.
	'package.json': [
		['"name": "web-core",', `"name": "${Raíz}",`, 1],
		['"verificador": "npm --prefix core-worker run verificador"', `"verificador": "npm --prefix ${Worker} run verificador"`, 1],
	],
	'README.md': [['# Web Core', `# ${path.basename(Valores.Destino)}`, 1]],
	'USE Scribe/Settings.json': [
		['"../core-worker/static/html"', `"../${Worker}/static/html"`, 1],
		['"../core-worker/static/css"', `"../${Worker}/static/css"`, 1],
		['"../core-worker"', `"../${Worker}"`, 1],
	],
	'core-worker/package.json': [['"name": "core-worker",', `"name": "${Worker}",`, 1]],
	'core-worker/package-lock.json': [['"name": "core-worker",', `"name": "${Worker}",`, 2]],
	'core-worker/wrangler.jsonc': [
		['"name": "core-worker",', `"name": "${Worker}",`, 1],
		['{"pattern": "core.test", "custom_domain": true}', `{"pattern": "${Valores.Dominio}", "custom_domain": true}`, 1],
		['"database_name": "bd-core", "database_id": "id-bd-core",',
			`"database_name": "bd-${Valores.Nombre}", "database_id": "${Valores.IdBaseDeDatos}",`, 1],
		['"namespace_id": "999901"', `"namespace_id": "${Valores.NúmeroProyecto}01"`, 1],
		['"namespace_id": "999902"', `"namespace_id": "${Valores.NúmeroProyecto}02"`, 1],
	],
	'core-worker/src/configuracion.ts': [
		['export const NombreSitio = "Web Core";', `export const NombreSitio = "${NombreCorrecto}";`, 1],
		['export const CorreoEnvíoEnlacesMágicos = "entrar@core.test";',
			`export const CorreoEnvíoEnlacesMágicos = "entrar@${Valores.Dominio}";`, 1],
		['export const DominioProducción = "core.test";', `export const DominioProducción = "${Valores.Dominio}";`, 1],
		['export const CorreoAdministrador = "administrador@core.test";',
			`export const CorreoAdministrador = "${Valores.CorreoAdministrador}";`, 1],
		["export const EmisorJwtIdentidad = 'core-worker';", `export const EmisorJwtIdentidad = '${Worker}';`, 1],
		["export const AudienciaJwtIdentidad = 'core-api';", `export const AudienciaJwtIdentidad = '${Valores.Nombre}-api';`, 1],
	],
	'core-worker/src/rutas.ts': [
		["Título: 'Web Core - Título de Web Core',",
			`Título: '${NombreCorrecto} - Título de ${NombreCorrecto}',`, 1],
		["Descripción: 'Descripción de Web Core',", `Descripción: 'Descripción de ${NombreCorrecto}',`, 1],
		["Título: 'Web Core - Web Core Title',",
			`Título: '${NombreCorrecto} - ${NombreCorrecto} Title',`, 1],
		["Descripción: 'Web Core Description',", `Descripción: '${NombreCorrecto} Description',`, 1],
	],
	'core-worker/static/textos/es.json': [
		['"marco-titulo-principal": "Web Core",', `"marco-titulo-principal": "${NombreCorrecto}",`, 1],
	],
	'core-worker/static/textos/en.json': [
		['"marco-titulo-principal": "Web Core",', `"marco-titulo-principal": "${NombreCorrecto}",`, 1],
	],
	'core-worker/static/robots.txt': [['Sitemap: https://core.test/sitemap.xml', `Sitemap: https://${Valores.Dominio}/sitemap.xml`, 1]],
};

const Archivos = PrepararArchivos();
RevisarQueNoQuedenValoresDeCore(Archivos);
Escribir(Archivos);
MostrarLoQueFalta();


function LeerValores(argumentos: string[]): Valores { // Lee los argumentos, de la forma --clave valor, y se detiene si falta alguno, si sobra alguno o si un valor no sirve donde va.

	const leídos = new Map<string, string>();
	for (let i = 0; i < argumentos.length; i += 2) {

		const clave = argumentos[i], valor = argumentos[i + 1];
		if (!clave.startsWith('--') || valor === undefined) Fallar(`No entiendo el argumento ${clave}: cada uno va como --clave valor.`);
		leídos.set(clave.slice(2), valor);

	}
	const claves = ['destino', 'nombre', 'nombre-correcto', 'dominio', 'correo-administrador', 'numero-proyecto', 'id-base-de-datos'];
	const faltantes = claves.filter(clave => !leídos.has(clave));
	const sobrantes = [...leídos.keys()].filter(clave => !claves.includes(clave));
	if (faltantes.length > 0 || sobrantes.length > 0)
		Fallar(`Faltan: ${faltantes.join(', ') || 'ninguno'}. Sobran: ${sobrantes.join(', ') || 'ninguno'}. Van todos estos: --${claves.join(', --')}.`);
	const leer = (clave: string): string => leídos.get(clave) ?? Fallar(`Falta --${clave}.`);
	const valores: Valores = { Destino: path.resolve(leer('destino')), Nombre: leer('nombre'), NombreCorrecto: leer('nombre-correcto'),
		Dominio: leer('dominio'), CorreoAdministrador: leer('correo-administrador'), NúmeroProyecto: leer('numero-proyecto'),
		IdBaseDeDatos: leer('id-base-de-datos') };
	const relativaAPlantilla = path.relative(Plantilla, valores.Destino); // Vacía si el destino es la plantilla, y sin .. en su primer tramo si está dentro de ella.
	const afueraDeLaPlantilla = relativaAPlantilla.split(path.sep)[0] === '..' || path.isAbsolute(relativaAPlantilla); // En otra unidad, como C:, la ruta relativa sale absoluta.
	Exigir(/^[a-z][a-z0-9-]*$/.test(valores.Nombre) && valores.Nombre !== 'core',
		'--nombre va en minúsculas, con números y guiones, empieza por una letra y no puede ser core, porque va en el nombre del paquete de npm, del worker y de su carpeta.');
	Exigir(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(valores.Dominio), '--dominio tiene que ser un dominio en minúsculas, como nuevo.com.');
	Exigir(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valores.CorreoAdministrador), '--correo-administrador tiene que ser un correo.');
	Exigir(/^[1-9][0-9]*$/.test(valores.NúmeroProyecto),
		'--numero-proyecto tiene que ser un número, porque los limitadores de correos de wrangler.jsonc lo usan como identificador.');
	Exigir(valores.NombreCorrecto.trim() !== '' && valores.IdBaseDeDatos.trim() !== ''
		&& !/["'\\\u0000-\u001f]/.test(valores.NombreCorrecto + valores.IdBaseDeDatos),
		'--nombre-correcto y --id-base-de-datos no pueden ir vacíos ni llevar comillas, barras invertidas o saltos de línea, porque van dentro de textos entre comillas.');
	Exigir(afueraDeLaPlantilla, 'El destino no puede ser la plantilla ni estar dentro de ella.');
	Exigir(fs.existsSync(path.dirname(valores.Destino)),
		`No existe la carpeta donde iría el proyecto: ${path.dirname(valores.Destino)}.`);
	Exigir(!fs.existsSync(valores.Destino) || fs.readdirSync(valores.Destino).length === 0,
		`${valores.Destino} ya existe y no está vacía.`);
	return valores;

}


function PrepararArchivos(): Archivo[] { // Lee cada archivo que se copia y le aplica sus reemplazos en memoria, sin escribir nada todavía.

	const listados = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
		{ cwd: Plantilla, encoding: 'utf8' }).split('\0'); // Lo que git guarda o no ignora, así que no se copian las claves, como .dev.vars, ni lo que se arma solo, como node_modules o .wrangler.
	const rutas = [...new Set(listados)].filter(ruta => ruta !== '' && ruta !== EsteArchivo
		&& !ruta.startsWith('Temporal/') && fs.existsSync(path.join(Plantilla, ruta))); // Sin los borrados que git todavía tiene en su índice, y sin Temporal/, por si la plantilla guarda ahí proyectos de ejemplo.
	for (const ruta of Object.keys(Reemplazos))
		if (!rutas.includes(ruta))
			Fallar(`La lista de reemplazos tiene ${ruta}, pero la plantilla ya no lo tiene. Hay que poner la lista al día.`);
	return rutas.map(ruta => {

		const bytes = fs.readFileSync(path.join(Plantilla, ruta));
		const contenido = Reemplazos[ruta] ? Reemplazar(ruta, bytes.toString('utf8')) : bytes; // Solo los archivos de la lista se leen como texto. Los demás se copian byte por byte, tal cual.
		return { Origen: ruta, Destino: path.join(Valores.Destino, ruta.replace(/^core-worker\//, `${Worker}/`)), Contenido: contenido };

	});

}


function Reemplazar(ruta: string, texto: string): string { // Aplica en orden los cambios de un archivo, y se detiene si algún elemento no aparece las veces que espera, porque eso quiere decir que la plantilla cambió y la lista quedó vieja.

	let resultado = texto;
	for (const [viejo, nuevo, veces] of Reemplazos[ruta]) {

		const encontradas = resultado.split(viejo).length - 1;
		if (encontradas !== veces)
			Fallar(`En ${ruta}, ${viejo} aparece ${encontradas} veces, y se esperaban ${veces}. Hay que poner la lista al día.`);
		resultado = resultado.split(viejo).join(nuevo);

	}
	return resultado;

}


function RevisarQueNoQuedenValoresDeCore(archivos: Archivo[]): void { // Busca en la copia, antes de escribirla, los valores de Core que no deberían quedar. Si alguno aparece en un archivo que la lista no conoce, se detiene, para que se agregue a la lista.

	const restos: string[] = [];
	for (const archivo of archivos) {

		const esBinario = typeof archivo.Contenido !== 'string' && archivo.Contenido.includes(0); // Un archivo con un byte en cero es binario, como una imagen, y no se revisa.
		const texto = esBinario ? '' : archivo.Contenido.toString();
		for (const valor of ValoresDeCore) if (texto.includes(valor)) restos.push(`${archivo.Origen}: ${valor}`);

	}
	if (restos.length > 0)
		Fallar(`En la copia quedan valores de Core, en lugares que la lista de reemplazos no conoce:\n${restos.join('\n')}`);

}


function Escribir(archivos: Archivo[]): void { // Crea el proyecto nuevo. Solo llega aquí si todo lo anterior cuadró.

	for (const archivo of archivos) {
		fs.mkdirSync(path.dirname(archivo.Destino), { recursive: true });
		fs.writeFileSync(archivo.Destino, archivo.Contenido);
	}
	console.log(`Proyecto creado en ${Valores.Destino}, con ${archivos.length} archivos.`);

}


function MostrarLoQueFalta(): void { // Lo que el generador no hace, porque es de git, de Cloudflare, de las claves o de Trabajo Agéntico, y queda para hacer a mano.

	const pasos = [
		`Instalar las dependencias, desde un PowerShell normal: npm install --prefix "${path.join(Valores.Destino, Worker)}"`,
		'Crear el repositorio de git y su remoto.',
		`Crear ${Worker}/.dev.vars con las claves del proyecto, si las necesita. Las de Core no se copian.`,
		`Crear en Cloudflare bd-${Valores.Nombre} y poner su identificador en wrangler.jsonc.`,
		`Comprobar que ningún otro worker de la cuenta de Cloudflare use el número ${Valores.NúmeroProyecto}, porque los limitadores de correos lo necesitan único.`,
		'Configurar el dominio en wrangler.jsonc cuando se vaya a publicar.',
		'Solo si se está usando Trabajo Agéntico: seguir la sección Inicio de un proyecto de su Configuración.md. Sin él, este paso no aplica.',
	];
	console.log(`\nLo que falta hacer a mano:\n${pasos.map((paso, i) => `${i + 1}. ${paso}`).join('\n')}`);

}


function Exigir(condición: boolean, mensaje: string): void { // Detiene el generador con el mensaje si la condición no se cumple.
	if (!condición) Fallar(mensaje);
}


function Fallar(mensaje: string): never { // Detiene el generador con un mensaje claro. Como todo se revisa antes de escribir, no deja nada a medias.
	console.error(`\nNo se creó el proyecto. ${mensaje}`);
	process.exit(1);
}
