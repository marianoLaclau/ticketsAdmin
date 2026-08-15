# Frontend — GSB Tickets

React + Vite. Consume la API propia del backend por `/api/*` en el mismo origen (proxeado en dev, servido detrás de nginx en producción — ver `nginx.conf`), por lo que el navegador no necesita CORS. El asistente de Rendimiento también usa un proxy same-origin: únicamente el backend se comunica con el Chat Trigger externo. No hay estado global tipo Redux/Zustand: **TanStack Query es la fuente de verdad del servidor**, y `useState` local para lo que es puramente de UI (formularios abiertos, filtros no aplicados aún, etc.).

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
- **`@n8n/chat`** para el asistente flotante y diferido de Rendimiento.
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
      Rendimiento.tsx                → shell ejecutivo protegido con cuatro vistas operativas
      TicketList.tsx                 → listado con filtros, orden y paginación
      TicketDetail.tsx                → detalle, edición, seguimientos, audio
      Admin.tsx                        → panel: CRUD de tickets, import CSV, truncate
      AdminRolesUsers.tsx                → gestión de roles y usuarios
      not-found.tsx                       → 404
    features/
      auth/                       → AuthGate, guards SysAdmin/Rendimiento y sesión protegida
      admin-directory/            → CRUD y fronteras de roles/usuarios (incluye admin-directory-url.ts)
      admin-tickets/              → CRUD, importación y zona peligrosa (incluye admin-ticket-form.ts)
      dashboard/                  → paneles y selección temporal (incluye dashboard-period.ts, dashboard-url.ts)
      rendimiento/                → vistas, filtros y chat de rendimiento (incluye rendimiento-url.ts)
      ticket-detail/              → controladores y diálogos del detalle (incluye ticket-edit.ts, datetime-local.ts)
      ticket-list/                → filtros, orden, filas y accesibilidad del listado
    components/
      layout/AppLayout.tsx        → Sidebar + listener de eventos en vivo
      admin/AdminHeader.tsx        → título y navegación entre pantallas admin
      SortableTableHead.tsx         → encabezado accesible para orden server-side
      tickets/TicketVersionConflictAlert.tsx → aviso de conflicto de versión (compartido por dos features)
      ui/                            → 20 primitivas shadcn/ui efectivamente usadas
    hooks/
      use-admin-operation-guard.ts → descarta respuestas de un componente ya desmontado
      use-toast.ts                   → sistema de notificaciones
    lib/                             → solo lo transversal: si algo lo usa una sola feature, vive en features/
      roles.ts                       → roles y capacidades visibles (espejo del backend)
      password-change.ts               → decisión de ruta y validación pura del cambio obligatorio
      session-state.ts                   → revalidación y aislamiento de caché entre identidades
      motivos.ts                      → catálogo de categorías de motivo + estilos de badge
      ticket-version.ts                → change-sets y conflictos de versión (ticket-detail + admin-tickets)
      ticket-list-controls.ts           → parámetros compartidos por listado y exportación
      calendar-date.ts                  → validación de fechas calendario (dashboard, rendimiento, listado)
      utils-tickets.tsx                → badges de Estado/Prioridad, formatDate, isVencido
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
- **`AuthGate`** protege `/cambiar-contrasena`, `/dashboard`, `/tickets`, `/rendimiento` y `/admin`. Llama a `useGetMe()` (`GET /api/auth/me`), muestra un spinner mientras verifica y, ante un `401`, normaliza la URL a `/`. Una credencial temporal solo puede renderizar `ChangePassword`, fuera de `AppLayout`; una cuenta ya regularizada no puede volver a esa pantalla. Un fallo de red o del backend muestra una pantalla de error con opción de reintentar, no un login engañoso.
- **`SysAdminRouteGuard`** envuelve `/admin`, `/admin/roles-usuarios` y `/admin/tickets/:id`: si `me.rol !== 'SysAdmin'`, muestra una pantalla `403 Acceso denegado`.
- **`RendimientoRouteGuard`** envuelve `/rendimiento` y permite únicamente SysAdmin o Controller mediante `puedeVerRendimiento()`. El backend valida ambas fronteras de forma independiente; los guards visuales no son la única defensa.
- **Login**: tras autenticar, actualiza el caché de `/auth/me` y navega a `/cambiar-contrasena` o `/dashboard` con la misma función pura y `replace`.
- **Cambio obligatorio**: solicita contraseña temporal, nueva y repetición, aplica la política compartida en cliente y usa `POST /api/auth/password`. Un éxito reemplaza el usuario cacheado —incluido el flag— y continúa al dashboard; cerrar sesión sigue disponible. El guard del backend es la autoridad y evita un bypass mediante URL o llamadas directas.
- **Logout**: tras el `204`, `queryClient.clear()` elimina los datos de la sesión y hace una recarga limpia en `/`. La recarga fuerza una nueva verificación de la cookie ya eliminada y evita que un observer conserve momentáneamente al usuario anterior.

## Roles en la UI

Espejo de `backend/src/modules/auth/domain/rbac.ts`, en `frontend/src/lib/roles.ts`:

```ts
export const ROL_SYSADMIN = "SysAdmin";
export const ROL_CONTROLLER = "Controller";
export const ROL_ADMINISTRADOR = "Administrador";
export const ROL_OPERADOR = "Operador";
export function puedeCerrarTickets(rol) {
  return rol === ROL_SYSADMIN || rol === ROL_ADMINISTRADOR;
}
export function puedeGestionarTickets(rol) {
  return Boolean(rol) && rol !== ROL_CONTROLLER;
}
export function puedeVerRendimiento(rol) {
  return rol === ROL_SYSADMIN || rol === ROL_CONTROLLER;
}
```

Las restricciones visibles principales son:

1. **Sidebar** (`components/layout/Sidebar.tsx`): "Rendimiento" aparece solo para SysAdmin/Controller y "Administración" solo para SysAdmin.
2. **Controller de solo lectura**: puede navegar Dashboard, Tickets, detalles y Rendimiento, pero el detalle no monta "Editar Estado", el lápiz de contacto ni el formulario de seguimiento. El backend bloquea además `PATCH`, `DELETE` y altas de seguimiento con `requireTicketWriteAccess`.
3. **Cierre**: para los roles que pueden gestionar, la opción "CERRADO" queda deshabilitada cuando `puedeCerrarTickets(me?.rol)` es falsa; solo SysAdmin y Administrador pueden cerrar.
4. **Edición funcional**: SysAdmin, Administrador, Operador y roles personalizados operativos pueden completar o corregir contacto, empresa, motivo y resumen. Los campos técnicos siguen reservados al modo administrativo SysAdmin.

En todos los casos la restricción visual es **solo UX** — la fuente de verdad es el backend (`403`/`404` según corresponda); si la UI falla, el servidor rechaza igualmente una operación no autorizada.

## Páginas

### `Dashboard.tsx` (ruta `/dashboard`)

KPIs (sin revisar, en proceso, vencidos, resueltos), distribución por estado (barra segmentada), gauge de tasa de resolución, ranking de motivos (usa `getMotivoCategoriaConfig` de `lib/motivos.ts` para color y label), gráfico de barras por prioridad (Recharts), tabla de vencidos y feed de actividad reciente. El selector **Todo / Semana actual / Mes actual / Período personalizado** envía el mismo rango a los hooks `useGetDashboardStats`, `useGetActividadReciente`, `useGetTicketsVencidos` y `useGetMotivoStats`; el rango personalizado se aplica recién al confirmar fechas válidas. Todos los paneles de tickets usan el mismo conjunto analizado por fecha de creación; actividad usa la fecha real de cada evento. Dentro de un conjunto analizado, “Resueltos” cuenta los que actualmente están resueltos o cerrados. `Todo` conserva el comportamiento histórico y “Resueltos hoy”.

### `Rendimiento.tsx` (ruta `/rendimiento`, SysAdmin y Controller)

Shell ejecutivo lazy-loaded con encabezado y cuatro tabs responsive: **Resumen equipo**, **Operadores**, **Contactos recurrentes** y **Calidad de datos**. Comparten filtros canonizados en URL —incluido **Período completo**— y muestran datos reales con muestras y estados explícitos de carga, error o ausencia de datos. Resumen equipo presenta cumplimiento total del plazo, backlog vencido, antigüedad mediana hábil y cobertura de asignación junto con sus numeradores o muestras. Un denominador vacío se representa como **Sin muestra**, no como 0 %. Los indicadores de backlog corresponden al estado actual de los tickets creados dentro del período filtrado y no incluyen backlog creado fuera del rango.

**Operadores** muestra volumen, tiempo hasta finalizar, cumplimiento total del plazo y carga actual. La quinta tarjeta es **Rendimiento operativo**: `operator-performance.ts` deriva en el navegador un índice de 0 a 100 con 70 % de cumplimiento total del plazo y 30 % de carga abierta asignada que todavía no venció. Desde 80 puntos usa estado favorable; por debajo requiere atención. Con menos de cinco cierres medibles conserva el valor pero lo presenta como **Muestra inicial** neutral, y sin cierres con plazo devuelve **Sin muestra**. No ordena por ese valor ni establece posiciones: la lista permanece alfabética y el índice no es un ranking. El backend entrega únicamente los hechos de cumplimiento y carga; no devuelve el índice ni su clasificación visual. La UI no presenta una tarjeta de reaperturas. El contrato conserva ese dato y las fuentes técnicas por separado para trazabilidad, pero no forman parte del índice ni se exponen como leyendas en la vista simplificada.

La lista muestra inicialmente tres operadores y permite desplegar o contraer el resto; al ampliarse queda contenida en un área con `max-height: 680px` y scroll propio. **Contactos recurrentes** presenta primero tres contactos con un resumen compacto: nombre de referencia, coincidencia enmascarada, cantidad de llamados, abiertos, vencidos, prioridad máxima, último llamado y responsable actual. **Ver detalles** despliega la fecha del primer contacto, la antigüedad del abierto, responsables y tickets relacionados; dentro de cada contacto se muestran inicialmente tres tickets y se puede abrir el resto. Al desplegar más contactos, la lista también usa un máximo de 680 px con scroll, sin perder la paginación del servidor. La ruta usa `RendimientoRouteGuard`, y el sidebar solo ofrece el acceso cuando `puedeVerRendimiento(me?.rol)` es verdadero.

El backend expone `GET /api/rendimiento` con `estado: "operativo"` y endpoints independientes para las cuatro vistas, todos protegidos para SysAdmin/Controller y con caché deshabilitada.

#### Asistente n8n de Rendimiento

El asistente flotante existe **solo dentro de `/rendimiento`**, por lo que conserva exactamente la misma frontera visual de roles: SysAdmin y Controller. La aplicación aporta su propio botón accesible y su propio panel; `@n8n/chat` no se descarga al entrar en la ruta, sino recién con el primer clic que abre el asistente. En ese momento se monta en modo `fullscreen` dentro de un `target` explícito del panel —nunca directamente sobre `body`— y se desmonta, junto con su contenido, al salir de Rendimiento.

La integración usa un UUID v4 explícito bajo `sessionStorage["gsb_rag_chat_session_id"]`. Se crea al abrir por primera vez y se reutiliza en todos los mensajes y al volver a la vista dentro de la misma pestaña; no sobrevive al cierre de la pestaña. **Nueva conversación** lo reemplaza por otro UUID y remonta el chat. `loadPreviousSession: false` impide que `@n8n/chat` restaure su clave global histórica, y al cerrar sesión se purgan ambas claves para que otra identidad no herede el hilo. El body enviado se limita exactamente a `sessionId`, `action: "sendMessage"` y `chatInput`; no incluye PII. Tampoco usa `WEBHOOK_API_KEY`: esa clave pertenece exclusivamente al webhook servidor-a-servidor de ingreso de tickets y nunca debe llegar al bundle del navegador.

El navegador envía cada mensaje a `/api/rendimiento/asistente/chat`. Esa ruta conserva la sesión y el guard SysAdmin/Controller, valida el contrato y el tamaño y agrega el Basic Auth únicamente del lado servidor; no persiste el UUID ni lo reemplaza. Se configura en el `.env` raíz mediante:

- `N8N_CHAT_WEBHOOK_URL`;
- `N8N_CHAT_BASIC_AUTH_USER`;
- `N8N_CHAT_BASIC_AUTH_PASSWORD`;
- `N8N_CHAT_TIMEOUT_MS` (opcional, 120 segundos por defecto).

Las credenciales nunca se incluyen en Vite, el bundle ni Network del navegador. Si la configuración falta o es inválida, solo el asistente responde con indisponibilidad controlada; Rendimiento y el resto de la aplicación continúan operativos. La llamada desde el backend no depende de CORS.

### `TicketList.tsx`

El listado principal (ruta `/tickets`). Filtros: búsqueda libre, estado, prioridad, **categoría de motivo** (`MOTIVO_CATEGORIA_OPTIONS`, incluida `Embargos`), rango de fechas, rango de horas, empresa y switch de "Vencidos". Cada control conserva un prefijo visible (`Estado:`, `Prioridad:`, `Categoría:`, `Fecha:`, `Hora:`, `Empresa:` y `Plazo:`), de modo que los valores default `Todos/Todas` nunca quedan sin contexto. En escritorio usa tres filas estables: búsqueda amplia con estado y prioridad; categoría con fecha y hora; empresa con plazo, exportación y limpiar. En resoluciones menores cada grupo se apila sin depender de cortes automáticos. La columna Contacto presenta nombre y empresa; debajo de una empresa real muestra `Activo` o `Inactivo` cuando `estado_empleado` fue informado. Los valores vacíos y los marcadores `Sin empresa asignada/asociada` conservan la presentación anterior sin una línea de estado. Si nombre y apellido están vacíos usa `Sin nombre proporcionado` sin alterar el registro recibido.

Todos los encabezados de datos son ordenables mediante `SortableTableHead`: un clic selecciona o invierte el criterio principal y `Shift + clic` agrega criterios secundarios numerados. El frontend envía `sort` y conserva `sort_by`/`order` por compatibilidad; el backend ordena el conjunto completo antes de paginar. `Restablecer orden` vuelve a fecha de llegada descendente. La paginación conserva tamaños 10/25/50/100 y vuelve a la página 1 al cambiar filtros u orden.

El botón **Exportar CSV**, junto a los filtros de plazo, conserva filtros y orden activos pero no la paginación: descarga todos los tickets operativos coincidentes. Mientras se genera bloquea dobles clics y comunica éxito/error con los toasts de la aplicación.

### `TicketDetail.tsx` (rutas `/tickets/:id` y `/admin/tickets/:id`)

- Header con motivo, badge de vencido, fecha de creación, asignado.
- Datos del contacto con filas fijas de teléfono y email. Cada una muestra el valor cuando existe o `Teléfono no proporcionado` / `Email no proporcionado` cuando el llamante no lo indicó; nombre también mantiene su fallback visual. Si hay empresa y estado laboral, presenta `Activo` o `Inactivo` debajo de la empresa.
- Botón con lápiz **Editar datos**: abre `TicketDataEditDialog` para nombre, apellido, teléfono, DNI/CUIT, empresa, email, motivo y resumen. Genera un PATCH mínimo, normaliza opcionales vacíos a `null` y recalcula la categoría al cambiar motivo/resumen. Al corregir DNI o empresa, el backend invalida el estado laboral obtenido previamente desde Serin para evitar asociarlo a datos distintos. La interfaz avisa que cada corrección quedará registrada.
- Tracker visual de progreso (0–100%) con 5 pasos fijos que corresponden a los 5 estados.
- Dialog "Editar Estado": estado (con el bloqueo de "Cerrado" según rol), prioridad, progreso (slider) y notas internas. La fecha límite es un campo técnico: solo se presenta en el detalle administrativo y requiere SysAdmin.
- Reproductor `<audio>` nativo si el ticket tiene `audio_url`.
- Timeline de seguimientos + textarea para agregar uno nuevo (el `autor` no se manda desde acá — lo pone el backend). La línea distingue cambios de estado, prioridad, asignación y campos editados. Los tickets creados por webhook con empresa real comienzan con una entrada de `Sistema` que registra el origen Serin; el backend garantiza que quede primera ordenando por fecha e ID.
- **Fecha límite**: si el usuario no tocó el control, el campo no se reenvía en el `PATCH` (preserva segundos/milisegundos originales que `datetime-local` no puede representar). Si el control queda vacío pero antes tenía valor, se bloquea el guardado con un toast — el contrato actual no permite null-ear `fecha_limite`.
- En `/admin/tickets/:id`, `adminMode` habilita la vista administrativa: permite abrir registros en cuarentena y editar los campos técnicos. El backend exige rol SysAdmin en cada una de esas operaciones.
- Los dos editores congelan el `Ticket.version` junto con sus valores al abrir y envían `expected_version` con un PATCH mínimo. Ante `409 TICKET_VERSION_CONFLICT` conservan el draft visible, bloquean Guardar y solo lo reemplazan cuando la persona elige explícitamente cargar la versión actual. Si la recarga falla, nada escrito se descarta.

### `Admin.tsx` (ruta `/admin`, solo SysAdmin)

Tres tabs:

- **Registros**: tabla CRUD completa (busca, pagina, crea, edita, elimina cualquier ticket) — es la única vía de alta manual del sistema (`POST /api/admin/tickets`).
- La tabla de Registros muestra ID, fecha/hora, conversation ID, contacto (con teléfono/email), empresa, categoría/motivo, estado, prioridad, asignado y vencimiento. Todas las columnas de datos son ordenables en el servidor; la tabla usa scroll horizontal controlado y mantiene las acciones visibles. Además de editar/eliminar, cada fila se puede abrir en el detalle administrativo, incluidos los registros en cuarentena.
- La edición captura un baseline versionado, omite `conversation_id` y envía solo diferencias. Un conflicto conserva el formulario hasta que el SysAdmin confirma la carga de la revisión actual; las respuestas de mutaciones nunca reemplazan en caché una versión más nueva recibida por SSE/refetch.
- **Importar CSV**: al elegir un archivo corre automáticamente un `dry_run` y muestra el resumen (columnas detectadas, a insertar/ya existentes/inválidos) antes de escribir nada; botón para confirmar la importación real.
- **Zona peligrosa**: truncate de toda la base, con doble seguro — hay que tipear literalmente `BORRAR` para habilitar el botón, y el backend además exige `{ confirmar: true }`.

Usa `AdminHeader` (compartido con `AdminRolesUsers.tsx`) para el título y la navegación entre pantallas administrativas. La sesión SysAdmin es la única frontera vigente del panel; el backend vuelve a comprobarla en cada operación y no existe una elevación administrativa adicional.

`main.tsx` elimina de forma preventiva las claves legadas `admin-key` y `admin-key:user:*` de `localStorage` y `sessionStorage` antes de montar React. Solo enumera y elimina nombres: nunca lee ni migra el valor anterior. Esta compatibilidad de limpieza no vuelve a convertir el almacenamiento del navegador en parte del diseño vigente.

### `AdminRolesUsers.tsx` (ruta `/admin/roles-usuarios`, solo SysAdmin)

Dos tabs, cada uno con su propia paginación/búsqueda/filtros:

- **Usuarios**: alta/edición (nombre, apellido, **nombre de usuario**, email, rol, activo), activación/desactivación con `Switch` y borrado físico con doble confirmación. El backend rechaza roles inactivos, no permite borrar la cuenta propia y evita desactivar, degradar o eliminar al último SysAdmin con credenciales utilizables. **Al crear** un usuario, el formulario pide además contraseña + repetir y aplica la política compartida (8–128 caracteres, sin controles ni espacios exteriores, y sin valores predecibles conocidos; admite frases con espacios interiores). El SysAdmin define las credenciales ahí mismo y se las entrega a la persona; esos campos no aparecen al editar un usuario existente. Cambiar la contraseña de alguien que ya existe se hace con la **llavesita de reset** (ícono ámbar), con la misma política, y al guardar revoca las sesiones activas de ese usuario en el backend. Todos los campos de contraseña usan `PasswordInput`: permanecen ocultos por defecto y tienen un ojo accesible para mostrar/ocultar.
- **Roles**: alta/edición/activación y borrado con confirmación para perfiles personalizados. `SysAdmin`, `Controller`, `Administrador` y `Operador` muestran bloqueados los controles de nombre, estado y borrado porque son identidades reservadas; su descripción sí se puede editar. Desactivar un rol personalizado invalida el acceso de sus usuarios.

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

El payload se trata como entrada no confiable: JSON inválido, eventos sin tipo y campos con tipos inesperados se descartan sin romper el listener. Los eventos funcionales invalidan únicamente `/api/tickets` y `/api/dashboard`; la caché de sesión, usuarios y roles permanece vigente.

`sesion_revocada` es terminal: cierra el stream para impedir reconexiones con una cookie revocada, purga el estado cliente, sincroniza las demás pestañas y vuelve a `/` para revalidar la sesión. Para el resto no hay reconexión manual — `EventSource` la maneja sola usando el `retry: 5000` que manda el servidor. La conexión se abre solo dentro del `AuthGate` (o sea, solo con sesión activa), y se cierra en el cleanup del `useEffect`.

## Cliente de la API

Todo `lib/api-client-react` y `lib/api-zod` se **genera** con Orval a partir de `lib/api-spec/openapi.yaml` — nunca se edita a mano. Cada operación del contrato produce un hook (`useListTickets`, `useCreateAdminTicket`, `useGetMe`, etc.) más su `QueryKey` helper (`getGetMeQueryKey()`) para poder referenciar la misma key desde otro lado (invalidación, seteo manual de caché).

Los hooks aceptan una opción `request` para mandar headers extra por llamada. Las operaciones administrativas no necesitan una segunda credencial: la cookie de sesión identifica al SysAdmin y el backend autoriza el rol.

Al cerrar sesión, el sidebar limpia el caché y recarga la entrada raíz mediante `window.location.replace(import.meta.env.BASE_URL)`. No existe una ruta `/login`: el formulario vive en `/`; el Dashboard vive en `/dashboard`.

El transporte real (`customFetch`) vive en `lib/api-client-react/src/custom-fetch.ts`: parsea JSON/texto según `content-type`, arma `ApiError` con `status` y el body de error, y no hace throw en respuestas sin body (204).

## Pruebas

`pnpm --filter @workspace/frontend test` ejecuta las unitarias con `node:test` y los componentes con Testing Library/JSDOM. Las pruebas de componentes incluyen verificaciones con axe-core; ESLint aplica además `jsx-a11y` a las fuentes del frontend.

La suite de navegador vive en [`../e2e/`](../e2e/) y se ejecuta desde la raíz con `pnpm run test:e2e` o `pnpm run test:e2e:headed`. Playwright levanta un backend real y Vite en puertos exclusivos, crea una base SQLite temporal, aplica dos veces la cadena real de migraciones para comprobar idempotencia y corre cuatro flujos seriales en Chromium: primer ingreso/cambio obligatorio, ingesta y SSE, RBAC/revocación, y cuarentena/conflicto/exportación.

Antes de la primera corrida local se instala el navegador con `pnpm --filter @workspace/e2e exec playwright install chromium`. Las trazas, screenshots y videos retenidos ante fallos quedan bajo `e2e/artifacts/`, ignorado por Git; en CI se agrega allí el reporte HTML. En GitHub, el job `e2e` depende del job `quality`, instala Chromium con sus dependencias y ejecuta esta suite como segunda etapa bloqueante del workflow Quality para pull requests. Deploy es un workflow separado; ante un fallo de navegador, Quality publica `playwright-diagnostics` durante 7 días.

## Pantallas de error

`components/ErrorPage.tsx` centraliza mensajes en español para `401`, `403`, `404`, `409`, `500`, `503` y errores de conexión. Siempre ofrece **Volver al inicio** (al Dashboard para errores dentro de una sesión; a la raíz durante la verificación de acceso) y, cuando el error puede recuperarse, **Reintentar**. Se usa en el guard de sesión, permisos SysAdmin, rutas inexistentes, Dashboard, listado, detalle y Administración. `AppErrorBoundary` cubre además errores inesperados de renderizado.

`GET /api/events` es la única excepción — vive fuera del contrato OpenAPI (es un stream, no un request/response), por eso se consume con `EventSource` nativo en vez de un hook generado.

## Sistema de notificaciones (toasts)

`hooks/use-toast.ts` + `components/ui/toast.tsx`. Cinco variantes visuales: `default`, `success`, `info`, `warning`, `destructive`. Soporta `dedupeKey`: si ya hay un toast abierto con la misma key, no se duplica — se usa para evitar que la invalidación disparada por SSE y la propia mutación del usuario (que hizo la acción) muestren dos toasts para el mismo evento (ej. `ticket-created:${id}`, `tickets-imported:${cantidad}`). Los errores pasan por `lib/error-messages.ts`: se traducen por estado y por casos de negocio conocidos, y nunca se muestra al usuario el `Error.message` técnico con HTTP, URL, JSON, HTML o detalles internos de validación.

## Librerías propias (`src/lib`)

`src/lib` guarda **solo lo transversal**: código que consumen dos o más features, o la aplicación entera. Si una utilidad la usa una sola feature, vive dentro de esa feature (`src/features/<nombre>/`), no acá. Una regla de ESLint (`frontendFeatureBoundaryConfigs` en `eslint.config.mjs`, espejo de la del backend) impide que una feature importe archivos de otra: lo que necesiten compartir tiene que subir a `src/lib`. `pages/` y `components/` quedan fuera de esa restricción y pueden componer cualquier feature.

- **`roles.ts`** — ver [Roles en la UI](#roles-en-la-ui).
- **`error-messages.ts`** — mensajes seguros para login, administración y mutaciones; solo inspecciona campos estructurados del error y aplica traducciones conocidas.
- **`calendar-date.ts`** — validación de fechas calendario `YYYY-MM-DD`; la comparten los parseos de URL de dashboard, rendimiento y listado.
- **`asignacion.ts`** — normalización visual del responsable y fallback `Sin asignar`.
- **`motivos.ts`** — espejo visual del catálogo de `lib/ingesta/src/motivos.ts`, con estilos (`color`, `badgeClass`). Incluye `legales` y la nueva categoría `embargos`; `getMotivoCategoriaConfig(categoria)` devuelve un fallback razonable si llega una categoría todavía desconocida.
- **`ticket-version.ts`** — congela baseline + versión, agrega `expected_version` solo a cambios reales y evita degradar la caché con una respuesta más antigua. Lo usan `ticket-detail` y `admin-tickets`.
- **`ticket-navigation.ts`** — estado de navegación para volver al listado correcto (público o admin) desde el detalle.
- **`ticket-list-controls.ts`** / **`ticket-list-url.ts`** — parámetros de filtros/orden y su serialización en la URL, compartidos por el listado público y el panel admin.
- **`utils-tickets.tsx`** — `EstadoBadge`/`PrioridadBadge` (los puntos de color + texto que aparecen en todas las tablas), `formatDate` (formato `es-AR`), `isVencido` (fecha límite pasada y el ticket no está resuelto/cerrado).

Lógica que vive dentro de su feature (ejemplos): `features/dashboard/dashboard-period.ts` y `dashboard-url.ts`, `features/rendimiento/rendimiento-url.ts`, `features/ticket-detail/ticket-edit.ts` y `datetime-local.ts`, `features/admin-tickets/admin-ticket-form.ts`, `features/admin-directory/admin-directory-url.ts`.

- **`features/ticket-detail/ticket-edit.ts`** — define formularios y change-sets mínimos para datos funcionales y gestión, y traduce los nombres técnicos del historial a etiquetas legibles.
- **`features/ticket-detail/datetime-local.ts`** — `toDateTimeLocalValue`/`dateTimeLocalValueToIso`: convierten entre un ISO string y el formato que espera `<input type="datetime-local">`, **en la zona horaria del navegador** (no UTC). `dateTimeLocalValueToIso` rechaza (devuelve `null`) fechas imposibles o horas inexistentes por cambio de horario de verano, en vez de dejar que `Date` las normalice silenciosamente.
- **`features/dashboard/dashboard-period.ts`** — rangos calendario de semana/mes, validación del período personalizado y etiquetas de presentación.

## Estilos y componentes UI

Tailwind 4 + shadcn/ui: `src/components/ui/` conserva únicamente las 20 primitivas que usa la aplicación: `alert-dialog`, `alert`, `badge`, `button`, `card`, `dialog`, `input`, `label`, `password-input`, `progress`, `select`, `skeleton`, `slider`, `switch`, `table`, `tabs`, `textarea`, `toast`, `toaster` y `tooltip`. Son código generado/copiado (no una dependencia de node_modules), así que se editan directamente cuando hace falta un ajuste y una primitiva eliminada puede volver a incorporarse mediante la configuración de `components.json`. `cn()` (en `lib/utils.ts`) combina `clsx` + `tailwind-merge` para componer clases condicionalmente sin conflictos de especificidad. Los badges de estado/prioridad/categoría de motivo son los únicos elementos de color con significado semántico fijo en todo el sistema — si se agrega un estado o categoría nueva, hay que agregar su color en `utils-tickets.tsx` / `lib/motivos.ts` respectivamente.
