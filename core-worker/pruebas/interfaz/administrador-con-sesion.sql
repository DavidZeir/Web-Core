-- Semilla de muestra de las pruebas de interfaz: un administrador de prueba con una sesión abierta, para abrir las páginas que
-- solo ve el administrador, como las de ejemplo. Igual que usuario-con-sesion.sql, no es una migración: playwright.config.ts la
-- aplica a la base aparte de las pruebas, y su correo es del dominio .test, que no existe.
-- Cookie de la sesión: sesion-token-opaco=c7ca3d270bd31eca1f06b7d309fb1060db36efd2e9420f3c86c63e28eac74ca1

INSERT INTO Usuarios (IdUsuario, Correo, Estado, FechaHoraCreado, FechaHoraActualizado, Rol)
VALUES ('40c14747-aed2-4f7d-bafe-ab698064b29f', 'administrador-prueba@ejemplo.test', 'Activo', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'Administrador');

INSERT INTO Sesiones (IdSesión, IdUsuario, HashTokenSesión, FechaHoraCreada, FechaHoraÚltimaActividad)
VALUES ('7789456b-67c6-4edf-96d6-321feb97782b', '40c14747-aed2-4f7d-bafe-ab698064b29f',
	'e83ae92759d16cda2c7ebe972c023576d23528cd03e72c4ab47f322f0f905897', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
