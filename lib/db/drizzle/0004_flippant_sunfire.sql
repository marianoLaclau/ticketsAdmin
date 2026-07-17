ALTER TABLE `usuarios` ADD `username` text;--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_username_unique` ON `usuarios` (`username`);