# GSB Tickets — Documentación del flujo completo

> Última actualización: agosto 2026

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
│  Express :5000   │   con estado "nuevo". Si llegó empresa, registra
└────────┬─────────┘   el origen Serin como primer seguimiento.
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

| Ruta                                     | Qué hace                                                                                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/webhooks/ticket`              | **Ingesta**: crea el ticket de una llamada. Única ruta autenticada con la API key de integración `x-api-key`. Idempotente. Si no viene `fecha_limite`, se preestablece a **48 horas hábiles de lunes a viernes** (SLA). |
| `GET /api/tickets`                       | Listado operativo con filtros, orden server-side por columna y paginación. Omite registros en cuarentena; `incluir_vacios=true` exige sesión con rol SysAdmin.                                                          |
| `GET /api/tickets/export.csv`            | Exporta por streaming todos los tickets operativos que cumplen los filtros y el orden activos, no solo la página visible; mantiene memoria acotada y libera el cursor si el cliente se desconecta.                      |
| `GET /api/tickets/:id`                   | Detalle + historial de seguimientos; `incluir_vacios=true` permite abrir la cuarentena con acceso administrativo.                                                                                                       |
| `PATCH /api/tickets/:id`                 | Exige `expected_version` + cambios. Edita gestión/datos funcionales; los técnicos requieren rol SysAdmin. Dato, versión y auditoría son atómicos; una revisión vieja recibe `409 TICKET_VERSION_CONFLICT`.              |
| `DELETE /api/tickets/:id`                | Eliminar; exige sesión con rol SysAdmin.                                                                                                                                                                                |
| `GET/POST /api/tickets/:id/seguimientos` | Historial: notas y cambios de estado, prioridad, asignación y campos editados. Autor y contexto los determina el backend.                                                                                               |
| `GET /api/dashboard/stats`               | Totales y KPIs; acepta `fecha_desde`/`fecha_hasta` inclusivas por fecha de creación.                                                                                                                                    |
| `GET /api/dashboard/actividad-reciente`  | Línea de tiempo de tickets y seguimientos; el rango se aplica a la fecha real del evento.                                                                                                                               |
| `GET /api/dashboard/tickets-vencidos`    | Vencidos del conjunto de tickets creados dentro del rango solicitado.                                                                                                                                                   |
| `GET /api/dashboard/motivos`             | Categorías de contacto del conjunto creado dentro del rango solicitado.                                                                                                                                                 |
| `GET /api/rendimiento`                   | Estado del módulo ejecutivo. Informa operación completa de Resumen, Operadores, Contactos recurrentes y Calidad.                                                                                                        |
| `GET /api/rendimiento/calidad-datos`     | Cobertura de los datos que sostienen las métricas. Usa tickets visibles por fecha de creación y admite período, empresa, categoría y prioridad.                                                                         |
| `GET /api/rendimiento/resumen-equipo`    | Conjunto analizado ingresado, estado actual, distribuciones, promedio/mediana de resolución y cumplimiento del plazo sobre eventos con vencimiento preservado.                                                          |
| `GET /api/rendimiento/personas`          | Actividad atribuible por usuario, tiempos y SLA con muestra, carga actual y resoluciones reabiertas; incluye cobertura global y no construye rankings.                                                                  |
| `GET /api/rendimiento/reiteraciones`     | Contactos con al menos dos tickets y uno abierto; agrupa por identidad canónica no transitiva, descarta valores centinela, enmascara PII y pagina el orden global por riesgo.                                           |
| `POST /api/rendimiento/asistente/chat`   | Proxy del bot RAG: exige SysAdmin/Controller, valida el body exacto, agrega Basic Auth server-side y no persiste la conversación.                                                                                       |
| `GET /api/healthz`                       | Chequeo de vida.                                                                                                                                                                                                        |
| `GET /api/readyz`                        | Disponibilidad real: `200` solo en fase `ready` y con los schemas runtime de tickets, cuarentena y sesiones accesibles en SQLite; `503` durante arranque, fallo o drenaje.                                              |
| `POST /api/admin/tickets`                | **Admin**: alta manual de un registro (409 si el conversation_id existe).                                                                                                                                               |
| `POST /api/admin/import`                 | **Admin**: importación masiva CSV atómica e idempotente; `dry_run` simula sin escribir.                                                                                                                                 |
| `POST /api/admin/truncate`               | **Admin**: borra registros y reinicia ids en una transacción (requiere `confirmar: true`).                                                                                                                              |
| `GET/POST /api/admin/roles`              | **Admin**: listado paginado y alta de roles.                                                                                                                                                                            |
| `PATCH/DELETE /api/admin/roles/:id`      | **Admin**: CRUD de roles personalizados. Los roles base permiten editar descripción, pero no nombre, estado ni eliminación.                                                                                             |
| `GET/POST /api/admin/users`              | **Admin**: listado paginado, filtros y alta de usuarios.                                                                                                                                                                |
| `PATCH /api/admin/users/:id`             | **Admin**: edición, cambio de rol y activación/desactivación; preserva un SysAdmin y revoca sesiones ante un cambio real de rol.                                                                                        |
| `GET /api/events`                        | **SSE**: stream de eventos en vivo. El frontend recibe altas/importaciones, actualizaciones de tickets y cambios automáticos de prioridad al instante. Fuera de OpenAPI porque Orval no modela streams.                 |

Las estadísticas y los motivos del Dashboard se agregan directamente en SQLite, sin traer tickets completos al proceso web. Los KPIs de una respuesta comparten snapshot y los límites de “hoy” se calculan siempre con el calendario de Buenos Aires; así no cambian si el contenedor o la máquina de desarrollo usan otra zona horaria.

Rendimiento también agrega en SQLite y está disponible únicamente para **SysAdmin** y **Controller**. Sus vistas comparten un conjunto analizado de tickets visibles definido por `fecha_creacion` y por los filtros activos. El estado es una fotografía al instante informado por la respuesta; los tiempos incluyen su tamaño de muestra; y el cumplimiento del SLA solo usa transiciones reales desde un estado no final hacia `resuelto` o `cerrado` que conservaron el vencimiento vigente en `fecha_limite_snapshot`. Así, una edición posterior del ticket no reescribe el resultado histórico. Operadores nunca construye rankings. Contactos recurrentes devuelve coincidencias operativas enmascaradas, no identidades civiles inferidas; calcula sus totales sobre todo el conjunto analizado y entrega únicamente la página solicitada después de aplicar el orden global por riesgo.

En **Resumen del equipo**, los cuatro indicadores se interpretan así:

- **Cumplimiento del SLA**: porcentaje de resoluciones auditables realizadas antes o exactamente en el plazo que tenían al resolverse. Solo entran las transiciones reales de abierto a final que guardaron `fecha_limite_snapshot`; las resoluciones anteriores a esa auditoría no se estiman con datos actuales.
- **Backlog vencido**: abiertos cuyo plazo ya pasó dividido por todos los abiertos del conjunto analizado. `resuelto` y `cerrado` son finales; los demás estados permanecen abiertos. Un plazo igual al instante del reporte todavía no está vencido y los abiertos sin fecha límite se informan mediante la cobertura del indicador.
- **Antigüedad mediana del backlog**: valor central de las horas hábiles transcurridas desde la creación de cada abierto hasta el reporte. Cuenta lunes a viernes durante las 24 horas, pausa los fines de semana y actualmente incluye feriados.
- **Cobertura de asignación**: abiertos con un `asignado_usuario_id` real dividido por todos los abiertos. Un nombre histórico en `asignado_a` sin identidad estructurada no se considera una asignación operativa.

Los tres indicadores de backlog son una fotografía actual de los tickets **creados dentro del período seleccionado**. Elegir mes o semana no incluye abiertos más antiguos; para evaluar todo el backlog debe usarse todo el historial. Si no existen abiertos o resoluciones auditables, la interfaz muestra que no hay muestra disponible: no lo presenta como 0 %. Estos indicadores describen el estado observado y no implican por sí solos una meta, puntaje o evaluación de una persona.

`healthz` y `readyz` tienen responsabilidades distintas. El primero prueba únicamente que Express puede responder y siempre entrega `200 { status: "ok" }`. El segundo responde `200 { status: "ready" }` solo después del evento `listening`, antes de iniciar el drenaje y mientras SQLite esté abierto con Tickets, cuarentena y todas las columnas de sesión requeridas consultables; en cualquier otro caso entrega un `503 { status: "unavailable" }` genérico. Ambos son públicos y envían `Cache-Control: no-store`; un 503 de readiness no es un error de autenticación.

Las rutas `admin`, el borrado, la cuarentena y la edición técnica de tickets exigen sesión con rol SysAdmin. El backend lo valida en cada request de forma independiente del frontend: un Operador recibe `403` aunque manipule la interfaz. Hasta agosto de 2026 había además una segunda verificación con una clave administrativa que vencía a los 15 minutos; se retiró porque no agregaba defensa real en un sistema interno ya restringido por rol.

Cada request: se loguea (pino) → se valida con Zod → se consulta/escribe con Drizzle → responde JSON.

#### Cuarentena administrativa de registros vacíos

El ingreso no descarta llamadas: aun cuando n8n o un importador entregue un registro sin datos útiles, la fila se conserva intacta en SQLite para auditoría y corrección. No se borra, no se reescribe y no se altera el payload original.

Un ticket entra en cuarentena únicamente cuando **todas** estas condiciones se cumplen al mismo tiempo (AND):

- `nombre` está vacío o contiene uno de los marcadores históricos `Sin nombre` / `Sin nombre proporcionado`;
- `apellido`, `telefono`, `dni`, `empresa`, `email`, `resumen` y `notas` están vacíos;
- `motivo` está vacío o contiene el marcador `Sin especificar`;
- conserva `estado = nuevo`, `prioridad = media`, `progreso = 0`, `notificado = false`, no tiene asignación ni seguimientos.

No participan de la decisión `id`, `conversation_id`, `hora`, las fechas, `motivo_categoria` ni `audio_url`: son identificadores, datos técnicos o valores generados automáticamente y, por sí solos, no convierten el registro en un ticket operativo.

La decisión conserva esta regla derivada, pero su resultado se materializa en la tabla interna `tickets_cuarentena`. La migración `0014` clasifica los registros históricos una sola vez y triggers de SQLite mantienen la proyección atómicamente ante cambios del ticket o de sus seguimientos. Por eso, un registro que ya tenga seguimientos no se oculta; y si un SysAdmin completa un dato o cambia alguno de los valores operativos anteriores, vuelve automáticamente a Tickets y al Dashboard sin un proceso manual de recuperación. La tabla no reemplaza ni reescribe el ticket: solo evita recalcular toda la condición en cada consulta.

Mientras permanece vacío queda fuera de:

- el listado `/tickets`, la ficha individual y sus seguimientos;
- KPIs, badges, actividad reciente, motivos y vencidos del Dashboard, y los conjuntos analizados de Rendimiento;
- los toasts de nuevos tickets e importaciones.

Sigue visible en la tabla de Administración mediante `GET /api/tickets?incluir_vacios=true`. Ese parámetro no es un bypass público: exige sesión con rol rol SysAdmin.

### Frontend — [frontend/](../frontend/)

React + Vite. Pantallas principales:

- **Dashboard** (`/dashboard`): KPIs, distribución por estado, rendimiento, motivos, prioridades, vencidos y actividad. El desplegable permite visualizar Todo (default), semana actual, mes actual o un rango desde/hasta; el mismo período se aplica a todos los paneles.
- **Rendimiento** (`/rendimiento`): acceso exclusivo de SysAdmin y Controller. **Resumen del equipo** presenta tickets ingresados, abiertos, finalizados, vencidos, distribuciones, promedio/mediana y cumplimiento; **Operadores** muestra actividad atribuible, muestras, carga y reaperturas sin rankings; **Contactos recurrentes** muestra contactos con múltiples llamados, abiertos, vencidos, responsables y tickets relacionados; **Calidad de datos** permite interpretar la cobertura. La vista activa y los filtros por período, empresa, categoría y prioridad se persisten y canonizan en la URL. Por eso un enlace directo abre el mismo contexto y la navegación Atrás/Adelante o una recarga restauran tanto la pestaña como sus filtros.
- **Asistente de Rendimiento**: es un botón flotante disponible únicamente en `/rendimiento`, de modo que su acceso visual sigue limitado a SysAdmin y Controller. El botón y el panel son controles accesibles propios de la aplicación. El primer clic importa de forma diferida `@n8n/chat` y sus estilos; el chat se monta en modo `fullscreen` dentro de un `target` explícito del panel y se desmonta al abandonar la ruta. Un UUID v4 vive en `sessionStorage["gsb_rag_chat_session_id"]`: se crea una vez por pestaña, se reutiliza en todos los mensajes y solo cambia al elegir **Nueva conversación**. `loadPreviousSession: false` evita restaurar la clave global de la librería y el logout purga el identificador. El navegador llama al proxy same-origin `/api/rendimiento/asistente/chat`; este vuelve a validar sesión/rol, agrega Basic Auth solo en el servidor y reenvía exactamente `sessionId`, `action` y `chatInput`, sin persistirlos ni añadir PII. Nunca reutiliza `WEBHOOK_API_KEY`.
- **Listado** (`/tickets`): tabla con contacto, categoría, motivo, estado, prioridad, **asignado**, progreso y fecha límite. Todos los encabezados de datos ordenan en el servidor antes de paginar y admiten varios criterios priorizados; los filtros son combinables y el botón **Exportar CSV** descarga el resultado completo filtrado/ordenado. Si existe una empresa y n8n informó `estado_empleado`, debajo se muestra `Activo` o `Inactivo`; sin empresa, la presentación no cambia. Si no existe responsable muestra `Sin asignar`; si nombre y apellido están vacíos muestra `Sin nombre proporcionado`.
- **Detalle** (`/tickets/:id`): resumen de la llamada, audio, datos del contacto, tiempos y gestión. Los editores congelan datos + versión al abrir, envían solo diferencias y cada edición real queda en el historial. Si otra sesión modifica el ticket, el backend rechaza el snapshot viejo y el diálogo conserva el draft visible pero bloquea Guardar. Solo una acción explícita descarta esos cambios y carga la revisión actual; un fallo de recarga tampoco pierde lo escrito. El estado laboral se presenta debajo de la empresa cuando corresponde. Teléfono y email mantienen filas fijas y fallbacks cuando faltan. El historial muestra cambios de estado, prioridad, asignación y campos editados; si el webhook recibió una empresa real, comienza con la entrada de `Sistema` que registra el origen Serin.

**Actualización en vivo**: la app mantiene abierta una conexión SSE (`/api/events`). Cuando entra un llamado operativo nuevo por el webhook (o se importan registros operativos), **todas las pestañas abiertas se refrescan al instante** y muestran una notificación con el contacto y el motivo — sin recargar la página. Los eventos del dominio de tickets invalidan las consultas cuyas rutas pertenecen exactamente a `/api/tickets`, `/api/dashboard` o `/api/rendimiento`, incluida cualquier subruta; no invalidan sesión, elevación administrativa, usuarios ni roles, y tampoco aceptan prefijos textuales parecidos. Los registros vacíos en cuarentena no generan toast, aunque Administración puede refrescar sus datos. El refresco periódico de 30s del sidebar queda como respaldo por si la conexión de eventos se corta. Si Administración desactiva la cuenta o el rol, cambia realmente el rol asignado o resetea la contraseña, cada pestaña recibe `sesion_revocada`, detiene la reconexión, limpia sus datos y vuelve a la entrada. La raíz valida la cookie desde cero: muestra el login si fue revocada o remonta una sesión nueva válida creada en otra pestaña. Un corte transitorio del stream no cierra la sesión.

**Notificaciones del sidebar**: junto a "Tickets" hay dos numeritos — **ámbar** = tickets en estado `nuevo` (sin abrir), **rojo** = tickets vencidos.

- **Administración** (`/admin`): la tabla ampliada muestra ID, fecha/hora, conversation ID, contacto, empresa, categoría/motivo, estado, prioridad, asignado y vencimiento. Sus columnas ordenan en servidor, mantiene paginación y abre cada fila, incluida la cuarentena con `incluir_vacios=true`. El alta omite opcionales vacíos; la edición congela versión, mantiene inmutable el conversation ID, envía un PATCH mínimo y convierte borrados en `null`. Un conflicto conserva el formulario y exige confirmar la carga de la versión actual antes de volver a guardar; un no-op no llama a la API. El panel conserva borrado, importador CSV y zona peligrosa.
- **Roles y usuarios** (`/admin/roles-usuarios`): altas y edición de perfiles, asignación de rol, filtros, activación/desactivación y gestión del catálogo. `SysAdmin`, `Administrador` y `Operador` son identidades reservadas: permanecen activas y no se renombran ni eliminan. Los roles personalizados inactivos cortan login/sesión y no aceptan nuevas asignaciones. Siempre debe quedar al menos un SysAdmin activo con username y contraseña utilizable. Comparte con Tickets el mismo grant server-side: el secreto se presenta una vez, el navegador lo descarta y las consultas posteriores envían solo la intención fija. Los campos de contraseña temporal permanecen ocultos, ofrecen un botón de ojo y validan la política compartida de 16–128 caracteres, sin controles, espacios exteriores ni valores predecibles conocidos. Alta y reset muestran el estado **Cambio de contraseña pendiente** y revocan accesos anteriores cuando corresponde.
- **Errores y sesión**: el login no tiene una ruta `/login`; vive en `/` cuando no hay sesión, mientras que una sesión válida que entra a la raíz se redirige a `/dashboard`. Un `401` vuelve a la raíz, un `403` muestra acceso denegado, un `404` identifica páginas o tickets inexistentes y los fallos `5xx`/conexión ofrecen reintentar. Todas las pantallas de error incluyen **Volver al inicio**. Los toasts traducen los errores a mensajes de usuario y no exponen HTTP, URLs, JSON ni validaciones internas.

En desarrollo, Vite proxea todo `/api/*` al backend (puerto 5000), por eso el frontend usa rutas same-origin. Si falta la configuración externa del asistente, su endpoint responde `503` de forma controlada y el resto de Rendimiento sigue operativo.

### El contrato OpenAPI — [lib/api-spec/openapi.yaml](../lib/api-spec/openapi.yaml)

La fuente de verdad de la API. De ahí, `pnpm --filter @workspace/api-spec run codegen` genera:

- [lib/api-client-react/](../lib/api-client-react/) — hooks de React Query que usa el frontend (`useListTickets`, `useGetDashboardStats`…)
- [lib/api-zod/](../lib/api-zod/) — schemas de validación que usa el backend

Si se cambia la API: primero se edita el yaml, se corre codegen, y después se implementa. Los dos lados quedan sincronizados por construcción.

Los campos nullable de las respuestas de tickets y seguimientos siempre están presentes: cuando no existe un dato, la API devuelve `null`, no omite la propiedad. El detalle siempre contiene `seguimientos`, aunque sea un array vacío. En edición, `notas: null` o una nota vacía borra el valor y lo persiste como `NULL`; las fechas técnicas no aceptan `null` porque resolución y reapertura tienen reglas propias del backend.

El contrato declara `gsb_session` como seguridad global. `healthz`, `readyz`, login y el logout idempotente son públicos; el webhook usa solo `x-api-key`; y cada operación administrativa incondicional declara sesión + `adminIntent` en un mismo requisito AND. `admLas fronteras condicionales, como `incluir_vacios`, mantienen el acceso operativo normal y documentan la exigencia adicional al activar el modo administrativo. `healthz`conserva un contrato exclusivo`{ status: "ok" }`; `readyz`separa el éxito`{ status: "ready" }`del error 503`{ status: "unavailable" }`, sin detalles técnicos y sin caché. Orval está fijado a la salida compatible con Zod 3.25 para no generar constructores exclusivos de Zod 4.

## 3. Cómo se guardan los datos

**Motor**: SQLite — un único archivo (`data/tickets.db` en desarrollo local; en el servidor de testing vive dentro de un volumen Docker, ver [docs/DEPLOY.md](DEPLOY.md)). Sin servidores de base de datos, sin credenciales. Modo WAL activado (lecturas y escrituras concurrentes sin bloquearse).

**Schema** (definido en [lib/db/src/schema/tickets.ts](../lib/db/src/schema/tickets.ts) y [lib/db/src/schema/admin.ts](../lib/db/src/schema/admin.ts)):

### Tabla `tickets` — una fila por llamada

| Campo                                 | Tipo                   | Notas                                                                                                                                                                                                                |
| ------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                  | entero autoincremental | Uso interno y rutas de la API; Administración lo muestra para soporte.                                                                                                                                               |
| `version`                             | entero positivo        | Revisión monotónica interna. Empieza en 1 y avanza con cada cambio real para impedir sobrescrituras concurrentes.                                                                                                    |
| `conversation_id`                     | texto, **único**       | El ID de ElevenLabs. Es la clave de idempotencia.                                                                                                                                                                    |
| `hora`                                | texto "HH:MM"          | Hora de la llamada.                                                                                                                                                                                                  |
| `nombre`, `apellido`                  | texto                  | Datos del llamante.                                                                                                                                                                                                  |
| `telefono`, `dni`, `empresa`, `email` | texto, opcionales      | Datos del llamante. `empresa` viene de n8n.                                                                                                                                                                          |
| `estado_empleado`                     | enum opcional          | `Activo` o `Inactivo`, informado por n8n. No vuelve visible por sí solo un registro vacío y solo se muestra si existe una empresa real.                                                                              |
| `motivo`                              | texto                  | Por qué llamó. Los procesos automáticos no lo reescriben; una corrección explícita desde el detalle sí puede editarlo y queda auditada.                                                                              |
| `motivo_categoria`                    | enum derivado          | Clasificación estable: haberes/pagos, recibos/documentación, vacaciones/licencias, bajas/liquidación, empleo, contacto, reclamos, legales, **embargos** o sin clasificar.                                            |
| `resumen`                             | texto, opcional        | Resumen de la conversación que arma ElevenLabs.                                                                                                                                                                      |
| `audio_url`                           | texto, opcional        | Link a la grabación (SharePoint).                                                                                                                                                                                    |
| `notificado`                          | booleano               | Si ya se avisó al área correspondiente.                                                                                                                                                                              |
| `estado`                              | enum                   | `nuevo` → `en_proceso` → `pendiente` → `resuelto` → `cerrado`                                                                                                                                                        |
| `prioridad`                           | enum                   | `baja` / `media` / `alta` / `urgente`; puede subir automáticamente según las horas hábiles restantes y nunca baja por el proceso automático.                                                                         |
| `asignado_usuario_id`                 | referencia opcional    | Usuario asignado de forma autoritativa. Se actualiza desde la sesión cuando cambia realmente el estado; al borrar el usuario queda `null`.                                                                           |
| `asignado_a`                          | texto, opcional        | Nombre visible del responsable y compatibilidad con valores históricos/importados. No se acepta como identidad enviada en una edición normal.                                                                        |
| `notas`                               | texto, opcional        | Notas internas de gestión.                                                                                                                                                                                           |
| `progreso`                            | entero 0-100           | Barra de avance.                                                                                                                                                                                                     |
| `fecha_creacion`                      | timestamp (ms)         | Cuándo se creó el ticket: instante de recepción para webhook/alta manual y fecha/hora histórica de la fila para importaciones.                                                                                       |
| `fecha_limite`                        | timestamp              | **SLA: 48 horas hábiles desde `fecha_creacion`**. Lunes a viernes cuentan las 24 h; sábado y domingo pausan el reloj. Es editable y una fecha explícita se respeta.                                                  |
| `fecha_resolucion`                    | timestamp, opcional    | **Se registra sola** al entrar en `resuelto` o `cerrado`, se limpia al reabrir y se renueva si vuelve a resolverse. Pasar de resuelto a cerrado conserva el instante. Alimenta "resueltos hoy" y el tiempo promedio. |

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

Una `fecha_limite` explícita enviada por n8n/Admin o editada posteriormente se conserva: la regla solo completa el vencimiento cuando ese dato se omite. Antes de la coerción de tipos, el backend exige un date-time RFC3339 real y con zona; `null`, booleanos, números, fechas imposibles o sin zona responden 400 en lugar de convertirse accidentalmente en 1970. Tampoco se recalculan automáticamente los tickets existentes, porque la base no distingue con certeza un vencimiento histórico automático de uno ajustado por una persona.

El estado laboral (`Activo`/`Inactivo`) se considera un dato derivado de la consulta a Serin para el DNI y la empresa recibidos. Si una edición manual cambia DNI o empresa, ese estado se limpia y la invalidación queda registrada junto con la corrección en el historial.

**Prioridad por cercanía al vencimiento:** al arrancar, antes de escuchar requests, el backend revisa todos los tickets visibles con fecha límite y estado no final. Luego repite la revisión cada 5 minutos (configurable con `PRIORIDAD_AUTOMATICA_INTERVAL_MS`, mínimo 10 segundos):

- 24 horas hábiles o menos restantes → al menos `alta`;
- 12 horas hábiles o menos, o vencido → `urgente`;
- una prioridad superior nunca se degrada.

La promoción comprueba nuevamente estado, prioridad y vencimiento antes de escribir, y persiste el cambio junto con un seguimiento de autor `Sistema` en una sola transacción. Si la auditoría falla, tampoco cambia el ticket. El repositorio obtiene la versión nueva con `UPDATE RETURNING` y el SSE la emite después del commit.

**Autoasignación y auditoría:** el primer cambio de `nuevo` a cualquier otro estado asigna el ticket al usuario autenticado. Cada transición posterior lo reasigna al último usuario que la realizó. Editar otros campos sin cambiar el estado conserva al responsable. El backend deriva la identidad de la sesión, guarda ticket + seguimiento atómicamente y registra snapshots anterior/nuevo de la asignación. La trazabilidad estructurada comienza con v0.5: no se inventan cambios anteriores ni responsables históricos.

### Tabla `seguimientos` — historial de cada ticket

| Campo                                                        | Tipo                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `id`                                                         | entero autoincremental                                                    |
| `ticket_id`                                                  | referencia a `tickets` (borrado en cascada)                               |
| `nota`                                                       | texto                                                                     |
| `estado_anterior` / `estado_nuevo`                           | texto, opcionales (registra transiciones)                                 |
| `prioridad_anterior` / `prioridad_nueva`                     | texto, opcionales (registra cambios manuales/automáticos)                 |
| `asignado_anterior_usuario_id` / `asignado_nuevo_usuario_id` | referencias opcionales a usuarios                                         |
| `asignado_anterior` / `asignado_nuevo`                       | texto, snapshots legibles de la asignación                                |
| `campos_editados`                                            | JSON opcional con nombres de campos cambiados; no copia valores sensibles |
| `autor`                                                      | texto, opcional                                                           |
| `fecha_creacion`                                             | timestamp                                                                 |

### Tabla `roles` — catálogo de perfiles

| Campo                                    | Tipo                   |
| ---------------------------------------- | ---------------------- |
| `id`                                     | entero autoincremental |
| `nombre`                                 | texto único            |
| `descripcion`                            | texto opcional         |
| `activo`                                 | booleano               |
| `fecha_creacion` / `fecha_actualizacion` | timestamp              |

### Tabla `usuarios` — personas y asignación de rol

| Campo                                    | Tipo                                                       |
| ---------------------------------------- | ---------------------------------------------------------- |
| `id`                                     | entero autoincremental                                     |
| `nombre`, `apellido`                     | texto; apellido opcional                                   |
| `email`                                  | texto único, normalizado a minúsculas                      |
| `username`                               | texto único; identificador de login, distinto del email    |
| `password_hash`                          | hash scrypt versionado, nullable para filas históricas     |
| `debe_cambiar_password`                  | booleano autoritativo; `true` para credenciales temporales |
| `role_id`                                | referencia a `roles`; no permite borrar un rol asignado    |
| `activo`                                 | booleano; se desactiva en vez de borrar físicamente        |
| `fecha_creacion` / `fecha_actualizacion` | timestamp                                                  |

`usuarios` contiene las identidades autenticables y gobierna los permisos junto con `roles`. Nunca guarda una contraseña en claro: solo el hash scrypt. Desactivar una cuenta o su rol invalida sus sesiones; los cambios reales de rol y los resets administrativos también las revocan.

### Tabla `sesiones` — login revocable

| Campo              | Tipo                                            |
| ------------------ | ----------------------------------------------- |
| `token`            | PK física histórica; contiene `sha256:<digest>` |
| `usuario_id`       | referencia a `usuarios`, borrado en cascada     |
| `fecha_expiracion` | timestamp absoluto; siete días desde el login   |
| `fecha_creacion`   | timestamp                                       |

La cookie `gsb_session` contiene el bearer aleatorio raw; SQLite conserva solo su hash con separación de dominio, que no puede reutilizarse como cookie.

**Cambios de schema**: en desarrollo local se editan los archivos de `lib/db/src/schema/` y se corre `pnpm --filter @workspace/db run push`. Ese script encadena `drizzle-kit push` con la reconciliación de invariantes que Drizzle no representa; debe ejecutarse sin otro escritor activo. Para que el cambio llegue al servidor hay que generar y commitear su migración SQL: el contenedor aplica la cadena versionada al arrancar. La secuencia actual llega a `0018_drop_admin_elevation.sql`. Antes de escuchar requests, el backend verifica también la proyección de cuarentena; puede completar una base local legacy sin ledger, pero rechaza una base versionada incompleta.

## 4. Categorías de motivo

Cada llamada llega con un `motivo` en texto libre, redactado por el agente de
voz. Ese texto **nunca se modifica**: se conserva exactamente como llegó. Lo que
el sistema calcula es una columna derivada, `motivo_categoria`, que sirve para
agrupar, filtrar y medir sin convertir cada redacción en una categoría nueva.

El catálogo vive en un solo lugar,
[`lib/ingesta/src/motivos.ts`](../lib/ingesta/src/motivos.ts), del que derivan el
enum de la base, las etiquetas del frontend y los filtros. El contrato OpenAPI
es la única copia —es YAML y no puede importar TypeScript— y hay un test que
falla si se desincroniza.

| Código                  | Etiqueta                       | Qué cae acá                                                                                              |
| ----------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `haberes_pagos`         | Haberes y pagos                | Sueldos, aguinaldo, diferencias salariales, depósitos y acreditaciones que no llegaron                   |
| `recibos_documentacion` | Recibos y documentación        | Recibos de sueldo, duplicados, certificados y constancias laborales                                      |
| `vacaciones_licencias`  | Vacaciones y licencias         | Vacaciones, licencias y días de descanso                                                                 |
| `bajas_liquidacion`     | Bajas y liquidación final      | Renuncia, despido, fin del período de prueba, indemnización, entrega de uniforme y negociación de salida |
| `empleo_postulaciones`  | Empleo y postulaciones         | Quien **todavía no trabaja** acá: postulaciones, CV, vacantes y ofertas                                  |
| `prestamos_anticipos`   | Préstamos y anticipos          | Préstamos de la empresa, sus cuotas y adelantos de sueldo                                                |
| `obra_social`           | Obra social y aportes          | Aportes, altas y bajas de cobertura, cambios de domicilio, obras sociales con nombre propio              |
| `sanciones_ausencias`   | Sanciones y ausencias          | Suspensiones, apercibimientos, inasistencias y justificación de faltas                                   |
| `embargos`              | Embargos                       | Retenciones judiciales sobre el sueldo y su levantamiento                                                |
| `legales`               | Legales                        | Carta documento, telegrama laboral, SECLO, abogados y juicios laborales                                  |
| `reclamos`              | Reclamos                       | Quejas y disconformidades sin un tema más específico                                                     |
| `contacto_general`      | Contacto y consultas generales | Llamadas perdidas, pedidos de hablar con una persona, consultas sin tema                                 |
| `proveedores_comercial` | Proveedores y comercial        | Quien llama a **vender**: no es empleado. Cotizaciones de ART, medicina laboral, servicios               |
| `sin_clasificar`        | Sin clasificar                 | Texto ambiguo, o llamada que llegó sin motivo ni resumen                                                 |

### Cómo decide

Reglas de expresiones regulares deterministas, sin modelo de lenguaje: el mismo
texto siempre da la misma categoría. Primero se evalúa el `motivo`; solo si
ninguna regla coincide se consulta el `resumen`, para que un detalle secundario
no pise la intención explícita. Lo que no coincide con nada queda en
`sin_clasificar` — no se fuerza una categoría.

**El orden importa: gana la primera regla que coincide.** Está elegido a
propósito:

- `proveedores_comercial` va **primero** porque no describe un tema sino _quién
  llama_. Si alguien se presenta como proveedor, mezclarlo con las consultas de
  los empleados ensucia el tablero de RRHH.
- `sanciones_ausencias` va **después** de `bajas_liquidacion`: una llamada que
  mezcla faltas con una negociación de salida pertenece a la baja, que es la
  decisión de fondo.
- `prestamos_anticipos` y `obra_social` van **antes** que `haberes_pagos`,
  porque "anticipo" y "aporte" son más específicos que un tema salarial general.

Dos precisiones que costaron un caso real cada una:

- **`empleo_postulaciones` exige intención de buscar trabajo.** El verbo tiene
  que pegarse al sustantivo. Una regla más laxa clasificaba _"consulta por su
  situación de trabajo"_ —alguien que ya trabaja acá y llama por sus faltas—
  como si fuera una postulación.
- **`sanciones_ausencias` solo toma "faltas" en plural o con calificativo**, para
  no capturar "falta de pago" ni "le falta el recibo".

### Agregar una categoría

1. Sumar el código a `MOTIVO_CATEGORIA_CODIGOS` y su etiqueta en
   `lib/ingesta/src/motivos.ts`, con sus reglas en la posición correcta.
2. Agregar el mismo código al enum `MotivoCategoria` de
   `lib/api-spec/openapi.yaml` y correr `pnpm run codegen`.
3. Elegirle un color en `frontend/src/lib/motivos.ts`. Si falta, **no compila**.
4. Escribir la migración de backfill para los tickets ya guardados, replicando
   con `LIKE` la precedencia del clasificador. Conviene verificarla comparando
   su resultado contra el del clasificador TypeScript sobre una copia real.

## 5. El importador del histórico

[scripts/src/import-excel.ts](../scripts/src/import-excel.ts) — para cargar de una vez las llamadas viejas del Excel/CSV de n8n:

```
pnpm --filter @workspace/scripts run import-excel -- "ruta\archivo.csv" --dry-run   # simula
pnpm --filter @workspace/scripts run import-excel -- "ruta\archivo.csv"             # importa
```

- Acepta `.xlsx` y `.csv` (detecta el delimitador `;` o `,` solo).
- Reconoce los encabezados del export de n8n (`id`, `fecha_hora`, `Observaciones`, `audio`, `VERDADERO/FALSO`…) y variantes con acentos. El mapeo está en `HEADER_ALIASES` dentro del script.
- **Idempotente**: las filas cuyo `conversation_id` ya está en la base se saltean. Se puede correr mil veces.
- **Atómico**: un error de persistencia revierte todas las filas insertables del archivo. La corrida real reserva el escritor SQLite; para archivos grandes, ejecutar primero `--dry-run` y hacer la carga en una ventana sin operadores modificando tickets.
- Acepta fecha y hora combinadas (`"16/07/2026 - 11:34hs"`) o en columnas separadas; ambas forman un único `fecha_creacion` en la zona de Buenos Aires. Si ambas fuentes incluyen hora, tiene precedencia la columna `hora`.
- Admite fecha local `dd/mm/aaaa`, ISO local y un ISO con zona explícita; rechaza filas con fechas u horas imposibles en vez de normalizarlas silenciosamente.
- Las celdas de fecha/hora de Excel conservan sus componentes de reloj sin el corrimiento UTC propio de JavaScript.
- Preestablece `fecha_limite` a 48 horas hábiles desde `fecha_creacion` (el mismo SLA que el webhook), sin consumir plazo durante sábado ni domingo.

## 6. Configuración y operación

Archivo `.env` en la raíz (plantilla: [.env.example](../.env.example)):

| Variable                           | Para qué                                                                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                             | Puerto del backend (default 5000).                                                                                                                                            |
| `HOST_IP`                          | IP de esta máquina en la red interna — la usa n8n para llegar al webhook. Actualizar acá cuando cambie la IP o se mude de servidor.                                           |
| `WEBHOOK_API_KEY`                  | La clave que n8n manda en `x-api-key`. Sin ella el webhook responde 503.                                                                                                      |
| `N8N_CHAT_WEBHOOK_URL`             | URL HTTPS del Chat Trigger. Solo la consume el backend; nunca se incluye en el bundle.                                                                                        |
| `N8N_CHAT_BASIC_AUTH_USER`         | Usuario de Basic Auth para el Chat Trigger, disponible únicamente en el backend.                                                                                              |
| `N8N_CHAT_BASIC_AUTH_PASSWORD`     | Contraseña de Basic Auth para el Chat Trigger. Debe permanecer en `.env`/secret store y nunca versionarse.                                                                    |
| `N8N_CHAT_TIMEOUT_MS`              | Deadline server-side del workflow; default y máximo `120000` ms. Nginx espera 130 s para que el backend entregue el error controlado.                                         |
| `BOOTSTRAP_SYSADMIN_PASSWORD`      | Secreto externo para crear `sysadmin` en una base sin hashes o rotar la credencial semilla heredada. Solo se persiste su hash y no resetea cuentas ya aseguradas.             |
| `TICKETS_DB_PATH`                  | Ruta del archivo SQLite (opcional; default `data/tickets.db`).                                                                                                                |
| `TICKET_CSV_EXPORT_TIMEOUT_MS`     | Deadline absoluto de cada exportación CSV; default `300000` ms (5 minutos), rango `1000`–`2147483647`. Evita retener indefinidamente un snapshot lector por un cliente lento. |
| `PRIORIDAD_AUTOMATICA_INTERVAL_MS` | Intervalo opcional de la revisión de prioridades; default `300000` ms (5 minutos), mínimo `10000` ms.                                                                         |

Arrancar el sistema (dos terminales):

```
pnpm --filter @workspace/backend run dev    # API en :5000
pnpm --filter @workspace/frontend run dev   # UI en :3000
```

Y abrir http://localhost:3000.

Para validar el workspace, `pnpm run quality` ejecuta lint, formato Prettier sin drift, codegen, verificación del schema Drizzle, suites no-browser, typecheck y builds. La carpeta `e2e/` participa de lint y typecheck, y Playwright se puede ejecutar localmente con `pnpm run test:e2e` o `pnpm run test:e2e:headed`; la primera vez hay que instalar Chromium con `pnpm --filter @workspace/e2e exec playwright install chromium`. La suite usa una base temporal, aplica dos veces las migraciones reales y cubre cuatro recorridos críticos sin tocar `data/tickets.db` ni el `.env` local. En GitHub es un segundo job bloqueante, dependiente de `quality`, y publica diagnósticos durante 7 días cuando falla.

Esto es para **desarrollo local**. El servidor corre los mismos dos servicios en contenedores Docker y el workflow Deploy se dispara en cada push a `main`. Quality valida pull requests en un workflow separado — ver [docs/DEPLOY.md](DEPLOY.md) para el flujo real, el runbook y los backups.

## 7. Seguridad — estado actual

- **Login obligatorio en toda la aplicación funcional**: sin sesión iniciada no se ve ninguna pantalla privada (cualquier URL protegida vuelve a `/`, donde está el login) ni se puede consumir ningún endpoint funcional de la API — responden 401. Las excepciones son `GET /api/healthz` (liveness), `GET /api/readyz` (readiness), `POST /api/webhooks/ticket` (n8n, autenticado con su propia `x-api-key`), `POST /api/auth/login` y `POST /api/auth/logout`; logout queda público para limpiar de forma idempotente una cookie ausente, inválida o revocada.
- **Mismo origen en navegador**: frontend y `/api` comparten origen mediante Vite/Nginx. Express no habilita CORS ni expone `X-Powered-By`; el webhook servidor-a-servidor de ingreso de tickets autentica con `x-api-key`. El asistente también permanece same-origin en el navegador y cruza a n8n solo desde el backend con Basic Auth, por lo que no depende de CORS ni expone la credencial al cliente.
- **Sesiones**: cookie host-only `httpOnly` + `SameSite=Lax`, con bearer aleatorio de 64 caracteres hexadecimales y respaldo revocable a 7 días. SQLite almacena solo `sha256:<digest>` con separación de dominio: ese valor no puede presentarse como cookie. `0011` fuerza un único re-login al eliminar las sesiones históricas que guardaban el raw, y el arranque sanea cualquier formato legado o inválido antes de aceptar tráfico. El backend elimina la cookie si está malformada, vencida, revocada o pertenece a una cuenta/rol inactivo; las respuestas `/auth/*` no se cachean. Al desactivar un usuario o rol, o al cambiar realmente la asignación de rol de una cuenta, se borran atómicamente sus sesiones y se cierran sus streams SSE; reenviar el mismo `role_id` no la expulsa. El stream conserva únicamente el hash y el heartbeat revalida la sesión cada 25 segundos. Las contraseñas usan scrypt asíncrono con parámetros/versionado explícitos; los hashes legados se rehashean al autenticarse y una identidad inexistente ejecuta el mismo KDF dummy antes de devolver el mismo `401` genérico. Login admite 1–128 caracteres por compatibilidad.
- **Intentos repetidos de login**: cada identidad normalizada dispone de diez fallos confirmados dentro de 15 minutos; la siguiente solicitud queda bloqueada 15 minutos con `429 LOGIN_RATE_LIMITED` y `Retry-After`. Existentes, inexistentes e inactivos siguen la misma respuesta. Capacidad agotada, carreras y `5xx` no se cuentan como contraseña incorrecta; si el cliente corta la conexión, el resultado de una verificación ya admitida igualmente cierra la reserva. Un acceso correcto o una creación, renombre o reset administrativo libera el bucket. Como defensa de recursos, un token bucket admite una ráfaga inicial de 30 scrypt públicos y repone 30 por minuto, con solo cuatro simultáneos y ocho en espera. Los contadores son hashes en memoria acotada de la única instancia backend: se limpian al reiniciar y deberán pasar a un store compartido antes de escalar horizontalmente.
- **Política de contraseñas nuevas**: alta, reset y bootstrap comparten `@workspace/password-policy`: 16–128 unidades UTF-16, sin controles C0/DEL ni espacios exteriores. Bloquea una lista acotada de credenciales comunes/placeholders públicos del repositorio y valores de un único carácter repetido. Se admiten frases con espacios interiores y no hay reglas artificiales de composición. OpenAPI/Zod cubre longitud, controles y whitespace; el validador compartido completa la lista contextual antes de hashear.
- **Cambio obligatorio de credenciales temporales**: toda clave creada por un SysAdmin, restablecida o emitida por bootstrap deja `debe_cambiar_password=true`. Después del login, la UI conduce a `/cambiar-contrasena` sin montar sidebar ni streams; el backend permite únicamente `/auth/me`, `/auth/logout` y `/auth/password` y devuelve `403 PASSWORD_CHANGE_REQUIRED` para el resto. El cambio válido exige la contraseña actual, prohíbe reutilizarla, rota la sesión y revoca todos los otros tokens en una transacción. La migración conserva a usuarios históricos con el flag apagado.
- **Usuario semilla seguro**: si ningún usuario tiene `password_hash`, el backend exige `BOOTSTRAP_SYSADMIN_PASSWORD` conforme a esa política y crea `sysadmin` con rol `SysAdmin` y clave temporal. También detecta exclusivamente la credencial pública del seed histórico: exige el secreto, rota el hash, activa el cambio obligatorio y revoca las sesiones anteriores en una transacción. Sin una clave válida falla antes de abrir el puerto; una contraseña ya cambiada no se toca.
- **Frontera administrativa por rol**: los endpoints `/api/admin/*`, el borrado, el acceso a cuarentena y la edición técnica exigen sesión con rol SysAdmin, verificado por el backend en cada request. La interfaz no es la única barrera: un Operador recibe `403` aunque la manipule.
- **Edición funcional**: cualquier usuario autenticado puede corregir nombre, apellido, teléfono, DNI/CUIT, empresa, email, motivo y resumen. Hora, notificación, audio y fechas límite/resolución son campos técnicos protegidos por SysAdmin elevado. La API vuelve a validar estos permisos aunque la UI oculte controles.
- **Seguimientos auditables desde v0.5**: autor y contexto los asigna el backend. Las actualizaciones registran solo diferencias reales y no aceptan snapshots de auditoría suministrados por el cliente.
- **Pendiente (próxima fase)**: permisos por rol con checkboxes — el botón y la ruta `/admin` visibles solo para usuarios con ese permiso, validado en el backend, no solo ocultado en la UI.
- Si n8n corre en la nube, necesita poder llegar a esta máquina: túnel (Cloudflare Tunnel / ngrok) o IP pública con firewall.
