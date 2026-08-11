-- Retira la elevación administrativa: la segunda verificación con
-- ADMIN_API_KEY dejó de existir y el rol SysAdmin de la sesión es ahora la
-- única frontera de acceso al panel, validada por el backend en cada request.
--
-- Las columnas guardaban el vencimiento del permiso y una huella de la clave.
-- No contienen datos de negocio: solo estado transitorio de sesiones vivas.
ALTER TABLE `sesiones` DROP COLUMN `admin_elevacion_hasta`;--> statement-breakpoint
ALTER TABLE `sesiones` DROP COLUMN `admin_elevacion_clave_hash`;
