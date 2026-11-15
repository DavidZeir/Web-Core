import { execFileSync, spawnSync } from 'node:child_process'; // Alista una copia de trabajo de git (un worktree), una carpeta aparte con otra rama del mismo repositorio, para trabajar en ella sin tocar la carpeta principal y sin pasos a mano: copia los archivos que git no trae, enlaza las claves, instala las dependencias y crea la base de datos local. Sirve para avanzar en varias ramas a la vez, por ejemplo cuando varias IAs hacen cada una su parte de un cambio, como en las etapas de Trabajo Agéntico. Nunca se corre en la carpeta principal.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const Raíz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // La raíz de esta copia de trabajo, un nivel arriba de Programas, la carpeta de este archivo.
const CarpetaPrincipal = BuscarCarpetaPrincipal();
const Worker = BuscarWorker();
const ArchivosQueSeCopian = ['USE Scribe/USE Scribe.exe', 'Programas/reglas-personales.mts']; // Los que git no trae porque están ignorados, y que hacen falta en la copia de trabajo: lo que necesita la aplicación, y las reglas personales del linter, para que el Verificador de la copia de trabajo las aplique igual que el de la carpeta principal. Nunca las claves.
const ArchivosDeClaves = ['.dev.vars', `${Worker}/.dev.vars`]; // Las claves de desarrollo, en la raíz o en el worker. Se enlazan a las de la carpeta principal y nunca se copian.

for (const archivo of ArchivosQueSeCopian) Copiar(archivo);
for (const archivo of ArchivosDeClaves) Enlazar(archivo);
if (fs.existsSync(path.join(Raíz, 'package-lock.json'))) Correr('npm ci', Raíz); // La raíz casi nunca tiene dependencias propias, pero si las tiene, también se instalan.
Correr('npm ci', path.join(Raíz, Worker)); // Instala en el worker exactamente lo que dice su package-lock.json.
AlistarBaseDeDatos();
console.log('\nLa copia de trabajo quedó lista. La aplicación se inicia con npm run iniciar.');


function BuscarCarpetaPrincipal() { // La carpeta principal del repositorio, que tiene los archivos que se copian y las claves. Si esta carpeta es la principal, se detiene, porque ahí ya está todo y alistar podría dañar lo del Director.

	const carpetaGit = path.resolve(Git('rev-parse', '--absolute-git-dir')); // La carpeta de git de donde se corre. En una copia de trabajo es la suya, dentro de la carpeta de git de la principal.
	const carpetaGitCompartida = path.resolve(Raíz, Git('rev-parse', '--git-common-dir')); // La carpeta de git que comparten la carpeta principal y todas sus copias de trabajo, que es la de la principal.
	if (carpetaGit.toLowerCase() === carpetaGitCompartida.toLowerCase())
		Detener('esta es la carpeta principal, y npm run alistar es solo para las copias de trabajo. Aquí ya están las dependencias, las claves y la base de datos.');
	return path.dirname(carpetaGitCompartida);

}


function BuscarWorker() { // La carpeta del worker: la única de la raíz que termina en -worker y tiene un wrangler.jsonc. Así este archivo sirve igual en todos los proyectos, sin nombrar el suyo.

	const workers = fs.readdirSync(Raíz, { withFileTypes: true })
		.filter(e => e.isDirectory() && e.name.endsWith('-worker') && fs.existsSync(path.join(Raíz, e.name, 'wrangler.jsonc')));
	if (workers.length !== 1) Detener(`se esperaba una sola carpeta que termine en -worker y tenga un wrangler.jsonc, y hay ${workers.length}.`);
	return workers[0].name;

}


function Copiar(archivo) { // Copia un archivo de la carpeta principal que git no trae. Si la carpeta principal no lo tiene, este proyecto no lo usa, y se sigue sin él.

	const origen = path.join(CarpetaPrincipal, archivo);
	const destino = path.join(Raíz, archivo);
	if (fs.existsSync(origen)) {

		fs.mkdirSync(path.dirname(destino), { recursive: true });
		fs.copyFileSync(origen, destino);
		console.log(`Copiado: ${archivo}`);

	}

}


function Enlazar(archivo) { // Crea en esta copia de trabajo un enlace simbólico a un archivo de claves de la carpeta principal, para que las claves nunca se copien. Si la carpeta principal no lo tiene, este proyecto no lo usa.

	const original = path.join(CarpetaPrincipal, archivo);
	const enlace = path.join(Raíz, archivo);
	const actual = fs.lstatSync(enlace, { throwIfNoEntry: false }); // Lo que ya hay en el lugar del enlace, si hay algo, sin seguir el enlace.
	const yaEnlazado = actual?.isSymbolicLink() && path.resolve(path.dirname(enlace), fs.readlinkSync(enlace)).toLowerCase() === original.toLowerCase();
	if (!fs.existsSync(original)) {
		console.log(`Sin claves que enlazar en ${archivo}: la carpeta principal no tiene ese archivo.`);
	} else if (yaEnlazado) {
		console.log(`Ya estaba enlazado: ${archivo}`);
	} else if (actual) {
		Detener(`en ${archivo} hay un archivo que no es el enlace a las claves de la carpeta principal. Bórralo y vuelve a correr npm run alistar.`);
	} else {

		try {
			fs.symlinkSync(original, enlace, 'file');
		} catch (error) {
			Detener(`no se pudo crear el enlace a las claves en ${archivo} (${error.code}). En Windows, activa el modo de programador, en Configuración > Sistema > Para programadores, y vuelve a correr npm run alistar.`);
		}
		console.log(`Enlazado: ${archivo}`);

	}

}


function AlistarBaseDeDatos() { // Crea la base de datos local con sus migraciones, nunca la de producción.

	const carpetaWorker = path.join(Raíz, Worker);
	const configuración = fs.readFileSync(path.join(carpetaWorker, 'wrangler.jsonc'), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')); // Sin las líneas comentadas, porque una base comentada no se usa.
	const bases = [...configuración.join('\n').matchAll(/"database_name"\s*:\s*"([^"]+)"/g)].map(c => c[1]); // Las bases D1 del worker.
	if (bases.length === 0) {
		console.log('\nSin base de datos que alistar: el worker no tiene bases D1.');
	} else {
		for (const base of bases) Correr(`npx wrangler d1 migrations apply ${base} --local`, carpetaWorker); // Con --local, las migraciones van a la base local de esta copia de trabajo, y nunca a la de producción.
	}

}


function Correr(comando, carpeta) { // Corre un comando en una carpeta y muestra su salida. Si falla, se detiene y dice cuál fue.

	console.log(`\n> ${comando}`);
	const resultado = spawnSync(comando, { cwd: carpeta, shell: true, stdio: 'inherit' });
	if (resultado.status !== 0) Detener(`falló ${comando}, en ${carpeta}. Su salida está arriba.`);

}


function Git(...argumentos) { // Una consulta de solo lectura a git. Si esta carpeta no es un repositorio de git, se detiene.

	try {
		return execFileSync('git', argumentos, { cwd: Raíz, encoding: 'utf8' }).trim();
	} catch {
		Detener('esta carpeta no es un repositorio de git, y npm run alistar es para las copias de trabajo de git.');
	}

}


function Detener(mensaje) { // Detiene el comando con un mensaje que dice qué falló y qué hacer.
	console.error(`\nnpm run alistar se detuvo: ${mensaje}`);
	process.exit(1);
}
