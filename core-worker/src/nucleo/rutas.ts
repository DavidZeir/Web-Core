import { ConAutenticación } from './autenticacion'; // El núcleo provee la herramienta ConAutenticación y este archivo (el registro de rutas) define la política. No rompe compilación porque ESM tolera ciclos cuando no hay evaluación cruzada en nivel superior: ConAutenticación es una función ligada en fase de instanciación (no se ejecuta al cargar), y global.ts solo importa valores primitivos ya resueltos desde este archivo. Deuda técnica: existen ciclos ESM entre configuracion.ts y partes del núcleo (global.ts, autenticacion.ts, idiomas.ts, metadatos.ts). Hoy son seguros porque todos los imports cruzados son funciones o primitivos resueltos antes de ejecutarse, nunca lecturas top-level de variables no inicializadas. Si en algún momento aparece un error 'Cannot access X before initialization', la solución es mover constantes puras a nucleo/constantes.ts y tipos a nucleo/tipos.ts para que el núcleo no necesite importar configuracion.ts directamente.
import { Manejador, ModoAutenticación } from './global';
import { Salud } from './rutas/salud';
import { Entrar } from './rutas/entrar';
import { Salir } from './rutas/salir';
import { SolicitarEnlaceMágico, VerificarEnlaceMágico, EntrarConEnlaceMágico } from './rutas/entrar-con-correo';
import { EntrarConGoogle, EntrandoConGoogle } from './rutas/entrar-con-google';
import { Principal } from './rutas/principal'; // Página pública inicial sin autenticación.
import { Inicio } from './rutas/inicio'; // Página principal autenticada a la que se redirige después de entrar.
import { Sitemap } from './rutas/sitemap';


export const ManejadoresNúcleo: Record<string, Manejador> = {
	'/': Principal,
	'/sitemap.xml': Sitemap,
	'/salud': Salud,
	'/entrar': Entrar,
	'/salir': Salir,
	'/entrar-con-correo': SolicitarEnlaceMágico,
	'/entrar-con-correo/verificar': VerificarEnlaceMágico,
	'/entrar-con-correo/entrar': EntrarConEnlaceMágico,
	'/entrar-con-google': EntrarConGoogle,
	'/entrar-con-google/entrando': EntrandoConGoogle,
	'/inicio': c => ConAutenticación(c, ModoAutenticación.Cliente, Inicio),
};


export const RutasExcluidasDeSitemapNúcleo: string[] = [ // Añadir aquí rutas que no deben aparecer en el sitemap.xml, como páginas de prueba, internas que requieren autenticación, de HTMX o cualquier ruta que no sea relevante para SEO. Esto es importante para evitar que motores de búsqueda indexen páginas que no aportan valor y mantenerlos enfocados en las páginas principales del sitio.
	'/sitemap.xml', '/salud', '/entrar', '/salir', '/entrar-con-correo', '/entrar-con-correo/verificar', '/entrar-con-correo/entrar',
	'/entrar-con-google', '/entrar-con-google/entrando', '/inicio'
];
