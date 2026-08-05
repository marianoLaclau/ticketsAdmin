# Bitácora de agentes

Registro de intervenciones realizadas por asistentes sobre el repositorio. Cada entrada debe indicar alcance, decisiones, archivos afectados y validaciones ejecutadas.

## 2026-08-05 — Readiness aplicada al despliegue

**Agente:** Codex
**Estado:** vigesimocuarta remediación de la auditoría técnica, implementada localmente.

- El healthcheck del backend dejó de aceptar liveness como disponibilidad: consulta `/api/readyz`, exige HTTP 200 y el cuerpo exacto `{"status":"ready"}`. El período inicial de 60 segundos cubre migraciones, bootstrap y reconciliaciones sin retrasar un éxito temprano.
- El frontend queda healthy únicamente si Nginx sirve el mount point real de React y el proxy devuelve el JSON exacto de readiness. Las descargas se capturan antes del grep para conservar el código de error de `wget`; una fallback SPA, un 503 o una respuesta truncada no pueden producir un falso positivo.
- Compose espera ambos servicios durante hasta 180 segundos. `depends_on.restart` reinicia Nginx ante reemplazos explícitos del backend para renovar su DNS interno; se documentó que no responde a degradaciones, auto-restarts ni reemplazos externos.
- El runner valida antes del build que Docker Compose sea al menos 2.17, soporte `--wait`/`--wait-timeout`, disponga de `curl` y acepte la configuración. Tras el rollout hace smoke sobre API directa, SPA y API proxied; el prune ocurre solo después del éxito y un fallo deja estado más logs acotados para diagnóstico.
- Se agregaron regresiones estáticas por bloque de servicio/step, normalizadas para LF/CRLF, que evitan coincidencias accidentales entre SPA y API y verifican orden, condiciones, contenido, límites de diagnóstico y proxy Nginx.
- Archivos principales: Compose, workflow de deploy, pruebas operativas, arquitectura y runbook.
- Validaciones: `docker compose config --quiet`, 6 pruebas focalizadas y 312 pruebas totales aprobadas. El gate completo se ejecuta sobre el commit local antes de continuar al siguiente bloque.

## 2026-08-05 — Readiness real del backend

**Agente:** Codex
**Estado:** vigesimotercera remediación de la auditoría técnica, implementada localmente.

- Se separaron los contratos operativos: `GET /api/healthz` es liveness estática y responde únicamente `200 { status: "ok" }`; `GET /api/readyz` publica `200 { status: "ready" }` o `503 { status: "unavailable" }`. Ambos endpoints son públicos, usan `Cache-Control: no-store` y OpenAPI/codegen conserva tipos distintos para éxito y error.
- El proceso mantiene un estado monótono `starting → ready → draining`. Solo se anuncia listo desde el evento HTTP `listening`; una señal o error inicia el drenaje como primera acción síncrona y el estado nunca puede volver a `ready`, incluso ante una carrera de arranque.
- Readiness falla cerrado fuera de la fase lista. Dentro de ella verifica que el handle SQLite siga abierto y ejecuta una lectura acotada de `tickets.id` y `tickets.version`, validando conexión y schema mínimo sin conteos, escrituras ni recorridos completos. Un error se registra internamente, pero la respuesta no filtra excepciones, paths ni detalles del motor.
- La ruta quedó construible por inyección para probar dependencias fallidas sin cerrar la base compartida. Se cubrieron el estado irreversible, la ausencia de sondas durante arranque/drenaje, recuperación de un fallo transitorio, schema ausente, handle cerrado, separación exacta de schemas Zod, respuesta HTTP genérica y orden del apagado.
- Archivos principales: contrato y artefactos OpenAPI, control y sonda de readiness, router de health, composition root/ciclo de salida, pruebas y documentación técnica.
- Validaciones: 16 pruebas focalizadas, schema Drizzle, 166 pruebas backend y 308 pruebas totales aprobadas; typecheck y builds de producción completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Apagado controlado del backend

**Agente:** Codex
**Estado:** vigesimosegunda remediación de la auditoría técnica, implementada localmente.

- El proceso captura `SIGTERM` y `SIGINT` mediante un controlador idempotente: detiene nuevas revisiones automáticas, deja de aceptar conexiones HTTP, pone el registro SSE en drenaje irreversible y espera en paralelo los sockets y la revisión de prioridad que ya estaban activos. Un request SSE aceptado antes de la señal pero autenticado después recibe `503` y no puede reabrir el stream.
- `server.close()` puede resolver aunque siga vivo un handler async cuyo cliente abortó. Por eso SQLite no se cierra ahí: queda registrado un cierre síncrono en `beforeExit`, cuando Node ya no tiene trabajos libuv capaces de reanudar esos handlers. La salida forzada nunca intenta cerrar una base potencialmente en uso.
- El deadline de 20 segundos permanece referenciado durante el drenaje visible y luego pasa a `unref`: permite una salida natural, pero todavía fuerza sockets y código de error si un trabajo huérfano mantiene vivo el proceso. El log de ese camino se vacía con un fusible acotado antes de salir.
- El runner de prioridad conserva ahora la promesa de la ejecución lanzada por su intervalo y expone una espera explícita; detener el timer ya no pierde el trabajo que estaba en curso.
- El backend de larga vida reemplaza al shell mediante `exec`, por lo que recibe directamente la señal de Docker. Compose reserva 30 segundos antes de `SIGKILL`, dejando margen al deadline interno y al log final.
- Se agregaron pruebas deterministas, sin señales reales ni esperas temporales como condición de éxito, para idempotencia, orden de drenaje, watchdog, `beforeExit`, cliente HTTP abortado, alta SSE tardía, wiring de señales, configuración Docker y espera del runner periódico.
- Residual deliberado: durante `dist/migrate.mjs` el shell todavía es PID 1 y los handlers se instalan después del bootstrap de aplicación. Separar la migración en un servicio one-shot y hacer cancelable todo el startup requieren otro bloque; las migraciones SQLite actuales son transaccionales y este commit no mezcla esa reestructuración.
- Validaciones: 18 pruebas focalizadas, 160 pruebas backend y 302 pruebas totales aprobadas; `pnpm run quality` también verificó codegen sin drift, cadena Drizzle, typecheck y builds de producción.

## 2026-08-05 — Quality gate reproducible antes del deploy

**Agente:** Codex
**Estado:** vigesimoprimera remediación de la auditoría técnica, implementada localmente.

- Se fijó `pnpm@11.13.1` mediante `packageManager`, alineado con Node 24, para que local, GitHub Actions y Docker no elijan versiones distintas del gestor.
- `pnpm run codegen:check` regenera el cliente React Query y los schemas Zod y consulta `git status --porcelain` sobre ambos árboles. El gate detecta tanto archivos versionados modificados como tipos nuevos sin agregar, caso que `git diff` por sí solo omite.
- `pnpm run quality` encadena codegen sin drift, `drizzle-kit check`, las suites completas, typecheck y builds. Es el único comando que usan los workflows para evitar dos definiciones divergentes de calidad.
- El workflow reutilizable `Quality` corre en `ubuntu-latest` para cada pull request y también puede ejecutarse manualmente. `Deploy` lo invoca primero y el job self-hosted queda condicionado a su resultado; una revisión fallida no toca los contenedores.
- La exclusión mutua cubre el workflow completo y el runner compara el SHA con el `main` remoto antes de construir y nuevamente antes de reiniciar, evitando desplegar una ejecución que quedó obsoleta durante el build. El job self-hosted tiene un límite de 45 minutos. Las API keys reales dejaron de estar disponibles para checkout/build y solo se inyectan en el step que recrea los servicios; Compose recibe placeholders no sensibles durante el build.
- Se documentaron el comando local, el flujo PR/deploy y el alcance exacto del gate. Este commit no agrega todavía espera de health, smoke, backup previo ni rollback automático: quedan separados en los siguientes bloques operativos.
- Validaciones: detección positiva de un archivo generado no trackeado, `pnpm run codegen:check`, 291 pruebas y builds/typecheck completos mediante `pnpm run quality`.

## 2026-08-05 — Control optimista end-to-end de tickets

**Agente:** Codex
**Estado:** vigésima remediación de la auditoría técnica, implementada localmente.

- OpenAPI expone `Ticket.version` como entero positivo, requerido y de solo lectura. Cada `TicketUpdate` exige `expected_version`, al menos un campo editable y rechaza propiedades ajenas; el codegen propagó tipos/validadores de campo y el backend aplica además la whitelist y la cardinalidad del objeto.
- `PATCH /tickets/:id` usa `BEGIN IMMEDIATE`, compara la versión antes de evaluar un no-op y repite la condición en el UPDATE. Una escritura real incrementa dato + versión y crea su seguimiento en la misma transacción.
- Un snapshot viejo recibe `409` con `code: TICKET_VERSION_CONFLICT`, ticket y revisiones esperada/actual. No cambia datos, asignación ni fechas, no audita y no emite SSE. Un no-op vigente conserva la versión.
- Gestión, datos de contacto y CRUD Admin congelan datos + versión al abrir. Los helpers siguen produciendo change-sets mínimos y agregan la precondición solo después de descartar `{}`; nunca toman la versión viva refrescada por SSE.
- Ante conflicto, los tres editores permanecen abiertos y conservan el draft para que pueda revisarse o copiarse. Guardar queda bloqueado hasta que la persona elige explícitamente descartar sus cambios y cargar la revisión actual; si esa recarga falla, el draft sigue intacto.
- Una respuesta exitosa solo actualiza la caché si no existe ya una versión más nueva recibida por SSE/refetch. Las promociones automáticas toman la versión autoritativa de `UPDATE RETURNING` y la incluyen en `ticket_actualizado` después del commit.
- Se agregaron regresiones para validación de precondiciones, no-op, rollback, retry con versión nueva, dos PATCH competidores (uno 200 y uno 409), baseline congelado y traducción estricta del código de error.
- Archivos principales: OpenAPI/codegen, ruta PATCH, tres editores, helper de versión, suites backend/frontend y documentación operativa.
- Validaciones: 291 pruebas correctas (backend 149, frontend 77, base de datos 12, política compartida 4, ingesta 48 y scripts 1), codegen, typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Base monotónica para concurrencia de tickets

**Agente:** Codex
**Estado:** decimonovena remediación de la auditoría técnica, implementada localmente.

- Se agregó `tickets.version`, entero no nulo con default 1 y restricción positiva. La migración aditiva `0012` preserva filas históricas, evita reconstruir la tabla y deja el mismo default para altas futuras.
- La versión no forma parte de `TicketInput`, CSV ni datos funcionales: webhook, alta administrativa e importadores no pueden imponerla desde afuera.
- Las promociones automáticas de prioridad y la reconciliación conservadora de categorías incrementan la revisión mediante `version = version + 1` en el mismo UPDATE protegido por compare-and-set.
- Un fallo al insertar la auditoría revierte prioridad y versión juntas; repetir una promoción o reconciliación sin cambios no vuelve a incrementar la fila.
- Se actualizaron las fixtures que representan el schema actual y se agregó una prueba de migración para históricos, defaults, constraint, integridad e idempotencia de la cadena completa.
- Archivos principales: schema/migración Drizzle, mutadores internos, fixtures, pruebas y documentación.
- Validaciones: 282 pruebas correctas (backend 145, frontend 72, base de datos 12, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — PATCH mínimo en el CRUD administrativo

**Agente:** Codex
**Estado:** decimoctava remediación de la auditoría técnica, implementada localmente.

- El formulario de tickets de Administración dejó de usar un `Record<string, string>` y casts `any`: altas, ediciones y nombres de campo comparten ahora un contrato tipado.
- Al abrir una fila se captura un baseline independiente. La edición compara contra ese snapshot y envía únicamente hora, contacto, motivo, resumen, notas, audio, estado o prioridad que realmente cambiaron; `conversation_id` continúa deshabilitado y nunca entra en el PATCH.
- Borrar teléfono, DNI, empresa, email, resumen, notas o audio produce `null`, no un string vacío ni una omisión accidental. Las altas manuales, por separado, recortan los requeridos y omiten opcionales vacíos.
- Un refresco SSE del listado no modifica el baseline abierto. Guardar un formulario sin diferencias cierra el diálogo con una confirmación local y no genera request ni seguimiento espurio.
- Se agregaron pruebas puras para alta determinista, normalización, limpieza explícita, PATCH mínimo, no-op e independencia frente a un ticket actualizado por SSE.
- Archivos principales: formulario/helper de tickets administrativos, pantalla Admin, pruebas y documentación.
- Validaciones: 281 pruebas correctas (backend 145, frontend 72, base de datos 11, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Baseline inmutable para datos de contacto

**Agente:** Codex
**Estado:** decimoséptima remediación de la auditoría técnica, implementada localmente.

- `TicketDataEditDialog` dejó de comparar el formulario contra el objeto `ticket` vivo. Al abrir crea dos objetos separados: baseline autoritativo y draft editable; el PATCH se calcula únicamente entre ambos.
- Si SSE actualiza teléfono, DNI, empresa, email, motivo u otro dato mientras el diálogo está abierto, ese valor remoto no se interpreta como una edición inversa del usuario y no vuelve al backend desde un formulario stale.
- El baseline se renueva al abrir o cambiar de ticket, pero deliberadamente permanece congelado durante la edición. El submit también rechaza programáticamente un no-op además de mantener el botón deshabilitado.
- Se eliminó el helper ambiguo que aceptaba un `Ticket` vivo y quedó una única API explícita `buildFunctionalTicketUpdateFromBaseline`.
- Se agregó una regresión pura que reproduce un teléfono actualizado por SSE mientras el draft cambia solo el email y exige un PATCH exclusivo de email.
- Archivos principales: diálogo de datos, helper/test de edición y documentación.
- Validaciones: 275 pruebas correctas (backend 145, frontend 66, base de datos 11, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — PATCH mínimo para la gestión del ticket

**Agente:** Codex
**Estado:** decimosexta remediación de la auditoría técnica, implementada localmente.

- El diálogo de estado dejó de enviar siempre una instantánea completa de estado, prioridad, notas y progreso. Captura un baseline autoritativo al abrirse y construye un `TicketUpdate` solo con diferencias reales.
- Si un SSE refresca el ticket mientras el diálogo permanece abierto, los campos que la persona no tocó se omiten y no pisan el trabajo de otro usuario ni una promoción automática de prioridad. La fecha límite administrativa se compara contra el mismo baseline, no contra el ticket vivo.
- Elegir un estado actualiza visualmente el slider al progreso canónico del nuevo paso; si luego se ajusta manualmente, se respeta ese valor explícito. Volver al estado original restaura también el progreso capturado al abrir, incluso en tickets históricos no canónicos. Cambios aislados de prioridad, progreso o notas permanecen aislados; borrar notas produce `null` y guardar sin cambios no llama a la API.
- Se reemplazó el estado `any` por un formulario tipado y se centralizó el mapa estado/progreso para evitar dos fuentes divergentes.
- Se agregaron pruebas puras para PATCH mínimo, estado/progreso acoplados, borrado de notas, progreso aislado y no-op.
- Archivos principales: `TicketDetail`, helper/test de edición y documentación.
- Validaciones: 274 pruebas correctas (backend 145, frontend 65, base de datos 11, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Contrato nullable preciso para tickets

**Agente:** Codex
**Estado:** decimoquinta remediación de la auditoría técnica, implementada localmente.

- OpenAPI distingue propiedades ausentes de valores nulos: todos los campos que Drizzle devuelve siempre en `Ticket` y `Seguimiento` quedaron requeridos, aunque su valor admita `null`; `TicketDetail.seguimientos` también es obligatorio.
- El codegen eliminó los `?` y `.nullish()` incorrectos en respuestas. Frontend, validadores Zod y backend comparten ahora la forma real de la API sin inventar que `progreso`, fechas o datos de contacto pueden omitirse.
- `TicketUpdate.notas` acepta `null`; tanto `null` como texto vacío se persisten como SQL `NULL` y cada cambio real continúa auditado. `fecha_limite` y `fecha_resolucion` deliberadamente siguen rechazando `null` para preservar las reglas automáticas de resolución y reapertura.
- Se agregaron pruebas HTTP contra los schemas generados que exigen la presencia de cada propiedad nullable y del historial, además de borrado/restauración de notas y auditoría de las tres transiciones.
- Archivos principales: contrato OpenAPI, artefactos generados, PATCH de tickets, pruebas y documentación.
- Validaciones: 268 pruebas correctas (backend 145, frontend 59, base de datos 11, política compartida 4, ingesta 48 y scripts 1), codegen, typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Cierre visible de sesiones revocadas

**Agente:** Codex
**Estado:** decimocuarta remediación de la auditoría técnica, implementada localmente.

- Las revocaciones administrativas de cuenta, rol o contraseña envían `sesion_revocada` a cada stream SSE afectado después de confirmar la transacción y luego cierran la conexión. Una falla al notificar continúa siendo secundaria y no cambia una gestión ya persistida.
- El cierre administrativo quedó separado del cierre técnico: el cambio propio de contraseña rota la cookie y descarta silenciosamente los streams anteriores, por lo que no puede expulsar por carrera a una sesión nueva válida. Reenviar el mismo rol tampoco emite el evento.
- El frontend valida el JSON recibido y descarta campos de tipos inesperados. Ante el evento terminal cierra explícitamente `EventSource`, limpia toda la caché y reemplaza la ruta por la entrada pública. Allí revalida la cookie sin mostrar datos stale: un `401` deja el login y una cookie nueva válida remonta la identidad y el stream. Una caída transitoria conserva la reconexión automática.
- Se agregaron pruebas unitarias para serialización, aislamiento de usuarios, streams rotos, cierres silenciosos y parsing defensivo, además de la prueba HTTP con stream real que exige recibir el evento antes del EOF.
- Archivos principales: registro SSE, rutas administrativas, listener del layout, parser de eventos, pruebas y documentación.
- Validaciones: 266 pruebas correctas (backend 143, frontend 59, base de datos 11, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Revocación al cambiar el rol de un usuario

**Agente:** Codex
**Estado:** decimotercera remediación de la auditoría técnica, implementada localmente.

- `PATCH /admin/users/:id` compara el rol solicitado con el rol autoritativo. Un cambio real actualiza la cuenta y elimina todas sus sesiones dentro de la misma transacción; después del commit cierra sus streams SSE.
- Una cookie previa no puede heredar una promoción ni conservar el rol anterior. Reenviar el mismo `role_id` conserva la sesión y evita expulsiones por formularios que todavía envían snapshots completos.
- Si falla la revocación, también se revierte el cambio de rol. La protección del último SysAdmin y el rechazo de roles inactivos permanecen dentro de la misma decisión transaccional.
- Se agregaron pruebas HTTP con sesión y stream reales para cambio, no-op y rollback forzado de la revocación.
- Archivos principales: ruta administrativa de usuarios, contrato OpenAPI, pruebas RBAC/SSE y documentación.
- Validaciones: 261 pruebas correctas (backend 142, frontend 55, base de datos 11, política compartida 4, ingesta 48 y scripts 1), codegen, typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Importación y truncate atómicos

**Agente:** Codex
**Estado:** duodécima remediación de la auditoría técnica, implementada localmente.

- El importador HTTP y el CLI preparan las filas antes de escribir y ejecutan snapshot, deduplicación e inserts dentro de una única transacción. Un error de persistencia revierte todas las filas insertables; las inválidas conservan su salteo, advertencia y conteo.
- Las corridas reales usan `BEGIN IMMEDIATE` para evitar snapshots obsoletos al competir con otro escritor; `dry_run` usa una transacción diferida, deduplica igual y no crea filas ni secuencias.
- El truncate incluye seguimientos, tickets y reinicio de `sqlite_sequence` en una transacción inmediata. Se eliminó el `catch` amplio que podía ocultar errores y los conteos usan `changes` sin materializar miles de IDs.
- Los eventos SSE permanecen después del commit: una operación fallida no anuncia datos revertidos.
- Se agregaron pruebas HTTP de rollback al fallar el segundo insert, solicitudes simultáneas idempotentes, simulación sin escrituras, rollback total del truncate y reinicio de ambos IDs; el CLI tiene además una prueba real en un proceso separado.
- Archivos principales: rutas administrativas, CLI de importación, suites backend/scripts y documentación.
- Validaciones: 258 pruebas correctas (backend 139, frontend 55, base de datos 11, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Cabeceras HTTP seguras en Nginx

**Agente:** Codex
**Estado:** undécima remediación de la auditoría técnica, implementada localmente.

- Nginx dejó de publicar su versión y elimina defensivamente una eventual firma `X-Powered-By` del upstream.
- SPA, API, SSE y errores reciben siempre `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` y una `Permissions-Policy` que deshabilita sensores, cámara, captura de pantalla, geolocalización, micrófono, pagos y USB, capacidades que la aplicación no utiliza.
- CSP sigue fuera de alcance hasta inventariar explícitamente fuentes Google, audio externo, estilos dinámicos y descargas `blob:`. HSTS y cookie `Secure` esperan un borde TLS real; no se presentó este hardening como sustituto de HTTPS.
- Se agregó una prueba que exige valores exactos, `always` y alcance `server`, para evitar perder cabeceras en una `location` o en respuestas de error.
- Archivos principales: `frontend/nginx.conf`, prueba de configuración y documentación de arquitectura/despliegue.
- Validaciones: 253 pruebas correctas (backend 135, frontend 55, base de datos 11, política compartida 4 e ingesta 48), typecheck y build completos. La imagen Docker del frontend se construyó, `nginx -t` aprobó y un smoke HTTP dentro del contenedor confirmó las cuatro cabeceras y `Server: nginx` sin versión. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — API same-origin sin CORS global

**Agente:** Codex
**Estado:** décima remediación de la auditoría técnica, implementada localmente.

- Se eliminó `cors()` abierto y las dependencias `cors`/`@types/cors`. La UI ya consume `/api` desde el mismo origen por Vite/Nginx; n8n es servidor-a-servidor y no usa la política CORS del navegador.
- Express desactiva `X-Powered-By` antes de montar middlewares. Una prueba HTTP real verifica el healthcheck same-origin, un `Origin` no confiable y su preflight: ninguno recibe `Access-Control-Allow-*` ni revela el framework.
- No se mezclaron TLS, `Secure`, HSTS, CSP ni `trust proxy`: requieren hostname/certificado, migrar consumidores y restringir el acceso directo al backend en commits operativos separados.
- Archivos principales: `backend/src/app.ts`, manifiesto/lockfile, prueba HTTP y documentación de arquitectura/transporte.
- Validaciones: 251 pruebas correctas (backend 135, frontend 53, base de datos 11, política compartida 4 e ingesta 48), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Hash no reutilizable para sesiones en reposo

**Agente:** Codex
**Estado:** novena remediación de la auditoría técnica, implementada localmente.

- La cookie conserva un bearer aleatorio de 256 bits, pero login, lookup, cambio propio, logout y SSE derivan un hash SHA-256 versionado con separación de dominio. SQLite y el registro en memoria de SSE ya no conservan el raw reutilizable.
- El valor persistido usa `sha256:<64 hex>`: aunque se copie desde la base, el extractor estricto no lo acepta como cookie. La columna física histórica `token` se mantiene para rollback estructural y Drizzle la expone como `token_hash` para impedir confusiones en código.
- `0011_invalidate_plaintext_sessions.sql` revoca una sola vez las sesiones anteriores. `purgeUnsafeStoredSessions()` corre antes del seed y del puerto, elimina raws, prefijos falsos, mayúsculas, longitudes y caracteres inválidos, y cubre un rollback seguido de roll-forward sin imprimir valores.
- La transición obliga a un único re-login, no admite binarios viejos/nuevos simultáneos y fija `06db746` como piso de rollback seguro por su extractor estricto. Backups anteriores pueden contener bearer históricos y deben tratarse como secretos; TLS sigue siendo un frente separado.
- Archivos principales: `backend/src/lib/session-cookie.ts`, `backend/src/lib/session-store.ts`, autenticación/SSE, schema Drizzle, migración `0011`, pruebas y documentación operativa.
- Validaciones: 250 pruebas correctas (backend 134, frontend 53, base de datos 11, política compartida 4 e ingesta 48), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB, pendientes del tramo de route splitting.

## 2026-08-05 — Ciclo estricto de la cookie de sesión

**Agente:** Codex
**Estado:** octava remediación de la auditoría técnica, implementada localmente.

- Se centralizaron creación y borrado de `gsb_session` con `HttpOnly`, `SameSite=Lax`, `Path=/`, alcance host-only y siete días de expiración absoluta. El borde acepta únicamente los 64 caracteres hexadecimales que genera `randomBytes(32)`.
- Cookies malformadas, desconocidas, vencidas o asociadas a cuentas/roles inactivos reciben `401` y son eliminadas; `/auth/me` y el candado global no generan un borrado cuando nunca recibieron cookie. Logout sí la expira siempre para conservar su semántica idempotente. El instante exacto de expiración y fechas inválidas fallan cerrado.
- Todas las respuestas de `/auth/*` incluyen `Cache-Control: no-store`; logout quedó explícitamente idempotente y público en OpenAPI. SSE reutiliza el extractor único en lugar de interpretar la cookie por separado.
- `Secure` permanece deliberadamente desactivado porque el despliegue actual sirve HTTP: se activará junto con TLS para no romper las sesiones del navegador ni ofrecer una falsa sensación de cifrado.
- Archivos principales: `backend/src/lib/session-cookie.ts`, `backend/src/lib/auth.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/events.ts`, contrato generado, pruebas y documentación.
- Validaciones: 246 pruebas correctas (backend 131, frontend 53, base de datos 10, política compartida 4 e ingesta 48), codegen, typecheck y build completos. El build conserva los avisos preexistentes de sourcemaps de cuatro componentes UI y del bundle frontend mayor a 500 kB; su reducción sigue en el tramo de route splitting del roadmap.

## 2026-08-05 — Validación temprana de secretos entre servicios

**Agente:** Codex
**Estado:** séptima remediación de la auditoría técnica, implementada localmente.

- El backend valida `WEBHOOK_API_KEY` y `ADMIN_API_KEY` antes del seed y antes de abrir el puerto: ambas deben existir, ser diferentes, tener al menos 32 caracteres y no usar controles, espacios exteriores, un único carácter repetido ni placeholders públicos conocidos.
- Los errores identifican únicamente la variable y la regla incumplida; nunca incluyen el valor. Una configuración inválida aborta el proceso, por lo que `/healthz` no puede quedar verde con servicios administrativos o de ingesta inutilizables.
- `.env.example` deja ambas claves vacías y documenta generación aleatoria con `openssl rand -hex 32`; copiar el ejemplo ya no satisface Compose con credenciales públicas.
- Archivos principales: `.env.example`, `backend/src/lib/service-secrets.ts`, `backend/src/index.ts`, pruebas unitarias y documentación operativa/arquitectónica.
- Validaciones: 236 pruebas correctas (backend 121, frontend 53, base de datos 10, política compartida 4 e ingesta 48), typecheck/build completos y comprobación no reveladora de que el entorno local cumple la política.

## 2026-08-04 — Rate limit y capacidad acotada del login

**Agente:** Codex
**Estado:** sexta remediación de la auditoría técnica, implementada y validada localmente.

- `POST /api/auth/login` reserva ahora cada intento por el SHA-256 del username normalizado antes de consultar credenciales o iniciar scrypt. Solo un rechazo real confirma el fallo: diez fallos de una ventana deslizante de 15 minutos hacen que la siguiente solicitud bloquee la identidad por 15 minutos y responda `429 LOGIN_RATE_LIMITED`, `Retry-After`, `retry_after_seconds` y `Cache-Control: no-store`.
- Usuarios inexistentes, inactivos, roles inactivos y claves incorrectas comparten la misma mecánica y el mismo mensaje genérico, sin introducir una señal nueva de enumeración. Un login confirmado borra el bucket; crear o renombrar una cuenta y restablecer su contraseña también lo limpian para que el camino de recuperación administrativa sea inmediato.
- Se agregó una compuerta global para el trabajo criptográfico público: token bucket con ráfaga inicial de 30 KDF y reposición de 30 por minuto, como máximo cuatro simultáneos y ocho en cola. El exceso recibe el mismo `429`; si una solicitud no consigue capacidad, pierde una carrera administrativa o termina en `5xx`, su reserva de cuenta se reembolsa. Una desconexión no cancela trabajo ya admitido y el resultado de la verificación igualmente cierra la reserva, evitando eludir el límite mediante abortos. Esto limita ráfaga y consumo sostenido aunque el atacante rote identidades.
- El store mantiene solo hashes, admite hasta 20.000 identidades y hace limpieza/evicción perezosa sin priorizar la expulsión de bloqueos activos. Es estado local de la única instancia backend actual: un reinicio lo limpia y una futura topología horizontal deberá reemplazarlo por un store compartido. No se confía en `X-Forwarded-For` porque el puerto 5000 sigue expuesto directamente.
- OpenAPI documenta los errores reales `400`, `401` y el nuevo `429`, incluido su header y espera estructurada. Orval regeneró el cliente y `LoginMutationError` dejó de ser `void`. El frontend usa `retry_after_seconds` para diferenciar una saturación breve de los 15 minutos de un bloqueo de cuenta, sin mostrar datos técnicos.
- Archivos principales: `backend/src/lib/login-rate-limit.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/admin.ts`, `lib/api-spec/openapi.yaml`, artefactos generados, pruebas backend/frontend y documentación operativa/arquitectónica.
- Validaciones ejecutadas antes del commit: 231 pruebas correctas (backend 116, frontend 53, base de datos 10, política compartida 4 e ingesta 48), incluidas carreras de renombre/reset, saturación y aborto deliberado del cliente; además, codegen, typecheck completo, build de producción y `git diff --check`. El build conserva únicamente las advertencias ya auditadas de sourcemaps y del bundle frontend de ~942 kB, reservadas para la etapa específica de optimización.

## 2026-08-04 — Cambio obligatorio de contraseña temporal

**Agente:** Codex
**Estado:** quinta remediación de la auditoría técnica, implementada y validada localmente.

- Se agregó `usuarios.debe_cambiar_password` como estado autoritativo. La migración `0010_require_password_change.sql` conserva en `false` a todas las cuentas históricas y deja `NOT NULL DEFAULT true` más `CHECK (0,1)` para que futuras altas omitidas fallen de forma segura.
- Alta y reset administrativo, bootstrap inicial y rotación del seed heredado emiten contraseñas temporales. El rehash automático de un formato histórico preserva el flag y un seed posterior nunca vuelve a activarlo sobre una clave ya asegurada.
- Se incorporó `POST /api/auth/password`: verifica la contraseña actual con compatibilidad histórica, aplica la política compartida a la nueva, rechaza reutilización y realiza con comparación optimista una transacción que cambia hash/flag, revoca todas las sesiones y crea un token nuevo. Carreras y fallos revierten la operación completa.
- Después de autenticar, un segundo guard backend bloquea tickets, dashboard, administración y SSE con el código estable `PASSWORD_CHANGE_REQUIRED` mientras el flag no sea exactamente `false`. `/auth/me`, logout y el cambio propio siguen disponibles; por lo tanto la restricción no depende de la UI.
- El frontend agregó `/cambiar-contrasena` fuera del layout privado, con contraseña temporal, nueva, repetición, ayudas accesibles y cierre de sesión. Login, raíz y `AuthGate` comparten una decisión de ruta probada; no se puede escapar mediante navegación ni volver a la pantalla después de regularizar la cuenta. La raíz tampoco confía en un usuario stale si `/auth/me` falló o sigue revalidando, y limpia las queries funcionales antes de instalar otra identidad para evitar rebotes o datos cruzados.
- Roles y usuarios ahora identifica claves temporales, muestra el badge **Cambio de contraseña pendiente** y actualiza el listado después de un reset. OpenAPI expone el flag de solo lectura, el nuevo endpoint, errores estructurados y la respuesta `PASSWORD_CHANGE_REQUIRED` en todas las operaciones protegidas; Orval regeneró tipos, cliente React y validadores Zod.
- Archivos principales: `lib/db/src/schema/admin.ts`, migración y prueba `0010`, `lib/api-spec/openapi.yaml`, artefactos generados, `backend/src/lib/auth.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/admin.ts`, `backend/src/lib/seed.ts`, `frontend/src/App.tsx`, `frontend/src/pages/ChangePassword.tsx`, `frontend/src/lib/session-state.ts` y `frontend/src/pages/AdminRolesUsers.tsx`.
- Validaciones ejecutadas antes del commit: 217 pruebas correctas en la suite completa (backend 102, frontend 53, base de datos 10, política compartida 4 e ingesta 48), codegen, typecheck completo, build de producción, `drizzle-kit check`, migrador real idempotente, `git diff --check` y dos revisiones cruzadas. El build conserva únicamente las advertencias ya auditadas de sourcemaps y tamaño del bundle, fuera del alcance de este commit.

## 2026-08-04 — Política única de contraseñas nuevas

**Agente:** Codex
**Estado:** cuarta remediación de la auditoría técnica, implementada y validada localmente.

- Se creó `@workspace/password-policy`, paquete puro consumido por backend y frontend. Alta de usuario, reset y bootstrap exigen 16–128 unidades UTF-16; rechazan controles C0/DEL, whitespace exterior, una lista acotada de valores comunes/placeholders públicos y claves de un único carácter repetido. Admiten frases con espacios interiores y no fuerzan reglas de composición.
- OpenAPI reutiliza un único componente `NewPassword` para alta y reset, con longitud, `writeOnly` y un patrón que rechaza controles C0/DEL y whitespace exterior. Orval regeneró cliente/tipos y Zod; la blocklist contextual y el rechazo de un único carácter repetido se aplican después mediante el paquete compartido y antes de cualquier hash o mutación.
- Login conserva un contrato diferente de 1–128 para no bloquear claves históricas. No aplica trim ni blocklist al verificar y puede rehashear credenciales cortas, comunes o con espacios exteriores; esa excepción no existe en ninguna entrada de contraseña nueva.
- La UI usa la misma política para validación, ayudas, estados deshabilitados y límites de los inputs. Los mensajes explican longitud, controles, espacios exteriores o clave predecible sin mostrar errores técnicos. El campo de login limita el payload a 128 sin aplicar reglas retroactivas.
- Los consumidores manejan exhaustivamente todos los códigos de violación, de modo que ampliar la unión obliga a actualizar backend, bootstrap y frontend en compilación. `hashPassword` permanece como primitiva criptográfica sin política para permitir migraciones históricas.
- Se agregaron pruebas puras, de paridad OpenAPI/Zod, de rutas y de UI: límites 15/16/128/129, whitespace exterior/interior, controles C0/DEL, blocklist normalizada, placeholders públicos, repetición de un único carácter, alta/reset sin mutaciones ante rechazo, revocación válida, bootstrap y login histórico de 1–128 con rehash.
- Archivos principales: `lib/password-policy/`, `lib/api-spec/openapi.yaml`, artefactos generados de API, `backend/src/lib/seed.ts`, `backend/src/routes/admin.ts`, `frontend/src/lib/password-policy.ts`, `frontend/src/pages/AdminRolesUsers.tsx` y `frontend/src/pages/Login.tsx`.
- Validaciones ejecutadas antes del commit: 199 pruebas correctas (backend 93, frontend 46, política compartida 4, base de datos 8 e ingesta 48), codegen, typecheck completo, build de producción, `git diff --check` y revisión cruzada. El build conserva únicamente las advertencias ya auditadas de sourcemaps y tamaño del bundle, fuera del alcance de este commit.

## 2026-08-04 — Scrypt asíncrono y hashes versionados

**Agente:** Codex
**Estado:** tercera remediación de la auditoría técnica, implementada y validada localmente.

- Se reemplazó `scryptSync` por `crypto.scrypt` asíncrono en login, alta/reset de usuarios y bootstrap. Los hashes se calculan antes de entrar a las transacciones SQLite, por lo que el trabajo criptográfico no bloquea el event loop ni mantiene locks de base innecesarios.
- El formato nuevo declara versión y parámetros: `scrypt$v1$16384$8$1$<salt>$<hash>`. El lector conserva compatibilidad con `scrypt:<salt>:<hash>` y marca únicamente ese formato válido como candidato a rehash.
- Un login correcto con hash legado deriva una sal nueva y migra la credencial. La creación de la sesión y el rehash ocurren dentro de una transacción que relee usuario, rol y hash; si una desactivación o reset cambió el registro durante el KDF, la contraseña anterior no obtiene una sesión. Dos logins simultáneos revalidan una sola vez el hash migrado para no rechazar una clave que continúa vigente.
- El login ejecuta el mismo trabajo scrypt también para usuarios inexistentes o hashes ausentes/malformados mediante un hash dummy válido. Todos esos casos conservan el mismo estado y cuerpo `401`, reduciendo la enumeración temporal de cuentas.
- Se agregaron pruebas de formato actual, sales independientes, compatibilidad/rehash legado, rechazo de formatos inseguros, hash dummy, avance del event loop, comportamiento HTTP uniforme, logins simultáneos, login contra reset concurrente y rollback de rehash/sesión. También se adaptaron las suites de seed/RBAC al contrato asíncrono.
- Archivos principales: `backend/src/lib/passwords.ts`, `backend/src/lib/seed.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/admin.ts`, `backend/test/passwords.test.ts`, `backend/test/seed.test.ts` y `backend/test/rbac-routes.test.ts`.
- Validaciones ejecutadas antes del commit: 183 pruebas correctas (backend 83, frontend 44, base de datos 8 e ingesta 48), typecheck completo, build de producción, `git diff --check` y revisión cruzada del diff. El build conserva únicamente las advertencias ya auditadas de sourcemaps y tamaño del bundle, fuera del alcance de este commit.

## 2026-08-04 — Invariantes RBAC y roles protegidos

**Agente:** Codex
**Estado:** segunda remediación de la auditoría técnica, implementada y validada localmente.

- Se centralizó la política de roles del backend en `backend/src/lib/rbac.ts`: `SysAdmin`, `Administrador` y `Operador` son roles base reservados, con comparación normalizada y una única definición de capacidades.
- Los roles base ya no pueden renombrarse, desactivarse ni eliminarse desde la API. Sus descripciones siguen siendo editables. Tampoco se puede crear o renombrar un rol personalizado usando un nombre reservado, incluso con diferencias de mayúsculas o espacios.
- El seed crea o reactiva los tres roles base sin renombrar masivamente `Administrador` a `SysAdmin`. La migración de la identidad histórica queda limitada a la cuenta semilla correspondiente y no promueve a otros administradores.
- El login y la validación de cada request rechazan usuarios o roles inactivos. Desactivar un usuario o rol revoca en la misma transacción todas las sesiones afectadas y cierra sus streams SSE; reactivarlo no revive cookies anteriores. El heartbeat del stream revalida además la sesión cada 25 segundos.
- El backend impide desactivar o degradar al último SysAdmin activo con identidad de acceso y hash de contraseña utilizable. Un hash nulo, vacío o malformado no cuenta como cuenta de recuperación.
- Las altas y cambios de rol solo aceptan roles activos. La pantalla de Roles y usuarios refleja las mismas restricciones, deshabilita las acciones imposibles y explica por qué están protegidas; el backend continúa siendo la autoridad final.
- Se agregaron pruebas integradas para los guards de roles, revocación real de sesiones y SSE, asignaciones a roles inactivos, preservación del último SysAdmin y migración segura del seed, más pruebas unitarias del espejo de capacidades y mensajes de error en frontend.
- Archivos principales: `backend/src/lib/rbac.ts`, `backend/src/lib/auth.ts`, `backend/src/lib/events.ts`, `backend/src/lib/seed.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/events.ts`, `backend/src/routes/admin.ts`, `backend/test/rbac-routes.test.ts`, `frontend/src/lib/roles.ts` y `frontend/src/pages/AdminRolesUsers.tsx`.
- Validaciones ejecutadas antes del commit: 174 pruebas correctas (backend 74, frontend 44, base de datos 8 e ingesta 48), typecheck completo, generación OpenAPI, build de producción y `git diff --check`. El build conserva únicamente las advertencias ya auditadas de sourcemaps y tamaño del bundle, fuera del alcance de este commit.

## 2026-08-04 — Bootstrap seguro del SysAdmin

**Agente:** Codex
**Estado:** primera remediación de la auditoría técnica, implementada y validada localmente.

- Se eliminó la contraseña fija del usuario semilla. Una base sin `password_hash` ahora exige `BOOTSTRAP_SYSADMIN_PASSWORD`, con una longitud de 16 a 128 caracteres y validación previa a cualquier mutación.
- El secreto se usa únicamente para calcular el hash scrypt: no se guarda en texto plano, no se imprime y no viaja al frontend. El arranque falla antes de abrir el puerto si una instalación nueva no provee una clave válida.
- Para actualizar instalaciones antiguas, el seed detecta exclusivamente la credencial pública heredada de `sysadmin`/`admin`, exige el secreto externo, rota el hash y revoca sus sesiones en una única transacción. Cualquier contraseña ya cambiada queda intacta.
- El secreto quedó vacío en `.env.example` y su antiguo placeholder se rechaza explícitamente, evitando inicializar una cuenta con un valor público copiado desde el repositorio.
- Se incorporó la variable opcional al contenedor y al paso de despliegue, y se actualizaron `.env.example`, README, documentación de backend, flujo, arquitectura y despliegue.
- Se agregó una suite integrada que comprueba: rechazo sin secreto y sin mutaciones parciales, rechazo de valores inválidos, creación con hash verificable, no sobrescritura posterior, rotación heredada, revocación selectiva de sesiones, idempotencia y rollback ante fallos.
- Validaciones ejecutadas: test específico del seed y typecheck del backend; antes del commit también se ejecutó la suite completa del workspace y el build de producción.

## 2026-07-24 — Integración de la versión 0.5 con estado laboral y Serin

**Agente:** Codex
**Estado:** paquete integrado y validado para su publicación en `main`.

- Se conservó sin cambios la migración `0007_add_estado_empleado.sql`, ya aplicada en el entorno remoto. Las migraciones locales de v0.5 se regeneraron como `0008_v05_auditoria_ticket.sql` y `0009_add_embargos_category.sql`, con snapshots y timestamps posteriores en el journal.
- Se comprobó el migrador real tanto sobre una base que ya tenía `0007` como desde una base vacía. En ambos casos la segunda ejecución fue idempotente, las claves foráneas de auditoría conservaron `ON DELETE SET NULL` y `PRAGMA integrity_check` devolvió `ok`.
- Se preservaron en el mismo webhook la persistencia de `estado_empleado`, la creación atómica del seguimiento inicial de Serin y la idempotencia por `conversation_id`. Una prueba HTTP integrada verifica que un reintento no duplica el seguimiento.
- El CSV completo incorpora la columna **Estado laboral**. Si una edición manual cambia DNI o empresa, el backend invalida el estado laboral obtenido previamente desde Serin y registra ambos cambios en el historial, evitando asociar un dato antiguo a otra identidad o empresa.
- Se regeneraron los clientes y validadores desde OpenAPI. La validación final quedó en 147 pruebas correctas (backend 50, base de datos 8, ingesta 48 y frontend 41), `drizzle-kit check`, typecheck y build de producción correctos.
- El alcance se limitó al paquete v0.5 y a su convivencia con los cambios de estado laboral/Serin ya presentes en `main`; no se incluyeron `.env`, bases locales, backups ni artefactos de ejecución.

## 2026-07-22 — Paquete local v0.5: clasificación, SLA, auditoría y gestión ampliada

**Agente:** Codex
**Estado:** implementación y validación local completas; integración a `main` autorizada el 2026-07-24 como versión 0.5.

### Categoría Embargos y migración conservadora

- Se agregó `embargos` al catálogo estable compartido entre schema, clasificador, OpenAPI y frontend, con la etiqueta visible **Embargos**.
- Las reglas se evalúan antes de `legales` y de categorías generales. Captan variantes de embargo/desembargo, retenciones o descuentos judiciales y órdenes/oficios relacionados; la expresión “sin embargo” se excluye explícitamente para evitar falsos positivos.
- La migración integrada `0009_add_embargos_category.sql` hace un primer backfill conservador. Después, antes de abrir el puerto, una reconciliación idempotente promueve únicamente a Embargos los históricos que ahora cumplen la regla. Mantiene la prioridad del motivo explícito, no recalcula categorías ajenas y conserva `motivo`/`resumen` byte a byte.

### Prioridad automática según horas hábiles

- El cálculo compartido de SLA ahora también determina las horas hábiles firmadas que faltan. Sábados y domingos siguen sin consumir tiempo; los feriados continúan contando como hábiles.
- Los tickets visibles, con fecha límite y sin estado final, suben a `alta` al quedar 24 horas hábiles o menos y a `urgente` al quedar 12 horas hábiles o menos o estar vencidos. El proceso nunca degrada una prioridad superior.
- El backend ejecuta una pasada antes de abrir el puerto y luego cada 5 minutos. `PRIORIDAD_AUTOMATICA_INTERVAL_MS` permite configurar el intervalo (mínimo 10 segundos); el runner impide solapamientos y un error de revisión queda logueado sin detener el servidor.
- Cada promoción usa comparación condicional para no pisar cambios concurrentes. Ticket y seguimiento de autor `Sistema` se escriben dentro de la misma transacción y el evento SSE se emite después del commit.
- No se recalculan vencimientos históricos: la automatización evalúa la `fecha_limite` ya existente en cada ticket elegible.

### Auditoría estructurada desde v0.5

- La migración `0008_v05_auditoria_ticket.sql` amplía `seguimientos` con prioridad anterior/nueva, asignación anterior/nueva (ID y snapshot legible) y `campos_editados`.
- `PATCH /api/tickets/:id` relee el estado autoritativo, persiste únicamente diferencias reales y crea un único seguimiento dentro de la misma transacción. Estado, prioridad y asignación guardan sus valores anterior/nuevo; los demás cambios guardan nombres de campos, no copias de valores sensibles.
- La identidad del autor y la autoasignación se derivan de la sesión. Las notas manuales aceptan solo la nota: el cliente no puede falsificar autor, estado ni snapshots de auditoría.
- Al reabrir un ticket resuelto/cerrado se limpia `fecha_resolucion`; si vuelve a resolverse se registra un instante nuevo. Pasar de resuelto a cerrado conserva la fecha de resolución existente.
- La nueva trazabilidad empieza con v0.5. La migración preserva los seguimientos existentes y no inventa cambios de estado, prioridad o responsable anteriores.

### Exportación y ordenamiento server-side

- `GET /api/tickets/export.csv` reutiliza exactamente los filtros y el orden del listado, pero omite la paginación para exportar todos los tickets operativos coincidentes. El archivo usa UTF-8 con BOM, separador `;`, CRLF, celdas entre comillas y mitigación de fórmulas de planilla.
- El botón **Exportar CSV** quedó junto a los filtros de Tickets y conserva el criterio activo; informa progreso y resultado mediante toasts.
- El listado acepta `sort_by`/`order` sobre una whitelist cerrada. El orden se resuelve en SQL antes de paginar, incluye reglas semánticas para estado/prioridad, ubica vacíos al final y usa ID como desempate estable. Los nombres de columna del cliente nunca se interpolan en SQL.
- Tickets y Administración usan encabezados ordenables accesibles; cambiar orden o filtros vuelve a la primera página.

### Administración, cuarentena y detalle editable

- La tabla de Administración se amplió con ID, fecha/hora, conversation ID, contacto (teléfono/email), empresa, categoría/motivo, estado, prioridad, asignado y vencimiento. Conserva paginación, scroll horizontal controlado y acciones accesibles.
- Cada registro puede abrirse en `/admin/tickets/:id`. Esa variante del detalle envía `incluir_vacios=true` y `x-admin-key`, por lo que un SysAdmin puede inspeccionar y completar tickets en cuarentena sin hacerlos visibles para la operación hasta que dejen de cumplir la condición de vacío.
- En el detalle normal se agregó un lápiz junto a **Datos del Contacto** para editar nombre, apellido, teléfono, DNI/CUIT, empresa, email, motivo y resumen. El formulario genera un PATCH mínimo, convierte opcionales vacíos a `null` y vuelve a clasificar al cambiar motivo/resumen.
- Los campos funcionales anteriores están disponibles para cualquier sesión autenticada. Hora, notificación, audio, fecha límite y fecha de resolución quedan protegidos como datos técnicos y requieren SysAdmin + `x-admin-key`; la seguridad se valida en el backend además de la UI.
- La línea de tiempo muestra cambios de estado, prioridad, asignación y campos editados con etiquetas legibles. Teléfono y email mantienen sus filas fijas y fallbacks cuando no existe dato.

### Validación de entradas y autenticación documentada

- El contrato OpenAPI declara la cookie `gsb_session` como seguridad global. Health y login son públicos; el webhook usa exclusivamente `x-api-key`; las 12 operaciones administrativas requieren sesión y `x-admin-key` simultáneamente (AND).
- Los emails editados se validan en frontend, contrato y backend. Un email vacío se normaliza a `null`; un formato inválido responde 400 sin persistir cambios.
- `fecha_limite` y `fecha_resolucion` se validan sobre el JSON crudo antes de la coerción Zod. PATCH, webhook y alta administrativa rechazan `null`, booleanos, números, fechas imposibles o sin zona y aceptan únicamente date-time RFC3339 con zona.
- Una pestaña SSE desconectada se elimina del conjunto de clientes y no puede transformar en error HTTP una gestión ya confirmada en SQLite.

### Archivos principales

- Backend: `backend/src/routes/tickets.ts`, `backend/src/lib/ticket-query.ts`, `backend/src/lib/ticket-csv.ts`, `backend/src/lib/prioridad-automatica.ts`, `backend/src/lib/prioridad-automatica-runner.ts`, `backend/src/lib/reclasificar-motivos.ts` y `backend/src/index.ts`.
- Frontend: `frontend/src/pages/TicketList.tsx`, `frontend/src/pages/Admin.tsx`, `frontend/src/pages/TicketDetail.tsx`, `frontend/src/components/SortableTableHead.tsx`, `frontend/src/components/tickets/TicketDataEditDialog.tsx`, `frontend/src/lib/ticket-edit.ts` y `frontend/src/lib/ticket-list-controls.ts`.
- Contrato/datos: `lib/api-spec/openapi.yaml`, clientes generados, schemas Drizzle, `lib/ingesta/src/motivos.ts`, `lib/ingesta/src/sla.ts` y migraciones integradas `0007`/`0008`/`0009`.
- Documentación: `README.md`, `backend/README_BACKEND.md`, `frontend/README_FRONTEND.md`, `docs/FLUJO.md` y esta bitácora.

### Validación final local

- 128 pruebas correctas: backend 42, base de datos 7, ingesta 46 y frontend 33. Cubren transacción/rollback de auditoría, desconexión SSE, concurrencia de promociones, no degradación, selección de tickets elegibles, runner, reconciliación, entradas RFC3339, exportación y ordenamiento.
- `pnpm run typecheck`, codegen OpenAPI y `pnpm run build`: correctos. Vite conserva únicamente sus advertencias conocidas de sourcemaps de componentes UI y tamaño del bundle; no son fallos de compilación.
- Cadena completa de migraciones probada desde una base vacía y smoke HTTP real aprobado: login/cookie, doble protección SysAdmin, webhook, Embargos, listado/orden, CSV, edición, autoasignación, historial, escalado automático a Urgente y logout.
- La base local fue respaldada en `backups/tickets-pre-v0.5-2026-07-22.db`, actualizada mediante Drizzle e iniciada una vez con v0.5. `PRAGMA integrity_check` devolvió `ok`; se compararon los 12 registros preexistentes contra el backup y `motivo`/`resumen` permanecieron byte a byte intactos.
- QA visual aprobado en 1440×1000 y 1024×900 para detalle operativo, detalle Admin, registro en cuarentena, historial/asignación y ambos editores: sin overflow, recortes ni errores de consola/red.
- Higiene final: temporales de migración, smoke y QA eliminados. El paquete quedó listo para su integración controlada con los cambios de estado laboral y origen Serin que ya estaban publicados.

## 2026-07-23 — Estado Activo/Inactivo del empleado

**Agente:** Codex
**Contexto:** el JSON de n8n incorporó el campo opcional `estado_empleado`. El cambio se aisló en la rama `feature/estado-empleado`; el trabajo local todavía no probado de v0.5 quedó protegido en un stash y no se mezcló.

### Cambio realizado

- El contrato acepta únicamente `Activo` o `Inactivo` respetando Title Case, y el webhook y el alta administrativa conservan el valor.
- La tabla `tickets` incorpora una columna nullable mediante una migración aditiva. Los registros históricos quedan con `null`.
- En el listado y el detalle de Tickets se muestra `Activo` o `Inactivo` debajo de la empresa. Si no existe empresa, el valor está ausente/desconocido o se recibe el marcador `Sin empresa asignada/asociada`, la interfaz queda como antes.
- Cuando el webhook crea un ticket con una empresa real, ticket y seguimiento inicial se guardan en una misma transacción. El historial comienza con `Los datos fueron extraídos y persistidos desde Serin con el DNI proporcionado.`, bajo el autor `Sistema`.
- La inserción usa el `conversation_id` como conflicto idempotente: un reintento devuelve el ticket existente y no duplica el seguimiento. Los historiales se ordenan por fecha y luego por ID para garantizar cuál es la primera entrada.
- La nota automática no se incluye en `actividad-reciente`: queda disponible donde fue solicitada, dentro del historial del ticket, sin duplicar el evento de alta en el Dashboard.
- `estado_empleado` no participa de la regla de cuarentena: por sí solo no convierte un registro completamente vacío en un ticket operativo.
- Se regeneraron los tipos y validadores derivados de OpenAPI.

Archivos principales: `lib/api-spec/openapi.yaml`, `lib/db/src/schema/tickets.ts`, `lib/db/drizzle/0007_add_estado_empleado.sql`, rutas de ingesta del backend, `frontend/src/lib/estado-empleado.ts`, `TicketList.tsx`, `TicketDetail.tsx` y pruebas asociadas.

### Integración con v0.5

- La colisión de numeración se resolvió conservando `0007_add_estado_empleado.sql`, que ya estaba aplicada en producción, y regenerando el paquete v0.5 como `0008_v05_auditoria_ticket.sql` y `0009_add_embargos_category.sql`.
- Los timestamps del journal quedaron estrictamente posteriores a `0007`, de modo que una base existente aplica ambas migraciones nuevas y una instalación limpia recorre la misma secuencia completa.

### Validaciones

- Tests del workspace: DB 6/6, ingesta 26/26 y frontend 28/28 correctos.
- Typecheck completo y build de producción de backend/frontend: correctos; permanecen únicamente las advertencias conocidas de sourcemaps y tamaño del bundle.
- Smoke test sobre una base temporal migrada: el webhook conservó `estado_empleado: Activo` en su respuesta y rechazó la variante incorrecta `activo` con HTTP 400.
- Smoke HTTP del seguimiento Serin: empresa real generó exactamente una entrada; el reintento respondió `created: false` sin duplicarla; un ticket sin empresa generó cero entradas. Un fallo forzado al insertar el seguimiento revirtió también el ticket, confirmando la atomicidad.
- Smoke autenticado del detalle y Dashboard: el historial devolvió la nota de `Sistema` como primera y única entrada, mientras que `actividad-reciente` conservó únicamente `ticket_creado`.
- La columna aditiva se aplicó también a la base local para poder probar esta rama; `PRAGMA integrity_check` devolvió `ok`.
- `git diff --check`: correcto, sin errores de whitespace.

## 2026-07-21 — Ajuste visual final de los filtros de Tickets

**Agente:** Codex
**Contexto:** la primera distribución en filas todavía dejaba el buscador demasiado corto y el ícono de búsqueda podía percibirse descentrado.

### Cambio realizado

- Categoría pasó a encabezar la segunda fila, dejando la primera exclusivamente para una búsqueda amplia, estado y prioridad.
- El buscador absorbe todo el espacio restante; en la revisión visual midió 728 px a 1440 y 568 px a 1280.
- La lupa ahora forma parte de un contenedor `flex` de altura fija, por lo que queda centrada por layout y no mediante posición absoluta o transformaciones.
- En escritorio se usan tres filas estables: búsqueda/estado/prioridad; categoría/fecha/hora; empresa/plazo/limpiar. En resoluciones menores cada grupo se apila sin cortes automáticos.

Archivos: `frontend/src/pages/TicketList.tsx`, `frontend/README_FRONTEND.md` y esta bitácora.

### Validaciones

- Revisión visual del listado en escritorio y viewport reducido.
- Typecheck, tests y build de producción del frontend: correctos.
- `git diff --check`: sin errores de whitespace.

## 2026-07-21 — Corrección del layout de filtros de Tickets

**Agente:** Codex
**Contexto:** tras agregar prefijos persistentes, todos los controles permanecían dentro de un único `flex-wrap`; la mezcla de anchos completos y fijos producía saltos irregulares y deformaba la barra según el ancho disponible.

### Cambio realizado

- Se reemplazó el wrap automático por dos filas explícitas con CSS Grid.
- La primera fila contiene búsqueda, estado, prioridad y categoría; la segunda agrupa fecha, hora, empresa, plazo y la acción para limpiar.
- En tablet cada fila se reorganiza en dos columnas y en móvil en una sola, sin cambiar la lógica de filtrado.
- Los rangos de fecha y hora pueden contraerse sin desbordar, y el padding de la página se redujo en móvil.

Archivos: `frontend/src/pages/TicketList.tsx`, `frontend/README_FRONTEND.md` y esta bitácora.

### Validaciones

- Typecheck del frontend: correcto.
- Tests del frontend: correctos.
- Build de producción del frontend: correcto.
- `git diff --check`: sin errores de whitespace.

## 2026-07-21 — Contexto persistente en los filtros de Tickets

**Agente:** Codex
**Contexto:** los selects controlados usaban `_all` como valor inicial; por eso Radix mostraba `Todos/Todas` y nunca el placeholder que indicaba a qué filtro pertenecía cada uno.

### Cambio realizado

- Estado, prioridad y categoría mantienen un prefijo visible dentro del trigger: `Estado: Todos`, `Prioridad: Todas` y `Categoría: Todas`; al seleccionar otra opción el prefijo permanece.
- Fecha, hora, empresa y plazo también tienen etiquetas compactas persistentes. El switch ahora se presenta como `Plazo: Solo vencidos`.
- La búsqueda explica qué campos abarca y todos los controles recibieron nombres accesibles para lectores de pantalla.
- Se mantuvo la altura compacta de la barra. Los controles permiten wrap y ocupan todo el ancho en pantallas pequeñas para evitar desbordes.
- No se modificó la lógica ni los parámetros enviados al backend; el cambio es exclusivamente de presentación y accesibilidad.

Archivos: `frontend/src/pages/TicketList.tsx`, `frontend/README_FRONTEND.md` y esta bitácora.

### Validaciones

- Tests del frontend: 24/24 correctos.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- `git diff --check`: sin errores de whitespace.

## 2026-07-21 — Errores seguros, responsable en Tickets y períodos del Dashboard

**Agente:** Codex
**Contexto:** se pidió eliminar detalles técnicos de los toasts de error, mostrar el responsable de cada ticket en el listado y permitir que todo el Dashboard se visualice sin filtro, por semana, por mes o entre dos fechas.

### Cambios realizados

- Se centralizó la presentación de errores en `frontend/src/lib/error-messages.ts`. La UI inspecciona `status`, `response.status` y únicamente respuestas de negocio conocidas; nunca imprime `Error.message`, HTTP, método, URL, JSON, HTML, stack ni detalles internos de Zod. Login, Administración, Roles y usuarios, edición de tickets, seguimientos y logout usan mensajes humanos. La creación y el reset de contraseñas también validan longitud y coincidencia antes de llamar a la API.
- El listado operativo ganó la columna **Asignado**. Muestra el snapshot visible `asignado_a` limpio y, si está vacío o es nulo, `Sin asignar`. No cambia la asignación ni reescribe registros; `asignado_usuario_id` continúa siendo la identidad autoritativa en el backend.
- El Dashboard incorporó el selector **Todo / Semana actual / Mes actual / Período personalizado**. Todo sigue siendo el default; semana usa lunes a domingo, mes usa el mes calendario completo y el rango desde/hasta incluye ambos días. El personalizado conserva un borrador y solo aplica fechas completas y ordenadas.
- Los presets se recalculan automáticamente al cambiar el día y los controles permiten wrap en anchos intermedios para no desbordar junto al sidebar.
- Los cuatro endpoints del Dashboard aceptan `fecha_desde` y `fecha_hasta`. Estados, prioridades, motivos, vencidos y resueltos del período usan la misma cohorte por fecha de creación; actividad usa la fecha real de cada ticket/seguimiento. El badge global del sidebar permanece sin filtro.
- Se agregaron `resueltos_periodo` y `nuevos_periodo` al contrato sin retirar `resueltos_hoy` ni `nuevos_hoy`, preservando la compatibilidad y el comportamiento exacto de Todo.
- Los días calendario se interpretan explícitamente en `America/Argentina/Buenos_Aires`, sin depender de la zona del proceso; el límite “hasta” incluye el día completo y un rango invertido responde `400`.
- No fue necesaria ninguna migración ni se modificaron tickets existentes.

Archivos principales: `frontend/src/lib/error-messages.ts`, `frontend/src/lib/asignacion.ts`, `frontend/src/lib/dashboard-period.ts`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/TicketList.tsx`, `backend/src/lib/dashboard-date-range.ts`, `backend/src/routes/dashboard.ts` y `lib/api-spec/openapi.yaml`.

### Validaciones

- Contrato React Query/Zod regenerado desde OpenAPI.
- `pnpm -r --if-present test`: 53 pruebas correctas (24 ingesta/SLA, 5 base de datos y 24 frontend). Los casos nuevos cubren ausencia de filtraciones técnicas, mensajes administrativos/login, fallback de asignación, lunes-domingo, mes calendario, rango personalizado y formato local.
- `pnpm run typecheck`: correcto en librerías, backend, frontend y scripts.
- `pnpm run build`: backend y frontend compilaron correctamente; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- Smoke HTTP aislado sobre una base temporal migrada: login/logout correctos; los cuatro endpoints aceptaron el mismo rango; la respuesta de stats incluyó las nuevas métricas y un rango invertido devolvió `400`. El proceso y la base temporal se eliminaron al finalizar.
- El parser de período se verificó además con `TZ=UTC`: mantuvo correctamente los límites de medianoche de Buenos Aires.
- `git diff --check`: sin errores de whitespace.

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
- **Comportamiento histórico, reemplazado el 2026-08-04**: esta intervención renombraba el rol `Administrador` → `SysAdmin` y mantenía una credencial semilla pública. La remediación actual crea roles separados, migra únicamente la identidad histórica cuando corresponde y exige `BOOTSTRAP_SYSADMIN_PASSWORD`; `admin/admin` y `sysadmin/admin` ya no son credenciales válidas del producto.
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

### Pendiente conocido (resuelto el 2026-08-04)

- Los roles base ahora están protegidos contra renombre, desactivación y borrado, y no se permite degradar ni desactivar al último SysAdmin utilizable.

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

## 2026-07-23 — Ordenamiento múltiple en Tickets y Administrador

**Agente:** Codex

- Las tablas de Tickets y Administrador ahora admiten varios criterios ordenados por prioridad.
- Un clic normal conserva el comportamiento simple: selecciona una única columna o invierte su dirección. `Shift + clic` agrega otra columna o invierte una ya seleccionada sin perder las demás.
- Cada encabezado activo muestra su dirección y un número (`1`, `2`, etc.) que identifica la prioridad.
- El botón `Restablecer orden` limpia la combinación y vuelve a `Fecha de llegada` descendente, con los tickets más recientes primero, tanto en Tickets como en Administrador.
- El backend aplica todos los criterios antes de paginar mediante el parámetro compatible `sort=columna:direccion,...`; `sort_by` y `order` se mantienen para clientes anteriores.
- La exportación CSV utiliza exactamente los mismos filtros y el mismo orden compuesto que la tabla.
- El desempate técnico por ID se agrega una sola vez al final, evitando que anule los criterios secundarios.

### Validaciones ejecutadas

- Backend: 48/48 pruebas correctas, incluidos orden secundario antes de paginar, CSV, parámetros inválidos y compatibilidad anterior.
- Frontend: 36/36 pruebas correctas, incluidos reemplazo, combinación, inversión, serialización y reutilización en CSV.
- Typecheck y build completo del workspace: correctos.
- Backend y frontend reiniciados localmente en los puertos `5000` y `3000`, ambos con respuesta HTTP `200`.
- Cambios locales en `version/0.5`, sin commit ni push.

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
