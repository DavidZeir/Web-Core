# Web Core

Base reutilizable para crear sitios y aplicaciones web con ayuda de IA. Reúne las funciones comunes para concentrarse en lo que hace diferente a cada proyecto.

## Qué incluye

- Inicio de sesión con Google o enlaces por correo, con gestión de sesiones y roles.
- Soporte para varios idiomas y temas de color.
- Implementación de SEO.
- API de consulta a IAs de varios proveedores, con respuestas en tiempo real, moderación de contenido, búsqueda web y alternativas si un servicio falla.
- Generación de voz desde texto con distintas voces e idiomas.
- Manejo de dinero y cantidades con precisión decimal controlada.
- Envío y procesamiento de correos, y alertas de errores.
- Reglas y pruebas para cuidar el funcionamiento, el diseño y la accesibilidad.

## Forma de trabajo

La idea es que tú definas lo que necesitas y tomes las decisiones del proyecto, mientras la IA se ocupa de la preparación técnica y los cambios en el código. Sus convenciones de trabajo están en [AGENTS.md](AGENTS.md).

Está construido con TypeScript, HTML y HTMX sobre Cloudflare Workers. Cada proyecto recibe su propia copia del núcleo y puede adaptarla a sus necesidades.

## Instalación

**[pendiente]** La instalación se hará con ayuda de un agente de IA como Codex o Claude conectado a [Cloudflare CLI (`cf`)](https://developers.cloudflare.com/cf/agents/). Tras autorizar el acceso a tu cuenta, la IA se encargará de preparar los recursos, configurar el proyecto y publicarlo. Esta integración y la migración desde Wrangler aún están pendientes. `cf` está en beta.
