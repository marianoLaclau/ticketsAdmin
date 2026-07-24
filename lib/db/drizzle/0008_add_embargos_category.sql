-- Backfill conservador de la categoría derivada `embargos`.
-- Nunca modifica motivo/resumen. La expresión discursiva "sin embargo" se
-- elimina antes de buscar la raíz `embarg`, pero una mención real posterior
-- dentro del mismo texto continúa siendo detectable.
WITH `candidatos` AS (
  SELECT
    `id`,
    `motivo_categoria`,
    replace(lower(coalesce(`motivo`, '')), 'sin embargo', '') AS `motivo_normalizado`,
    replace(lower(coalesce(`resumen`, '')), 'sin embargo', '') AS `resumen_normalizado`
  FROM `tickets`
)
UPDATE `tickets`
SET `motivo_categoria` = 'embargos'
WHERE `id` IN (
  SELECT `id`
  FROM `candidatos`
  WHERE
    `motivo_normalizado` LIKE '%embarg%'
    OR (`motivo_normalizado` LIKE '%retenci%' AND `motivo_normalizado` LIKE '%judicial%')
    OR (`motivo_normalizado` LIKE '%descuento%' AND `motivo_normalizado` LIKE '%orden judicial%')
    OR (`motivo_normalizado` LIKE '%orden judicial%' AND `motivo_normalizado` LIKE '%reten%')
    OR (`motivo_normalizado` LIKE '%orden judicial%' AND `motivo_normalizado` LIKE '%retuv%')
    OR (`motivo_normalizado` LIKE '%oficio%' AND `motivo_normalizado` LIKE '%retenci%' AND (`motivo_normalizado` LIKE '%sueldo%' OR `motivo_normalizado` LIKE '%haberes%'))
    OR (
      `motivo_categoria` = 'sin_clasificar'
      AND (
        `resumen_normalizado` LIKE '%embarg%'
        OR (`resumen_normalizado` LIKE '%retenci%' AND `resumen_normalizado` LIKE '%judicial%')
        OR (`resumen_normalizado` LIKE '%descuento%' AND `resumen_normalizado` LIKE '%orden judicial%')
        OR (`resumen_normalizado` LIKE '%orden judicial%' AND `resumen_normalizado` LIKE '%reten%')
        OR (`resumen_normalizado` LIKE '%orden judicial%' AND `resumen_normalizado` LIKE '%retuv%')
        OR (`resumen_normalizado` LIKE '%oficio%' AND `resumen_normalizado` LIKE '%retenci%' AND (`resumen_normalizado` LIKE '%sueldo%' OR `resumen_normalizado` LIKE '%haberes%'))
      )
    )
);
