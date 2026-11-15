import { ConectoresIA, ProveedoresIA } from '../../configuracion';
import { EnviarAlertaErrorCrítico } from '../alertas';
import type { Contexto, ConectorIA, ProveedorIA } from '../global';
import type { CitaIA, EntradaIA, EstadoUsoAcumulado, ParámetrosNormalizados, ResultadoConectorDirecto,
	UnidadesInfracciónIA, UsoTókenes } from '../ia';
import { AcumularUsoRonda, AplicarIdentificadorUsuario, AplicarParámetrosOpcionales, CrearFuenteInfracción, CrearUsoFacturable,
	ErrorContenidoBloqueado, ErrorLímiteTókenes, ManejarRespuestaHttpError, ObtenerClaveApi, ObtenerUnidadesInfracciónBloqueoEstructurado,
	ObtenerUnidadesInfracciónError, ProcesarEventoSse, ProcesarSseLineas, ResolverCadenaConectores, UsoTókenesCero,
	UsoTókenesTarifaExtendidaCero, ValidarRespuestaFlujo, VerificarBloqueoProveedor, MensajeRespuestaBloqueadaPorFiltro } from '../ia';
import { AñadirInstrucciónBúsquedaParallel, ConstruirHerramientaParallelResponses,
	ConstruirResultadoParallel, CrearEstadoBúsquedaParallel, ProcesarLlamadasBúsquedaParallel } from './parallel';


/**
 * Esta variable permanece en true por una decisión deliberada de protección de la cuenta API y de rendimiento. La Responses API de OpenAI permite solicitar la moderación de entrada y salida dentro de la misma petición que genera la respuesta, y devuelve los resultados estructurados en moderation.input y moderation.output (https://developers.openai.com/api/reference/cli/resources/responses/methods/create). Así se obtiene una señal adicional del propio proveedor sin añadir una segunda llamada HTTP ni convertir esta moderación en un filtro que bloquee la respuesta.
 *
 * La decisión se comprobó con scripts/probar-moderacion-responses.ps1 y los resultados recogidos en 'Resultado Rendimiento Moderación Incorporada OpenAI.txt'. El script ejecuta cincuenta consultas seguras distintas por variante (cien llamadas por ejecución), antepone un número aleatorio diferente de cinco dígitos para no reutilizar la caché, intercala cada par con la variante 'Con moderación' primero y deja dos segundos entre llamadas. Se utilizó el mismo modelo gpt-5.6-luna y el mismo límite de salida para ambas variantes. El informe contiene cinco ejecuciones, incluida una quinta realizada dos horas después. Cada variante completó 50 de 50 llamadas en cada ejecución, es decir, 250 respuestas completas por variante, sin errores ni respuestas incompletas.
 *
 * Tomando los promedios de esas cinco ejecuciones, 'Con moderación' obtuvo 2.593, 3.037, 3.122, 3.024 y 2.629 ms, cuyo promedio global es 2.881 ms. 'Sin moderación' obtuvo 2.736, 2.894, 2.802, 3.140 y 2.774 ms, cuyo promedio global es 2.869 ms. La diferencia agregada es de aproximadamente +12 ms (alrededor de 0,4 % más), una variación que es solo ruido. El ensayo no demuestra que OpenAI ejecute internamente ambas tareas literalmente en paralelo, pero sí que, en estas 250 comparaciones, pedir la señal integrada no añadió una latencia apreciable.
 *
 * La señal integrada es intencionadamente blanda: moderation.input.flagged === true suma una unidad para proteger la cuenta del proveedor, pero no lanza ContenidoNoPermitido. moderation.output se observa para diagnóstico, pero no suma unidades porque la salida la produce el modelo y no constituye por sí sola una infracción del usuario. Las señales estructuradas de rechazo duro que ya detectan los conectores conservan prioridad y sus tres unidades. Si OpenAI omite la moderación, devuelve un objeto de tipo error o una forma desconocida, la respuesta completada sigue siendo válida y aporta cero unidades. La variable sólo está soportada en modo Directo, el modo Flujo se rechaza explícitamente por que no se ha implementado.
 *
 * Por eso se mantiene activa: añade información nativa y estructurada del proveedor, refuerza la protección frente a usos que puedan poner en riesgo la cuenta API y, según el ensayo disponible, lo hace con un coste prácticamente despreciable. El script es una medición operativa, no una garantía universal para otros modelos, regiones o cargas, si cambian la API o las latencias, debe repetirse antes de cambiar esta decisión.
 */
const UsarModeraciónIntegrada = true;

const ModeloModeraciónIntegrada = 'omni-moderation-latest';

const MensajeFlujoIncompatibleConModeraciónIntegrada = 'El modo Flujo no es compatible con UsarModeraciónIntegradaOpenAI=true. Desactiva UsarModeraciónIntegradaOpenAI para usar Flujo.';

interface AnotaciónResponses {
	type?: string;
	url?: string;
	title?: string;
	start_index?: number;
	end_index?: number;
}

const ExtensiónBúsquedaWeb = {
	Baja: 'low',
	Media: 'medium',
	Alta: 'high',
} as const;

interface UsageMetadataResponses { // No cambiar los nombres porque se necesitan que sean estos para compatibilidad.
	input_tokens: number;
	input_tokens_details?: {
		cached_tokens?: number;
		cache_write_tokens?: number;
	};
	output_tokens: number;
	output_tokens_details?: {
		reasoning_tokens?: number;
	};
}

interface ResultadoModeraciónIntegrada { type?: unknown; flagged?: unknown; }

interface ModeraciónIntegrada { input?: ResultadoModeraciónIntegrada; output?: ResultadoModeraciónIntegrada; }

interface MarcacionesModeraciónIntegrada { EntradaMarcada: boolean; SalidaMarcada: boolean; }


function EsResultadoModeraciónIntegrada(valor: unknown): valor is ResultadoModeraciónIntegrada {

	if (!valor || typeof valor !== 'object') return false;
	const resultado = valor as ResultadoModeraciónIntegrada;
	return resultado.type === 'moderation_result' && typeof resultado.flagged === 'boolean';

}


function ObtenerMarcacionesModeraciónIntegrada(moderación: ModeraciónIntegrada | undefined): MarcacionesModeraciónIntegrada {

	const entradaMarcada = EsResultadoModeraciónIntegrada(moderación?.input) && moderación.input.flagged === true;
	const salidaMarcada = EsResultadoModeraciónIntegrada(moderación?.output) && moderación.output.flagged === true;
	return { EntradaMarcada: entradaMarcada, SalidaMarcada: salidaMarcada };

}


function ObtenerUnidadesInfracciónModeraciónIntegrada(moderación: ModeraciónIntegrada | undefined): UnidadesInfracciónIA {
	const marcaciones = ObtenerMarcacionesModeraciónIntegrada(moderación);
	return marcaciones.EntradaMarcada ? 1 : 0; // La entrada representa la consulta del usuario y aporta la señal blanda. La salida se detecta, pero no se atribuye al usuario ni se conserva como unidades.
}


export function ValidarCompatibilidadFlujoModeraciónIntegradaOpenAI(entrada: EntradaIA, ignorarRespaldos: boolean): void {

	if (!UsarModeraciónIntegrada) return;
	const nombresConectores = ResolverCadenaConectores(entrada.Conector, ignorarRespaldos, entrada.RespaldoConector ?? undefined);
	const contieneResponses = nombresConectores.some(nombreConector => {
		const conector = ConectoresIA[nombreConector];
		return conector?.Proveedor === 'open-ai' && ProveedoresIA[conector.Proveedor]?.Formato === 'OpenAI Responses';
	});
	if (contieneResponses) throw new Error(MensajeFlujoIncompatibleConModeraciónIntegrada);

}


function ConstruirCuerpoResponses(conector: ConectorIA, entrada: EntradaIA, parámetros: ParámetrosNormalizados,
	enFlujo: boolean): Record<string, unknown> {// Responses API usa una estructura distinta a Chat Completions: 'input' como array de mensajes con content tipado, 'instructions' para el system prompt, 'max_output_tokens' como nombre de tókenes, 'Razonamiento' como objeto y 'text' como contenedor de verbosidad. La lógica de Chat Completions se mantiene intacta para los proveedores compatibles (DeepSeek, Parasail, Novita) que no exponen este endpoint.

	const cuerpo: Record<string, unknown> = {
        model: conector.Modelo,
        input: [{ role: 'user', content: [{ type: 'input_text', text: entrada.MensajeUsuario }] }] // Estructura moderna: input como array de mensajes con content tipado.
	};

	if (UsarModeraciónIntegrada && !enFlujo && conector.Proveedor === 'open-ai')
		cuerpo.moderation = { model: ModeloModeraciónIntegrada, policy: { input: { mode: 'score' }, output: { mode: 'score' } } }; // score devuelve las señales de moderación sin convertirlas en un bloqueo automático. La penalización blanda se decide en el núcleo.

    if (parámetros.MensajeSistemaFinal) cuerpo.instructions = parámetros.MensajeSistemaFinal; // En Responses API el system prompt va en 'instructions' a nivel raíz. Si el conector tiene verbosidad nativa, este campo coincide con entrada.MensajeSistema sin modificar. Si no la tiene, ya viene anteponida la instrucción de verbosidad por texto.
	if (entrada.BúsquedaWeb && entrada.ProveedorBúsquedaWeb === 'OpenAI') {

		const herramientaBúsqueda: Record<string, unknown> = { type: 'web_search' };
		if (entrada.ExtensiónBúsquedaWeb)
			herramientaBúsqueda.search_context_size = ExtensiónBúsquedaWeb[
				entrada.ExtensiónBúsquedaWeb as keyof typeof ExtensiónBúsquedaWeb];
		if (entrada.PaísBúsquedaWeb) herramientaBúsqueda.user_location = { type: 'approximate', country: entrada.PaísBúsquedaWeb };
		cuerpo.tools = [herramientaBúsqueda];
		cuerpo.tool_choice = entrada.ForzarBúsquedaWeb ? 'required' : 'auto';

	}
    if (enFlujo) cuerpo.stream = true;
    AplicarParámetrosOpcionales(cuerpo, conector, parámetros, 'OpenAI Responses');
    return cuerpo;

}


function ContarBúsquedasWebResponses(salida: { type?: string; action?: { type?: string; }; }[] | undefined): number {
	return salida?.filter(elemento => elemento.type === 'web_search_call' && elemento.action?.type === 'search').length ?? 0;
}


export async function EjecutarOpenAIResponsesDirecto(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA,
	entrada: EntradaIA, parámetros: ParámetrosNormalizados, señal: AbortSignal): Promise<ResultadoConectorDirecto> {

	if (entrada.BúsquedaWeb && entrada.ProveedorBúsquedaWeb === 'Parallel')
		return EjecutarResponsesConParallel(contexto, conector, proveedor, entrada, parámetros, señal);

	const claveApi = ObtenerClaveApi(contexto, proveedor);
	const cuerpo = ConstruirCuerpoResponses(conector, entrada, parámetros, false);
	await AplicarIdentificadorUsuario(contexto, conector, cuerpo);
	const respuesta = await fetch(`${proveedor.Url}/responses`, {
		method: 'POST', signal: señal,
		headers: { 'content-type': 'application/json', 'authorization': `Bearer ${claveApi}` },
		body: JSON.stringify(cuerpo)
	});

	if (!respuesta.ok) await ManejarRespuestaHttpError(contexto, conector, respuesta);
	const datos = await respuesta.json() as {
		status?: string; error?: { code?: string; message?: string; }; incomplete_details?: { reason?: string; }; output_text?: string;
		output?: { type?: string; action?: { type?: string; }; content?: { type?: string; text?: string; annotations?: AnotaciónResponses[]; }[]; }[]; usage?: UsageMetadataResponses; service_tier?: string;
		moderation?: ModeraciónIntegrada;
	};

	if (datos.status === 'incomplete') {

		const motivo = datos.incomplete_details?.reason;
		if (motivo === 'max_output_tokens' || motivo === 'max_tokens') throw new ErrorLímiteTókenes(); // OpenAI documenta este límite como max_output_tokens en guías de Responses/Razonamiento y como max_tokens en algunas referencias/eventos de Responses. Aceptar ambos evita degradarlo a incomplete genérico.
		if (motivo === 'content_filter')
			throw new ErrorContenidoBloqueado(MensajeRespuestaBloqueadaPorFiltro,
				ObtenerUnidadesInfracciónBloqueoEstructurado(motivo, conector.Proveedor),
				CrearFuenteInfracción(conector, 'incomplete_details.reason:content_filter'));
		throw new Error(`Respuesta incompleta del proveedor: ${motivo ?? 'desconocido'}`);

	}

	await VerificarBloqueoProveedor(conector, datos);
	if (datos.error)
		throw new Error(`La respuesta del proveedor falló: ${datos.error.message ?? datos.error.code ?? 'error desconocido'}`);
	if (datos.status && datos.status !== 'completed') throw new Error(`La respuesta del proveedor no se completó: ${datos.status}`);
	const búsquedasWeb = ContarBúsquedasWebResponses(datos.output);

	const texto = datos.output_text
		?? datos.output?.flatMap(item => item.content ?? []).filter(parte => parte.type === 'output_text').map(parte => parte.text ?? '').join('')
		?? ''; // 'output_text' es el atajo de la SDK. Cuando no viene se reconstruye recorriendo output[].content[].text donde type === 'output_text'.
	if (!texto) throw new Error('La respuesta del proveedor está vacía.');
	const citas = datos.output?.flatMap(item => item.content ?? []).flatMap(parte => parte.annotations ?? [])
		.map(ConvertirCitaResponses).filter((cita): cita is CitaIA => cita !== null) ?? [];
	AlertarDegradaciónFast(contexto, conector, datos.service_tier);

	const unidadesInfracción = ObtenerUnidadesInfracciónModeraciónIntegrada(datos.moderation);
	const uso = ObtenerUsoResponses(datos.usage);
	const { UsoFacturable: usoFacturable, UsoTókenesTarifaExtendida: usoTókenesTarifaExtendida,
		EsContextoLargo: esContextoLargo } = CrearUsoFacturable(conector, uso);
	return { Texto: texto, Uso: uso, UsoFacturable: usoFacturable, UsoTókenesTarifaExtendida: usoTókenesTarifaExtendida, SolicitudesModelo: 1,
		SolicitudesContextoLargo: esContextoLargo ? 1 : 0, BúsquedasWeb: búsquedasWeb,
		ProveedorBúsquedaWeb: entrada.BúsquedaWeb ? 'OpenAI' : undefined, Citas: citas,
		UnidadesInfracción: unidadesInfracción,
		FuenteInfracción: unidadesInfracción > 0 ? CrearFuenteInfracción(conector, 'moderation.input.flagged') : undefined };

}


async function EjecutarResponsesConParallel(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA, entrada: EntradaIA,
	parámetros: ParámetrosNormalizados, señal: AbortSignal): Promise<ResultadoConectorDirecto> { // Orquesta las rondas de Responses API con Parallel, acumula el uso de cada respuesta y conserva la moderación de la solicitud inicial.

	type ElementoSalidaResponses = { type?: string; name?: string; arguments?: string; call_id?: string;
		content?: { type?: string; text?: string; }[]; };

	type DatosResponses = { id?: string; status?: string; error?: { code?: string; message?: string; };
		incomplete_details?: { reason?: string; }; output_text?: string; output?: ElementoSalidaResponses[];
		usage?: UsageMetadataResponses; service_tier?: string; moderation?: ModeraciónIntegrada; };

	const claveApi = ObtenerClaveApi(contexto, proveedor);
	const parámetrosParallel = { ...parámetros, MensajeSistemaFinal: AñadirInstrucciónBúsquedaParallel(parámetros.MensajeSistemaFinal) };
	const cuerpo = ConstruirCuerpoResponses(conector, entrada, parámetrosParallel, false); 
	cuerpo.tools = [ConstruirHerramientaParallelResponses()];
	cuerpo.tool_choice = entrada.ForzarBúsquedaWeb ? 'required' : 'auto';
	await AplicarIdentificadorUsuario(contexto, conector, cuerpo);
	const estado = CrearEstadoBúsquedaParallel(contexto); // Acumula fuentes, cantidad y duración de todas las búsquedas de esta consulta.
	let estadoUsoAcumulado: EstadoUsoAcumulado = { Uso: UsoTókenesCero, UsoFacturable: UsoTókenesCero,
		UsoTókenesTarifaExtendida: UsoTókenesTarifaExtendidaCero, SolicitudesContextoLargo: 0 };
	let solicitudesModelo = 0;
	let unidadesInfracción: UnidadesInfracciónIA = 0; // Conserva la señal de moderación de la entrada inicial incluso si una operación posterior falla.
	let primeraRonda = true;

	try {

		while (true) { // Repite la solicitud hasta que Responses entregue texto final o se propague un error.

			const respuesta = await fetch(`${proveedor.Url}/responses`, { // Usa el endpoint Responses y reenvía el cuerpo actualizado en cada ronda.
				method: 'POST', signal: señal, headers: { 'content-type': 'application/json', 'authorization': `Bearer ${claveApi}` },
				body: JSON.stringify(cuerpo) });

			if (!respuesta.ok) await ManejarRespuestaHttpError(contexto, conector, respuesta); // Centraliza la traducción de errores HTTP y la detección de bloqueos del proveedor.

			const datos = await respuesta.json() as DatosResponses;
			if (datos.status === 'incomplete') {

				const motivo = datos.incomplete_details?.reason;
				if (motivo === 'max_output_tokens' || motivo === 'max_tokens') throw new ErrorLímiteTókenes(); // Distingue el corte por límite de salida para que la capa superior lo registre correctamente.
				if (motivo === 'content_filter')
					throw new ErrorContenidoBloqueado(MensajeRespuestaBloqueadaPorFiltro,
						ObtenerUnidadesInfracciónBloqueoEstructurado(motivo, conector.Proveedor),
						CrearFuenteInfracción(conector, 'incomplete_details.reason:content_filter')); // Conserva como infracción una respuesta incompleta bloqueada por el filtro del proveedor.
				throw new Error(`Respuesta incompleta del proveedor: ${motivo ?? 'desconocido'}`); // No permite tratar como éxito un estado incompleto no reconocido.

			}

			await VerificarBloqueoProveedor(conector, datos); // Procesa las señales de bloqueo antes de usar el contenido o continuar la herramienta.

			if (datos.error)
				throw new Error(`La respuesta del proveedor falló: ${datos.error.message ?? datos.error.code ?? 'error desconocido'}`); // Propaga los errores estructurados aunque la respuesta HTTP haya sido exitosa.
			if (datos.status && datos.status !== 'completed')
				throw new Error(`La respuesta del proveedor no se completó: ${datos.status}`); // Rechaza estados de Responses que no representan una respuesta terminada.

			if (primeraRonda) {
				unidadesInfracción = ObtenerUnidadesInfracciónModeraciónIntegrada(datos.moderation); // La marca solo se toma de la primera respuesta: las rondas posteriores contienen resultados de herramientas y no una entrada nueva del usuario.
				primeraRonda = false;
			}

			AlertarDegradaciónFast(contexto, conector, datos.service_tier); // Registra si OpenAI degradó la solicitud fuera del nivel Fast esperado.

			const usoRonda = ObtenerUsoResponses(datos.usage);
			estadoUsoAcumulado = AcumularUsoRonda(conector, estadoUsoAcumulado, usoRonda); // Calcula la tarifa de esta ronda antes de sumarla, evitando convertir rondas cortas en una sola larga.
			solicitudesModelo += 1; // Cuenta cada respuesta del modelo para la contabilidad de la consulta.

			const llamadas = datos.output?.filter(elemento => elemento.type === 'function_call') ?? []; // Separa las llamadas de herramienta del texto que Responses puede devolver en la misma salida.
			if (llamadas.length > 0) { // Mientras haya llamadas, la respuesta no es final y hay que ejecutar Parallel antes de continuar.

				const resultadoBúsquedas = await ProcesarLlamadasBúsquedaParallel(contexto,
					llamadas.map(llamada => ({ Id: llamada.call_id, Nombre: llamada.name, Argumentos: llamada.arguments })), estado,
					entrada.ExtensiónBúsquedaWeb, entrada.PaísBúsquedaWeb, señal); // Valida argumentos, aplica el cupo y devuelve un resultado por cada llamada del modelo.

				if (!datos.id) throw new Error('La respuesta del proveedor no incluyó el id necesario para continuar la herramienta.'); // Responses necesita este identificador para enlazar la siguiente ronda con la anterior.

				cuerpo.previous_response_id = datos.id; // Continúa la misma respuesta de Responses en vez de reconstruir todo el historial manualmente.
				cuerpo.input = llamadas.map(
					(llamada, índice) => ({type: 'function_call_output', call_id: llamada.call_id, output: resultadoBúsquedas.Salidas[índice]})); // A diferencia de Chat Completions, no reconstruye toda la conversación: previous_response_id referencia la respuesta anterior y aquí solo se envían los resultados de Parallel asociados mediante call_id.

				cuerpo.tool_choice = resultadoBúsquedas.LímiteAlcanzado ? 'none' : 'auto'; // Al alcanzar el cupo impide nuevas búsquedas y deja al modelo consolidar las fuentes disponibles.
				delete cuerpo.moderation; // La moderación de entrada corresponde al mensaje inicial del usuario, no a los extractos web externos.

				continue; // Envía otra ronda usando previous_response_id y los resultados recién incorporados.

			}

			if (entrada.ForzarBúsquedaWeb && estado.BúsquedasWeb === 0)
				throw new Error('El modelo no ejecutó la búsqueda web obligatoria.'); // Hace cumplir la búsqueda exigida aunque el modelo haya respondido sin llamar la herramienta.

			const texto = datos.output_text
				?? datos.output?.flatMap(item => item.content ?? []).filter(parte => parte.type === 'output_text')
					.map(parte => parte.text ?? '').join('')
				?? ''; // Usa el campo resumido de Responses y conserva un respaldo para proveedores que solo llenan output.

			if (!texto) throw new Error('La respuesta del proveedor está vacía.'); // Evita devolver éxito sin contenido visible para el usuario.

			return { // Combina el resultado común de Parallel con la señal de moderación conservada de la primera ronda.
				...ConstruirResultadoParallel(texto, estado, estadoUsoAcumulado, solicitudesModelo),
				UnidadesInfracción: unidadesInfracción,
				FuenteInfracción: unidadesInfracción > 0
					? CrearFuenteInfracción(conector, 'moderation.input.flagged') : undefined,
			};

		}

	} catch (error) {

		if (error instanceof Error && unidadesInfracción > ObtenerUnidadesInfracciónError(error))
			Object.assign(error, { UnidadesInfracción: unidadesInfracción });
		throw error;

	}

}


export function ModoEspecialOpenAITieneFast(conector: ConectorIA): boolean {
	return conector.ModoEspecialOpenAI === 'Fast' || conector.ModoEspecialOpenAI === 'Fast Pro';
}


function ConvertirCitaResponses(anotación: AnotaciónResponses): CitaIA | null {

	if (anotación.type !== 'url_citation'
		|| typeof anotación.url !== 'string'
		|| typeof anotación.title !== 'string'
		|| typeof anotación.start_index !== 'number'
		|| typeof anotación.end_index !== 'number')
		return null;
	return { URL: anotación.url, Título: anotación.title, Inicio: anotación.start_index, Fin: anotación.end_index };

}


export function ModoEspecialOpenAITienePro(conector: ConectorIA): boolean {
	return conector.ModoEspecialOpenAI === 'Pro' || conector.ModoEspecialOpenAI === 'Fast Pro';
}


function AlertarDegradaciónFast(contexto: Contexto, conector: ConectorIA, servicioTier: string | undefined): void {

	if (ModoEspecialOpenAITieneFast(conector) && servicioTier === 'default') // La documentación oficial de Fast mode indica que GPT-5.6 devuelve 'priority' aunque se solicite 'fast', mientras que 'default' indica que la solicitud fue degradada a procesamiento estándar. Por eso se retorna para cualquier tier diferente de 'default' y solo se alerta ante la degradación explícita. https://developers.openai.com/api/docs/guides/fast-mode
		EnviarAlertaErrorCrítico(contexto, 'OpenAIFastDegradado', 'OpenAI degradó una solicitud Fast al servicio tier default.',
			`Conector: ${conector.Nombre}. Modelo: ${conector.Modelo}. ModoEspecialOpenAI: ${conector.ModoEspecialOpenAI}. ` +
			`Servicio solicitado: fast. Servicio efectivo: ${servicioTier}. IdSolicitud: ${contexto.IdSolicitud}.`);

}


function ObtenerUsoResponses(u: UsageMetadataResponses | undefined): UsoTókenes {

	if (!u) return UsoTókenesCero;
	const entradaCaché = u.input_tokens_details?.cached_tokens ?? 0;
	const escrituraCaché = u.input_tokens_details?.cache_write_tokens ?? 0;
	const salidaRazonamiento = u.output_tokens_details?.reasoning_tokens ?? 0;
	return {
		EntradaCaché: entradaCaché,
		EntradaNoCaché: Math.max(0, u.input_tokens - entradaCaché - escrituraCaché), // OpenAI incluye en input_tokens los tókenes procesados. cached_tokens y cache_write_tokens son categorías de cobro separadas. Restar ambas deja aquí únicamente la entrada cobrada a tarifa normal y evita cobrar los tókenes escritos dos veces.
		SalidaRazonamiento: salidaRazonamiento,
		FuenteSalidaRazonamiento: 'Proveedor',
		SalidaNoRazonamiento: Math.max(0, u.output_tokens - salidaRazonamiento),
		MinutosCachéManual: 0,
		EscrituraCaché: escrituraCaché
	};

}


export async function EjecutarOpenAIResponsesFlujo(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA,
	entrada: EntradaIA, parámetros: ParámetrosNormalizados, señal: AbortSignal, alContarBúsquedasWeb: (cantidad: number) => void,
	alRecibirTrozo: (trozo: string) => void): Promise<UsoTókenes> {

	const claveApi = ObtenerClaveApi(contexto, proveedor);
	const cuerpo = ConstruirCuerpoResponses(conector, entrada, parámetros, true);
	await AplicarIdentificadorUsuario(contexto, conector, cuerpo);
	const respuesta = await fetch(`${proveedor.Url}/responses`, {
		method: 'POST', signal: señal,
		headers: { 'content-type': 'application/json', 'authorization': `Bearer ${claveApi}`, 'accept': 'text/event-stream' },
		body: JSON.stringify(cuerpo)
	});
	const cuerpoFlujoResponses = await ValidarRespuestaFlujo(contexto, conector, respuesta);

	interface EventoSseResponses {
		delta?: string; item?: { type?: string; action?: { type?: string; }; };
		response?: { status?: string; incomplete_details?: { reason?: string; }; usage?: UsageMetadataResponses; service_tier?: string; };
	} // 'type' y 'Error' vienen del EventoSseBase que ProcesarEventoSse intersecta internamente.
	let estadoFinal: string | undefined;
	let razónIncompleta: string | undefined;
	let usoCapturado: UsoTókenes = UsoTókenesCero;
	await ProcesarSseLineas(cuerpoFlujoResponses, señal, líneaDatos => { // Responses API SSE: eventos JSON tipados. Solo interesa 'response.output_text.delta' (incremental) y se ignoran el resto (response.created, response.output_item.added, etc.). 'response.failed' se trata como error embebido. 'response.completed' incluye usage final.

		const evento = ProcesarEventoSse<EventoSseResponses>(líneaDatos, e => e.type === 'response.failed');
		if (evento?.type === 'response.output_text.delta' && evento.delta) alRecibirTrozo(evento.delta);
		if (evento?.type === 'response.output_item.done' && evento.item?.type === 'web_search_call'
			&& evento.item.action?.type === 'search')
			alContarBúsquedasWeb(1); // Aún no se devuelven las anotaciones `response.output_text.annotation.added` en streaming. Por ahora solo se emite texto.
		
		if (evento?.type === 'response.incomplete') {

			const motivo = evento.response?.incomplete_details?.reason;
			estadoFinal = (motivo === 'max_output_tokens' || motivo === 'max_tokens') ? 'max_tokens' : 'incomplete';
			razónIncompleta = motivo;

		} else if (evento?.type === 'response.completed') {

			estadoFinal = 'completed';
			AlertarDegradaciónFast(contexto, conector, evento.response?.service_tier);
			usoCapturado = ObtenerUsoResponses(evento.response?.usage); // Captura usage del evento final: es el único punto donde la API emite el conteo definitivo de tokens.

		}

	});
	if (estadoFinal === 'max_tokens') throw new ErrorLímiteTókenes();
	if (estadoFinal === 'incomplete') {

		if (razónIncompleta === 'content_filter')
			throw new ErrorContenidoBloqueado(MensajeRespuestaBloqueadaPorFiltro,
			ObtenerUnidadesInfracciónBloqueoEstructurado(razónIncompleta, conector.Proveedor),
			CrearFuenteInfracción(conector, 'incomplete_details.reason:content_filter'));
		throw new Error(`Respuesta incompleta del proveedor en flujo: ${razónIncompleta ?? 'desconocida'}`);

	}
	if (estadoFinal !== 'completed') throw new Error('El flujo finalizó sin un evento de completado.');
	return usoCapturado;

}


export async function EjecutarOpenAIModerationsDirecto(contexto: Contexto, conector: ConectorIA, proveedor: ProveedorIA,
	entrada: EntradaIA, señal: AbortSignal): Promise<ResultadoConectorDirecto> {

	const textoEntrada = entrada.MensajeSistema ? `${entrada.MensajeSistema}\n\n${entrada.MensajeUsuario}` : entrada.MensajeUsuario;
	const respuesta = await fetch(`${proveedor.Url}/moderations`, {
		method: 'POST', signal: señal,
		headers: { 'content-type': 'application/json', 'authorization': `Bearer ${ObtenerClaveApi(contexto, proveedor)}` },
		body: JSON.stringify({ model: conector.Modelo, input: textoEntrada })
	});
	if (!respuesta.ok) await ManejarRespuestaHttpError(contexto, conector, respuesta);
	const datos = await respuesta.json() as { results?: { flagged?: boolean; categories?: Record<string, boolean>; }[]; };
	if (!datos.results?.length) throw new Error('La respuesta de moderación del proveedor está vacía.');
	if (!datos.results.some(r => r.flagged)) return { Texto: 'safe', Uso: UsoTókenesCero, Citas: [] };
	const categorías = [...new Set(datos.results.flatMap(r =>
		Object.entries(r.categories ?? {}).filter(([, activa]) => activa).map(([categoría]) => categoría)))];
	if (categorías.length === 1 && categorías[0] === 'harassment') return { Texto: 'safe', Uso: UsoTókenesCero, Citas: [] }; // OpenAI marca como harassment instrucciones de tono antipático o insultos leves. Para este proyecto eso no protege la clave ni justifica bloquear al usuario si no viene acompañado de otra categoría más grave.

	return { Texto: categorías.length ? `unsafe\n${categorías.join('\n')}` : 'unsafe', Uso: UsoTókenesCero, Citas: [] };

}
