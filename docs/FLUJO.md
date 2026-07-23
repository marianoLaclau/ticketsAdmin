# GSB Tickets — Documentación del flujo completo

> Última actualización: julio 2026

## 1. El flujo de punta a punta

```
  Llamada telefónica
        │
        ▼
┌──────────────────┐   El agente de voz atiende, conversa con la persona
│   ElevenLabs     │   y al cortar arma un JSON con todos los datos:
│  (agente de voz) │   quién llamó, motivo, resumen, teléfono, DNI, empresa…
└────────┬─────────┘
         │ JSON
         ▼
┌──────────────────┐   Orquesta el post-llamada. Hace dos cosas en paralelo:
│       n8n        │   1) agrega una fila al Excel (respaldo histórico)
└────────┬─────────┘   2) POST al webhook de este sistema
         │
         │  POST /api/webhooks/ticket
         │  Header: x-api-key: <WEBHOOK_API_KEY>
         ▼
┌──────────────────┐   Valida el JSON (Zod), chequea que el conversation_id
│  Backend (API)   │   no exista ya (idempotente) y guarda el ticket
│  Express :5000   │   con estado "nuevo".
└────────┬─────────┘
         │ Drizzle ORM
         ▼
┌──────────────────┐   Base de datos local. Un solo archivo:
│      SQLite      │   data/tickets.db
└────────┬─────────┘
         │
         ▼
┌──────────────────┐   Los operadores ven el ticket aparecer en el
│ Frontend (React) │   dashboard y el listado, lo abren, lo gestionan
│    Vite :3000    │   y lo van moviendo de estado hasta cerrarlo.
└──────────────────┘
```

**Regla de oro**: los tickets NO se crean a mano. Nacen solos con cada llamada. El trabajo del operador es gestionarlos (cambiar estado, asignar, anotar seguimientos), no crearlos.

## 2. Qué hace cada componente

### ElevenLabs (externo)

Agente de voz conversacional que atiende el teléfono. Al finalizar cada llamada produce un JSON con los datos extraídos de la conversación y un link a la grabación (mp3 en SharePoint). Se identifica cada llamada con un `conversation_id` único (ej: `conv_4401kxjxp0te...`).

### n8n (externo)

Automatizador. Recibe el JSON de ElevenLabs y:

1. Agrega una fila al Excel de respaldo (`registrosTelefonicos`).
2. Hace un **HTTP Request** al webhook de este sistema.

Si n8n reintenta un envío (timeout, error de red), no pasa nada: el webhook detecta el `conversation_id` repetido y responde 200 sin duplicar.

#### Configuración del nodo HTTP Request en n8n

n8n y este sistema están en la misma red interna, así que n8n le pega directo a la IP de la máquina donde corre el backend (`HOST_IP` en el `.env` — hoy `192.168.6.61`).

| Campo                 | Valor                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Method**            | `POST`                                                                                                                     |
| **URL**               | `http://{{ HOST_IP }}:5000/api/webhooks/ticket` (con los valores actuales: `http://192.168.6.61:5000/api/webhooks/ticket`) |
| **Authentication**    | None (la auth va por header, no por esta opción)                                                                           |
| **Send Headers**      | activado                                                                                                                   |
| **Header 1**          | Name: `x-api-key` — Value: el valor de `WEBHOOK_API_KEY` del `.env`                                                        |
| **Send Body**         | activado                                                                                                                   |
| **Body Content Type** | JSON                                                                                                                       |
| **Response Format**   | JSON                                                                                                                       |

**Body** — mapear desde el JSON de ElevenLabs (obligatorios: `conversation_id`, `hora`, `nombre`, `apellido`, `motivo`):

```json
{
  "conversation_id": "{{ $json.conversation_id }}",
  "hora": "{{ $json.hora }}",
  "nombre": "{{ $json.nombre }}",
  "apellido": "{{ $json.apellido }}",
  "telefono": "{{ $json.telefono }}",
  "dni": "{{ $json.dni }}",
  "empresa": "{{ $json.empresa }}",
  "estado_empleado": "{{ $json.estado_empleado }}",
  "email": "{{ $json.email }}",
  "motivo": "{{ $json.motivo }}",
  "resumen": "{{ $json.resumen }}",
  "audio_url": "{{ $json.audio_url }}",
  "notas": "{{ $json.notas }}"
}
```

No hace falta mandar `fecha_limite`: el webhook la preestablece solo a **48 horas hábiles**, pausando el reloj durante sábado y domingo (ver sección de SLA más abajo). Los campos opcionales que no tengas simplemente se omiten del body.

**Respuestas del webhook**:

- `201` — ticket creado (primera vez que llega ese `conversation_id`).
- `200` con `created: false` — el ticket ya existía (reintento de n8n); no se duplica.
- `401` — la API key no coincide con `WEBHOOK_API_KEY`.
- `400` — falta algún campo obligatorio o tiene un tipo inválido.

**Firewall de Windows**: ya verificado — el puerto 5000 está abierto de entrada (regla existente que lo permite) y respondió correctamente desde la IP de red `192.168.6.61`. Si en algún momento se bloquea o se cambia de PC, se reabre así (PowerShell como administrador):

```powershell
New-NetFirewallRule -DisplayName "GSB Tickets API" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
```

### Backend — [backend/](../backend/)

API REST en Express 5. Único componente que toca la base. Rutas:

| Ruta                                     | Qué hace                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/webhooks/ticket`              | **Ingesta**: crea el ticket de una llamada. Única ruta con API key. Idempotente. Si no viene `fecha_limite`, se preestablece a **48 horas hábiles de lunes a viernes** (SLA). |
| `GET /api/tickets`                       | Listado operativo con filtros y paginación. Omite registros en cuarentena; `incluir_vacios=true` permite incluirlos solo con sesión SysAdmin y `x-admin-key`. |
| `GET /api/tickets/:id`                   | Detalle + historial de seguimientos.                                                                                                             |
| `PATCH /api/tickets/:id`                 | Editar estado, prioridad, progreso, notas o fecha límite. Una transición real de estado autoasigna al usuario de la sesión; los campos administrativos exigen SysAdmin + `x-admin-key`. |
| `DELETE /api/tickets/:id`                | Eliminar; exige sesión SysAdmin + `x-admin-key`.                                                                                                  |
| `GET/POST /api/tickets/:id/seguimientos` | Historial: notas con autor y cambios de estado.                                                                                                  |
| `GET /api/dashboard/stats`               | Totales y KPIs; acepta `fecha_desde`/`fecha_hasta` inclusivas por fecha de creación.                                                             |
| `GET /api/dashboard/actividad-reciente`  | Línea de tiempo de tickets y seguimientos; el rango se aplica a la fecha real del evento.                                                        |
| `GET /api/dashboard/tickets-vencidos`    | Vencidos del conjunto de tickets creados dentro del rango solicitado.                                                                            |
| `GET /api/dashboard/motivos`             | Categorías de contacto del conjunto creado dentro del rango solicitado.                                                                           |
| `GET /api/healthz`                       | Chequeo de vida.                                                                                                                                 |
| `POST /api/admin/tickets`                | **Admin**: alta manual de un registro (409 si el conversation_id existe).                                                                        |
| `POST /api/admin/import`                 | **Admin**: importación masiva desde CSV, con `dry_run` para simular. Idempotente.                                                                |
| `POST /api/admin/truncate`               | **Admin**: borra todos los registros y reinicia los ids (requiere `confirmar: true`).                                                            |
| `GET/POST /api/admin/roles`              | **Admin**: listado paginado y alta de roles.                                                                                                     |
| `PATCH/DELETE /api/admin/roles/:id`      | **Admin**: edición de roles y borrado solo si no tienen usuarios asignados.                                                                      |
| `GET/POST /api/admin/users`              | **Admin**: listado paginado, filtros y alta de usuarios.                                                                                         |
| `PATCH /api/admin/users/:id`             | **Admin**: edición, cambio de rol y activación/desactivación sin borrado físico.                                                                 |
| `GET /api/events`                        | **SSE**: stream de eventos en vivo. El frontend lo mantiene abierto y recibe `ticket_creado` / `tickets_importados` / `datos_actualizados` al instante. Fuera del contrato OpenAPI a propósito (es un stream, Orval no lo modela). |

Las rutas `admin`, el borrado y la edición administrativa de tickets exigen sesión SysAdmin y el header `x-admin-key`. Si `ADMIN_API_KEY` falta o está vacía, responden `503` y permanecen cerradas. Los nombres de rol y emails son únicos, los emails se normalizan a minúsculas y una clave foránea impide borrar roles asignados. La lógica de parseo del CSV es la misma del importador CLI: vive compartida en [lib/ingesta/](../lib/ingesta/).

Cada request: se loguea (pino) → se valida con Zod → se consulta/escribe con Drizzle → responde JSON.

#### Cuarentena administrativa de registros vacíos

El ingreso no descarta llamadas: aun cuando n8n o un importador entregue un registro sin datos útiles, la fila se conserva intacta en SQLite para auditoría y corrección. No se borra, no se reescribe y no se altera el payload original.

Un ticket entra en cuarentena únicamente cuando **todas** estas condiciones se cumplen al mismo tiempo (AND):

- `nombre` está vacío o contiene uno de los marcadores históricos `Sin nombre` / `Sin nombre proporcionado`;
- `apellido`, `telefono`, `dni`, `empresa`, `email`, `resumen` y `notas` están vacíos;
- `motivo` está vacío o contiene el marcador `Sin especificar`;
- conserva `estado = nuevo`, `prioridad = media`, `progreso = 0`, `notificado = false`, no tiene asignación ni seguimientos.

No participan de la decisión `id`, `conversation_id`, `hora`, las fechas, `motivo_categoria` ni `audio_url`: son identificadores, datos técnicos o valores generados automáticamente y, por sí solos, no convierten el registro en un ticket operativo.

La cuarentena se aplica de forma derivada en cada consulta. Por eso, un registro que ya tenga seguimientos no se oculta; y si un SysAdmin completa un dato o cambia alguno de los valores operativos anteriores, vuelve automáticamente a Tickets y al Dashboard. No necesita un proceso de recuperación ni un backfill.

Mientras permanece vacío queda fuera de:

- el listado `/tickets`, la ficha individual y sus seguimientos;
- KPIs, badges, actividad reciente, motivos y vencidos del Dashboard;
- los toasts de nuevos tickets e importaciones.

Sigue visible en la tabla de Administración mediante `GET /api/tickets?incluir_vacios=true`. Ese parámetro no es un bypass público: exige sesión con rol SysAdmin y la segunda credencial `ADMIN_API_KEY` enviada en `x-admin-key`.

### Frontend — [frontend/](../frontend/)

React + Vite. Pantallas principales:

- **Dashboard** (`/dashboard`): KPIs, distribución por estado, rendimiento, motivos, prioridades, vencidos y actividad. El desplegable permite visualizar Todo (default), semana actual, mes actual o un rango desde/hasta; el mismo período se aplica a todos los paneles.
- **Listado** (`/tickets`): tabla con contacto, categoría, motivo, estado, prioridad, **asignado**, progreso y fecha límite. Si existe una empresa y n8n informó `estado_empleado`, debajo se muestra `Activo` o `Inactivo`; sin empresa, la presentación no cambia. Si no existe responsable muestra `Sin asignar`; si nombre y apellido están vacíos muestra `Sin nombre proporcionado`, sin alterar los datos recibidos. Filtros combinables.
- **Detalle** (`/tickets/:id`): resumen de la llamada, reproductor de la grabación, datos del contacto, tiempos, edición de estado/prioridad/progreso y el historial de seguimientos. El estado laboral también se presenta debajo de la empresa cuando corresponde. Teléfono y email son filas fijas de esta ficha: cuando un valor no fue indicado se muestra `Teléfono no proporcionado` o `Email no proporcionado`.

**Actualización en vivo**: la app mantiene abierta una conexión SSE (`/api/events`). Cuando entra un llamado operativo nuevo por el webhook (o se importan registros operativos), **todas las pestañas abiertas se refrescan al instante** y muestran una notificación con el contacto y el motivo — sin recargar la página. Los registros vacíos en cuarentena no generan toast, aunque Administración puede refrescar sus datos. El refresco periódico de 30s del sidebar queda como respaldo por si la conexión de eventos se corta.

**Notificaciones del sidebar**: junto a "Tickets" hay dos numeritos — **ámbar** = tickets en estado `nuevo` (sin abrir), **rojo** = tickets vencidos.

- **Administración** (`/admin`): conserva la rueda de configuración a la izquierda y muestra un escudo administrativo en el extremo derecho del botón del sidebar; dentro del panel, la sección **Tickets** conserva la tabla CRUD con paginación configurable 10/25/50/100, incluye los registros vacíos en cuarentena mediante `incluir_vacios=true`, y ofrece el importador CSV y la zona peligrosa. La lectura inclusiva y sus mutaciones envían la segunda credencial `x-admin-key`.
- **Roles y usuarios** (`/admin/roles-usuarios`): altas y edición de perfiles, asignación de rol, filtros, activación/desactivación y gestión del catálogo de roles. Comparte con Tickets la clave `ADMIN_API_KEY`, enmascarada y persistida en el navegador por ID de SysAdmin. Los campos de contraseña también permanecen ocultos y ofrecen un botón de ojo.
- **Errores y sesión**: el login no tiene una ruta `/login`; vive en `/` cuando no hay sesión, mientras que una sesión válida que entra a la raíz se redirige a `/dashboard`. Un `401` vuelve a la raíz, un `403` muestra acceso denegado, un `404` identifica páginas o tickets inexistentes y los fallos `5xx`/conexión ofrecen reintentar. Todas las pantallas de error incluyen **Volver al inicio**. Los toasts traducen los errores a mensajes de usuario y no exponen HTTP, URLs, JSON ni validaciones internas.

En desarrollo, Vite proxea todo `/api/*` al backend (puerto 5000), por eso el frontend usa rutas relativas.

### El contrato OpenAPI — [lib/api-spec/openapi.yaml](../lib/api-spec/openapi.yaml)

La fuente de verdad de la API. De ahí, `pnpm --filter @workspace/api-spec run codegen` genera:

- [lib/api-client-react/](../lib/api-client-react/) — hooks de React Query que usa el frontend (`useListTickets`, `useGetDashboardStats`…)
- [lib/api-zod/](../lib/api-zod/) — schemas de validación que usa el backend

Si se cambia la API: primero se edita el yaml, se corre codegen, y después se implementa. Los dos lados quedan sincronizados por construcción.

## 3. Cómo se guardan los datos

**Motor**: SQLite — un único archivo (`data/tickets.db` en desarrollo local; en el servidor de testing vive dentro de un volumen Docker, ver [docs/DEPLOY.md](DEPLOY.md)). Sin servidores de base de datos, sin credenciales. Modo WAL activado (lecturas y escrituras concurrentes sin bloquearse).

**Schema** (definido en [lib/db/src/schema/tickets.ts](../lib/db/src/schema/tickets.ts) y [lib/db/src/schema/admin.ts](../lib/db/src/schema/admin.ts)):

### Tabla `tickets` — una fila por llamada

| Campo                                 | Tipo                   | Notas                                                                                                                                                                     |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                  | entero autoincremental | **Uso interno** (rutas de la API). No se muestra en la UI.                                                                                                                |
| `conversation_id`                     | texto, **único**       | El ID de ElevenLabs. Es la clave de idempotencia.                                                                                                                         |
| `hora`                                | texto "HH:MM"          | Hora de la llamada.                                                                                                                                                       |
| `nombre`, `apellido`                  | texto                  | Datos del llamante.                                                                                                                                                       |
| `telefono`, `dni`, `empresa`, `email` | texto, opcionales      | Datos del llamante. `empresa` viene de n8n.                                                                                                                               |
| `estado_empleado`                     | enum opcional          | `Activo` o `Inactivo`, informado por n8n. No vuelve visible por sí solo un registro vacío y solo se muestra si existe una empresa real.                                  |
| `motivo`                              | texto                  | Por qué llamó (título del ticket).                                                                                                                                        |
| `motivo_categoria`                    | enum derivado          | Clasificación estable sin alterar el texto original: haberes/pagos, recibos/documentación, vacaciones/licencias, bajas/liquidación, empleo, contacto, reclamos, legales o sin clasificar. |
| `resumen`                             | texto, opcional        | Resumen de la conversación que arma ElevenLabs.                                                                                                                           |
| `audio_url`                           | texto, opcional        | Link a la grabación (SharePoint).                                                                                                                                         |
| `notificado`                          | booleano               | Si ya se avisó al área correspondiente.                                                                                                                                   |
| `estado`                              | enum                   | `nuevo` → `en_proceso` → `pendiente` → `resuelto` → `cerrado`                                                                                                             |
| `prioridad`                           | enum                   | `baja` / `media` / `alta` / `urgente`                                                                                                                                     |
| `asignado_usuario_id`                 | referencia opcional   | Usuario asignado de forma autoritativa. Se actualiza desde la sesión cuando cambia realmente el estado; al borrar el usuario queda `null`.                               |
| `asignado_a`                          | texto, opcional        | Nombre visible del responsable y compatibilidad con valores históricos/importados. No se acepta como identidad enviada en una edición normal.                           |
| `notas`                               | texto, opcional        | Notas internas de gestión.                                                                                                                                                |
| `progreso`                            | entero 0-100           | Barra de avance.                                                                                                                                                          |
| `fecha_creacion`                      | timestamp (ms)         | Cuándo se creó el ticket: instante de recepción para webhook/alta manual y fecha/hora histórica de la fila para importaciones.                                             |
| `fecha_limite`                        | timestamp              | **SLA: 48 horas hábiles desde `fecha_creacion`**. Lunes a viernes cuentan las 24 h; sábado y domingo pausan el reloj. Es editable y una fecha explícita se respeta.          |
| `fecha_resolucion`                    | timestamp, opcional    | **Se registra sola** la primera vez que el ticket pasa a `resuelto` o `cerrado`. Alimenta "resueltos hoy" y el tiempo promedio de resolución del dashboard.               |

Las fechas se guardan como enteros (milisegundos Unix); Drizzle convierte a `Date` automáticamente. Los enums son `text` con restricción (SQLite no tiene enums nativos).

### SLA de 48 horas hábiles

El cálculo usa siempre la zona `America/Argentina/Buenos_Aires` y una única función compartida por el webhook, el alta manual y los importadores CSV/Excel:

- lunes a viernes cuentan las 24 horas del día;
- sábado y domingo no consumen plazo;
- por ahora los feriados sí cuentan como hábiles;
- lunes 10:00 → miércoles 10:00;
- jueves 10:00 → lunes 10:00;
- viernes 10:00 → martes 10:00;
- si un registro ingresa durante el fin de semana, el conteo comienza el lunes a las 00:00.

Para webhook y alta manual, `fecha_creacion` es el instante en que el backend recibe y crea el ticket. Para una importación histórica se usa la fecha y hora de la fila: si vienen en columnas separadas, se combinan antes de calcular el vencimiento y la columna `hora` tiene precedencia sobre una hora embebida. Las fechas de Excel se reinterpretan como hora civil de Buenos Aires porque el formato no guarda zona horaria.

Una `fecha_limite` explícita enviada por n8n/Admin o editada posteriormente se conserva: la regla solo completa el vencimiento cuando ese dato se omite. Tampoco se recalculan automáticamente los tickets existentes, porque la base no distingue con certeza un vencimiento histórico automático de uno ajustado por una persona.

**Autoasignación:** el primer cambio de `nuevo` a cualquier otro estado asigna el ticket al usuario autenticado. Cada transición posterior de estado lo reasigna al último usuario que la realizó. Editar notas, prioridad o progreso sin cambiar el estado conserva al responsable actual. El backend deriva siempre la identidad de la cookie de sesión; el cliente no puede elegir ni falsificar el usuario asignado.

### Tabla `seguimientos` — historial de cada ticket

| Campo                              | Tipo                                        |
| ---------------------------------- | ------------------------------------------- |
| `id`                               | entero autoincremental                      |
| `ticket_id`                        | referencia a `tickets` (borrado en cascada) |
| `nota`                             | texto                                       |
| `estado_anterior` / `estado_nuevo` | texto, opcionales (registra transiciones)   |
| `autor`                            | texto, opcional                             |
| `fecha_creacion`                   | timestamp                                   |

### Tabla `roles` — catálogo de perfiles

| Campo                                    | Tipo                   |
| ---------------------------------------- | ---------------------- |
| `id`                                     | entero autoincremental |
| `nombre`                                 | texto único            |
| `descripcion`                            | texto opcional         |
| `activo`                                 | booleano               |
| `fecha_creacion` / `fecha_actualizacion` | timestamp              |

### Tabla `usuarios` — personas y asignación de rol

| Campo                                    | Tipo                                                    |
| ---------------------------------------- | ------------------------------------------------------- |
| `id`                                     | entero autoincremental                                  |
| `nombre`, `apellido`                     | texto; apellido opcional                                |
| `email`                                  | texto único, normalizado a minúsculas                   |
| `role_id`                                | referencia a `roles`; no permite borrar un rol asignado |
| `activo`                                 | booleano; se desactiva en vez de borrar físicamente     |
| `fecha_creacion` / `fecha_actualizacion` | timestamp                                               |

Estas filas son metadatos administrativos, no identidades autenticables. No guardan contraseña, hash ni token y todavía no gobiernan permisos efectivos dentro de la aplicación.

**Cambios de schema**: en desarrollo local se editan los archivos de `lib/db/src/schema/` y se corre `pnpm --filter @workspace/db run push` (rápido, sin archivos de migración). Para que el cambio llegue al servidor de testing hay que además generar la migración SQL (`drizzle-kit generate`) y commitearla — el contenedor la aplica solo al arrancar. Ver [docs/DEPLOY.md](DEPLOY.md).

## 4. El importador del histórico

[scripts/src/import-excel.ts](../scripts/src/import-excel.ts) — para cargar de una vez las llamadas viejas del Excel/CSV de n8n:

```
pnpm --filter @workspace/scripts run import-excel -- "ruta\archivo.csv" --dry-run   # simula
pnpm --filter @workspace/scripts run import-excel -- "ruta\archivo.csv"             # importa
```

- Acepta `.xlsx` y `.csv` (detecta el delimitador `;` o `,` solo).
- Reconoce los encabezados del export de n8n (`id`, `fecha_hora`, `Observaciones`, `audio`, `VERDADERO/FALSO`…) y variantes con acentos. El mapeo está en `HEADER_ALIASES` dentro del script.
- **Idempotente**: las filas cuyo `conversation_id` ya está en la base se saltean. Se puede correr mil veces.
- Acepta fecha y hora combinadas (`"16/07/2026 - 11:34hs"`) o en columnas separadas; ambas forman un único `fecha_creacion` en la zona de Buenos Aires. Si ambas fuentes incluyen hora, tiene precedencia la columna `hora`.
- Admite fecha local `dd/mm/aaaa`, ISO local y un ISO con zona explícita; rechaza filas con fechas u horas imposibles en vez de normalizarlas silenciosamente.
- Las celdas de fecha/hora de Excel conservan sus componentes de reloj sin el corrimiento UTC propio de JavaScript.
- Preestablece `fecha_limite` a 48 horas hábiles desde `fecha_creacion` (el mismo SLA que el webhook), sin consumir plazo durante sábado ni domingo.

## 5. Configuración y operación

Archivo `.env` en la raíz (plantilla: [.env.example](../.env.example)):

| Variable          | Para qué                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`            | Puerto del backend (default 5000).                                                                                                                                     |
| `HOST_IP`         | IP de esta máquina en la red interna — la usa n8n para llegar al webhook. Actualizar acá cuando cambie la IP o se mude de servidor.                                    |
| `WEBHOOK_API_KEY` | La clave que n8n manda en `x-api-key`. Sin ella el webhook responde 503.                                                                                               |
| `ADMIN_API_KEY`   | Segunda credencial obligatoria de las operaciones administrativas del SysAdmin, incluida la gestión de tickets, roles y usuarios. No reemplaza el login ni crea una sesión; si falta, el backend responde `503`. |
| `TICKETS_DB_PATH` | Ruta del archivo SQLite (opcional; default `data/tickets.db`).                                                                                                         |

Arrancar el sistema (dos terminales):

```
pnpm --filter @workspace/backend run dev    # API en :5000
pnpm --filter @workspace/frontend run dev   # UI en :3000
```

Y abrir http://localhost:3000.

Esto es para **desarrollo local**. El servidor de testing corre los mismos dos servicios pero en contenedores Docker, con CI/CD automático en cada push a `main` — ver [docs/DEPLOY.md](DEPLOY.md) para el detalle completo (arquitectura, runbook del servidor, backups).

## 6. Seguridad — estado actual

- **Login obligatorio en toda la aplicación**: sin sesión iniciada no se ve ninguna pantalla privada (cualquier URL protegida vuelve a `/`, donde está el login) ni se puede consumir ningún endpoint de la API — responden 401. Únicas excepciones: `GET /api/healthz` (chequeo de vida), `POST /api/webhooks/ticket` (n8n, autenticado con su propia `x-api-key`) y `POST /api/auth/login`.
- **Sesiones**: cookie `httpOnly` + `SameSite=Lax` respaldada en la tabla `sesiones` (revocables, sobreviven reinicios del backend), expiración a los 7 días. Contraseñas hasheadas con scrypt (módulo nativo de Node, sin dependencias extra).
- **Usuario semilla**: en el primer arranque (si ningún usuario tiene contraseña asignada) se crea el rol `Administrador` y el usuario **`admin` / clave `admin`** — **cambiar esa clave apenas se pueda**. El seed no revive al admin si después lo reemplazan por cuentas propias con contraseña.
- **Triple verificación en administración**: los endpoints `/api/admin/*`, el borrado y la edición administrativa de tickets exigen sesión, rol SysAdmin **y además** el header `x-admin-key`. La `ADMIN_API_KEY` no se guarda en la base: queda en `localStorage`, separada por ID de SysAdmin, para reutilizarla en futuros logins desde ese navegador. La variable ausente nunca abre las rutas: devuelve `503`.
- **Seguimientos auditables**: el campo `autor` lo asigna el backend con el usuario de la sesión — lo que mande el cliente se ignora.
- **Pendiente (próxima fase)**: permisos por rol con checkboxes — el botón y la ruta `/admin` visibles solo para usuarios con ese permiso, validado en el backend, no solo ocultado en la UI.
- Si n8n corre en la nube, necesita poder llegar a esta máquina: túnel (Cloudflare Tunnel / ngrok) o IP pública con firewall.
