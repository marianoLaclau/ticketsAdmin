# Backend — guía para agentes

Express + Drizzle sobre SQLite (modo WAL). Ver
[README_BACKEND.md](README_BACKEND.md) para el detalle de endpoints y
[src/modules/README.md](src/modules/README.md) para la estructura de módulos y
sus fronteras.

## Dónde va cada cosa

Seis módulos de negocio en `src/modules/` (`auth`, `tickets`, `dashboard`,
`administracion`, `ingestion`, `rendimiento`), cada uno con las capas que
necesita: `http/` (rutas y validación), `application/` (casos de uso y reglas),
`data/` (consultas), `jobs/` (procesos programados).

- Un módulo se consume **solo por su `index.ts`**. ESLint bloquea importar
  archivos internos de otro módulo.
- `src/shared/` es infraestructura transversal (config, logging, SSE, readiness,
  validaciones técnicas). **No puede depender de módulos de negocio** — también
  forzado por ESLint.
- Reglas de dominio que el frontend también necesita van a `lib/ingesta`, no acá
  (estados, categorías de motivo, SLA).

## Escrituras: el patrón que ya existe, respetalo

Toda mutación que toque más de una tabla va en una transacción, y las que
compiten por escritura reservan con `BEGIN IMMEDIATE`:

```ts
db.transaction((tx) => { /* ... */ }, { behavior: "immediate" });
```

La edición concurrente usa **concurrencia optimista**: el cliente manda
`expected_version`, el handler la compara contra la fila dentro de la
transacción y, si no coincide, devuelve `409 TICKET_VERSION_CONFLICT` sin
escribir, sin auditar y sin emitir SSE. Si agregás una mutación nueva sobre
tickets, seguí ese camino en vez de inventar otro.

Los eventos SSE (`broadcastEvent`) se emiten **después** de que la transacción
confirmó, nunca adentro: si no, otras sesiones pueden observar un estado que
todavía puede revertirse.

## Reglas de negocio que ya tienen dueño

- **Estados del ticket**: la máquina vive en `lib/ingesta/src/estados.ts` y se
  aplica en el `PATCH /api/tickets/:id`, que es el único camino que cambia el
  estado. No dupliques la validación en otro lado.
- **Progreso**: se deriva del estado (`progresoDeEstado`). El cliente no lo
  elige; no vuelvas a aceptarlo del body.
- **Campos derivados en la auditoría**: los que cambian como consecuencia de
  otro campo (`motivo_categoria`, `progreso`) están en `STRUCTURED_AUDIT_FIELDS`
  y no se listan como "campos editados", porque nadie los editó.

## Tests

```bash
pnpm --filter @workspace/backend run test        # tsx --test sobre test/*.test.ts
```

Las suites levantan SQLite en memoria o temporal y ejercitan los handlers de
verdad, no mocks del ORM. Si cambiás comportamiento y un test falla, leelo antes
de ajustarlo: puede estar señalando un efecto secundario real (pasó con la nota
de auditoría al derivar el progreso).

## Gotchas propios

- No pasar objetos `Date` como parámetro a un template `sql` crudo de Drizzle:
  better-sqlite3 no los bindea. Usar los operadores tipados (`lt`, `gte`, …).
- SQLite no tiene `ilike`. Se usa `like`, que es case-insensitive para ASCII.
- El `.env` de la raíz lo carga este proceso haciendo walk-up desde el cwd.
