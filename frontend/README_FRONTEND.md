# Frontend — GSB Tickets

React + Vite. Consume la API del backend por `/api/*` en el mismo origen (proxeado en dev, servido detrás de nginx en producción — ver `nginx.conf`), por lo que el navegador no necesita CORS. No hay estado global tipo Redux/Zustand: **TanStack Query es la fuente de verdad del servidor**, y `useState` local para lo que es puramente de UI (formularios abiertos, filtros no aplicados aún, etc.).

> Para el panorama general del proyecto ver el [README.md](../README.md) de la raíz. Este documento es el detalle técnico de todo lo que vive en `frontend/`.

## Índice

- [Stack y arranque](#stack-y-arranque)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Routing y el candado de autenticación](#routing-y-el-candado-de-autenticación)
- [Roles en la UI](#roles-en-la-ui)
- [Páginas](#páginas)
- [Actualización en vivo (SSE)](#actualización-en-vivo-sse)
- [Cliente de la API](#cliente-de-la-api)
- [Pruebas](#pruebas)
- [Sistema de notificaciones (toasts)](#sistema-de-notificaciones-toasts)
- [Librerías propias (`src/lib`)](#librerías-propias-srclib)
- [Estilos y componentes UI](#estilos-y-componentes-ui)

## Stack y arranque

- **React 19** + **Vite 7**, TypeScript.
- **wouter** para routing (liviano, sin `react-router`).
- **TanStack Query 5** para todo el estado de servidor: fetching, cache, invalidación.
- **Tailwind 4** + **shadcn/ui** (componentes en `src/components/ui/`, generados a partir de Radix).
- **Recharts** para los gráficos del dashboard.
- **node:test**, Testing Library, axe-core y **Playwright** para pruebas unitarias, de componentes, accesibilidad y flujos críticos de navegador.

```bash
pnpm --filter @workspace/frontend run dev      # Vite dev server, puerto 3000 (o $PORT)
pnpm --filter @workspace/frontend run build    # build de producción → dist/public
pnpm --filter @workspace/frontend run typecheck
pnpm --filter @workspace/frontend test         # unitarias + componentes
# desde la raíz: pnpm run test:e2e             # navegador y stack completo aislado
```

En dev, Vite proxea todo lo que empieza con `/api` hacia `API_PROXY_TARGET` (default `http://localhost:5000`) — configurado en `vite.config.ts`. Por eso el código nunca hardcodea una URL absoluta de la API.

## Estructura de carpetas

```
frontend/
  nginx.conf                    → proxy /api, SSE sin buffering y cabeceras HTTP seguras
  src/
    App.tsx                      → QueryClient, AuthGate, definición de rutas (wouter)
    main.tsx                     → purga credenciales admin legadas y monta React
    assets/                       → logo, estáticos importados por el bundler
    pages/
      Login.tsx                    → pantalla de login
      ChangePassword.tsx             → reemplazo obligatorio de credenciales temporales
      Dashboard.tsx                 → KPIs, gráficos, actividad reciente
      TicketList.tsx                 → listado con filtros, orden y paginación
      TicketDetail.tsx                → detalle, edición, seguimientos, audio
      Admin.tsx                        → panel: CRUD de tickets, import CSV, truncate
      AdminRolesUsers.tsx                → gestión de roles y usuarios
      not-found.tsx                       → 404
    features/
      auth/                       → AuthGate, guard SysAdmin y sesión protegida
      admin-directory/            → CRUD y fronteras de roles/usuarios
      admin-tickets/              → CRUD, importación y zona peligrosa
      dashboard/                  → paneles y selección temporal
      ticket-detail/              → controladores y diálogos del detalle
      ticket-list/                → filtros, orden, filas y accesibilidad del listado
    components/
      layout/AppLayout.tsx        → Sidebar + listener de eventos en vivo
      admin/AdminHeader.tsx        → alta/revocación de elevación y navegación admin
      SortableTableHead.tsx         → encabezado accesible para orden server-side
      tickets/TicketDataEditDialog.tsx → edición de datos funcionales del ticket
      ui/                            → 20 primitivas shadcn/ui efectivamente usadas
    hooks/
      use-admin-elevation.ts       → estado server-side del grant y request fijo de intención
      use-admin-operation-guard.ts → bloquea operaciones al cambiar la frontera de acceso
      use-toast.ts                   → sistema de notificaciones
    lib/
      roles.ts                       → constantes de rol + puedeCerrarTickets() (espejo del backend)
      password-change.ts               → decisión de ruta y validación pura del cambio obligatorio
      session-state.ts                   → revalidación y aislamiento de caché entre identidades
      motivos.ts                      → catálogo de categorías de motivo + estilos de badge
      ticket-edit.ts                   → formulario funcional, PATCH mínimo y labels de auditoría
      ticket-list-controls.ts           → parámetros compartidos por listado y exportación
      utils-tickets.tsx                → badges de Estado/Prioridad, formatDate, isVencido
      datetime-local.ts                 → conversión segura entre ISO y <input type="datetime-local">
      utils.ts                            → cn() (clsx + tailwind-merge)
```

## Routing y el candado de autenticación

Todo se define en `App.tsx`. La raíz es la única entrada pública del lado del cliente; **el layout con el sidebar solo se monta si hay sesión**.

```tsx
<WouterRouter>
  <Switch>
    <Route path="/" component={PublicEntry} />{" "}
    {/* login; decide cambio o dashboard */}
    <Route>
      <AuthGate>
        <ProtectedRouter />{" "}
        {/* cambio pendiente no llega a montar este layout */}
      </AuthGate>
    </Route>
  </Switch>
</WouterRouter>
```

- **`PublicEntry`** atiende `/`: sin sesión muestra `<Login />`; si la sesión todavía es válida decide entre `/cambiar-contrasena` y `/dashboard` según `me.debe_cambiar_password`, con reemplazo de historial.
- **`AuthGate`** protege `/cambiar-contrasena`, `/dashboard`, `/tickets` y `/admin`. Llama a `useGetMe()` (`GET /api/auth/me`), muestra un spinner mientras verifica y, ante un `401`, normaliza la URL a `/`. Una credencial temporal solo puede renderizar `ChangePassword`, fuera de `AppLayout`; una cuenta ya regularizada no puede volver a esa pantalla. Un fallo de red o del backend muestra una pantalla de error con opción de reintentar, no un login engañoso.
- **`SoloSysAdmin`** envuelve `/admin`, `/admin/roles-usuarios` y `/admin/tickets/:id`: si `me.rol !== 'SysAdmin'`, muestra una pantalla `403 Acceso denegado`. El backend valida lo mismo de forma independiente; este guard visual no es la única defensa.
- **Manejo de sesión vencida**: `QueryCache` y `MutationCache` revalidan `/auth/me` ante un `401` de sesión, lo que devuelve la aplicación a la raíz/login. La entrada pública nunca confía en `data` stale si esa revalidación falló o sigue pendiente, y un `401` confirmado elimina las queries funcionales sin recrear en loop la query activa de sesión. `ADMIN_ELEVATION_REQUIRED` sigue otra política: invalida y vuelve a consultar el estado de elevación sin expulsar al SysAdmin. Un login exitoso vuelve a limpiar las queries anteriores antes de instalar la nueva identidad.
- **Login**: tras autenticar, actualiza el caché de `/auth/me` y navega a `/cambiar-contrasena` o `/dashboard` con la misma función pura y `replace`.
- **Cambio obligatorio**: solicita contraseña temporal, nueva y repetición, aplica la política compartida en cliente y usa `POST /api/auth/password`. Un éxito reemplaza el usuario cacheado —incluido el flag— y continúa al dashboard; cerrar sesión sigue disponible. El guard del backend es la autoridad y evita un bypass mediante URL o llamadas directas.
- **Logout**: tras el `204`, `queryClient.clear()` elimina los datos de la sesión y hace una recarga limpia en `/`. La recarga fuerza una nueva verificación de la cookie ya eliminada y evita que un observer conserve momentáneamente al usuario anterior. Como el grant pertenece a la fila de sesión, el backend lo revoca junto con ella; el navegador no conserva una copia de `ADMIN_API_KEY`.

## Roles en la UI

Espejo de `backend/src/lib/auth.ts`, en `frontend/src/lib/roles.ts`:

```ts
export const ROL_SYSADMIN = "SysAdmin";
export const ROL_ADMINISTRADOR = "Administrador";
export const ROL_OPERADOR = "Operador";
export function puedeCerrarTickets(rol) {
  return rol === ROL_SYSADMIN || rol === ROL_ADMINISTRADOR;
}
```

Las restricciones visibles principales son:

1. **Sidebar** (`AppLayout.tsx`): el link "Administración" solo se agrega al array `links` si `me?.rol === ROL_SYSADMIN`.
2. **TicketDetail**: en el `<Select>` de estado, la opción "CERRADO" tiene `disabled={!puedeCerrarTickets(me?.rol)}`, con una leyenda debajo ("Solo puede ser cerrado por un administrador") cuando está deshabilitada.
3. **Edición del ticket**: cualquier usuario autenticado puede completar o corregir los datos funcionales (contacto, empresa, motivo y resumen). Los datos técnicos como hora, audio, notificación y fechas de límite/resolución no se exponen en ese formulario; cuando una operación técnica existe en modo administrativo, el backend vuelve a exigir SysAdmin, grant vigente y `x-admin-intent: 1`.

En todos los casos la restricción visual es **solo UX** — la fuente de verdad es el backend (`403`/`404` según corresponda); si la UI falla, el servidor rechaza igualmente una operación no autorizada.

## Páginas

### `Dashboard.tsx` (ruta `/dashboard`)

KPIs (sin revisar, en proceso, vencidos, resueltos), distribución por estado (barra segmentada), gauge de tasa de resolución, ranking de motivos (usa `getMotivoCategoriaConfig` de `lib/motivos.ts` para color y label), gráfico de barras por prioridad (Recharts), tabla de vencidos y feed de actividad reciente. El selector **Todo / Semana actual / Mes actual / Período personalizado** envía el mismo rango a los hooks `useGetDashboardStats`, `useGetActividadReciente`, `useGetTicketsVencidos` y `useGetMotivoStats`; el rango personalizado se aplica recién al confirmar fechas válidas. Todos los paneles de tickets usan la misma cohorte por fecha de creación; actividad usa la fecha real de cada evento. Dentro de una cohorte, “Resueltos” cuenta los que actualmente están resueltos o cerrados. `Todo` conserva el comportamiento histórico y “Resueltos hoy”.

### `TicketList.tsx`

El listado principal (ruta `/tickets`). Filtros: búsqueda libre, estado, prioridad, **categoría de motivo** (`MOTIVO_CATEGORIA_OPTIONS`, incluida `Embargos`), rango de fechas, rango de horas, empresa y switch de "Vencidos". Cada control conserva un prefijo visible (`Estado:`, `Prioridad:`, `Categoría:`, `Fecha:`, `Hora:`, `Empresa:` y `Plazo:`), de modo que los valores default `Todos/Todas` nunca quedan sin contexto. En escritorio usa tres filas estables: búsqueda amplia con estado y prioridad; categoría con fecha y hora; empresa con plazo, exportación y limpiar. En resoluciones menores cada grupo se apila sin depender de cortes automáticos. La columna Contacto presenta nombre y empresa; debajo de una empresa real muestra `Activo` o `Inactivo` cuando `estado_empleado` fue informado. Los valores vacíos y los marcadores `Sin empresa asignada/asociada` conservan la presentación anterior sin una línea de estado. Si nombre y apellido están vacíos usa `Sin nombre proporcionado` sin alterar el registro recibido.

Todos los encabezados de datos son ordenables mediante `SortableTableHead`: un clic selecciona o invierte el criterio principal y `Shift + clic` agrega criterios secundarios numerados. El frontend envía `sort` y conserva `sort_by`/`order` por compatibilidad; el backend ordena el conjunto completo antes de paginar. `Restablecer orden` vuelve a fecha de llegada descendente. La paginación conserva tamaños 10/25/50/100 y vuelve a la página 1 al cambiar filtros u orden.

El botón **Exportar CSV**, junto a los filtros de plazo, conserva filtros y orden activos pero no la paginación: descarga todos los tickets operativos coincidentes. Mientras se genera bloquea dobles clics y comunica éxito/error con los toasts de la aplicación.

### `TicketDetail.tsx` (rutas `/tickets/:id` y `/admin/tickets/:id`)

- Header con motivo, badge de vencido, fecha de creación, asignado.
- Datos del contacto con filas fijas de teléfono y email. Cada una muestra el valor cuando existe o `Teléfono no proporcionado` / `Email no proporcionado` cuando el llamante no lo indicó; nombre también mantiene su fallback visual. Si hay empresa y estado laboral, presenta `Activo` o `Inactivo` debajo de la empresa.
- Botón con lápiz **Editar datos**: abre `TicketDataEditDialog` para nombre, apellido, teléfono, DNI/CUIT, empresa, email, motivo y resumen. Genera un PATCH mínimo, normaliza opcionales vacíos a `null` y recalcula la categoría al cambiar motivo/resumen. Al corregir DNI o empresa, el backend invalida el estado laboral obtenido previamente desde Serin para evitar asociarlo a datos distintos. La interfaz avisa que cada corrección quedará registrada.
- Tracker visual de progreso (0–100%) con 5 pasos fijos que corresponden a los 5 estados.
- Dialog "Editar Estado": estado (con el bloqueo de "Cerrado" según rol), prioridad, progreso (slider) y notas internas. La fecha límite es un campo técnico: solo se presenta en el detalle administrativo y requiere SysAdmin + llave.
- Reproductor `<audio>` nativo si el ticket tiene `audio_url`.
- Timeline de seguimientos + textarea para agregar uno nuevo (el `autor` no se manda desde acá — lo pone el backend). La línea distingue cambios de estado, prioridad, asignación y campos editados. Los tickets creados por webhook con empresa real comienzan con una entrada de `Sistema` que registra el origen Serin; el backend garantiza que quede primera ordenando por fecha e ID.
- **Fecha límite**: si el usuario no tocó el control, el campo no se reenvía en el `PATCH` (preserva segundos/milisegundos originales que `datetime-local` no puede representar). Si el control queda vacío pero antes tenía valor, se bloquea el guardado con un toast — el contrato actual no permite null-ear `fecha_limite`.
- En `/admin/tickets/:id`, `adminMode` espera que `useAdminElevation` confirme el grant, agrega `incluir_vacios=true` y envía `x-admin-intent: 1`; así permite abrir/corregir un registro en cuarentena y volver a Administración. Mientras la elevación está ausente, pendiente o vencida no monta consultas protegidas.
- Los dos editores congelan el `Ticket.version` junto con sus valores al abrir y envían `expected_version` con un PATCH mínimo. Ante `409 TICKET_VERSION_CONFLICT` conservan el draft visible, bloquean Guardar y solo lo reemplazan cuando la persona elige explícitamente cargar la versión actual. Si la recarga falla, nada escrito se descarta.

### `Admin.tsx` (ruta `/admin`, solo SysAdmin)

Tres tabs:

- **Registros**: tabla CRUD completa (busca, pagina, crea, edita, elimina cualquier ticket) — es la única vía de alta manual del sistema (`POST /api/admin/tickets`).
- La tabla de Registros muestra ID, fecha/hora, conversation ID, contacto (con teléfono/email), empresa, categoría/motivo, estado, prioridad, asignado y vencimiento. Todas las columnas de datos son ordenables en el servidor; la tabla usa scroll horizontal controlado y mantiene las acciones visibles. Además de editar/eliminar, cada fila se puede abrir en el detalle administrativo, incluidos los registros en cuarentena.
- La edición captura un baseline versionado, omite `conversation_id` y envía solo diferencias. Un conflicto conserva el formulario hasta que el SysAdmin confirma la carga de la revisión actual; las respuestas de mutaciones nunca reemplazan en caché una versión más nueva recibida por SSE/refetch.
- **Importar CSV**: al elegir un archivo corre automáticamente un `dry_run` y muestra el resumen (columnas detectadas, a insertar/ya existentes/inválidos) antes de escribir nada; botón para confirmar la importación real.
- **Zona peligrosa**: truncate de toda la base, con doble seguro — hay que tipear literalmente `BORRAR` para habilitar el botón, y el backend además exige `{ confirmar: true }`.

Usa `AdminHeader` (compartido con `AdminRolesUsers.tsx`) para crear o revocar la elevación y navegar entre las pantallas de administración. Cuando no hay grant, la clave se ingresa enmascarada y puede revelarse; al enviar, el componente vacía el input y lo retira del DOM antes de iniciar `POST /api/auth/admin-elevation` con `{ admin_key }`. La credencial no entra en React Query ni en almacenamiento web. El estado confirmado muestra el vencimiento y un botón **Revocar acceso**; queries y mutaciones posteriores contienen solo `x-admin-intent: 1`.

`main.tsx` elimina de forma preventiva las claves legadas `admin-key` y `admin-key:user:*` de `localStorage` y `sessionStorage` antes de montar React. Solo enumera y elimina nombres: nunca lee ni migra el valor anterior. Esta compatibilidad de limpieza no vuelve a convertir el almacenamiento del navegador en parte del diseño vigente.

### `AdminRolesUsers.tsx` (ruta `/admin/roles-usuarios`, solo SysAdmin)

Dos tabs, cada uno con su propia paginación/búsqueda/filtros:

- **Usuarios**: alta/edición (nombre, apellido, **nombre de usuario**, email, rol, activo), activación/desactivación con `Switch` (nunca borrado físico). El backend rechaza roles inactivos y evita desactivar o degradar al último SysAdmin con credenciales utilizables. **Al crear** un usuario, el formulario pide además contraseña + repetir y aplica la política compartida (16–128 caracteres, sin controles ni espacios exteriores, y sin valores predecibles conocidos; admite frases con espacios interiores). El SysAdmin define las credenciales ahí mismo y se las entrega a la persona; esos campos no aparecen al editar un usuario existente. Cambiar la contraseña de alguien que ya existe se hace con la **llavesita de reset** (ícono ámbar), con la misma política, y al guardar revoca las sesiones activas de ese usuario en el backend. Todos los campos de contraseña usan `PasswordInput`: permanecen ocultos por defecto y tienen un ojo accesible para mostrar/ocultar.
- **Roles**: alta/edición/activación y borrado con confirmación para perfiles personalizados. `SysAdmin`, `Administrador` y `Operador` muestran bloqueados los controles de nombre, estado y borrado porque son identidades reservadas; su descripción sí se puede editar. Desactivar un rol personalizado invalida el acceso de sus usuarios.

## Actualización en vivo (SSE)

`useEventosEnVivo()`, definido dentro de `AppLayout.tsx` y llamado una vez desde `AppLayout` (por eso corre para toda la sesión de la app, no por página):

```ts
const es = new EventSource('/api/events');
es.onmessage = (e) => {
  const data = parseRealtimeEvent(e.data);
  if (!data) return;

  if (isSessionRevokedEvent(data)) {
    es.close();
    clearRevokedSessionState(queryClient);
    publishSessionTransition(import.meta.env.BASE_URL);
    navigate('/', { replace: true });
    return;
  }

  void invalidateTicketDomainQueries(queryClient); // solo tickets y dashboard
  if (data.tipo === 'ticket_creado') {
    showToast({ variant: 'info', title: 'Nuevo llamado recibido', ... });
  }
  if (data.tipo === 'tickets_importados') {
    showToast({ variant: 'info', title: 'Importación disponible', ... });
  }
};
```

El payload se trata como entrada no confiable: JSON inválido, eventos sin tipo y campos con tipos inesperados se descartan sin romper el listener. Los eventos funcionales invalidan únicamente `/api/tickets` y `/api/dashboard`; la caché de sesión, estado de elevación administrativa, usuarios y roles permanece vigente.

`sesion_revocada` es terminal: cierra el stream para impedir reconexiones con una cookie revocada, purga el estado cliente, sincroniza las demás pestañas y vuelve a `/` para revalidar la sesión. Para el resto no hay reconexión manual — `EventSource` la maneja sola usando el `retry: 5000` que manda el servidor. La conexión se abre solo dentro del `AuthGate` (o sea, solo con sesión activa), y se cierra en el cleanup del `useEffect`.

## Cliente de la API

Todo `lib/api-client-react` y `lib/api-zod` se **genera** con Orval a partir de `lib/api-spec/openapi.yaml` — nunca se edita a mano. Cada operación del contrato produce un hook (`useListTickets`, `useCreateAdminTicket`, `useGetMe`, etc.) más su `QueryKey` helper (`getGetMeQueryKey()`) para poder referenciar la misma key desde otro lado (invalidación, seteo manual de caché).

Los hooks aceptan una opción `request` para mandar headers extra por llamada. Tras confirmar el grant server-side, `useAdminElevation` expone exclusivamente la intención fija no secreta:

```ts
const { state, adminRequest } = useAdminElevation();
// state === "ready" → { headers: { "x-admin-intent": "1" } }
useCreateAdminTicket({ request: adminRequest });
```

La clave cruda solo existe como valor del input y argumento local durante el POST directo; no forma parte de `adminRequest`, queries, mutation cache, URLs ni storage. El backend persiste un fingerprint por sesión y el frontend consulta solamente `{ active, expires_at }`. Al cerrar sesión, el sidebar limpia el caché y recarga la entrada raíz mediante `window.location.replace(import.meta.env.BASE_URL)`. No existe una ruta `/login`: el formulario vive en `/`; el Dashboard vive en `/dashboard`.

El transporte real (`customFetch`) vive en `lib/api-client-react/src/custom-fetch.ts`: parsea JSON/texto según `content-type`, arma `ApiError` con `status` y el body de error, y no hace throw en respuestas sin body (204).

## Pruebas

`pnpm --filter @workspace/frontend test` ejecuta las unitarias con `node:test` y los componentes con Testing Library/JSDOM. Las pruebas de componentes incluyen verificaciones con axe-core; ESLint aplica además `jsx-a11y` a las fuentes del frontend.

La suite de navegador vive en [`../e2e/`](../e2e/) y se ejecuta desde la raíz con `pnpm run test:e2e` o `pnpm run test:e2e:headed`. Playwright levanta un backend real y Vite en puertos exclusivos, crea una base SQLite temporal, aplica dos veces la cadena real de migraciones para comprobar idempotencia y corre cuatro flujos seriales en Chromium: primer ingreso/cambio obligatorio, ingesta y SSE, elevación/RBAC/revocación, y cuarentena/conflicto/exportación. Verifica también que el secreto administrativo solo aparezca en el body del POST de elevación y no quede en headers, URLs ni storage.

Antes de la primera corrida local se instala el navegador con `pnpm --filter @workspace/e2e exec playwright install chromium`. Las trazas, screenshots y videos retenidos ante fallos quedan bajo `e2e/artifacts/`, ignorado por Git; en CI se agrega allí el reporte HTML. En GitHub, el job `e2e` depende del job `quality`, instala Chromium con sus dependencias y ejecuta esta suite como segunda etapa bloqueante del workflow Quality para pull requests. Deploy es un workflow separado; ante un fallo de navegador, Quality publica `playwright-diagnostics` durante 7 días.

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
- **`motivos.ts`** — espejo visual del catálogo de `lib/ingesta/src/motivos.ts`, con estilos (`color`, `badgeClass`). Incluye `legales` y la nueva categoría `embargos`; `getMotivoCategoriaConfig(categoria)` devuelve un fallback razonable si llega una categoría todavía desconocida.
- **`ticket-edit.ts`** — define formularios y change-sets mínimos para datos funcionales y gestión, y traduce los nombres técnicos del historial a etiquetas legibles.
- **`ticket-version.ts`** — congela baseline + versión, agrega `expected_version` solo a cambios reales y evita degradar la caché con una respuesta más antigua.
- **`ticket-list-controls.ts`** — mantiene en un solo lugar los parámetros de filtros/orden que comparten la consulta paginada y el export CSV.
- **`utils-tickets.tsx`** — `EstadoBadge`/`PrioridadBadge` (los puntos de color + texto que aparecen en todas las tablas), `formatDate` (formato `es-AR`), `isVencido` (fecha límite pasada y el ticket no está resuelto/cerrado).
- **`datetime-local.ts`** — `toDateTimeLocalValue`/`dateTimeLocalValueToIso`: convierten entre un ISO string y el formato que espera `<input type="datetime-local">`, **en la zona horaria del navegador** (no UTC). `dateTimeLocalValueToIso` rechaza (devuelve `null`) fechas imposibles o horas inexistentes por cambio de horario de verano, en vez de dejar que `Date` las normalice silenciosamente.

## Estilos y componentes UI

Tailwind 4 + shadcn/ui: `src/components/ui/` conserva únicamente las 20 primitivas que usa la aplicación: `alert-dialog`, `alert`, `badge`, `button`, `card`, `dialog`, `input`, `label`, `password-input`, `progress`, `select`, `skeleton`, `slider`, `switch`, `table`, `tabs`, `textarea`, `toast`, `toaster` y `tooltip`. Son código generado/copiado (no una dependencia de node_modules), así que se editan directamente cuando hace falta un ajuste y una primitiva eliminada puede volver a incorporarse mediante la configuración de `components.json`. `cn()` (en `lib/utils.ts`) combina `clsx` + `tailwind-merge` para componer clases condicionalmente sin conflictos de especificidad. Los badges de estado/prioridad/categoría de motivo son los únicos elementos de color con significado semántico fijo en todo el sistema — si se agrega un estado o categoría nueva, hay que agregar su color en `utils-tickets.tsx` / `lib/motivos.ts` respectivamente.
