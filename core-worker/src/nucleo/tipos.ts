/** Principalmente tipos que generan conflictos de ciclo nucleo/global.ts > configuracion.ts > nucleo/global.ts. Los que no generen estos problemas pueden ir en nucleo/global.ts. */

export type FormatoProveedorIA = 'OpenAI Chat' | 'OpenAI Responses' | 'OpenAI Moderations' | 'Gemini' | 'Cloudflare' | 'Anthropic'; // 'OpenAI Chat' = Chat Completions clásico (/v1/chat/completions), usado por OpenAI legacy y por proveedores compatibles (DeepSeek, Parasail, Novita). 'OpenAI Responses' = nueva Responses API moderna (/v1/responses) con razonamiento y verbosidad nativos, usada por GPT-5+. 'OpenAI Moderations' = endpoint /v1/moderations para clasificadores de seguridad.

export type FormatoRespuestaCloudflare = 'OpenAIChat' | 'CloudflareEstandar' | 'OpenAIResponses'; // Contrato de respuesta del modelo dentro de Workers AI.

export type EstiloRazonamiento =
	| 'openai-effort' // Chat Completions con reasoning: { effort: valor }. Se omite si el valor es 'none'. Ej: Novita DeepSeek.
	| 'thinking-type' // Chat Completions con thinking: { type: 'enabled'|'disabled' }. Ej: Novita/Fireworks/Inceptron/Deepinfra Kimi.
	| 'deepseek-native' // API nativa DeepSeek: thinking: { type } + reasoning_effort escalar. Ej: proveedor Deepseek.
	| 'reasoning-effort' // Chat Completions con reasoning_effort escalar. Se omite si el valor es 'none'. Ej: Fireworks/Deepinfra DeepSeek.
	| 'parasail-deepseek' // Parasail DeepSeek: chat_template_kwargs: { thinking: true, reasoning_effort: valor }. Se omite si 'none'.
	| 'parasail-kimi' // Parasail/Cloudflare Kimi: chat_template_kwargs: { thinking: bool }.
	| 'enable-thinking'; // Qwen.

export type ModoEspecialOpenAI = 'Fast' | 'Pro' | 'Fast Pro';

export interface TarifaContextoLargoIA {
	MultiplicadorEntrada: number;
	MultiplicadorSalida: number;
}

export enum ServicioCorreo { ZeptoMail = 'ZeptoMail', CloudflareEmail = 'CloudflareEmail' }

export type Idioma = 'en' | 'es';

export interface ProveedorIA {
	Clave: string;
	Url: string;
	Formato: FormatoProveedorIA;
	MáximosTókenesSalidaTípicos?: number; // Límite técnico típico de tókenes de salida que el proveedor acepta para cada solicitud generativa.
}

export interface ConectorIA {
	Nombre: string; // Alias legible del conector, coincide con la clave de ConectoresIA en configuracion.ts.
	Proveedor: string;
	Modelo: string;
	FormatoRespuestaCloudflare?: FormatoRespuestaCloudflare; // Obligatorio para conectores cuyo proveedor usa el formato Cloudflare. Omitido para los demás proveedores.
	RangoTemperaturaSoportado: readonly [mínimo: number, máximo: number] | null; // Rango inclusivo del campo temperature. null indica que el conector no admite temperatura personalizada. El valor 1 se omite del JSON como valor predeterminado común.
	NoSoportaHerramientas?: true; // Excepción para modelos que no permiten herramientas externas. Si se omite, el conector se considera compatible.
	MáximoTókenesEntradaTarifaEstándar?: number; // Máximo inclusivo de tókenes de entrada al que aplica Precios. Si se supera, TarifaContextoLargo transforma el uso facturable. La validación de configuración exige declarar ambos campos juntos.
	TarifaContextoLargo?: TarifaContextoLargoIA; // Multiplicadores aplicados a una copia interna del uso de cada solicitud que supere el máximo estándar. Los tókenes reales permanecen intactos.
	ModoEspecialOpenAI?: ModoEspecialOpenAI; // Perfil especial de OpenAI codificado por el pseudo-conector. Omitido conserva el comportamiento estándar.
	SoportaFlujo: boolean; // Si es falso, el orquestador (ia.ts) hace consulta directa y simula stream con señales-de-vida.
	SoportaMensajeSistema?: boolean; // Si es falso, el orquestador omite el mensaje de sistema al construir messages para conectores que solo aceptan user/assistant.
	RazonamientoConfigurable: boolean; // Si es verdadero, el orquestador envía el nivel de razonamiento al proveedor usando el campo nativo del formato (ej: reasoning.effort en Responses API, thinkingConfig en Gemini, reasoning_effort en Chat Completions).
	EstiloRazonamiento?: EstiloRazonamiento; // Declara cómo se serializa el razonamiento en el JSON del proveedor. Obligatorio cuando razonamientoConfigurable es verdadero y el formato es 'OpenAI Chat' o 'Cloudflare'. Omitir para 'OpenAI Responses' y 'Gemini' donde el formato fija el contrato.
	MapeoRazonamiento: readonly string[]; // Valores literales aceptados por la API en orden ascendente (ej: ['low','medium','high']). Vacío = no se envía el campo.
	VerbosidadConfigurable: boolean; // Si es verdadero, el proveedor acepta verbosidad nativa y el orquestador la envía en el campo propio del formato. Si es false, la verbosidad se inyecta como instrucción de texto en la instrucción de sistema.
	MapeoVerbosidad: readonly string[]; // Valores literales aceptados por la API en orden ascendente de verbosidad (ej: ['low','medium','high']). Vacío = no hay campo nativo y se cae al modo de inyección en texto.
	NombreParámetroMáximosTokenes?: string; // Nombre real del campo en el JSON de la API para limitar tókenes de salida (ej: 'max_completion_tokens', 'max_tokens', 'maxOutputTokens'). Opcional para endpoints clasificadores que no generan salida tokenizada.
	Respaldo: string | null; // Clave del conector de segundo intento cuando el principal falla. Sus propios respaldos se ignoran para evitar bucles.
	RespaldoFinal: string | null; // Clave del conector de tercer y último intento. También se ignoran sus propios respaldos.
	Precios: PreciosIA;
}

export interface PreciosIA { // USD por millón de tókenes.
	EntradaCaché: number;
	EntradaNoCaché: number;
	SalidaRazonamiento: number;
	SalidaNoRazonamiento: number;
	EscrituraCachéCortaDuración: number; // 5 minutos para Anthropic.
	EscrituraCachéLargaDuración: number; // 1 hora para Anthropic. 30 minutos para OpenAI.
	AlmacenamientoCachéPorHora: number; // Precio de almacenar un millón de tókenes durante 1 hora. Google lo cobra así.
}

export interface PreciosTextoAVoz {
	MinutoAudio: number;
	MillónTókenesTextoEntrada: number;
	MillónCarácteresAudio: number;
}

export type FormatoProveedorTextoAVoz = 'Cloudflare Workers AI' | 'Google Gemini Interactions' | 'Google Cloud TTS'
	| 'Together Speech' | 'DeepInfra Inference';

export type GrupoVocesTextoAVoz = 'ninguno' | 'gemini' | 'kokoro';

export interface ProveedorTextoAVoz {
	Nombre: string;
	Clave: string;
	Url: string;
	Formato: FormatoProveedorTextoAVoz;
}

export interface ConectorTextoAVoz {
	Nombre: string;
	Proveedor: string;
	Modelo: string;
	TipoContenido: 'audio/mpeg' | 'audio/wav';
	ExtensiónArchivo: 'mp3' | 'wav';
	GrupoVoces: GrupoVocesTextoAVoz;
	Precios: PreciosTextoAVoz;
}
