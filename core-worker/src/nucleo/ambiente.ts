declare module '*.html' { // Debe quedar como archivo .ts aparte porque las declaraciones de módulos con comodín (*.html) son globales puras y TypeScript no permite anidarlas dentro de un módulo ES (como global.ts, que tiene export de nivel superior). Tampoco se pueden envolver en declare global. Si se intenta mover a un archivo .ts con lógica, el compilador lo rechaza con TS2664 o TS2435.
	const content: string;
	export default content;
}
