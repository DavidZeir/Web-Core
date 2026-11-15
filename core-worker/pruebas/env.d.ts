declare namespace Cloudflare {
	interface Env {
		MIGRACIONES_PRUEBAS: import('cloudflare:test').D1Migration[];
	}
}
