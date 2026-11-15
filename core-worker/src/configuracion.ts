import { ConectorIA, Idioma, ProveedorIA, ServicioCorreo, ConectorTextoAVoz, ProveedorTextoAVoz } from './nucleo/tipos';


export const NombreSitio = "Web Core"; // Propio de cada proyecto: al crear uno desde Web Core, se cambia por el suyo.

export const CorreoEnvíoEnlacesMágicos = "entrar@core.test"; // Propio de cada proyecto: al crear uno desde Web Core, se cambia por el suyo.

export const DominioProducción = "core.test"; // Propio de cada proyecto: al crear uno desde Web Core, se cambia por el suyo. Necesario para los enlaces mágicos.

export const CorreoAdministrador = "administrador@core.test"; // Propio de cada proyecto: al crear uno desde Web Core, se cambia por el suyo. Debe ser un correo autorizado en la opción 'Destination Addreses' de Cloudflare.

export const EmisorJwtIdentidad = 'core-worker'; // Propio de cada proyecto: al crear uno desde Web Core, se cambia por el suyo. Propiedad iss del JWT de identidad delegada.

export const AudienciaJwtIdentidad = 'core-api'; // Propio de cada proyecto: al crear uno desde Web Core, se cambia por el suyo. Propiedad aud del JWT de identidad delegada.

export const RutaTrasEntrar = '/inicio'; // Ruta configurable a la que se redirige tras un ingreso exitoso. Se carga completamente desde cero, no se rehidrata.

export const IdiomaPredeterminado: Idioma = 'es'; // Idioma principal del sitio. Debe ser uno de los listados en IdiomasSoportados. El sitio se presenta en este idioma cuando las URLs no tienen prefijo de idioma.

export const IdiomasSoportados: readonly Idioma[] = ['es', 'en']; // Esta lista define los idiomas soportados por el sitio. Con 1 idioma el sitio funciona como monoidioma y no genera URLs con prefijos de idioma, hreflang alternativos ni variantes adicionales de sitemap. Con 2 o más idiomas el sitio funciona como multidioma, habilita detección y cambio de idioma, genera rutas alternativas por idioma y exige contenido SEO por cada idioma listado.

export const IdiomaRespaldo: Idioma = 'en'; // Idioma para los navegadores que piden una lista de idiomas sin ninguno de IdiomasSoportados, como uno en francés o en japonés, porque el inglés lo entienden más personas que el español. También es el x-default del hreflang, la versión que los buscadores les muestran a esos usuarios. Las solicitudes sin el encabezado Accept-Language, como las de los buscadores, siguen en IdiomaPredeterminado. Debe ser uno de los listados en IdiomasSoportados, y si no se quiere un respaldo distinto, se pone el mismo IdiomaPredeterminado.

export const ActivarTraducciónHtml: boolean = true; // Controla el reemplazo de claves '{{clave}}' dentro de HTML marcado con 'trad'. Si es verdadero, se cargan los diccionarios y se sustituyen textos y atributos traducibles. Si es falso, el HTML se muestra como viene sin reemplazos y el rendimiento es ligeramente superior. Usualmente este valor es verdadero si hay más de un idioma soportado. Puede ser falso o verdadero con un solo idioma: verdadero, si se quieren centralizar los textos del sitio en el archivo de localización textos/xx.json correspondiente al idioma predeterminado o falso, si se quiere usar el HTML directo y mayor rendimiento.

export const ServicioCorreoActivo: ServicioCorreo = ServicioCorreo.ZeptoMail; // Servicio usado para enviar todos los correos del sitio. Cuando CloudflareEmail salga de beta se debe configurar en núcleo/correos.ts antes de usarlo.

export const MáximosCarácteresTítuloSeo: number = 70; // Límite de calidad para evitar títulos SEO demasiado largos en rutas canónicas indexables por buscadores.

export const MáximosCarácteresDescripciónSeo: number = 220; // Límite de calidad configurable. Los buscadores usualmente no tienen un corte fijo universal para descripciones, así que se deja margen, pero evitando textos excesivos.

export const ActivarAutenticaciónEnCliente: boolean = true; // Si es falso, todas las rutas elevan automáticamente su certeza consulta en la base de datos y el modo de autenticación en cliente queda deshabilitado. Si es en verdadero, la autenticación del usuario se apoya en una cookie que se guarda en el cliente y cada cierto tiempo (SegundosDuraciónAutenticaciónEnCliente) se verifica la base de datos si el usuario sigue con la sesión abierta. Si es falso, la verificación en la base de datos de si el usuario se encuentra con la sesión abierta y no está bloqueado, se hace en cada una de las consultas. Para casos de uso delicados en los que se requiera un bloqueo inmediato del usuario, se debe usar falso, a costo de incrementar los costos de lectura en la base de datos. Para casos de uso poco delicados se puede dejar en verdadero. Para casos de uso intermedios se puede dejar en verdadero y modificar SegundosDuraciónAutenticaciónEnCliente a un valor más bajo. Esta variable es un interruptor global de seguridad, de todas maneras todas las rutas admiten configuración propia de su modo de autenticación (ver rutas.ts > Manejadores).

export const SegundosDuraciónAutenticaciónEnCliente: number = 2 * 60 * 60; // Cambiar el primer número por las horas de duración en las que la cookie JWT de cliente se considera válida sin necesidad de consultar la base de datos. Se usa un recomienda un valor mayor a una hora porque la principal funcionalidad práctica del vencimiento de la autenticación en el cliente es detectar casos en los que el usuario ha sido bloqueado externamente. Además, se tiene la separación entre operaciones críticas (que exigen autenticación con base de datos) y normales, que reduce aún más el daño de lo que puede hacer un usuario recientemente bloqueado con su autenticación en cliente. Finalmente, cualquier operación de cambio de estado del usuario (por ejemplo cambio de rol/plan de pago) iniciada por el usuario mismo en su equipo puede generar la actualización su estado de autenticación en la cookie de cliente en el momento que se realice esta acción.

export const SegundosMáximosInactividadSesión = 30 * 24 * 60 * 60; // Cambiar el primer número por los días sin actividad tras los cuales la sesión se considera expirada. También define Max-Age de la cookie en segundos.

export const MáximoValorDinero: number = 1_000_000_000; // Límite de dominio para dinero en unidades monetarias completas. dinero.ts lo convierte a micros y falla si una lectura o escritura supera este valor absoluto.

export const MínimoValorDinero: number = 0.1; // Umbral configurable para avisar de valores sospechosamente bajos. No invalida el dinero porque importes pequeños y negativos pueden ser válidos como valores de ajustes.

export const AlertaBajoValorDinero: boolean = true; // Permite desactivar los console.warn de dinero.ts sin depender de process.env, porque el Worker corre en Cloudflare.

export const FormatoDinero: string = '### ### ##0,## $'; // Formato de dinero usado en la función ATexto(). # es posición opcional, 0 es posición obligatoria. decimal.ts deriva el separador de miles y el separador de decimales directamente de este formato para evitar inconsistencias entre la máscara y los separadores. Regla: entre el primer y el último marcador (# o 0) se admiten como máximo dos cáracteres separadores distintos. Si aparecen dos distintos, el primero que aparezca es el separador de miles y el último el de decimales. Si solo aparece uno, ese es el separador de decimales y no hay separador de miles. Si no aparece ninguno, no hay separadores. Tres o más separadores distintos se consideran un formato inválido.

export const MáximoValorCantidad: number = 1_000_000_000; // Límite de dominio para cantidad. cantidad.ts lo convierte a micros y falla si una lectura o escritura supera este valor absoluto.

export const MínimoValorCantidad: number = -1_000_000_000; // Umbral configurable para avisar de valores sospechosamente bajos.

export const AlertaBajoValorCantidad: boolean = true; // Permite desactivar los console.warn de cantidad.ts sin depender de process.env, porque el Worker corre en Cloudflare.

export const FormatoCantidad: string = '### ### ##0,##'; // Formato usado en la función ATexto(). # es posición opcional, 0 es posición obligatoria. decimal.ts deriva el separador de miles y el separador de decimales directamente de este formato para evitar inconsistencias entre la máscara y los separadores. Regla: entre el primer y el último marcador (# o 0) se admiten como máximo dos carácteres separadores distintos. Si aparecen dos distintos, el primero que aparezca es el separador de miles y el último el de decimales. Si solo aparece uno, ese es el separador de decimales y no hay separador de miles. Si no aparece ninguno, no hay separadores. Tres o más separadores distintos se consideran un formato inválido.

export const CarácteresMáximosTextoAVoz = 3_000; // Límite de entrada menor que Gemini-TTS: 4.000 bytes para dar margen a carácteres con más bytes. De todas maneras es un límite alto porque se sugiere trocear el texto para obtener rendimiento aceptable para el usuario.

export const FactorCarácteresATókenesTextoAVoz = 4; // Aproximación de 4 carácteres por tóken para estimar la entrada de texto a voz y registrar el consumo con una medida parecida a la de IA. No se requiere exactitud porque el precio de la entrada de texto a voz es muy bajo y se usa solo para registrar el consumo en la base de datos.

export const SegundosMáximosSolicitudTextoAVoz = 60; // Es el límite general de seguridad para cada intento TTS. El cliente elige y envía el tiempo concreto del principal y del respaldo, mientras el Worker evita que cualquiera de esos valores pueda superar este máximo.


export const ProveedoresIA: Record<string, ProveedorIA> = { // Plataformas de inferencia disponibles. Define la URL base, el formato de API y el nombre de la variable de entorno que guarda la clave secreta. El formato determina qué adaptador usa el orquestador para construir el cuerpo de la petición y extraer la respuesta.
	'open-ai': { Clave: 'CLAVE_OPENAI', Url: 'https://api.openai.com/v1', Formato: 'OpenAI Responses', MáximosTókenesSalidaTípicos: 128_000 }, // OpenAI nativo: usa la Responses API moderna (/v1/responses) con razonamiento, verbosidad y herramientas como objetos estructurados.
	'open-ai-moderations': { Clave: 'CLAVE_OPENAI', Url: 'https://api.openai.com/v1', Formato: 'OpenAI Moderations', MáximosTókenesSalidaTípicos: 128_000 },
	'anthropic': { Clave: 'CLAVE_ANTHROPIC', Url: 'https://api.anthropic.com/v1', Formato: 'Anthropic', MáximosTókenesSalidaTípicos: 128_000 },
	'google': { Clave: 'CLAVE_GOOGLE', Url: 'https://generativelanguage.googleapis.com/v1beta', Formato: 'Gemini', MáximosTókenesSalidaTípicos: 65_536 }, // Gemini acepta como máximo 65.536 tókenes de salida por solicitud.
	'cloudflare': { Clave: '', Url: 'cloudflare://workers-ai', Formato: 'Cloudflare', MáximosTókenesSalidaTípicos: 128_000 },
	'deepseek': { Clave: 'CLAVE_DEEPSEEK', Url: 'https://api.deepseek.com', Formato: 'OpenAI Chat', MáximosTókenesSalidaTípicos: 384_000 }, // Compatible con Chat Completions. No expone Responses API. DeepSeek publica un máximo de salida de 384K.
	'parasail': { Clave: 'CLAVE_PARASAIL', Url: 'https://api.parasail.io/v1', Formato: 'OpenAI Chat', MáximosTókenesSalidaTípicos: 128_000 }, // Compatible con Chat Completions. No expone Responses API.
	'novita': { Clave: 'CLAVE_NOVITA', Url: 'https://api.novita.ai/openai', Formato: 'OpenAI Chat', MáximosTókenesSalidaTípicos: 128_000 }, // Compatible con Chat Completions. No expone Responses API.
	'fireworks': { Clave: 'CLAVE_FIREWORKS', Url: 'https://api.fireworks.ai/inference/v1', Formato: 'OpenAI Chat', MáximosTókenesSalidaTípicos: 128_000 }, // Compatible con Chat Completions. No expone Responses API.
	'inceptron': { Clave: 'CLAVE_INCEPTRON', Url: 'https://api.inceptron.io/v1', Formato: 'OpenAI Chat', MáximosTókenesSalidaTípicos: 128_000 }, // Compatible con Chat Completions. No expone Responses API.
	'deepinfra': { Clave: 'CLAVE_DEEPINFRA', Url: 'https://api.deepinfra.com/v1/openai', Formato: 'OpenAI Chat', MáximosTókenesSalidaTípicos: 128_000 }, // Compatible con Chat Completions. No expone Responses API.
	'together': { Clave: 'CLAVE_TOGETHER', Url: 'https://api.together.xyz/v1', Formato: 'OpenAI Chat', MáximosTókenesSalidaTípicos: 128_000 }, // Compatible con Chat Completions. No expone Responses API.
};


export const ConectoresIA: Record<string, ConectorIA> = { // Unidades de ejecución atómicas. Cada clave identifica el modelo exacto y el proveedor (ej: 'gpt-5.5-in-openai'). Cada conector combina proveedor, modelo y parámetros de comportamiento (razonamiento, verbosidad, cadena de respaldo). Es el nivel más bajo de la jerarquía de resolución.
	'gpt-6-astra-in-openai': {
		Nombre: 'gpt-6-astra-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-astra', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'], // Astra no admite none y expone los cinco niveles low, medium, high, xhigh y max.
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'],
		NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 1.00, EntradaNoCaché: 10.00, SalidaRazonamiento: 50.00, SalidaNoRazonamiento: 50.00, // https://developers.openai.com/api/docs/models/gpt-6-astra
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 12.50, AlmacenamientoCachéPorHora: 0 }, // La escritura de caché cuesta 1.25x la entrada sin caché.
	},
	'gpt-6-astra-fast-in-openai': {
		Nombre: 'gpt-6-astra-fast-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-astra', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 2.00, EntradaNoCaché: 20.00, SalidaRazonamiento: 100.00, SalidaNoRazonamiento: 100.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 25.00, AlmacenamientoCachéPorHora: 0 }, // Fast duplica las tarifas aplicables.
	},
	'gpt-6-astra-pro-in-openai': {
		Nombre: 'gpt-6-astra-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-astra', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 1.00, EntradaNoCaché: 10.00, SalidaRazonamiento: 50.00, SalidaNoRazonamiento: 50.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 12.50, AlmacenamientoCachéPorHora: 0 }, // Pro cobra las tarifas estándar. El mayor consumo se refleja en los tókenes usados.
	},
	'gpt-6-astra-fast-pro-in-openai': {
		Nombre: 'gpt-6-astra-fast-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-astra', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 2.00, EntradaNoCaché: 20.00, SalidaRazonamiento: 100.00, SalidaNoRazonamiento: 100.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 25.00, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-6-sol-in-openai': {
		Nombre: 'gpt-6-sol-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-sol', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null, // Igual que Astra en la práctica: OpenAI exige quitar temperature, top_p y top_logprobs cuando el razonamiento no es none, y el núcleo nunca envía none: https://developers.openai.com/api/docs/guides/latest-model
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'], // Igual que GPT-5.6: el modelo admite none, pero se omite porque según artificialanalysis.ai none tiene menos inteligencia y mayor costo por tarea que low, y así se conservan los cinco niveles de razonamiento.
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'],
		NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.20, EntradaNoCaché: 2.00, SalidaRazonamiento: 10.00, SalidaNoRazonamiento: 10.00, // https://developers.openai.com/api/docs/models/gpt-6-sol
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 2.50, AlmacenamientoCachéPorHora: 0 }, // EscrituraCachéLargaDuración se cobra a 1.25x EntradaNoCaché.
	},
	'gpt-6-luna-in-openai': {
		Nombre: 'gpt-6-luna-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-luna', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null, // Igual que Astra en la práctica: OpenAI exige quitar temperature, top_p y top_logprobs cuando el razonamiento no es none, y el núcleo nunca envía none: https://developers.openai.com/api/docs/guides/latest-model
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'], // Igual que GPT-5.6: el modelo admite none, pero se omite porque según artificialanalysis.ai none tiene menos inteligencia y mayor costo por tarea que low, y así se conservan los cinco niveles de razonamiento.
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'],
		NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.01, EntradaNoCaché: 0.10, SalidaRazonamiento: 0.50, SalidaNoRazonamiento: 0.50, // https://developers.openai.com/api/docs/models/gpt-6-luna
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0.125, AlmacenamientoCachéPorHora: 0 }, // EscrituraCachéLargaDuración se cobra a 1.25x EntradaNoCaché.
	},
	'gpt-6-sol-fast-in-openai': {
		Nombre: 'gpt-6-sol-fast-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-sol', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.40, EntradaNoCaché: 4.00, SalidaRazonamiento: 20.00, SalidaNoRazonamiento: 20.00, // https://developers.openai.com/api/docs/pricing
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 5.00, AlmacenamientoCachéPorHora: 0 }, // Fast duplica las tarifas aplicables.
	},
	'gpt-6-sol-pro-in-openai': {
		Nombre: 'gpt-6-sol-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-sol', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.20, EntradaNoCaché: 2.00, SalidaRazonamiento: 10.00, SalidaNoRazonamiento: 10.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 2.50, AlmacenamientoCachéPorHora: 0 }, // Pro cobra las tarifas estándar. El mayor consumo se refleja en los tókenes usados.
	},
	'gpt-6-sol-fast-pro-in-openai': {
		Nombre: 'gpt-6-sol-fast-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-sol', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.40, EntradaNoCaché: 4.00, SalidaRazonamiento: 20.00, SalidaNoRazonamiento: 20.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 5.00, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-6-luna-fast-in-openai': {
		Nombre: 'gpt-6-luna-fast-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-luna', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.02, EntradaNoCaché: 0.20, SalidaRazonamiento: 1.00, SalidaNoRazonamiento: 1.00, // https://developers.openai.com/api/docs/pricing
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0.25, AlmacenamientoCachéPorHora: 0 }, // Fast duplica las tarifas aplicables.
	},
	'gpt-6-luna-pro-in-openai': {
		Nombre: 'gpt-6-luna-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-luna', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.01, EntradaNoCaché: 0.10, SalidaRazonamiento: 0.50, SalidaNoRazonamiento: 0.50,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0.125, AlmacenamientoCachéPorHora: 0 }, // Pro cobra las tarifas estándar. El mayor consumo se refleja en los tókenes usados.
	},
	'gpt-6-luna-fast-pro-in-openai': {
		Nombre: 'gpt-6-luna-fast-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-6-luna', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: null,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.02, EntradaNoCaché: 0.20, SalidaRazonamiento: 1.00, SalidaNoRazonamiento: 1.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0.25, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.6-sol-in-openai': {
		Nombre: 'gpt-5.6-sol-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-sol', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'], // Los cinco niveles de razonamiento omiten none y recorren low, medium, high, xhigh y max. Se omite none porque según artificialanalysis.ai no aporta más inteligencia ni menos precio que el razonamiento low y para no tener que cambiar la cantidad posible de razonamientos de 5 a 6.
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'],
		NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.40, EntradaNoCaché: 4.00, SalidaRazonamiento: 20.00, SalidaNoRazonamiento: 20.00, // https://developers.openai.com/api/docs/models/gpt-5.6-sol
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 5.00, AlmacenamientoCachéPorHora: 0 }, // EscrituraCachéLargaDuración se cobra a 1.25x EntradaNoCaché.
	},
	'gpt-5.6-terra-in-openai': {
		Nombre: 'gpt-5.6-terra-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-terra', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'], // Los cinco niveles de razonamiento omiten none y recorren low, medium, high, xhigh y max. Se omite none porque según artificialanalysis.ai no aporta más inteligencia ni menos precio que el razonamiento low y para no tener que cambiar la cantidad posible de razonamientos de 5 a 6.
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'],
		NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.20, EntradaNoCaché: 2.00, SalidaRazonamiento: 12.00, SalidaNoRazonamiento: 12.00, // https://developers.openai.com/api/docs/models/gpt-5.6-terra
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 2.50, AlmacenamientoCachéPorHora: 0 }, // EscrituraCachéLargaDuración se cobra a 1.25x EntradaNoCaché.
	},
	'gpt-5.6-luna-in-openai': {
		Nombre: 'gpt-5.6-luna-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-luna', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'], // Los cinco niveles de razonamiento omiten none y recorren low, medium, high, xhigh y max. Se omite none porque según artificialanalysis.ai no aporta más inteligencia ni menos precio que el razonamiento low y para no tener que cambiar la cantidad posible de razonamientos de 5 a 6.
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'],
		NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.02, EntradaNoCaché: 0.20, SalidaRazonamiento: 1.20, SalidaNoRazonamiento: 1.20, // https://developers.openai.com/api/docs/models/gpt-5.6-luna
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0.25, AlmacenamientoCachéPorHora: 0 }, // EscrituraCachéLargaDuración se cobra a 1.25x EntradaNoCaché.
	},
	'gpt-5.6-sol-fast-in-openai': {
		Nombre: 'gpt-5.6-sol-fast-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-sol', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.80, EntradaNoCaché: 8.00, SalidaRazonamiento: 40.00, SalidaNoRazonamiento: 40.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 10.00, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.6-sol-pro-in-openai': {
		Nombre: 'gpt-5.6-sol-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-sol', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.40, EntradaNoCaché: 4.00, SalidaRazonamiento: 20.00, SalidaNoRazonamiento: 20.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 5.00, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.6-sol-fast-pro-in-openai': {
		Nombre: 'gpt-5.6-sol-fast-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-sol', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.80, EntradaNoCaché: 8.00, SalidaRazonamiento: 40.00, SalidaNoRazonamiento: 40.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 10.00, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.6-terra-fast-in-openai': {
		Nombre: 'gpt-5.6-terra-fast-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-terra', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.40, EntradaNoCaché: 4.00, SalidaRazonamiento: 24.00, SalidaNoRazonamiento: 24.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 5.00, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.6-terra-pro-in-openai': {
		Nombre: 'gpt-5.6-terra-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-terra', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.20, EntradaNoCaché: 2.00, SalidaRazonamiento: 12.00, SalidaNoRazonamiento: 12.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 2.50, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.6-terra-fast-pro-in-openai': {
		Nombre: 'gpt-5.6-terra-fast-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-terra', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.40, EntradaNoCaché: 4.00, SalidaRazonamiento: 24.00, SalidaNoRazonamiento: 24.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 5.00, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.6-luna-fast-in-openai': {
		Nombre: 'gpt-5.6-luna-fast-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-luna', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.04, EntradaNoCaché: 0.40, SalidaRazonamiento: 2.40, SalidaNoRazonamiento: 2.40,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0.50, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.6-luna-pro-in-openai': {
		Nombre: 'gpt-5.6-luna-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-luna', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.02, EntradaNoCaché: 0.20, SalidaRazonamiento: 1.20, SalidaNoRazonamiento: 1.20,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0.25, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.6-luna-fast-pro-in-openai': {
		Nombre: 'gpt-5.6-luna-fast-pro-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.6-luna', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, ModoEspecialOpenAI: 'Fast Pro', SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high', 'xhigh', 'max'],
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.04, EntradaNoCaché: 0.40, SalidaRazonamiento: 2.40, SalidaNoRazonamiento: 2.40,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0.50, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.5-in-openai': {
		Nombre: 'gpt-5.5-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.5', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['none', 'low', 'medium', 'high', 'xhigh'], // 5 valores → correspondencia directa con los 5 niveles del frontend (1→none, 2→low, 3→medium, 4→high, 5→xhigh).
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], // 3 valores → distribución por segmentos uniformes (1 y 2→low, 3→medium, 4 y 5→high). Responses API soporta verbosidad nativa: el valor se envía dentro del objeto text: { verbosity }.
		NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.50, EntradaNoCaché: 5.00, SalidaRazonamiento: 30.00, SalidaNoRazonamiento: 30.00, // https://developers.openai.com/api/docs/pricing
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.4-in-openai': {
		Nombre: 'gpt-5.4-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.4', MáximoTókenesEntradaTarifaEstándar: 272_000,
		RangoTemperaturaSoportado: [0, 2],
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['none', 'low', 'medium', 'high', 'xhigh'], // 5 valores → correspondencia directa con los 5 niveles del frontend (1→none, 2→low, 3→medium, 4→high, 5→xhigh).
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], // 3 valores → distribución por segmentos uniformes (1 y 2→low, 3→medium, 4 y 5→high). Responses API soporta verbosidad nativa: el valor se envía dentro del objeto text: { verbosity }.
		NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.25, EntradaNoCaché: 2.50, SalidaRazonamiento: 15.00, SalidaNoRazonamiento: 15.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.4-mini-in-openai': {
		Nombre: 'gpt-5.4-mini-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.4-mini', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, MapeoRazonamiento: ['none', 'low', 'medium', 'high', 'xhigh'], // 5 valores → correspondencia directa con los 5 niveles del frontend (1→none, 2→low, 3→medium, 4→high, 5→xhigh).
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], // 3 valores → distribución por segmentos uniformes (1 y 2→low, 3→medium, 4 y 5→high). Responses API soporta verbosidad nativa: el valor se envía dentro del objeto text: { verbosity }.
		NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.075, EntradaNoCaché: 0.75, SalidaRazonamiento: 4.50, SalidaNoRazonamiento: 4.50,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'gpt-5.4-nano-in-openai': {
		Nombre: 'gpt-5.4-nano-in-openai', Proveedor: 'open-ai', Modelo: 'gpt-5.4-nano', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, MapeoRazonamiento: ['none', 'low', 'medium', 'high', 'xhigh'], // 5 valores → correspondencia directa con los 5 niveles del frontend (1→none, 2→low, 3→medium, 4→high, 5→xhigh).
		VerbosidadConfigurable: true, MapeoVerbosidad: ['low', 'medium', 'high'], // 3 valores → distribución por segmentos uniformes (1 y 2→low, 3→medium, 4 y 5→high). Responses API soporta verbosidad nativa: el valor se envía dentro del objeto text: { verbosity }.
		NombreParámetroMáximosTokenes: 'max_output_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.02, EntradaNoCaché: 0.20, SalidaRazonamiento: 1.25, SalidaNoRazonamiento: 1.25,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'omni-moderation-latest-in-openai': {
		Nombre: 'omni-moderation-latest-in-openai', Proveedor: 'open-ai-moderations', Modelo: 'omni-moderation-latest',
		RangoTemperaturaSoportado: null,
		NoSoportaHerramientas: true, SoportaFlujo: false, SoportaMensajeSistema: false, RazonamientoConfigurable: false,
		MapeoRazonamiento: [], VerbosidadConfigurable: false, MapeoVerbosidad: [],
		Respaldo: 'llama-guard-4-12b-in-deepinfra', RespaldoFinal: 'llama-guard-3-8b-in-cloudflare',
		Precios: { EntradaCaché: 0, EntradaNoCaché: 0, SalidaRazonamiento: 0, SalidaNoRazonamiento: 0,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'gemini-3.1-pro-in-google': {
		Nombre: 'gemini-3.1-pro-in-google', Proveedor: 'google', Modelo: 'gemini-3.1-pro-preview',
		RangoTemperaturaSoportado: [0, 2],
		MáximoTókenesEntradaTarifaEstándar: 200_000,
		TarifaContextoLargo: { MultiplicadorEntrada: 2, MultiplicadorSalida: 1.5 }, SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['LOW', 'MEDIUM', 'HIGH'], // Gemini 3.1 expone razonamiento nativo: el orquestador envuelve el valor en generationConfig.thinkingConfig = { includeThoughts: true, thinkingLevel }.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'maxOutputTokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.20, EntradaNoCaché: 2.00, SalidaRazonamiento: 12.00, SalidaNoRazonamiento: 12.00, // https://ai.google.dev/gemini-api/docs/pricing?hl=es-419.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 4.50 },
	},
	'gemini-3.7-flash-in-google': {
		Nombre: 'gemini-3.7-flash-in-google', Proveedor: 'google', Modelo: 'gemini-3.7-flash',
		RangoTemperaturaSoportado: null,
		SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high'], // Gemini 3.7 Flash admite razonamiento nativo low, medium y high. Minimal ya no está disponible.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'maxOutputTokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.075, EntradaNoCaché: 0.75, SalidaRazonamiento: 3.75, SalidaNoRazonamiento: 3.75, // Precio introductorio vigente hasta el 31 de diciembre de 2026: https://ai.google.dev/gemini-api/docs/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0.50 },
	},
	'gemini-3.8-flash-in-google': {
		Nombre: 'gemini-3.8-flash-in-google', Proveedor: 'google', Modelo: 'gemini-3.8-flash',
		RangoTemperaturaSoportado: null,
		SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['low', 'medium', 'high'], // Gemini 3.8 Flash admite low, medium y high. Medium es el predeterminado y minimal no está soportado: https://ai.google.dev/gemini-api/docs/latest-model?hl=es-419.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'maxOutputTokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.075, EntradaNoCaché: 0.75, SalidaRazonamiento: 3.75, SalidaNoRazonamiento: 3.75, // Precio introductorio vigente hasta el 31 de diciembre de 2026: https://ai.google.dev/gemini-api/docs/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0.50 },
	},
	'gemini-3-flash-in-google': {
		Nombre: 'gemini-3-flash-in-google', Proveedor: 'google', Modelo: 'gemini-3-flash-preview', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, MapeoRazonamiento: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'], // Gemini 3 Flash también expone razonamiento nativo vía generationConfig.thinkingConfig y permite un razonamiento adicional MINIMAL.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'maxOutputTokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.05, EntradaNoCaché: 0.50, SalidaRazonamiento: 3.00, SalidaNoRazonamiento: 3.00,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 1.00 },
	},
	'gemini-3.1-flash-lite-in-google': {
		Nombre: 'gemini-3.1-flash-lite-in-google', Proveedor: 'google', Modelo: 'gemini-3.1-flash-lite', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, MapeoRazonamiento: ['minimal', 'low', 'medium', 'high'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'maxOutputTokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.025, EntradaNoCaché: 0.25, SalidaRazonamiento: 1.50, SalidaNoRazonamiento: 1.50,
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 1.00 },
	},
	'gemini-3.5-flash-lite-in-google': {
		Nombre: 'gemini-3.5-flash-lite-in-google', Proveedor: 'google', Modelo: 'gemini-3.5-flash-lite',
		RangoTemperaturaSoportado: [0, 2],
		SoportaFlujo: true,
		RazonamientoConfigurable: true, MapeoRazonamiento: ['minimal', 'low', 'medium', 'high'], // Gemini 3.5 Flash-Lite usa thinkingConfig.thinkingLevel y tiene minimal como nivel predeterminado.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'maxOutputTokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.03, EntradaNoCaché: 0.30, SalidaRazonamiento: 2.50, SalidaNoRazonamiento: 2.50, // https://ai.google.dev/gemini-api/docs/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 1.00 },
	},
	'kimi-k2.6-in-parasail': {
		Nombre: 'kimi-k2.6-in-parasail', Proveedor: 'parasail', Modelo: 'moonshotai/Kimi-K2.6', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'parasail-kimi', MapeoRazonamiento: ['none', 'enabled'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.16, EntradaNoCaché: 0.75, SalidaRazonamiento: 3.50, SalidaNoRazonamiento: 3.50, // https://www.saas.parasail.io/pricing
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k2.6-waferai-in-parasail': {
		Nombre: 'kimi-k2.6-waferai-in-parasail', Proveedor: 'parasail', Modelo: 'parasail-kimi-k26-nvfp4', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'parasail-kimi', MapeoRazonamiento: ['none', 'enabled'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.16, EntradaNoCaché: 0.75, SalidaRazonamiento: 3.50, SalidaNoRazonamiento: 3.50, // https://www.saas.parasail.io/pricing
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k2.6-in-novita': {
		Nombre: 'kimi-k2.6-in-novita', Proveedor: 'novita', Modelo: 'moonshotai/kimi-k2.6', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'thinking-type', MapeoRazonamiento: ['none', 'enabled'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.16, EntradaNoCaché: 0.80, SalidaRazonamiento: 3.40, SalidaNoRazonamiento: 3.40, // https://novita.ai/es/models.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k2.6-in-inceptron': {
		Nombre: 'kimi-k2.6-in-inceptron', Proveedor: 'inceptron', Modelo: 'moonshotai/Kimi-K2.6', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'thinking-type', MapeoRazonamiento: ['none', 'enabled'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.20, EntradaNoCaché: 0.67, SalidaRazonamiento: 3.5, SalidaNoRazonamiento: 3.50, // https://console.inceptron.io/models.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k2.6-in-cloudflare': {
		Nombre: 'kimi-k2.6-in-cloudflare', Proveedor: 'cloudflare', Modelo: '@cf/moonshotai/kimi-k2.6',
		FormatoRespuestaCloudflare: 'OpenAIChat', SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'parasail-kimi', MapeoRazonamiento: ['none', 'enabled'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.16, EntradaNoCaché: 0.95, SalidaRazonamiento: 4.00, SalidaNoRazonamiento: 4.00, // https://developers.cloudflare.com/workers-ai/platform/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k2.6-in-fireworks': {
		Nombre: 'kimi-k2.6-in-fireworks', Proveedor: 'fireworks', Modelo: 'accounts/fireworks/models/kimi-k2p6', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'thinking-type', MapeoRazonamiento: ['none', 'enabled'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.16, EntradaNoCaché: 0.95, SalidaRazonamiento: 4.00, SalidaNoRazonamiento: 4.00, // https://docs.fireworks.ai/serverless/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k2.6-in-deepinfra': {
		Nombre: 'kimi-k2.6-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'moonshotai/Kimi-K2.6', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'thinking-type', MapeoRazonamiento: ['none', 'enabled'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.15, EntradaNoCaché: 0.75, SalidaRazonamiento: 3.50, SalidaNoRazonamiento: 3.50, // https://deepinfra.com/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'llama-guard-3-8b-in-cloudflare': {
		Nombre: 'llama-guard-3-8b-in-cloudflare', Proveedor: 'cloudflare', Modelo: '@cf/meta/llama-guard-3-8b',
		FormatoRespuestaCloudflare: 'CloudflareEstandar', NoSoportaHerramientas: true, SoportaFlujo: false, RangoTemperaturaSoportado: null,
		SoportaMensajeSistema: false, RazonamientoConfigurable: false, MapeoRazonamiento: [],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: 'llama-guard-4-12b-in-deepinfra', RespaldoFinal: null,
		Precios: { EntradaCaché: 0.484, EntradaNoCaché: 0.484, SalidaRazonamiento: 0.03, SalidaNoRazonamiento: 0.03, // https://developers.cloudflare.com/workers-ai/platform/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'llama-guard-4-12b-in-deepinfra': {
		Nombre: 'llama-guard-4-12b-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'meta-llama/Llama-Guard-4-12B',
		RangoTemperaturaSoportado: null,
		NoSoportaHerramientas: true, SoportaFlujo: true,
		SoportaMensajeSistema: false, RazonamientoConfigurable: false, MapeoRazonamiento: [],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: 'llama-guard-3-8b-in-cloudflare', RespaldoFinal: null,
		Precios: { EntradaCaché: 0.18, EntradaNoCaché: 0.18, SalidaRazonamiento: 0.18, SalidaNoRazonamiento: 0.18, // https://deepinfra.com/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-in-parasail': {
		Nombre: 'deepseek-v4-flash-in-parasail', Proveedor: 'parasail', Modelo: 'deepseek-ai/DeepSeek-V4-Flash', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'parasail-deepseek', MapeoRazonamiento: ['none', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.07, EntradaNoCaché: 0.14, SalidaRazonamiento: 0.28, SalidaNoRazonamiento: 0.28, // https://www.saas.parasail.io/pricing
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-in-deepseek': {
		Nombre: 'deepseek-v4-flash-in-deepseek', Proveedor: 'deepseek', Modelo: 'deepseek-v4-flash', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'deepseek-native', MapeoRazonamiento: ['none', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.028, EntradaNoCaché: 0.14, SalidaRazonamiento: 0.28, SalidaNoRazonamiento: 0.28, // https://api-docs.deepseek.com/quick_start/pricing o https://api-docs.deepseek.com/news/news260424. No se considera el descuento excepcional de DeepSeek para la caché.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-in-novita': {
		Nombre: 'deepseek-v4-flash-in-novita', Proveedor: 'novita', Modelo: 'deepseek/deepseek-v4-flash', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'openai-effort', MapeoRazonamiento: ['none', 'low', 'high'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.028, EntradaNoCaché: 0.14, SalidaRazonamiento: 0.28, SalidaNoRazonamiento: 0.28, // https://novita.ai/es/models.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-in-deepinfra': {
		Nombre: 'deepseek-v4-flash-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'deepseek-ai/DeepSeek-V4-Flash', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'medium', 'high'], // DeepInfra documenta reasoning_effort con valores none, low, medium y high: https://docs.deepinfra.com/chat/reasoning
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.02, EntradaNoCaché: 0.10, SalidaRazonamiento: 0.2, SalidaNoRazonamiento: 0.2, // https://deepinfra.com/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4.1-flash-in-deepinfra': {
		Nombre: 'deepseek-v4.1-flash-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'deepseek-ai/DeepSeek-V4.1-Flash', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'medium', 'high'], // DeepInfra documenta reasoning_effort con valores none, low, medium y high: https://docs.deepinfra.com/chat/reasoning
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.006, EntradaNoCaché: 0.30, SalidaRazonamiento: 1.20, SalidaNoRazonamiento: 1.20, // https://deepinfra.com/deepseek-ai/DeepSeek-V4.1-Flash
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4.1-flash-in-novita': {
		Nombre: 'deepseek-v4.1-flash-in-novita', Proveedor: 'novita', Modelo: 'deepseek/deepseek-v4.1-flash', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'openai-effort', MapeoRazonamiento: ['none', 'low', 'high'], // Novita documenta los modos Non-think, Think y Think Max mediante reasoning.effort: https://blogs.novita.ai/es/deepseek-v4-flash-novita-ai/
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.006, EntradaNoCaché: 0.30, SalidaRazonamiento: 1.20, SalidaNoRazonamiento: 1.20, // https://novita.ai/models/model-detail/deepseek-deepseek-v4.1-flash?from=pricing
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4.1-flash-in-fireworks': {
		Nombre: 'deepseek-v4.1-flash-in-fireworks', Proveedor: 'fireworks', Modelo: 'accounts/fireworks/models/deepseek-v4p1-flash', SoportaFlujo: true,
		RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'medium', 'high', 'max'], // Fireworks documenta estos niveles para DeepSeek V4: https://docs.fireworks.ai/api-reference/post-chatcompletions
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.007, EntradaNoCaché: 0.22, SalidaRazonamiento: 0.66, SalidaNoRazonamiento: 0.66, // https://fireworks.ai/models/deepseek-ai/deepseek-v4p1-flash
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-0731-in-deepinfra': {
		Nombre: 'deepseek-v4-flash-0731-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'deepseek-ai/DeepSeek-V4-Flash-0731',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'high', 'max'], // El modelo expone low, high y max. DeepInfra también acepta none para desactivar el razonamiento: https://deepinfra.ai/deepseek-ai/DeepSeek-V4-Flash-0731 https://docs.deepinfra.com/chat/reasoning.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.016, EntradaNoCaché: 0.06, SalidaRazonamiento: 0.18, SalidaNoRazonamiento: 0.18, // https://deepinfra.ai/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-0731-in-novita': {
		Nombre: 'deepseek-v4-flash-0731-in-novita', Proveedor: 'novita', Modelo: 'deepseek/deepseek-v4-flash-0731',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'openai-effort', MapeoRazonamiento: ['none', 'low', 'high', 'max'], // El modelo expone low, high y max. openai-effort usa enable_thinking=false para none en Novita: https://novita.ai/models/model-detail/deepseek-deepseek-v4-flash-0731 https://novita.ai/docs/api-reference/model-apis-llm-create-chat-completion.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.028, EntradaNoCaché: 0.44, SalidaRazonamiento: 1.32, SalidaNoRazonamiento: 1.32, // https://novita.ai/models/model-detail/deepseek-deepseek-v4-flash-0731.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-0731-in-fireworks': {
		Nombre: 'deepseek-v4-flash-0731-in-fireworks', Proveedor: 'fireworks', Modelo: 'accounts/fireworks/models/deepseek-v4-flash-0731',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'high', 'max'], // Fireworks documenta para DeepSeek V4 none, low, medium, high, xhigh y max. Se usan los niveles nativos publicados por DeepSeek: https://docs.fireworks.ai/api-reference/post-chatcompletions.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.007, EntradaNoCaché: 0.22, SalidaRazonamiento: 0.66, SalidaNoRazonamiento: 0.66, // https://fireworks.ai/models/deepseek-ai/deepseek-v4-flash-0731.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-0731-in-inceptron': {
		Nombre: 'deepseek-v4-flash-0731-in-inceptron', Proveedor: 'inceptron', Modelo: 'deepseek-ai/DeepSeek-V4-Flash-0731',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'high', 'max'], // DeepSeek publica estos tres niveles para V4 Flash 0731: https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.03, EntradaNoCaché: 0.13, SalidaRazonamiento: 0.28, SalidaNoRazonamiento: 0.28, // https://www.inceptron.io/models.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-0731-in-parasail': {
		Nombre: 'deepseek-v4-flash-0731-in-parasail', Proveedor: 'parasail', Modelo: 'deepseek-ai/DeepSeek-V4-Flash-0731',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'parasail-deepseek', MapeoRazonamiento: ['none', 'high', 'max'], // Se conserva el contrato Parasail DeepSeek existente y se limita a los niveles que su ruta publica para este modelo: https://www.parasail.io/models/deepseek-v4-flash https://endpoints.run/models/parasail-deepseek-v4-flash-0731.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.07, EntradaNoCaché: 0.14, SalidaRazonamiento: 0.28, SalidaNoRazonamiento: 0.28, // https://www.parasail.io/models/deepseek-v4-flash.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-0731-in-cloudflare': {
		Nombre: 'deepseek-v4-flash-0731-in-cloudflare', Proveedor: 'cloudflare', Modelo: '@cf/deepseek-ai/deepseek-v4-flash-0731',
		FormatoRespuestaCloudflare: 'OpenAIChat', SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'medium', 'high'], // Workers AI restringe reasoning_effort a low, medium y high: https://developers.cloudflare.com/workers-ai/models/deepseek-v4-flash-0731/.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.014, EntradaNoCaché: 0.44, SalidaRazonamiento: 1.32, SalidaNoRazonamiento: 1.32, // https://developers.cloudflare.com/workers-ai/models/deepseek-v4-flash-0731/.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-flash-0731-in-together': {
		Nombre: 'deepseek-v4-flash-0731-in-together', Proveedor: 'together', Modelo: 'deepseek-ai/DeepSeek-V4-Flash-0731',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'high', 'max'], // Together publica únicamente low, high y max para este modelo: https://www.together.ai/models/deepseek-v4-flash-0731.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.03, EntradaNoCaché: 0.14, SalidaRazonamiento: 0.28, SalidaNoRazonamiento: 0.28, // https://www.together.ai/models/deepseek-v4-flash-0731.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-0813-in-deepinfra': {
		Nombre: 'deepseek-v4-pro-0813-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'deepseek-ai/DeepSeek-V4-Pro-0813',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'high', 'max'], // El modelo publica low, high y max. DeepInfra admite none para desactivar el razonamiento: https://deepinfra.ai/deepseek-ai/DeepSeek-V4-Pro-0813 https://docs.deepinfra.com/chat/reasoning.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.10, EntradaNoCaché: 1.30, SalidaRazonamiento: 2.60, SalidaNoRazonamiento: 2.60, // https://deepinfra.ai/deepseek-ai/DeepSeek-V4-Pro-0813.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-0813-in-novita': {
		Nombre: 'deepseek-v4-pro-0813-in-novita', Proveedor: 'novita', Modelo: 'deepseek/deepseek-v4-pro-0813',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'openai-effort', MapeoRazonamiento: ['none', 'low', 'high', 'max'], // La ficha de Novita publica razonamiento y el endpoint compatible con OpenAI: https://novita.ai/models/model-detail/deepseek-deepseek-v4-pro-0813.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.132, EntradaNoCaché: 1.32, SalidaRazonamiento: 3.96, SalidaNoRazonamiento: 3.96, // https://novita.ai/models/model-detail/deepseek-deepseek-v4-pro-0813.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-0813-in-fireworks': {
		Nombre: 'deepseek-v4-pro-0813-in-fireworks', Proveedor: 'fireworks', Modelo: 'accounts/fireworks/models/deepseek-v4-pro-0813',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'high', 'max'], // Se conservan los niveles nativos publicados por DeepSeek V4: https://fireworks.ai/models/deepseek-ai/deepseek-v4-pro-0813.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.044, EntradaNoCaché: 1.32, SalidaRazonamiento: 3.96, SalidaNoRazonamiento: 3.96, // https://fireworks.ai/models/deepseek-ai/deepseek-v4-pro-0813.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-0813-in-parasail': {
		Nombre: 'deepseek-v4-pro-0813-in-parasail', Proveedor: 'parasail', Modelo: 'deepseek-ai/DeepSeek-V4-Pro-0813',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'parasail-deepseek', MapeoRazonamiento: ['none', 'high', 'max'], // Se conserva el contrato Parasail DeepSeek que ya usa el conector V4 Pro: https://docs.parasail.io/parasail-docs/serverless-and-models/model-specific-parameters.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.10, EntradaNoCaché: 1.32, SalidaRazonamiento: 3.96, SalidaNoRazonamiento: 3.96, // https://docs.parasail.io/parasail-docs/billing/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-0813-in-cloudflare': {
		Nombre: 'deepseek-v4-pro-0813-in-cloudflare', Proveedor: 'cloudflare', Modelo: '@cf/deepseek-ai/deepseek-v4-pro-0813',
		FormatoRespuestaCloudflare: 'OpenAIChat', SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'medium', 'high'], // Workers AI documenta reasoning_effort con low, medium y high y respuesta compatible con OpenAI Chat: https://developers.cloudflare.com/ai/models/%40cf/deepseek-ai/deepseek-v4-pro-0813/.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.044, EntradaNoCaché: 1.32, SalidaRazonamiento: 3.96, SalidaNoRazonamiento: 3.96, // https://developers.cloudflare.com/ai/models/%40cf/deepseek-ai/deepseek-v4-pro-0813/.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-0813-in-together': {
		Nombre: 'deepseek-v4-pro-0813-in-together', Proveedor: 'together', Modelo: 'deepseek-ai/DeepSeek-V4-Pro-0813',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'high', 'max'], // Together publica low, high y max y recomienda reasoning_effort: https://www.together.ai/models/deepseek-v4-pro-0813.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.13, EntradaNoCaché: 1.32, SalidaRazonamiento: 3.96, SalidaNoRazonamiento: 3.96, // https://www.together.ai/models/deepseek-v4-pro-0813.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-flash-in-deepinfra': {
		Nombre: 'glm-5.3-flash-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'zai-org/GLM-5.3-Flash',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // GLM-5.3-Flash expone low, high y max: https://huggingface.co/zai-org/GLM-5.3-Flash.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.03, EntradaNoCaché: 0.15, SalidaRazonamiento: 0.50, SalidaNoRazonamiento: 0.50, // https://deepinfra.com/zai-org/GLM-5.3-Flash.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-flash-in-novita': {
		Nombre: 'glm-5.3-flash-in-novita', Proveedor: 'novita', Modelo: 'zai-org/glm-5.3-flash',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // Novita ofrece el modelo con los tres niveles de razonamiento de GLM: https://huggingface.co/zai-org/GLM-5.3-Flash.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.03, EntradaNoCaché: 0.15, SalidaRazonamiento: 0.50, SalidaNoRazonamiento: 0.50, // https://novita.ai/models/model-detail/zai-org-glm-5.3-flash.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-flash-in-fireworks': {
		Nombre: 'glm-5.3-flash-in-fireworks', Proveedor: 'fireworks', Modelo: 'accounts/fireworks/models/glm-5p3-flash',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // Fireworks publica GLM-5.3-Flash con razonamiento configurable: https://fireworks.ai/models/fireworks/glm-5p3-flash.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.03, EntradaNoCaché: 0.15, SalidaRazonamiento: 0.50, SalidaNoRazonamiento: 0.50, // https://fireworks.ai/models/fireworks/glm-5p3-flash.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-flash-in-parasail': {
		Nombre: 'glm-5.3-flash-in-parasail', Proveedor: 'parasail', Modelo: 'zai-org/GLM-5.3-Flash',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // Parasail lo sirve mediante un endpoint compatible con OpenAI: https://www.parasail.io/models/glm-53-flash.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.03, EntradaNoCaché: 0.15, SalidaRazonamiento: 0.50, SalidaNoRazonamiento: 0.50, // https://www.parasail.io/models/glm-53-flash.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-flash-in-cloudflare': {
		Nombre: 'glm-5.3-flash-in-cloudflare', Proveedor: 'cloudflare', Modelo: '@cf/zai-org/glm-5.3-flash',
		FormatoRespuestaCloudflare: 'OpenAIChat', SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'medium', 'high'], // Workers AI documenta reasoning_effort con low, medium y high: https://developers.cloudflare.com/workers-ai/models/glm-5.3-flash/.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.03, EntradaNoCaché: 0.15, SalidaRazonamiento: 0.50, SalidaNoRazonamiento: 0.50, // https://developers.cloudflare.com/workers-ai/models/glm-5.3-flash/.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-flash-in-together': {
		Nombre: 'glm-5.3-flash-in-together', Proveedor: 'together', Modelo: 'zai-org/GLM-5.3-Flash',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // Together publica low, high y max para este modelo: https://www.together.ai/models/glm-5-3-flash.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.03, EntradaNoCaché: 0.15, SalidaRazonamiento: 0.50, SalidaNoRazonamiento: 0.50, // https://www.together.ai/models/glm-5-3-flash.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-in-deepinfra': {
		Nombre: 'glm-5.3-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'zai-org/GLM-5.3',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // GLM-5.3 acepta low, high y max. Max es el valor predeterminado: https://deepinfra.com/zai-org/GLM-5.3 https://huggingface.co/zai-org/GLM-5.3.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.12, EntradaNoCaché: 1.20, SalidaRazonamiento: 4.00, SalidaNoRazonamiento: 4.00, // https://deepinfra.com/zai-org/GLM-5.3.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-in-novita': {
		Nombre: 'glm-5.3-in-novita', Proveedor: 'novita', Modelo: 'zai-org/glm-5.3',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // GLM-5.3 publica low, high y max. Novita confirma el modelo y su razonamiento: https://novita.ai/models/model-detail/zai-org-glm-5.3 https://huggingface.co/zai-org/GLM-5.3.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.26, EntradaNoCaché: 1.40, SalidaRazonamiento: 4.40, SalidaNoRazonamiento: 4.40, // https://novita.ai/models/model-detail/zai-org-glm-5.3.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-in-fireworks': {
		Nombre: 'glm-5.3-in-fireworks', Proveedor: 'fireworks', Modelo: 'accounts/fireworks/models/glm-5p3',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // GLM-5.3 acepta low, high y max. Fireworks publica el modelo serverless: https://fireworks.ai/models/fireworks/glm-5p3 https://huggingface.co/zai-org/GLM-5.3.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.26, EntradaNoCaché: 1.40, SalidaRazonamiento: 4.40, SalidaNoRazonamiento: 4.40, // https://fireworks.ai/models/fireworks/glm-5p3.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-in-parasail': {
		Nombre: 'glm-5.3-in-parasail', Proveedor: 'parasail', Modelo: 'zai-org/GLM-5.3',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // Parasail publica reasoning_effort con low, high y max: https://www.parasail.io/models/glm-53.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.26, EntradaNoCaché: 1.40, SalidaRazonamiento: 4.40, SalidaNoRazonamiento: 4.40, // https://www.parasail.io/models/glm-53.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-in-cloudflare': {
		Nombre: 'glm-5.3-in-cloudflare', Proveedor: 'cloudflare', Modelo: '@cf/zai-org/glm-5.3',
		FormatoRespuestaCloudflare: 'OpenAIChat', SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'medium', 'high'], // Workers AI publica reasoning_effort con low, medium y high: https://developers.cloudflare.com/workers-ai/models/glm-5.3/.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.26, EntradaNoCaché: 1.40, SalidaRazonamiento: 4.40, SalidaNoRazonamiento: 4.40, // https://developers.cloudflare.com/workers-ai/models/glm-5.3/.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-in-together': {
		Nombre: 'glm-5.3-in-together', Proveedor: 'together', Modelo: 'zai-org/GLM-5.3',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // Together publica GLM-5.3 con low, high y max: https://www.together.ai/models/glm-5-3.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.26, EntradaNoCaché: 1.40, SalidaRazonamiento: 4.40, SalidaNoRazonamiento: 4.40, // https://www.together.ai/models/glm-5-3.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'glm-5.3-in-inceptron': {
		Nombre: 'glm-5.3-in-inceptron', Proveedor: 'inceptron', Modelo: 'zai-org/GLM-5.3',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'], // GLM-5.3 requiere razonamiento y publica low, high y max: https://www.inceptron.io/models https://huggingface.co/zai-org/GLM-5.3.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.26, EntradaNoCaché: 1.40, SalidaRazonamiento: 4.40, SalidaNoRazonamiento: 4.40, // https://www.inceptron.io/models.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k3-in-deepinfra': {
		Nombre: 'kimi-k3-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'moonshotai/Kimi-K3',
		SoportaFlujo: true, RangoTemperaturaSoportado: null,
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.285, EntradaNoCaché: 2.85, SalidaRazonamiento: 14.25, SalidaNoRazonamiento: 14.25, // https://deepinfra.com/moonshotai/Kimi-K3.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k3-in-novita': {
		Nombre: 'kimi-k3-in-novita', Proveedor: 'novita', Modelo: 'moonshotai/kimi-k3',
		SoportaFlujo: true, RangoTemperaturaSoportado: null,
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.30, EntradaNoCaché: 3.00, SalidaRazonamiento: 15.00, SalidaNoRazonamiento: 15.00, // https://novita.ai/models-console/model-detail/moonshotai-kimi-k3.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k3-in-fireworks': {
		Nombre: 'kimi-k3-in-fireworks', Proveedor: 'fireworks', Modelo: 'accounts/fireworks/models/kimi-k3',
		SoportaFlujo: true, RangoTemperaturaSoportado: null,
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.30, EntradaNoCaché: 3.00, SalidaRazonamiento: 15.00, SalidaNoRazonamiento: 15.00, // https://fireworks.ai/models/fireworks/kimi-k3.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k3-in-parasail': {
		Nombre: 'kimi-k3-in-parasail', Proveedor: 'parasail', Modelo: 'parasail-kimi-k3',
		SoportaFlujo: true, RangoTemperaturaSoportado: null,
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.30, EntradaNoCaché: 3.00, SalidaRazonamiento: 15.00, SalidaNoRazonamiento: 15.00, // https://www.parasail.io/models/kimi-k3.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'kimi-k3-in-together': {
		Nombre: 'kimi-k3-in-together', Proveedor: 'together', Modelo: 'moonshotai/Kimi-K3',
		SoportaFlujo: true, RangoTemperaturaSoportado: null,
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.30, EntradaNoCaché: 3.00, SalidaRazonamiento: 15.00, SalidaNoRazonamiento: 15.00, // https://www.together.ai/models/kimi-k3 https://www.together.ai/blog/kimi-k3-guide.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-in-deepseek': {
		Nombre: 'deepseek-v4-pro-in-deepseek', Proveedor: 'deepseek', Modelo: 'deepseek-v4-pro',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'deepseek-native', MapeoRazonamiento: ['none', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.145, EntradaNoCaché: 1.74, SalidaRazonamiento: 3.48, SalidaNoRazonamiento: 3.48, // https://api-docs.deepseek.com/quick_start/pricing o https://api-docs.deepseek.com/news/news260424. No se considera el descuento excepcional de DeepSeek para la caché.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-in-fireworks': {
		Nombre: 'deepseek-v4-pro-in-fireworks', Proveedor: 'fireworks', Modelo: 'accounts/fireworks/models/deepseek-v4-pro',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.145, EntradaNoCaché: 1.74, SalidaRazonamiento: 3.48, SalidaNoRazonamiento: 3.48, // https://docs.fireworks.ai/serverless/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-in-parasail': {
		Nombre: 'deepseek-v4-pro-in-parasail', Proveedor: 'parasail', Modelo: 'deepseek-ai/DeepSeek-V4-Pro',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'parasail-deepseek', MapeoRazonamiento: ['none', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_completion_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.10, EntradaNoCaché: 1.74, SalidaRazonamiento: 3.48, SalidaNoRazonamiento: 3.48, // https://www.saas.parasail.io/pricing
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-in-novita': {
		Nombre: 'deepseek-v4-pro-in-novita', Proveedor: 'novita', Modelo: 'deepseek/deepseek-v4-pro',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'openai-effort', MapeoRazonamiento: ['none', 'high', 'max'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.135, EntradaNoCaché: 1.6, SalidaRazonamiento: 3.2, SalidaNoRazonamiento: 3.2, // https://novita.ai/es/models.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'deepseek-v4-pro-in-deepinfra': {
		Nombre: 'deepseek-v4-pro-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'deepseek-ai/DeepSeek-V4-Pro',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'medium', 'high'], // DeepInfra documenta reasoning_effort con valores none, low, medium y high: https://docs.deepinfra.com/chat/reasoning
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.10, EntradaNoCaché: 1.3, SalidaRazonamiento: 2.6, SalidaNoRazonamiento: 2.6, // https://deepinfra.com/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'qwen-3.7-max-in-novita': {
		Nombre: 'qwen-3.7-max-in-novita', Proveedor: 'novita', Modelo: 'qwen/qwen3.7-max',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'enable-thinking', MapeoRazonamiento: ['none', 'enabled'],
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.5, EntradaNoCaché: 2.5, SalidaRazonamiento: 7.5, SalidaNoRazonamiento: 7.5, // https://novita.ai/es/models. No se considera el descuento excepcional de Novita para Qwen 3.7 Max.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'qwen-3.7-max-in-deepinfra': {
		Nombre: 'qwen-3.7-max-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'Qwen/Qwen3.7-Max',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: false, MapeoRazonamiento: [], // En teoría debe soportar razonamiento, pero no se pudo conseguir la configuración que lo permitiera desactivar. Por defecto tiene razonamiento.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.5, EntradaNoCaché: 2.5, SalidaRazonamiento: 7.5, SalidaNoRazonamiento: 7.5, // https://deepinfra.com/pricing.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'qwen-3.8-max-in-deepinfra': {
		Nombre: 'qwen-3.8-max-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'Qwen/Qwen3.8-2.4T-A95B',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'medium', 'high'], // A95B requiere razonamiento. DeepInfra documenta reasoning_effort con low, medium y high para este mapeo: https://deepinfra.com/Qwen/Qwen3.8-2.4T-A95B https://docs.deepinfra.com/chat/reasoning.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.20, EntradaNoCaché: 2.00, SalidaRazonamiento: 6.00, SalidaNoRazonamiento: 6.00, // https://deepinfra.com/Qwen/Qwen3.8-2.4T-A95B.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'qwen-3.8-max-in-fireworks': {
		Nombre: 'qwen-3.8-max-in-fireworks', Proveedor: 'fireworks', Modelo: 'accounts/fireworks/models/qwen3p8-2p4t-a95b',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'medium', 'max'], // La API de Fireworks documenta reasoning_effort con low, medium, high y max. Qwen3.8-2.4T-A95B requiere razonamiento y publica low, medium y xhigh: https://docs.fireworks.ai/api-reference/post-chatcompletions https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.25, EntradaNoCaché: 2.00, SalidaRazonamiento: 6.00, SalidaNoRazonamiento: 6.00, // https://fireworks.ai/models/fireworks/qwen3p8-max.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'qwen-3.8-flash-in-novita': {
		Nombre: 'qwen-3.8-flash-in-novita', Proveedor: 'novita', Modelo: 'qwen/qwen3.8-flash',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'enable-thinking', MapeoRazonamiento: ['none', 'enabled'], // Novita documenta enable_thinking para Chat Completions y la ficha publica el razonamiento conmutable: https://novita.ai/models/model-detail/qwen-qwen3.8-flash https://novita.ai/docs/api-reference/model-apis-llm-create-chat-completion.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.016, EntradaNoCaché: 0.15, SalidaRazonamiento: 0.47, SalidaNoRazonamiento: 0.47, // https://novita.ai/models/model-detail/qwen-qwen3.8-flash.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'qwen-3.8-max-in-novita': {
		Nombre: 'qwen-3.8-max-in-novita', Proveedor: 'novita', Modelo: 'qwen/qwen3.8-max',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'enable-thinking', MapeoRazonamiento: ['none', 'enabled'], // Novita documenta enable_thinking para Chat Completions y la ficha publica el razonamiento conmutable: https://novita.ai/models/model-detail/qwen-qwen3.8-max https://novita.ai/docs/api-reference/model-apis-llm-create-chat-completion.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.25, EntradaNoCaché: 2.00, SalidaRazonamiento: 6.00, SalidaNoRazonamiento: 6.00, // https://novita.ai/models/model-detail/qwen-qwen3.8-max.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'qwen-3.8-max-in-together': {
		Nombre: 'qwen-3.8-max-in-together', Proveedor: 'together', Modelo: 'Qwen/Qwen3.8-2.4T-A95B',
		SoportaFlujo: true, RangoTemperaturaSoportado: [0, 2],
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['low', 'medium', 'xhigh'], // Together acepta para A95B los niveles low, medium y xhigh: https://www.together.ai/models/qwen3-8-max.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.25, EntradaNoCaché: 2.00, SalidaRazonamiento: 6.00, SalidaNoRazonamiento: 6.00, // https://www.together.ai/models/qwen3-8-max.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'mimo-v2.6-pro-in-deepinfra': {
		Nombre: 'mimo-v2.6-pro-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'XiaomiMiMo/MiMo-V2.6-Pro',
		SoportaFlujo: true, RangoTemperaturaSoportado: null, // Xiaomi fija temperature=1.0 y top_p=0.95 cuando el razonamiento está activo, que es su modo predeterminado, y DeepInfra publica esos mismos valores como muestreo recomendado: https://mimo.mi.com/docs/en-US/quick-start/usage-guide/text-generation/deep-thinking https://deepinfra.com/XiaomiMiMo/MiMo-V2.6-Pro.
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'medium', 'high'], // DeepInfra documenta reasoning_effort con none, low, medium y high, y la API oficial de MiMo V2.6 acepta esos mismos niveles mientras xhigh y max devuelven 400: https://docs.deepinfra.com/chat/reasoning https://github.com/anomalyco/models.dev/pull/7680.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.004, EntradaNoCaché: 0.435, SalidaRazonamiento: 0.87, SalidaNoRazonamiento: 0.87, // https://deepinfra.com/XiaomiMiMo/MiMo-V2.6-Pro.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	},
	'mimo-v2.6-flash-in-deepinfra': {
		Nombre: 'mimo-v2.6-flash-in-deepinfra', Proveedor: 'deepinfra', Modelo: 'XiaomiMiMo/MiMo-V2.6-Flash',
		SoportaFlujo: true, RangoTemperaturaSoportado: null, // Xiaomi fija temperature=1.0 y top_p=0.95 cuando el razonamiento está activo, que es su modo predeterminado, y DeepInfra publica esos mismos valores como muestreo recomendado: https://mimo.mi.com/docs/en-US/quick-start/usage-guide/text-generation/deep-thinking https://deepinfra.com/XiaomiMiMo/MiMo-V2.6-Flash.
		RazonamientoConfigurable: true, EstiloRazonamiento: 'reasoning-effort', MapeoRazonamiento: ['none', 'low', 'medium', 'high'], // DeepInfra documenta reasoning_effort con none, low, medium y high, y la API oficial de MiMo V2.6 acepta esos mismos niveles mientras xhigh y max devuelven 400: https://docs.deepinfra.com/chat/reasoning https://github.com/anomalyco/models.dev/pull/7680.
		VerbosidadConfigurable: false, MapeoVerbosidad: [], NombreParámetroMáximosTokenes: 'max_tokens',
		Respaldo: null, RespaldoFinal: null,
		Precios: { EntradaCaché: 0.003, EntradaNoCaché: 0.14, SalidaRazonamiento: 0.28, SalidaNoRazonamiento: 0.28, // https://deepinfra.com/XiaomiMiMo/MiMo-V2.6-Flash.
			EscrituraCachéCortaDuración: 0, EscrituraCachéLargaDuración: 0, AlmacenamientoCachéPorHora: 0 },
	}
};


export const ModelosIAEspecíficos: Record<string, { conector: string; }> = { // Nombres técnicos simplificados del modelo (sin sufijo -preview como hace Google ni variantes de proveedor como las de Kimi WaferAI de Parasail). En el caso de LlamaGuard se trata como un modelo único sin versiones. Cada clave apunta al conector preferido actualmente para ese modelo. Esto permite pasar el nombre del modelo sin conocer el proveedor preferido, manteniendo toda la flexibilidad de la cadena de resolución: nombre específico → conector → ConectoresIA.
	'gpt-6-astra': { conector: 'gpt-6-astra-in-openai' },
	'gpt-6-sol': { conector: 'gpt-6-sol-in-openai' },
	'gpt-6-luna': { conector: 'gpt-6-luna-in-openai' },
	'gpt-6-luna-fast': { conector: 'gpt-6-luna-fast-in-openai' }, // Igual que gpt-5.6-luna-fast: se maneja como una opción independiente, aunque OpenAI la sirve con el modelo base gpt-6-luna y la configuración Fast.
	'gpt-5.6-sol': { conector: 'gpt-5.6-sol-in-openai' },
	'gpt-5.6-terra': { conector: 'gpt-5.6-terra-in-openai' },
	'gpt-5.6-luna': { conector: 'gpt-5.6-luna-in-openai' },
	'gpt-5.6-luna-fast': { conector: 'gpt-5.6-luna-fast-in-openai' }, // Se maneja como una opción independiente, aunque OpenAI la sirve con el modelo base gpt-5.6-luna y la configuración Fast.
	'gpt-5.5': { conector: 'gpt-5.5-in-openai' },
	'gpt-5.4': { conector: 'gpt-5.4-in-openai' },
	'gpt-5.4-mini': { conector: 'gpt-5.4-mini-in-openai' },
	'gpt-5.4-nano': { conector: 'gpt-5.4-nano-in-openai' },
	'omni-moderation-latest': { conector: 'omni-moderation-latest-in-openai' },
	'gemini-3.1-pro': { conector: 'gemini-3.1-pro-in-google' },
	'gemini-3.7-flash': { conector: 'gemini-3.7-flash-in-google' },
	'gemini-3.8-flash': { conector: 'gemini-3.8-flash-in-google' },
	'gemini-3-flash': { conector: 'gemini-3-flash-in-google' },
	'gemini-3.1-flash-lite': { conector: 'gemini-3.1-flash-lite-in-google' },
	'gemini-3.5-flash-lite': { conector: 'gemini-3.5-flash-lite-in-google' },
	'kimi-k2.6': { conector: 'kimi-k2.6-in-parasail' },
	'kimi-k3': { conector: 'kimi-k3-in-parasail' },
	'deepseek-v4-flash': { conector: 'deepseek-v4-flash-in-parasail' },
	'deepseek-v4.1-flash': { conector: 'deepseek-v4.1-flash-in-fireworks' },
	'deepseek-v4-flash-0731': { conector: 'deepseek-v4-flash-0731-in-parasail' },
	'deepseek-v4-pro': { conector: 'deepseek-v4-pro-in-parasail' },
	'deepseek-v4-pro-0813': { conector: 'deepseek-v4-pro-0813-in-parasail' },
	'glm-5.3-flash': { conector: 'glm-5.3-flash-in-parasail' },
	'glm-5.3': { conector: 'glm-5.3-in-parasail' },
	'qwen-3.7-max': { conector: 'qwen-3.7-max-in-novita' },
	'qwen-3.8-flash': { conector: 'qwen-3.8-flash-in-novita' },
	'qwen-3.8-max': { conector: 'qwen-3.8-max-in-novita' },
	'mimo-v2.6-pro': { conector: 'mimo-v2.6-pro-in-deepinfra' },
	'mimo-v2.6-flash': { conector: 'mimo-v2.6-flash-in-deepinfra' },
	'llama-guard': { conector: 'llama-guard-4-12b-in-deepinfra' }, // Se manejan todas las posibles versiones con el mismo ModeloIAEspecífico por simplicidad.
};


export const ProveedoresTextoAVoz: Record<string, ProveedorTextoAVoz> = {
	cloudflare: {
		Nombre: 'Cloudflare',
		Clave: '',
		Url: 'cloudflare://workers-ai',
		Formato: 'Cloudflare Workers AI'
	},
	google: {
		Nombre: 'Google',
		Clave: 'CLAVE_GOOGLE',
		Url: 'https://generativelanguage.googleapis.com/v1beta',
		Formato: 'Google Gemini Interactions'
	},
	google_tts_flash_lite: {
		Nombre: 'Google TTS Flash Lite',
		Clave: '',
		Url: 'https://texttospeech.googleapis.com/v1/text:synthesize',
		Formato: 'Google Cloud TTS'
	},
	together: {
		Nombre: 'Together',
		Clave: 'CLAVE_TOGETHER',
		Url: 'https://api.together.xyz/v1',
		Formato: 'Together Speech'
	},
	deepinfra: {
		Nombre: 'DeepInfra',
		Clave: 'CLAVE_DEEPINFRA',
		Url: 'https://api.deepinfra.com/v1',
		Formato: 'DeepInfra Inference'
	}
};


export const ConectoresTextoAVoz: Record<string, ConectorTextoAVoz> = {
	'melotts-in-cloudflare': {
		Nombre: 'melotts-in-cloudflare',
		Proveedor: 'cloudflare',
		Modelo: '@cf/myshell-ai/melotts',
		TipoContenido: 'audio/mpeg',
		ExtensiónArchivo: 'mp3',
		GrupoVoces: 'ninguno',
		Precios: { MinutoAudio: 0.0002, MillónTókenesTextoEntrada: 0, MillónCarácteresAudio: 0 }, // https://developers.cloudflare.com/workers-ai/models/melotts.
	},
	'gemini-2.5-flash-lite-preview-tts-in-google-cloud': { // Los conectores gemini-3.1-flash-tts-in-google-ai-studio y gemini-2.5-flash-tts-in-google-ai-studio se deshabilitaron porque generan archivos WAV que son más inconvenientes de usar que los MP3 que genera Google Cloud. Su configuración está en el historial de Web Core, en la confirmación 7169683.
		Nombre: 'gemini-2.5-flash-lite-preview-tts-in-google-cloud',
		Proveedor: 'google_tts_flash_lite',
		Modelo: 'gemini-2.5-flash-lite-preview-tts',
		TipoContenido: 'audio/mpeg',
		ExtensiónArchivo: 'mp3',
		GrupoVoces: 'gemini',
		Precios: { MinutoAudio: 0.015, MillónTókenesTextoEntrada: 0.50, MillónCarácteresAudio: 0 }, // https://cloud.google.com/text-to-speech/pricing.
	},
	'gemini-2.5-flash-tts-in-google-cloud': {
		Nombre: 'gemini-2.5-flash-tts-in-google-cloud',
		Proveedor: 'google_tts_flash_lite',
		Modelo: 'gemini-2.5-flash-tts',
		TipoContenido: 'audio/mpeg',
		ExtensiónArchivo: 'mp3',
		GrupoVoces: 'gemini',
		Precios: { MinutoAudio: 0.015, MillónTókenesTextoEntrada: 0.50, MillónCarácteresAudio: 0 }, // https://cloud.google.com/text-to-speech/pricing.
	},
	'gemini-3.1-flash-tts-in-google-cloud': {
		Nombre: 'gemini-3.1-flash-tts-in-google-cloud',
		Proveedor: 'google_tts_flash_lite',
		Modelo: 'gemini-3.1-flash-tts-preview',
		TipoContenido: 'audio/mpeg',
		ExtensiónArchivo: 'mp3',
		GrupoVoces: 'gemini',
		Precios: { MinutoAudio: 0.03, MillónTókenesTextoEntrada: 1.00, MillónCarácteresAudio: 0 }, // https://cloud.google.com/text-to-speech/pricing 20 USD/1M tokenes audio. 1 segundo tiene 25 tókenes de audio > 1500 tókenes por minuto > 20 USD/1MTKA = 0,00002 USD/token audio * 1500 token audio/minuto = 0,03 USD/minuto.
	},
	'kokoro-82m-in-deepinfra': {
		Nombre: 'kokoro-82m-in-deepinfra',
		Proveedor: 'deepinfra',
		Modelo: 'hexgrad/Kokoro-82M',
		TipoContenido: 'audio/mpeg',
		ExtensiónArchivo: 'mp3',
		GrupoVoces: 'kokoro',
		Precios: { MinutoAudio: 0, MillónTókenesTextoEntrada: 0, MillónCarácteresAudio: 0.62 },
	},
	'kokoro-82m-in-together': {
		Nombre: 'kokoro-82m-in-together',
		Proveedor: 'together',
		Modelo: 'hexgrad/Kokoro-82M',
		TipoContenido: 'audio/mpeg',
		ExtensiónArchivo: 'mp3',
		GrupoVoces: 'kokoro',
		Precios: { MinutoAudio: 0, MillónTókenesTextoEntrada: 0, MillónCarácteresAudio: 4.00 },
	},
};

export const VocesGeminiTextoAVoz = [
	'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
	'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
	'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
	'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'
] as const;

export const VocesKokoroTextoAVoz = [
	'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova',
	'af_river', 'af_sarah', 'af_sky', 'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam',
	'am_michael', 'am_onyx', 'am_puck', 'am_santa', 'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
	'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis', 'jf_alpha', 'jf_gongitsune', 'jf_nezumi',
	'jf_tebukuro', 'jm_kumo', 'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi', 'zm_yunjian',
	'zm_yunxi', 'zm_yunxia', 'zm_yunyang', 'ef_dora', 'em_alex', 'em_santa', 'ff_siwis', 'hf_alpha',
	'hf_beta', 'hm_omega', 'hm_psi', 'if_sara', 'im_nicola', 'pf_dora', 'pm_alex', 'pm_santa'
] as const;

export const ProveedoresBúsquedaWeb = {
	OpenAI: { CostoPorSolicitudDólares: 0.01 },
	Parallel: { CostoPorSolicitudDólares: 0.001 }, // Search API en modo fast con 10 resultados: $1 por 1.000 solicitudes. https://docs.parallel.ai/getting-started/pricing
} as const;

export type ProveedorBúsquedaWeb = keyof typeof ProveedoresBúsquedaWeb;
