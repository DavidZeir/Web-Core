import { NombreSitio } from '../configuracion';
import type { Contexto, Entorno, MensajeAlerta } from './global';


const MilisegundosVentanaDeduplicacionAlertas = 4 * 60 * 60 * 1000;

const MilisegundosBackoffErrorEnvioAlerta = 5 * 60 * 1000;

const MaximasAlertasDeduplicadasEnMemoria = 300;

const AlertasDeduplicadasEnMemoria = new Map<string, number>(); // Deduplicación mejor esfuerzo: este Map vive solo dentro de la isolate actual de Cloudflare Workers. Si hay varias isolates o regiones activas, una misma alerta podría enviarse más de una vez.


function GenerarClaveDeduplicacionAlerta(alerta: MensajeAlerta): string {
	const mensajeNormalizado = alerta.Mensaje.trim().replace(/\s+/g, ' ');
	return `${alerta.Origen}|${alerta.Servicio}|${alerta.TipoEvento}|${mensajeNormalizado}`;
}


function PurgarAlertasDeduplicadasExpiradas(ahora: number): void {

	for (const [clave, expiracion] of AlertasDeduplicadasEnMemoria) {
		if (expiracion <= ahora) AlertasDeduplicadasEnMemoria.delete(clave);
	}

}


function RecortarAlertasDeduplicadasSiHaceFalta(): void {

	if (AlertasDeduplicadasEnMemoria.size > MaximasAlertasDeduplicadasEnMemoria) { // No es un LRU real: Map.set sobre una clave existente no la mueve al final. La cota de 300 solo limita memoria. La vigencia la define la expiración de la alerta, no la última vez que se repitió.
		const primeraClave = AlertasDeduplicadasEnMemoria.keys().next().value;
		if (primeraClave !== undefined) AlertasDeduplicadasEnMemoria.delete(primeraClave);
	}

}


function RegistrarAlertaSiNoEsDuplicada(clave: string): boolean {

	const ahora = Date.now();
	PurgarAlertasDeduplicadasExpiradas(ahora);

	const expiracionExistente = AlertasDeduplicadasEnMemoria.get(clave);
	if (expiracionExistente !== undefined && expiracionExistente > ahora) return false;

	AlertasDeduplicadasEnMemoria.set(clave, ahora + MilisegundosVentanaDeduplicacionAlertas);
	RecortarAlertasDeduplicadasSiHaceFalta();
	return true;

}


function RegistrarEsperaPorErrorEnvioAlerta(clave: string): void {
	AlertasDeduplicadasEnMemoria.set(clave, Date.now() + MilisegundosBackoffErrorEnvioAlerta);
	RecortarAlertasDeduplicadasSiHaceFalta();
}


function FormatearAlertaComoTexto(alerta: MensajeAlerta): string {

	let texto = `--- Alerta de ${alerta.Servicio} ---\n\n`;
	texto += `Origen: ${alerta.Origen}\n`;
	texto += `Tipo de evento: ${alerta.TipoEvento}\n`;
	texto += `Mensaje: ${alerta.Mensaje}\n`;
	if (alerta.Detalles) texto += `Detalles: ${alerta.Detalles}\n`;
	if (alerta.IdSolicitud) texto += `Id solicitud: ${alerta.IdSolicitud}\n`;
	texto += `Fecha y hora: ${alerta.FechaHora}\n`;
	return texto;

}


async function EnviarAlertaInternaPorCorreo(contexto: Contexto, alerta: MensajeAlerta): Promise<void> {

	const claveDeduplicacion = GenerarClaveDeduplicacionAlerta(alerta);

	if (!RegistrarAlertaSiNoEsDuplicada(claveDeduplicacion)) {
		console.warn('Alerta crítica omitida por duplicada en memoria.', { TipoEvento: alerta.TipoEvento, Mensaje: alerta.Mensaje });
		return;
	}

	try {

		const { EnviarCorreoAlAdministrador: enviarCorreoAlAdministrador } = await import('./correos'); // Import dinámico intencional para evitar el ciclo estático alertas.ts -> correos.ts -> alertas.ts.
		const asunto = `Alerta ${alerta.Servicio}: ${alerta.TipoEvento}`;
		const enviada = await enviarCorreoAlAdministrador(contexto, asunto, FormatearAlertaComoTexto(alerta));

		if (!enviada) {
			RegistrarEsperaPorErrorEnvioAlerta(claveDeduplicacion);
			console.error('No se pudo enviar el correo interno de la alerta crítica.', { tipoEvento: alerta.TipoEvento });
		}

	} catch (error: unknown) {
		RegistrarEsperaPorErrorEnvioAlerta(claveDeduplicacion);
		throw error;
	}

}


export function EnviarAlertaErrorCrítico(contexto: Contexto, tipoEvento: string, mensaje: string, detalles?: string): void {

	console.error('Error crítico', { tipoEvento, mensaje, detalles, idSolicitud: contexto.IdSolicitud });
	const alerta: MensajeAlerta = { Origen: 'aplicacion', Servicio: NombreSitio, TipoEvento: tipoEvento, Mensaje: mensaje,
		Detalles: detalles, FechaHora: new Date().toISOString(), IdSolicitud: contexto.IdSolicitud };
	const colaAlertasSupervisor = contexto.Entorno.COLA_ALERTAS_SUPERVISOR;

	if (colaAlertasSupervisor) { // Cuando existe supervisor, este Worker no deduplica aquí: la deduplicación queda a cargo del supervisor/consumidor de cola. La deduplicación en memoria de 4 horas aplica solo al envío interno por correo.

		contexto.Ejecución.waitUntil(colaAlertasSupervisor.send(alerta).catch((e: unknown) => {
			console.error('Error enviando la alerta al supervisor por la cola.', { TipoEvento: tipoEvento, Mensaje: mensaje,
				Error: String(e) });
		}));

	} else {

		contexto.Ejecución.waitUntil(EnviarAlertaInternaPorCorreo(contexto, alerta).catch((e: unknown) => {
			console.error('Error enviando el correo interno de la alerta crítica.',
				{ TipoEvento: tipoEvento, Mensaje: mensaje, Error: String(e) });
		}));

	}

}


export async function EnviarAlertaErrorCríticoSinContexto(entorno: Entorno, idSolicitud: string, tipoEvento: string, mensaje: string,
	detalles?: string): Promise<void> {

	console.error("Error crítico", { tipoEvento, mensaje, detalles, idSolicitud });

	const alerta: MensajeAlerta = { Origen: "aplicacion", Servicio: NombreSitio, TipoEvento: tipoEvento, Mensaje: mensaje,
		Detalles: detalles, FechaHora: new Date().toISOString(), IdSolicitud: idSolicitud };

	const cola = entorno.COLA_ALERTAS_SUPERVISOR;
	if (!cola)
		throw new Error(`COLA_ALERTAS_SUPERVISOR no está configurada. Servicio: ${NombreSitio}. ` +
			`No se puede enviar la alerta critica '${tipoEvento}' con mensaje '${mensaje}'. Usa EnviarAlertaErrorCrítico() si es posible.`); // Por el momento no se ha configurado el uso de enviar alerta interna por correo en esta función, pero técnicamente es posible.
	await cola.send(alerta);

}


export function EnviarAlertaErrorCríticoEnSegundoPlano(entorno: Entorno, ejecución: ExecutionContext, tipoEvento: string,
	mensaje: string, detalles?: string, idSolicitud: string = crypto.randomUUID()): void {

	ejecución.waitUntil(EnviarAlertaErrorCríticoSinContexto(entorno, idSolicitud, tipoEvento, mensaje, detalles)
		.catch((error: unknown) => {
			console.error('No se pudo enviar la alerta crítica.', { idSolicitud, tipoEvento, error: String(error) });
		}));

}
