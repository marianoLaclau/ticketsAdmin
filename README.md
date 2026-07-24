# GSB Tickets

Sistema de gestión de tickets que se alimenta **automáticamente** de llamadas telefónicas: un agente de voz de ElevenLabs atiende la llamada, n8n arma el JSON y se lo manda a este sistema. Los tickets no se crean a mano en el flujo normal — nacen solos con cada llamada.

```
Llamada telefónica → ElevenLabs (agente de voz) → n8n → POST /api/webhooks/ticket → SQLite → Dashboard / Tickets
                                                              ↑
                                                    también: importador CSV / panel admin
```

📖 **Flujo de negocio completo** (ElevenLabs → n8n → webhook → SLA): [docs/FLUJO.md](docs/FLUJO.md)
🚀 **Despliegue en el servidor de testing** (Docker + CI/CD): [docs/DEPLOY.md](docs/DEPLOY.md)
🛠️ **Backend en detalle** (API, auth, roles, base de datos, migraciones): [backend/README_BACKEND.md](backend/README_BACKEND.md)
🎨 **Frontend en detalle** (páginas, routing, estado, componentes): [frontend/README_FRONTEND.md](frontend/README_FRONTEND.md)
📓 **Bitácora de cambios técnicos**: [docs/BITACORA_AGENTES.MD](docs/BITACORA_AGENTES.MD)

> **Versión v0.5:** integra las mejoras de gestión, auditoría, clasificación y prioridad descritas abajo, junto con el estado laboral recibido desde Serin.

## Qué hace el sistema

- **Ingesta automática**: cada llamada atendida por el agente de voz crea un ticket solo, vía webhook. Idempotente — un reintento de n8n no duplica nada.
- **SLA de 48 horas hábiles y prioridad dinámica**: el plazo corre de lunes a viernes durante las 24 horas y se pausa por completo los sábados y domingos. Los feriados aún cuentan como hábiles. Un ticket sin resolver sube, sin degradaciones, a prioridad `alta` cuando quedan 24 horas hábiles o menos y a `urgente` cuando quedan 12 horas hábiles o menos o ya venció.
- **Cuarentena de registros vacíos**: una llamada sin datos útiles se conserva intacta en la base para auditoría, pero no aparece en Tickets ni participa del Dashboard o de las notificaciones operativas. Solo un SysAdmin puede verla desde Administración.
- **Gestión de tickets**: dashboard con KPIs y gráficos filtrables por todo, semana, mes o rango personalizado; listado con responsable asignado, filtros combinables, ordenamiento server-side por todas sus columnas, paginación y exportación CSV completa del resultado filtrado; detalle con edición funcional, historial auditable y reproductor de audio.
- **Categorización automática del motivo**: un clasificador basado en reglas agrupa el texto libre de `motivo`/`resumen` en categorías estables (haberes y pagos, recibos, vacaciones, bajas, empleo, reclamos, legales, **embargos**, etc.) para poder filtrar y graficar sin que cada redacción de n8n sea una categoría nueva. v0.5 reconcilia la columna derivada de registros anteriores al arrancar, sin reescribir sus textos originales.
- **Trazabilidad desde v0.5**: cada modificación registra de forma atómica el autor y los cambios reales de estado, prioridad, asignación y campos editados. El historial nuevo no intenta inventar eventos anteriores a la incorporación de esta auditoría.
- **Actualización en vivo**: la app mantiene una conexión de Server-Sent Events; cuando entra un llamado nuevo (o se importa un CSV), todas las pestañas abiertas se refrescan al instante y muestran una notificación — sin recargar la página.
- **Login obligatorio con roles**: nadie ve ninguna pantalla ni puede pegarle a la API sin sesión iniciada. Tres roles con permisos distintos (ver sección Autenticación).
- **Panel de administración** (solo rol SysAdmin): tabla ampliada, ordenable y paginada, acceso al detalle incluso para registros en cuarentena, CRUD manual de tickets, importador de CSV con simulación previa, "zona peligrosa" para vaciar la base, y gestión de roles/usuarios con reset de contraseña.
- **Importador del histórico**: script CLI que carga de una vez un Excel/CSV viejo con el mismo motor de parseo que usa el panel web.
- **Backup online de SQLite**: copia consistente con el WAL, verificada con `integrity_check`, sin sobrescribir destinos.

## Autenticación y roles

Todo el sistema exige sesión iniciada. Las únicas rutas públicas son `GET /api/healthz`, `POST /api/webhooks/ticket` (autenticado con su propia API key, para n8n) y `POST /api/auth/login`. Cualquier otra URL del frontend, sin sesión, muestra el login.

| Rol | Puede |
|---|---|
| **SysAdmin** | Todo, incluido el panel de Administración (`/admin`, `/admin/roles-usuarios`) |
| **Administrador** | Gestión completa de tickets — incluido pasarlos a **Cerrado** — pero sin acceso al panel de administración |
| **Operador** | Gestión básica de tickets; **no puede cerrarlos** (la opción queda deshabilitada en la UI y el backend la rechaza igual) |

Detalle completo (sesiones, hash de contraseñas, seed inicial, doble verificación del panel admin) en [backend/README_BACKEND.md](backend/README_BACKEND.md#autenticación-y-autorización).

## Estructura del repo

```
backend/    → API Express 5 (puerto 5000) — ver backend/README_BACKEND.md
frontend/   → React + Vite (puerto 3000, proxea /api al backend) — ver frontend/README_FRONTEND.md
lib/
  db/               → schemas Drizzle (tickets, seguimientos, roles, usuarios, sesiones) + cliente SQLite + migraciones (drizzle/) + backup
  ingesta/          → lógica compartida de parseo CSV, clasificación de motivo y SLA (la usan el CLI y /admin)
  api-spec/         → contrato OpenAPI (openapi.yaml) + config de Orval
  api-client-react/ → hooks React Query generados
  api-zod/          → schemas Zod generados
scripts/    → utilidades CLI (importador histórico, backup SQLite)
data/       → base SQLite (gitignoreado, solo en desarrollo local)
docs/       → FLUJO.md, DEPLOY.md, BITACORA_AGENTES.MD
Dockerfile.backend, Dockerfile.frontend, docker-compose.yml → despliegue en contenedores
.github/workflows/deploy.yml → CI/CD: build + redeploy en cada push a main (self-hosted runner)
```

## Quickstart (desarrollo local)

```bash
pnpm install
cp .env.example .env        # completar WEBHOOK_API_KEY como mínimo
pnpm --filter @workspace/db run push   # crea/actualiza el schema en data/tickets.db

pnpm --filter @workspace/backend run dev    # API en :5000
pnpm --filter @workspace/frontend run dev   # UI en :3000
```

Abrir http://localhost:3000 — el primer arranque del backend crea el usuario semilla **`sysadmin` / clave `admin`** (cambiarla apenas se pueda, desde Administración → Roles y usuarios → llavesita de reset).

## Comandos

- `pnpm --filter @workspace/backend run dev` — API (puerto 5000, configurable con `PORT` en `.env`)
- `pnpm --filter @workspace/frontend run dev` — frontend (puerto 3000)
- `pnpm run typecheck` — typecheck completo del workspace
- `pnpm run build` — typecheck + build de todos los paquetes
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks y schemas Zod desde el spec OpenAPI
- `pnpm --filter @workspace/db run push` — aplica cambios de schema a la base SQLite (dev only)
- `pnpm --filter @workspace/scripts run import-excel -- <archivo.xlsx|csv> [--dry-run] [--sheet <nombre>]` — importa el histórico de llamadas (idempotente por conversation_id)
- `pnpm run backup:db -- --output ./backups/tickets-AAAA-MM-DD.db` — backup SQLite consistente con WAL, verifica integridad y no sobrescribe archivos
- `pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts` — genera el SQL de migración tras cambiar el schema (commitear el resultado)
- `WEBHOOK_API_KEY=... docker compose up -d --build` — levanta el stack completo en contenedores (ver [docs/DEPLOY.md](docs/DEPLOY.md))

## Configuración

Copiar `.env.example` a `.env` en la raíz:

| Variable | Para qué |
|---|---|
| `PORT` | Puerto del backend (default 5000) |
| `HOST_IP` | IP de esta máquina en la red interna — la usa n8n para llegar al webhook (solo referencia, no la lee el código) |
| `WEBHOOK_API_KEY` | Clave que n8n manda en `x-api-key` al crear tickets (requerida para el webhook) |
| `ADMIN_API_KEY` | Segunda credencial obligatoria de las operaciones administrativas del SysAdmin; si falta, esas operaciones responden `503` |
| `TICKETS_DB_PATH` | Ruta del archivo SQLite (opcional, default `data/tickets.db`) |
| `PRIORIDAD_AUTOMATICA_INTERVAL_MS` | Intervalo opcional de revisión de prioridades en milisegundos (default 300000 = 5 minutos; mínimo aceptado 10000) |
| `TZ` | Timezone del proceso backend — en Docker por default `America/Argentina/Buenos_Aires`; los filtros por día calendario usan esta zona |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Backend**: Express 5 · SQLite (better-sqlite3) + Drizzle ORM · Zod 3.25 · scrypt para contraseñas · SSE nativo
- **Frontend**: React 19 + Vite 7 · wouter (routing) · TanStack Query 5 · Tailwind 4 + shadcn/ui (Radix) · Recharts
- **Codegen**: Orval genera hooks de React Query + validadores Zod desde un único contrato OpenAPI
- **Build backend**: esbuild (bundle ESM; better-sqlite3 queda externo — ver Dockerfile.backend)

## Decisiones de arquitectura

- **Ingesta por webhook, no leyendo el Excel**: n8n hace POST a `/api/webhooks/ticket` con header `x-api-key`. Idempotente por `conversation_id` (reintento ⇒ 200 con `created: false`); el Excel de n8n queda solo como respaldo/histórico.
- **Contract-first**: todo el contrato vive en `lib/api-spec/openapi.yaml`. Se edita el yaml, se corre `codegen`, y los dos lados (frontend y backend) quedan sincronizados por construcción.
- **SQLite en lugar de Postgres** (migrado 2026-07): better-sqlite3 con WAL alcanza para el volumen de llamadas, sin servidor de base de datos que administrar.
- **Login real con roles**, no solo una API key: sesiones en cookie `httpOnly` respaldadas en tabla, contraseñas con scrypt, y un candado global (`requireSession`) que protege toda la API salvo el webhook y el propio login.
- **`ADMIN_API_KEY` es una segunda verificación obligatoria, no la única**: las rutas `/admin/*`, el borrado y la edición administrativa de tickets exigen sesión + rol SysAdmin + esta clave. Si la variable falta, el backend falla cerrado con `503`.
- **Texto recibido preservado frente a procesos automáticos, categoría derivada**: el clasificador y los backfills nunca reescriben `ticket.motivo` ni `ticket.resumen`; solo calculan `ticket.motivo_categoria`. Un usuario autenticado sí puede corregir explícitamente esos datos desde el detalle, y esa edición queda auditada; al cambiar motivo o resumen se recalcula la categoría.
- **Cuarentena derivada, sin borrar ni reescribir**: un ticket queda fuera de la operación únicamente cuando, por una condición AND, no contiene nombre/apellido, teléfono, DNI, empresa, email, motivo, resumen ni notas, no tiene seguimientos y conserva todos sus valores operativos iniciales. IDs, fechas, hora, categoría derivada y `audio_url` no se consideran contenido porque son datos técnicos o automáticos. Administración puede incluir estos registros con `incluir_vacios=true`, protegido por sesión SysAdmin y `ADMIN_API_KEY`; al completar o gestionar el ticket deja de cumplir la regla y reaparece automáticamente. La definición exacta está en [docs/FLUJO.md](docs/FLUJO.md#cuarentena-administrativa-de-registros-vacíos).
- Los tickets **no se crean a mano** en el flujo normal: la vía de alta es el webhook (o el importador). El alta manual existe solo dentro del panel `/admin` (`POST /api/admin/tickets`), pensado para corrección de datos.
- **Migraciones en Docker, `push` en desarrollo local**: en local se usa `drizzle-kit push` contra `data/tickets.db`. En Docker el contenedor corre `dist/migrate.mjs` antes de levantar la API. La secuencia integrada incorpora `0007_add_estado_empleado.sql`, `0008_v05_auditoria_ticket.sql` (trazabilidad) y `0009_add_embargos_category.sql` (backfill inicial); luego el arranque reconcilia idempotentemente la categoría derivada con el clasificador vigente.

## Gotchas

- En Windows, usar siempre pnpm; el preinstall usa Node (no `sh`).
- `lib/db/drizzle.config.ts` normaliza la ruta del schema a barras `/` porque drizzle-kit usa globs que no toleran `\` de Windows.
- No usar `sql\`...\`` crudo con objetos `Date` como parámetro: better-sqlite3 no bindea `Date`. Usar los operadores tipados de Drizzle (`lt`, `gte`, …).
- SQLite no tiene `ilike`; se usa `like` (case-insensitive para ASCII).
- El `.env` de la raíz lo carga el backend (walk-up desde cwd); Vite no lo lee.
- Con SQLite en modo WAL no hay que copiar solo `tickets.db` mientras la API está activa — usar `pnpm run backup:db` o el procedimiento Docker de [docs/DEPLOY.md](docs/DEPLOY.md).
- `pnpm --filter @workspace/backend deploy --prod` (usado en `Dockerfile.backend`) necesita el flag `--legacy` en pnpm 11 con este workspace, si no tira `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`.
- Si cambiás cualquier archivo de `lib/db/src/schema/`, generá la migración (`drizzle-kit generate`) y commiteala **antes** de mergear — si no, el próximo deploy en Docker no va a tener las tablas nuevas.
- El handler global de 401 del frontend (`QueryCache.onError` en `App.tsx`) excluye explícitamente a `/auth/me` — si no, un 401 de esa misma query se auto-invalida y entra en loop infinito (bug real, ya corregido).
