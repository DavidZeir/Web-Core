import { ConectoresIA, ModelosIAEspecíficos, ProveedoresBúsquedaWeb } from '../../configuracion';
import HtmlEjemploIACompilado from '../../../static/html/ejemplo-ia.html';
import { type Contexto } from '../../nucleo/global';
import { ConsultarIA, ConsultaIAProtegida, ObtenerConectorDesdeModeloOConector } from '../../nucleo/ia';
import { CargarHtmlLocal, ResponderErrorConMarco, ResponderHtmlConNonce, TipoError, EstadoError } from '../../nucleo/respuestas';


export async function EjemploIA(contexto: Contexto): Promise<Response> {

	if (contexto.Autenticación?.Usuario?.Rol !== 'Administrador')
		return ResponderErrorConMarco(contexto, 'Ingresa con la cuenta del administrador para probar las consultas a IA.',
			TipoError.Autenticación, false, null, EstadoError.NoAutorizado); // Solo el administrador puede acceder, tanto en local como en producción.

	if (contexto.Solicitud.method === 'POST') { // Para llamadas POST: el cliente envía JSON con { mode, userMessage, connector, maximumTokens, ... }, y el Worker invoca el orquestador con validación robusta.

		const protegido = new URL(contexto.Solicitud.url).searchParams.get('protegido') === 'true';
		if (protegido) return ConsultaIAProtegida(contexto, contexto.Solicitud.signal); // Modo protegido: aplica moderación de contenido con Llama Guard antes de ejecutar la consulta.
		return ConsultarIA(contexto, contexto.Solicitud.signal); // Propagar la señal de aborto del request original para que el usuario pueda cancelar la operación.

	} else {

		const datosRegistros = JSON.stringify({
			resolucion: Object.fromEntries([
				...Object.keys(ModelosIAEspecíficos),
				...Object.keys(ConectoresIA)
			].map(k => [k, ObtenerConectorDesdeModeloOConector(k)])),
			conectores: Object.fromEntries(Object.entries(ConectoresIA).map(([k, v]) => [k, {
				proveedor: v.Proveedor, modelo: v.Modelo, precios: v.Precios,
			}])),
			proveedoresBusquedaWeb: ProveedoresBúsquedaWeb,
		});
		const htmlBase = await CargarHtmlLocal(contexto, HtmlEjemploIACompilado, '/html/ejemplo-ia.html');
		const opcionesModelosIA = CrearOpcionesModelosIA();
		const htmlPágina = htmlBase.replaceAll('[[opciones-modelos-ia]]', opcionesModelosIA)
			.replace('[[datos-registros-ia]]', datosRegistros).replace('[[idioma-ejemplo-ia]]', JSON.stringify(contexto.Idioma));

		return ResponderHtmlConNonce(contexto, htmlPágina, true); // Esta vista de prueba conserva un script embebido porque funciona como una demo administrativa y de diagnóstico dentro de la propia ruta, con controles muy especificos para probar consultas y comparar resultados sin depender de otra pantalla del sitio. Como ese script no se quiere mover al JS global del proyecto, se le aplica nonce por respuesta para que pueda seguir ejecutandose en producción sin abrir unsafe-inline ni relajar la CSP general de todo el sitio.	

	}

}


function CrearOpcionesModelosIA(): string {

	return [
		...Object.keys(ModelosIAEspecíficos).sort(),
		...Object.keys(ConectoresIA).sort()
	].map(nombre => `<option value='${nombre}'>${nombre}</option>`).join('\n\t\t\t\t\t\t');

}
