const ReglasTypeScript: Record<string, string | unknown[]> = { // Reglas generales de ESLint para cualquier proyecto de TypeScript: atrapan errores o siguen convenciones comunes, así que se le pueden pedir a cualquiera que use el proyecto. El original es el de Web Core, en Programas, y cada proyecto hecho desde Core guarda una copia idéntica en git: se edita el original y se vuelve a copiar. Las reglas que son gustos del autor van aparte, en reglas-personales.mts. Usa los complementos '@typescript-eslint' y '@stylistic', que cada proyecto registra con esos nombres, y el complemento 'generales', con las reglas propias que ESLint no trae, que está al final de este archivo. '@stylistic' sale del paquete @stylistic/eslint-plugin en la versión 4, porque la 5 dejó de revisar las llaves de interface y enum. Node carga este archivo sin compilarlo, así que el proyecto necesita Node 22.18 o más en la rama 22, o la 24, como dice engines en su package.json.
	"no-shadow": "off",
	"@typescript-eslint/no-shadow": "error", // No Shadowing: Prohibido repetir nombres de variables en bloques hijos.
	"@typescript-eslint/no-explicit-any": "error", // No Any: Prohibido usar 'any'. Si no hay tipo, hay error.
	"@typescript-eslint/explicit-function-return-type": "error", // Tipos de Retorno Obligatorios: Como en C#, toda función debe decir qué devuelve.
	"@typescript-eslint/no-floating-promises": "error", // Para que funcione como en C#: si se llama a un método async que devuelve un Task y no se le pone await, el compilador saca una alerta.
	"@typescript-eslint/await-thenable": "error", // Para que funcione como en C#: avisa si se usa await en algo que no es un Task.
	"@typescript-eslint/no-misused-promises": "error", // Para que funcione como en C#: el compilador protege de pasar un método async void donde se espera una acción simple.
	"@stylistic/member-delimiter-style": ["error", { // Obliga a usar punto y coma de separador en propiedades en interfaces tal como se exige en C#.
		"multiline": { "delimiter": "semi", "requireLast": true },
		"singleline": { "delimiter": "semi", "requireLast": true }}
	],
	"@stylistic/semi": ["error", "always"], // Obliga el punto y coma al final de cada sentencia como en C#.
	"no-var": "error", // Prohibe el uso de var.
	"prefer-const": "error", // Obliga a usar 'const' si la variable nunca se reasigna.
	"@typescript-eslint/switch-exhaustiveness-check": "error", // Obliga a que un switch sobre un enum o una unión liste todos sus casos, como pide la regla 'Switch completo' de AGENTS.md. El default que lanza la excepción lo exige la regla siguiente.
	"generales/switch-con-default-que-lanza": "error", // Exige que un switch sobre un enum o una unión tenga un default que lance una excepción, como pide la regla 'Switch completo' de AGENTS.md, para que un valor inesperado falle con ruido. Se arregla a mano.
	"generales/caracteres-invisibles-con-escape": "error", // Exige que los caracteres que no se ven vayan con su escape y no escritos tal cual, para que se vean al leer el código y ninguna herramienta los cambie sin avisar. Se arregla a mano.
	"generales/titulos-each-sin-tildes": "error", // Exige que los $nombre de los títulos de it.each, test.each y describe.each no lleven tildes, porque vitest no los reemplaza por el dato de la fila. Se arregla a mano.
	"no-empty": "error", // Prohíbe los bloques vacíos, para que ningún catch se trague un error sin decirlo. Si un bloque queda vacío a propósito, el comentario que lo explica va dentro de sus llaves.
	"@stylistic/brace-style": ["error", "1tbs", { "allowSingleLine": true }] // Obliga a abrir las llaves en la misma línea de la instrucción y a dejar el else junto a la llave que cierra el if, como pide la regla 'Llaves en la misma línea' de AGENTS.md. Permite los bloques que caben en una sola línea. Se arregla sola con --fix.
};

interface Posición { line: number; column: number; } // Los tipos que siguen describen solo la parte de ESLint y de TypeScript que usan las reglas propias de este archivo, para no depender de ningún paquete instalado. Esta es una línea y columna del código, como las entrega ESLint.
interface Ubicación { start: Posición; end: Posición; } // Dónde empieza y dónde termina un nodo.
interface Nodo { type: string; loc: Ubicación; } // Un nodo cualquiera del árbol de sintaxis.
interface NodoSwitch extends Nodo { discriminant: Nodo; cases: NodoCaso[]; } // Un switch, con el valor que revisa y sus casos.
interface NodoCaso extends Nodo { test: Nodo | null; consequent: Nodo[]; } // Un case, o el default cuando no tiene valor, con sus instrucciones.
interface NodoConCuerpo extends Nodo { body: Nodo[]; } // Un bloque entre llaves, con sus instrucciones.
interface NodoLlamada extends Nodo { callee: Nodo; arguments: Nodo[]; } // Una llamada a una función, con lo que se llama y sus argumentos.
interface NodoMiembro extends Nodo { object: Nodo; property: Nodo; } // Un acceso a un miembro, como it.each.
interface NodoIdentificador extends Nodo { name: string; } // Un nombre, como it.
interface NodoLiteral extends Nodo { value: unknown; } // Un valor escrito en el código, como un texto entre comillas.
interface NodoPlantilla extends Nodo { quasis: { value: { raw: string; }; }[]; } // Una plantilla de texto, con sus partes fijas.
interface TipoTypeScript { isUnion(): boolean; isStringLiteral(): boolean; isNumberLiteral(): boolean; types?: TipoTypeScript[]; } // Un tipo de TypeScript. Una unión trae sus partes en 'types'.
interface VerificadorDeTipos { getTypeAtLocation(nodo: unknown): TipoTypeScript; getNonNullableType(tipo: TipoTypeScript): TipoTypeScript; typeToString(tipo: TipoTypeScript): string; } // El verificador de tipos de TypeScript.
interface ServiciosDeTipos { program?: { getTypeChecker(): VerificadorDeTipos; } | null; esTreeNodeToTSNodeMap: { get(nodo: Nodo): unknown; }; } // Lo que entrega el analizador de typescript-eslint para pedirle los tipos a TypeScript.
interface Contexto { sourceCode: { parserServices?: ServiciosDeTipos; text: string; getLocFromIndex(índice: number): Posición; };
	report(reporte: { loc: Ubicación; messageId: string; data?: Record<string, string>; }): void; } // Lo que ESLint entrega a la regla al revisar un archivo: el código, con su texto, y la forma de reportar un problema, con los datos que completan su mensaje.
interface Regla { meta: { type: string; schema: []; messages: Record<string, string>; }; create(contexto: Contexto): Record<string, (nodo: never) => void>; } // Una regla con la forma que pide ESLint.


function EsUniónDeLiterales(verificador: VerificadorDeTipos, tipo: TipoTypeScript): boolean { // Dice si un tipo es una unión de valores fijos, como 'a' | 'b', un enum, aunque tenga un solo miembro, o un boolean, que es la unión de true y false. Es lo que mapea un switch según la regla 'Switch completo'. El null y el undefined de la unión no cuentan.

	const sinNulos = verificador.getNonNullableType(tipo);
	const partes = sinNulos.isUnion() ? sinNulos.types ?? [] : [sinNulos]; // Un enum de un solo miembro, o un solo valor fijo, no llega como unión, pero cuenta igual.
	return partes.every(parte => parte.isStringLiteral() || parte.isNumberLiteral() || ["true", "false"].includes(
		verificador.typeToString(parte)));

}


function LanzaExcepción(caso: NodoCaso): boolean { // Dice si el default de un switch lanza una excepción: termina en un throw, y antes de él solo lleva declaraciones de variables o expresiones, que no pueden salir del default sin lanzarla.

	const instrucciones = caso.consequent.length === 1 && caso.consequent[0].type === "BlockStatement" ? (caso.consequent[0] as NodoConCuerpo).body : caso.consequent; // El default puede traer sus instrucciones entre llaves.
	const anteriores = instrucciones.slice(0, -1); // Todas menos la última, que es la que debe lanzar.
	return instrucciones.at(-1)?.type === "ThrowStatement" && anteriores.every(
		instrucción => ["VariableDeclaration", "ExpressionStatement"].includes(instrucción.type));

}


const ReglaSwitchConDefaultQueLanza: Regla = { // Revisa la parte de la regla 'Switch completo' de AGENTS.md que no revisa switch-exhaustiveness-check: un switch sobre un enum o una unión lleva un default que lanza una excepción.
	meta: { type: "problem", schema: [], messages: {
		sinDefault: "Este switch es sobre un enum o una unión: además de todos sus casos, lleva un default que lance una excepción, para que un valor inesperado falle con ruido.",
		defaultQueNoLanza: "El default de un switch sobre un enum o una unión lanza una excepción: termina en un throw, y antes de él solo lleva declaraciones de variables o expresiones.",
	} },
	create(contexto: Contexto): Record<string, (nodo: never) => void> {

		const servicios = contexto.sourceCode.parserServices;
		const verificador = servicios?.program?.getTypeChecker();
		if (servicios === undefined || verificador === undefined)
			throw new Error("La regla generales/switch-con-default-que-lanza necesita los tipos de TypeScript: falta parserOptions.project en eslint.config.mjs.");
		return {
			SwitchStatement(nodoSwitch: NodoSwitch): void {

				const casoPorDefecto = nodoSwitch.cases.find(caso => caso.test === null);
				const esSobreUnión = EsUniónDeLiterales(verificador,
					verificador.getTypeAtLocation(servicios.esTreeNodeToTSNodeMap.get(nodoSwitch.discriminant)));
				if (esSobreUnión && casoPorDefecto === undefined) {
					contexto.report({ loc: nodoSwitch.loc, messageId: "sinDefault" });
				} else if (esSobreUnión && casoPorDefecto !== undefined && !LanzaExcepción(casoPorDefecto)) {
					contexto.report({ loc: casoPorDefecto.loc, messageId: "defaultQueNoLanza" });
				}

			},
		};

	},
};


const RangosCaracteresInvisibles: [number, number][] = [[0x0000, 0x0008], [0x000B, 0x000C], [0x000E, 0x001F], [0x007F, 0x009F], [0x00AD, 0x00AD],
	[0x200B, 0x200F], [0x2028, 0x202E], [0x2060, 0x2064], [0x2066, 0x206F], [0xFDD0, 0xFDEF], [0xFEFF, 0xFEFF], [0xFFFE, 0xFFFF]]; // Los caracteres que no se ven al leer el código, por los rangos de sus códigos: los de control, menos la tabulación y los saltos de línea, el guion suave, los de ancho cero, los separadores de línea y de párrafo, los que cambian la dirección del texto, la marca de orden de bytes y los que Unicode reserva y nunca son texto, como U+FFFE y U+FFFF.


const ReglaCaracteresInvisiblesConEscape: Regla = { // Revisa que ningún carácter que no se ve vaya escrito tal cual en el código, sino con su escape, que sí se ve. Uno escrito tal cual no se nota al leer el código, y las herramientas que editan el archivo lo pueden cambiar sin avisar, como les pasó a U+FFFE y U+FFFF en una expresión regular.
	meta: { type: "problem", schema: [], messages: {
		invisible: "Aquí va escrito tal cual el carácter invisible {{código}}: escríbelo con su escape, la barra invertida seguida de la u y de su código en cuatro cifras, para que se vea al leer el código y ninguna herramienta lo cambie.",
	} },
	create(contexto: Contexto): Record<string, (nodo: never) => void> {
		return {
			Program(): void { // Recorre el texto completo del archivo, con sus comentarios, sus textos y sus expresiones regulares, porque el carácter puede estar en cualquier parte.

				const texto = contexto.sourceCode.text;
				for (let i = 0; i < texto.length; i++) {

					const código = texto.charCodeAt(i);
					if (RangosCaracteresInvisibles.some(([desde, hasta]) => código >= desde && código <= hasta))
						contexto.report({ loc: { start: contexto.sourceCode.getLocFromIndex(i), end: contexto.sourceCode.getLocFromIndex(i + 1) },
							messageId: "invisible", data: { código: `U+${código.toString(16).toUpperCase().padStart(4, "0")}` } });

				}

			},
		};
	},
};


const NombresConEach = ["it", "test", "describe"]; // Las funciones de vitest que tienen each, también con un modificador en medio, como it.skip.each.

const ExpresiónNombreConTilde = /\$[$\w.]*(?=\P{ASCII})\p{L}[\p{L}\p{N}_.]*/gu; // Un $nombre de un título que sigue con una letra fuera del ASCII, como una con tilde, después de lo que vitest sí toma, que son las letras sin tilde, los números, el guion bajo, el punto y el signo de pesos.


function EsEach(nodo: Nodo): boolean { // Dice si lo que se llama es el each de vitest, como it.each, test.each, describe.each o it.skip.each.

	if (nodo.type !== "MemberExpression") return false;
	const miembro = nodo as NodoMiembro;
	let raíz = miembro.object;
	while (raíz.type === "MemberExpression") raíz = (raíz as NodoMiembro).object;
	return miembro.property.type === "Identifier" && (miembro.property as NodoIdentificador).name === "each" && raíz.type === "Identifier"
		&& NombresConEach.includes((raíz as NodoIdentificador).name);

}


const ReglaTítulosEachSinTildes: Regla = { // Revisa los títulos de it.each, test.each y describe.each: vitest solo reemplaza un $nombre por el dato de la fila si el nombre tiene letras sin tilde, así que $parámetros saldría como undefinedámetros.
	meta: { type: "problem", schema: [], messages: {
		conTilde: "vitest solo reemplaza en el título los $nombre con letras sin tilde: cambia {{nombre}} por un nombre sin tildes, como $filtro.",
	} },
	create(contexto: Contexto): Record<string, (nodo: never) => void> {
		return {
			CallExpression(llamada: NodoLlamada): void { // El título lo recibe la función que devuelve each, como en it.each(filas)(título, prueba).

				const título = llamada.arguments.at(0);
				const llamadaEach = llamada.callee.type === "CallExpression" ? llamada.callee as NodoLlamada : null;
				if (título !== undefined && llamadaEach !== null && EsEach(llamadaEach.callee)) {

					const texto = título.type === "Literal" ? String((título as NodoLiteral).value)
						: título.type === "TemplateLiteral" ? (título as NodoPlantilla).quasis.map(parte => parte.value.raw).join("") : "";
					for (const nombre of texto.match(ExpresiónNombreConTilde) ?? []) contexto.report({ loc: título.loc, messageId: "conTilde", data: { nombre } });

				}

			},
		};
	},
};


const ComplementoGeneral: { rules: Record<string, Regla>; } = { // Las reglas generales propias, para lo que ESLint no trae. eslint.config.mjs registra este complemento con el nombre 'generales'.
	rules: {
		"switch-con-default-que-lanza": ReglaSwitchConDefaultQueLanza,
		"caracteres-invisibles-con-escape": ReglaCaracteresInvisiblesConEscape,
		"titulos-each-sin-tildes": ReglaTítulosEachSinTildes,
	},
};

export { ComplementoGeneral };
export default ReglasTypeScript;
