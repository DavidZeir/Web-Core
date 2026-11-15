import * as fs from 'node:fs';
import * as path from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';


interface DatosDeContraste { // Lo que axe-core deja de cada texto que midió. Su tipo viene sin definir, así que aquí se dice lo que se usa.
	contrastRatio: number;
	fgColor: string;
	bgColor: string;
	expectedContrastRatio: string; // El mínimo que pide WCAG para ese texto: 3:1 si axe-core lo considera grande, y 4.5:1 si no. Grande es desde 24 píxeles, o desde unos 18,7 en negrita, que axe-core solo cuenta desde el peso 700.
}


const ContrasteMínimoTextoNormal = 2.5; // Por debajo, un texto normal o pequeño ya cuesta leerlo. WCAG pide 4,5 a 1, pero esta prueba no revisa la accesibilidad de la marca: solo evita que salga un texto ilegible sin que nadie se entere. Cada proyecto puede cambiarlo para ser más o menos estricto.

const ContrasteMínimoTextoGrande = 2; // Lo mismo para el texto grande, que se lee con menos contraste. WCAG pide 3 a 1.

const Temas = ['principal', 'alternativo']; // Los mismos colores se pueden leer en un tema y no en el otro, como el primario sobre un fondo oscuro.

const RutasQueNoSonPáginas = new Set([ // Las rutas que no muestran una página o que hacen algo al abrirlas. Si un proyecto agrega una ruta así, va aquí, y la prueba se lo avisa fallando, para que ninguna página nueva se quede sin medir.
	'/sitemap.xml',
	'/salud',
	'/salir', // Cerraría la sesión de prueba, y fallarían las demás pruebas que la usan.
	'/entrar-con-correo',
	'/entrar-con-correo/verificar',
	'/entrar-con-correo/entrar',
	'/entrar-con-google', // Lleva a la página de Google.
	'/entrar-con-google/entrando',
	'/ejemplo-alerta', // Dispara una alerta de prueba y responde solo un texto.
]);

const TokenSesión = LeerTokenSesión();


test.use({ locale: LeerIdiomaPredeterminado() }); // Con el idioma predeterminado, las páginas no redirigen a una ruta con prefijo de idioma, y se puede comprobar que la ruta final es la pedida.


test.skip(({ browserName }) => browserName !== 'chromium', 'El contraste sale igual en los tres navegadores, y medirlo en uno solo ahorra tiempo.');


for (const ruta of ListarPáginas()) {

	for (const tema of Temas) {

		test(`${ruta} se puede leer en el tema ${tema}`, async ({ page, context, baseURL }) => {

			if (tema === 'alternativo') await context.addCookies([{ name: 'tema', value: 'alternativo', url: baseURL }]);
			let respuesta = await page.goto(ruta);
			const pidióEntrar = respuesta?.status() !== 200 || new URL(page.url()).pathname !== ruta; // Primero se abre sin sesión, para medir las páginas públicas como las ve quien no ha entrado.
			if (pidióEntrar) {

				await context.addCookies([{ name: 'sesion-token-opaco', value: TokenSesión, url: baseURL }]);
				respuesta = await page.goto(ruta);

			}
			const avisoDeRuta = 'Si no es una página, agrégala a RutasQueNoSonPáginas.';
			expect(respuesta?.status(), `${ruta} debería responder 200. ${avisoDeRuta}`).toBe(200);
			expect(new URL(page.url()).pathname, `${ruta} terminó en otra página. ${avisoDeRuta}`).toBe(ruta); // Si no, se mediría otra página sin avisar.
			expect(respuesta?.headers()['content-type'], `${ruta} debería responder HTML. ${avisoDeRuta}`).toContain('text/html');
			if (tema === 'alternativo') await expect(page.locator('html')).toHaveAttribute('data-tema', 'alternativo'); // Si el servidor no lo aplicara, se mediría dos veces el tema principal y la prueba pasaría sin avisar.
			const resultado = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
			const ilegibles = [...resultado.violations, ...resultado.incomplete].flatMap(grupo => grupo.nodes).map(nodo => { // axe-core deja en incomplete lo que no pudo medir, con contraste 0, pero también el texto del mismo color de su fondo, con 1 a 1, que es el más ilegible de todos.

				const datos = nodo.any[0].data as DatosDeContraste;
				const mínimo = datos.expectedContrastRatio === '3:1' ? ContrasteMínimoTextoGrande : ContrasteMínimoTextoNormal;
				return { Contraste: datos.contrastRatio, Mínimo: mínimo, Texto: datos.fgColor, Fondo: datos.bgColor, Elemento: nodo.target.join(' ') };

			}).filter(medición => medición.Contraste > 0 && medición.Contraste < medición.Mínimo);
			expect(ilegibles, `${ruta} no debería tener textos por debajo de su contraste mínimo`).toEqual([]);

		});

	}

}


function ListarPáginas(): string[] { // Las rutas del núcleo y las del proyecto, para que una página nueva quede medida sin tener que acordarse de agregarla. Se leen como texto, igual que en paginas-publicas.interfaz.ts, porque cargar esos archivos arrastraría el resto del proyecto, que solo corre en el Worker.

	const raíz = path.join(__dirname, '..', '..', 'src');
	const textos = [path.join(raíz, 'rutas.ts'), path.join(raíz, 'nucleo', 'rutas.ts')].map(archivo => fs.readFileSync(archivo, 'utf8'));
	const rutasEscritas = textos.flatMap(texto => [...texto.matchAll(/^\s*'(\/[^']*)'\s*:/gm)].map(coincidencia => coincidencia[1]));
	const nombresDeRutas = textos.flatMap(texto => [...texto.matchAll(/^\s*\[([\p{L}\p{N}_]+)\]\s*:/gmu)].map(coincidencia => coincidencia[1])); // Las claves con nombre, como [RutaDescargarMovimientos], que guardan su ruta en una constante.
	const código = fs.readdirSync(raíz, { recursive: true, encoding: 'utf8' }).filter(archivo => archivo.endsWith('.ts'))
		.map(archivo => fs.readFileSync(path.join(raíz, archivo), 'utf8')).join('\n'); // Todo el código, porque la constante de una ruta puede estar en cualquier archivo.
	const rutasConNombre = nombresDeRutas.map(nombre => {

		const ruta = new RegExp(`\\bconst ${nombre}(?![\\p{L}\\p{N}_])[^=]*=\\s*'(/[^']*)'`, 'u').exec(código)?.[1];
		if (ruta === undefined) throw new Error(`No se encontró la ruta de la constante ${nombre}, que es una clave de las rutas.`);
		return ruta;

	});
	const rutas = [...rutasEscritas, ...rutasConNombre];
	if (rutas.length === 0) throw new Error('No se encontraron rutas en src/rutas.ts ni en src/nucleo/rutas.ts.');
	return [...new Set(rutas)].filter(ruta => !RutasQueNoSonPáginas.has(ruta));

}


function LeerIdiomaPredeterminado(): string { // Se lee como texto, por la misma razón que las rutas.

	const configuración = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'configuracion.ts'), 'utf8');
	const idioma = /const IdiomaPredeterminado\b[^=]*=\s*['"]([^'"]+)['"]/.exec(configuración)?.[1];
	if (idioma === undefined) throw new Error('No se encontró IdiomaPredeterminado en src/configuracion.ts.');
	return idioma;

}


function LeerTokenSesión(): string { // El token de la sesión del administrador de prueba, de su semilla, para no repetirlo aquí. Es administrador porque ese rol abre todas las páginas, también las que solo él puede ver.

	const semilla = fs.readFileSync(path.join(__dirname, 'administrador-con-sesion.sql'), 'utf8');
	const token = /sesion-token-opaco=([0-9a-f]+)/.exec(semilla)?.[1];
	if (token === undefined) throw new Error('No se encontró el token de la sesión en administrador-con-sesion.sql.');
	return token;

}
