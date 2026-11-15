import { spawn, spawnSync } from 'node:child_process'; // Inicia la aplicación en un puerto libre, sin chocar con otra que ya esté corriendo, como la de la carpeta principal o la de una copia de trabajo, deja su salida en Temporal/aplicacion.log y dice su proceso, para cerrar solo esa. Le sirve a una IA que necesita abrir la aplicación para probar lo que hizo sin cerrar la que ya está abierta, en la carpeta principal o en una copia de trabajo, como en Trabajo Agéntico.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const Raíz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // La raíz de esta carpeta, un nivel arriba de Programas, la carpeta de este archivo.
const Worker = BuscarWorker();
const Wrangler = path.join(Raíz, Worker, 'node_modules', 'wrangler', 'bin', 'wrangler.js'); // Se llama a node con el wrangler del worker, y no a npx por la consola, porque en Windows un proceso separado que pasa por la consola pierde su salida.
if (!fs.existsSync(Wrangler)) Detener(`falta wrangler en ${Worker}/node_modules. En una copia de trabajo, corre primero npm run alistar, y en la carpeta principal, npm ci en ${Worker}.`);
const Puerto = await BuscarPuertoLibre(CalcularPuertoDeLaCarpeta());
const Dirección = `http://127.0.0.1:${Puerto}`;
const SalidaVisible = 'Temporal/aplicacion.log'; // Lo que escribe la aplicación, para leerlo cuando algo falle, en vez de adivinar.
const Salida = path.join(Raíz, SalidaVisible);
fs.mkdirSync(path.dirname(Salida), { recursive: true });
const ArchivoDeSalida = fs.openSync(Salida, 'w');
const Aplicación = spawn(process.execPath, [Wrangler, 'dev', '--local', '--ip', '127.0.0.1', '--port', String(Puerto), '--show-interactive-dev-session=false'], // Con --local, wrangler apaga los enlaces remotos, así que usa la base y los archivos locales, y nunca los de producción.
	{ cwd: path.join(Raíz, Worker), detached: true, stdio: ['ignore', ArchivoDeSalida, ArchivoDeSalida], windowsHide: true });
Aplicación.unref(); // La aplicación sigue corriendo cuando este comando termina.
fs.closeSync(ArchivoDeSalida);
if (await EsperarQueResponda()) {

	console.log(`La aplicación está lista en ${Dirección}`);
	console.log(`Su salida va a ${SalidaVisible}.`);
	console.log(`Su proceso es el ${Aplicación.pid}. Para cerrar solo esta: ${ComandoParaCerrar()}`);

} else {

	console.error(`La aplicación no respondió en ${Dirección}. Lo último que escribió, en ${SalidaVisible}:\n`);
	console.error(fs.readFileSync(Salida, 'utf8').split('\n').slice(-30).join('\n'));
	spawnSync(ComandoParaCerrar(), { shell: true, stdio: 'ignore' }); // Cierra lo que haya quedado abierto, para no dejar una copia a medias ocupando el puerto.
	process.exit(1);

}


function BuscarWorker() { // La carpeta del worker: la única de la raíz que termina en -worker y tiene un wrangler.jsonc. Así este archivo sirve igual en todos los proyectos, sin nombrar el suyo.

	const workers = fs.readdirSync(Raíz, { withFileTypes: true })
		.filter(e => e.isDirectory() && e.name.endsWith('-worker') && fs.existsSync(path.join(Raíz, e.name, 'wrangler.jsonc')));
	if (workers.length !== 1) Detener(`se esperaba una sola carpeta que termine en -worker y tenga un wrangler.jsonc, y hay ${workers.length}.`);
	return workers[0].name;

}


function CalcularPuertoDeLaCarpeta() { // Un puerto entre 8500 y 8699 que sale de la ruta de esta carpeta, para que la carpeta principal y cada copia de trabajo tengan el suyo. No choca con el 8787 ni con el 3000, que usa el Director con npm run dev, ni con los de 8800 a 8999, que usan las pruebas de interfaz.

	let suma = 0;
	for (const letra of Raíz)
		suma = (suma * 31 + letra.charCodeAt(0)) % 200;
	return 8500 + suma;

}


async function BuscarPuertoLibre(desde) { // El primer puerto libre desde el de la carpeta, dando la vuelta dentro del rango de 8500 a 8699. Si el de la carpeta está ocupado, por ejemplo por otra copia de la aplicación, toma el siguiente.

	let puerto = null;
	for (let intento = 0; puerto === null && intento < 200; intento++) {
		const candidato = 8500 + (desde - 8500 + intento) % 200; // Después del 8699 sigue el 8500.
		if (await EstáLibre(candidato)) puerto = candidato;
	}
	if (puerto === null) Detener('no hay ningún puerto libre entre 8500 y 8699 para la aplicación.');
	return puerto;

}


function EstáLibre(puerto) { // Si el puerto se puede abrir, está libre: se cierra enseguida para que lo use la aplicación.

	return new Promise(resolver => {

		const servidor = net.createServer();
		servidor.once('error', () => resolver(false)); // Si el puerto está ocupado, abrirlo da error.
		servidor.listen(puerto, '127.0.0.1', () => servidor.close(() => resolver(true)));

	});

}


async function EsperarQueResponda() { // Espera hasta 2 minutos a que la aplicación responda, porque wrangler primero arma el CSS y el JavaScript. Si la aplicación termina antes, no espera más.

	const límite = Date.now() + 120_000;
	let respondió = false;
	while (!respondió && Aplicación.exitCode === null && Date.now() < límite) {

		await new Promise(resolver => setTimeout(resolver, 500));
		respondió = await fetch(Dirección, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false); // Cualquier respuesta, aunque sea un error de la aplicación, dice que ya está escuchando.

	}
	return respondió;

}


function ComandoParaCerrar() { // El comando que cierra la aplicación y lo que ella inició, sin tocar otras copias que se llamen igual.
	return process.platform === 'win32' ? `taskkill /PID ${Aplicación.pid} /T /F` : `kill -- -${Aplicación.pid}`;
}


function Detener(mensaje) { // Detiene el comando con un mensaje que dice qué falló y qué hacer.
	console.error(`\nnpm run iniciar se detuvo: ${mensaje}`);
	process.exit(1);
}
