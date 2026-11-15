import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, test, type Page } from '@playwright/test';


const AnchoTeléfono = 375; // El ancho en píxeles de un teléfono pequeño, como el iPhone SE.

const PáginasPúblicas = ListarPáginasPúblicas(); // Las páginas públicas del núcleo, la portada y la de entrar, en cada idioma del sitio. Cada proyecto agrega las suyas en su propio archivo de pruebas.


for (const ruta of PáginasPúblicas) {

	test(`${ruta} carga sin errores de JavaScript ni marcas sin reemplazar`, async ({ page }) => {

		const errores = RegistrarErrores(page);
		const respuesta = await page.goto(ruta); // Espera el evento load, que llega después de los scripts con defer, como HTMX y global.js, así que sus errores ya alcanzaron a aparecer.
		expect(respuesta?.status(), 'la página debería responder 200').toBe(200);
		expect(await page.locator('body').innerText(), 'el texto visible no debería tener marcas sin reemplazar').not.toMatch(/\[\[|\]\]|\{\{|\}\}/); // Una marca de variable o de texto que llega al navegador es un reemplazo que falló en el servidor, como una clave que falta en un idioma.
		expect(errores, 'la consola no debería tener errores').toEqual([]);

	});


	test(`${ruta} no se desborda en un teléfono`, async ({ page }) => {

		await page.setViewportSize({ width: AnchoTeléfono, height: 812 });
		await page.goto(ruta);
		const anchoPágina = await page.evaluate(() => document.documentElement.scrollWidth); // El ancho de todo el contenido. Si pasa del ancho de la pantalla, el usuario tiene que desplazarse de lado.
		expect(anchoPágina, `la página no debería pasar de ${AnchoTeléfono} px de ancho`).toBeLessThanOrEqual(AnchoTeléfono);

	});

}


function ListarPáginasPúblicas(): string[] { // Arma las rutas de la portada y de entrar en cada idioma de IdiomasSoportados: el predeterminado va sin prefijo, y los demás con el suyo, como /en/entrar. Así el mismo archivo sirve en todos los proyectos que salen de Web Core, aunque tengan otros idiomas.

	const configuración = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'configuracion.ts'), 'utf8'); // Se lee como texto, igual que en reglas-plantilla.mts, porque cargar el archivo arrastraría el resto del proyecto, que solo corre en el Worker.
	const predeterminado = /const IdiomaPredeterminado\b[^=]*=\s*['"]([^'"]+)['"]/.exec(configuración)?.[1];
	const soportados = /const IdiomasSoportados\b[^=]*=\s*\[([^\]]*)\]/.exec(configuración)?.[1];
	if (predeterminado === undefined || soportados === undefined)
		throw new Error('No se encontraron IdiomaPredeterminado e IdiomasSoportados en src/configuracion.ts.');
	return [...soportados.matchAll(/['"]([^'"]+)['"]/g)].map(coincidencia => coincidencia[1])
		.flatMap(idioma => idioma === predeterminado ? ['/', '/entrar'] : [`/${idioma}`, `/${idioma}/entrar`]);

}


function RegistrarErrores(página: Page): string[] { // Junta los errores de JavaScript de la página y los mensajes de error de la consola, como un script que no carga o una política de seguridad que lo bloquea.

	const errores: string[] = [];
	página.on('pageerror', error => errores.push(error.message));
	página.on('console', mensaje => { if (mensaje.type() === 'error') errores.push(mensaje.text()); });
	return errores;

}
