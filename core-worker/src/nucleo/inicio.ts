import { type Entorno, Contexto, DatosCliente, ObtenerCorreoAdministrador, ObtenerIdiomaSolicitud, TipoCliente } from './global';
import { LimpiarEnlacesMágicosViejos } from './enlaces-magicos';
import { LimpiarSesionesViejas } from './autenticacion';
import { ResolverCambioManualIdioma, CrearRespuestaCambioIdioma, ResolverMultidioma, CrearSolicitudConIdioma } from './idiomas';
import { ResolverCambioTema } from './temas';
import { IdiomaPredeterminado, IdiomasSoportados } from '../configuracion';
import { Manejadores, MapaSeo, RutasExcluidasDeSitemap } from '../rutas';
import { ProcesarCorreo } from './correos';
import { EnviarAlertaErrorCríticoEnSegundoPlano } from './alertas';


export default {


	async fetch(request, env, ctx): Promise<Response> {

		const idSolicitud = request.headers.get('cf-ray') ?? crypto.randomUUID();
		try {
			const contexto = CrearContexto(env, request, ctx, idSolicitud);
			return await Resolver(contexto);
		} catch (e) {

			EnviarAlertaErrorCríticoEnSegundoPlano(env, ctx, 'Error no manejado en el Worker',
				'Se produjo un error no manejado en el Worker.', String(e), idSolicitud);
			return new Response('Error interno.', { status: 500 });

		}

	},


	async email(message: ForwardableEmailMessage, env, ctx): Promise<void> {

		if (!(await ProcesarCorreo(message, env, ctx))) {

			try {
				await message.forward(ObtenerCorreoAdministrador(env)); // Se reenvían los correos entrantes cuando no hay procesador definido, cuando el procesador no los maneja (devuelve falso) o lanza error.
			} catch (e) {
				EnviarAlertaErrorCríticoEnSegundoPlano(env, ctx, 'Error reenviando correo entrante',
					'No se pudo reenviar un correo entrante al administrador.', String(e));
			}

		}

	},


	async scheduled(_controller: ScheduledController, env: Entorno, ctx: ExecutionContext): Promise<void> { // La firma de Cloudflare entrega primero el controlador del cron, que aquí no se usa.

		ctx.waitUntil(LimpiarEnlacesMágicosViejos(env)); // Limpieza diaria de enlaces mágicos viejos.
		ctx.waitUntil(LimpiarSesionesViejas(env)); // Limpieza diaria de sesiones cerradas o abandonadas.
		console.log(`Tarea programada de limpieza ejecutada el ${new Date().toISOString()}.`);

	}


} satisfies ExportedHandler<Entorno>;


export async function Resolver(contexto: Contexto): Promise<Response> {

	const respuestaCambioTema = ResolverCambioTema(contexto);
	if (respuestaCambioTema) return respuestaCambioTema;

	let solicitudEfectiva: Request;
	let rutaEfectiva: string;

	if (IdiomasSoportados.length > 1) {

		const rutaCambioIdioma = ResolverCambioManualIdioma(contexto.Url);
		if (rutaCambioIdioma) {
			const respuestaCambioIdioma = CrearRespuestaCambioIdioma(contexto, rutaCambioIdioma);
			return respuestaCambioIdioma;
		} else {

			const { rutaSinIdioma, solicitudConIdioma, urlRedirección, códigoRedirección } = ResolverMultidioma(contexto);
			if (urlRedirección !== null && códigoRedirección !== null) {
				return Response.redirect(urlRedirección.toString(), códigoRedirección);
			} else {
				rutaEfectiva = rutaSinIdioma;
				solicitudEfectiva = solicitudConIdioma!;
			}

		}

	} else { // Un idioma.
		rutaEfectiva = contexto.Url.pathname;
		solicitudEfectiva = CrearSolicitudConIdioma(contexto, IdiomaPredeterminado, rutaEfectiva);
	}

	const manejador = Manejadores[rutaEfectiva];
	if (!manejador) return new Response('Ruta no encontrada', { status: 404 });
	const idioma = ObtenerIdiomaSolicitud(solicitudEfectiva, IdiomaPredeterminado);
	const sustitucionesSeo: Record<string, string> = {};
	if (!MapaSeo[rutaEfectiva] && !RutasExcluidasDeSitemap.includes(rutaEfectiva))
		console.warn(`No se encontró la configuración SEO de la ruta efectiva '${rutaEfectiva}'. Se usará la entrada predeterminada.`); // Las rutas tecnicas, privadas o internas ya se clasifican expresamente como no indexables en RutasExcluidasDeSitemap y usan los datos predeterminados solo para completar el Contexto, por lo que su ausencia en MapaSeo es intencional y no debe contaminar los registros con una advertencia. Una ruta indexable sin configuracion sigue produciendo este aviso como defensa adicional a ValidarMapaSeo.
	const datosSeo = (MapaSeo[rutaEfectiva] ?? MapaSeo.default)?.[idioma] ?? MapaSeo.default[IdiomaPredeterminado];

	const contextoEfectivo: Contexto = {...contexto, Solicitud: solicitudEfectiva, Url: new URL(solicitudEfectiva.url),
		Idioma: idioma, DatosSeo: datosSeo, SustitucionesSeo: sustitucionesSeo };

	return manejador(contextoEfectivo);

}


export function CrearContexto(entorno: Entorno, solicitud: Request, ejecución: ExecutionContext, idSolicitud: string): Contexto {

	if (!solicitud?.url) throw new Error('CrearContexto() requiere una solicitud con URL.');

	const url = new URL(solicitud.url);
	const idioma = ObtenerIdiomaSolicitud(solicitud, IdiomaPredeterminado);
	const apiUrl = entorno.API_URL?.trim() ?? '';
	const tieneApi = apiUrl.length > 0;
	const urlBase = tieneApi ? new URL(apiUrl) : url;
	const local = entorno.MODO_EJECUCION?.trim().toLowerCase() === 'local';
	const origenEsperado = urlBase.origin;
	const dominioCookies = urlBase.hostname.replace(/^api\./i, '');

	return { Entorno: entorno, Solicitud: solicitud, Ejecución: ejecución, Url: url, IdSolicitud: idSolicitud, DatosSeo: null,
		SustitucionesSeo: {}, Idioma: idioma, CookiesRespuesta: [], Autenticación: null, ModoAutenticaciónRequerido: null,
		Cliente: CrearDatosCliente(solicitud), Local: local, TieneApi: tieneApi, OrigenEsperado: origenEsperado,
		DominioCookies: dominioCookies };

}


export function CrearDatosCliente(solicitud: Request): DatosCliente {

	const agenteUsuario = (solicitud.headers.get('user-agent') ?? '').toLowerCase();
	const país = solicitud.headers.get('CF-IPCountry');
	const ciudad = solicitud.headers.get('CF-IPCity');
	const cabeceraMóvil = solicitud.headers.get('Sec-CH-UA-Mobile');
	const robot = /(bot|crawler|spider|slurp|facebookexternalhit|bingpreview)/.test(agenteUsuario);

	return {
		País: país && país !== 'XX' ? país : null,
		Ciudad: ciudad && ciudad.trim().length > 0 ? ciudad : null,
		Robot: robot,
		Tipo: cabeceraMóvil === '?1' || /(mobi|android|iphone|ipad|ipod)/.test(agenteUsuario) ? TipoCliente.Móvil : TipoCliente.Escritorio,
	};

}
