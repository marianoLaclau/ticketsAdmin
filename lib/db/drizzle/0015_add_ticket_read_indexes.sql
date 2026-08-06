CREATE INDEX `seguimientos_fecha_creacion_id_idx` ON `seguimientos` (`fecha_creacion`,`id`);--> statement-breakpoint
CREATE INDEX `tickets_fecha_creacion_id_idx` ON `tickets` (`fecha_creacion`,`id`);--> statement-breakpoint
CREATE INDEX `tickets_fecha_limite_id_idx` ON `tickets` (`fecha_limite`,`id`);--> statement-breakpoint
CREATE INDEX `tickets_fecha_resolucion_id_idx` ON `tickets` (`fecha_resolucion`,`id`);