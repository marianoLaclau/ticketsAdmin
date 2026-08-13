ALTER TABLE `seguimientos` ADD `autor_usuario_id` integer REFERENCES usuarios(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `seguimientos_autor_fecha_id_idx` ON `seguimientos` (`autor_usuario_id`,`fecha_creacion`,`id`);
