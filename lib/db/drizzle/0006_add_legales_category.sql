-- Backfill conservador de la nueva categoría derivada `legales`.
-- Solo cambia `motivo_categoria`: `motivo` y `resumen` permanecen intactos.
-- El resumen se considera únicamente si el ticket seguía sin clasificar, para
-- respetar la prioridad histórica del motivo original sobre el resumen.
WITH `candidatos` AS (
  SELECT
    `id`,
    `motivo_categoria`,
    lower(coalesce(`motivo`, '')) AS `motivo_normalizado`,
    lower(coalesce(`resumen`, '')) AS `resumen_normalizado`
  FROM `tickets`
)
UPDATE `tickets`
SET `motivo_categoria` = 'legales'
WHERE `id` IN (
  SELECT `id`
  FROM `candidatos`
  WHERE
    `motivo_normalizado` LIKE '%carta documento%'
    OR `motivo_normalizado` LIKE '%telegrama laboral%'
    OR `motivo_normalizado` LIKE '%patrocinio letrado%'
    OR `motivo_normalizado` LIKE '%estudio jurid%'
    OR `motivo_normalizado` LIKE ('%estudio jur' || char(237) || 'd%')
    OR `motivo_normalizado` LIKE '%seclo%'
    OR `motivo_normalizado` LIKE '%habl% con %abogad%'
    OR `motivo_normalizado` LIKE '%comunic% con %abogad%'
    OR `motivo_normalizado` LIKE '%contact% con %abogad%'
    OR `motivo_normalizado` LIKE '%contact% a %abogad%'
    OR `motivo_normalizado` LIKE '%consult% con %abogad%'
    OR `motivo_normalizado` LIKE '%consult% a %abogad%'
    OR `motivo_normalizado` LIKE '%deriv% a %abogad%'
    OR `motivo_normalizado` LIKE '%asesor% de %abogad%'
    OR `motivo_normalizado` LIKE '%asesor% por %abogad%'
    OR `motivo_normalizado` LIKE '%represent% por %abogad%'
    OR `motivo_normalizado` LIKE '%patrocin% por %abogad%'
    OR `motivo_normalizado` LIKE '%solicita abogad%'
    OR `motivo_normalizado` LIKE '%solicita un abogad%'
    OR `motivo_normalizado` LIKE '%busca abogad%'
    OR `motivo_normalizado` LIKE '%busca un abogad%'
    OR `motivo_normalizado` LIKE '%abogad%laboral%'
    OR `motivo_normalizado` LIKE '%abogad%judicial%'
    OR `motivo_normalizado` LIKE '%asesor% legal%'
    OR `motivo_normalizado` LIKE '%asesor% jurid%'
    OR `motivo_normalizado` LIKE ('%asesor% jur' || char(237) || 'd%')
    OR `motivo_normalizado` LIKE '%consulta legal%'
    OR `motivo_normalizado` LIKE '%consulta jurid%'
    OR `motivo_normalizado` LIKE ('%consulta jur' || char(237) || 'd%')
    OR `motivo_normalizado` LIKE '%orientaci% legal%'
    OR `motivo_normalizado` LIKE '%orientaci% jurid%'
    OR `motivo_normalizado` LIKE ('%orientaci% jur' || char(237) || 'd%')
    OR `motivo_normalizado` LIKE '%juicio laboral%'
    OR `motivo_normalizado` LIKE '%juicio judicial%'
    OR `motivo_normalizado` LIKE '%juicio legal%'
    OR `motivo_normalizado` LIKE '%demanda laboral%'
    OR `motivo_normalizado` LIKE '%demanda judicial%'
    OR `motivo_normalizado` LIKE '%demanda legal%'
    OR `motivo_normalizado` LIKE '%denuncia laboral%'
    OR `motivo_normalizado` LIKE '%denuncia judicial%'
    OR `motivo_normalizado` LIKE '%denuncia legal%'
    OR `motivo_normalizado` LIKE '%litigio laboral%'
    OR `motivo_normalizado` LIKE '%litigio judicial%'
    OR `motivo_normalizado` LIKE '%litigio legal%'
    OR `motivo_normalizado` LIKE '%accion legal%'
    OR `motivo_normalizado` LIKE '%acción legal%'
    OR `motivo_normalizado` LIKE '%accion judicial%'
    OR `motivo_normalizado` LIKE '%acción judicial%'
    OR `motivo_normalizado` LIKE '%area%legales%'
    OR `motivo_normalizado` LIKE '%área%legales%'
    OR `motivo_normalizado` LIKE '%departamento%legales%'
    OR `motivo_normalizado` LIKE '%sector%legales%'
    OR `motivo_normalizado` LIKE '%intimaci%'
    OR `motivo_normalizado` LIKE '%intimar%'
    OR `motivo_normalizado` LIKE '%embargo judicial%'
    OR `motivo_normalizado` LIKE '%embargo laboral%'
    OR `motivo_normalizado` LIKE '%medida cautelar%judicial%'
    OR `motivo_normalizado` LIKE '%medida cautelar%laboral%'
    OR `motivo_normalizado` LIKE '%audiencia%laboral%'
    OR `motivo_normalizado` LIKE '%audiencia%judicial%'
    OR `motivo_normalizado` LIKE '%conciliaci%laboral%'
    OR `motivo_normalizado` LIKE '%conciliaci%judicial%'
    OR `motivo_normalizado` LIKE '%mediaci%laboral%'
    OR `motivo_normalizado` LIKE '%mediaci%judicial%'
    OR (
      `motivo_categoria` = 'sin_clasificar'
      AND (
        `resumen_normalizado` LIKE '%carta documento%'
        OR `resumen_normalizado` LIKE '%telegrama laboral%'
        OR `resumen_normalizado` LIKE '%patrocinio letrado%'
        OR `resumen_normalizado` LIKE '%estudio jurid%'
        OR `resumen_normalizado` LIKE ('%estudio jur' || char(237) || 'd%')
        OR `resumen_normalizado` LIKE '%seclo%'
        OR `resumen_normalizado` LIKE '%habl% con %abogad%'
        OR `resumen_normalizado` LIKE '%comunic% con %abogad%'
        OR `resumen_normalizado` LIKE '%contact% con %abogad%'
        OR `resumen_normalizado` LIKE '%contact% a %abogad%'
        OR `resumen_normalizado` LIKE '%consult% con %abogad%'
        OR `resumen_normalizado` LIKE '%consult% a %abogad%'
        OR `resumen_normalizado` LIKE '%deriv% a %abogad%'
        OR `resumen_normalizado` LIKE '%asesor% de %abogad%'
        OR `resumen_normalizado` LIKE '%asesor% por %abogad%'
        OR `resumen_normalizado` LIKE '%represent% por %abogad%'
        OR `resumen_normalizado` LIKE '%patrocin% por %abogad%'
        OR `resumen_normalizado` LIKE '%solicita abogad%'
        OR `resumen_normalizado` LIKE '%solicita un abogad%'
        OR `resumen_normalizado` LIKE '%busca abogad%'
        OR `resumen_normalizado` LIKE '%busca un abogad%'
        OR `resumen_normalizado` LIKE '%abogad%laboral%'
        OR `resumen_normalizado` LIKE '%abogad%judicial%'
        OR `resumen_normalizado` LIKE '%asesor% legal%'
        OR `resumen_normalizado` LIKE '%asesor% jurid%'
        OR `resumen_normalizado` LIKE ('%asesor% jur' || char(237) || 'd%')
        OR `resumen_normalizado` LIKE '%consulta legal%'
        OR `resumen_normalizado` LIKE '%consulta jurid%'
        OR `resumen_normalizado` LIKE ('%consulta jur' || char(237) || 'd%')
        OR `resumen_normalizado` LIKE '%orientaci% legal%'
        OR `resumen_normalizado` LIKE '%orientaci% jurid%'
        OR `resumen_normalizado` LIKE ('%orientaci% jur' || char(237) || 'd%')
        OR `resumen_normalizado` LIKE '%juicio laboral%'
        OR `resumen_normalizado` LIKE '%juicio judicial%'
        OR `resumen_normalizado` LIKE '%juicio legal%'
        OR `resumen_normalizado` LIKE '%demanda laboral%'
        OR `resumen_normalizado` LIKE '%demanda judicial%'
        OR `resumen_normalizado` LIKE '%demanda legal%'
        OR `resumen_normalizado` LIKE '%denuncia laboral%'
        OR `resumen_normalizado` LIKE '%denuncia judicial%'
        OR `resumen_normalizado` LIKE '%denuncia legal%'
        OR `resumen_normalizado` LIKE '%litigio laboral%'
        OR `resumen_normalizado` LIKE '%litigio judicial%'
        OR `resumen_normalizado` LIKE '%litigio legal%'
        OR `resumen_normalizado` LIKE '%accion legal%'
        OR `resumen_normalizado` LIKE '%acción legal%'
        OR `resumen_normalizado` LIKE '%accion judicial%'
        OR `resumen_normalizado` LIKE '%acción judicial%'
        OR `resumen_normalizado` LIKE '%area%legales%'
        OR `resumen_normalizado` LIKE '%área%legales%'
        OR `resumen_normalizado` LIKE '%departamento%legales%'
        OR `resumen_normalizado` LIKE '%sector%legales%'
        OR `resumen_normalizado` LIKE '%intimaci%'
        OR `resumen_normalizado` LIKE '%intimar%'
        OR `resumen_normalizado` LIKE '%embargo judicial%'
        OR `resumen_normalizado` LIKE '%embargo laboral%'
        OR `resumen_normalizado` LIKE '%medida cautelar%judicial%'
        OR `resumen_normalizado` LIKE '%medida cautelar%laboral%'
        OR `resumen_normalizado` LIKE '%audiencia%laboral%'
        OR `resumen_normalizado` LIKE '%audiencia%judicial%'
        OR `resumen_normalizado` LIKE '%conciliaci%laboral%'
        OR `resumen_normalizado` LIKE '%conciliaci%judicial%'
        OR `resumen_normalizado` LIKE '%mediaci%laboral%'
        OR `resumen_normalizado` LIKE '%mediaci%judicial%'
      )
    )
);
