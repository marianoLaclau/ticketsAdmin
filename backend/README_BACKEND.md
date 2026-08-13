# Backend — GSB Tickets

API REST en Express 5. Es el único componente que toca la base de datos: el frontend, n8n y el script de importación le hablan por HTTP, nunca acceden a SQLite directamente (salvo el CLI de backup/importación, que usa `@workspace/db` en proceso).

Antes de ejecutar el seed o abrir el puerto, el proceso valida `WEBHOOK_API_KEY`: es obligatoria, diferentes, de al menos 32 caracteres y no pueden ser placeholders, un único carácter repetido, controles ni tener espacios exteriores. La validación falla sin registrar los secretos, de modo que una configuración incompleta nunca queda marcada como saludable.

> Para el panorama general del proyecto ver el [README.md](../README.md) de la raíz. Este documento es el detalle técnico de todo lo que vive en `backend/`.

## Índice

- [Stack y arranque](#stack-y-arranque)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Ciclo de vida de un request](#ciclo-de-vida-de-un-request)
- [Rutas de la API](#rutas-de-la-api)
- [Autenticación y autorización](#autenticación-y-autorización)
- [Base de datos](#base-de-datos)
- [Categorización de motivos](#categorización-de-motivos)
- [Prioridad automática y auditoría](#prioridad-automática-y-auditoría)
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
  build.mjs               → build con esbuild (bundle único, better-sqlite3 externo)
  src/
    app.ts                 → middlewares Express y montaje del router en /api
    index.ts               → entrypoint: entorno, seed, tareas, readiness y servidor
    migrate.ts             → aplica migraciones y termina (usado en Docker)
    modules/
      auth/                → sesión, login, contraseñas, seed y capacidades RBAC
        application/       → sesión y bootstrap
        data/              → selección de cuenta y persistencia de sesiones
        domain/            → roles y capacidades
        http/              → router y handlers HTTP
        security/          → cookies, scrypt, política y límites de login
      tickets/             → consulta, edición, auditoría, CSV y prioridad automática
        application/       → reglas y casos de uso
        data/              → consultas, orden, acceso y streaming CSV
        http/              → router y handlers
        jobs/              → runner periódico de prioridad
      dashboard/           → rango temporal, agregaciones y router del dashboard
      rendimiento/         → frontera ejecutiva protegida y estado del módulo
      administracion/      → tickets manuales, import/truncate, roles y usuarios
      ingestion/           → webhook idempotente de n8n y seguimiento de origen Serin
    shared/
      config/              → validación de secretos de servicio
      observability/       → logger estructurado
      realtime/            → clientes y eventos SSE
      runtime/             → entorno, readiness y ciclo de vida del proceso
      validation/          → validaciones técnicas compartidas
    routes/
      events.ts            → GET /events (SSE)
      health.ts            → GET /healthz y GET /readyz
      index.ts             → compone módulos y aplica los guards globales
```

Cada módulo expone únicamente su `index.ts`; la composición no importa archivos internos. Las capacidades técnicas reutilizables viven en `shared/`, mientras el esquema, las migraciones y los contratos continúan en los paquetes `lib/db` y `lib/api-spec` del workspace.

## Ciclo de vida de un request

`app.ts` arma la cadena de middlewares, en este orden:

Antes de montar middlewares desactiva `X-Powered-By`. La API no publica CORS: el navegador consume `/api` desde el mismo origen mediante el proxy de Vite o Nginx, y n8n es un cliente servidor-a-servidor que no depende de esos headers. Esto no reemplaza autenticación ni filtra clientes no-browser; una futura integración web cross-origin deberá declarar y probar sus orígenes explícitamente.

1. `pinoHttp` — loguea método, url (sin querystring) y status code de cada request.
2. `cookieParser()` — parsea la cookie de sesión.
3. `express.json()` / `express.urlencoded()`.
4. Todo el router se monta bajo `/api`.

Dentro de `routes/index.ts`, el orden importa:

```ts
router.use(healthRouter); // liveness/readiness públicos
router.use(webhooksRouter); // público (clave propia x-api-key)
router.use(authRouter); // login/logout públicos; password y me validan dentro

router.use(requireSession); // 🔒 todo lo que sigue exige sesión
router.use(requirePasswordChangeCompleted); // 🔒 bloquea credenciales temporales
router.use(ticketsRouter);
router.use(dashboardRouter);
router.use(rendimientoRouter); // dentro: SysAdmin o Controller
router.use(adminRouter); // dentro: solo SysAdmin
router.use(eventsRouter); // SSE — también detrás del candado
```

Cada handler individual sigue el mismo patrón: `safeParse` con el schema Zod generado → si falla, 400 → lógica → `res.json(...)`.

El proceso nace en `starting`. Recién en el evento `listening` pasa a `ready`; en cada consulta valida que SQLite esté abierto y que pueda preparar/ejecutar lecturas acotadas sobre Tickets, la proyección de cuarentena y todas las columnas runtime de `sesiones`, incluidas las dos agregadas por `0016`. Al recibir una señal cambia primero a `draining`, de forma irreversible, antes de logs, timers o cierres. Por eso un balanceador deja de enviar tráfico nuevo mientras las solicitudes existentes terminan. La sonda no ejecuta conteos, escrituras ni `integrity_check`, y nunca devuelve el error interno de SQLite.

## Rutas de la API

Todas bajo el prefijo `/api`. ✅ = requiere sesión. 🔑 = además, rol SysAdmin y contraseña definitiva. 🧭 = acceso ejecutivo para SysAdmin o Controller.

| Método y ruta                       | Qué hace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Acceso                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `GET /healthz`                      | Chequeo de vida                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | público                          |
| `GET /readyz`                       | `200 { status: "ready" }` solo después de escuchar, con SQLite y schema mínimo disponibles; durante arranque, fallo de dependencia o drenaje devuelve `503 { status: "unavailable" }`.                                                                                                                                                                                                                                                                                                                                                                                                                                             | público                          |
| `POST /webhooks/ticket`             | Ingesta de una llamada desde n8n. Idempotente por `conversation_id`: si ya existe, `200 { created: false, ticket }`; si no, `201 { created: true, ticket }`. Si llega una empresa real, crea atómicamente el primer seguimiento indicando que los datos fueron extraídos y persistidos desde Serin mediante el DNI proporcionado. Si no viene `fecha_limite`, se preestablece a **48 horas hábiles de lunes a viernes**; si viene, debe ser RFC3339 con zona (no se coercionan `null`/booleanos/números). Emite `ticket_creado` para tickets operativos y `datos_actualizados` si el registro queda en cuarentena por estar vacío. | `x-api-key: WEBHOOK_API_KEY`     |
| `POST /auth/login`                  | Body `{ usuario, password }` (`usuario` = el `username` asignado al crear la cuenta, no el email; se normaliza a minúsculas). Devuelve `AuthUser` y setea la cookie `gsb_session`. Mensaje de error genérico a propósito (no revela si el usuario existe). Después de diez credenciales rechazadas para la misma identidad en 15 minutos responde `429` con `Retry-After`.                                                                                                                                                                                                                                                         | público                          |
| `POST /auth/logout`                 | Revoca la sesión actual si existe y limpia la cookie de forma idempotente. `204`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | público                          |
| `GET /auth/me`                      | Devuelve el `AuthUser` de la sesión activa, o `401`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ✅                               |
| `POST /auth/password`               | Cambia la contraseña propia con `{ password_actual, password_nueva }`. La actual conserva el contrato histórico de 1–128; la nueva aplica la política compartida y debe ser distinta. En una transacción limpia `debe_cambiar_password`, revoca todas las sesiones y crea una nueva para el navegador actual.                                                                                                                                                                                                                                                                                                                      | ✅, incluso con cambio pendiente |
| `GET /tickets`                      | Listado con filtros: `estado`, `prioridad`, `fecha_desde`/`fecha_hasta` (día calendario **local**, según `TZ`), `hora_desde`/`hora_hasta`, `empresa`, `motivo`, `motivo_categoria`, `search`, `vencidos`; orden server-side con `sort_by` sobre una lista cerrada de columnas y `order`; paginación `page`/`limit` (1–100). `incluir_vacios=true` agrega la cuarentena únicamente con acceso administrativo.                                                                                                                                                                                                                       | ✅ / ✅🔑🔑                      |
| `GET /tickets/export.csv`           | Exporta **todos** los tickets operativos que coinciden con los mismos filtros y orden del listado, sin limitarse a la página visible. CSV UTF-8 con BOM, separador `;` y protección ante fórmulas.                                                                                                                                                                                                                                                                                                                                                                                                                                 | ✅                               |
| `GET /tickets/:id`                  | Detalle + array de `seguimientos`. Admite `incluir_vacios=true` con acceso administrativo para abrir un registro en cuarentena.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | ✅ / ✅🔑🔑                      |
| `PATCH /tickets/:id`                | Requiere `expected_version`, al menos un campo editable y capacidad `gestionar_tickets`; Controller recibe `403`. Los campos técnicos (`hora`, `notificado`, `audio_url`, `fecha_resolucion`, `fecha_limite`) exigen además SysAdmin. Un cambio real incrementa `version` junto con la auditoría; una versión vieja devuelve `409 TICKET_VERSION_CONFLICT` sin escribir. Motivo/resumen reclasifican y una transición real autoasigna.                                                                                                                                                                                             | ✅ excepto Controller / ✅🔑     |
| `DELETE /tickets/:id`               | Borra el ticket (cascada sobre sus seguimientos). `204`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ✅🔑🔑                           |
| `GET /tickets/:id/seguimientos`     | Historial ordenado por fecha; admite el acceso administrativo a cuarentena mediante `incluir_vacios=true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | ✅ / ✅🔑🔑                      |
| `POST /tickets/:id/seguimientos`    | Crea una nota para roles con capacidad `gestionar_tickets`; Controller recibe `403`. Admite el acceso SysAdmin a cuarentena. **`autor_usuario_id`, `autor` y el contexto se derivan en el backend desde la sesión y el ticket**, así el historial no es falsificable.                                                                                                                                                                                                                                                                                                                                                              | ✅ excepto Controller / ✅🔑     |
| `GET /dashboard/stats`              | Totales por estado/prioridad, vencidos, resueltos hoy/período, nuevos hoy/período y tiempo promedio. Admite `fecha_desde`/`fecha_hasta` inclusivas por fecha de creación; resueltos del período pertenece a esa misma cohorte.                                                                                                                                                                                                                                                                                                                                                                                                     | ✅                               |
| `GET /dashboard/actividad-reciente` | Mezcla de tickets creados + seguimientos, ordenados por fecha, con `limit` y `fecha_desde`/`fecha_hasta`; el rango se aplica a la fecha real de cada evento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ✅                               |
| `GET /dashboard/tickets-vencidos`   | Los que pasaron `fecha_limite` sin llegar a `resuelto`/`cerrado`, hasta 20; admite rango inclusivo por fecha de creación.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ✅                               |
| `GET /dashboard/motivos`            | Conteo por `motivo_categoria` (no por texto libre), con label y rango inclusivo por fecha de creación.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | ✅                               |
| `GET /rendimiento`                  | Estado contract-first del módulo ejecutivo: devuelve `estado: "preparacion"` y las vistas previstas, sin fabricar métricas. Toda la frontera `/rendimiento` nace protegida por `requirePerformanceAccess` y responde con `Cache-Control: private, no-store`.                                                                                                                                                                                                                                                                                                                                                                       | ✅🧭                             |
| `POST /admin/tickets`               | Alta manual (`409` si el `conversation_id` ya existe). Una `fecha_limite` explícita debe ser RFC3339 con zona. Emite `ticket_creado` para tickets operativos y `datos_actualizados` si el registro queda en cuarentena por estar vacío.                                                                                                                                                                                                                                                                                                                                                                                            | ✅🔑🔑                           |
| `GET /admin/roles`                  | Listado paginado de roles, con `search` sobre nombre/descripción.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ✅🔑🔑                           |
| `POST /admin/roles`                 | Crea un rol (`409` si el nombre ya existe).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅🔑🔑                           |
| `PATCH /admin/roles/:id`            | Edita nombre/descripción/activo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅🔑🔑                           |
| `DELETE /admin/roles/:id`           | Borra el rol; `409` si tiene usuarios asignados.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅🔑🔑                           |
| `GET /admin/users`                  | Listado paginado con `search`, `role_id`, `activo`. Nunca incluye `password_hash` en la respuesta.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | ✅🔑🔑                           |
| `POST /admin/users`                 | Crea un usuario con `username` y `password` obligatorios (el SysAdmin define las credenciales y se las entrega). `409` si el email o el username ya existen; `400` si el rol no existe o la contraseña incumple la política compartida.                                                                                                                                                                                                                                                                                                                                                                                            | ✅🔑🔑                           |
| `PATCH /admin/users/:id`            | Edita nombre/apellido/username/email/rol/activo. No acepta contraseña — eso sigue yendo por el endpoint dedicado.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ✅🔑🔑                           |
| `POST /admin/users/:id/password`    | Establece/reestablece una contraseña conforme a la política compartida y **revoca todas las sesiones activas de ese usuario**. `204`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | ✅🔑🔑                           |
| `DELETE /admin/users/:id`           | Borrado físico con doble aprobación: body `{ confirmar: true, username }` con el nombre exacto de esa cuenta. Rechaza la cuenta propia (`409 SELF_DELETE_FORBIDDEN`), un nombre que no coincide (`409 USERNAME_MISMATCH`) y el último SysAdmin utilizable. Borra sus sesiones y corta su SSE. `204`.                                                                                                                                                                                                                                                                                                                               | ✅🔑                             |
| `POST /admin/import`                | Importación masiva desde CSV (texto plano en el body). Con `dry_run: true` solo simula. Idempotente por `conversation_id` y atómica: un fallo revierte la tanda completa. Emite `tickets_importados` solo después del commit.                                                                                                                                                                                                                                                                                                                                                                                                      | ✅🔑🔑                           |
| `POST /admin/truncate`              | Borra **todos** los tickets y seguimientos y reinicia los contadores autoincrement en una única transacción. Exige `{ confirmar: true }`. Emite `datos_actualizados` solo después del commit.                                                                                                                                                                                                                                                                                                                                                                                                                                      | ✅🔑🔑                           |
| `GET /events`                       | Stream SSE. Fuera del contrato OpenAPI a propósito (Orval no modela streams).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ✅                               |

## Autenticación y autorización

La política de roles y capacidades vive en [`src/modules/auth/domain/rbac.ts`](src/modules/auth/domain/rbac.ts); sesiones y middlewares, en [`src/modules/auth/application/session.ts`](src/modules/auth/application/session.ts).

### Sesiones

- Login exitoso → se genera un bearer aleatorio de 64 caracteres hexadecimales (`crypto.randomBytes(32)`) y se setea como cookie host-only `gsb_session` (`httpOnly`, `SameSite=Lax`, `path: /`). La tabla `sesiones` guarda únicamente `sha256:<digest>` con separación de dominio y expiración absoluta a **7 días**: una copia de SQLite no contiene un valor que pueda reutilizarse directamente como cookie. Sus opciones HTTP viven en un único helper usado también al rotarla y eliminarla.
- Cada request autenticado acepta únicamente el formato raw de la cookie, deriva el mismo hash una vez, hace join `sesiones → usuarios → roles`, considera vencido también el instante exacto del límite y valida que tanto el usuario como su rol sigan activos. Un digest robado de la base no pasa como cookie. Si la cookie está malformada, fue revocada, venció o la cuenta dejó de estar activa, elimina la fila cuando corresponde, expira la cookie y responde `401`; `/auth/me` y el candado global no generan un `Set-Cookie` cuando la petición nunca envió una cookie. Logout sí la expira siempre para conservar su semántica idempotente.
- Desactivar un usuario o un rol desde Administración elimina en la misma transacción todas las sesiones afectadas y, después del commit, envía `sesion_revocada` por cada conexión SSE antes de cerrarla. El frontend detiene la reconexión, descarta de inmediato toda la caché autenticada y vuelve a la entrada, que revalida desde cero la cookie actual; no conserva una pantalla autorizada con datos stale. Cambiar realmente `role_id` y resetear una contraseña desde Administración hacen lo mismo. Reenviar el mismo rol no expulsa al usuario y el cambio propio de contraseña conserva un cierre silencioso porque rota la cookie por una sesión válida. Reactivar una cuenta o rol no revive cookies anteriores. El heartbeat del stream vuelve a validar la cookie cada 25 segundos como defensa adicional ante expiraciones o revocaciones externas.
- `purgeExpiredSessions()` se invoca en cada login (barrido perezoso, no hay cron).
- `0011_invalidate_plaintext_sessions.sql` revoca una sola vez las sesiones que versiones anteriores guardaban como bearer. En cada arranque, `purgeUnsafeStoredSessions()` elimina además cualquier valor que no cumpla exactamente `sha256:<64 hex minúsculas>`; esto cubre un rollback seguido de roll-forward sin registrar secretos.
- Logout es idempotente: borra la fila de `sesiones` si existe y limpia la cookie. Todas las respuestas de `/auth/*` usan `Cache-Control: no-store`.
- **Alta, reset y bootstrap emiten credenciales temporales**: guardan `usuarios.debe_cambiar_password = true`. Mientras siga pendiente, `/auth/me`, `/auth/logout` y `/auth/password` continúan disponibles, pero tickets, dashboard, administración y SSE responden `403` con `code: "PASSWORD_CHANGE_REQUIRED"`.
- **Reset de contraseña revoca todas las sesiones del usuario** (`DELETE FROM sesiones WHERE usuario_id = ...`): si estaba logueado en otro navegador, queda afuera al instante y el próximo login exige reemplazar la clave temporal.
- **Cambio propio rota la sesión**: verifica la contraseña actual, genera el hash fuera de la transacción y luego compara el hash observado antes de actualizarlo. En una sola transacción limpia el flag, elimina todos los tokens y crea uno nuevo; por eso dos cambios concurrentes no pueden confirmar ambos ni dejar un estado parcial.

### Protección del login

`src/modules/auth/security/login-rate-limit.ts` reserva cada intento **antes** de consultar la contraseña. La clave es un SHA-256 con separación de dominio del `username` normalizado, nunca el nombre en claro. Una reserva pendiente evita que solicitudes paralelas atraviesen juntas el cupo, pero solo se confirma como fallo después de que el KDF rechazó las credenciales. Diez fallos dentro de una ventana deslizante de 15 minutos hacen que la siguiente solicitud active un bloqueo de 15 minutos y devuelva `429 LOGIN_RATE_LIMITED`, `Retry-After`, `retry_after_seconds` y `Cache-Control: no-store`. Usuario inexistente, inactivo, rol inactivo y contraseña incorrecta recorren el mismo contador y conservan el mismo error genérico.

Un login confirmado elimina el contador de su identidad. Crear o renombrar una cuenta y restablecer su contraseña también limpian los buckets pertinentes, por lo que la recuperación administrativa no deja al usuario esperando un bloqueo anterior. Las solicitudes que no consiguen lugar para verificar credenciales o terminan en `5xx` reembolsan su reserva y no se convierten en fallos de contraseña. Cortar la conexión no cancela una verificación ya admitida: su resultado real cierra la reserva, evitando que un cliente pueda eludir el límite mediante abortos deliberados.

La admisión criptográfica combina un token bucket global con ráfaga inicial de 30 KDF y reposición de 30 por minuto, cuatro trabajos scrypt simultáneos y hasta ocho en espera; el excedente recibe el mismo `429` con la espera calculada. Esto acota tanto la ráfaga como el consumo público sostenido aunque se roten nombres de usuario. El mapa admite hasta 20.000 identidades, guarda solo hashes y elimina entradas vencidas o de menor actividad al llegar al tope sin expulsar cuentas bloqueadas ni reservas en vuelo.

Ambos controles viven en memoria porque el despliegue soportado tiene una sola instancia backend. Un reinicio o redeploy limpia los contadores; si el sistema se replica, hay que reemplazar este store por uno compartido y conservar la misma interfaz. No se usa `X-Forwarded-For`: Nginx lo envía, pero el puerto 5000 también está publicado y confiarlo sin restringir el proxy permitiría falsificar el origen. La defensa principal se asocia a la cuenta, como recomienda OWASP, y la cola global protege el recurso criptográfico.

### El candado global

`requireSession` se monta una sola vez en `routes/index.ts`, después de health, webhook y autenticación. Login y logout son públicos; `/auth/me` y `/auth/password` validan su cookie dentro de `authRouter`. A continuación se monta `requirePasswordChangeCompleted`, que falla cerrado si el flag falta o no es `false`. Cualquier router funcional montado después hereda ambos controles; las tres operaciones permitidas durante el cambio obligatorio se autentican dentro de `authRouter` y no atraviesan el segundo guard.

El contrato OpenAPI tipa los códigos de `/auth/password` mediante `PasswordChangeError` y declara una respuesta `403` reutilizable para todas las operaciones detrás del segundo guard. El frontend invalida `/auth/me` al recibir `PASSWORD_CHANGE_REQUIRED`, por lo que una pestaña abierta también converge a la pantalla obligatoria si el estado cambió en el servidor.

### Roles

Cuatro roles de sistema por nombre (constantes en `modules/auth/domain/rbac.ts`, espejadas en `frontend/src/lib/roles.ts`):

| Constante           | Valor             | Capacidades efectivas                                                                                 |
| ------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| `ROL_SYSADMIN`      | `"SysAdmin"`      | Dashboard, lectura/gestión/cierre de Tickets, Rendimiento y Administración                            |
| `ROL_CONTROLLER`    | `"Controller"`    | Dashboard, lectura de Tickets y Rendimiento; no gestiona tickets ni accede a Administración           |
| `ROL_ADMINISTRADOR` | `"Administrador"` | Dashboard y gestión completa de Tickets, incluido el cierre; sin Rendimiento ni Administración        |
| `ROL_OPERADOR`      | `"Operador"`      | Dashboard y gestión básica de Tickets; no puede cerrarlos, ver Rendimiento ni entrar a Administración |

Los cuatro nombres quedan reservados sin distinguir mayúsculas: esos roles no se pueden renombrar, desactivar ni eliminar, aunque sí se puede corregir su descripción. Los roles personalizados conservan su CRUD y el alcance operativo histórico; uno inactivo no admite nuevas asignaciones y revoca las sesiones y streams de sus usuarios. El backend también impide desactivar o degradar al último SysAdmin activo que tenga username y un hash scrypt utilizable.

La autorización se expresa mediante capacidades estáticas (`ver_dashboard`, `ver_tickets`, `gestionar_tickets`, `cerrar_tickets`, `ver_rendimiento`, `administrar`). `requireTicketWriteAccess` bloquea todas las mutaciones de Controller y `requirePerformanceAccess` limita Rendimiento a SysAdmin/Controller; ocultar controles en React es solo una mejora de UX.

### Borrado de usuarios frente a desactivación

La desactivación (`PATCH` con `activo: false`) es el camino recomendado: es
reversible y conserva la identidad en el historial. El borrado físico existe
para las cuentas que no deben quedar en el sistema y pide dos aprobaciones —
`confirmar: true` y repetir el nombre de usuario exacto—, de modo que un id
equivocado no pueda eliminar a otra persona ni siquiera llamando la API directo.

Las salvaguardas viven en la misma transacción: no se puede borrar la cuenta
propia ni el último SysAdmin activo con credenciales utilizables. El historial
sobrevive porque las referencias en `tickets` y `seguimientos` son
`ON DELETE SET NULL` y el nombre de quien hizo cada movimiento queda como
snapshot textual en la propia fila.

### La frontera de `/admin/*` es el rol

```
router.use("/admin", requireSysAdmin);
```

Hasta agosto de 2026 había además una segunda verificación: el SysAdmin
presentaba `ADMIN_API_KEY` en `POST /auth/admin-elevation` y recibía un permiso
ligado a esa sesión que vencía a los 15 minutos, tras lo cual cada operación
viajaba con `x-admin-intent: 1`. Se retiró junto con su rate limit, sus tres
endpoints y las dos columnas de `sesiones` (migración `0018`).

El motivo: en un sistema interno donde el panel ya está restringido por rol,
obligaba a reingresar una llave en medio de una tarea administrativa sin agregar
defensa real. El backend evalúa `requireSysAdmin` en cada request de forma
independiente del frontend, así que manipular la interfaz no alcanza: un
Operador recibe `403` igual.

### El webhook es independiente

`requireWebhookKey` no usa sesión: valida el header `x-api-key` contra `WEBHOOK_API_KEY` con comparación en tiempo constante (`timingSafeEqual` sobre un hash SHA-256, para no filtrar la clave por timing). Si la variable no está configurada responde `503` y el webhook queda cerrado. Este flujo vive en `modules/ingestion` y no concede acceso a Dashboard, Tickets, Rendimiento ni Administración.

### Contraseñas

La política de credenciales nuevas vive en `lib/password-policy` (`@workspace/password-policy`) y es consumida por alta, reset, bootstrap y frontend: 8 a 128 caracteres, sin controles C0/DEL ni whitespace al principio/final. También bloquea una lista acotada y explícita de credenciales comunes, placeholders y ejemplos públicos del repositorio, además de valores formados por un único carácter repetido. Se permiten espacios interiores y no se imponen reglas de composición. Los límites se miden con la longitud de string de JavaScript (unidades UTF-16), igual que los validadores Zod y los inputs actuales. La contraseña no se recorta ni normaliza antes de hashearla.

El login y el campo `password_actual` son deliberadamente distintos: aceptan de 1 a 128 caracteres para no bloquear credenciales históricas cortas, comunes o con espacios exteriores. Esa excepción solo verifica/rehashea valores ya existentes; nunca permite crear una contraseña nueva fuera de política. Un rehash de formato conserva `debe_cambiar_password`; no convierte una contraseña histórica en temporal.

La migración `0010_require_password_change.sql` agrega el booleano con `NOT NULL`, `DEFAULT true` y un `CHECK` cerrado a `0/1`. Después marca explícitamente en `false` a las cuentas históricas para no interrumpirlas. Las altas futuras quedan protegidas por defecto incluso si un consumidor omite el campo.

`src/modules/auth/security/passwords.ts` usa **scrypt asíncrono** del módulo `crypto` nativo de Node (sin dependencias externas como bcrypt/argon2), con parámetros explícitos `N=16384`, `r=8`, `p=1` y `maxmem=64 MiB`. El trabajo se ejecuta en el pool de libuv y no bloquea el event loop del servidor.

El formato actual es `scrypt$v1$16384$8$1$<salt-hex>$<hash-hex>`. Se siguen verificando los hashes históricos `scrypt:<salt-hex>:<hash-hex>` y, tras un login correcto, se reemplazan automáticamente por el formato versionado con una sal nueva. Antes de emitir la sesión se releen usuario, rol y hash dentro de una transacción; un reset concurrente impide autenticar la contraseña anterior. Dos logins simultáneos que verificaron el mismo hash legado revalidan una sola vez el hash migrado, por lo que ambos pueden crear su sesión si la clave continúa siendo válida. `verifyPassword` compara con `timingSafeEqual` y el login deriva una clave dummy equivalente cuando la identidad o el hash no existen, evitando enumeración por una diferencia obvia de costo criptográfico.

### Seed inicial (`src/modules/auth/application/seed.ts`)

Se ejecuta una vez en cada arranque del backend (`await ensureAdminSeed()` en `index.ts`, antes de abrir el puerto):

1. **Roles base**: crea `SysAdmin`, `Controller`, `Administrador` y `Operador` si faltan y reactiva cualquiera que hubiese quedado inactivo. Nunca renombra `Administrador` a `SysAdmin`, porque eso promovería también a todos sus usuarios.
2. **Compatibilidad de identidad**: si existe el usuario histórico `admin` y no existe `sysadmin`, normaliza únicamente esa identidad. Al rotar el seed heredado le asigna el rol `SysAdmin` canónico; los demás usuarios de `Administrador` permanecen en su rol.
3. **Alta inicial segura**: si ningún usuario tiene `password_hash`, exige `BOOTSTRAP_SYSADMIN_PASSWORD` (8 a 128 caracteres), crea el rol `SysAdmin`, guarda únicamente el hash scrypt y deja la contraseña como temporal. La validación ocurre antes de modificar filas y el backend no abre el puerto si falta o es inválida.
4. **Upgrade seguro**: detecta exclusivamente si `sysadmin` —o el nombre histórico `admin`— todavía conserva la credencial pública del seed anterior. En ese caso exige el mismo secreto externo, rota el hash, lo marca como temporal y revoca sus sesiones dentro de una transacción.
5. **Sin resets implícitos**: cualquier contraseña distinta de la credencial heredada queda intacta. Cambiar o conservar `BOOTSTRAP_SYSADMIN_PASSWORD` no modifica una cuenta ya asegurada.

## Base de datos

SQLite vía `better-sqlite3`, modo WAL, `foreign_keys = ON`. Definido en `lib/db/src/schema/`.

### `tickets` — una fila por llamada

| Columna                               | Tipo                                                                                          | Notas                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                  | integer PK autoincrement                                                                      | Uso interno; no se expone en la UI                                                                                                  |
| `version`                             | integer, default `1`, check `>= 1`                                                            | Revisión monotónica de la fila; cada cambio real del ticket la incrementa dentro de la misma transacción                            |
| `conversation_id`                     | text, **único**                                                                               | ID de ElevenLabs — clave de idempotencia                                                                                            |
| `hora`                                | text                                                                                          | `"HH:MM"` de la llamada                                                                                                             |
| `nombre`, `apellido`                  | text (nombre requerido)                                                                       | Datos del contacto                                                                                                                  |
| `telefono`, `dni`, `empresa`, `email` | text, nullable                                                                                |                                                                                                                                     |
| `estado_empleado`                     | text enum: `Activo` \| `Inactivo`, nullable                                                   | Informado por n8n; los registros anteriores permanecen en `null`                                                                    |
| `motivo`                              | text                                                                                          | Texto libre recibido; los procesos automáticos nunca lo reescriben, aunque puede corregirse mediante una edición funcional auditada |
| `motivo_categoria`                    | text enum, default `sin_clasificar`                                                           | Derivado de `motivo`/`resumen` por `clasificarMotivo()` — ver [Categorización de motivos](#categorización-de-motivos)               |
| `resumen`                             | text, nullable                                                                                |                                                                                                                                     |
| `notificado`                          | boolean, default `false`                                                                      |                                                                                                                                     |
| `estado`                              | text enum: `nuevo` \| `en_proceso` \| `pendiente` \| `resuelto` \| `cerrado`, default `nuevo` | Pasar a `cerrado` exige rol Administrador/SysAdmin                                                                                  |
| `prioridad`                           | text enum: `baja` \| `media` \| `alta` \| `urgente`, default `media`                          | Puede promoverse automáticamente según las horas hábiles restantes; nunca se degrada                                                |
| `asignado_usuario_id`                 | integer → `usuarios.id`, nullable                                                             | Identidad autoritativa; `onDelete: set null`                                                                                        |
| `asignado_a`                          | text, nullable                                                                                | Snapshot legible del responsable y compatibilidad histórica                                                                         |
| `audio_url`, `notas`                  | text, nullable                                                                                |                                                                                                                                     |
| `progreso`                            | integer, default `0`                                                                          | 0–100                                                                                                                               |
| `fecha_creacion`                      | integer (timestamp ms)                                                                        | Default: ahora; los importadores históricos usan la fecha/hora válida de la fila                                                    |
| `fecha_limite`                        | integer (timestamp ms), nullable                                                              | SLA de 48 horas hábiles desde `fecha_creacion`, pausado sábado/domingo, si no viene explícita (webhook/alta/import)                 |
| `fecha_resolucion`                    | integer (timestamp ms), nullable                                                              | Se autocompleta al entrar en `resuelto`/`cerrado`; se limpia al reabrir y se conserva al pasar de resuelto a cerrado                |

`estado_empleado` corresponde a la consulta de Serin para el DNI y la empresa recibidos. Si una edición manual cambia cualquiera de esos dos datos, el backend lo limpia automáticamente y audita también ese campo para no asociar un estado laboral anterior a otra identidad o empresa.

La migración `0012_add_ticket_version.sql` asigna `version = 1` a cada histórico sin reconstruir la tabla. Altas por webhook, Administración e importadores heredan ese default y no aceptan una versión externa. Las promociones automáticas de prioridad y la reconciliación de categorías incrementan la versión solo cuando su compare-and-set confirma un cambio; si falla la auditoría, el incremento también se revierte.

### `seguimientos` — historial de cada ticket

| Columna                                                     | Tipo                      | Notas                                                           |
| ----------------------------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| `id`                                                        | integer PK autoincrement  |                                                                 |
| `ticket_id`                                                 | integer → `tickets.id`    | `onDelete: cascade`                                             |
| `nota`                                                      | text                      |                                                                 |
| `estado_anterior`, `estado_nuevo`                           | text, nullable            | Registra transiciones de estado                                 |
| `prioridad_anterior`, `prioridad_nueva`                     | text, nullable            | Registra promociones manuales o automáticas                     |
| `asignado_anterior_usuario_id`, `asignado_nuevo_usuario_id` | integer, nullable         | Identidades de la asignación antes/después                      |
| `asignado_anterior`, `asignado_nuevo`                       | text, nullable            | Snapshots legibles de la asignación antes/después               |
| `campos_editados`                                           | JSON de strings, nullable | Nombres de los campos modificados; no duplica valores sensibles |
| `autor`                                                     | text, nullable            | **Asignado por el backend** desde la sesión, no por el cliente  |
| `fecha_creacion`                                            | integer (timestamp ms)    |                                                                 |

Cuando el webhook crea un ticket con empresa real, inserta en la misma transacción un seguimiento inicial con autor `Sistema` y la leyenda de origen Serin. Los reintentos por `conversation_id` no duplican esa entrada. El historial se ordena por fecha y luego por ID para conservar un orden determinista. La entrada automática permanece visible en el ticket, pero se excluye de `actividad-reciente` para no duplicar cada alta en el feed general.

### `roles`

| Columna                                 | Tipo                     | Notas                                                             |
| --------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `id`                                    | integer PK autoincrement |                                                                   |
| `nombre`                                | text, **único**          | `SysAdmin` / `Administrador` / `Operador` (o los que se agreguen) |
| `descripcion`                           | text, nullable           |                                                                   |
| `activo`                                | boolean, default `true`  | Desactivar ≠ borrar                                               |
| `fecha_creacion`, `fecha_actualizacion` | integer (timestamp ms)   |                                                                   |

No se puede borrar un rol con usuarios asignados (`409`), aunque esté inactivo.

### `usuarios`

| Columna                                 | Tipo                      | Notas                                                                                                                                                                          |
| --------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                    | integer PK autoincrement  |                                                                                                                                                                                |
| `nombre`                                | text                      |                                                                                                                                                                                |
| `apellido`                              | text, nullable            |                                                                                                                                                                                |
| `username`                              | text, **único**, nullable | El identificador de login (distinto del email). Nullable solo por compatibilidad con filas creadas antes de este campo — el seed lo backfillea con el email al arrancar        |
| `email`                                 | text, **único**           | Se normaliza a minúsculas al guardar; dato de contacto, ya no es el identificador de login                                                                                     |
| `password_hash`                         | text, **nullable**        | `null` = no puede loguearse todavía. Al crear un usuario desde el panel, `username` + `password` son obligatorios, así que en la práctica siempre queda seteado en ese momento |
| `role_id`                               | integer → `roles.id`      | `onDelete: restrict` — no se puede borrar un rol en uso                                                                                                                        |
| `activo`                                | boolean, default `true`   | Un usuario desactivado pierde el acceso aunque su sesión siga viva                                                                                                             |
| `fecha_creacion`, `fecha_actualizacion` | integer (timestamp ms)    |                                                                                                                                                                                |

### `sesiones`

| Columna            | Tipo                    | Notas                                                                                                |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `token`            | text PK                 | Nombre físico histórico; contiene solo `sha256:<64 hex>` del bearer, nunca el valor de `gsb_session` |
| `usuario_id`       | integer → `usuarios.id` | `onDelete: cascade`                                                                                  |
| `fecha_expiracion` | integer (timestamp ms)  | 7 días desde el login                                                                                |
| `fecha_creacion`   | integer (timestamp ms)  |                                                                                                      |

### Migraciones

- **Desarrollo local**: `pnpm --filter @workspace/db run push` ejecuta `drizzle-kit push` y luego reconcilia los invariantes SQL que el schema declarativo no puede representar. Esto conserva las bases locales históricas sin ledger y deja instalados el backfill y los triggers de cuarentena.
- **Cambiar el schema para que llegue a Docker/producción**: después de editar `lib/db/src/schema/*.ts`, correr `pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts` y **commitear** el SQL generado en `lib/db/drizzle/`. El contenedor corre `backend/dist/migrate.mjs` (compilado desde `src/migrate.ts`) al arrancar, que aplica cualquier migración pendiente vía el migrator de drizzle-orm — idempotente, no rompe si ya estaban aplicadas.
- Si se olvida generar la migración, el deploy en Docker arranca con el schema viejo (el volumen persiste entre deploys) y las columnas/tablas nuevas no existen ahí.
- El backend valida la proyección antes de seed, reclasificación y prioridad. Una instalación completa es un no-op; una base local sin ledger puede repararse transaccionalmente desde `0014`, pero una base con ledger incompleto se rechaza para no encubrir una migración omitida. No se debe ejecutar `push` con otro escritor activo.
- **v0.5 y hardening posterior**: después de `0007_add_estado_empleado.sql`, `0008_v05_auditoria_ticket.sql` agrega auditoría, `0009_add_embargos_category.sql` ejecuta el backfill de Embargos, `0010` incorpora credenciales temporales, `0011` revoca bearer históricos, `0012` agrega control optimista, `0013` indexa seguimientos, `0014` materializa la cuarentena, `0015` agrega índices medidos para lecturas operativas y `0016` agregó las dos columnas de elevación por sesión, que `0018` retira junto con esa funcionalidad. `0017` reclasifica motivos con las cuatro categorías nuevas de RRHH.

## Categorización de motivos

`lib/ingesta/src/motivos.ts` (importado como `@workspace/ingesta`). El texto de `motivo`/`resumen` que manda n8n es libre y nunca dos llamadas lo redactan igual — para poder filtrar y graficar hace falta una categoría estable.

- `clasificarMotivo(motivo, resumen?)` normaliza el texto (minúsculas, sin tildes, sin puntuación) y lo corre contra una lista ordenada de reglas (`REGLAS_CLASIFICACION_MOTIVO`, cada una con una categoría y un array de regex). **Gana la primera regla que matchea**, evaluada de la más específica a la más general (ej. "liquidación" antes que "sueldo", para no confundir un despido con una consulta de haberes).
- Si `motivo` no matchea ninguna regla, se prueba con `resumen` antes de rendirse. Si tampoco, cae en `sin_clasificar`.
- Al arrancar, `backend/src/modules/tickets/application/reclassify-reasons.ts` compara la categoría guardada con el resultado actual y actualiza solo las diferencias mediante compare-and-set. Así los históricos convergen a las mismas reglas que los tickets nuevos sin alterar los datos fuente.
- Categorías actuales: `haberes_pagos`, `recibos_documentacion`, `vacaciones_licencias`, `bajas_liquidacion`, `empleo_postulaciones`, `contacto_general`, `reclamos`, `legales`, `embargos`, `sin_clasificar`.
- `legales` exige señales jurídicas concretas (por ejemplo, carta documento, telegrama laboral, contacto explícito con un abogado, SECLO, intimación o consulta jurídica). Una profesión mencionada incidentalmente o la palabra `legal` aislada no alcanzan, para evitar falsos positivos.
- `embargos` se evalúa antes de `legales` y de las reglas generales. Reconoce variantes directas de embargo/desembargo y órdenes o retenciones judiciales, pero excluye expresamente “sin embargo” para reducir falsos positivos.
- Se recalcula en tres puntos: al ingerir por webhook, al importar CSV, y al editar `motivo`/`resumen` de un ticket existente (`PATCH /tickets/:id`). El clasificador y su backfill nunca pisan esos textos: solo derivan `motivo_categoria`. Una corrección explícita hecha por un usuario sí modifica el campo funcional y queda auditada.

## Prioridad automática y auditoría

Antes de abrir el puerto, `index.ts` ejecuta una primera revisión de tickets elegibles. Después, `prioridad-automatica-runner.ts` repite la pasada cada 5 minutos por defecto, evita ejecuciones solapadas y registra los errores sin detener el servidor. Solo evalúa tickets visibles, con `fecha_limite` y sin estado final (`resuelto`/`cerrado`).

- con 24 horas hábiles o menos restantes, promueve a `alta`;
- con 12 horas hábiles o menos —o ya vencido— promueve a `urgente`;
- nunca degrada una prioridad manual o automática superior;
- usa una comparación condicional contra prioridad, estado y vencimiento leídos para no pisar una edición concurrente;
- la promoción y su seguimiento con autor `Sistema` se guardan en la misma transacción; el SSE `ticket_actualizado` se emite solo después del commit.

El cálculo usa horas hábiles firmadas y excluye sábados y domingos igual que el SLA. El intervalo se puede ajustar con `PRIORIDAD_AUTOMATICA_INTERVAL_MS`; valores menores a 10 segundos o inválidos vuelven al default seguro.

El `PATCH` de tickets aplica la misma garantía transaccional bajo `BEGIN IMMEDIATE`: toma un snapshot autoritativo, exige que `expected_version` coincida, persiste solo diferencias reales, incrementa la versión y registra estado, prioridad, asignación y nombres de campos editados. El UPDATE conserva una segunda condición por versión. Un conflicto devuelve un código estructurado con las revisiones esperada/actual, sin tocar ticket, asignación, fechas, auditoría ni SSE. Un no-op con versión vigente responde el ticket sin incrementar ni auditar. `notas: null` y una nota compuesta solo por espacios se normalizan a `NULL`; las fechas técnicas continúan rechazando `null` porque su ciclo de vida lo controla el backend.

El diálogo operativo del frontend captura datos y versión como un único baseline al abrirse y envía únicamente estado, prioridad, progreso, notas o fecha límite que el usuario modificó. Si llega un SSE, el ticket vivo se refresca pero la precondición del editor permanece congelada. Un `409` conserva abierto el draft y bloquea Guardar; solo la acción explícita de descartar cambios carga la versión actual y habilita una nueva edición. Elegir un estado propone inmediatamente su progreso canónico y un ajuste manual posterior permanece explícito.

El editor de datos de contacto aplica el mismo principio con dos objetos separados: baseline versionado de apertura y draft local. Su `useMemo` compara esos formularios inmutables, nunca el `ticket` vivo; por eso un teléfono o empresa corregidos por otra sesión durante la edición no reaparecen en el PATCH y la versión de un SSE no legitima un draft anterior.

El CRUD de tickets de Administración también conserva un baseline versionado al abrir cada fila. La edición omite `conversation_id`, envía un `TicketUpdate` mínimo y representa la limpieza deliberada de teléfono, DNI, empresa, email, resumen, notas o audio como `null`; cerrar sin cambios no llama a la API. En conflicto conserva formulario y draft, y recién reemplaza ambos cuando el SysAdmin elige cargar la versión actual. En un alta manual recorta los obligatorios y omite los opcionales vacíos para que defaults y normalización sigan perteneciendo al backend.

En las respuestas de `Ticket` y `Seguimiento`, una columna nullable siempre conserva su propiedad y usa `null` cuando no hay valor; no se representa como propiedad ausente. OpenAPI marca esos campos como requeridos + nullable, `TicketDetail.seguimientos` siempre es un array y el codegen refleja la forma real de Drizzle en TypeScript y Zod.

## Ingesta y CSV compartidos

`lib/ingesta/src/index.ts` (`@workspace/ingesta`) es una librería **pura** (sin DB, sin Node más allá de lo estándar) compartida por dos consumidores:

- `scripts/src/import-excel.ts` — CLI, agrega soporte `.xlsx` vía `exceljs` encima de esto.
- `backend/src/modules/administracion/http/bulk-router.ts` (`POST /admin/import`) — importador web.

Expone: `parseCsv` (parser RFC 4180 con autodetección de `;`/`,`), `detectarColumnas` (mapea encabezados por alias — ver `HEADER_ALIASES` — tolerando variantes de nombre/acentos), `filaATicket` (combina fecha/hora histórica, valida formatos, convierte una fila cruda y aplica el SLA/clasificación), `fechaExcelAStringLocal` (conserva la hora civil de una celda Excel), `calcularFechaLimiteSla`/`sumarHorasHabiles`, el cálculo firmado de horas hábiles restantes y la prioridad mínima correspondiente, además de las constantes `ESTADOS_VALIDOS`/`PRIORIDADES_VALIDAS`.

Tanto el importador HTTP como el CLI preparan las filas antes de abrir la transacción y luego toman un snapshot consistente de `conversation_id`. Las corridas reales usan `BEGIN IMMEDIATE` para serializar escritores; `dry_run` conserva una transacción de solo lectura diferida. Un error de persistencia en cualquier insert revierte todas las filas insertables; las filas inválidas mantienen el contrato histórico de salteo, advertencia y conteo. Como una carga extensa conserva el lock de escritura hasta el commit, debe probarse primero con `dry_run` y ejecutarse en una ventana sin edición concurrente. El truncate incluye en la misma transacción seguimientos, tickets y `sqlite_sequence`, y no materializa IDs eliminados en memoria.

## Eventos en vivo (SSE)

`src/shared/realtime/events.ts` mantiene un `Map` en memoria con cada respuesta HTTP abierta y su identidad de usuario/sesión (una por pestaña conectada a `GET /api/events`). `broadcastEvent(tipo, data)` escribe `data: {...}\n\n` a todos los clientes conectados.

Emisores actuales:

- `POST /webhooks/ticket` → `ticket_creado` para tickets operativos (con `ticket_id`, `nombre`, `apellido`, `motivo`); `datos_actualizados` para registros vacíos en cuarentena.
- `POST /admin/tickets` → `ticket_creado` para tickets operativos; `datos_actualizados` para registros vacíos en cuarentena.
- `POST /admin/import` → `tickets_importados` (con cantidad visible y total insertado) si la tanda incluye al menos un ticket operativo; si todos los registros importados quedan en cuarentena, emite `datos_actualizados`. No emite eventos en `dry_run`.
- `POST /admin/truncate` → `datos_actualizados`
- `PATCH /tickets/:id` y cada promoción automática confirmada → `ticket_actualizado` con la versión nueva, siempre después de completar la transacción de datos + auditoría. Conflictos y no-op no emiten.

Las revocaciones administrativas de cuenta, rol o contraseña usan un evento terminal distinto: `sesion_revocada`. Se emite solo después de confirmar la eliminación de sesiones, no contiene datos sensibles y luego cierra el stream. El navegador ejecuta `EventSource.close()`, limpia React Query y reemplaza la ruta por la entrada pública. Allí vuelve a consultar `/auth/me`: normalmente muestra el login; si otra pestaña ya instaló una cookie válida, entra con esa identidad y crea un stream nuevo. Los cierres técnicos y la rotación de cookie del cambio propio permanecen silenciosos para no confundir una reconexión válida con una expulsión.

El endpoint manda `retry: 5000` (reconexión automática del navegador) y un heartbeat cada 25 s (`: ping\n\n`) para que proxies intermedios no corten la conexión por inactividad. En producción, nginx necesita un location dedicado con `proxy_buffering off` — ver `frontend/nginx.conf` y `docs/DEPLOY.md`.

> Esto es estado en memoria del proceso: funciona porque el backend corre como instancia única. Si algún día se escala horizontalmente, hace falta un pub/sub externo (Redis, etc.).

## Variables de entorno

Ver también la tabla en el [README raíz](../README.md#configuración). Las que lee específicamente el backend:

| Variable                           | Dónde se usa                     | Comportamiento si falta                                                                                                                |
| ---------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                             | `index.ts`                       | Default `5000`                                                                                                                         |
| `WEBHOOK_API_KEY`                  | `requireWebhookKey`              | El webhook responde `503` (cerrado)                                                                                                    |
| `BOOTSTRAP_SYSADMIN_PASSWORD`      | `ensureAdminSeed`                | En una base sin hashes o con el seed heredado, el arranque falla antes de escuchar tráfico; una cuenta ya asegurada no depende de ella |
| `TICKETS_DB_PATH`                  | `lib/db/src/db-path.ts`          | Default `<repo>/data/tickets.db` (busca la raíz del monorepo por `pnpm-workspace.yaml`)                                                |
| `PRIORIDAD_AUTOMATICA_INTERVAL_MS` | `prioridad-automatica-runner.ts` | Default `300000` (5 min); acepta enteros desde `10000` ms                                                                              |
| `TZ`                               | proceso Node (filtros de fecha)  | Zona del sistema; en Docker se fija `America/Argentina/Buenos_Aires` por default                                                       |
| `NODE_ENV`                         | `logger.ts`                      | En producción desactiva `pino-pretty` (logs JSON crudos)                                                                               |

## Build y despliegue

`build.mjs` bundlea API, migrador y utilidades operativas con esbuild a `dist/index.mjs`, `dist/migrate.mjs`, `dist/backup-db.mjs`, `dist/verify-db.mjs` y `dist/restore-db.mjs` (ESM). Solo la raíz exacta de `better-sqlite3` queda **fuera** del bundle como dependencia obligatoria porque carga un addon nativo; por eso es una dependencia productiva directa de `@workspace/backend`. El peer opcional `supports-color`, que `debug@4` intenta cargar bajo `try/catch`, puede permanecer como `require` opcional exclusivamente desde ese módulo. El build inspecciona el metafile de esbuild y falla ante cualquier otro external no builtin. ESLint prohíbe además referencias a `require`, cualquier forma de `createRequire` e imports dinámicos calculados en las fuentes bundleables de backend, scripts y librerías, de modo que las cargas propias permanezcan analizables por el gate.

En Docker (`Dockerfile.backend`): se buildea, se arma un `node_modules` de producción sin symlinks vía `pnpm --filter @workspace/backend deploy --prod --legacy` (necesario en pnpm 11 para este workspace), y el `CMD` corre `dist/migrate.mjs` antes que `dist/index.mjs` — las migraciones se aplican siempre antes de aceptar tráfico. Detalle completo de la infraestructura en [docs/DEPLOY.md](../docs/DEPLOY.md).

En GitHub, `pnpm run quality` constituye el primer job del workflow Quality y exige lint, formato Prettier sin drift, codegen, schema, pruebas, typecheck y builds. El segundo job, `e2e`, depende de ese resultado, instala Chromium y ejecuta `pnpm run test:e2e` contra backend, Vite y SQLite aislados. Ambos validan pull requests; Deploy es un workflow independiente disparado desde `main`. Si Playwright falla, Quality publica `e2e/artifacts/` como `playwright-diagnostics` durante 7 días.

## Backup y recuperación

`lib/db/src/backup.ts` (`createVerifiedSqliteBackup`) usa la API de backup online de better-sqlite3 (incluye transacciones confirmadas que todavía estén solo en el WAL, no en el archivo principal):

1. Copia a un archivo temporal `.partial` mediante un snapshot online, no con una copia directa del `.db`.
2. Normaliza el candidato privado a journal `DELETE`; el snapshot publicado queda autocontenido y no necesita archivos `-wal/-shm`. El verificador rechaza un header WAL o sidecars antes de abrirlos para no crearlos ni consumir estado externo.
3. Corre `PRAGMA integrity_check`, `foreign_key_check`, comprueba tablas más columnas históricas mínimas de TicketManager y calcula SHA-256, sin exigir el ledger opcional de migraciones.
4. Fuerza modo `0600` en POSIX, sincroniza archivo/directorio cuando la plataforma lo permite y recién entonces publica mediante un hard link no-clobber (nunca sobrescribe un destino existente).
5. Ante cualquier error elimina solamente sus temporales; un archivo de salida visible siempre es una copia completa y verificada.

CLI: `scripts/src/backup-db.ts`, expuesto para uso humano como `pnpm run backup:db -- --output <archivo> [--source <db>]`. Carga el `.env` del workspace y resuelve `TICKETS_DB_PATH` igual que el resto del sistema. Para automatización se ejecuta directamente `node dist/backup-db.mjs ... --json`, sin atravesar el wrapper de pnpm: reabre el pathname ya publicado y emite una sola evidencia versionada con SHA-256, bytes, páginas y los checks aplicados; un error usa stderr sin stack y un código estable.

`pnpm run verify:db -- --source <copia> --expect-evidence <evidencia.json>` ofrece la salida humana. El contrato automatizable usa directamente `node dist/verify-db.mjs ... --json`, porque pnpm agrega su propio output de lifecycle. La ruta puede cambiar, pero almacenamiento, hash, bytes y páginas deben coincidir exactamente; también vuelve a ejecutar integridad, FK y esquema mínimo en readonly. Se usa para validar backups operativos y candidatos de una restauración manual.

Los backups contienen PII, hashes de contraseña y hashes de sesión. En Windows el `chmod` de Node no reemplaza ACL correctas sobre la carpeta de destino; esa carpeta debe quedar accesible solo para el operador autorizado.

`lib/db/src/restore.ts` expone una restauración deliberadamente offline. Valida el candidato con las mismas reglas del backup, usa un lock exclusivo y controla la identidad `dev/ino` en cada transición. Si el destino existe, primero publica una recovery verificada y no-clobber, fijada también por inode y SHA-256; recién después consolida WAL y exige que SQLite pueda volver temporalmente a journal `DELETE`, por lo que una conexión activa hace fallar la operación conservando esa recovery. Un destino existente se reemplaza con `rename` atómico; uno originalmente ausente se crea con hard link no-clobber y rechaza archivos o sidecars que aparezcan durante la preparación. La comprobación posterior compara integridad, esquema, inode y SHA-256. Si falla, repone la recovery solo si tanto el archivo visible como la recovery siguen siendo exactamente los fijados por la operación; ante una sustitución ajena o un doble fallo conserva recovery, staging y lock para intervención manual.

CLI: `pnpm run restore:db -- --source <backup> --recovery-output <recovery> --confirm-stopped [--target <db>]`. `--allow-missing-target` queda reservado para una recuperación excepcional sobre un volumen vacío. El CLI no puede demostrar que un proceso externo esté detenido: `--confirm-stopped` es una precondición operativa, no un bypass técnico. El build ejecuta además el `--help` del bundle final como smoke test, no solo comprueba su fuente. El procedimiento Docker completo está en [docs/DEPLOY.md](../docs/DEPLOY.md#restauración-manual-de-sqlite).

## Convenciones de error

- Body/query inválido (falla `safeParse`) → `400`.
- Falta autenticación → `401` (sesión o webhook key ausente/inválida).
- Autenticado pero sin permiso → `403` (rol SysAdmin en admin, rol Administrador para cerrar tickets).
- Demasiados intentos de login o de elevar una sesión → `429` con `Retry-After` y un código estable.
- Recurso no encontrado → `404`.
- Conflicto (unique constraint, rol con usuarios asignados) → `409`.
- `GET /readyz` fuera de fase `ready` o sin el schema mínimo de SQLite → `503` intencional y genérico; no convierte `healthz` en un fallo ni expone la excepción interna.
- Todo lo demás sin capturar explícitamente propaga la excepción (Express 5 la atrapa y devuelve 500; queda logueada por pino-http).
