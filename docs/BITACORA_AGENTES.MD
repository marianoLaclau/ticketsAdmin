# Bitácora de agentes

Registro de intervenciones realizadas por asistentes sobre el repositorio. Cada entrada debe indicar alcance, decisiones, archivos afectados y validaciones ejecutadas.

## 2026-07-17 — Filtros, fechas/timezone y backup SQLite

**Agente:** Codex
**Contexto:** aplicación en desarrollo local. Se implementaron los puntos 2, 3 y 4 de la auditoría inicial. El endurecimiento de autenticación/PII quedó expresamente fuera de este alcance.

### 1. Filtros y paginación de tickets

- `fecha_desde` y `fecha_hasta` aceptan `YYYY-MM-DD` y se convierten al inicio y fin del día calendario local, respectivamente.
- Fechas inexistentes o con otro formato ahora responden `400`.
- `vencidos` acepta únicamente los booleanos `true` y `false`; se eliminó el comportamiento de Zod que convertía cualquier string no vacío en `true`.
- `page` debe ser entero y mayor o igual a 1.
- `limit` debe ser entero entre 1 y 100.
- Se actualizó OpenAPI, la configuración de Orval y los tipos/schemas generados.

Archivos principales: `backend/src/routes/tickets.ts`, `lib/api-spec/openapi.yaml`, `lib/api-spec/orval.config.ts`, `lib/api-zod/src/generated/**` y `lib/api-client-react/src/generated/api.schemas.ts`.

### 2. Edición de fecha límite y timezone

- El `datetime-local` del detalle muestra la hora local del navegador en vez de cortar directamente un ISO UTC.
- Una fecha modificada se valida y se convierte nuevamente a ISO/UTC antes del PATCH.
- Si el control no fue modificado, `fecha_limite` no se reenvía: se preserva el instante original, incluidos segundos y milisegundos.
- Fechas imposibles y horas inexistentes por cambios de DST son rechazadas en el cliente.
- El contrato actual no permite eliminar una fecha límite. Si se vacía el control, la UI lo informa y no envía el PATCH.
- Docker fija por defecto `TZ=America/Argentina/Buenos_Aires`, configurable mediante `TZ`, para que los filtros por día tengan la misma semántica que el entorno local.

Archivos principales: `frontend/src/lib/datetime-local.ts`, `frontend/src/pages/TicketDetail.tsx`, `.env.example` y `docker-compose.yml`.

### 3. Backup SQLite compatible con WAL

- Se agregó un backup online basado en `better-sqlite3#backup`, por lo que incorpora transacciones confirmadas que todavía estén en el WAL.
- La copia se genera primero como archivo parcial, se valida con `PRAGMA integrity_check` y recién entonces se publica.
- El destino es obligatorio, no puede ser la base de origen y nunca se sobrescribe.
- El CLI carga el `.env` del workspace, respeta `TICKETS_DB_PATH` y resuelve rutas relativas desde el directorio desde el que fue invocado.
- Comando local:

  ```bash
  pnpm run backup:db -- --output ./backups/tickets-AAAA-MM-DD.db
  ```

- El mismo CLI se empaqueta como `backend/dist/backup-db.mjs` para ejecutarlo dentro del contenedor.
- El runbook Docker dejó de copiar `tickets.db` con `cat`; ahora crea la copia verificada en `/tmp`, la extrae con `docker compose cp` y luego limpia el temporal.
- Se fijó el proyecto Compose como `ticketsadmin`, se aclaró la diferencia entre el checkout del runner y el checkout operativo, y se documentó cómo satisfacer `WEBHOOK_API_KEY` en comandos manuales sin reemplazar el secreto real del servicio.
- `/backups/` quedó excluido de Git y del contexto de build Docker.

Archivos principales: `lib/db/src/backup.ts`, `lib/db/src/db-path.ts`, `lib/db/package.json`, `scripts/src/backup-db.ts`, `scripts/package.json`, `backend/build.mjs`, `package.json`, `.gitignore`, `.dockerignore`, `README.md` y `docs/DEPLOY.md`.

### Validaciones ejecutadas

- `pnpm.cmd run build`: correcto; typecheck de backend, frontend, scripts y librerías, más builds de backend y frontend.
- Smoke HTTP sobre un backend temporal:
  - filtros de fecha válidos: `200`;
  - fecha inválida y booleano inválido: `400`;
  - `page=0`, `page=1.5`, `limit=-1` y `limit=101`: `400`;
  - consulta normal y `vencidos=false`: mismo total de 15 registros.
- Backup mediante CLI TypeScript y mediante el bundle de producción: ambos `Integridad: ok`, 7 páginas, 28.672 bytes y 15 tickets.
- Intento de reutilizar un destino existente: rechazado con exit code 1.
- Conversión verificada con `America/Argentina/Buenos_Aires`: `2026-07-17T15:30:45.123Z` se representa como `2026-07-17T12:30` en el control local.
- `docker-compose config -q`: configuración válida.
- `git diff --check`: sin errores de whitespace.

### Observaciones pendientes

- No se implementó la eliminación de `fecha_limite`; requiere hacer nullable ese campo en OpenAPI y regenerar ambos lados.
- No se modificaron los archivos SSE en desarrollo (`backend/src/lib/events.ts` y `backend/src/routes/events.ts`) ni el ajuste previo de `AppLayout.tsx`.
- Continúan las advertencias no bloqueantes de Vite por sourcemaps de algunos componentes UI y por el bundle principal de aproximadamente 850 kB.
- No se agregaron tests permanentes ni lint en esta intervención; corresponden al siguiente bloque de calidad del proyecto.

## 2026-07-17 — Orden compuesto por día y hora del llamado

**Agente:** Codex
**Contexto:** se ajustó el orden ascendente/descendente de la columna «Fecha y Hora» del listado de tickets.

### Cambio realizado

- El orden dejó de usar el timestamp completo de `fecha_creacion` como único criterio.
- Primero se ordena por el día calendario local derivado de `fecha_creacion`.
- Dentro de cada día se ordena por el campo `hora` del llamado.
- Cuando dos llamados tienen el mismo día y la misma hora, se usa `id` como desempate estable para evitar saltos entre páginas.
- La dirección elegida (`asc` o `desc`) se aplica a los tres criterios, por lo que descendente es el reverso exacto de ascendente.
- Se aclaró esta semántica en la descripción del parámetro `order` de OpenAPI.

Archivos afectados: `backend/src/routes/tickets.ts` y `lib/api-spec/openapi.yaml`.

### Validaciones ejecutadas

- Typecheck de backend: correcto.
- Build de backend: correcto.
- Smoke HTTP contra un backend temporal y la base local:
  - 15 tickets verificados en ascendente y descendente;
  - orden por día, hora e `id`: correcto en ambos sentidos;
  - el resultado descendente fue el reverso exacto del ascendente;
  - dentro del 16/07/2026, por ejemplo, `00:00` quedó antes de `11:34`, `13:43`, `14:26`, `14:48`, `17:44` y `17:52` en ascendente.
- El servidor temporal y sus logs fueron eliminados al finalizar la prueba.

### Observación

- Los 15 registros actuales tienen `hora` en formato `HH:MM`. El contrato todavía acepta strings libres; si en el futuro ingresan horas sin cero inicial o con otro formato, conviene validar y normalizar `hora` en OpenAPI, webhooks e importación.
