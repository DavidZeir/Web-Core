-- Migration number: 0001 	 2026-04-18T20:46:04.416Z

-- Modelo de datos de autenticación.
-- En esta migración no se agregan restricciones para impedir eliminaciones físicas porque estas tablas almacenan datos de autenticación y datos personales, y el sistema debe poder suprimirlos completamente cuando exista un requerimiento válido de privacidad, protección de datos o cumplimiento normativo.

CREATE TABLE Usuarios (
	IdUsuario TEXT PRIMARY KEY,
	Correo TEXT NOT NULL,
	Estado TEXT NOT NULL CHECK (Estado IN ('Activo', 'Bloqueado', 'Eliminado')),
	FechaHoraCreado TEXT NOT NULL,
	FechaHoraActualizado TEXT NOT NULL,
	Rol TEXT NOT NULL CHECK (Rol IN ('Usuario', 'Administrador')),
	UNIQUE (Correo)
);


CREATE TABLE Identidades (
	IdIdentidad TEXT PRIMARY KEY,
	IdUsuario TEXT NOT NULL,
	Proveedor TEXT NOT NULL CHECK (Proveedor IN ('Google', 'Enlace')),
	IdEnProveedor TEXT NOT NULL,
	Correo TEXT NOT NULL,
	CorreoVerificado INTEGER NOT NULL CHECK (CorreoVerificado IN (0, 1)),
	FechaHoraCreada TEXT NOT NULL,
	FechaHoraÚltimoUso TEXT NOT NULL,
	FOREIGN KEY (IdUsuario) REFERENCES Usuarios(IdUsuario),
	UNIQUE (Proveedor, IdEnProveedor),
	UNIQUE (Proveedor, IdUsuario)
);


CREATE TABLE Sesiones (
	IdSesión TEXT PRIMARY KEY,
	IdUsuario TEXT NOT NULL,
	HashTokenSesión TEXT NOT NULL,
	FechaHoraCreada TEXT NOT NULL,
	FechaHoraÚltimaActividad TEXT NOT NULL,
	FechaHoraCerrada TEXT NULL,
	MotivoCierre TEXT NULL CHECK (MotivoCierre IN ('Salió', 'Inactividad', 'Bloqueo', 'Salió en todos los dispositivos')),
	FOREIGN KEY (IdUsuario) REFERENCES Usuarios(IdUsuario),
	UNIQUE (HashTokenSesión)
);


CREATE TABLE EnlacesMágicos (
	IdEnlace TEXT PRIMARY KEY,
	Correo TEXT NOT NULL,
	HashTokenEnlace TEXT NOT NULL,
	FechaHoraCreado TEXT NOT NULL,
	FechaHoraUsado TEXT NULL,
	UNIQUE (HashTokenEnlace)
);


CREATE INDEX IX_EnlacesMágicos_Correo ON EnlacesMágicos (Correo);
CREATE INDEX IX_Identidades_IdUsuario ON Identidades (IdUsuario);
CREATE INDEX IX_Sesiones_IdUsuario ON Sesiones (IdUsuario);
