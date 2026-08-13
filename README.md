# GSB Tickets

Sistema de gestión de tickets que se alimenta **automáticamente** de llamadas telefónicas: un agente de voz de ElevenLabs atiende la llamada, n8n arma el JSON y se lo manda a este sistema. Los tickets no se crean a mano en el flujo normal — nacen solos con cada llamada.

```
Llamada telefónica → ElevenLabs (agente de voz) → n8n → POST /api/webhooks/ticket → SQLite → Dashboard / Tickets / Rendimiento
                                                              ↑
                                                    también: importador CSV / panel admin
```

📖 **Flujo de negocio completo** (ElevenLabs → n8n → webhook → SLA): [docs/FLUJO.md](docs/FLUJO.md)
🚀 **Despliegue en el servidor de testing** (Docker + CI/CD): [docs/DEPLOY.md](docs/DEPLOY.md)
🛠️ **Backend en detalle** (API, auth, roles, base de datos, migraciones): [backend/README_BACKEND.md](backend/README_BACKEND.md)
🎨 **Frontend en detalle** (páginas, routing, estado, componentes): [frontend/README_FRONTEND.md](frontend/README_FRONTEND.md)
📓 **Bitácora de cambios técnicos**: [docs/BITACORA_AGENTES.MD](docs/BITACORA_AGENTES.MD)
🧭 **Mapa de documentación y mantenimiento**: [docs/README.md](docs/README.md)
🏗️ **Arquitectura de software y modelo de datos**: [docs/ARQUITECTURA.MD](docs/ARQUITECTURA.MD)

> **Versión v0.5:** integra las mejoras de gestión, auditoría, clasificación y prioridad descritas abajo, junto con el estado laboral recibido desde Serin.

## Qué hace el sistema

- **Ingesta automática**: cada llamada atendida por el agente de voz crea un ticket solo, vía webhook. Idempotente — un reintento de n8n no duplica nada.
- **SLA de 48 horas hábiles y prioridad dinámica**: el plazo corre de lunes a viernes durante las 24 horas y se pausa por completo los sábados y domingos. Los feriados aún cuentan como hábiles. Un ticket sin resolver sube, sin degradaciones, a prioridad `alta` cuando quedan 24 horas hábiles o menos y a `urgente` cuando quedan 12 horas hábiles o menos o ya venció.
- **Cuarentena de registros vacíos**: una llamada sin datos útiles se conserva intacta en la base para auditoría, pero no aparece en Tickets ni participa del Dashboard o de las notificaciones operativas. Solo un SysAdmin puede verla desde Administración.
- **Gestión de tickets**: dashboard con KPIs y gráficos filtrables por todo, semana, mes o rango personalizado; listado con responsable asignado, filtros combinables, ordenamiento server-side por todas sus columnas, paginación y exportación CSV incremental del resultado filtrado; detalle con edición funcional, historial auditable y reproductor de audio.
- **Categorización automática del motivo**: un clasificador basado en reglas agrupa el texto libre de `motivo`/`resumen` en categorías estables (haberes y pagos, recibos, vacaciones, bajas, empleo, reclamos, legales, **embargos**, etc.) para poder filtrar y graficar sin que cada redacción de n8n sea una categoría nueva. v0.5 reconcilia la columna derivada de registros anteriores al arrancar, sin reescribir sus textos originales.
- **Trazabilidad desde v0.5**: cada modificación registra de forma atómica el autor y los cambios reales de estado, prioridad, asignación y campos editados. El historial nuevo no intenta inventar eventos anteriores a la incorporación de esta auditoría.
- **Actualización en vivo**: la app mantiene una conexión de Server-Sent Events; cuando entra un llamado nuevo (o se importa un CSV), todas las pestañas abiertas se refrescan al instante y muestran una notificación — sin recargar la página.
- **Login obligatorio con roles**: nadie ve ninguna pantalla ni puede pegarle a la API sin sesión iniciada. Cuatro roles de sistema con permisos distintos (ver sección Autenticación).
- **Rendimiento ejecutivo auditable**: SysAdmin y Controller disponen de `/rendimiento` en modo operativo parcial. **Resumen del equipo** muestra la cohorte visible creada en el período, su estado actual, distribuciones, tiempos de resolución con muestra y cumplimiento del plazo respaldado por el vencimiento preservado al resolver; **Calidad de datos** hace explícita la cobertura de esas mediciones. Personas y Reiteraciones siguen en preparación y no presentan rankings ni conclusiones sin trazabilidad suficiente.
- **Panel de administración** (solo rol SysAdmin): tabla ampliada, ordenable y paginada, acceso al detalle incluso para registros en cuarentena, CRUD manual de tickets, importador de CSV con simulación previa, "zona peligrosa" para vaciar la base, y gestión de roles/usuarios con reset de contraseña.
- **Importador del histórico**: script CLI que carga de una vez un Excel/CSV viejo con el mismo motor de parseo que usa el panel web.
- **Backup online de SQLite**: copia consistente con el WAL, verificada con `integrity_check`, sin sobrescribir destinos.

## Autenticación y roles

Todo el sistema funcional exige sesión iniciada. Las rutas que no la requieren son `GET /api/healthz` (el proceso está vivo), `GET /api/readyz` (el proceso ya puede recibir tráfico), `POST /api/webhooks/ticket` (autenticado con su propia API key, para n8n), `POST /api/auth/login` y `POST /api/auth/logout`; este último es público para poder limpiar de forma idempotente una cookie ausente, inválida o ya revocada. Cualquier URL privada del frontend, sin sesión, muestra el login. Ambos probes HTTP deshabilitan caché: `healthz` es estático, mientras `readyz` exige que el servidor haya abierto el puerto, no esté drenando y pueda consultar el schema mínimo de tickets, cuarentena y sesiones en SQLite.

| Rol               | Puede                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **SysAdmin**      | Todo: Dashboard, gestión de Tickets, Rendimiento y Administración (`/admin`, `/admin/roles-usuarios`)                    |
| **Controller**    | Dashboard, consulta de Tickets y Rendimiento; es de **solo lectura** y no accede a Administración                        |
| **Administrador** | Gestión completa de tickets — incluido pasarlos a **Cerrado** — pero sin acceso a Rendimiento ni Administración          |
| **Operador**      | Gestión básica de tickets; **no puede cerrarlos** (la opción queda deshabilitada en la UI y el backend la rechaza igual) |

Los cuatro roles de sistema son identidades protegidas: no se renombran, desactivan ni eliminan. Los roles personalizados inactivos cortan login y sesiones y no pueden recibir nuevas asignaciones. El backend impide además desactivar o degradar al último SysAdmin con credenciales utilizables.

Toda contraseña **nueva** —alta de usuario, reset o bootstrap— debe tener entre 8 y 128 caracteres, sin controles ni espacios al principio o al final, y no puede coincidir con un placeholder público ni ser un único carácter repetido. No se exigen combinaciones artificiales de mayúsculas, números o símbolos: se admiten frases largas con espacios interiores. Las claves entregadas por un SysAdmin o por el bootstrap son temporales: después de autenticarse, el usuario solo puede consultar su sesión, cerrar sesión o definir una contraseña propia antes de entrar a la aplicación. El cambio revoca los demás accesos y rota la sesión actual. El login conserva compatibilidad con contraseñas históricas de 1 a 128 caracteres y las rehashea sin activar retroactivamente este requisito.

El login admite diez credenciales rechazadas por nombre de usuario normalizado dentro de 15 minutos; la siguiente solicitud responde `429` con `Retry-After` y bloquea esa identidad durante 15 minutos. Las reservas paralelas, los rechazos por capacidad y los errores internos no cuentan como contraseña incorrecta. La cuenta se libera después de un acceso correcto o de una creación, renombre o reset administrativo. Además, un token bucket admite una ráfaga inicial de 30 trabajos scrypt públicos y repone capacidad a razón de 30 por minuto, con solo cuatro ejecuciones simultáneas y ocho en cola, de modo que rotar usernames tampoco permita un consumo sostenido sin límite. Los contadores usan claves hasheadas, memoria acotada y corresponden a la única instancia backend actual; un reinicio los limpia y una futura réplica requerirá un store compartido.

El acceso al panel de administración depende exclusivamente del rol **SysAdmin** de la sesión. Hasta agosto de 2026 existía además una segunda verificación con una clave administrativa que vencía a los 15 minutos; se retiró porque agregaba fricción sin agregar defensa en un sistema interno donde el panel ya está restringido por rol y el backend lo valida en cada request de forma independiente del frontend.

Detalle completo (sesiones, hash de contraseñas y seed inicial) en [backend/README_BACKEND.md](backend/README_BACKEND.md#autenticación-y-autorización).

## Estructura del repo

```
backend/    → API Express 5 modular por feature (puerto 5000) — ver backend/README_BACKEND.md
frontend/   → React + Vite (puerto 3000, proxea /api al backend) — ver frontend/README_FRONTEND.md
e2e/        → Playwright: flujos críticos con backend, Vite y SQLite efímeros
lib/
  db/               → schemas Drizzle (tickets, seguimientos, roles, usuarios, sesiones) + cliente SQLite + migraciones (drizzle/) + backup
  ingesta/          → lógica compartida de parseo CSV, clasificación de motivo y SLA (la usan el CLI y /admin)
  api-spec/         → contrato OpenAPI (openapi.yaml) + config de Orval
  api-client-react/ → hooks React Query generados
  api-zod/          → schemas Zod generados
  password-policy/  → política pura compartida por backend y frontend
scripts/    → utilidades CLI de importación, backup, verificación y restore
data/       → base SQLite (gitignoreado, solo en desarrollo local)
docs/       → README.md, ARQUITECTURA.MD, FLUJO.md, DEPLOY.md, BITACORA_AGENTES.MD
Dockerfile.backend, Dockerfile.frontend, docker-compose.yml → despliegue en contenedores
.github/workflows/deploy.yml → CI/CD: build + redeploy en cada push a main (self-hosted runner)
```

Las carpetas `data/`, `backups/`, `tmp/`, `e2e/artifacts/`, `node_modules/`, `dist/` y `.pnpm-store/` son locales o generadas y están ignoradas por Git. El código versionado se concentra en `backend/`, `frontend/`, `e2e/`, `lib/`, `scripts/`, `docs/` y la configuración de la raíz.

## Quickstart (desarrollo local)

```bash
pnpm install
cp .env.example .env        # completar las claves; en una base nueva, también el bootstrap
pnpm --filter @workspace/db run push   # actualiza schema + invariantes locales

pnpm --filter @workspace/backend run dev    # API en :5000
pnpm --filter @workspace/frontend run dev   # UI en :3000
```

Abrir http://localhost:3000. En una base nueva, el primer arranque crea el usuario `sysadmin` con el valor de `BOOTSTRAP_SYSADMIN_PASSWORD`. La clave aplica la política compartida de 8 a 128 caracteres, sin controles, espacios exteriores ni valores predecibles conocidos; solo se guarda su hash y se marca como temporal. En el primer login, `sysadmin` debe reemplazarla para continuar. La misma protección detecta exclusivamente la credencial pública de versiones antiguas, la rota, la marca como temporal y revoca sus sesiones. Cualquier contraseña que ya haya sido cambiada se conserva aunque la variable siga configurada.

## Comandos

- `pnpm --filter @workspace/backend run dev` — API (puerto 5000, configurable con `PORT` en `.env`)
- `pnpm --filter @workspace/frontend run dev` — frontend (puerto 3000)
- `pnpm run lint` — ESLint tipado sobre fuentes y lint estructural sobre tests/configuración, incluido `e2e/`; `no-explicit-any` y las reglas de accesibilidad del frontend son errores y no se admiten warnings
- `pnpm run typecheck` — typecheck completo del workspace
- `pnpm test` — ejecuta las suites unitarias, de integración y de componentes de los paquetes que exponen un script `test`; no abre un navegador
- `pnpm --filter @workspace/e2e exec playwright install chromium` — instala el Chromium requerido por Playwright en la máquina local
- `pnpm run test:e2e` — ejecuta en Chromium los flujos críticos contra backend, Vite y una base temporal aislada
- `pnpm run test:e2e:headed` — misma suite E2E con el navegador visible
- `pnpm run build` — typecheck + build de todos los paquetes
- `pnpm run codegen` — regenera hooks y schemas Zod desde el spec OpenAPI
- `pnpm run codegen:check` — regenera y falla si falta commitear cualquier artefacto OpenAPI, incluso archivos nuevos
- `pnpm run format` / `pnpm run format:check` — normaliza o verifica código y configuración con Prettier
- `pnpm run quality` — reproduce el primer job del gate: lint, formato sin drift, codegen, schema Drizzle, pruebas no-browser, typecheck y builds; GitHub ejecuta después `pnpm run test:e2e` en un segundo job bloqueante
- `pnpm --filter @workspace/db run push` — aplica el schema en una base local sin ledger y reconcilia sus invariantes SQL (dev only)
- `pnpm --filter @workspace/scripts run import-excel -- <archivo.xlsx|csv> [--dry-run] [--sheet <nombre>]` — importa el histórico de llamadas (idempotente por conversation_id)
- `pnpm run backup:db -- --output ./backups/tickets-AAAA-MM-DD.db` — backup SQLite consistente con WAL; valida integridad, claves foráneas y esquema mínimo, usa permisos restrictivos y nunca sobrescribe archivos
- `pnpm run verify:db -- --source ./backups/tickets-AAAA-MM-DD.db --expect-evidence ./backups/evidencia.json` — reabre una copia transportada y exige que SHA-256, bytes y páginas coincidan con la evidencia del backup; para parsear JSON en automatización se ejecutan directamente los bundles `.mjs`, sin el output adicional de pnpm
- `pnpm run restore:db -- --source ./backups/origen.db --recovery-output ./backups/pre-restore.db --confirm-stopped` — restaura offline con recovery previa obligatoria; detener antes todos los procesos que puedan escribir SQLite
- `pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts` — genera el SQL de migración tras cambiar el schema (commitear el resultado)
- `WEBHOOK_API_KEY=... BOOTSTRAP_SYSADMIN_PASSWORD=... docker compose up -d --build` — levanta una instalación nueva en contenedores (ver [docs/DEPLOY.md](docs/DEPLOY.md)); el tercer valor deja de ser necesario después del bootstrap

El workflow Quality de GitHub exige dos jobs en orden: `quality` y luego `e2e`. El segundo instala Chromium, ejecuta los cuatro flujos Playwright sobre un stack efímero y, si falla, publica `playwright-diagnostics` durante 7 días. Ambos validan pull requests. El deploy desde `main` vive en un workflow independiente; la protección de rama debe exigir Quality si se quiere convertir esa validación en condición de merge.

## Configuración

Copiar `.env.example` a `.env` en la raíz:

| Variable                           | Para qué                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                             | Puerto del backend (default 5000)                                                                                                                         |
| `HOST_IP`                          | IP de esta máquina en la red interna — la usa n8n para llegar al webhook (solo referencia, no la lee el código)                                           |
| `WEBHOOK_API_KEY`                  | Clave que n8n manda en `x-api-key` al crear tickets (requerida para el webhook)                                                                           |
| `BOOTSTRAP_SYSADMIN_PASSWORD`      | Secreto exclusivo del bootstrap: crea `sysadmin` en una base sin hashes o rota la credencial semilla heredada; nunca modifica una contraseña ya asegurada |
| `TICKETS_DB_PATH`                  | Ruta del archivo SQLite (opcional, default `data/tickets.db`)                                                                                             |
| `TICKET_CSV_EXPORT_TIMEOUT_MS`     | Duración máxima absoluta de una exportación CSV (default 300000 = 5 minutos; rango 1000–2147483647)                                                       |
| `PRIORIDAD_AUTOMATICA_INTERVAL_MS` | Intervalo opcional de revisión de prioridades en milisegundos (default 300000 = 5 minutos; mínimo aceptado 10000)                                         |
| `TZ`                               | Timezone del proceso backend — en Docker por default `America/Argentina/Buenos_Aires`; los filtros por día calendario usan esta zona                      |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Backend**: Express 5 · SQLite (better-sqlite3) + Drizzle ORM · Zod 3.25 · scrypt para contraseñas · SSE nativo
- **Frontend**: React 19 + Vite 7 · wouter (routing) · TanStack Query 5 · Tailwind 4 + shadcn/ui (Radix) · Recharts
- **Codegen**: Orval genera hooks de React Query + validadores Zod desde un único contrato OpenAPI
- **Build backend**: esbuild (bundle ESM; better-sqlite3 queda externo — ver Dockerfile.backend)

## Decisiones de arquitectura

- **Ingesta por webhook, no leyendo el Excel**: n8n hace POST a `/api/webhooks/ticket` con header `x-api-key`. Idempotente por `conversation_id` (reintento ⇒ 200 con `created: false`); el Excel de n8n queda solo como respaldo/histórico.
- **Contract-first**: todo el contrato vive en `lib/api-spec/openapi.yaml`. Se edita el yaml, se corre `codegen`, y los dos lados (frontend y backend) quedan sincronizados por construcción.
- **Backend modular por feature**: `backend/src/modules/` separa `auth`, `tickets`, `dashboard`, `rendimiento`, `administracion` e `ingestion`; `shared/` concentra infraestructura transversal y `routes/index.ts` se limita a componer routers y guards globales.
- **SQLite en lugar de Postgres** (migrado 2026-07): better-sqlite3 con WAL alcanza para el volumen de llamadas, sin servidor de base de datos que administrar.
- **Login real con roles**, no solo una API key: sesiones en cookie host-only `httpOnly`, `SameSite=Lax` y token hexadecimal estricto; SQLite conserva únicamente un hash `sha256:` versionado del token, nunca el bearer reutilizable. Las cookies inválidas, vencidas o revocadas se eliminan y las respuestas de autenticación no se cachean. Las contraseñas usan scrypt asíncrono y formato versionado, el login combina límite por identidad con admisión criptográfica acotada, y un candado global (`requireSession`) protege toda la API funcional. Solo liveness/readiness, el webhook con clave propia, login y el logout idempotente quedan fuera del candado.
- **El rol es la frontera de cada espacio protegido**: las rutas `/admin/*`, el borrado, la cuarentena y la edición técnica exigen SysAdmin; Rendimiento exige SysAdmin o Controller; y Controller no puede mutar tickets. El backend valida cada caso aunque se manipule la interfaz.
- **Los secretos de servicio se validan antes de abrir el puerto**: `WEBHOOK_API_KEY` debe existir, tener al menos 32 caracteres y no usar placeholders, controles ni espacios exteriores. `.env.example` los deja vacíos deliberadamente; un backend mal configurado no llega a anunciarse listo.
- **Transporte web same-origin**: React llama a `/api` mediante Vite/Nginx y el webhook de n8n es servidor-a-servidor. El backend no publica CORS para orígenes arbitrarios ni expone `X-Powered-By`; Nginx oculta su versión y agrega `nosniff`, protección anti-iframe, política de referrer y permisos mínimos.
- **Texto recibido preservado frente a procesos automáticos, categoría derivada**: el clasificador y los backfills nunca reescriben `ticket.motivo` ni `ticket.resumen`; solo calculan `ticket.motivo_categoria`. Un usuario autenticado sí puede corregir explícitamente esos datos desde el detalle, y esa edición queda auditada; al cambiar motivo o resumen se recalcula la categoría.
- **Cuarentena derivada y materializada, sin borrar ni reescribir**: un ticket queda fuera de la operación únicamente cuando, por una condición AND, no contiene nombre/apellido, teléfono, DNI, empresa, email, motivo, resumen ni notas, no tiene seguimientos y conserva todos sus valores operativos iniciales. IDs, fechas, hora, categoría derivada y `audio_url` no se consideran contenido porque son datos técnicos o automáticos. La pertenencia se mantiene transaccionalmente en una proyección interna para no recalcular la regla en cada consulta. Administración puede incluir estos registros con `incluir_vacios=true`, protegido por sesión SysAdmin elevada e intención administrativa; al completar o gestionar el ticket deja de cumplir la regla y reaparece automáticamente. La definición exacta está en [docs/FLUJO.md](docs/FLUJO.md#cuarentena-administrativa-de-registros-vacíos).
- Los tickets **no se crean a mano** en el flujo normal: la vía de alta es el webhook (o el importador). El alta manual existe solo dentro del panel `/admin` (`POST /api/admin/tickets`), pensado para corrección de datos.
- **Migraciones en Docker, `push` protegido en desarrollo local**: el comando local aplica `drizzle-kit push` contra `data/tickets.db` y después instala/verifica los invariantes que Drizzle no representa, como los triggers de cuarentena. El backend repite esa verificación antes de servir: solo repara bases legacy sin ledger y falla cerrado si una base versionada está incompleta. En Docker, `dist/migrate.mjs` aplica la cadena lineal hasta `0016_admin_session_elevation.sql` antes de levantar la API.

## Gotchas

- En Windows, usar siempre pnpm; el preinstall usa Node (no `sh`).
- `lib/db/drizzle.config.ts` normaliza la ruta del schema a barras `/` porque drizzle-kit usa globs que no toleran `\` de Windows.
- No usar `sql\`...\``crudo con objetos`Date`como parámetro: better-sqlite3 no bindea`Date`. Usar los operadores tipados de Drizzle (`lt`, `gte`, …).
- SQLite no tiene `ilike`; se usa `like` (case-insensitive para ASCII).
- El `.env` de la raíz lo carga el backend (walk-up desde cwd); Vite no lo lee.
- Con SQLite en modo WAL no hay que copiar solo `tickets.db` mientras la API está activa — usar `pnpm run backup:db` o el procedimiento Docker de [docs/DEPLOY.md](docs/DEPLOY.md).
- `pnpm --filter @workspace/backend deploy --prod` (usado en `Dockerfile.backend`) necesita el flag `--legacy` en pnpm 11 con este workspace, si no tira `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`.
- Si cambiás cualquier archivo de `lib/db/src/schema/`, generá la migración (`drizzle-kit generate`) y commiteala **antes** de mergear — si no, el próximo deploy en Docker no va a tener las tablas nuevas.
- El handler global de 401 del frontend (`QueryCache.onError` en `App.tsx`) excluye explícitamente a `/auth/me` — si no, un 401 de esa misma query se auto-invalida y entra en loop infinito (bug real, ya corregido).
