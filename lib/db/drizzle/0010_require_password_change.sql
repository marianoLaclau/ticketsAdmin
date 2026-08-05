ALTER TABLE `usuarios`
ADD COLUMN `debe_cambiar_password` integer DEFAULT true NOT NULL
CONSTRAINT `usuarios_debe_cambiar_password_bool`
CHECK (`debe_cambiar_password` in (0, 1));
--> statement-breakpoint
UPDATE `usuarios` SET `debe_cambiar_password` = false;
