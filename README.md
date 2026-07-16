# GSB Tickets

Sistema de gestión de tickets que se alimenta automáticamente de llamadas telefónicas: un agente de voz de ElevenLabs atiende la llamada y n8n envía el JSON resultante a la API de este sistema (y en paralelo a un Excel de respaldo). Los tickets no se crean a mano.

📖 **Documentación completa del flujo**: [docs/FLUJO.md](docs/FLUJO.md)

## Estructura

```
backend/    → API Express 5 (puerto 5000)
frontend/   → React + Vite (puerto 3000, proxea /api al backend)
lib/
  db/               → schema Drizzle + cliente SQLite (source of truth del modelo)
  api-spec/         → contrato OpenAPI (openapi.yaml) + config de Orval
  api-client-react/ → hooks React Query generados
  api-zod/          → schemas Zod generados
scripts/    → utilidades (importador del Excel/CSV histórico)
data/       → base SQLite (gitignoreado)
```

## Comandos

- `pnpm --filter @workspace/backend run dev` — API (puerto 5000, configurable con `PORT` en `.env`)
- `pnpm --filter @workspace/frontend run dev` — frontend (puerto 3000)
- `pnpm run typecheck` — typecheck completo del workspace
- `pnpm run build` — typecheck + build de todos los paquetes
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks y schemas Zod desde el spec OpenAPI
- `pnpm --filter @workspace/db run push` — aplica cambios de schema a la base SQLite (dev only)
- `pnpm --filter @workspace/scripts run import-excel -- <archivo.xlsx|csv> [--dry-run] [--sheet <nombre>]` — importa el histórico de llamadas (idempotente por conversation_id)

## Configuración

Copiar `.env.example` a `.env` en la raíz:

- `PORT` — puerto del backend (default 5000)
- `WEBHOOK_API_KEY` — clave que n8n manda en el header `x-api-key` (requerida para el webhook)
- `TICKETS_DB_PATH` — ruta del archivo SQLite (opcional, default `data/tickets.db`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 · DB: SQLite (better-sqlite3) + Drizzle ORM
- Validación: Zod (`zod/v4`), `drizzle-zod` · Codegen: Orval desde OpenAPI
- Build backend: esbuild (bundle ESM; better-sqlite3 queda external y debe ser dependencia directa del backend)

## Decisiones de arquitectura

- **Ingesta por webhook, no leyendo el Excel**: n8n hace POST a `/api/webhooks/ticket` con header `x-api-key`. El endpoint es idempotente por `conversation_id` (reintento ⇒ 200 con `created: false`); el Excel queda solo como respaldo/histórico.
- **SQLite en lugar de Postgres** (migrado 2026-07): el sistema corre local en Windows; better-sqlite3 con WAL alcanza para el volumen de llamadas. Fechas como `integer { mode: "timestamp_ms" }`, estados/prioridades como `text { enum }`.
- `POST /api/tickets` (uso del frontend) responde 409 si el `conversation_id` ya existe; el webhook responde 200 idempotente.
- El resto del CRUD no tiene auth: pensado para red local. Si se expone a internet, agregar autenticación antes.

## Gotchas

- En Windows, usar siempre pnpm; el preinstall usa Node (no `sh`).
- `lib/db/drizzle.config.ts` normaliza la ruta del schema a barras `/` porque drizzle-kit usa globs que no toleran `\` de Windows.
- No usar `sql\`...\`` crudo con objetos `Date` como parámetro: better-sqlite3 no bindea `Date`. Usar los operadores tipados de Drizzle (`lt`, `gte`, …).
- SQLite no tiene `ilike`; se usa `like` (case-insensitive para ASCII).
- El `.env` de la raíz lo carga el backend (walk-up desde cwd); Vite no lo lee.
