-- Semilla de muestra de las pruebas de interfaz: un usuario de prueba con una sesión abierta, para abrir las páginas protegidas,
-- como /inicio, como ese usuario. No es una migración: playwright.config.ts aplica cada .sql de pruebas/interfaz a la base aparte
-- de las pruebas, que crea desde cero en cada corrida. La prueba pone la cookie de abajo en el navegador antes de abrir la página,
-- con context.addCookies([{ name: 'sesion-token-opaco', value: token, url: baseURL }]). La base guarda solo el hash SHA-256 del
-- token, como CrearSesión de src/nucleo/autenticacion.ts. El correo es del dominio .test, que no existe, así que ningún correo de
-- la aplicación le llega a nadie. Si un proyecto cambia las tablas Usuarios o Sesiones, esta semilla cambia con ellas, porque si
-- no, las pruebas de interfaz fallan al preparar su base.
-- Cookie de la sesión: sesion-token-opaco=db923cf2a64332649759eb3192dfecfdc233ccecbd3adea8c69eab233c1f8286

INSERT INTO Usuarios (IdUsuario, Correo, Estado, FechaHoraCreado, FechaHoraActualizado, Rol)
VALUES ('6e557d62-bbb2-4f26-811b-118ed30d4f0e', 'usuario-prueba@ejemplo.test', 'Activo', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Usuario');

INSERT INTO Sesiones (IdSesión, IdUsuario, HashTokenSesión, FechaHoraCreada, FechaHoraÚltimaActividad)
VALUES ('d723e7e3-5b75-495c-92d0-d3ec287e8e53', '6e557d62-bbb2-4f26-811b-118ed30d4f0e',
	'ba8841e25b534b882e727373ea0caf08642c61116a5e8406a6c9ba5960a48539', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
