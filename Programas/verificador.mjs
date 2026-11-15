import { spawnSync } from 'node:child_process'; // El Verificador: corre los tipos, el linter, las reglas y las pruebas. Siempre se corre con la palabra de su modo: npm run verificador ligero salta la revisión de los tipos de las pruebas, las pruebas pesadas de pruebas/pesadas, las de interfaz de pruebas/interfaz y las de errores ya arreglados, cuyo nombre empieza con 'Error arreglado:', y npm run verificador completo corre todo. Solo comprueba: nunca modifica el código. Está en Programas, pero npm run verificador lo abre en la carpeta del worker, y ahí corre sus herramientas.


const Modo = process.argv.slice(2).join(' '); // Las palabras que llegan después de npm run verificador, juntas, para que más de una palabra también se rechace.
if (Modo !== 'ligero' && Modo !== 'completo') { // Sin la palabra de su modo, el Verificador se detiene en vez de escoger uno por su cuenta, para que nadie corra el ligero creyendo que corrió el completo. Si llegó una palabra que no conoce, la nombra en el mensaje.
	console.error(`El Verificador necesita la palabra de su modo${Modo ? `, y no conoce '${Modo}'` : ''}. Se corre con npm run verificador ligero, o con npm run verificador completo.`);
	process.exit(1);
}
const Completo = Modo === 'completo';
const ComandoPruebasLigero = 'npx vitest run --exclude "pruebas/pesadas/**" -t "^(?!.*Error arreglado:)"'; // El Verificador ligero salta las pruebas pesadas, que tardan más de 1 segundo con la preparación que necesitan, como las que preparan una base de datos simulada, y las de errores ya arreglados, que solo atrapan un error que ya se arregló y cuyo nombre empieza con 'Error arreglado:'. El patrón de -t deja fuera los nombres que lo contienen. El completo las corre todas.
const Pasos = ['npm run typecheck'];
if (Completo) Pasos.push('npm run typecheck:pruebas'); // Los tipos de las pruebas, que vitest no revisa al correrlas, porque solo les quita los tipos. Van solo en el completo, como en los proyectos que los revisan en la integración continua y no en cada corrida local, y antes de las pruebas, para que un error de tipos no espere a que terminen.
Pasos.push('npm run lint', 'npm run reglas', Completo ? 'npx vitest run' : ComandoPruebasLigero);
if (Completo) Pasos.push('npx playwright test'); // Las pruebas de interfaz, en Chromium, Firefox y WebKit, con la app iniciada en local.

for (const paso of Pasos) {

	console.log(`\n> ${paso}`);
	const resultado = spawnSync(paso, { shell: true, stdio: 'inherit' });
	if (resultado.status !== 0) {
		console.error(`\nEl Verificador falló en: ${paso}`);
		process.exit(resultado.status ?? 1);
	}

}
