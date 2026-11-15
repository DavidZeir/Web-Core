import type { Contexto } from './global';


export interface EventoUsuarioCreado { // Esta estructura guarda los datos mínimos de la creación de un usuario.
	IdUsuario: string; 
	Correo: string;
	Proveedor: 'Enlace' | 'Google';
	IdEnProveedor: string | null;
	Rol: string;
	FechaHoraCreado: string;
}

export type ManejadorUsuarioCreado = (contexto: Contexto, evento: EventoUsuarioCreado) => Promise<void>; // Esta firma representa la función que un proyecto registra para reaccionar cuando el núcleo avisa que nació un usuario nuevo.

let ManejadorUsuarioCreado: ManejadorUsuarioCreado | null = null; // Variable donde se guarda la única función activa que responderá a ese aviso.

export function RegistrarManejadorUsuarioCreado(manejador: ManejadorUsuarioCreado): void { // Esta función permite que el proyecto conecte su propia reacción sin meterla dentro del núcleo.
	ManejadorUsuarioCreado = manejador; // Se reemplaza la reacción anterior por la nueva, porque este aviso solo necesita una respuesta principal.
}


export async function NotificarUsuarioCreado(contexto: Contexto, evento: EventoUsuarioCreado): Promise<void> { // Esta función se llama cuando el núcleo ya terminó de crear el usuario y quiere avisarle al proyecto.
	await ManejadorUsuarioCreado?.(contexto, evento); // Si el proyecto registró una reacción, se ejecuta. Si no, el núcleo sigue su camino sin hacer nada adicional.
}
