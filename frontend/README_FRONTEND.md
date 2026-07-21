# Frontend — GSB Tickets

React + Vite. Consume la API del backend por `/api/*` (proxeado en dev, servido detrás de nginx en producción — ver `nginx.conf`). No hay estado global tipo Redux/Zustand: **TanStack Query es la fuente de verdad del servidor**, y `useState` local para lo que es puramente de UI (formularios abiertos, filtros no aplicados aún, etc.).

> Para el panorama general del proyecto ver el [README.md](../README.md) de la raíz. Este documento es el detalle técnico de todo lo que vive en `frontend/`.

## Índice

- [Stack y arranque](#stack-y-arranque)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Routing y el candado de autenticación](#routing-y-el-candado-de-autenticación)
- [Roles en la UI](#roles-en-la-ui)
- [Páginas](#páginas)
- [Actualización en vivo (SSE)](#actualización-en-vivo-sse)
- [Cliente de la API](#cliente-de-la-api)
- [Sistema de notificaciones (toasts)](#sistema-de-notificaciones-toasts)
- [Librerías propias (`src/lib`)](#librerías-propias-srclib)
- [Estilos y componentes UI](#estilos-y-componentes-ui)

## Stack y arranque

- **React 19** + **Vite 7**, TypeScript.
- **wouter** para routing (liviano, sin `react-router`).
- **TanStack Query 5** para todo el estado de servidor: fetching, cache, invalidación.
- **Tailwind 4** + **shadcn/ui** (componentes en `src/components/ui/`, generados a partir de Radix).
- **Recharts** para los gráficos del dashboard.

```bash
pnpm --filter @workspace/frontend run dev      # Vite dev server, puerto 3000 (o $PORT)
pnpm --filter @workspace/frontend run build    # build de producción → dist/public
pnpm --filter @workspace/frontend run typecheck
```

En dev, Vite proxea todo lo que empieza con `/api` hacia `API_PROXY_TARGET` (default `http://localhost:5000`) — configurado en `vite.config.ts`. Por eso el código nunca hardcodea una URL absoluta de la API.

## Estructura de carpetas

```
frontend/
  nginx.conf                    → config de producción (proxy /api, sin buffering en /api/events)
  src/
    App.tsx                      → QueryClient, AuthGate, definición de rutas (wouter)
    main.tsx                     → entry point (createRoot)
    assets/                       → logo, estáticos importados por el bundler
    pages/
      Login.tsx                    → pantalla de login
      Dashboard.tsx                 → KPIs, gráficos, actividad reciente
      TicketList.tsx                 → listado con filtros, orden y paginación
      TicketDetail.tsx                → detalle, edición, seguimientos, audio
      Admin.tsx                        → panel: CRUD de tickets, import CSV, truncate
      AdminRolesUsers.tsx                → gestión de roles y usuarios
      not-found.tsx                       → 404 (también se usa para bloquear rutas por rol)
    components/
      layout/AppLayout.tsx        → Sidebar + listener de eventos en vivo
      admin/AdminHeader.tsx        → header compartido de las pantallas de admin (llave + nav)
      ui/                            → primitivas shadcn/ui (button, dialog, table, toast, password-input, ...)
    hooks/
      use-admin-access.ts          → llave administrativa persistida por usuario en el navegador
      use-toast.ts                   → sistema de notificaciones
      use-mobile.tsx                   → media query helper
    lib/
      roles.ts                       → constantes de rol + puedeCerrarTickets() (espejo del backend)
      motivos.ts                      → catálogo de categorías de motivo + estilos de badge
      utils-tickets.tsx                → badges de Estado/Prioridad, formatDate, isVencido
      datetime-local.ts                 → conversión segura entre ISO y <input type="datetime-local">
      utils.ts                            → cn() (clsx + tailwind-merge)
```

## Routing y el candado de autenticación

Todo se define en `App.tsx`. La raíz es la única entrada pública del lado del cliente; **el layout con el sidebar solo se monta si hay sesión**.

```tsx
<WouterRouter>
  <Switch>
    <Route path="/" component={PublicEntry} />  {/* login; con sesión → /dashboard */}
    <Route>
      <AuthGate>
        <ProtectedRouter />  {/* AppLayout + rutas autenticadas */}
      </AuthGate>
    </Route>
  </Switch>
</WouterRouter>
```

- **`PublicEntry`** atiende `/`: sin sesión muestra `<Login />`; si la sesión todavía es válida redirige a `/dashboard` con reemplazo de historial.
- **`AuthGate`** protege `/dashboard`, `/tickets` y `/admin`. Llama a `useGetMe()` (`GET /api/auth/me`), muestra un spinner mientras verifica y, ante un `401`, normaliza la URL a `/`. Un fallo de red o del backend muestra una pantalla de error con opción de reintentar, no un login engañoso.
- **`SoloSysAdmin`** envuelve las rutas `/admin` y `/admin/roles-usuarios`: si `me.rol !== 'SysAdmin'`, muestra una pantalla `403 Acceso denegado`. El backend valida lo mismo de forma independiente; este guard visual no es la única defensa.
- **Manejo de sesión vencida**: `QueryCache` y `MutationCache` revalidan `/auth/me` ante un `401` de sesión, lo que devuelve la aplicación a la raíz/login. Se excluyen el propio `/auth/me`, los intentos de login y los `401` de la llave administrativa para evitar loops o expulsar al SysAdmin por una key mal escrita.
- **Login**: tras autenticar, actualiza el caché de `/auth/me` y navega explícitamente a `/dashboard` con `replace`.
- **Logout**: tras el `204`, `queryClient.clear()` elimina los datos de la sesión y hace una recarga limpia en `/`. La recarga fuerza una nueva verificación de la cookie ya eliminada y evita que un observer conserve momentáneamente al usuario anterior. La llave administrativa no se borra: permanece localmente, separada por ID de SysAdmin.

## Roles en la UI

Espejo de `backend/src/lib/auth.ts`, en `frontend/src/lib/roles.ts`:

```ts
export const ROL_SYSADMIN = 'SysAdmin';
export const ROL_ADMINISTRADOR = 'Administrador';
export const ROL_OPERADOR = 'Operador';
export function puedeCerrarTickets(rol) { return rol === ROL_SYSADMIN || rol === ROL_ADMINISTRADOR; }
```

Dos lugares donde esto cambia lo que se ve:

1. **Sidebar** (`AppLayout.tsx`): el link "Administración" solo se agrega al array `links` si `me?.rol === ROL_SYSADMIN`.
2. **TicketDetail**: en el `<Select>` de estado, la opción "CERRADO" tiene `disabled={!puedeCerrarTickets(me?.rol)}`, con una leyenda debajo ("Solo puede ser cerrado por un administrador") cuando está deshabilitada.

En ambos casos es **solo UX** — la fuente de verdad de la restricción es el backend (`403`/`404` según corresponda); si el rol falla acá, el peor caso es un botón visible que el servidor va a rechazar igual.

## Páginas

### `Dashboard.tsx` (ruta `/dashboard`)
KPIs (sin revisar, en proceso, vencidos, resueltos), distribución por estado (barra segmentada), gauge de tasa de resolución, ranking de motivos (usa `getMotivoCategoriaConfig` de `lib/motivos.ts` para color y label), gráfico de barras por prioridad (Recharts), tabla de vencidos y feed de actividad reciente. El selector **Todo / Semana actual / Mes actual / Período personalizado** envía el mismo rango a los hooks `useGetDashboardStats`, `useGetActividadReciente`, `useGetTicketsVencidos` y `useGetMotivoStats`; el rango personalizado se aplica recién al confirmar fechas válidas. Todos los paneles de tickets usan la misma cohorte por fecha de creación; actividad usa la fecha real de cada evento. Dentro de una cohorte, “Resueltos” cuenta los que actualmente están resueltos o cerrados. `Todo` conserva el comportamiento histórico y “Resueltos hoy”.

### `TicketList.tsx`
El listado principal (ruta `/tickets`). Filtros: búsqueda libre, estado, prioridad, **categoría de motivo** (`MOTIVO_CATEGORIA_OPTIONS`), rango de fechas, rango de horas, empresa, y el switch de "Vencidos". Encabezado de columna "Fecha y Hora" clickeable para alternar `order` (asc/desc, default desc — más recientes primero). Paginación con selector de tamaño (10/25/50/100) y botones Anterior/Siguiente; **cualquier cambio de filtro, orden o tamaño de página vuelve a la página 1** (`useEffect` que resetea `page`). Cada fila muestra un badge de categoría de motivo además del texto original y una columna **Asignado**, que presenta `asignado_a` o `Sin asignar`. La columna Contacto presenta nombre y empresa; si nombre y apellido están vacíos usa la leyenda visual `Sin nombre proporcionado` sin alterar el registro recibido.

### `TicketDetail.tsx` (ruta `/tickets/:id`)
- Header con motivo, badge de vencido, fecha de creación, asignado.
- Datos del contacto con filas fijas de teléfono y email. Cada una muestra el valor cuando existe o `Teléfono no proporcionado` / `Email no proporcionado` cuando el llamante no lo indicó; nombre también mantiene su fallback visual.
- Tracker visual de progreso (0–100%) con 5 pasos fijos que corresponden a los 5 estados.
- Dialog "Editar Estado": estado (con el bloqueo de "Cerrado" según rol), prioridad, progreso (slider), fecha límite (`datetime-local`, ver conversión abajo), notas internas.
- Reproductor `<audio>` nativo si el ticket tiene `audio_url`.
- Timeline de seguimientos + textarea para agregar uno nuevo (el `autor` no se manda desde acá — lo pone el backend).
- **Fecha límite**: si el usuario no tocó el control, el campo no se reenvía en el `PATCH` (preserva segundos/milisegundos originales que `datetime-local` no puede representar). Si el control queda vacío pero antes tenía valor, se bloquea el guardado con un toast — el contrato actual no permite null-ear `fecha_limite`.

### `Admin.tsx` (ruta `/admin`, solo SysAdmin)
Tres tabs:
- **Registros**: tabla CRUD completa (busca, pagina, crea, edita, elimina cualquier ticket) — es la única vía de alta manual del sistema (`POST /api/admin/tickets`).
- **Importar CSV**: al elegir un archivo corre automáticamente un `dry_run` y muestra el resumen (columnas detectadas, a insertar/ya existentes/inválidos) antes de escribir nada; botón para confirmar la importación real.
- **Zona peligrosa**: truncate de toda la base, con doble seguro — hay que tipear literalmente `BORRAR` para habilitar el botón, y el backend además exige `{ confirmar: true }`.

Usa `AdminHeader` (compartido con `AdminRolesUsers.tsx`) para el campo de la llave de administración y la navegación entre las dos pantallas de admin. La llave se muestra enmascarada, puede revelarse con el botón de ojo y se guarda en `localStorage` bajo una clave asociada al ID del usuario. No se guarda en la base de datos ni forma parte del `queryKey` de React Query. Crear, editar y eliminar desde este CRUD envía `x-admin-key`; el backend valida además que la sesión pertenezca al rol SysAdmin.

### `AdminRolesUsers.tsx` (ruta `/admin/roles-usuarios`, solo SysAdmin)
Dos tabs, cada uno con su propia paginación/búsqueda/filtros:
- **Usuarios**: alta/edición (nombre, apellido, **nombre de usuario**, email, rol, activo), activación/desactivación con `Switch` (nunca borrado físico). **Al crear** un usuario, el formulario pide además contraseña + repetir (mínimo 6 caracteres) — el SysAdmin define las credenciales ahí mismo y se las entrega a la persona; esos campos no aparecen al editar un usuario existente. Cambiar la contraseña de alguien que ya existe se hace con la **llavesita de reset** (ícono ámbar) — abre un dialog con clave nueva + repetir y, al guardar, revoca las sesiones activas de ese usuario en el backend. Todos los campos de contraseña usan `PasswordInput`: permanecen ocultos por defecto y tienen un ojo accesible para mostrar/ocultar.
- **Roles**: alta/edición/activación, borrado con confirmación (bloqueado por el backend con `409` si el rol tiene usuarios asignados — se le indica al usuario que lo desactive en cambio).

## Actualización en vivo (SSE)

`useEventosEnVivo()`, definido dentro de `AppLayout.tsx` y llamado una vez desde `AppLayout` (por eso corre para toda la sesión de la app, no por página):

```ts
const es = new EventSource('/api/events');
es.onmessage = (e) => {
  const data = JSON.parse(e.data);
  queryClient.invalidateQueries();      // refresca TODO: listado, dashboard, sidebar
  if (data.tipo === 'ticket_creado') toast({ variant: 'info', title: 'Nuevo llamado recibido', ... });
  if (data.tipo === 'tickets_importados') toast({ variant: 'info', title: 'Importación disponible', ... });
};
```

No hay reconexión manual — `EventSource` la maneja sola usando el `retry: 5000` que manda el servidor. La conexión se abre solo dentro del `AuthGate` (o sea, solo con sesión activa), y se cierra en el cleanup del `useEffect`.

## Cliente de la API

Todo `lib/api-client-react` y `lib/api-zod` se **genera** con Orval a partir de `lib/api-spec/openapi.yaml` — nunca se edita a mano. Cada operación del contrato produce un hook (`useListTickets`, `useCreateAdminTicket`, `useGetMe`, etc.) más su `QueryKey` helper (`getGetMeQueryKey()`) para poder referenciar la misma key desde otro lado (invalidación, seteo manual de caché).

Los hooks aceptan una opción `request` para mandar headers extra por llamada — es como viaja la clave de administración:

```ts
const { adminRequest } = useAdminAccess(); // { headers: { 'x-admin-key': ... } } o {}
useCreateAdminTicket({ request: adminRequest });
```

Al cerrar sesión, el sidebar limpia el caché de la sesión y recarga la entrada raíz mediante `window.location.replace(import.meta.env.BASE_URL)`. La llave administrativa persiste para ese ID de usuario en `localStorage`, de modo que no hay que ingresarla en cada login desde el mismo navegador; vaciar manualmente el campo la elimina. No existe una ruta `/login`: el formulario vive en `/`; el Dashboard vive en `/dashboard`.

El transporte real (`customFetch`) vive en `lib/api-client-react/src/custom-fetch.ts`: parsea JSON/texto según `content-type`, arma `ApiError` con `status` y el body de error, y no hace throw en respuestas sin body (204).

## Pantallas de error

`components/ErrorPage.tsx` centraliza mensajes en español para `401`, `403`, `404`, `409`, `500`, `503` y errores de conexión. Siempre ofrece **Volver al inicio** (al Dashboard para errores dentro de una sesión; a la raíz durante la verificación de acceso) y, cuando el error puede recuperarse, **Reintentar**. Se usa en el guard de sesión, permisos SysAdmin, rutas inexistentes, Dashboard, listado, detalle y Administración. `AppErrorBoundary` cubre además errores inesperados de renderizado.

`GET /api/events` es la única excepción — vive fuera del contrato OpenAPI (es un stream, no un request/response), por eso se consume con `EventSource` nativo en vez de un hook generado.

## Sistema de notificaciones (toasts)

`hooks/use-toast.ts` + `components/ui/toast.tsx`. Cinco variantes visuales: `default`, `success`, `info`, `warning`, `destructive`. Soporta `dedupeKey`: si ya hay un toast abierto con la misma key, no se duplica — se usa para evitar que la invalidación disparada por SSE y la propia mutación del usuario (que hizo la acción) muestren dos toasts para el mismo evento (ej. `ticket-created:${id}`, `tickets-imported:${cantidad}`). Los errores pasan por `lib/error-messages.ts`: se traducen por estado y por casos de negocio conocidos, y nunca se muestra al usuario el `Error.message` técnico con HTTP, URL, JSON, HTML o detalles internos de validación.

## Librerías propias (`src/lib`)

- **`roles.ts`** — ver [Roles en la UI](#roles-en-la-ui).
- **`error-messages.ts`** — mensajes seguros para login, administración y mutaciones; solo inspecciona campos estructurados del error y aplica traducciones conocidas.
- **`dashboard-period.ts`** — rangos calendario de semana/mes, validación del período personalizado y etiquetas de presentación.
- **`asignacion.ts`** — normalización visual del responsable y fallback `Sin asignar`.
- **`motivos.ts`** — espejo en el frontend del catálogo de `lib/ingesta/src/motivos.ts` del backend, pero con estilos (`color`, `badgeClass`) en vez de solo lógica de clasificación. Incluye la categoría `legales` para cartas documento, telegramas laborales, consultas jurídicas, contacto explícito con abogados, SECLO, intimaciones y otros indicadores legales concretos. `getMotivoCategoriaConfig(categoria)` devuelve un fallback razonable (label capitalizado desde el código) si llega una categoría que el frontend no conoce todavía — para no romper si el backend agrega una categoría nueva antes que se actualice este archivo.
- **`utils-tickets.tsx`** — `EstadoBadge`/`PrioridadBadge` (los puntos de color + texto que aparecen en todas las tablas), `formatDate` (formato `es-AR`), `isVencido` (fecha límite pasada y el ticket no está resuelto/cerrado).
- **`datetime-local.ts`** — `toDateTimeLocalValue`/`dateTimeLocalValueToIso`: convierten entre un ISO string y el formato que espera `<input type="datetime-local">`, **en la zona horaria del navegador** (no UTC). `dateTimeLocalValueToIso` rechaza (devuelve `null`) fechas imposibles o horas inexistentes por cambio de horario de verano, en vez de dejar que `Date` las normalice silenciosamente.

## Estilos y componentes UI

Tailwind 4 + shadcn/ui: los componentes en `src/components/ui/` son código generado/copiado (no una dependencia de node_modules), así que se editan directamente cuando hace falta un ajuste. `cn()` (en `lib/utils.ts`) combina `clsx` + `tailwind-merge` para componer clases condicionalmente sin conflictos de especificidad. Los badges de estado/prioridad/categoría de motivo son los únicos elementos de color con significado semántico fijo en todo el sistema — si se agrega un estado o categoría nueva, hay que agregar su color en `utils-tickets.tsx` / `lib/motivos.ts` respectivamente.
