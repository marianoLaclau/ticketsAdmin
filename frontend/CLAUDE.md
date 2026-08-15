# Frontend — guía para agentes

React 19 + Vite, TypeScript, Tailwind 4 + shadcn/ui, wouter para routing.
[README_FRONTEND.md](README_FRONTEND.md) tiene el detalle de pantallas, roles en
la UI y el sistema de toasts.

## Dónde va cada cosa

- `pages/` — un archivo por ruta. Son **composition roots**: arman la pantalla
  con piezas de `features/`, no contienen lógica de negocio propia.
- `features/<nombre>/` — todo lo de una funcionalidad: componentes, hooks y su
  lógica pura (parseo de URL, formularios, formato).
- `components/` — piezas realmente compartidas (`ui/` son las primitivas
  shadcn; `layout/`, y las que usan dos o más features).
- `lib/` — **solo lo transversal**: si algo lo usa una sola feature, va dentro
  de esa feature.

**Una feature no puede importar de otra** (ESLint lo bloquea). Si dos necesitan
lo mismo, sube a `lib/` o a `components/`. `pages/` y `components/` sí pueden
componer cualquier feature — están fuera de la restricción a propósito.

El alias `@/` apunta a `frontend/src/`.

## Estado

**TanStack Query es la fuente de verdad del servidor.** No hay Redux ni Zustand
y no hace falta agregarlos. `useState` local queda para lo que es puramente de
UI: diálogos abiertos, borradores de formulario, filtros todavía sin aplicar.

El cliente HTTP es generado: se importa de `@workspace/api-client-react`, no se
escribe `fetch` a mano contra `/api`.

## Tests: son dos corridas distintas

```bash
pnpm --filter @workspace/frontend run test            # ambas
pnpm --filter @workspace/frontend run test:unit       # test/*.test.ts   (lógica pura)
pnpm --filter @workspace/frontend run test:components # test/*.test.tsx  (jsdom + RTL)
```

La extensión decide el runner: **lógica pura en `.ts`, componentes en `.tsx`**.
Un test de componente nombrado `.ts` no se ejecuta con jsdom y falla de forma
confusa.

Los tests de componente que montan primitivas de Radix necesitan el polyfill del
entorno:

```ts
import { installDomEventRealm } from "./dom-event-realm.ts";
installDomEventRealm();
```

Sin eso, un `ResizeObserver is not defined` rompe el render.

## Gotchas propios

- **Radix `Select`**: los `SelectItem` no están en el DOM hasta que se abre el
  desplegable, pero Radix refleja cada opción en un `<option>` nativo oculto
  para el formulario. Para verificar una opción deshabilitada en un test, buscá
  `getAllByRole("option", { hidden: true })` y mirá la propiedad `disabled`
  (no `aria-disabled`, que ahí viene `null`). Para elementos Radix no nativos,
  el atributo es `data-disabled`.
- El handler global de 401 (`QueryCache.onError` en `App.tsx`) excluye
  `/auth/me` a propósito: sin esa excepción, un 401 de esa query se
  auto-invalida y entra en loop infinito.
- Vite proxea `/api` en dev hacia `API_PROXY_TARGET`. Nunca hardcodear una URL
  absoluta de la API.
- El `.env` de la raíz **no** lo lee Vite.
