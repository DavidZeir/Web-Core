import fs from 'node:fs'; // Comprueba, antes de iniciar el servidor de desarrollo, que exista el archivo de claves de desarrollo del worker, .dev.vars, sin abrirlo ni leer su contenido. Sin él, la web inicia igual, pero fallan las funciones que usan claves, con errores que no dicen qué falta.
import path from 'node:path';


const RutaClaves = path.join(process.cwd(), '.dev.vars'); // Se corre con npm run dev, desde la carpeta del worker, que es donde wrangler busca las claves de desarrollo.
const Encontrado = fs.lstatSync(RutaClaves, { throwIfNoEntry: false }); // Lo que hay en esa ruta, sin seguir el enlace, para distinguir un archivo que falta de un enlace roto.

if (Encontrado === undefined) {
	Detener(`Falta el archivo de claves de desarrollo: ${RutaClaves}`);
} else if (Encontrado.isSymbolicLink() && !fs.existsSync(RutaClaves)) { // existsSync sigue el enlace, así que da falso cuando apunta a un archivo que ya no existe. Solo se lee a dónde apunta, nunca el contenido.
	Detener(`El archivo de claves de desarrollo, ${RutaClaves}, es un enlace que apunta a ${fs.readlinkSync(RutaClaves)}, y ese archivo no existe.`);
}


function Detener(problema) { // Detiene npm run dev con un mensaje que dice qué falta, qué pasa sin él y cómo arreglarlo, porque sin las claves la web inicia y el problema solo se nota después, en errores que no lo nombran.

	console.error([
		'',
		problema,
		'',
		'Sin las claves de desarrollo, la web inicia, pero fallan las funciones que las usan, como entrar con Google, las consultas a las IAs y el envío de correos, con errores que no dicen qué falta.',
		'',
		'Para arreglarlo:',
		'- Si tus claves ya están en otra carpeta, fuera del repositorio, enlázalas en vez de copiarlas, para que nunca queden dentro del proyecto. En Windows, con el modo de programador activo, sin administrador:',
		`  cmd /c mklink "${RutaClaves}" "<la ruta de tu archivo de claves>"`,
		`  Si ya hay un enlace roto, bórralo antes con cmd /c del "${RutaClaves}", que borra solo el enlace y no tus claves.`,
		'- Si todavía no tienes el archivo, créalo ahí, con una clave por línea, como NOMBRE=valor. Las claves que usa el proyecto son las de la interfaz Entorno, en src/nucleo/global.ts.',
		'',
	].join('\n'));
	process.exit(1);

}
