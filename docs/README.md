# Documentación del proyecto

Este directorio reúne la documentación operativa y técnica de GSB Tickets.

## Por dónde empezar

1. [README principal](../README.md): propósito, arquitectura, instalación local y comandos habituales.
2. [Arquitectura](ARQUITECTURA.MD): modelo de software, capas, datos, seguridad, flujos y despliegue.
3. [Flujo de negocio](FLUJO.md): ingesta desde n8n, estados, plazos, clasificación, cuarentena y auditoría.
4. [Backend](../backend/README_BACKEND.md): API Express, autenticación, permisos, base de datos y migraciones.
5. [Frontend](../frontend/README_FRONTEND.md): rutas, pantallas, estado de UI y componentes principales.
6. [Despliegue](DEPLOY.md): Docker, runner de GitHub Actions, variables y verificación del servidor de testing.

## Registro histórico

[BITACORA_AGENTES.MD](BITACORA_AGENTES.MD) es un registro append-only de decisiones y cambios realizados durante el desarrollo. Las entradas históricas no reemplazan la documentación técnica vigente; sirven para entender por qué existe una decisión o una compatibilidad.

## Fuentes de verdad

- **Contrato HTTP:** `lib/api-spec/openapi.yaml`.
- **Clientes y validadores generados:** `lib/api-client-react/src/generated/` y `lib/api-zod/src/generated/`. No se editan a mano; se regeneran con `pnpm run codegen`.
- **Modelo de datos:** `lib/db/src/schema/`.
- **Migraciones de producción:** `lib/db/drizzle/`. Cada cambio de schema que llegue a Docker debe incluir su migración y su prueba correspondiente.
- **Lógica compartida de ingesta:** `lib/ingesta/src/`.
- **Flujos críticos de navegador:** `e2e/tests/critical-flows.spec.ts`, con el entorno aislado implementado en `e2e/scripts/runtime.ts` y activado por `e2e/scripts/global-setup.ts`.
- **Gate de pull requests:** `.github/workflows/quality.yml`; el job `quality` debe aprobar antes de ejecutar el job bloqueante `e2e`.
- **Deploy desde `main`:** `.github/workflows/deploy.yml`; primero reutiliza el workflow completo de Quality —incluidos sus E2E— y, solo si ambos jobs aprueban, ejecuta el backup SQLite bloqueante, build, `compose up --wait` y smoke tests en el runner self-hosted.

## Flujo mínimo para trabajar

Desde la raíz del repositorio:

```text
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run quality
pnpm --filter @workspace/e2e exec playwright install chromium  # primera vez
pnpm run test:e2e
```

`pnpm run quality` reproduce el primer job del gate: lint, formato Prettier sin drift, regeneración OpenAPI, verificación de la cadena Drizzle, suites unitarias/integración/componentes, typecheck y builds. El segundo job instala Chromium con sus dependencias y ejecuta `pnpm run test:e2e` solo si el primero aprobó. Ambos validan pull requests y el workflow de Deploy los vuelve a ejecutar mediante `workflow_call`; el job que modifica el servidor depende de que esa validación completa termine correctamente. Ante un fallo de navegador, GitHub conserva `e2e/artifacts/` como `playwright-diagnostics` durante 7 días. Si cambia el schema, generar la migración, revisar el SQL y validar una instalación nueva y una actualización desde la última migración de producción.

## Estado local que no se versiona

`.env`, `data/`, `backups/`, `tmp/`, `e2e/artifacts/`, `node_modules/`, `dist/` y `.pnpm-store/` son artefactos locales o generados y están ignorados por Git. No deben agregarse para “ordenar” el repositorio: el código fuente y la configuración reproducible viven fuera de esas carpetas.
