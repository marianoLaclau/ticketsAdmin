ALTER TABLE `seguimientos` ADD `prioridad_anterior` text;--> statement-breakpoint
ALTER TABLE `seguimientos` ADD `prioridad_nueva` text;--> statement-breakpoint
ALTER TABLE `seguimientos` ADD `asignado_anterior_usuario_id` integer REFERENCES usuarios(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `seguimientos` ADD `asignado_anterior` text;--> statement-breakpoint
ALTER TABLE `seguimientos` ADD `asignado_nuevo_usuario_id` integer REFERENCES usuarios(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `seguimientos` ADD `asignado_nuevo` text;--> statement-breakpoint
ALTER TABLE `seguimientos` ADD `campos_editados` text;
