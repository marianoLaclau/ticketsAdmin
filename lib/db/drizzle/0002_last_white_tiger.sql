CREATE TABLE `sesiones` (
	`token` text PRIMARY KEY NOT NULL,
	`usuario_id` integer NOT NULL,
	`fecha_expiracion` integer NOT NULL,
	`fecha_creacion` integer NOT NULL,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `usuarios` ADD `password_hash` text;