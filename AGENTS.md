# Proyecto basado en Web Core

Este repositorio usa una base de código, el núcleo (`src/nucleo`), para crear sitios y servicios web en Cloudflare Workers. El núcleo no es un paquete actualizable: cada proyecto copia su código, lo adapta y lo hace suyo.

## Estructura

- `src/nucleo`: Base de código reutilizable del sistema.
- `src/proyecto` o `src/[otro-nombre]`: Código propio del proyecto.
- `src/rutas.ts`: Registro principal de las rutas del proyecto.
- `src/nucleo/rutas`: Rutas base reutilizables.
- `src/proyecto/rutas` o `src/[otro-nombre]/rutas`: Rutas del proyecto. Las rutas nuevas se crean aquí.
- `static/html/marco.html`: Marco fijo y reutilizable del sitio.
- `static/css/global.css`: Archivo CSS global para los estilos compartidos.

## Reglas del backend

- Prioriza las soluciones simples, explícitas y fáciles de entender.

- No guardes secretos en el repositorio. Usa el `.dev.vars` local y los secretos de Wrangler.

- Si una ruta requiere un usuario autenticado, protégela con `ConAutenticación`.

- El primer parámetro de las funciones que necesitan el contexto debe ser `contexto: Contexto`.

- No crees `new Response()` directamente en las rutas. Usa las funciones Responder de `src/nucleo/respuestas.ts`: `Responder()`, `ResponderConFragmentos()`, `ResponderConMarco()`, `ResponderErrorConMarco()`, `ResponderRedirección()` y `ResponderMétodoNoPermitido()`.

- Usa siempre `src/nucleo/global.ts` > `Sanear()` al insertar variables dentro del HTML, y `SanearUrl()` para las variables dinámicas que van dentro de los atributos `href` o `src`.

- En lo posible, no modifiques `src/nucleo`. Si crees que debes hacerlo, pídele permiso al Director (el humano desarrollador) con muy buenos argumentos. El núcleo solo se puede modificar cuando el cambio es de verdad general y sirve también para otros proyectos.

- Excepción a la regla anterior: Si agregas una variable de entorno o un secreto nuevo, decláralo en `src/nucleo/global.ts` > `Entorno` y usa ese nombre desde allí.

- No agregues capas de compatibilidad, sistemas de complementos (plugins) ni abstracciones pensadas para mantener una API estable entre versiones de `src/nucleo`.

- No agregues dependencias, frameworks ni capas de abstracción si el problema se puede resolver directamente con el código que ya existe y TypeScript.

- Si una consulta a la IA lleva datos que envían los usuarios, usa las funciones protegidas de `src/nucleo/ia.ts`, que moderan esos datos antes de pasarlos al modelo. `ConsultaIAProtegida()` devuelve la respuesta lista para el cliente, y `ConsultaIAProtegidaDirecto()` devuelve el resultado interno, para cuando hay que registrar las infracciones. Una ruta solo puede usar las versiones sin moderación, `ConsultarIA()` y `ConsultarIADirecto()`, si explica en el código por qué.

- Las rutas deben seguir el patrón `export async function NombreRuta(contexto: Contexto): Promise<Response>`.

- No escribas cookies directamente en los encabezados dentro de las rutas. Acumúlalas en `contexto.CookiesRespuesta` o usa las funciones que ya existen en `src/nucleo/autenticacion.ts` o `src/nucleo/respuestas.ts`.

- Si agregas una ruta pública e indexable, agrégala a `src/rutas.ts` > `MapaSeo`. Si es interna, de prueba, con autenticación, de HTMX o no le aporta valor al SEO, agrégala a `RutasExcluidasDeSitemap`.

- Para las tareas no críticas que pueden correr después de responderle al usuario, usa `contexto.Ejecución.waitUntil()`.

- Para los registros estructurados de eventos, usa `src/nucleo/global.ts` > `RegistrarEventoConPrefijo()` en vez de registros sueltos.

- Si el proyecto usa una API o un servidor externo, revisa primero `src/nucleo/api.ts` y usa sus funciones antes de hacer un `fetch()` directo desde las rutas.

- Valida y normaliza en la frontera. Toda entrada externa debe revisarse apenas entra al módulo, y la lógica interna debe suponer que los datos ya son válidos.

## Reglas del frontend

- Cada ruta nueva que ve el usuario debe tener su propio archivo HTML auxiliar en `static/html`. No pongas el marcado de una página completa directamente en los archivos TypeScript de las rutas.

- Para las páginas normales, usa `ResponderConMarco()`, para que `static/html/marco.html` siga siendo el marco fijo del sitio. Normalmente, el archivo HTML auxiliar solo debe tener el contenido que se inserta en `#contenido`. Si una ruta de verdad necesita saltarse `marco.html` y devolver un documento HTML completo e independiente, pregúntale primero al Director y explícale por qué no basta el marco estándar.

- Al editar `marco.html`, no quites el enlace a `softwaredrones.com`, el `<header>`, el `<footer>`, el enlace `Entrar`, el selector de idioma ni la regla CSS del `<style>` que usa el selector de idioma. Adáptalos al diseño nuevo y quítalos solo si el Director lo pide explícitamente.

- Usa `static/css/global.css` solo para los estilos, las variables y las clases semánticas que se aplican a varias páginas o que definen la identidad visual compartida del sitio.

- Los colores, las fuentes, los pesos, los tamaños de letra, los interlineados, los redondeados, los grosores de los bordes, los espacios, las sombras de las cajas y la opacidad de los controles desactivados van con las variables de `static/css/global.css`, y no escritos a mano. Pueden quedarse con su valor propio las demás sombras, como las de un texto, las demás opacidades, los redondeados y los bordes de `0`, y los correos. Un tamaño de letra puede ir en `em` solo si debe ser proporcional a la letra del elemento que lo contiene, como un exponente, con `0.75em`. En los espacios valen además `0`, `auto`, un número más pequeño que `--espacio-3xs`, un ajuste fino de menos que eso sobre una sola variable, como `calc(var(--espacio-m) + 1px)`, una variable multiplicada por `-1` para un margen negativo, y `clamp`, `min` y `max` con la escala en sus extremos. El tema alternativo solo cambia colores: los tamaños, los espacios y los demás valores de la escala van iguales en los dos temas. Lo comprueba `npm run reglas`, con `Programas/reglas-diseno.mts`, y lo propio de cada proyecto, como una página excluida o su documento de marca, va en `Programas/reglas-diseno-proyecto.mts`. Un proyecto que no quiera esta regla la quita del script `reglas` del `package.json` del worker.
- Un texto por debajo de los límites de contraste de `pruebas/interfaz/contraste.interfaz.ts`, en cualquier página y en cualquiera de los dos temas, hace fallar el Verificador completo. Una ruta nueva que no muestre una página, o que haga algo al abrirla, se agrega a `RutasQueNoSonPáginas`, en ese archivo.

- Usa un bloque `<style>` dentro del archivo HTML auxiliar para los estilos que son solo de esa página o de ese componente.

- El JavaScript de una página va en `src-ui/`, como en `src-ui/global.ts`, y nunca en un `<script>` escrito dentro del HTML. En producción, la política de seguridad bloquea esos scripts, y en local no, así que el error solo aparecería al desplegar. Es la defensa contra el XSS, el ataque más común en la web. Las únicas excepciones son las páginas que se responden con `ResponderHtmlConNonce`, como las de prueba, que le dan a su script una clave al azar en cada respuesta, que un atacante no puede adivinar. Lo comprueba `npm run reglas`.

- Todo el texto que ve el usuario debe ir en los archivos `static/textos/xx.json` de los idiomas soportados, según `src/configuracion.ts` > `IdiomasSoportados`. En el HTML, usa claves entre llaves dobles, como `{{algun-texto}}`.

- Prefiere HTMX cuando haga falta actualizar partes de la página.

------------------------------------------------------------------------------------------	

# Cloudflare

**Importante:** Lo que sabes de las API y de los límites de Cloudflare puede estar desactualizado. Antes de cualquier tarea con Cloudflare, consulta siempre la documentación actual, con el MCP de abajo.

## Documentación

- **MCP de la documentación:** `https://docs.mcp.cloudflare.com/mcp`. Con él se encuentran la documentación actual de cada producto, en direcciones como `/kv/`, `/r2/`, `/d1/`, `/durable-objects/`, `/queues/`, `/vectorize/`, `/workers-ai/` y `/agents/`, sus errores, y sus límites y cuotas, en `/platform/limits/`, como `/workers/platform/limits/`. Antes de cada tarea con Cloudflare, revisa si te puedes conectar a este MCP. Si no puedes, instálalo tú, solo para el programa que estás usando, con `claude mcp add --transport http --scope user cloudflare-docs https://docs.mcp.cloudflare.com/mcp` en Claude o con `codex mcp add cloudflare-docs --url https://docs.mcp.cloudflare.com/mcp` en Codex, y avísale al Director.
- **Skills de Cloudflare:** `https://github.com/cloudflare/skills/tree/main/skills`. Antes de hacer algo nuevo con Cloudflare, lee en línea la skill del tema y síguela, sin instalarla, para que esté siempre al día. Si Cloudflare agrega una que no está en esta lista, búscala en el enlace.
  - **[agents-sdk](https://raw.githubusercontent.com/cloudflare/skills/main/skills/agents-sdk/SKILL.md):** Al construir agentes de IA con estado sobre Cloudflare, con el Agents SDK.
  - **[basin](https://raw.githubusercontent.com/cloudflare/skills/main/skills/basin/SKILL.md):** Para la analítica: llevar datos a tablas Iceberg en R2, manejar sus catálogos y consultarlas con SQL. Antes se llamaban Pipelines, R2 Data Catalog y R2 SQL.
  - **[cf-cli](https://raw.githubusercontent.com/cloudflare/skills/main/skills/cf-cli/SKILL.md):** Al usar el CLI `cf` de Cloudflare, o para elegir entre `cf` y Wrangler.
  - **[cloudflare](https://raw.githubusercontent.com/cloudflare/skills/main/skills/cloudflare/SKILL.md):** Cuando haya que elegir qué producto de Cloudflare usar para una necesidad nueva.
  - **[cloudflare-email-service](https://raw.githubusercontent.com/cloudflare/skills/main/skills/cloudflare-email-service/SKILL.md):** Al enviar o recibir correo con Cloudflare, con Email Sending y Email Routing.
  - **[cloudflare-one](https://raw.githubusercontent.com/cloudflare/skills/main/skills/cloudflare-one/SKILL.md):** Para la red y los accesos de una empresa con Zero Trust: Access, Gateway, WARP o Tunnel.
  - **[cloudflare-one-migrations](https://raw.githubusercontent.com/cloudflare/skills/main/skills/cloudflare-one-migrations/SKILL.md):** Al migrar de otra VPN, SWG o SASE a Cloudflare One.
  - **[durable-objects](https://raw.githubusercontent.com/cloudflare/skills/main/skills/durable-objects/SKILL.md):** Cuando se necesita estado persistente o coordinación entre solicitudes, como contadores, salas o WebSockets.
  - **[gateway-workers](https://raw.githubusercontent.com/cloudflare/skills/main/skills/gateway-workers/SKILL.md):** Al escribir los Workers que llama la acción Forward de las políticas HTTP de Gateway.
  - **[k2](https://raw.githubusercontent.com/cloudflare/skills/main/skills/k2/SKILL.md):** Para los registros de eventos durables con K2 Streams: producirlos desde Workers o por HTTP y consumirlos con suscripciones.
  - **[nextjs-on-cloudflare](https://raw.githubusercontent.com/cloudflare/skills/main/skills/nextjs-on-cloudflare/SKILL.md):** Al crear, migrar o desplegar una aplicación de Next.js en Workers.
  - **[sandbox-migrate-to-next](https://raw.githubusercontent.com/cloudflare/skills/main/skills/sandbox-migrate-to-next/SKILL.md):** Al pasar una aplicación de Sandbox de la versión estable a la preliminar.
  - **[sandbox-next](https://raw.githubusercontent.com/cloudflare/skills/main/skills/sandbox-next/SKILL.md):** Al ejecutar código en contenedores aislados con la versión preliminar, `@cloudflare/sandbox@next`.
  - **[sandbox-stable](https://raw.githubusercontent.com/cloudflare/skills/main/skills/sandbox-stable/SKILL.md):** Al ejecutar código en contenedores aislados con la versión estable, `@cloudflare/sandbox`.
  - **[turnstile-spin](https://raw.githubusercontent.com/cloudflare/skills/main/skills/turnstile-spin/SKILL.md):** Al proteger un formulario de los bots con Turnstile, con su validación en el servidor.
  - **[web-perf](https://raw.githubusercontent.com/cloudflare/skills/main/skills/web-perf/SKILL.md):** Al mejorar la velocidad de carga de las páginas, como las Core Web Vitals o el puntaje de Lighthouse.
  - **[workers-best-practices](https://raw.githubusercontent.com/cloudflare/skills/main/skills/workers-best-practices/SKILL.md):** Al escribir o revisar el código de un Worker.
  - **[workers-profiling](https://raw.githubusercontent.com/cloudflare/skills/main/skills/workers-profiling/SKILL.md):** Cuando un Worker o un Durable Object desplegado gasta mucha CPU o memoria.
  - **[wrangler](https://raw.githubusercontent.com/cloudflare/skills/main/skills/wrangler/SKILL.md):** Al usar los comandos de Wrangler, como el desarrollo local, los despliegues o los recursos de D1, KV, R2 y las colas.

## Tipos

Corre `npx wrangler types` después de cambiar los bindings en `wrangler.jsonc`.
