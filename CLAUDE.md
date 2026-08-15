# GSB Tickets — guía para agentes

Monorepo pnpm. Llamados telefónicos entran por webhook desde n8n, se convierten
en tickets y se gestionan con trazabilidad. Monolito modular: `backend`
(Express), `frontend` (React + Vite), `lib/*` (paquetes compartidos), `scripts`
(CLI) y `e2e` (Playwright).

Antes de tocar algo desconocido: [README.md](README.md) tiene el quickstart, la
configuración y una lista de **gotchas reales** que evita repetir errores ya
cometidos. [docs/ARQUITECTURA.MD](docs/ARQUITECTURA.MD) tiene el detalle por
módulo, el modelo de datos y las decisiones tomadas con su porqué.

## Reglas que no se negocian

- **No pushear sin un OK explícito del usuario en el momento.** Un push a `main`
  dispara el deploy al servidor de testing. Commitear está bien; publicar no.
- **No editar a mano nada bajo `lib/*/src/generated/`.** Se regenera con
  `pnpm run codegen` a partir de `lib/api-spec/openapi.yaml`. El gate verifica
  que lo commiteado coincida con lo que produce el generador.
- **Si tocás `lib/db/src/schema/`, generá y commiteá la migración** en el mismo
  cambio. Sin eso el próximo deploy arranca sin las tablas nuevas.
- **Usar pnpm siempre** (el `preinstall` rechaza npm y yarn).

## Comandos

```bash
pnpm run quality      # el gate completo: lint, formato, codegen, schema, tests, build
pnpm run lint
pnpm run typecheck    # libs + runtime + tests; es la red que atrapa imports rotos
pnpm test             # todos los paquetes
pnpm run test:e2e     # Playwright, stack real aislado
```

Iterar sobre un paquete solo, que es mucho más rápido:

```bash
pnpm --filter @workspace/backend run test
pnpm --filter @workspace/frontend run test
pnpm --filter @workspace/ingesta run test
```

`pnpm run quality` tarda varios minutos: corré los targeted mientras trabajás y
dejá el completo para el final.

## Convenciones

- **Todo en castellano**: nombres de identificadores del dominio, comentarios,
  mensajes de error de cara al usuario y mensajes de commit.
- Commits en formato `tipo(alcance): descripción en minúscula`, sin punto final
  (`feat(tickets):`, `fix(rendimiento):`, `refactor(frontend):`, `docs(...)`,
  `copy(...)`, `ci(...)`).
- Los comentarios explican **por qué**, no qué hace la línea. Si un comentario
  se puede deducir leyendo el código de al lado, sobra.
- Las fronteras entre módulos y features **las fuerza ESLint**, no la buena
  voluntad: ver `eslint.config.mjs`. Si un import te da error de
  `no-restricted-imports`, la solución es mover lo compartido al lugar común,
  no evadir la regla.

## Guías por área

- [backend/CLAUDE.md](backend/CLAUDE.md) — módulos, capas, transacciones.
- [frontend/CLAUDE.md](frontend/CLAUDE.md) — features, estado de servidor, tests
  de componentes.
- [lib/CLAUDE.md](lib/CLAUDE.md) — contrato OpenAPI, dominio compartido, schema.
