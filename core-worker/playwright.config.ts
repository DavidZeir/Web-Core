import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineConfig, devices } from '@playwright/test';


const PuertoPruebasInterfaz = Number(process.env.PUERTO_PRUEBAS_INTERFAZ ??= String(BuscarPuertoLibre(CalcularPuertoDeLaCarpeta()))); // El puerto de la app que inician las pruebas de interfaz: el de la carpeta o, si está ocupado, el siguiente libre. Se elige una sola vez y se deja en la variable PUERTO_PRUEBAS_INTERFAZ, porque Playwright vuelve a leer esta configuración en cada proceso que corre pruebas, y todos tienen que usar el mismo. Si la variable ya trae un puerto, se usa ese.

const CarpetaDatosPruebasInterfaz = process.env.CARPETA_DATOS_PRUEBAS_INTERFAZ ??= PrepararDatosPruebasInterfaz(PuertoPruebasInterfaz); // La carpeta de la base local aparte de las pruebas de interfaz, relativa a la del worker. Se prepara una sola vez, en el primer proceso que lee esta configuración, y se deja en la variable CARPETA_DATOS_PRUEBAS_INTERFAZ, para que los procesos que corren las pruebas no la vuelvan a crear mientras la app la está usando.

const DirecciónApp = `http://127.0.0.1:${PuertoPruebasInterfaz}`;

export default defineConfig({ // Las pruebas de interfaz abren las páginas en navegadores de verdad, con la app iniciada en local, para comprobar lo que solo se ve en un navegador: el HTML ya armado, el CSS, HTMX y el JavaScript de src-ui. Las corre el Verificador completo, con npm run verificador completo, porque cada una tarda segundos y no milisegundos. Mientras se trabaja, se corre solo el archivo de lo que se toca, y solo en Chromium, como en npx playwright test pruebas/interfaz/archivo.interfaz.ts --project=chromium.
	testDir: './pruebas/interfaz',
	testMatch: '**/*.interfaz.ts', // Con el sufijo .interfaz.ts, y no .spec.ts ni .test.ts, para que vitest no las tome como suyas, porque sin un include en su configuración busca esos dos sufijos en todo el worker.
	fullyParallel: true,
	reporter: 'list', // Muestra el resultado en la terminal, sin abrir el informe HTML en el navegador al terminar.
	use: { baseURL: DirecciónApp, trace: 'retain-on-failure' }, // Si una prueba falla, guarda su traza en test-results, para revisarla después con npx playwright show-trace.
	projects: [ // Los tres motores de los navegadores de hoy: Chromium, el de Chrome y Edge, Firefox, y WebKit, el de Safari y el de todos los navegadores de iOS.
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] }, workers: 1, retries: 1 }, // Las pruebas de Firefox corren en un solo proceso, una tras otra. Cada proceso de Playwright lanza su propio Firefox con un perfil nuevo, y en su primer minuto ese Firefox crea unos 60 archivos y unas 20 bases SQLite, que esperan al disco. Cuánto tarda eso es inconsistente y depende del equipo, de su disco y de su antivirus. En un portátil, la primera prueba tarda unos 2,5 segundos y las demás, de 340 a 400 milisegundos. En un computador de escritorio con disco SSD, con tres Firefox a la vez el disco se satura y la primera prueba de cada uno puede tardar de 20 a 60 segundos, más que el límite de 30. Con uno solo, el perfil se crea una vez y las pruebas que siguen suelen tardar menos de 1 segundo cada una. Aun así, en los equipos lentos alguna prueba del primer minuto todavía puede pasar del límite, por eso las de Firefox se repiten una vez si fallan.
		{ name: 'webkit', use: { ...devices['Desktop Safari'] } },
	],
	webServer: { // Inicia la app en local antes de las pruebas y la cierra al terminar. Siempre con --local, para que use los recursos locales y nunca los de producción.
		command: `npx wrangler dev --local --persist-to ${CarpetaDatosPruebasInterfaz} --ip 127.0.0.1 --port ${PuertoPruebasInterfaz} --var CLAVE_IDENTIDAD_USUARIO_CLIENTE:clave-solo-para-pruebas-de-interfaz`, // Con --persist-to, la app usa la base aparte de las pruebas, y no la base local de la carpeta, que en la carpeta principal es la del Director. Con --ip 127.0.0.1, la app escucha en la misma dirección donde se comprobó que el puerto estaba libre. Con --var, las páginas protegidas abren aunque la carpeta no tenga .dev.vars, porque firmar la cookie de la sesión necesita esta clave, y aquí no protege nada: solo existe en esta app local.
		url: DirecciónApp,
		reuseExistingServer: false, // Si el puerto ya está ocupado, falla con ruido, en vez de probar contra otra app que haya quedado corriendo.
		timeout: 120_000, // La primera vez, wrangler compila los recursos y prepara su entorno local, y puede tardar más de un minuto.
	},
});


function PrepararDatosPruebasInterfaz(puerto: number): string { // Crea desde cero la base local aparte de las pruebas de interfaz, en Temporal/pruebas-interfaz de la raíz, con las migraciones y con las semillas .sql de pruebas/interfaz, para que las pruebas tengan sus propios usuarios, sesiones y datos sin tocar la base local de la carpeta. Cada puerto tiene su carpeta, para que dos corridas al mismo tiempo en la misma carpeta no se pisen.

	const carpeta = `../Temporal/pruebas-interfaz/${puerto}`;
	fs.rmSync(path.join(__dirname, carpeta), { recursive: true, force: true }); // Lo que quedó de la corrida anterior se borra, para que cada corrida empiece con la base recién creada y con las semillas tal como están en los archivos.
	const base = LeerBaseD1();
	CorrerWrangler(['d1', 'migrations', 'apply', base, '--local', '--persist-to', carpeta]);
	for (const semilla of BuscarSemillas(path.join(__dirname, 'pruebas', 'interfaz')))
		CorrerWrangler(['d1', 'execute', base, '--local', '--persist-to', carpeta, '--file', semilla, '--yes']);
	return carpeta;

}


function LeerBaseD1(): string { // El nombre de la base D1 del worker, de wrangler.jsonc, sin contar las líneas comentadas. Las semillas necesitan saber a qué base van, así que si no hay exactamente una, falla con ruido.

	const configuración = fs.readFileSync(path.join(__dirname, 'wrangler.jsonc'), 'utf8').split('\n')
		.filter(línea => !línea.trim().startsWith('//'));
	const bases = [...configuración.join('\n').matchAll(/"database_name"\s*:\s*"([^"]+)"/g)].map(coincidencia => coincidencia[1]);
	if (bases.length !== 1) throw new Error(`Las pruebas de interfaz necesitan una sola base D1 en wrangler.jsonc, y hay ${bases.length}.`);
	return bases[0];

}


function BuscarSemillas(carpeta: string): string[] { // Los archivos .sql de las pruebas de interfaz, en orden alfabético de su ruta, para que se apliquen siempre en el mismo orden.
	return fs.readdirSync(carpeta, { withFileTypes: true, recursive: true })
		.filter(entrada => entrada.isFile() && entrada.name.endsWith('.sql')).map(entrada => path.join(entrada.parentPath, entrada.name)).sort();
}


function CorrerWrangler(argumentos: string[]): void { // Corre el wrangler del worker con node, sin entrada de teclado, así que no se detiene a preguntar: aplica las migraciones sin pedir confirmación. Su salida solo se muestra si falla, dentro del error.
	execFileSync(process.execPath, [path.join(__dirname, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...argumentos],
		{ cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}


function CalcularPuertoDeLaCarpeta(): number { // Un puerto entre 8800 y 8999 que sale de la ruta de esta carpeta, para que la carpeta principal y cada copia de trabajo tengan el suyo, y dos copias de trabajo puedan correr sus pruebas de interfaz al mismo tiempo. Quedan lejos del 8787 y del 3000, que usa el Director con npm run dev.

	let suma = 0;
	for (const letra of __dirname)
		suma = (suma * 31 + letra.charCodeAt(0)) % 200;
	return 8800 + suma;

}


function BuscarPuertoLibre(desde: number): number { // El primer puerto libre desde el de la carpeta, dando la vuelta dentro del rango de 8800 a 8999. Playwright lee esta configuración de un tirón, sin esperar, y saber si un puerto está libre toma un momento, así que la búsqueda corre en otro proceso de Node, que intenta abrir cada puerto en 127.0.0.1 y escribe el primero que logra abrir. Si no hay ninguno libre, falla con ruido.

	const búsqueda = `
		const Red = require('node:net');
		const Desde = Number(process.argv.at(-1));
		function Probar(intento) {

			if (intento === 200) {
				console.error('No hay ningún puerto libre entre 8800 y 8999 para las pruebas de interfaz.');
				process.exit(1);
			}
			const puerto = 8800 + (Desde - 8800 + intento) % 200; // Después del 8999 sigue el 8800.
			const servidor = Red.createServer();
			servidor.once('error', () => Probar(intento + 1)); // Si el puerto está ocupado, abrirlo da error, y se prueba el siguiente.
			servidor.listen(puerto, '127.0.0.1', () => servidor.close(() => console.log(puerto))); // Si se pudo abrir, está libre: se cierra para que lo use la app, y se escribe.

		}
		Probar(0);
	`;
	return Number(execFileSync(process.execPath, ['-e', búsqueda, String(desde)], { encoding: 'utf8' }).trim());

}
