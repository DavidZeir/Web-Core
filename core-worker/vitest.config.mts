import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DirectorioActual = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [cloudflareTest(async () => {
		const migraciones = await readD1Migrations(path.join(DirectorioActual, 'migrations'));
		return {
			wrangler: { configPath: './wrangler.jsonc' },
			remoteBindings: false, // Las pruebas corren solo con recursos locales, sin abrir la conexión a la base de datos de producción ni a la IA de Cloudflare, que el wrangler.jsonc marca como remotas.
			miniflare: { bindings: { MIGRACIONES_PRUEBAS: migraciones } }, // Las pruebas de autenticación aplican las migraciones reales a su D1 local.
		};
	}), {
		name: 'html-como-texto', // Le dice a Vite que un .html importado desde el código es un módulo con su texto, igual que la regla Text de wrangler. Sin esto, npx vitest related falla con cualquier archivo apenas una prueba llega a un módulo que importa .html, como respuestas.ts o autenticacion.ts, porque Vite recorre en el proceso principal las importaciones de todas las pruebas y trata de leer esos .html como JavaScript. En npx vitest run no se usa, porque aquí el pool lee el wrangler.jsonc, intercepta los .html antes de que Vite los transforme y se los entrega a workerd como Text. Si un proyecto configura el pool sin el wrangler.jsonc, el pool ya no los intercepta, y este plugin también los carga en npx vitest run, con el mismo texto, así que sus pruebas tampoco necesitan reemplazar los .html con vi.mock.
		transform(código, ruta) {
			return ruta.endsWith('.html') ? { code: `export default ${JSON.stringify(código)};`, map: null } : null; // JSON.stringify escapa las comillas, los saltos de línea y las barras del HTML, para que el texto llegue igual que en el archivo. Las rutas con consulta, como un .html?raw, no terminan en .html y siguen con el manejo normal de Vite.
		},
	}],
});
