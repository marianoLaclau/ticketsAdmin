-- Hasta esta versión la columna física `token` contenía el bearer enviado por
-- la cookie. El backend ahora persiste un digest versionado en esa misma
-- columna. No existe una transformación SQL segura/portable y conservar los
-- valores anteriores mantendría secretos reutilizables en reposo, por eso la
-- transición revoca explícitamente todas las sesiones una única vez.
DELETE FROM `sesiones`;
