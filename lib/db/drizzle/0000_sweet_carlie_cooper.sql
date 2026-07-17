CREATE TABLE `seguimientos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_id` integer NOT NULL,
	`nota` text NOT NULL,
	`estado_anterior` text,
	`estado_nuevo` text,
	`autor` text,
	`fecha_creacion` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` text NOT NULL,
	`hora` text NOT NULL,
	`nombre` text NOT NULL,
	`apellido` text NOT NULL,
	`telefono` text,
	`dni` text,
	`empresa` text,
	`email` text,
	`motivo` text NOT NULL,
	`resumen` text,
	`notificado` integer DEFAULT false NOT NULL,
	`estado` text DEFAULT 'nuevo' NOT NULL,
	`prioridad` text DEFAULT 'media' NOT NULL,
	`asignado_a` text,
	`audio_url` text,
	`notas` text,
	`progreso` integer DEFAULT 0 NOT NULL,
	`fecha_creacion` integer NOT NULL,
	`fecha_limite` integer,
	`fecha_resolucion` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_conversation_id_unique` ON `tickets` (`conversation_id`);