# GSB Tickets

Sistema de gestión de tickets que se alimenta automáticamente de llamadas telefónicas: un agente de voz de ElevenLabs atiende la llamada y n8n envía el JSON resultante a la API de este sistema (y en paralelo a un Excel de respaldo). Los tickets no se crean a mano.

📖 **Documentación completa del flujo**: [docs/FLUJO.md](docs/FLUJO.md)
🚀 **Despliegue en el servidor de testing (Docker + CI/CD)**: [docs/DEPLOY.md](docs/DEPLOY.md)

## Estructura

```
backend/    → API Express 5 (puerto 5000)
frontend/   → React + Vite (puerto 3000, proxea /api al backend)
lib/
  db/               → schemas Drizzle de tickets, roles y usuarios + cliente SQLite + migraciones (drizzle/)
  ingesta/          → lógica compartida de parseo CSV/mapeo de columnas (la usan el CLI y /admin)
  api-spec/         → contrato OpenAPI (openapi.yaml) + config de Orval
  api-client-react/ → hooks React Query generados
  api-zod/          → schemas Zod generados
scripts/    → utilidades (importador histórico y backup SQLite online)
data/       → base SQLite (gitignoreado, solo en desarrollo local)
Dockerfile.backend, Dockerfile.frontend, docker-compose.yml → despliegue en contenedores
.github/workflows/deploy.yml → CI/CD: build + redeploy en cada push a main (self-hosted runner)
```

## Comandos

- `pnpm --filter @workspace/backend run dev` — API (puerto 5000, configurable con `PORT` en `.env`)
- `pnpm --filter @workspace/frontend run dev` — frontend (puerto 3000)
- `pnpm run typecheck` — typecheck completo del workspace
- `pnpm run build` — typecheck + build de todos los paquetes
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks y schemas Zod desde el spec OpenAPI
- `pnpm --filter @workspace/db run push` — aplica cambios de schema a la base SQLite (dev only)
- `pnpm --filter @workspace/scripts run import-excel -- <archivo.xlsx|csv> [--dry-run] [--sheet <nombre>]` — importa el histórico de llamadas (idempotente por conversation_id)
- `pnpm run backup:db -- --output ./backups/tickets-AAAA-MM-DD.db` — crea un backup SQLite consistente con WAL, verifica su integridad y no sobrescribe archivos
- `pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts` — genera el SQL de migración tras cambiar el schema (commitear el resultado)
- `WEBHOOK_API_KEY=... docker compose up -d --build` — levanta el stack completo en contenedores (ver [docs/DEPLOY.md](docs/DEPLOY.md))

## Configuración

Copiar `.env.example` a `.env` en la raíz:

- `PORT` — puerto del backend (default 5000)
- `WEBHOOK_API_KEY` — clave que n8n manda en el header `x-api-key` (requerida para el webhook)
- `ADMIN_API_KEY` — única llave para las operaciones `/api/admin/*`, incluida la gestión de roles y usuarios (opcional en desarrollo; sin ella esos endpoints quedan abiertos). No es una contraseña de usuario ni crea una sesión.
- `TICKETS_DB_PATH` — ruta del archivo SQLite (opcional, default `data/tickets.db`)
- `TZ` — timezone del proceso backend (en Docker, default `America/Argentina/Buenos_Aires`); los filtros por día calendario usan esta zona

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 · DB: SQLite (better-sqlite3) + Drizzle ORM
- Validación: Zod (`zod/v4`), `drizzle-zod` · Codegen: Orval desde OpenAPI
- Build backend: esbuild (bundle ESM; better-sqlite3 queda external y debe ser dependencia directa del backend)

## Decisiones de arquitectura

- **Ingesta por webhook, no leyendo el Excel**: n8n hace POST a `/api/webhooks/ticket` con header `x-api-key`. El endpoint es idempotente por `conversation_id` (reintento ⇒ 200 con `created: false`); el Excel queda solo como respaldo/histórico.
- **SQLite en lugar de Postgres** (migrado 2026-07): better-sqlite3 con WAL alcanza para el volumen de llamadas. Fechas como `integer { mode: "timestamp_ms" }`, estados/prioridades como `text { enum }`.
- **Roles y usuarios como catálogo administrativo**: se guardan en SQLite y se gestionan desde `/admin/roles-usuarios`. Todavía no hay contraseñas, login, sesiones ni autorización efectiva por rol; `ADMIN_API_KEY` continúa siendo el único control de las operaciones administrativas.
- Los tickets **no se crean a mano** en el flujo normal: la vía de alta es el webhook (o el importador). El alta manual existe solo dentro del panel `/admin` (`POST /api/admin/tickets`), pensado para corrección de datos.
- El resto del CRUD no tiene auth: está pensado para red local. Antes de exponerlo a internet hay que implementar autenticación y autorización reales.
- **Migraciones en Docker, `push` en desarrollo local**: en local se usa `drizzle-kit push` (rápido, sin archivos de migración) contra `data/tickets.db`. En Docker el volumen arranca vacío, así que el contenedor corre `dist/migrate.mjs` (aplica `lib/db/drizzle/*.sql` vía el migrator de drizzle-orm, idempotente) antes de levantar la API — ver [docs/DEPLOY.md](docs/DEPLOY.md).

## Gotchas

- En Windows, usar siempre pnpm; el preinstall usa Node (no `sh`).
- `lib/db/drizzle.config.ts` normaliza la ruta del schema a barras `/` porque drizzle-kit usa globs que no toleran `\` de Windows.
- No usar `sql\`...\``crudo con objetos`Date`como parámetro: better-sqlite3 no bindea`Date`. Usar los operadores tipados de Drizzle (`lt`, `gte`, …).
- SQLite no tiene `ilike`; se usa `like` (case-insensitive para ASCII).
- El `.env` de la raíz lo carga el backend (walk-up desde cwd); Vite no lo lee.
- Con SQLite en modo WAL no hay que copiar solo `tickets.db` mientras la API está activa. Usar `pnpm run backup:db` o el procedimiento Docker de [docs/DEPLOY.md](docs/DEPLOY.md), que incluyen las páginas confirmadas del WAL y ejecutan `integrity_check`.
- `pnpm --filter @workspace/backend deploy --prod` (usado en `Dockerfile.backend` para armar un `node_modules` de producción sin symlinks) necesita el flag `--legacy` en pnpm 11 con este workspace, si no tira `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`.
- Si cambiás cualquier archivo de `lib/db/src/schema/`, generá la migración (`drizzle-kit generate`) y commiteala **antes** de mergear — si no, el próximo deploy en Docker no va a tener las tablas nuevas.
