# Bitácora de agentes

Registro de intervenciones realizadas por asistentes sobre el repositorio. Cada entrada debe indicar alcance, decisiones, archivos afectados y validaciones ejecutadas.

## 2026-07-20 — Aclaración visible del estado Pendiente

**Agente:** Codex
**Contexto:** se pidió aclarar en la interfaz que el estado Pendiente corresponde a una persona que ya fue contactada.

### Cambio realizado

- La etiqueta se centralizó como `Pendiente (fue contactado)` y se reutiliza en badges, filtro de Tickets, selector y progreso del detalle, historial, Dashboard, resumen lateral y Administración.
- El badge conserva la presentación en mayúsculas: `PENDIENTE (FUE CONTACTADO)`.
- Se ajustó el espacio del progreso y del resumen lateral para permitir que la aclaración se distribuya sin desbordar.
- El valor técnico continúa siendo `pendiente`: no se modificaron la base de datos, el backend, el contrato OpenAPI ni los filtros enviados a la API.

Archivos principales: `frontend/src/lib/estados.ts`, `frontend/src/lib/utils-tickets.tsx`, pantallas de Tickets, Dashboard y Administración.

### Validaciones

- Tests del frontend: 7/7 correctos, incluidos los nuevos casos de etiquetas de estado.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- Smoke sobre el módulo servido por Vite: respondió con `Pendiente (fue contactado)`; frontend y backend continúan escuchando en los puertos 3000 y 5000.
- `git diff --check`: sin errores de whitespace.

## 2026-07-20 — SLA de 48 horas hábiles sin fines de semana

**Agente:** Codex
**Contexto:** el plazo de resolución sumaba 48 horas corridas, por lo que sábado y domingo reducían indebidamente el tiempo disponible.

### Implementación

- Se centralizó el cálculo en `lib/ingesta/src/sla.ts`, compartido por webhook, alta manual y los importadores CSV/Excel.
- El reloj del SLA cuenta las 24 horas de lunes a viernes y se pausa durante sábado y domingo. Los feriados no forman parte de esta corrección y continúan contando.
- La zona de negocio queda fijada en `America/Argentina/Buenos_Aires`, independientemente de la zona horaria de la máquina que ejecute el importador.
- El webhook y el alta manual capturan un único instante para `fecha_creacion` y para la base del SLA, evitando diferencias de milisegundos.
- En importaciones históricas, una fecha y una hora en columnas separadas se combinan antes de calcular el SLA; la columna de hora tiene precedencia y queda normalizada como `HH:mm`.
- Las fechas locales/ISO y las celdas Excel se interpretan de forma estable en Buenos Aires, sin retroceder tres horas ni cambiar de día por la zona del proceso. Fechas u horas imposibles dejan la fila como inválida.
- Las fechas límite explícitas y las ediciones manuales se preservan.
- No se recalcularon tickets existentes: no hay una marca confiable que permita separar vencimientos automáticos históricos de ajustes humanos sin riesgo de sobrescribirlos.

Ejemplos: lunes 10:00 vence miércoles 10:00; jueves 10:00 vence lunes 10:00; viernes 10:00 vence martes 10:00. Un ingreso de fin de semana empieza a consumir sus 48 horas el lunes a las 00:00.

Archivos principales: `lib/ingesta/src/sla.ts`, `lib/ingesta/src/index.ts`, `backend/src/routes/webhooks.ts`, `backend/src/routes/admin.ts`, contrato OpenAPI y documentación operativa.

### Validaciones

- Pruebas unitarias del SLA: días de semana, cruces de fin de semana, ingresos sábado/domingo, límite exacto al comenzar el sábado, preservación de hora/milisegundos, inmutabilidad y entradas inválidas.
- Prueba de integración del importador: `24/07/2026 10:00` (viernes) conserva la hora de Buenos Aires y vence `28/07/2026 10:00` (martes).
- Contrato regenerado desde OpenAPI con `pnpm --filter @workspace/api-spec run codegen`.
- `pnpm -r --if-present test`: 33 pruebas correctas (24 de ingesta/SLA, 5 de base de datos y 4 de presentación del frontend).
- Las 24 pruebas de ingesta/SLA también pasaron con `TZ=UTC`, confirmando que el resultado no depende de la zona configurada en el servidor.
- `pnpm run typecheck`: correcto en librerías, backend, frontend y scripts.
- `pnpm run build`: backend y frontend compilaron correctamente; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- Backend reiniciado con el artefacto compilado; `GET /api/healthz` respondió HTTP `200`. No se modificaron ni recalcularon filas existentes para validar esta corrección.

## 2026-07-20 — Cuarentena administrativa de tickets vacíos

**Agente:** Codex
**Contexto:** se pidió evitar que los registros recibidos sin ningún dato útil aparezcan en Tickets o distorsionen el Dashboard, sin perderlos y manteniéndolos disponibles para revisión administrativa.

### Regla acordada

- Los registros se conservan en SQLite tal como llegaron: no se descartan, borran, reescriben ni se les aplica un backfill destructivo.
- La cuarentena es una condición derivada y estrictamente AND. Un ticket se considera vacío solo si:
  - `nombre` está vacío o vale `Sin nombre` / `Sin nombre proporcionado`; `apellido`, `telefono`, `dni`, `empresa`, `email`, `resumen` y `notas` están vacíos; `motivo` está vacío o vale `Sin especificar`;
  - además conserva `estado = nuevo`, `prioridad = media`, `progreso = 0`, `notificado = false` y no tiene asignación ni seguimientos.
- `id`, `conversation_id`, `hora`, fechas, `motivo_categoria` y `audio_url` se ignoran para esta decisión porque son técnicos, derivados o automáticos. Una URL de grabación por sí sola no rescata un registro sin información útil.
- Un registro que ya tenga seguimientos no se oculta. Si Administración completa cualquier dato o cambia uno de los valores operativos anteriores, la condición deja de cumplirse y el ticket reaparece automáticamente en la operación.

### Visibilidad y seguridad

- Los tickets en cuarentena quedan fuera del listado operativo, detalle, seguimientos, Dashboard, badges, actividad reciente, motivos, vencidos y toasts de ingreso/importación.
- Continúan visibles en la tabla de Administración mediante `incluir_vacios=true`.
- Incluir vacíos exige sesión SysAdmin y `ADMIN_API_KEY` válida; el parámetro no amplía el acceso de Operadores ni Administradores.

Archivos de documentación actualizados: `README.md`, `docs/FLUJO.md` y `docs/BITACORA_AGENTES.MD`.

### Validaciones

- Contrato regenerado desde OpenAPI con `pnpm --filter @workspace/api-spec run codegen`.
- `pnpm run typecheck`: correcto en librerías, backend, frontend y scripts.
- `pnpm -r --if-present test`: 19 pruebas correctas (clasificación, migración, presentación de contacto y nueva paridad entre el helper de cuarentena y su condición SQL).
- `pnpm run build`: backend y frontend compilaron correctamente.
- Verificación de solo lectura sobre la base local: 12 registros totales, 1 en cuarentena y 11 operativos. No se modificó ninguna fila para realizar esta comprobación.
- Prueba HTTP aislada sobre las rutas reales: el listado operativo devolvió 11; solicitar vacíos sin rol devolvió `403`, con SysAdmin pero sin llave devolvió `401`, y con ambas credenciales devolvió los 12. El detalle y los seguimientos del registro en cuarentena respondieron `404`; tampoco apareció en estadísticas, motivos, vencidos ni actividad reciente.

## 2026-07-20 — Teléfono y email fijos en la ficha del ticket

**Agente:** Codex
**Contexto:** se pidió que Datos del Contacto mantenga una estructura estable aunque el llamante no haya proporcionado vías de contacto.

### Cambio realizado

- Las filas de teléfono y email se renderizan siempre, con la misma altura, iconografía y espaciado.
- Cuando existe el dato se muestra limpio de espacios externos; cuando falta se informa `Teléfono no proporcionado` o `Email no proporcionado`.
- Nombre conserva `Sin nombre proporcionado`; empresa y DNI continúan siendo datos opcionales y solo se muestran cuando existen.
- No se reescribieron valores de la base: los fallbacks son exclusivamente de presentación.

Archivos principales: `frontend/src/pages/TicketDetail.tsx`, `frontend/src/lib/contacto.ts` y `frontend/test/contacto.test.ts`.

### Validaciones ejecutadas

- Tests del helper de contacto: 4/4 correctos.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- Smoke sobre el módulo servido por Vite: HTTP `200`, ambos mensajes de fallback presentes y teléfono sin renderizado condicional.
- `git diff --check`: sin errores de whitespace.

## 2026-07-20 — Email exclusivo del detalle del ticket

**Agente:** Codex
**Contexto:** se ajustó la ubicación del email para mantener compacto el listado general y concentrar todos los datos del llamante en la ficha individual.

### Cambio realizado

- El email se retiró de la columna Contacto de `/tickets`; allí permanecen nombre y empresa.
- La sección Datos del Contacto de `/tickets/:id` ahora renderiza siempre la fila de email.
- Si existe una dirección se muestra completa; si el dato es nulo, vacío o contiene solo espacios se informa `Email no proporcionado`.
- Se mantiene el fallback `Sin nombre proporcionado` y no se modifica ningún dato persistido.

Archivos principales: `frontend/src/pages/TicketList.tsx`, `frontend/src/pages/TicketDetail.tsx`, `frontend/README_FRONTEND.md` y `docs/FLUJO.md`.

### Validaciones ejecutadas

- Tests del helper de contacto: 3/3 correctos.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- `git diff --check`: sin errores de whitespace.

## 2026-07-20 — Email y nombre visible en Tickets

**Agente:** Codex
**Contexto:** se reportó que el listado de Tickets no mostraba el email aun cuando el llamante lo había proporcionado, y se pidió una leyenda clara para contactos sin nombre.

### Diagnóstico y cambio

- El email no se perdía: webhook, SQLite, contrato OpenAPI y `GET /tickets` ya lo transportaban correctamente. La base local confirmó 5 tickets con email válido sobre 12 registros; la columna Contacto de `TicketList.tsx` simplemente no renderizaba el campo.
- La columna Contacto ahora muestra nombre, email —solo si contiene texto— y empresa. Los valores se recortan únicamente para presentación; no se reescriben los datos originales.
- Se agregó `getContactDisplayName`, usado en listado, detalle, tickets vencidos del Dashboard, actividad reciente, notificaciones SSE y CRUD administrativo. Cuando nombre y apellido están vacíos muestra `Sin nombre proporcionado`; también unifica visualmente el marcador histórico `Sin nombre`.
- Se agregó `getContactDisplayEmail` para evitar renderizar emails vacíos o compuestos solo por espacios.
- La base local contenía 1 contacto sin nombre completo y 2 marcadores históricos `Sin nombre`; no se ejecutó ningún backfill ni se modificó ninguna fila.

Archivos principales: `frontend/src/lib/contacto.ts`, `frontend/src/pages/TicketList.tsx`, `frontend/src/pages/TicketDetail.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Admin.tsx` y `frontend/src/components/layout/AppLayout.tsx`.

### Validaciones ejecutadas

- Tests unitarios del helper de presentación: 3/3 correctos.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto; permanecen únicamente las advertencias conocidas de sourcemaps y tamaño del bundle.
- Smoke HTTP local: frontend `:3000/` y backend `:5000/api/healthz` respondieron `200`.
- `git diff --check`: sin errores de whitespace.

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

## 2026-07-17 — Toasts semánticos y mensajes de acciones

**Agente:** Codex
**Contexto:** mientras el login se desarrolla en paralelo, se mejoró el sistema existente de notificaciones Radix sin cambiar el flujo de autenticación ni migrar al componente Sonner que permanece sin uso.

### Sistema visual

- Se incorporaron variantes `success`, `info`, `warning` y `destructive`, además del estilo neutro existente.
- Cada variante muestra un icono Lucide y colores semánticos suaves: verde para éxitos, azul para información/SSE, ámbar para advertencias y rojo para errores.
- El diseño ahora usa una tarjeta más compacta, borde, sombra, mejor jerarquía entre título y descripción y botón de cierre visible con etiqueta accesible.
- Las duraciones dependen de la severidad: los éxitos desaparecen antes y los errores permanecen más tiempo para poder leerlos.
- Se permiten hasta tres avisos simultáneos y las notificaciones cerradas se retiran del estado al terminar la animación, en lugar de conservarse durante más de 16 minutos.

### Mensajes y comportamiento

- Admin informa qué ticket se creó, actualizó o eliminó; la importación detalla nuevos, existentes e inválidos; el vaciado muestra sus conteos con tono de advertencia.
- Roles y usuarios identifica la persona, email o rol afectado al crear, editar, activar, desactivar o eliminar.
- El detalle del ticket muestra su número y estado al actualizar, conserva el texto del seguimiento agregado y presenta el error real devuelto por la API cuando está disponible.
- Las validaciones locales de formularios y fechas usan advertencias, reservando el rojo para fallos reales de la operación.
- Los eventos SSE de llamados e importaciones usan el tono informativo y se deduplican con el éxito local correspondiente para evitar dos avisos por una misma acción.

### Convivencia con login y validación

- No se editaron los archivos de backend, contratos, migraciones ni código generado que estaban siendo modificados por el trabajo paralelo de login.
- Los únicos puntos compartidos fueron los llamados a `toast` ya existentes en `AppLayout.tsx` y `TicketDetail.tsx`; se conservaron los cambios de sesión presentes.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto. Continúan únicamente las advertencias conocidas por sourcemaps y tamaño del bundle.

## 2026-07-17 — Login obligatorio, sesiones y bloqueo total de la API

**Agente:** Claude
**Contexto:** fases 1 y 2 del plan de autenticación definido por el usuario: credenciales + sesiones + bloqueo de todas las URLs. Los permisos por rol con checkboxes quedan para la fase siguiente.

### Cambio realizado

- **Schema (migración 0002)**: columna `usuarios.password_hash` (nullable: un usuario del catálogo sin contraseña no puede loguearse) y tabla `sesiones` (token PK, usuario_id con borrado en cascada, expiración). Aplicada a la base local con push; en Docker la aplica el migrador al arrancar.
- **Contraseñas**: scrypt del módulo `crypto` de Node (formato `scrypt:<salt>:<hash>`, comparación en tiempo constante). Sin dependencias nativas nuevas — el build de Docker no cambia.
- **Contrato OpenAPI**: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (schemas `LoginInput` y `AuthUser`) + codegen de cliente React Query y Zod.
- **Backend**:
  - `requireSession` como candado global en `routes/index.ts`: TODA la API exige sesión salvo `healthz`, el webhook de n8n (clave propia) y el login. Incluye `/api/events` (SSE) y `/api/admin/*`.
  - Sesiones en cookie `gsb_session` (`httpOnly`, `SameSite=Lax`, 7 días) respaldadas en la tabla, con purga perezosa de vencidas en cada login. Logout revoca la fila y limpia la cookie.
  - Un usuario desactivado en el catálogo pierde acceso aunque su sesión siga viva.
  - `/api/admin/*` mantiene además `x-admin-key` → **doble verificación** (`ADMIN_API_KEY` ya configurada en `.env`).
  - **Seed idempotente** al arrancar: solo si ningún usuario tiene contraseña, crea el rol `Administrador` y el usuario `admin`/`admin` (con warning en el log para cambiar la clave). No revive al admin si ya existen cuentas con contraseña — y evita el lockout total.
  - **Seguimientos**: `autor` sale siempre de la sesión; el valor del cliente se ignora (el historial deja de ser falsificable). Se quitó el `'Usuario Actual'` hardcodeado del frontend.
- **Frontend**:
  - `AuthGate` en `App.tsx`: sin sesión, cualquier URL renderiza únicamente la pantalla de login. Este fue el comportamiento inicial; la separación posterior de rutas normaliza el acceso en `/` y lleva el Dashboard a `/dashboard`.
  - Pantalla `Login.tsx` con manejo de errores 401 vs. red.
  - Ante cualquier respuesta 401 de la API (sesión vencida/revocada), un `QueryCache.onError` invalida `/auth/me` y el gate devuelve al login.
  - Footer del sidebar: usuario logueado + rol + botón de cerrar sesión (limpia todo el caché de queries).
  - El stream SSE queda detrás del gate: solo conecta con sesión iniciada.

### Validaciones ejecutadas

- Typecheck completo del workspace: correcto.
- Batería E2E contra el backend de desarrollo y la base local (12 casos, todos correctos):
  - `healthz` público: 200; `/api/tickets` y `/api/events` sin sesión: 401;
  - webhook n8n sin sesión pero con su `x-api-key`: 201 — **la ingesta automática no se ve afectada por el login**;
  - login con clave incorrecta: 401 (mensaje genérico); login `admin`/`admin`: 200 + cookie; `/auth/me`: datos correctos con rol `Administrador`;
  - con sesión: tickets 200; seguimiento creado con `autor: "Admin"` pese a que el cliente mandó un autor falsificado;
  - `/api/admin/roles` con sesión pero sin `x-admin-key`: 401; con ambas llaves: 200 (doble verificación);
  - logout: 204 y el mismo cookie jar pasa a recibir 401.
  - El ticket de prueba creado por el webhook se eliminó al final.
- Frontend respondiendo 200 con el gate activo.

### Nota operativa

- Al deployar esto al servidor de testing, el seed crea `admin`/`admin` allá también: **entrar y cambiar la clave** (o crear usuarios propios) apenas se despliegue. n8n no requiere ningún cambio.

## 2026-07-17 — Rol SysAdmin: acceso a administración restringido por rol

**Agente:** Claude
**Contexto:** el usuario definió que la cuenta semilla es suya, se llama SysAdmin (el "usuario Dios"), y que el botón/pestaña Administración solo debe verse y ser accesible para quienes tengan ese rol. También corrigió el proceso: no se pushea sin su OK explícito tras probar localmente.

### Cambio realizado

- **Fix previo (loop infinito)**: el handler global de 401 invalidaba `/auth/me` incluso cuando la que fallaba era `/auth/me` misma → refetch → 401 → loop (~3.900 requests) y pantalla en blanco. Ahora esa query queda excluida del handler.
- **Seed renombrado**: rol `Administrador` → `SysAdmin` y usuario `admin` → `sysadmin` (nombre visible "SysAdmin"). La migración de nombres es idempotente y corre al arrancar el backend, así llega sola a las bases ya desplegadas. Login: **sysadmin / admin**.
- **Backend**: middleware `requireSysAdmin` — `/api/admin/*` exige rol SysAdmin (403 sin él) además de la sesión y de `x-admin-key`. Tres candados: sesión + rol + clave.
- **Frontend**: el link «Administración» del sidebar solo se renderiza para `me.rol === 'SysAdmin'`; las rutas `/admin` y `/admin/roles-usuarios` muestran NotFound para cualquier otro rol (guard `SoloSysAdmin`). Constante compartida en `frontend/src/lib/roles.ts`, espejo de `backend/src/lib/auth.ts`.

### Validaciones ejecutadas

- Typecheck completo: correcto.
- E2E contra el backend de desarrollo y la base local:
  - login viejo `admin`: 401 (renombrado); login `sysadmin`: 200 con rol SysAdmin;
  - SysAdmin + x-admin-key sobre `/admin/roles`: 200;
  - se creó un rol `Operador` y un usuario común; sin contraseña no puede loguearse (401); con contraseña accede a tickets (200);
  - **el usuario común recibe 403 en `/api/admin/*` aunque presente la x-admin-key correcta** — la clave sola no alcanza, el rol manda;
  - usuario y rol de prueba eliminados al final (base limpia: solo sysadmin/SysAdmin).

### Pendiente conocido

- Un SysAdmin podría renombrar o desactivar su propio rol desde el catálogo y perder acceso al panel; la fase de permisos con checkboxes debe contemplar esa protección.
- Cambios sin commitear a la espera del OK del usuario tras la prueba local (nueva regla de trabajo).

## 2026-07-17 — Roles Operador/Administrador, reset de contraseña y leyenda de la llave

**Agente:** Claude
**Contexto:** el usuario definió la jerarquía de roles y pidió: llavesita de reset de contraseña por usuario, rol Operador que no puede cerrar tickets (opción grisada con leyenda), rol Administrador (todo menos el panel admin), y una leyenda real sobre la llave de administración con indicador de estado.

### Cambio realizado

- **Roles base en el seed** (idempotente, corre en cada arranque): `Administrador` ("gestión completa de tickets, puede cerrarlos, sin panel de administración") y `Operador` ("gestión básica, no puede cerrar tickets"). Jerarquía: SysAdmin > Administrador > Operador.
- **Cerrar tickets restringido**: `PATCH /api/tickets/:id` con `estado: "cerrado"` responde 403 salvo rol SysAdmin o Administrador (`puedeCerrarTickets` en `backend/src/lib/auth.ts`, espejo en `frontend/src/lib/roles.ts`). En el detalle del ticket, la opción "CERRADO" aparece deshabilitada para el resto con la leyenda "Solo puede ser cerrado por un administrador".
- **Reset de contraseña**: nuevo endpoint `POST /admin/users/{id}/password` (contrato OpenAPI + codegen; mínimo 6 caracteres). Hashea con scrypt y **revoca todas las sesiones del usuario**. En la pantalla de roles y usuarios, cada fila tiene la llavesita ámbar que abre el diálogo (clave nueva + repetir, validación en vivo).
- **Llave de administración**: leyenda real en el header del panel ("segunda verificación además de sesión y rol; queda guardada solo en esta pestaña") + indicador en vivo del estado — verde "Llave activa", rojo "Llave inválida" o "Falta la llave" — verificado con una consulta mínima a la API con la llave actual.

### Validaciones ejecutadas

- Typecheck completo: correcto.
- E2E contra el backend de desarrollo:
  - roles base presentes tras el arranque (Administrador, Operador, SysAdmin);
  - reset de contraseña: 204; contraseña corta: 400;
  - usuario Operador logueado: cerrar → 403, en_proceso → 200; SysAdmin: cerrar → 200;
  - reset de contraseña con el usuario logueado: su sesión vieja pasó a 401 al instante;
  - ticket usado en la prueba restaurado a su estado original y usuario de prueba eliminado (quedan solo sysadmin y los tres roles).

### Pendiente

- Cambios sin commitear a la espera del OK del usuario tras la prueba local.

## 2026-07-17 — Persistencia de llave, visibilidad de secretos y categoría Legales

**Agente:** Codex
**Contexto:** se pidió no tener que volver a ingresar la `ADMIN_API_KEY` después de cada login, mantener los secretos ocultos con opción de visualizarlos y sumar `Legales` a la clasificación automática de motivos.

### Llave administrativa recordada

- La llave **no se guarda en la base de datos** ni se incorpora a usuarios, roles o sesiones. Guardar el secreto maestro reversible en SQLite eliminaría el valor de la segunda verificación y aumentaría su exposición.
- `useAdminAccess` la persiste en `localStorage` bajo `admin-key:user:<id>`, separada por usuario SysAdmin. El valor legado de `sessionStorage` se migra una sola vez.
- El logout conserva esta preferencia local, pero sigue revocando la sesión, limpiando React Query y recargando la raíz. Vaciar manualmente el campo elimina la llave persistida para ese usuario.
- El campo permanece enmascarado por defecto y tiene un botón accesible para mostrar/ocultar. La llave tampoco forma parte del `queryKey` de React Query.
- Alcance de seguridad: la comodidad funciona solamente en ese navegador/perfil. Como todo valor de `localStorage`, podría ser leído por JavaScript del mismo origen ante una vulnerabilidad XSS; cifrarlo solo del lado cliente no aporta protección real sin solicitar otro secreto.

### Campos de contraseña

- Se agregó el componente reutilizable `PasswordInput` con ojo abierto/cerrado, botón `type="button"`, texto accesible, foco visible y soporte de campos deshabilitados.
- Se aplicó al login, contraseña inicial y repetición al crear usuarios, y ambos campos del restablecimiento de contraseña.
- Al cerrar, cancelar o guardar los diálogos administrativos, los valores de contraseña se eliminan del estado React y la visibilidad vuelve a oculta al reabrir.

### Categoría `Legales`

- El código estable `legales` y la etiqueta **Legales** se agregaron al clasificador compartido, schema Drizzle, contrato OpenAPI, clientes generados, filtros, badges y gráficos.
- Las reglas priorizan señales legales explícitas: carta documento, telegrama laboral, SECLO, asesoramiento jurídico, intimaciones, demandas/juicios/audiencias con contexto laboral o judicial y contacto explícito con abogados.
- Se agregaron casos negativos para evitar falsos positivos: un recibo destinado a un abogado conserva `recibos_documentacion`, una abogada postulándose conserva `empleo_postulaciones` y una referencia genérica al nombre legal de la empresa queda sin clasificar.
- La migración de datos `0006_add_legales_category.sql` actualiza únicamente `motivo_categoria`; respeta la prioridad del motivo sobre el resumen y conserva intactos `motivo` y `resumen`. Incluye snapshot y journal de Drizzle para mantener la cadena de migraciones.
- Antes del backfill local se creó `backups/pre-legales-20260717-171039.db`, verificado con `integrity_check = ok`. La base actual no contenía coincidencias legales: se modificaron 0 filas, los campos originales conservaron el mismo hash y la integridad permaneció en `ok`.

### Validaciones

- Tests del clasificador: 10/10 correctos, incluidos prioridad motivo/resumen, acentos y falsos positivos.
- Test de la migración sobre SQLite en memoria: correcto; solo cambia la categoría derivada de los fixtures legales.
- Typecheck del frontend: correcto.
- Build completo del workspace: correcto. El codegen de OpenAPI también finalizó correctamente.
- Servicios verificados después del reinicio: frontend `/` y `/dashboard` en HTTP 200; backend `/api/healthz` en HTTP 200.
- La comprobación E2E adicional del navegador no se contabilizó porque Chromium quedó bloqueado; se detuvieron exclusivamente esos procesos de prueba y se eliminó su perfil temporal.
- No se realizó commit ni push.

## 2026-07-17 — API key obligatoria para gestiones SysAdmin y redirección de logout

**Agente:** Codex
**Contexto:** se detectó que el CRUD de tickets dentro de Administración mezclaba endpoints protegidos por `x-admin-key` con rutas operativas que solo exigían sesión. Por eso un SysAdmin podía vaciar el campo de la llave y aun así editar o borrar desde esa pantalla. También se pidió que el cierre de sesión navegue automáticamente a la raíz, donde vive el login.

### Autorización aplicada

- `requireAdminKey` ahora **falla cerrado**: si `ADMIN_API_KEY` falta, está vacía o contiene solo espacios, responde `503`. Una llave ausente o incorrecta responde `401`; nunca se abre el panel por falta de configuración.
- Todas las rutas `/api/admin/*` mantienen el orden de candados: sesión válida → rol `SysAdmin` → `x-admin-key`. Esto incluye alta/edición de usuarios y roles, reset de contraseñas, alta manual de tickets, importación y truncate.
- `DELETE /api/tickets/:id` quedó reservado a sesión SysAdmin + API key. Ya no puede ejecutarlo cualquier usuario autenticado.
- `PATCH /api/tickets/:id` diferencia los usos:
  - los campos operativos `estado`, `prioridad`, `notas`, `progreso` y `fecha_limite` conservan el flujo normal por sesión/rol;
  - modificar datos administrativos u originales (`hora`, contacto, empresa, motivo/resumen, audio, notificación o fecha de resolución) exige SysAdmin + API key.
- El formulario CRUD de Administración ahora envía `x-admin-key` tanto al editar como al eliminar. La validación es del backend; ocultar botones o rutas en el frontend no se considera una defensa.

### Logout y experiencia de usuario

- Tras un logout exitoso se limpia React Query, se bloquea el doble clic mientras la petición está pendiente y se recarga `/` con reemplazo de historial para descartar por completo el estado autenticado anterior. La llave administrativa se conserva en el almacenamiento local por usuario, según la actualización posterior documentada en esta bitácora.
- No existe una pantalla independiente en `/login`: cuando no hay sesión, `AuthGate` muestra el formulario de acceso en la raíz (`http://<host>:3000/`).
- El indicador de la llave muestra específicamente cuando el servidor responde `503` por falta de `ADMIN_API_KEY`.

### Contrato, despliegue y validaciones

- OpenAPI documenta la autorización condicional del `PATCH`, el borrado exclusivo de SysAdmin y las respuestas `401/403/503`; los clientes React Query y Zod se regeneraron correctamente.
- `.env.example`, Docker Compose, el workflow de deploy y los README/runbooks declaran `ADMIN_API_KEY` como obligatoria. Compose corta el despliegue si no se entrega la variable.
- `pnpm run build`: correcto para librerías, backend, frontend y scripts. Persisten únicamente los avisos no bloqueantes conocidos de sourcemaps y tamaño del bundle.
- Pruebas HTTP contra los servidores reconstruidos, usando IDs inexistentes para no modificar tickets reales:
  - edición administrativa sin llave / con llave incorrecta → `401`; con llave válida llega al recurso y devuelve `404`;
  - edición operativa sin llave llega al recurso y devuelve `404`, confirmando que no se bloqueó el trabajo diario;
  - borrado sin llave → `401`; con llave válida → `204` sobre ID inexistente;
  - alta de usuario o rol sin llave → `401`; con llave válida y body deliberadamente inválido → `400`, confirmando que superó autorización y llegó a validación;
  - backend aislado con `ADMIN_API_KEY` en blanco → `503` en `/api/admin/roles`.
- Las sesiones temporales se cerraron al finalizar. Backend y frontend quedaron activos en `5000` y `3000`, ambos con HTTP `200`. No se realizó commit ni push.

## 2026-07-17 — Raíz de login y pantallas de error

**Agente:** Codex
**Contexto:** se corrigió el destino del logout porque el login no es una ruta propia: se renderiza en `/` cuando no existe una sesión válida. También se unificó el tratamiento visual de errores para evitar pantallas vacías o mensajes 404 engañosos ante problemas de permisos, red o servidor.

### Navegación y sesión

- El logout recarga `/` mediante reemplazo de historial; no genera ni utiliza `/login`.
- Un `401` de sesión invalida/revalida `/auth/me`, normaliza la URL a `/` y muestra allí el formulario de acceso.
- Los `401` causados por una API key administrativa ausente o incorrecta no cierran la sesión del SysAdmin: se informan dentro de la gestión correspondiente.

### Experiencia de error

- Se agregó una pantalla reutilizable con textos en español para `401`, `403`, `404`, `409`, `500`, `503` y errores desconocidos.
- Todas las variantes ofrecen **Volver al inicio**; los fallos recuperables de red o servidor agregan **Reintentar** con indicador de carga.
- El acceso a Administración sin rol SysAdmin muestra correctamente `403`, y una ruta inexistente muestra `404`.
- Un límite global de errores de React captura fallos de render no controlados y ofrece recargar la aplicación.
- Dashboard, listado de tickets, detalle y CRUD administrativo distinguen un fallo de carga de un resultado vacío y permiten reintentar. Un ticket inexistente conserva su tratamiento específico como `404`.

### Documentación

- Se actualizaron `frontend/README_FRONTEND.md`, `docs/FLUJO.md` y esta bitácora con la raíz real del login y la matriz de errores.
- `pnpm --filter @workspace/frontend run typecheck`: correcto.
- `pnpm run build`: correcto para librerías, backend, frontend y scripts; solo permanecen los avisos no bloqueantes ya conocidos de sourcemaps y tamaño del bundle.
- Verificación HTTP final: frontend en `3000` y backend (`/api/healthz`) en `5000`, ambos con respuesta `200`.
- `git diff --check`: correcto; únicamente se informaron las advertencias esperadas de conversión LF/CRLF de Git en Windows.
- No se realizó commit ni push.

## 2026-07-17 — Separación entre login y Dashboard

**Agente:** Codex
**Contexto:** después del logout la URL cambiaba a `/`, pero esa misma ruta también renderizaba el Dashboard. `queryClient.clear()` elimina las queries, aunque un observer activo puede conservar brevemente su último resultado; durante esa ventana la raíz volvía a mostrar contenido autenticado. Se eligió la alternativa de conservar el login en la raíz y crear `/dashboard` como ruta independiente.

### Contrato de navegación

- `/` es la entrada pública: sin sesión muestra el formulario de login y con una sesión válida redirige a `/dashboard` mediante reemplazo de historial.
- `/dashboard` contiene el Dashboard y está protegido, al igual que `/tickets` y `/admin`, por `AuthGate`.
- El login exitoso actualiza primero el caché de `/auth/me` y navega explícitamente a `/dashboard`.
- El enlace Dashboard del sidebar apunta a `/dashboard` y su estado activo contempla subrutas sin confundirlo con la raíz.
- No se agregó un endpoint de backend ni una pantalla `/login`: el cambio es exclusivamente de routing del frontend.

### Logout sin estado residual

- Después del `204` se limpia React Query, se conserva la llave administrativa local del usuario y se usa `window.location.replace(import.meta.env.BASE_URL)` para recargar la raíz.
- La recarga completa desmonta el árbol autenticado y vuelve a consultar `/auth/me` con la cookie ya eliminada; así no puede reaparecer el Dashboard por un usuario retenido en memoria.
- Las pantallas de error autenticadas vuelven por defecto a `/dashboard`; los errores ocurridos mientras se verifica la sesión vuelven a `/`.

### Documentación y validación

- Se actualizaron `frontend/README_FRONTEND.md`, `docs/FLUJO.md` y esta bitácora con el nuevo mapa de rutas.
- `pnpm run build`: correcto para librerías, backend, frontend y scripts; solo permanecen los avisos no bloqueantes ya conocidos de sourcemaps y tamaño del bundle.
- Prueba E2E headless con un perfil aislado de navegador:
  - abrir `/dashboard` sin sesión terminó en `/` mostrando Login;
  - un login exitoso terminó en `/dashboard` mostrando el Dashboard;
  - el botón de logout terminó en `/` mostrando nuevamente Login.
- `/` y `/dashboard` respondieron `200` como rutas SPA, y `/api/auth/me` sin cookie respondió `401`.
- Los perfiles y scripts temporales usados para la prueba se eliminaron del workspace.
- No se realizó commit ni push.

## 2026-07-17 — Clasificación automática de motivos sin alterar datos de n8n

**Agente:** Codex
**Contexto:** el Dashboard agrupaba literalmente cada redacción recibida en `motivo`, por lo que pequeñas variaciones generaban categorías distintas. El usuario aprobó normalizar la visualización con la condición explícita de no modificar ningún dato de origen.

### Protección de los datos originales

- `tickets.motivo` y `tickets.resumen` se conservan exactamente como llegaron. La clasificación trabaja sobre texto normalizado en memoria y escribe únicamente la nueva columna derivada `motivo_categoria`.
- Antes del cambio se creó el backup WAL-safe `backups/pre-motivo-categorias-20260717-150952.db`; pasó `PRAGMA integrity_check` y permanece fuera de Git.
- El backfill local comparó por SHA-256 los campos `id`, `motivo` y `resumen` antes y después: los 15 tickets conservaron el mismo hash (`9bcf05faff3fe83fbcb4e667bb45c84feb7782a5d8db4b2c6f5603c58447fd4c`).
- Los textos ambiguos o desconocidos no se fuerzan a una categoría: quedan en `sin_clasificar`.

### Taxonomía y reglas

- Categorías estables: `haberes_pagos`, `recibos_documentacion`, `vacaciones_licencias`, `bajas_liquidacion`, `empleo_postulaciones`, `contacto_general`, `reclamos` y `sin_clasificar`.
- El clasificador compartido elimina tildes, signos y diferencias de mayúsculas solo en una copia para comparar patrones. Primero evalúa `motivo`; consulta `resumen` únicamente si el motivo no coincide, evitando que un detalle secundario pise la intención explícita.
- Se contemplaron redacciones reales de la base, incluida finalización del período de prueba, liquidación/entrega de uniforme, llamada perdida y el typo `incorporciones`.
- Webhook n8n, alta manual, importación CSV/Excel y edición de motivo/resumen usan la misma función. El cliente no puede enviar ni sobrescribir directamente la categoría derivada.

### Base, API e interfaz

- Schema Drizzle y migración `0003_faulty_zaran.sql`: columna `motivo_categoria` no nula con fallback seguro y backfill determinista para bases ya existentes.
- `GET /api/dashboard/motivos` agrupa por código estable y devuelve también su etiqueta legible; `GET /api/tickets` acepta el filtro exacto `motivo_categoria` sin reemplazar el filtro textual de `motivo`.
- OpenAPI, validadores Zod y cliente React Query fueron regenerados con el nuevo campo y enum.
- Dashboard usa etiquetas y colores fijos por categoría. El listado suma filtro y badge de categoría, pero mantiene visible debajo la frase original del contacto.

### Validaciones ejecutadas

- Codegen y typecheck completo del workspace: correctos.
- La base local quedó íntegra y distribuida en las ocho categorías: bajas 3, empleo 3, sin clasificar 3, recibos 2 y una en cada categoría restante.
- La migración se ejecutó además sobre una base temporal con 11 fixtures, incluyendo prioridad de motivo sobre resumen: categorías esperadas, campos originales idénticos e `integrity_check = ok`.
- El archivo temporal de validación se eliminó al terminar. Los cambios permanecen sin commit ni push hasta indicación explícita del usuario.

## 2026-07-17 — Footer del sidebar V0.2 y reinicio local

**Agente:** Codex

- Se conservó el nombre del usuario y el rol en líneas independientes dentro del bloque de sesión.
- La marca se separó visualmente mediante una línea tenue y quedó al pie como `GSB IT - V0.2`, sin modificar autenticación, navegación, SSE ni logout.
- Se reiniciaron backend y frontend para cargar el clasificador y la interfaz actuales. El backend quedó escuchando en `5000` y el frontend en `3000`, ambos con respuesta HTTP `200`; `/api/dashboard/motivos` respondió correctamente desde la sesión abierta.

## 2026-07-17 — Categoría y empresa reorganizadas en el listado

**Agente:** Codex

- La columna visible `Empresa` fue reemplazada por `Categoría` y ahora contiene el badge cromático de la clasificación automática.
- La columna `Motivo` volvió a mostrar únicamente el texto original recibido, sin ocultarlo ni reemplazarlo.
- La empresa se movió debajo del nombre del contacto en tipografía secundaria; cuando no existe o solo contiene espacios se muestra `Sin empresa asociada`.
- El dato y el filtro de empresa se conservaron. También se mantuvieron las ocho columnas, sus skeletons y el `colSpan` del estado vacío.

## 2026-07-17 — Autoasignación por transición de estado

**Agente:** Codex
**Regla acordada:** una transición real de estado asigna el ticket al usuario autenticado que la ejecutó. La primera salida de `nuevo` lo toma y una transición posterior realizada por otra persona lo reasigna a esa última persona. Editar otros campos o reenviar el mismo estado conserva al responsable actual.

### Implementación y compatibilidad

- Antes del cambio se creó el backup WAL-safe `backups/pre-autoasignacion-20260717-154250.db`, verificado con `integrity_check = ok`.
- Tras aplicar y verificar el esquema local se creó además `backups/post-autoasignacion-20260717-155422.db`, también íntegro.
- La migración aditiva `0005_sturdy_night_nurse.sql` incorpora `tickets.asignado_usuario_id`, FK nullable a `usuarios.id` con `ON DELETE SET NULL`. No se intentó inferir responsables históricos por nombre.
- `asignado_usuario_id` es la identidad autoritativa. `asignado_a` se conserva como nombre visible y como compatibilidad para valores históricos recibidos por webhook o importaciones.
- `PATCH /api/tickets/:id` obtiene el usuario exclusivamente de `res.locals.authUser`; el cliente no puede enviar el ID ni falsificar la asignación mediante texto libre. En una transición se actualizan estado, ID y nombre dentro del mismo `UPDATE`.
- Cambiar notas, prioridad o progreso sin una transición no modifica la asignación. Intentar cerrar sin rol Administrador/SysAdmin sigue devolviendo `403` antes de reasignar.
- Cada actualización emite `ticket_actualizado` por SSE, por lo que las demás sesiones invalidan su caché y ven al responsable nuevo sin recargar manualmente.
- El campo libre “Asignado a” se retiró de la edición administrativa normal. Webhook e importadores siguen aceptando el valor externo legado sin convertirlo automáticamente en un usuario.

### Validaciones ejecutadas

- Contrato OpenAPI y clientes Zod/React Query regenerados; typecheck completo correcto.
- E2E sobre base temporal y backend aislado con dos operadores:
  - Ana cambió `nuevo → en_proceso` y quedó asignada;
  - Bruno editó prioridad reenviando `en_proceso` y la asignación siguió en Ana;
  - Bruno cambió `en_proceso → pendiente` y recibió la asignación;
  - Ana editó solo notas y la asignación permaneció en Bruno.
- La cadena real de migraciones `0000` a `0005` se aplicó en otra base temporal. Al eliminar el usuario asignado, la FK pasó a `null`, el snapshot textual se conservó y `integrity_check` resultó `ok`.
- Las bases, usuarios, sesiones y tickets temporales se eliminaron al finalizar. No se realizó commit ni push.

## 2026-07-17 — Nombre de usuario y contraseña al crear usuarios

**Agente:** Claude
**Contexto:** el usuario pidió que al crear un usuario desde el panel se pueda definir directamente su nombre de usuario y contraseña (en vez de crear el usuario sin clave y usar por separado la llavesita de reset) — "nosotros gestionamos todo y le damos los datos para que se logueen".

### Cambio realizado

- **Schema**: nueva columna `usuarios.username` (text, unique, **nullable** — migración 0004, `ALTER TABLE ADD COLUMN` sin default para no romper la fila existente de sysadmin). El login pasa a validar contra `username`, no contra `email` (que queda como dato de contacto).
- **Seed (`ensureAdminSeed`)**: además de lo que ya hacía, ahora (a) backfillea `username = email` para cualquier usuario existente con `username` nulo — corre en cada arranque, no-op una vez aplicado — y (b) setea `username: "sysadmin"` explícitamente en el alta/renombre del usuario semilla. Esto hizo que la cuenta sysadmin ya desplegada (creada antes de este cambio) recuperara el login solo, sin intervención manual.
- **Contrato OpenAPI**: `AdminUserInput` (creación) ahora exige `username` y `password` (mínimo 6 caracteres) además de lo que ya pedía; `AdminUserUpdate` admite `username` opcional (sin `password` — cambiar la clave de un usuario existente sigue siendo exclusivo del endpoint de reset, que revoca sesiones). `AdminUser` expone `username`.
- **Backend `POST/PATCH /admin/users`**: valida unicidad de `username` y `email` con chequeos proactivos antes del insert/update (para poder devolver un 409 específico por campo, ya que dos columnas UNIQUE no se pueden distinguir con un catch genérico); hashea la contraseña con `hashPassword()` al crear.
- **Fix de seguridad encontrado de paso**: `GET/POST/PATCH /admin/users` devolvían la fila completa de Drizzle, **incluido `password_hash`**, en la respuesta HTTP. Antes era inofensivo (siempre `null`), pero con contraseñas reales esto exponía el hash al cliente. Se agregó `PUBLIC_USER_COLUMNS` (proyección explícita sin `password_hash`) y se aplicó a las tres rutas.
- **Frontend** (`AdminRolesUsers.tsx`): el formulario de alta ahora pide nombre de usuario (siempre) y contraseña + repetir (solo al crear, con validación de mínimo 6 caracteres y coincidencia); al editar un usuario existente no se piden campos de contraseña — el cambio de clave sigue yendo por la llavesita de reset. La tabla ganó una columna "Nombre de usuario".

### Validaciones ejecutadas

- Typecheck completo del workspace: correcto.
- **Se detectó y corrigió un error propio durante la verificación**: la primera corrida de pruebas E2E dio resultados inconsistentes (sin campo `username` en las respuestas, `password_hash: null` visible, login por username fallando) porque el backend de desarrollo seguía corriendo una build vieja de antes de estos cambios (`pnpm run dev` no tiene watch mode). Se detectó por la presencia de `password_hash` en la respuesta (imposible bajo el código nuevo), se mató el proceso viejo, se reconstruyó y se repitió la prueba completa contra el código real.
- E2E contra el backend reconstruido (11 casos, todos correctos): alta con username+password sin `password_hash` en la respuesta; username duplicado → 409; email duplicado → 409; contraseña corta → 400; login por `username` → 200 con rol correcto; login por el email viejo → 401 (corte limpio); el usuario nuevo ve tickets pero no admin (403, la restricción por rol se mantiene); el listado de usuarios no expone `password_hash` en ningún registro; el backfill del seed dejó a `sysadmin` con `username: "sysadmin"` sin intervención manual.
- Datos de prueba (usuario `jperez` y un registro accidental creado contra el backend viejo) eliminados al finalizar; la base quedó con un único usuario (`sysadmin`).

### Pendiente

- Cambios sin commitear a la espera del OK del usuario tras la prueba local.
