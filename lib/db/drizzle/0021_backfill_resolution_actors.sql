-- Recupera la identidad estructurada de quien resolvió tickets antes de que
-- existiera seguimientos.autor_usuario_id. No usa la asignación actual del
-- ticket: toma la última asignación auditada hasta el instante de la resolución.
--
-- Desde el origen del historial de estados, cada transición reasigna el ticket
-- al usuario autenticado. Como defensa adicional, el snapshot textual `autor`
-- debe coincidir con el nombre completo o username de esa identidad. Si falta
-- cualquiera de esas dos evidencias, la fila queda intacta.
--
-- La migración es idempotente y solo completa NULLs de resoluciones reales.
WITH asignaciones_ordenadas AS (
  SELECT
    resolucion.id AS resolucion_id,
    asignacion.asignado_nuevo_usuario_id AS usuario_id,
    row_number() OVER (
      PARTITION BY resolucion.id
      ORDER BY asignacion.fecha_creacion DESC, asignacion.id DESC
    ) AS posicion
  FROM seguimientos AS resolucion
  INNER JOIN seguimientos AS asignacion
    ON asignacion.ticket_id = resolucion.ticket_id
   AND (
     asignacion.asignado_anterior_usuario_id IS NOT NULL
     OR asignacion.asignado_nuevo_usuario_id IS NOT NULL
   )
   AND (
     asignacion.fecha_creacion < resolucion.fecha_creacion
     OR (
       asignacion.fecha_creacion = resolucion.fecha_creacion
       AND asignacion.id <= resolucion.id
     )
   )
  WHERE resolucion.autor_usuario_id IS NULL
    AND resolucion.estado_anterior IS NOT NULL
    AND resolucion.estado_anterior NOT IN ('resuelto', 'cerrado')
    AND resolucion.estado_nuevo IN ('resuelto', 'cerrado')
    AND NULLIF(trim(resolucion.autor), '') IS NOT NULL
),
candidatos AS (
  SELECT
    asignaciones_ordenadas.resolucion_id,
    asignaciones_ordenadas.usuario_id
  FROM asignaciones_ordenadas
  INNER JOIN seguimientos AS resolucion
    ON resolucion.id = asignaciones_ordenadas.resolucion_id
  INNER JOIN usuarios AS usuario
    ON usuario.id = asignaciones_ordenadas.usuario_id
  WHERE asignaciones_ordenadas.posicion = 1
    AND (
      lower(trim(resolucion.autor)) = lower(trim(
        usuario.nombre || ' ' || coalesce(usuario.apellido, '')
      ))
      OR lower(trim(resolucion.autor)) = lower(trim(coalesce(usuario.username, '')))
    )
)
UPDATE seguimientos
SET autor_usuario_id = (
  SELECT candidatos.usuario_id
  FROM candidatos
  WHERE candidatos.resolucion_id = seguimientos.id
)
WHERE autor_usuario_id IS NULL
  AND id IN (
    SELECT candidatos.resolucion_id
    FROM candidatos
  );
