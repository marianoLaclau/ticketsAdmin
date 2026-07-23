# Backend — GSB Tickets

API REST en Express 5. Es el único componente que toca la base de datos: el frontend, n8n y el script de importación le hablan por HTTP, nunca acceden a SQLite directamente (salvo el CLI de backup/importación, que usa `@workspace/db` en proceso).

> Para el panorama general del proyecto ver el [README.md](../README.md) de la raíz. Este documento es el detalle técnico de todo lo que vive en `backend/`.

## Índice

- [Stack y arranque](#stack-y-arranque)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Ciclo de vida de un request](#ciclo-de-vida-de-un-request)
- [Rutas de la API](#rutas-de-la-api)
- [Autenticación y autorización](#autenticación-y-autorización)
- [Base de datos](#base-de-datos)
- [Categorización de motivos](#categorización-de-motivos)
- [Ingesta y CSV compartidos](#ingesta-y-csv-compartidos)
- [Eventos en vivo (SSE)](#eventos-en-vivo-sse)
- [Variables de entorno](#variables-de-entorno)
- [Build y despliegue](#build-y-despliegue)
- [Backup y recuperación](#backup-y-recuperación)
- [Convenciones de error](#convenciones-de-error)

## Stack y arranque

- **Express 5** sobre Node.js 24, TypeScript, ESM (`"type": "module"`).
- **Drizzle ORM** sobre **better-sqlite3** (síncrono, sin pool de conexiones).
- **Zod** (`zod/v4`) para validar todo lo que entra — generado desde el contrato OpenAPI, nunca escrito a mano.
- **pino** / **pino-http** para logging estructurado.
- **cookie-parser** para leer la cookie de sesión.

```bash
pnpm --filter @workspace/backend run dev     # build + start, puerto 5000 (o $PORT)
pnpm --filter @workspace/backend run build   # solo build (esbuild → dist/)
pnpm --filter @workspace/backend run typecheck
```

`dev` primero buildea (`node build.mjs`, esbuild) y después corre `node dist/index.mjs` — no hay watch mode; para iterar hay que volver a correr `dev`.

## Estructura de carpetas

```
backend/
  build.mjs              → build con esbuild (bundle único, better-sqlite3 externo)
  src/
    app.ts                → arma la app Express: middlewares + monta el router en /api
    index.ts               → entrypoint del servidor: carga .env, corre el seed, abre el puerto
    migrate.ts              → entrypoint separado: aplica migraciones y termina (usado en Docker)
    lib/
      auth.ts                → sesiones, roles, requireSession/requireSysAdmin/requireAdminKey/requireWebhookKey
      passwords.ts            → hash y verificación con scrypt
      seed.ts                  → crea/migra el usuario y rol semilla al arrancar
      events.ts                → registro de clientes SSE y broadcastEvent()
      logger.ts                 → instancia de pino
      load-env.ts                → carga el .env de la raíz del monorepo (walk-up)
    routes/
      auth.ts     → POST /auth/login, /auth/logout, GET /auth/me
      tickets.ts  → CRUD de tickets + seguimientos
      dashboard.ts→ estadísticas agregadas
      webhooks.ts → ingesta desde n8n
      admin.ts    → CRUD de tickets vía panel, roles, usuarios, import CSV, truncate
      events.ts   → GET /events (SSE)
      health.ts   → GET /healthz
      index.ts    → ensambla todos los routers y aplica el orden de middlewares
```

## Ciclo de vida de un request

`app.ts` arma la cadena de middlewares, en este orden:

1. `pinoHttp` — loguea método, url (sin querystring) y status code de cada request.
2. `cors()` — abierto (pensado para red local; no hay whitelist de orígenes).
3. `cookieParser()` — parsea la cookie de sesión.
4. `express.json()` / `express.urlencoded()`.
5. Todo el router se monta bajo `/api`.

Dentro de `routes/index.ts`, el orden importa:

```ts
router.use(healthRouter);      // público
router.use(webhooksRouter);    // público (clave propia x-api-key)
router.use(authRouter);        // público (login) / requiere sesión (logout, me)

router.use(requireSession);    // 🔒 candado global: todo lo que sigue exige sesión
router.use(ticketsRouter);
router.use(dashboardRouter);
router.use(adminRouter);       // dentro, además: requireSysAdmin + requireAdminKey
router.use(eventsRouter);      // SSE — también detrás del candado
```

Cada handler individual sigue el mismo patrón: `safeParse` con el schema Zod generado → si falla, 400 → lógica → `res.json(...)`.

## Rutas de la API

Todas bajo el prefijo `/api`. ✅ = requiere sesión (candado global). 🔑 = además, rol SysAdmin. 🗝️ = además, `x-admin-key`.

| Método y ruta | Qué hace | Acceso |
|---|---|---|
| `GET /healthz` | Chequeo de vida | público |
| `POST /webhooks/ticket` | Ingesta de una llamada desde n8n. Idempotente por `conversation_id`: si ya existe, `200 { created: false, ticket }`; si no, `201 { created: true, ticket }`. Si no viene `fecha_limite`, se preestablece a **48 horas hábiles de lunes a viernes**. Emite `ticket_creado` para tickets operativos y `datos_actualizados` si el registro queda en cuarentena por estar vacío. | `x-api-key: WEBHOOK_API_KEY` |
| `POST /auth/login` | Body `{ usuario, password }` (`usuario` = el `username` asignado al crear la cuenta, no el email; se normaliza a minúsculas). Devuelve `AuthUser` y setea la cookie `gsb_session`. Mensaje de error genérico a propósito (no revela si el usuario existe). | público |
| `POST /auth/logout` | Revoca la sesión actual (borra la fila) y limpia la cookie. `204`. | ✅ (no falla si no hay cookie) |
| `GET /auth/me` | Devuelve el `AuthUser` de la sesión activa, o `401`. | ✅ |
| `GET /tickets` | Listado con filtros: `estado`, `prioridad`, `fecha_desde`/`fecha_hasta` (día calendario **local**, según `TZ`), `hora_desde`/`hora_hasta`, `empresa`, `motivo` (texto libre), `motivo_categoria` (código exacto), `search` (nombre/apellido/teléfono/DNI/email/empresa/motivo/conversation_id), `vencidos` (boolean estricto), `order` (`asc`/`desc`, default `desc`), `page`/`limit` (1–100). | ✅ |
| `GET /tickets/:id` | Detalle + array de `seguimientos`. | ✅ |
| `PATCH /tickets/:id` | Los campos operativos (estado/prioridad/notas/progreso/fecha límite) requieren sesión. Los datos administrativos de contacto/origen exigen además SysAdmin + `x-admin-key`. Si `motivo` o `resumen` cambian, recalcula `motivo_categoria`; una transición real autoasigna al usuario. | ✅ / ✅🔑🗝️ |
| `DELETE /tickets/:id` | Borra el ticket (cascada sobre sus seguimientos). `204`. | ✅🔑🗝️ |
| `GET /tickets/:id/seguimientos` | Historial ordenado por fecha. | ✅ |
| `POST /tickets/:id/seguimientos` | Crea una nota. **El campo `autor` lo asigna el backend con el usuario de la sesión** — lo que mande el body se ignora, así el historial no es falsificable. | ✅ |
| `GET /dashboard/stats` | Totales por estado/prioridad, vencidos, resueltos hoy/período, nuevos hoy/período y tiempo promedio. Admite `fecha_desde`/`fecha_hasta` inclusivas por fecha de creación; resueltos del período pertenece a esa misma cohorte. | ✅ |
| `GET /dashboard/actividad-reciente` | Mezcla de tickets creados + seguimientos, ordenados por fecha, con `limit` y `fecha_desde`/`fecha_hasta`; el rango se aplica a la fecha real de cada evento. | ✅ |
| `GET /dashboard/tickets-vencidos` | Los que pasaron `fecha_limite` sin llegar a `resuelto`/`cerrado`, hasta 20; admite rango inclusivo por fecha de creación. | ✅ |
| `GET /dashboard/motivos` | Conteo por `motivo_categoria` (no por texto libre), con label y rango inclusivo por fecha de creación. | ✅ |
| `POST /admin/tickets` | Alta manual (`409` si el `conversation_id` ya existe). Emite `ticket_creado` para tickets operativos y `datos_actualizados` si el registro queda en cuarentena por estar vacío. | ✅🔑🗝️ |
| `GET /admin/roles` | Listado paginado de roles, con `search` sobre nombre/descripción. | ✅🔑🗝️ |
| `POST /admin/roles` | Crea un rol (`409` si el nombre ya existe). | ✅🔑🗝️ |
| `PATCH /admin/roles/:id` | Edita nombre/descripción/activo. | ✅🔑🗝️ |
| `DELETE /admin/roles/:id` | Borra el rol; `409` si tiene usuarios asignados. | ✅🔑🗝️ |
| `GET /admin/users` | Listado paginado con `search`, `role_id`, `activo`. Nunca incluye `password_hash` en la respuesta. | ✅🔑🗝️ |
| `POST /admin/users` | Crea un usuario con `username` y `password` obligatorios (el SysAdmin define las credenciales y se las entrega). `409` si el email o el username ya existen; `400` si el rol no existe o la contraseña tiene menos de 6 caracteres. | ✅🔑🗝️ |
| `PATCH /admin/users/:id` | Edita nombre/apellido/username/email/rol/activo. No acepta contraseña — eso sigue yendo por el endpoint dedicado. | ✅🔑🗝️ |
| `POST /admin/users/:id/password` | Establece/reestablece la contraseña (mínimo 6 caracteres) y **revoca todas las sesiones activas de ese usuario**. `204`. | ✅🔑🗝️ |
| `POST /admin/import` | Importación masiva desde CSV (texto plano en el body). Con `dry_run: true` solo simula. Idempotente por `conversation_id`. Emite `tickets_importados` si insertó algo real. | ✅🔑🗝️ |
| `POST /admin/truncate` | Borra **todos** los tickets y seguimientos y reinicia los contadores autoincrement. Exige `{ confirmar: true }`. Emite `datos_actualizados`. | ✅🔑🗝️ |
| `GET /events` | Stream SSE. Fuera del contrato OpenAPI a propósito (Orval no modela streams). | ✅ |

## Autenticación y autorización

Todo vive en [`src/lib/auth.ts`](src/lib/auth.ts).

### Sesiones

- Login exitoso → se genera un token aleatorio (`crypto.randomBytes(32)`), se guarda una fila en la tabla `sesiones` con expiración a **7 días**, y se setea como cookie `gsb_session` (`httpOnly`, `SameSite=Lax`, `path: /`).
- Cada request autenticado busca la cookie, hace join `sesiones → usuarios → roles`, valida que no haya expirado y que el usuario siga `activo`. Si algo falla, `401`.
- `purgeExpiredSessions()` se invoca en cada login (barrido perezoso, no hay cron).
- Logout borra la fila de `sesiones` y limpia la cookie.
- **Reset de contraseña revoca todas las sesiones del usuario** (`DELETE FROM sesiones WHERE usuario_id = ...`): si estaba logueado en otro navegador, queda afuera al instante.

### El candado global

`requireSession` se monta una sola vez en `routes/index.ts`, después de las rutas públicas. Cualquier router montado después queda protegido automáticamente — no hace falta acordarse de agregarlo ruta por ruta.

### Roles

Tres roles fijos por nombre (constantes en `auth.ts`, espejadas en `frontend/src/lib/roles.ts`):

| Constante | Valor | Regla |
|---|---|---|
| `ROL_SYSADMIN` | `"SysAdmin"` | Único que pasa `requireSysAdmin` → único con acceso a `/admin/*` |
| `ROL_ADMINISTRADOR` | `"Administrador"` | `puedeCerrarTickets()` devuelve `true` |
| `ROL_OPERADOR` | `"Operador"` | `puedeCerrarTickets()` devuelve `false` — el `PATCH /tickets/:id` con `estado: "cerrado"` le responde `403` |

> Los roles se verifican **por nombre** hoy. Cuando exista el sistema de permisos con checkboxes (roadmap), esto pasa a resolverse por permiso individual, no por nombre fijo — ver `docs/BITACORA_AGENTES.MD` para el historial de la decisión.

### Doble verificación en `/admin/*`

```
router.use("/admin", requireSysAdmin, requireAdminKey);
```

Dos capas encima de la sesión: primero el rol (`403` si no es SysAdmin), después la clave `ADMIN_API_KEY` vía header `x-admin-key` (`401` si no coincide). Si `ADMIN_API_KEY` no está configurada o está vacía, el backend responde `503`: la protección falla cerrada y nunca abre el panel accidentalmente.

### El webhook es independiente

`requireWebhookKey` no usa sesión: valida el header `x-api-key` contra `WEBHOOK_API_KEY` con comparación en tiempo constante (`timingSafeEqual` sobre un hash SHA-256, para no filtrar la clave por timing). Igual que la administración, si su variable no está configurada responde `503` y queda cerrado.

### Contraseñas

`src/lib/passwords.ts` usa **scrypt** del módulo `crypto` nativo de Node (sin dependencias externas como bcrypt/argon2, lo que simplifica el build de Docker). Formato guardado: `scrypt:<salt-hex>:<hash-hex>`. `verifyPassword` compara con `timingSafeEqual`.

### Seed inicial (`src/lib/seed.ts`)

Se ejecuta una vez en cada arranque del backend (`await ensureAdminSeed()` en `index.ts`, antes de abrir el puerto):

1. **Migración de nombres** (idempotente): si existe un rol `"Administrador"` pero no `"SysAdmin"`, lo renombra. Si existe un usuario `email: "admin"` pero no `"sysadmin"`, lo renombra. Esto es histórico — el seed original usaba esos nombres y se corrigió después; la migración deja las bases viejas (incluido el servidor de testing) al día solas.
2. **Roles base**: crea `Administrador` y `Operador` si no existen (siempre, en cada arranque).
3. **Alta inicial**: **solo si ningún usuario tiene `password_hash`**, crea el rol `SysAdmin` y el usuario `sysadmin` con clave `admin`. Si ya existe algún usuario con contraseña, no toca nada — así no revive la cuenta semilla si ya la reemplazaron por cuentas propias, y a la vez garantiza que el sistema nunca arranque sin que nadie pueda loguearse (evita el lockout total).

## Base de datos

SQLite vía `better-sqlite3`, modo WAL, `foreign_keys = ON`. Definido en `lib/db/src/schema/`.

### `tickets` — una fila por llamada

| Columna | Tipo | Notas |
|---|---|---|
| `id` | integer PK autoincrement | Uso interno; no se expone en la UI |
| `conversation_id` | text, **único** | ID de ElevenLabs — clave de idempotencia |
| `hora` | text | `"HH:MM"` de la llamada |
| `nombre`, `apellido` | text (nombre requerido) | Datos del contacto |
| `telefono`, `dni`, `empresa`, `email` | text, nullable | |
| `estado_empleado` | text enum: `Activo` \| `Inactivo`, nullable | Informado por n8n; los registros anteriores permanecen en `null` |
| `motivo` | text | Texto libre tal cual llega — **nunca se reescribe** |
| `motivo_categoria` | text enum, default `sin_clasificar` | Derivado de `motivo`/`resumen` por `clasificarMotivo()` — ver [Categorización de motivos](#categorización-de-motivos) |
| `resumen` | text, nullable | |
| `notificado` | boolean, default `false` | |
| `estado` | text enum: `nuevo` \| `en_proceso` \| `pendiente` \| `resuelto` \| `cerrado`, default `nuevo` | Pasar a `cerrado` exige rol Administrador/SysAdmin |
| `prioridad` | text enum: `baja` \| `media` \| `alta` \| `urgente`, default `media` | |
| `asignado_a`, `audio_url`, `notas` | text, nullable | |
| `progreso` | integer, default `0` | 0–100 |
| `fecha_creacion` | integer (timestamp ms) | Default: ahora; los importadores históricos usan la fecha/hora válida de la fila |
| `fecha_limite` | integer (timestamp ms), nullable | SLA de 48 horas hábiles desde `fecha_creacion`, pausado sábado/domingo, si no viene explícita (webhook/alta/import) |
| `fecha_resolucion` | integer (timestamp ms), nullable | Se autocompleta al pasar a `resuelto`/`cerrado` |

### `seguimientos` — historial de cada ticket

| Columna | Tipo | Notas |
|---|---|---|
| `id` | integer PK autoincrement | |
| `ticket_id` | integer → `tickets.id` | `onDelete: cascade` |
| `nota` | text | |
| `estado_anterior`, `estado_nuevo` | text, nullable | Registra transiciones de estado |
| `autor` | text, nullable | **Asignado por el backend** desde la sesión, no por el cliente |
| `fecha_creacion` | integer (timestamp ms) | |

### `roles`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | integer PK autoincrement | |
| `nombre` | text, **único** | `SysAdmin` / `Administrador` / `Operador` (o los que se agreguen) |
| `descripcion` | text, nullable | |
| `activo` | boolean, default `true` | Desactivar ≠ borrar |
| `fecha_creacion`, `fecha_actualizacion` | integer (timestamp ms) | |

No se puede borrar un rol con usuarios asignados (`409`), aunque esté inactivo.

### `usuarios`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | integer PK autoincrement | |
| `nombre` | text | |
| `apellido` | text, nullable | |
| `username` | text, **único**, nullable | El identificador de login (distinto del email). Nullable solo por compatibilidad con filas creadas antes de este campo — el seed lo backfillea con el email al arrancar |
| `email` | text, **único** | Se normaliza a minúsculas al guardar; dato de contacto, ya no es el identificador de login |
| `password_hash` | text, **nullable** | `null` = no puede loguearse todavía. Al crear un usuario desde el panel, `username` + `password` son obligatorios, así que en la práctica siempre queda seteado en ese momento |
| `role_id` | integer → `roles.id` | `onDelete: restrict` — no se puede borrar un rol en uso |
| `activo` | boolean, default `true` | Un usuario desactivado pierde el acceso aunque su sesión siga viva |
| `fecha_creacion`, `fecha_actualizacion` | integer (timestamp ms) | |

### `sesiones`

| Columna | Tipo | Notas |
|---|---|---|
| `token` | text PK | El valor de la cookie `gsb_session` |
| `usuario_id` | integer → `usuarios.id` | `onDelete: cascade` |
| `fecha_expiracion` | integer (timestamp ms) | 7 días desde el login |
| `fecha_creacion` | integer (timestamp ms) | |

### Migraciones

- **Desarrollo local**: `pnpm --filter @workspace/db run push` (drizzle-kit push, sin archivos de migración — rápido para iterar).
- **Cambiar el schema para que llegue a Docker/producción**: después de editar `lib/db/src/schema/*.ts`, correr `pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts` y **commitear** el SQL generado en `lib/db/drizzle/`. El contenedor corre `backend/dist/migrate.mjs` (compilado desde `src/migrate.ts`) al arrancar, que aplica cualquier migración pendiente vía el migrator de drizzle-orm — idempotente, no rompe si ya estaban aplicadas.
- Si se olvida generar la migración, el deploy en Docker arranca con el schema viejo (el volumen persiste entre deploys) y las columnas/tablas nuevas no existen ahí.

## Categorización de motivos

`lib/ingesta/src/motivos.ts` (importado como `@workspace/ingesta`). El texto de `motivo`/`resumen` que manda n8n es libre y nunca dos llamadas lo redactan igual — para poder filtrar y graficar hace falta una categoría estable.

- `clasificarMotivo(motivo, resumen?)` normaliza el texto (minúsculas, sin tildes, sin puntuación) y lo corre contra una lista ordenada de reglas (`REGLAS_CLASIFICACION_MOTIVO`, cada una con una categoría y un array de regex). **Gana la primera regla que matchea**, evaluada de la más específica a la más general (ej. "liquidación" antes que "sueldo", para no confundir un despido con una consulta de haberes).
- Si `motivo` no matchea ninguna regla, se prueba con `resumen` antes de rendirse. Si tampoco, cae en `sin_clasificar`.
- Categorías actuales: `haberes_pagos`, `recibos_documentacion`, `vacaciones_licencias`, `bajas_liquidacion`, `empleo_postulaciones`, `contacto_general`, `reclamos`, `legales`, `sin_clasificar`.
- `legales` exige señales jurídicas concretas (por ejemplo, carta documento, telegrama laboral, contacto explícito con un abogado, SECLO, intimación o consulta jurídica). Una profesión mencionada incidentalmente o la palabra `legal` aislada no alcanzan, para evitar falsos positivos.
- Se recalcula en tres puntos: al ingerir por webhook, al importar CSV, y al editar `motivo`/`resumen` de un ticket existente (`PATCH /tickets/:id`). **`motivo` original nunca se pisa** — solo se deriva `motivo_categoria` a partir de él.

## Ingesta y CSV compartidos

`lib/ingesta/src/index.ts` (`@workspace/ingesta`) es una librería **pura** (sin DB, sin Node más allá de lo estándar) compartida por dos consumidores:

- `scripts/src/import-excel.ts` — CLI, agrega soporte `.xlsx` vía `exceljs` encima de esto.
- `backend/src/routes/admin.ts` (`POST /admin/import`) — importador web.

Expone: `parseCsv` (parser RFC 4180 con autodetección de `;`/`,`), `detectarColumnas` (mapea encabezados por alias — ver `HEADER_ALIASES` — tolerando variantes de nombre/acentos), `filaATicket` (combina fecha/hora histórica, valida formatos, convierte una fila cruda y aplica el SLA/clasificación), `fechaExcelAStringLocal` (conserva la hora civil de una celda Excel), `calcularFechaLimiteSla`/`sumarHorasHabiles`, y las constantes `ESTADOS_VALIDOS`/`PRIORIDADES_VALIDAS` (espejo del schema, duplicadas a propósito para que esta lib no arrastre `better-sqlite3`).

## Eventos en vivo (SSE)

`src/lib/events.ts` mantiene un `Set` en memoria de las respuestas HTTP abiertas (una por pestaña de navegador conectada a `GET /api/events`). `broadcastEvent(tipo, data)` escribe `data: {...}\n\n` a todos los clientes conectados.

Emisores actuales:
- `POST /webhooks/ticket` → `ticket_creado` para tickets operativos (con `ticket_id`, `nombre`, `apellido`, `motivo`); `datos_actualizados` para registros vacíos en cuarentena.
- `POST /admin/tickets` → `ticket_creado` para tickets operativos; `datos_actualizados` para registros vacíos en cuarentena.
- `POST /admin/import` → `tickets_importados` (con cantidad visible y total insertado) si la tanda incluye al menos un ticket operativo; si todos los registros importados quedan en cuarentena, emite `datos_actualizados`. No emite eventos en `dry_run`.
- `POST /admin/truncate` → `datos_actualizados`

El endpoint manda `retry: 5000` (reconexión automática del navegador) y un heartbeat cada 25 s (`: ping\n\n`) para que proxies intermedios no corten la conexión por inactividad. En producción, nginx necesita un location dedicado con `proxy_buffering off` — ver `frontend/nginx.conf` y `docs/DEPLOY.md`.

> Esto es estado en memoria del proceso: funciona porque el backend corre como instancia única. Si algún día se escala horizontalmente, hace falta un pub/sub externo (Redis, etc.).

## Variables de entorno

Ver también la tabla en el [README raíz](../README.md#configuración). Las que lee específicamente el backend:

| Variable | Dónde se usa | Comportamiento si falta |
|---|---|---|
| `PORT` | `index.ts` | Default `5000` |
| `WEBHOOK_API_KEY` | `requireWebhookKey` | El webhook responde `503` (cerrado) |
| `ADMIN_API_KEY` | `requireAdminKey` | Las operaciones administrativas responden `503` (cerradas) |
| `TICKETS_DB_PATH` | `lib/db/src/db-path.ts` | Default `<repo>/data/tickets.db` (busca la raíz del monorepo por `pnpm-workspace.yaml`) |
| `TZ` | proceso Node (filtros de fecha) | Zona del sistema; en Docker se fija `America/Argentina/Buenos_Aires` por default |
| `NODE_ENV` | `logger.ts` | En producción desactiva `pino-pretty` (logs JSON crudos) |

## Build y despliegue

`build.mjs` bundlea `src/index.ts` **y** `src/migrate.ts` con esbuild a `dist/index.mjs` / `dist/migrate.mjs` (ESM). `better-sqlite3` (y otro puñado de paquetes nativos, ver la lista `external` en `build.mjs`) queda **fuera** del bundle — por eso `better-sqlite3` es dependencia directa de `@workspace/backend` y no transitiva.

En Docker (`Dockerfile.backend`): se buildea, se arma un `node_modules` de producción sin symlinks vía `pnpm --filter @workspace/backend deploy --prod --legacy` (necesario en pnpm 11 para este workspace), y el `CMD` corre `dist/migrate.mjs` antes que `dist/index.mjs` — las migraciones se aplican siempre antes de aceptar tráfico. Detalle completo de la infraestructura en [docs/DEPLOY.md](../docs/DEPLOY.md).

## Backup y recuperación

`lib/db/src/backup.ts` (`createVerifiedSqliteBackup`) usa la API de backup online de better-sqlite3 (incluye transacciones confirmadas que todavía estén solo en el WAL, no en el archivo principal):

1. Copia a un archivo temporal `.partial`.
2. Corre `PRAGMA integrity_check` sobre la copia.
3. Solo si da `"ok"`, la publica con un hard link atómico al destino (nunca sobrescribe un destino existente).

CLI: `scripts/src/backup-db.ts`, expuesto como `pnpm run backup:db -- --output <archivo> [--source <db>]`. Carga el `.env` del workspace y resuelve `TICKETS_DB_PATH` igual que el resto del sistema.

## Convenciones de error

- Body/query inválido (falla `safeParse`) → `400`.
- Falta autenticación → `401` (sesión, webhook key, admin key).
- Autenticado pero sin permiso → `403` (rol SysAdmin en admin, rol Administrador para cerrar tickets).
- Recurso no encontrado → `404`.
- Conflicto (unique constraint, rol con usuarios asignados) → `409`.
- Todo lo demás sin capturar explícitamente propaga la excepción (Express 5 la atrapa y devuelve 500; queda logueada por pino-http).
