# Paquetes compartidos — guía para agentes

Seis paquetes del workspace que consumen backend, frontend, scripts y e2e. No
son servicios: se importan como dependencias (`@workspace/*`) y se compilan con
project references de TypeScript (`tsc --build`).

| Paquete                    | Qué es                                                          |
| -------------------------- | --------------------------------------------------------------- |
| `@workspace/api-spec`      | **El contrato**: `openapi.yaml` y la config de codegen           |
| `@workspace/api-client-react` | Cliente React Query **generado** desde el spec                |
| `@workspace/api-zod`       | Validadores Zod **generados** desde el spec                      |
| `@workspace/db`            | Schema Drizzle, migraciones, backup/restore verificado           |
| `@workspace/ingesta`       | Dominio compartido: estados, motivos, SLA, parseo de planillas   |
| `@workspace/password-policy` | Reglas de contraseña, compartidas por back y front             |

## El contrato manda

`lib/api-spec/openapi.yaml` es la fuente. De ahí salen el cliente y los
validadores. Después de editar el spec:

```bash
pnpm run codegen
```

**Nada bajo `src/generated/` se edita a mano.** `pnpm run codegen:check` está
dentro del gate de calidad y falla si lo commiteado no coincide con lo que
produce el generador — que es justamente lo que evita que el contrato se vuelva
ficción.

Cambiar solo la `description` de una respuesta no genera código; cambiar un
schema sí. Ante la duda, corré el codegen y mirá el diff.

## `@workspace/ingesta` es el dominio, no solo la ingesta

El nombre quedó del origen (importar planillas), pero hoy es **la lib de dominio
compartida**: acá viven el catálogo de estados y su máquina de transiciones
(`estados.ts`), las categorías de motivo (`motivos.ts`), el cálculo de SLA
(`sla.ts`) y las prioridades. Lo consumen backend y frontend por igual.

Si una regla de negocio la necesitan los dos lados, va acá. Todo el paquete es
**puro**: sin acceso a base de datos ni dependencias de Node más allá de lo
estándar — por eso duplica a propósito los enums del schema en `types.ts`, para
no arrastrar `better-sqlite3` al bundle del navegador.

## `@workspace/db`: schema y migraciones

Si tocás cualquier archivo de `src/schema/`, **generá la migración con
`drizzle-kit generate` y commiteala en el mismo cambio**. Sin eso, el próximo
deploy en Docker arranca sin las tablas nuevas. `pnpm run schema:check` valida
la coherencia de la cadena y está en el gate.

Las migraciones son secuenciales y ya van por `0021_*`; no se reescribe una
migración ya publicada.

## Tests

```bash
pnpm --filter @workspace/ingesta run test
pnpm --filter @workspace/db run test
pnpm --filter @workspace/api-spec run test   # tests de contrato, en .mjs
```
