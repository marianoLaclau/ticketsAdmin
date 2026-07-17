ALTER TABLE `tickets` ADD `asignado_usuario_id` integer REFERENCES usuarios(id) ON DELETE SET NULL;
