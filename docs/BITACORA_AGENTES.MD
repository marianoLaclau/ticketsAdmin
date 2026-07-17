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

## 2026-07-17 — Admin: paginación y catálogo de roles y usuarios

**Agente:** Codex
**Contexto:** se amplió el área administrativa con paginación equivalente a la lista de tickets, acceso del sidebar identificado con un escudo y una pantalla persistente para gestionar roles y usuarios.

### Interfaz administrativa

- La tabla de registros de `/admin` ahora permite mostrar 10, 25, 50 o 100 filas, indica total y página actual, y ofrece navegación Anterior/Siguiente.
- Los cambios de tamaño vuelven a la primera página y, después de borrar o filtrar registros, la página se ajusta únicamente cuando existe una respuesta real del servidor. Esto evita que una consulta en curso haga rebotar la navegación a la página 1.
- Se extrajeron el ingreso de `ADMIN_API_KEY`, los mensajes de error y la navegación a componentes compartidos por las pantallas de administración.
- El acceso «Administración» del sidebar general conserva la rueda de configuración a la izquierda y muestra el escudo solicitado en el extremo derecho del botón.
- Dentro de Administración, el acceso principal conserva el nombre «Tickets» y su icono de ticket; el escudo se quitó de ese botón.
- Se agregó `/admin/roles-usuarios`, con:
  - listado paginado y filtros de usuarios;
  - alta y edición de nombre, apellido, email, rol y estado;
  - activación/desactivación sin borrado físico;
  - alta, edición, activación/desactivación y borrado de roles;
  - bloqueo del borrado de un rol mientras tenga usuarios asignados;
  - selector de roles que distingue los inactivos y exige al menos un rol activo para crear usuarios.

### Persistencia y API

- Se agregaron las tablas SQLite `roles` y `usuarios` en `lib/db/src/schema/admin.ts`.
- Los nombres de rol y emails son únicos; los emails se guardan en minúsculas y `usuarios.role_id` referencia a `roles.id` con borrado restringido.
- Se generó la migración Drizzle `lib/db/drizzle/0001_sticky_ted_forrester.sql` y su snapshot para que el cambio también se aplique al iniciar el backend empaquetado o Docker.
- Se incorporaron endpoints protegidos por el middleware administrativo existente:
  - `GET/POST /api/admin/roles`;
  - `PATCH/DELETE /api/admin/roles/:id`;
  - `GET/POST /api/admin/users`;
  - `PATCH /api/admin/users/:id`.
- El contrato se agregó a OpenAPI y se regeneraron el cliente React Query y los validadores Zod.

### Alcance de seguridad

- Los registros de usuarios y roles son por ahora un **catálogo administrativo persistente**, no identidades autenticables.
- No se agregaron contraseñas, login, sesiones ni autorización efectiva por rol. Asignar un rol todavía no habilita ni restringe pantallas.
- `ADMIN_API_KEY` continúa siendo la única llave de las rutas `/api/admin/*` y sigue siendo opcional en desarrollo; si no está configurada, esas rutas quedan abiertas.
- El CRUD general de tickets conserva el modelo actual sin autenticación. Antes de exponer el sistema a internet hace falta implementar autenticación y autorización completas.

### Base local y recuperación

- Antes de cambiar el schema se creó el backup WAL-safe `backups/pre-admin-roles-20260717T133213.db`.
- El backup pasó `PRAGMA integrity_check` y quedó fuera de Git.
- Se aplicó el schema a la base local con Drizzle; las tablas `roles` y `usuarios` quedaron disponibles y la integridad posterior resultó `ok`.

### Validaciones ejecutadas

- Codegen de OpenAPI, cliente React Query y Zod: correcto.
- `pnpm.cmd run build`: correcto; incluye typecheck de librerías, backend, frontend y scripts, más los builds de backend y frontend.
- Smoke HTTP sobre una base temporal:
  - acceso sin llave: `401`;
  - paginación inválida: `400`;
  - nombres de rol y emails duplicados: `409`;
  - email duplicado con diferencias de mayúsculas: `409`;
  - 13 usuarios distribuidos correctamente en páginas de 10 y 3;
  - filtro booleano inválido: `400`;
  - borrado de rol asignado: `409`;
  - desactivación y filtro por estado: correctos;
  - reasignación y posterior borrado de un rol sin usuarios: `204`;
  - búsqueda de roles y rol inexistente: resultados esperados.
- El backend temporal, sus logs y la base temporal se eliminaron al terminar la prueba.
- Persisten únicamente las advertencias no bloqueantes conocidas de Vite por sourcemaps y por el tamaño del bundle principal.

### Archivos locales preservados

- No se mezclaron los cambios SSE que continuaron desarrollándose en paralelo en `backend/src/lib/events.ts`, `backend/src/routes/events.ts`, `backend/src/routes/index.ts`, `backend/src/routes/webhooks.ts`, `frontend/nginx.conf` y `frontend/src/components/layout/AppLayout.tsx`.
- El escudo se agregó como indicador secundario en el extremo derecho del link «Administración» del sidebar, preservando la rueda original, el resto de su comportamiento y los cambios SSE concurrentes.

## 2026-07-17 — Actualización en vivo (SSE) al recibir llamados

**Agente:** Claude
**Contexto:** el usuario pidió que la app se actualice "solo cuando hay un nuevo llamado", sin recargar. Se completaron los archivos SSE que estaban en desarrollo y se integraron con el trabajo de roles/usuarios ya presente en el árbol.

### Cambio realizado

- `GET /api/events` (fuera del contrato OpenAPI a propósito: es un stream `text/event-stream` que Orval no puede modelar): mantiene la conexión abierta, manda `retry: 5000` para reconexión automática del navegador y un heartbeat cada 25 s para que los proxies no corten por inactividad.
- Registro de clientes y difusión en `backend/src/lib/events.ts` (estado en memoria del proceso; si algún día se escala horizontalmente hace falta pub/sub externo).
- Emisores: el webhook de n8n emite `ticket_creado` (con contacto y motivo), `/admin/import` emite `tickets_importados` (solo en corridas reales con insertados > 0) y `/admin/truncate` emite `datos_actualizados`.
- Frontend: `useEventosEnVivo()` en `AppLayout` — una única conexión `EventSource` por pestaña; ante cualquier evento invalida todas las queries de React Query (refresca listado, dashboard y sidebar al instante) y muestra un toast con el contacto y el motivo del llamado nuevo. El polling de 30 s del sidebar se conserva como respaldo.
- nginx (producción): location dedicado `/api/events` con `proxy_buffering off` y `proxy_read_timeout 1h` — sin esto nginx bufferea el stream y los eventos no llegan.

### Decisiones de integración

- Por pedido explícito del usuario, `/admin` vuelve a estar visible en el sidebar (revierte la decisión local anterior). Cuando exista login con permisos, el link se mostrará solo a usuarios habilitados. Se conservó el icono de escudo elegido por la intervención concurrente.
- Los broadcasts se insertaron sobre la versión actual de `backend/src/routes/admin.ts` (la que incluye roles/usuarios), sin tocar esa lógica.

### Validaciones ejecutadas

- Typecheck completo del workspace: correcto (con el trabajo de roles/usuarios del árbol incluido).
- Prueba en vivo contra el backend de desarrollo: con una conexión SSE abierta vía curl, un POST real al webhook entregó `{"tipo":"ticket_creado","ticket_id":24,...}` en el stream en el momento; el ticket de prueba se eliminó después.
- Archivos afectados: `backend/src/lib/events.ts`, `backend/src/routes/events.ts`, `backend/src/routes/index.ts`, `backend/src/routes/webhooks.ts`, `backend/src/routes/admin.ts` (solo broadcasts), `frontend/src/components/layout/AppLayout.tsx`, `frontend/nginx.conf`, `docs/FLUJO.md`.
