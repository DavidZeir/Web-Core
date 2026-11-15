import { expect, test } from '@playwright/test';


const RutaDePrueba = '/entrar'; // Una página que no es la portada, para comprobar que el botón devuelve a la misma página, y no siempre a la principal.

const EnlaceTemaAlternativo = '#enlace-tema-alternativo';

const EnlaceTemaPrincipal = '#enlace-tema-principal';

const RutasDeRetornoInválidas = [ // Formas de mandar al usuario a otro sitio. Las dos últimas empiezan con una sola barra, pero el navegador las interpreta como //otro-sitio.test.
	'https://otro-sitio.test/',
	'//otro-sitio.test/',
	'/\\otro-sitio.test/',
	'/\t/otro-sitio.test/',
];


test.skip(({ browserName }) => browserName !== 'chromium', 'El tema lo resuelve el servidor, así que sale igual en los tres navegadores, y probarlo en uno solo ahorra tiempo.');


test('la luna pasa al tema alternativo y vuelve a la misma página', async ({ page }) => {

	await page.goto(RutaDePrueba);
	await expect(page.locator('html')).not.toHaveAttribute('data-tema');
	await page.locator(EnlaceTemaAlternativo).click();
	await expect(page.locator('html')).toHaveAttribute('data-tema', 'alternativo');
	await expect(page).toHaveURL(new RegExp(`${RutaDePrueba}$`)); // Al final, porque el servidor le puede agregar el idioma del navegador, como en /en/entrar.
	await expect(page.locator(EnlaceTemaPrincipal)).toBeVisible();
	await expect(page.locator(EnlaceTemaAlternativo)).toBeHidden();

});


test('el tema alternativo se conserva en otra página y el sol lo devuelve al principal', async ({ page }) => {

	await page.goto(RutaDePrueba);
	await page.locator(EnlaceTemaAlternativo).click();
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-tema', 'alternativo');
	await page.locator(EnlaceTemaPrincipal).click();
	await expect(page.locator('html')).not.toHaveAttribute('data-tema');
	await expect(page.locator(EnlaceTemaAlternativo)).toBeVisible();
	await page.reload();
	await expect(page.locator('html')).not.toHaveAttribute('data-tema');

});


for (const ruta of RutasDeRetornoInválidas) {

	test(`no redirige a ${JSON.stringify(ruta)}`, async ({ request }) => {

		const respuesta = await request.get(`/cambiar-tema/alternativo?redirigir-a=${encodeURIComponent(ruta)}`, { maxRedirects: 0 });
		expect(respuesta.status(), `redirigió a ${respuesta.headers().location}`).toBe(400);

	});

}


test('responde error con un tema que no existe', async ({ request }) => {

	const respuesta = await request.get('/cambiar-tema/otro', { maxRedirects: 0 });
	expect(respuesta.status()).toBe(400);

});
