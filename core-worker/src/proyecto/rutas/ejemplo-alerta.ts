import { EnviarAlertaErrorCrítico } from '../../nucleo/alertas';
import { type Contexto } from '../../nucleo/global';
import { EstadoError, Responder, ResponderErrorConMarco, TipoError, TipoRespuesta } from '../../nucleo/respuestas';


export async function EjemploAlerta(contexto: Contexto): Promise<Response> {

	if (contexto.Autenticación?.Usuario?.Rol !== 'Administrador')
		return ResponderErrorConMarco(contexto, 'Ingresa con la cuenta del administrador para probar la alerta.',
			TipoError.Autenticación, false, null, EstadoError.NoAutorizado);

	EnviarAlertaErrorCrítico(contexto, 'Alerta manual desde ruta de ejemplo',
		'Se solicitó una alerta al administrador desde la ruta de ejemplo.', `Detalles de la alerta`);
	return Responder(contexto, "Alerta enviada.", TipoRespuesta.Texto);

}
