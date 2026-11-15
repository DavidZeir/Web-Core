import { describe, expect, it, vi } from 'vitest';
import type { Contexto } from '../../src/nucleo/global';


/** Las pruebas de la carga de los textos de cada idioma, de src/nucleo/idiomas.ts. */


describe('la carga de los textos de un idioma', (): void => {

	it('Error arreglado: si la carga falla, no deja los textos vacíos en memoria, y la solicitud siguiente los vuelve a cargar', async (): Promise<void> => {

		vi.resetModules(); // Los textos cargados viven en la memoria del módulo, así que se carga de nuevo, sin lo que dejaron otras pruebas.
		const { CargarTextosIdioma } = await import('../../src/nucleo/idiomas');
		vi.spyOn(console, 'warn').mockImplementation(() => undefined); // La carga que falla avisa en la consola, y aquí se espera.
		const buscarArchivo = vi.fn().mockResolvedValueOnce(new Response('Error', { status: 500 }))
			.mockResolvedValue(new Response(JSON.stringify({ saludo: 'Hola' })));
		const contexto = { Entorno: { RECURSOS: { fetch: buscarArchivo } } } as unknown as Contexto;

		expect(await CargarTextosIdioma(contexto, 'es')).toEqual({});
		expect(await CargarTextosIdioma(contexto, 'es')).toEqual({ saludo: 'Hola' });
		expect(buscarArchivo).toHaveBeenCalledTimes(2);

	});

});
