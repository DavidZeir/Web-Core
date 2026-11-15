// #region Errores de HTMX

interface DetalleAntesIntercambioHtmx {
	xhr: { status: number; };
	shouldSwap: boolean;
	isError: boolean;
}

interface EventoAntesIntercambioHtmx extends Event { detail: DetalleAntesIntercambioHtmx; }

document.body.addEventListener('htmx:beforeSwap', (event: Event) => { // Permite que HTMX inserte el fragmento HTML de error en el widget destino, sin tratar la respuesta como un error que bloquee la interfaz.

	const eventoTipado = event as EventoAntesIntercambioHtmx;
	if (eventoTipado.detail.xhr.status >= 400) {
		eventoTipado.detail.shouldSwap = true;
		eventoTipado.detail.isError = false;
	}

});


interface DetalleErrorRespuestaHtmx {
	xhr: { status: number; };
	pathInfo: { requestPath: string; };
}

interface EventoErrorRespuestaHtmx extends Event { detail: DetalleErrorRespuestaHtmx; }

document.addEventListener('htmx:responseError', (event: Event) => { // Captura errores de respuesta del servidor (Ej: 500, 403, 404) de CloudFlare de solicitudes que no alcanzaron a llegar al Worker: Limitación de llamadas configurada en CloudFlare, caída temporal de CloudFlare, etc.

	const eventoTipado = event as EventoErrorRespuestaHtmx;
	const estado = eventoTipado.detail.xhr.status;
	const ruta = eventoTipado.detail.pathInfo.requestPath;
	console.error(`[HTMX] Error ${estado} en la ruta: ${ruta}`);
	alert(document.documentElement.lang === 'es'
		? `Error del servidor (${estado}). Por favor, intenta de nuevo.`
		: `A server error occurred (${estado}). Please try again.`);

});


document.addEventListener('htmx:sendError', () => { // Captura errores de conectividad del usuario.

	console.error('[HTMX] Error de red: No se pudo enviar la solicitud.');
	alert(document.documentElement.lang === 'es'
		? 'No hay conexión a internet. Revisa tu señal.'
		: 'No internet connection. Please check your signal.');

});

// #endregion


// #region Reintento del enlace mágico

type RaizConsultaInterfaz = Document | Element;

function InicializarReintentoEnlace(raiz: RaizConsultaInterfaz = document): void { // Revela el enlace para volver al formulario de correo despues de un minuto sin mostrar una cuenta regresiva.

	const enlaces = Array.from(raiz.querySelectorAll<HTMLAnchorElement>('[data-reintento-enlace]'));
	if (enlaces.length === 0) return;

	for (const enlace of enlaces) {

		if (enlace.dataset.reintentoInicializado === 'true') continue;

		enlace.hidden = true;
		enlace.dataset.reintentoInicializado = 'true';
		window.setTimeout(() => {
			enlace.hidden = false;
		}, 60000);

	}

}


InicializarReintentoEnlace();
document.body.addEventListener('htmx:afterSwap', (event: Event) => { // La respuesta del enlace mágico llega con un intercambio parcial de HTMX, así que el reintento se activa también sobre el fragmento insertado.

	const objetivoIntercambio = event.target;
	if (!(objetivoIntercambio instanceof Element)) return;
	InicializarReintentoEnlace(objetivoIntercambio);

});

// #endregion
