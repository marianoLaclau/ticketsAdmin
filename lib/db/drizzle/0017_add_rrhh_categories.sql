-- Backfill de las categorías derivadas nuevas: préstamos y anticipos, obra
-- social y aportes, sanciones y ausencias, y proveedores y comercial.
--
-- Nunca modifica `motivo` ni `resumen`: solo reescribe la columna derivada
-- `motivo_categoria`. SQLite no tiene regex, así que cada regla replica con
-- LIKE la intención de `lib/ingesta/src/motivos.ts`, contemplando las variantes
-- con y sin tilde porque lower() no normaliza acentos.
--
-- El orden reproduce la precedencia del clasificador: cada bloque solo toca
-- filas que siguen en `sin_clasificar`, salvo las reclasificaciones explícitas
-- del final, que corrigen categorías asignadas por reglas anteriores.

-- 1) Proveedores y comercial: quien llama no es empleado.
UPDATE `tickets`
SET `motivo_categoria` = 'proveedores_comercial'
WHERE `motivo_categoria` = 'sin_clasificar'
  AND (
    lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%proveedor%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%cotizacion%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%cotizaci' || char(243) || 'n%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%propuesta comercial%'
  );
--> statement-breakpoint

-- 2) Sanciones y ausencias. Se exige el plural "faltas" o un calificativo,
-- para no capturar "falta de pago" ni "falta el recibo".
UPDATE `tickets`
SET `motivo_categoria` = 'sanciones_ausencias'
WHERE `motivo_categoria` IN (
    'sin_clasificar', 'obra_social', 'prestamos_anticipos',
    'recibos_documentacion', 'vacaciones_licencias', 'haberes_pagos',
    'empleo_postulaciones', 'contacto_general', 'reclamos'
  )
  AND (
    lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%suspensi%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%suspendid%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%apercibimiento%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%amonestaci%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%inasistencia%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%ausentismo%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%falta injustificada%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%faltas%'
  )
  AND lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) NOT LIKE '%faltas de pago%';
--> statement-breakpoint

-- 3) Obra social y aportes.
UPDATE `tickets`
SET `motivo_categoria` = 'obra_social'
WHERE `motivo_categoria` IN (
    'sin_clasificar', 'prestamos_anticipos', 'recibos_documentacion',
    'vacaciones_licencias', 'haberes_pagos', 'empleo_postulaciones',
    'contacto_general', 'reclamos'
  )
  AND (
    lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%obra social%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%obras sociales%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%osej%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%osde%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%swiss medical%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%pami%'
  );
--> statement-breakpoint

-- 4) Préstamos y anticipos.
UPDATE `tickets`
SET `motivo_categoria` = 'prestamos_anticipos'
WHERE `motivo_categoria` IN (
    'sin_clasificar', 'recibos_documentacion', 'vacaciones_licencias',
    'haberes_pagos', 'empleo_postulaciones', 'contacto_general', 'reclamos'
  )
  AND (
    lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%prestamo%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%pr' || char(233) || 'stamo%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%anticipo%'
  );
--> statement-breakpoint

-- 5) Liquidación final transcripta por el ASR como "licenciación".
UPDATE `tickets`
SET `motivo_categoria` = 'bajas_liquidacion'
WHERE `motivo_categoria` = 'sin_clasificar'
  AND (
    lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%licenciacion%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%licenciaci' || char(243) || 'n%'
  );
--> statement-breakpoint

-- 6) Pedido de atención humana. Va último entre los rescates: si el texto ya
-- mencionaba un tema concreto, lo tomó una regla anterior.
UPDATE `tickets`
SET `motivo_categoria` = 'contacto_general'
WHERE `motivo_categoria` = 'sin_clasificar'
  AND lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%hablar con%';
--> statement-breakpoint

-- 7) Reclasificaciones explícitas sobre filas que YA tenían categoría.
-- La indemnización es dinero por fin de vínculo: agrupa con la liquidación
-- final y no con un reclamo genérico ni con los haberes corrientes.
UPDATE `tickets`
SET `motivo_categoria` = 'bajas_liquidacion'
WHERE `motivo_categoria` IN ('reclamos', 'haberes_pagos')
  AND (
    lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%indemnizacion%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%indemnizaci' || char(243) || 'n%'
  );
--> statement-breakpoint

-- El adelanto de sueldo es un préstamo, no un haber corriente.
UPDATE `tickets`
SET `motivo_categoria` = 'prestamos_anticipos'
WHERE `motivo_categoria` = 'haberes_pagos'
  AND (
    lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%anticipo%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%adelanto de sueldo%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%prestamo%'
    OR lower(coalesce(`motivo`, '') || ' ' || coalesce(`resumen`, '')) LIKE '%pr' || char(233) || 'stamo%'
  );
