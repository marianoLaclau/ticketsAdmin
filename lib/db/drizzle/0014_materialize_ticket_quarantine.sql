CREATE TABLE `tickets_cuarentena` (
	`ticket_id` integer PRIMARY KEY NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Backfill exacto de la regla histórica. Los campos técnicos, categoría,
-- estado laboral, audio y fechas no convierten por sí solos un ticket en
-- operativo. Cualquier seguimiento sí lo hace visible.
INSERT INTO `tickets_cuarentena` (`ticket_id`)
SELECT `t`.`id`
FROM `tickets` AS `t`
WHERE lower(trim(coalesce(`t`.`nombre`, ''), char(
        9, 10, 11, 12, 13, 32, 160, 5760,
        8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202,
        8232, 8233, 8239, 8287, 12288, 65279
      ))) IN ('', 'sin nombre', 'sin nombre proporcionado')
  AND trim(coalesce(`t`.`apellido`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
  AND trim(coalesce(`t`.`telefono`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
  AND trim(coalesce(`t`.`dni`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
  AND trim(coalesce(`t`.`empresa`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
  AND trim(coalesce(`t`.`email`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
  AND lower(trim(coalesce(`t`.`motivo`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) IN ('', 'sin especificar')
  AND trim(coalesce(`t`.`resumen`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
  AND trim(coalesce(`t`.`notas`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
  AND `t`.`estado` = 'nuevo'
  AND `t`.`prioridad` = 'media'
  AND `t`.`progreso` = 0
  AND `t`.`notificado` = 0
  AND `t`.`asignado_usuario_id` IS NULL
  AND trim(coalesce(`t`.`asignado_a`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
  AND NOT EXISTS (
    SELECT 1
    FROM `seguimientos` AS `s`
    WHERE `s`.`ticket_id` = `t`.`id`
  );
--> statement-breakpoint
CREATE TRIGGER `tickets_cuarentena_ticket_insert`
AFTER INSERT ON `tickets`
BEGIN
  INSERT OR IGNORE INTO `tickets_cuarentena` (`ticket_id`)
  SELECT `t`.`id`
  FROM `tickets` AS `t`
  WHERE `t`.`id` = NEW.`id`
    AND lower(trim(coalesce(`t`.`nombre`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) IN ('', 'sin nombre', 'sin nombre proporcionado')
    AND trim(coalesce(`t`.`apellido`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`telefono`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`dni`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`empresa`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`email`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND lower(trim(coalesce(`t`.`motivo`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) IN ('', 'sin especificar')
    AND trim(coalesce(`t`.`resumen`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`notas`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND `t`.`estado` = 'nuevo'
    AND `t`.`prioridad` = 'media'
    AND `t`.`progreso` = 0
    AND `t`.`notificado` = 0
    AND `t`.`asignado_usuario_id` IS NULL
    AND trim(coalesce(`t`.`asignado_a`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND NOT EXISTS (
      SELECT 1 FROM `seguimientos` AS `s`
      WHERE `s`.`ticket_id` = `t`.`id`
    );
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_cuarentena_ticket_update`
AFTER UPDATE OF
  `nombre`, `apellido`, `telefono`, `dni`, `empresa`, `email`, `motivo`,
  `resumen`, `notas`, `estado`, `prioridad`, `progreso`, `notificado`,
  `asignado_usuario_id`, `asignado_a`
ON `tickets`
BEGIN
  DELETE FROM `tickets_cuarentena` WHERE `ticket_id` = NEW.`id`;
  INSERT OR IGNORE INTO `tickets_cuarentena` (`ticket_id`)
  SELECT `t`.`id`
  FROM `tickets` AS `t`
  WHERE `t`.`id` = NEW.`id`
    AND lower(trim(coalesce(`t`.`nombre`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) IN ('', 'sin nombre', 'sin nombre proporcionado')
    AND trim(coalesce(`t`.`apellido`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`telefono`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`dni`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`empresa`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`email`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND lower(trim(coalesce(`t`.`motivo`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) IN ('', 'sin especificar')
    AND trim(coalesce(`t`.`resumen`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`notas`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND `t`.`estado` = 'nuevo'
    AND `t`.`prioridad` = 'media'
    AND `t`.`progreso` = 0
    AND `t`.`notificado` = 0
    AND `t`.`asignado_usuario_id` IS NULL
    AND trim(coalesce(`t`.`asignado_a`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND NOT EXISTS (
      SELECT 1 FROM `seguimientos` AS `s`
      WHERE `s`.`ticket_id` = `t`.`id`
    );
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_cuarentena_seguimiento_insert`
AFTER INSERT ON `seguimientos`
BEGIN
  DELETE FROM `tickets_cuarentena` WHERE `ticket_id` = NEW.`ticket_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_cuarentena_seguimiento_delete`
AFTER DELETE ON `seguimientos`
BEGIN
  DELETE FROM `tickets_cuarentena` WHERE `ticket_id` = OLD.`ticket_id`;
  INSERT OR IGNORE INTO `tickets_cuarentena` (`ticket_id`)
  SELECT `t`.`id`
  FROM `tickets` AS `t`
  WHERE `t`.`id` = OLD.`ticket_id`
    AND lower(trim(coalesce(`t`.`nombre`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) IN ('', 'sin nombre', 'sin nombre proporcionado')
    AND trim(coalesce(`t`.`apellido`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`telefono`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`dni`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`empresa`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`email`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND lower(trim(coalesce(`t`.`motivo`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) IN ('', 'sin especificar')
    AND trim(coalesce(`t`.`resumen`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`notas`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND `t`.`estado` = 'nuevo'
    AND `t`.`prioridad` = 'media'
    AND `t`.`progreso` = 0
    AND `t`.`notificado` = 0
    AND `t`.`asignado_usuario_id` IS NULL
    AND trim(coalesce(`t`.`asignado_a`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND NOT EXISTS (
      SELECT 1 FROM `seguimientos` AS `s`
      WHERE `s`.`ticket_id` = `t`.`id`
    );
END;
--> statement-breakpoint
CREATE TRIGGER `tickets_cuarentena_seguimiento_ticket_update`
AFTER UPDATE OF `ticket_id` ON `seguimientos`
BEGIN
  DELETE FROM `tickets_cuarentena` WHERE `ticket_id` = NEW.`ticket_id`;
  DELETE FROM `tickets_cuarentena` WHERE `ticket_id` = OLD.`ticket_id`;
  INSERT OR IGNORE INTO `tickets_cuarentena` (`ticket_id`)
  SELECT `t`.`id`
  FROM `tickets` AS `t`
  WHERE `t`.`id` = OLD.`ticket_id`
    AND lower(trim(coalesce(`t`.`nombre`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) IN ('', 'sin nombre', 'sin nombre proporcionado')
    AND trim(coalesce(`t`.`apellido`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`telefono`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`dni`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`empresa`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`email`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND lower(trim(coalesce(`t`.`motivo`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) IN ('', 'sin especificar')
    AND trim(coalesce(`t`.`resumen`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND trim(coalesce(`t`.`notas`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND `t`.`estado` = 'nuevo'
    AND `t`.`prioridad` = 'media'
    AND `t`.`progreso` = 0
    AND `t`.`notificado` = 0
    AND `t`.`asignado_usuario_id` IS NULL
    AND trim(coalesce(`t`.`asignado_a`, ''), char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) = ''
    AND NOT EXISTS (
      SELECT 1 FROM `seguimientos` AS `s`
      WHERE `s`.`ticket_id` = `t`.`id`
    );
END;
