# Bitácora de agentes

Registro de intervenciones realizadas por asistentes sobre el repositorio. Cada entrada debe indicar alcance, decisiones, archivos afectados y validaciones ejecutadas.

## 2026-08-07 — Formato completo del detalle de ticket

**Agente:** Codex
**Estado:** centésima décima remediación de la auditoría técnica, implementada localmente.

- Se normalizaron los siete componentes de `features/ticket-detail`; la página y toda su feature comparten ahora la configuración raíz de Prettier.
- Los fingerprints AST de los siete archivos permanecieron idénticos.
- Aprobaron las pruebas dirigidas 15/15, Prettier, ESLint, typecheck y `git diff --check`. No se hizo push.

## 2026-08-07 — Formato completo de tickets administrativos

**Agente:** Codex
**Estado:** centésima novena remediación de la auditoría técnica, implementada localmente.

- Se normalizaron los cuatro componentes pendientes de `features/admin-tickets`: paginación, confirmación de borrado, fila y formulario. La feature completa comparte ahora el formato raíz.
- Los fingerprints AST de los cuatro archivos permanecieron idénticos.
- Aprobaron la prueba dirigida 6/6, Prettier, ESLint, typecheck y `git diff --check`. No se hizo push.

## 2026-08-07 — Carga accesible en Dashboard

**Agente:** Codex
**Estado:** centésima octava remediación de la auditoría técnica, implementada localmente.

- Dashboard anuncia un único estado de carga mientras alguna de sus cuatro consultas iniciales muestra placeholders; la región desaparece al completar todas.
- Los refetches e invalidaciones SSE con datos existentes permanecen silenciosos, y las ramas de error sustituyen la carga sin locuciones simultáneas.
- Aprobaron las 90 pruebas frontend, Prettier, ESLint, typecheck, `git diff --check` y revisión cruzada sin hallazgos P0/P1/P2. No se hizo push.

## 2026-08-07 — Carga accesible en el detalle

**Agente:** Codex
**Estado:** centésima séptima remediación de la auditoría técnica, implementada localmente.

- La carga inicial del detalle anuncia una sola vez “Cargando detalle del ticket”; sus skeletons permanecen decorativos y no hay un ancestro `aria-busy` que difiera la locución.
- La condición usa exclusivamente la carga inicial, por lo que los refetches con datos visibles no reemplazan ni vuelven a anunciar la pantalla.
- Aprobaron Prettier, ESLint, typecheck, `git diff --check` y revisión cruzada sin hallazgos P0/P1/P2. No se hizo push.

## 2026-08-07 — Carga accesible en Tickets

**Agente:** Codex
**Estado:** centésima sexta remediación de la auditoría técnica, implementada localmente.

- La pantalla de Tickets anuncia una sola vez “Cargando llamados” cuando realmente muestra placeholders; los refetches con datos visibles no generan locuciones periódicas.
- El área estable de resultados alterna `aria-busy` y las diez filas skeleton quedan fuera del árbol accesible, manteniendo HTML de tabla válido.
- Aprobaron las 90 pruebas frontend, Prettier, ESLint, typecheck, `git diff --check` y revisión cruzada sin hallazgos P0/P1/P2. No se hizo push.

## 2026-08-07 — Estados de carga globales accesibles

**Agente:** Codex
**Estado:** centésima quinta remediación de la auditoría técnica, implementada localmente.

- Los skeletons son ahora decorativos de forma obligatoria y desactivan su pulso cuando el sistema solicita movimiento reducido.
- Se agregó un `LoadingStatus` reutilizable; la verificación de sesión conserva un único `<main>` y anuncia su estado, mientras el fallback de rutas protegidas mantiene una sola región `status` dentro del layout.
- Ambos spinners globales son decorativos y respetan movimiento reducido. Se evitó `aria-busy` en loaders efímeros para que los lectores no difieran un anuncio hasta después del desmontaje.
- Aprobaron las 90 pruebas frontend, Prettier, ESLint, typecheck, `git diff --check` y revisión cruzada sin hallazgos P0/P1/P2. No se hizo push.

## 2026-08-07 — Landmarks de error y rutas bajo subdirectorio

**Agente:** Codex
**Estado:** centésima cuarta remediación de la auditoría técnica, implementada localmente.

- `ErrorPage` conserva `<main>` cuando reemplaza toda la aplicación y usa una `<section>` nombrada cuando vive dentro de `AppLayout`, evitando landmarks anidados y el exceso de altura móvil.
- Los siete consumidores protegidos declaran explícitamente `embedded`; los errores de entrada pública, autenticación y boundary permanecen como página completa. El botón de reintento expone además `aria-busy`.
- Se centralizó la unión con `BASE_URL` y se corrigieron los retornos del detalle a Administración/Dashboard para despliegues bajo subruta; tres pruebas cubren raíz, barra final y path vacío.
- Aprobaron las 90 pruebas frontend, Prettier, ESLint, typecheck, build y revisión cruzada sin hallazgos P0/P1/P2. El build se ejecutó en una salida temporal porque el servidor local mantiene bloqueado `frontend/dist`. No se hizo push.

## 2026-08-07 — Formato de la página de tickets

**Agente:** Codex
**Estado:** centésima tercera remediación de la auditoría técnica, implementada localmente.

- Se normalizó `pages/TicketList.tsx` con la configuración raíz de Prettier antes de corregir sus landmarks y avanzar con filtros persistentes en URL.
- El fingerprint AST permaneció idéntico en sus 1.757 nodos normalizando únicamente la indentación no renderizada de `JSXText`.
- Aprobaron las 87 pruebas frontend, Prettier, ESLint, typecheck y `git diff --check`. No se hizo push.

## 2026-08-07 — Formato del límite de errores

**Agente:** Codex
**Estado:** centésima segunda remediación de la auditoría técnica, implementada localmente.

- Se normalizó `components/ErrorPage.tsx` con la configuración raíz de Prettier antes de corregir sus landmarks, manteniendo separado el cambio mecánico del semántico.
- El fingerprint AST permaneció idéntico en sus 671 nodos.
- Aprobaron las 87 pruebas frontend, Prettier, ESLint, typecheck y `git diff --check`. No se hizo push.

## 2026-08-07 — Caché coherente desde el detalle de ticket

**Agente:** Codex
**Estado:** centésima primera remediación de la auditoría técnica, implementada localmente.

- Las mutaciones de gestión, datos funcionales y seguimiento del ticket invalidan ahora el dominio completo tickets/dashboard mediante el helper común, sin depender de que el SSE llegue a tiempo.
- Se conservan la actualización optimista segura del detalle, el control de versión, los diálogos, borradores, errores y toasts; sesión, llave administrativa, usuarios y roles no se invalidan.
- Aprobaron las 87 pruebas frontend, la prueba dirigida del helper 2/2, Prettier, ESLint, typecheck, build y revisión cruzada sin hallazgos P0/P1/P2. El build se ejecutó en una salida temporal porque el servidor local mantiene bloqueado `frontend/dist`. No se hizo push.

## 2026-08-07 — Formato de la página de detalle

**Agente:** Codex
**Estado:** centésima remediación de la auditoría técnica, implementada localmente.

- Se normalizó `pages/TicketDetail.tsx` con la configuración raíz de Prettier antes de modificar su política de caché, manteniendo separado el cambio mecánico del funcional.
- El fingerprint AST resultó idéntico en sus 2.150 nodos al ignorar el paréntesis transparente que Prettier agrega al JSX multilínea.
- Aprobaron las 87 pruebas frontend, Prettier, ESLint, typecheck y `git diff --check`. No se hizo push.

## 2026-08-07 — Eliminaciones sincronizadas por SSE

**Agente:** Codex
**Estado:** nonagésima novena remediación de la auditoría técnica, implementada localmente.

- El DELETE administrativo de un ticket emite `ticket_eliminado` con su ID una vez confirmada la eliminación y su cascada; las demás sesiones pueden refrescar lista, dashboard y detalles sin esperar otra acción.
- Se conserva el 204 idempotente: eliminar un ID inexistente no genera eventos fantasma. La prueba de ruta cubre ticket, seguimiento en cascada, payload único y limpieza del cliente SSE falso.
- Aprobaron las 208 pruebas backend, la prueba dirigida 23/23 tras el ajuste final, Prettier, ESLint, typecheck, build y revisión cruzada sin hallazgos P0/P1/P2. No se hizo push.

## 2026-08-07 — Navegación autenticada responsive

**Agente:** Codex
**Estado:** nonagésima octava remediación de la auditoría técnica, implementada localmente.

- El sidebar permanece fijo desde `lg`; en pantallas menores se reemplaza por un encabezado compacto y un panel lateral Radix con overlay, bloqueo de fondo, foco atrapado, Escape y retorno del foco.
- El panel se cierra al navegar, tras un logout exitoso y al cruzar a escritorio. Se agregaron `aria-current`, nombres accesibles y test IDs diferenciados para evitar colisiones entre ambas instancias.
- `DialogContent` incorpora una variante lateral explícita, separada de la geometría y animación centradas, y amplía su cierre a 36 × 36 px con etiqueta en español sin modificar los consumidores existentes.
- Aprobaron las 87 pruebas frontend, Prettier, ESLint, typecheck, build y revisión cruzada sin hallazgos P0/P1/P2. El build se ejecutó en una salida temporal porque el servidor local mantiene bloqueado `frontend/dist`. No se hizo push.

## 2026-08-07 — Sidebar separado del layout

**Agente:** Codex
**Estado:** nonagésima séptima remediación de la auditoría técnica, implementada localmente.

- Se extrajo `Sidebar` desde `AppLayout.tsx` a un módulo de layout propio, sin alterar rutas, permisos, métricas, cierre de sesión ni eventos SSE.
- `AppLayout` vuelve a concentrarse en el ciclo de eventos en vivo y en componer el contenedor autenticado; la navegación queda preparada para incorporar su variante móvil en un cambio aislado.
- Aprobaron Prettier, ESLint, typecheck y `git diff --check`. No se hizo push.

## 2026-08-07 — Invalidaciones administrativas acotadas

**Agente:** Codex
**Estado:** nonagésima sexta remediación de la auditoría técnica, implementada localmente.

- Crear, editar, eliminar, importar y truncar tickets dejaron de invalidar toda React Query; las tres pestañas administrativas usan ahora el helper común del dominio tickets/dashboard.
- Se conservan todas las variantes de filtros, paginación, detalles e historial afectadas, mientras sesión, llave administrativa, roles y usuarios permanecen vigentes.
- Aprobaron las pruebas del helper y las 87 pruebas frontend, Prettier, ESLint, typecheck, build y revisión cruzada sin hallazgos introducidos P0/P1/P2. El build se verificó en una salida temporal porque el servidor local mantiene bloqueado `frontend/dist`. No se hizo push.

## 2026-08-07 — Mutaciones administrativas normalizadas

**Agente:** Codex
**Estado:** nonagésima quinta remediación de la auditoría técnica, implementada localmente.

- `AdminTicketsTab`, `AdminCsvImportTab` y `AdminDangerZoneTab` se ajustaron a Prettier antes de acotar sus invalidaciones. El diff es exclusivamente mecánico.
- Los tres archivos generan un AST runtime equivalente antes y después; formularios, requests, confirmaciones, toasts y caché permanecen sin cambios.
- Se validarán Prettier, ESLint, pruebas frontend, typecheck y build antes de commitear. No se hizo push.

## 2026-08-07 — Invalidación SSE acotada por dominio

**Agente:** Codex
**Estado:** nonagésima cuarta remediación de la auditoría técnica, implementada y validada localmente.

- Se agregó `lib/query-invalidation.ts`: reconoce por frontera de path todas las variantes de tickets y dashboard y las invalida mediante predicado, sin aceptar prefijos parecidos.
- `AppLayout` dejó de invalidar toda React Query ante cada evento SSE. Sesión, `admin-key-probe`, usuarios y roles conservan su caché; revocación y logout mantienen la limpieza total deliberada.
- Dos pruebas nuevas verifican clasificación e invalidación real sobre `QueryClient`. Aprobaron 87 pruebas frontend, Prettier, ESLint, typecheck y build; las mutaciones administrativas se migrarán en commits separados. No se hizo push.

## 2026-08-07 — Layout principal normalizado

**Agente:** Codex
**Estado:** nonagésima tercera remediación de la auditoría técnica, implementada localmente.

- `frontend/src/components/layout/AppLayout.tsx` se normalizó con Prettier antes de modificar SSE o navegación móvil. El diff sólo ajusta comillas, reflow e indentación.
- El código TSX previo y posterior produce un AST runtime equivalente; sesión, sidebar, logout, navegación, badges y eventos permanecen iguales.
- Se validarán Prettier, ESLint, pruebas frontend, typecheck y build antes de commitear. No se hizo push.

## 2026-08-07 — Dashboard adaptable y navegable por teclado

**Agente:** Codex
**Estado:** nonagésima segunda remediación de la auditoría técnica, implementada localmente.

- KPIs pasan de una a dos y cuatro columnas según breakpoint; rendimiento apila gauge y métricas en móvil; motivos/prioridades pasan de una columna con división horizontal a dos con división vertical desde `lg`.
- El contenedor reduce padding en pantallas angostas. La tabla de vencidos incorpora caption y scopes, elimina la fila clickable sólo con mouse y abre cada ticket mediante un `Link` enfocable que respeta el base path.
- Aprobaron Prettier, ESLint, las 85 pruebas frontend, typecheck, build y revisión cruzada. La navegación móvil global del sidebar permanece en un commit separado por requerir un menú accesible completo. No se hizo push.

## 2026-08-07 — Página de dashboard normalizada

**Agente:** Codex
**Estado:** nonagésima primera remediación de la auditoría técnica, implementada localmente.

- `frontend/src/pages/Dashboard.tsx` se normalizó con Prettier en un commit previo e independiente a las correcciones responsive y de teclado.
- La comparación del código TSX transpilado confirmó un AST runtime equivalente; los cambios se limitan a comillas, reflow e indentación sin alterar consultas, períodos, navegación ni datos.
- Se validarán Prettier, ESLint, las 85 pruebas frontend, typecheck y build antes de commitear. No se hizo push.

## 2026-08-07 — Componentes del dashboard normalizados

**Agente:** Codex
**Estado:** nonagésima remediación de la auditoría técnica, implementada localmente.

- Los cuatro componentes de `features/dashboard` se ajustaron a Prettier antes de cualquier mejora responsive. El diff sólo normaliza comillas y compacta un contenedor; datos, colores, fallbacks, gráficos y DOM funcional no cambian.
- Mantener este paso separado permite que la próxima corrección visual sea revisable sin ruido mecánico.
- Se validarán Prettier, ESLint, pruebas frontend, typecheck y build antes de commitear. No se hizo push.

## 2026-08-07 — Componentes de listado normalizados

**Agente:** Codex
**Estado:** octogésima novena remediación de la auditoría técnica, implementada localmente.

- Los tres componentes de `features/ticket-list` se normalizaron juntos por ser la feature completa con menor diff pendiente. Sólo cambian comillas y espacios JSX; props, callbacks, ARIA, orden y render permanecen iguales.
- La auditoría en memoria confirmó fingerprints TypeScript y AST runtime equivalentes antes y después en los tres archivos.
- Se validarán Prettier, ESLint, las 9 pruebas de controles de listado, typecheck y build frontend antes de commitear. No se hizo push.

## 2026-08-07 — Rutas protegidas divididas en chunks

**Agente:** Codex
**Estado:** octogésima octava remediación de la auditoría técnica, implementada y validada localmente.

- Dashboard, listado, detalle y las dos pantallas administrativas ahora cargan con `React.lazy`; login, cambio de contraseña, errores y `AppLayout` permanecen eager para evitar waterfalls en la entrada y conservar el shell.
- `Suspense` vive dentro del layout con un estado accesible. `SoloSysAdmin` decide antes de reconciliar el hijo lazy, por lo que un acceso administrativo prohibido muestra 403 sin descargar ese módulo; el RBAC backend sigue siendo la autoridad.
- El chunk inicial bajó de 952,53 a 378,46 kB (-60,3 %) y de 279,74 a 120,56 kB gzip (-56,9 %). Ningún chunk supera 500 kB y desapareció esa advertencia; aprobaron 85 pruebas, typecheck, ESLint, Prettier, build y revisión cruzada. El smoke manual de rutas queda para la validación del usuario. No se hizo push.

## 2026-08-07 — Shell frontend normalizado

**Agente:** Codex
**Estado:** octogésima séptima remediación de la auditoría técnica, implementada localmente.

- `frontend/src/App.tsx` se normalizó con Prettier en un commit previo e independiente al route splitting. El diff sólo cambia comillas, reflow e indentación JSX.
- El AST TSX previo y posterior es equivalente al excluir metadatos de formato y nodos de espacio JSX sin contenido, por lo que rutas, guards, caché y manejo de sesión no cambian.
- Se validarán Prettier, ESLint, las 85 pruebas frontend, typecheck y build antes de commitear. No se hizo push.

## 2026-08-07 — Formato backend cerrado

**Agente:** Codex
**Estado:** octogésima sexta verificación de la auditoría técnica, cerrada localmente.

- Los 44 archivos bajo `backend/src` ya pasan `prettier --check`. Los siete desvíos reales se repartieron en microcommits; `rfc3339.ts` sólo requirió normalizar el checkout al mismo blob LF.
- El quality gate integral posterior aprobó lint, codegen/OpenAPI, esquema Drizzle, todas las suites, typecheck y builds. Permanecen únicamente las advertencias conocidas de sourcemaps y del bundle inicial de 952,53 kB.
- La deuda de formato queda ahora concentrada en frontend y se seguirá por feature; el corte del bundle por rutas será la primera mejora profesional medida. No se hizo push.

## 2026-08-07 — Router de tickets normalizado

**Agente:** Codex
**Estado:** octogésima quinta remediación de la auditoría técnica, implementada localmente.

- `backend/src/routes/tickets.ts` se ajustó a Prettier en un commit exclusivo. Los cambios son reflow de imports, parsers, `orderBy`, respuestas y la indentación de la transacción PATCH con sus opciones.
- Se verificó equivalencia del AST TypeScript entre la versión previa y la formateada, omitiendo sólo metadatos de ubicación y formato; autorización, CAS, auditoría, cuarentena, CSV y seguimientos se conservan.
- Por ser el mayor diff mecánico del backend, aprobaron Prettier, ESLint, typecheck y las 207 pruebas de la suite backend completa. No se hizo push.

## 2026-08-07 — Consultas de tickets normalizadas

**Agente:** Codex
**Estado:** octogésima cuarta remediación de la auditoría técnica, implementada localmente.

- `backend/src/lib/ticket-query.ts` se ajustó a Prettier mediante la compactación de dos uniones de tipos. Parsers, condiciones SQL, orden compuesto y defaults permanecen idénticos.
- El cambio se mantiene aislado del router y se valida tanto en la suite pura de consultas como en las rutas que consumen listado y exportación.
- Se validarán Prettier, ESLint, ambas suites dirigidas y el typecheck backend antes de commitear. No se hizo push.

## 2026-08-07 — Ruta de autenticación normalizada

**Agente:** Codex
**Estado:** octogésima tercera remediación de la auditoría técnica, implementada localmente.

- `backend/src/routes/auth.ts` se ajustó a Prettier mediante un único cambio: dos imports del mismo módulo pasan de cuatro líneas a una. No cambian handlers, guards, sesiones, contraseñas ni respuestas.
- Se priorizó este archivo por tener el menor diff real entre los desvíos restantes, pese a su tamaño nominal. La revisión queda así inmediata y sin ruido funcional.
- Se validarán Prettier, ESLint, las 51 pruebas dirigidas de auth/RBAC y el typecheck backend antes de commitear. No se hizo push.

## 2026-08-07 — Servicio de prioridad automática normalizado

**Agente:** Codex
**Estado:** octogésima segunda remediación de la auditoría técnica, implementada localmente.

- `backend/src/lib/prioridad-automatica.ts` se ajustó a Prettier mediante reflow de uniones, un ternario y una desestructuración; reglas SLA, compare-and-set, auditoría, lock y SSE no cambian.
- El diff es mecánico y queda aislado del runner periódico. Se ejecutarán las suites puras, transaccionales y del runner para cubrir el módulo desde sus tres fronteras.
- También se validarán Prettier, ESLint y el typecheck backend antes de commitear. No se hizo push.

## 2026-08-07 — Ruta de ingesta normalizada

**Agente:** Codex
**Estado:** octogésima primera remediación de la auditoría técnica, implementada localmente.

- `backend/src/routes/webhooks.ts` se normalizó con Prettier. El diff sólo redistribuye una llamada, una respuesta HTTP y uniones literales; validación, transacción, idempotencia, cuarentena y eventos no cambian.
- La suite dirigida de creación por webhook cubre rechazo y aceptación de fechas RFC3339, preservación del instante, estado laboral, seguimiento Serin e idempotencia; también recorre el alta administrativa equivalente.
- Se validarán Prettier, ESLint, esa suite dirigida y el typecheck backend antes de commitear. No se hizo push.

## 2026-08-07 — Reconciliador de categorías normalizado

**Agente:** Codex
**Estado:** octogésima remediación de la auditoría técnica, implementada localmente.

- `backend/src/lib/reclasificar-motivos.ts` se ajustó a la política Prettier explícita. El único cambio indexable expande un arreglo con objeto a varias líneas; SQL, transacción, compare-and-set y reglas de clasificación permanecen intactos.
- Se eligió este helper por ser el menor desvío backend restante y contar con una prueba SQLite dedicada que cubre preservación de datos, versión e idempotencia.
- Se validarán Prettier, ESLint, la prueba dirigida y el typecheck backend antes de commitear. No se hizo push.

## 2026-08-07 — Utilidades de sesión normalizadas

**Agente:** Codex
**Estado:** septuagésima novena remediación de la auditoría técnica, implementada localmente.

- `backend/src/lib/session-cookie.ts` se normalizó con la política Prettier explícita; el diff sólo ajusta saltos de línea y la firma de una función, sin modificar expresiones, constantes ni comportamiento.
- La migración de formato comienza con un único archivo pequeño y pruebas propias para mantener commits revisables y evitar un barrido masivo.
- Se validarán Prettier, ESLint, la suite dirigida de cookies de sesión y el typecheck backend antes de commitear. No se hizo push.

## 2026-08-07 — Política de formato explicitada

**Agente:** Codex
**Estado:** septuagésima octava remediación de la auditoría técnica, implementada localmente.

- Se agregó `.prettierrc.json` con los defaults que ya aplicaba Prettier 3.9.5: LF, 80 columnas, punto y coma, comillas dobles, indentación de dos espacios y trailing commas.
- La política queda reproducible para IDE, CLI y Orval sin reformatear el repositorio de una sola vez. El `format:check` global se incorporará cuando la migración gradual no produzca falsos fallos por archivos históricos.
- El lote validará que la regeneración OpenAPI permanezca estable antes de commitear. No se hizo push.

## 2026-08-07 — Dependencias directas re-auditadas

**Agente:** Codex
**Estado:** septuagésima séptima verificación de la auditoría técnica, cerrada localmente sin remociones adicionales.

- Se revisaron los diez `package.json` contra imports, scripts, configuración, CSS y build; no queda una dependencia directa segura de remover.
- Los aparentes huérfanos son falsos positivos de tooling y tipos: `tsx`, `@types/*`, `thread-stream`, `pino-pretty` y `prettier` tienen consumidores verificados en runners, TypeScript, esbuild/Pino u Orval.
- No se modificaron manifests ni lockfile. El quality gate integral se ejecutará al cerrar el lote. No se hizo push.

## 2026-08-07 — Motivos y prioridades del dashboard separados

**Agente:** Codex
**Estado:** septuagésima sexta remediación de la auditoría técnica, implementada y validada localmente.

- La tarjeta de motivos y prioridades salió de `Dashboard.tsx` a `features/dashboard/DashboardMotivesPriorityPanel.tsx`, que recibe datos API crudos y encapsula ranking, compatibilidad legacy y preparación de Recharts.
- Se preservaron orden, fallbacks, colores, loaders independientes, estados vacíos, gráfico y leyenda. La página eliminó transformaciones e imports de visualización y bajó de 506 a 383 líneas.
- La revisión cruzada no encontró hallazgos P0/P1/P2 introducidos. Typecheck y ESLint dirigidos aprobaron; el responsive fijo en dos columnas queda identificado como deuda visual heredada para la etapa profesional. No se hizo push.

## 2026-08-07 — Construcción de cambios de ticket aislada

**Agente:** Codex
**Estado:** septuagésima quinta remediación de la auditoría técnica, implementada y validada localmente.

- Normalización, reglas de Serin/categoría/asignación/resolución y diff salieron de `routes/tickets.ts` a `lib/ticket-update-changes.ts` como función pura con reloj e identidad confiable inyectados.
- Permiso de cierre y versión se validan antes de invocarla. SQL con CAS, no-op, auditoría transaccional y SSE posterior al commit permanecen en la ruta; el orden de campos que alimenta el historial se preservó.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron 6 pruebas puras nuevas, 22 pruebas de rutas, typecheck del backend, ESLint, Prettier y `diff --check`. No se hizo push.

## 2026-08-07 — Paginación administrativa de tickets aislada

**Agente:** Codex
**Estado:** septuagésima cuarta remediación de la auditoría técnica, implementada y validada localmente.

- Selector de tamaño, resumen y navegación salieron de `AdminTicketsTab.tsx` a `features/admin-tickets/AdminTicketsPagination.tsx` como vista pura de siete props y sin hooks.
- Página, tamaño, query, totales, reinicio y ajuste al último resultado permanecen en el padre. Los callbacks anterior/siguiente conservan actualizaciones funcionales; DOM, opciones, textos, clases e inhabilitación son equivalentes.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron las 9 pruebas dirigidas, typecheck, ESLint, Prettier, build aislado y `diff --check`; el temporal fue eliminado. No se hizo push.

## 2026-08-07 — Validación del PATCH de tickets separada

**Agente:** Codex
**Estado:** septuagésima tercera remediación de la auditoría técnica, implementada y validada localmente.

- Whitelist, detección de campos técnicos, RFC3339, email y coerción Zod salieron de `routes/tickets.ts` a `lib/ticket-update-validation.ts`, sin Express ni acceso a datos.
- Autorización técnica, acceso a cuarentena, mensajes y precedencia de errores permanecen equivalentes. La transacción PATCH, control de versión, auditoría y SSE no se movieron; el guard independiente de seguimientos continúa en la ruta.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron 6 pruebas unitarias nuevas, 22 pruebas de rutas, typecheck del backend, ESLint, Prettier y `diff --check`. No se hizo push.

## 2026-08-07 — Distribución de estados del dashboard aislada

**Agente:** Codex
**Estado:** septuagésima segunda remediación de la auditoría técnica, implementada y validada localmente.

- Barra segmentada y leyenda salieron de `Dashboard.tsx` a `features/dashboard/DashboardStatusDistribution.tsx`, que recibe sólo estados y carga y calcula internamente el total con el mismo fallback defensivo.
- Se conservaron root, precedencia carga/datos/vacío, porcentajes, separadores, títulos, orden, colores y etiqueta canónica de Pendiente. También se eliminó la propiedad interna `text`, que no tenía ningún consumidor.
- Dos revisiones no encontraron hallazgos P0/P1/P2 tras ajustar los puntos de paridad. Aprobaron ESLint dirigido, Prettier y `diff --check`; el quality gate conjunto se ejecutará al cerrar el lote. No se hizo push.

## 2026-08-07 — Diálogo de gestión del ticket separado

**Agente:** Codex
**Estado:** septuagésima primera remediación de la auditoría técnica, implementada y validada localmente.

- Estado, prioridad, progreso, fecha técnica y notas salieron de `TicketDetail.tsx` a `features/ticket-detail/TicketManagementDialog.tsx` como diálogo completamente controlado y sin hooks.
- Draft, baseline, versión esperada, SSE, conflicto, recarga, permisos, validaciones, PATCH, caché y toasts permanecen en la página. Los callbacks preservan el baseline al cambiar estado y el fallback del slider; DOM, textos, opciones y bloqueos son equivalentes.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron 85 pruebas, typecheck, ESLint, Prettier, build aislado y `diff --check`; sólo aparecieron advertencias conocidas. No se hizo push.

## 2026-08-07 — Panel de filtros de tickets aislado

**Agente:** Codex
**Estado:** septuagésima remediación de la auditoría técnica, implementada y validada localmente.

- Las tres filas de filtros salieron de `TicketList.tsx` a `features/ticket-list/TicketListFiltersPanel.tsx` como vista controlada, sin hooks, con diez valores y diez callbacks explícitos.
- Los estados, reinicio de página, consulta, exportación, toasts y limpieza permanecen en el padre. Se conservaron mapeos, orden, opciones, sentinelas, clases responsive, IDs, etiquetas ARIA, spinner y condición de filtros activos.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron las 9 pruebas dirigidas, typecheck, ESLint, Prettier, build aislado y `diff --check`; el temporal fue eliminado. No se hizo push.

## 2026-08-07 — Código muerto del frontend re-auditado

**Agente:** Codex
**Estado:** sexagésima novena verificación de la auditoría técnica, cerrada localmente sin eliminaciones adicionales.

- Se reconstruyó el grafo de imports, reexports y cargas dinámicas de los 78 archivos TS/TSX bajo `frontend/src`, usando `main.tsx` como entrypoint confirmado por Vite.
- Los 78 archivos son alcanzables en runtime incluso al excluir imports de tipos. Las ocho páginas y los veinte componentes `ui` tienen consumidores reales; no existen módulos sostenidos sólo por tests, tipos o ciclos huérfanos.
- No se borró ningún archivo porque no quedó un candidato seguro. El `quality` integral posterior aprobó lint, codegen, esquema, pruebas, typecheck y builds. No se hizo push.

## 2026-08-07 — Quality gate de pruebas estabilizado

**Agente:** Codex
**Estado:** sexagésima octava remediación de la auditoría técnica, implementada y validada localmente.

- La ejecución recursiva de pruebas ahora limita a uno los workspaces simultáneos. Se conserva la concurrencia interna de cada runner y el timeout estricto del importador, pero se evita que backend, frontend y scripts compitan por CPU hasta generar falsos negativos.
- El diagnóstico fue reproducible: el importador agotó exactamente 30 s sólo bajo carga paralela, aprobó aislado en 6,3 s y la suite serial completa aprobó en 46,8 s. Dos revisiones descartaron subir el timeout o mantener un orden manual frágil.
- `pnpm run quality` aprobó luego del cambio: lint, codegen sincronizado, cadena Drizzle, todas las suites, typecheck y builds. Permanecen únicamente las advertencias conocidas de sourcemaps y tamaño del bundle. No se hizo push.

## 2026-08-07 — Normalización de consultas de tickets separada

**Agente:** Codex
**Estado:** sexagésima séptima remediación de la auditoría técnica, implementada y validada localmente.

- La coerción estricta de booleanos y fechas salió de `routes/tickets.ts` a `lib/ticket-query-normalization.ts`; los middlewares, rutas, mensajes y el orden de validación permanecen intactos.
- Se fijaron regresiones para booleanos reconocidos y rechazables, fecha bisiesta, límites locales del día, formatos imposibles, claves ajenas e inmutabilidad. `incluir_vacios` continúa ampliando alcance sólo ante `true` exacto y bajo la doble elevación administrativa existente.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron las 4 pruebas nuevas, typecheck del backend, ESLint dirigido, Prettier y `diff --check`. No se hizo push.

## 2026-08-07 — Encabezado informativo del ticket aislado

**Agente:** Codex
**Estado:** sexagésima sexta remediación de la auditoría técnica, implementada y validada localmente.

- Navegación, motivo, indicador de vencimiento y metadatos salieron de `TicketDetail.tsx` a `features/ticket-detail/TicketHeaderSummary.tsx` con un contrato estrecho y sin hooks.
- El layout exterior, badges de estado/prioridad y diálogo de gestión permanecen en la página; draft, baseline, conflicto optimista, permisos y mutaciones no se tocaron. Se preservaron DOM, clases, ARIA, fallbacks, fecha, asignación y rutas.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron 85 pruebas, typecheck, ESLint dirigido, Prettier acotado, build aislado y `diff --check`; sólo aparecieron advertencias ya conocidas. No se hizo push.

## 2026-08-07 — Actividad reciente del dashboard separada

**Agente:** Codex
**Estado:** sexagésima quinta remediación de la auditoría técnica, implementada y validada localmente.

- La columna de actividad reciente salió de `Dashboard.tsx` a `features/dashboard/DashboardRecentActivityPanel.tsx` como vista pura de datos, carga y título.
- La query, errores y filtros temporales permanecen en la página. Se preservaron el root directo del grid, alto completo, cinco skeletons, estado vacío, orden del timeline, conectores, colores, enlaces, fallback de contacto y fecha.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron 85 pruebas, typecheck, ESLint dirigido, Prettier acotado, build aislado y `diff --check`; sólo aparecieron advertencias ya conocidas. No se hizo push.

## 2026-08-07 — Ayuda de ordenamiento del listado aislada

**Agente:** Codex
**Estado:** sexagésima cuarta remediación de la auditoría técnica, implementada y validada localmente.

- La ayuda de orden múltiple y su acción de restablecimiento salieron de `TicketList.tsx` a `features/ticket-list/TicketSortToolbar.tsx`, sin hooks ni estado propio.
- El listado conserva criterios y callback; `resetSort` sigue restaurando fecha de llegada descendente y página 1. Se mantuvieron estructura, texto, `kbd`, título, clases, icono y condición de deshabilitado.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron las 9 pruebas dirigidas, typecheck, ESLint, Prettier acotado, build aislado y `diff --check`; el temporal fue eliminado. No se hizo push.

## 2026-08-07 — Confirmación de borrado administrativo aislada

**Agente:** Codex
**Estado:** sexagésima tercera remediación de la auditoría técnica, implementada y validada localmente.

- La confirmación de eliminación salió de `AdminTicketsTab.tsx` a `features/admin-tickets/AdminTicketDeleteDialog.tsx` como componente puro de cuatro props y sin hooks.
- Estado, mutación, caché, invalidación y toasts permanecen en el padre. Se conservaron apertura, descarte, confirmación, estado pendiente, contacto, motivo, textos, clases y orden del DOM sin agregar bloqueos nuevos.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron typecheck, ESLint dirigido, Prettier acotado y `diff --check`; el quality gate completo del corte anterior seguía verde. No se hizo push.

## 2026-08-07 — Indicadores del dashboard separados

**Agente:** Codex
**Estado:** sexagésima segunda remediación de la auditoría técnica, implementada y validada localmente.

- La grilla de cuatro KPI salió de `Dashboard.tsx` a `features/dashboard/DashboardKpiGrid.tsx` como vista pura con seis props escalares y sin hooks.
- Consultas, filtros temporales y cálculos permanecen en el padre. Se conservaron orden, textos, iconos, skeletons, clases responsive, fallbacks y el resaltado condicional de tickets vencidos.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint dirigido, Prettier acotado, build aislado y `diff --check`; sólo aparecieron advertencias de sourcemaps y tamaño ya conocidas. No se hizo push.

## 2026-08-07 — Fila operativa de tickets aislada

**Agente:** Codex
**Estado:** sexagésima primera remediación de la auditoría técnica, implementada y validada localmente.

- La fila del listado operativo salió de `TicketList.tsx` a `features/ticket-list/TicketListTableRow.tsx` como componente presentacional, tipado y sin hooks.
- El padre conserva consultas, filtros, exportación, orden múltiple, paginación y navegación. Se mantuvieron los ocho derivados y las nueve celdas en su orden exacto, incluidos datos laborales, asignación, progreso y vencimiento.
- La revisión cruzada no encontró hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, Prettier acotado, build aislado y `diff --check`; el temporal fue eliminado. No se hizo push.

## 2026-08-07 — Formulario administrativo de tickets aislado

**Agente:** Codex
**Estado:** sexagésima remediación de la auditoría técnica, implementada y validada localmente.

- El diálogo de alta y edición salió de `AdminTicketsTab.tsx` a `features/admin-tickets/AdminTicketFormDialog.tsx` como vista controlada, sin hooks ni estado remoto propio.
- El controlador conserva formulario, baseline, mutaciones, caché, recarga y resolución de conflictos optimistas. Se preservaron campos, obligatoriedad, bloqueo de `conversation_id` al editar, mensajes y condiciones de guardado.
- La revisión del diff no encontró hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, Prettier acotado, build aislado y `diff --check`; el temporal fue eliminado. No se hizo push.

## 2026-08-06 — Fila administrativa de ticket aislada

**Agente:** Codex
**Estado:** quincuagésima novena remediación de la auditoría técnica, implementada y validada localmente.

- La fila de 11 celdas salió de `AdminTicketsTab.tsx` a `AdminTicketTableRow.tsx` con ticket, bloqueo de edición y tres callbacks semánticos. Query, ramas de tabla, orden, paginación, caché, navegación y diálogos permanecen en el controlador.
- Derivados, fallbacks, badges, vencimiento y columna sticky se trasladaron literalmente. Abrir, editar y borrar conservan `stopPropagation`, rutas, objetos entregados, títulos, atributos accesibles y la única condición que deshabilita edición.
- Dos revisiones independientes no encontraron hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, Prettier acotado, build aislado y `diff --check`; el temporal del build fue verificado y eliminado. No se hizo push.

## 2026-08-06 — Historial del ticket como componente controlado

**Agente:** Codex
**Estado:** quincuagésima octava remediación de la auditoría técnica, implementada y validada localmente.

- Formulario de nota y timeline salieron a `features/ticket-detail/TicketHistoryCard.tsx` mediante props controladas. El componente conserva presentación y adaptación del evento, sin poseer hooks, estado remoto ni mutaciones.
- Query, error global, refetch coordinado, mutación, draft y reset siguen en `TicketDetail`: el texto se limpia sólo después del éxito y se conserva ante errores. Orden, conectores y condiciones de cambios de estado, prioridad, asignación y campos editados se trasladaron literalmente.
- Dos revisiones independientes no encontraron hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, Prettier acotado, build aislado y `diff --check`. No se hizo push.

## 2026-08-06 — Progreso visual con fuentes canónicas

**Agente:** Codex
**Estado:** quincuagésima séptima remediación de la auditoría técnica, implementada y validada localmente.

- El tracker salió a `features/ticket-detail/TicketProgressCard.tsx` con sólo estado y progreso. Su orden visual es explícito, mientras porcentajes y etiquetas provienen de `TICKET_STATE_PROGRESS` y `getEstadoLabel`, eliminando cinco objetos duplicados de la página.
- Se preservaron `progreso || 0`, ancho sin clamp, completitud por porcentaje y estado actual independiente; un ajuste manual inconsistente continúa representándose igual. El toast usa la misma etiqueta canónica y mantiene sus textos para los cinco estados válidos.
- Dos revisiones independientes no encontraron hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, Prettier acotado, build aislado y `diff --check`. No se hizo push.

## 2026-08-06 — Datos de contacto separados del detalle

**Agente:** Codex
**Estado:** quincuagésima sexta remediación de la auditoría técnica, implementada y validada localmente.

- La tarjeta `Datos del Contacto` salió a `features/ticket-detail/TicketContactCard.tsx` con un `Pick` explícito de los siete campos consumidos, un callback semántico de edición y el único estado que bloquea el lápiz.
- Cálculo de etiquetas, empresa y estado laboral quedó encapsulado junto a la presentación. Se conservaron root sin wrapper, orden, condicionales de empresa/DNI, filas fijas de teléfono y email, textos, clases y atributos accesibles; el diálogo, draft, mutación y conflicto optimista permanecen en la página.
- La revisión independiente no encontró hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, Prettier acotado, build aislado y `diff --check`. No se hizo push.

## 2026-08-06 — Tarjeta de tiempos extraída del detalle

**Agente:** Codex
**Estado:** quincuagésima quinta remediación de la auditoría técnica, implementada y validada localmente.

- Fecha límite, resolución y estado visual de vencimiento salieron a `features/ticket-detail/TicketTimingCard.tsx`, con campos tipados desde `Ticket` y un booleano explícito para la condición derivada.
- El componente no posee hooks ni estado. Conserva clases condicionales, formato de fechas, fallback `No definida`, render truthy de resolución, textos y estructura; `Clock` y `formatDate` permanecen también en la página porque todavía tienen otros consumidores.
- La revisión independiente no encontró hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, Prettier acotado, build aislado y `diff --check`. No se hizo push.

## 2026-08-06 — Resumen visual del llamado extraído

**Agente:** Codex
**Estado:** quincuagésima cuarta remediación de la auditoría técnica, implementada y validada localmente.

- La tarjeta de descripción, grabación y notas salió de `TicketDetail.tsx` a `features/ticket-detail/TicketCallSummaryCard.tsx`, con tres props derivadas directamente del contrato `Ticket`.
- El componente es puramente presentacional: no incorpora hooks, consultas ni mutaciones. Se preservaron el fallback de resumen, el condicional de audio sin atributos nuevos, el mensaje de ausencia, las notas truthy, textos, clases y posición en el DOM.
- La revisión independiente no encontró hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, build aislado y `diff --check`. No se hizo push.

## 2026-08-06 — CRUD de tickets separado de la página administrativa

**Agente:** Codex
**Estado:** quincuagésima tercera remediación de la auditoría técnica, implementada y validada localmente.

- Listado, búsqueda, orden múltiple, paginación, alta, edición, borrado y sus diálogos salieron a `features/admin-tickets/AdminTicketsTab.tsx`. `Admin.tsx` quedó como coordinador fino de acceso, cabecera y tres pestañas.
- La frontera recibe `RequestInit`, presencia de elevación y una versión opaca. Conserva `incluir_vacios`, compatibilidad de orden, caché exacta, actualización condicionada por revisión, PATCH mínimo, no-op, draft, guard contra respuestas tardías y recarga del conflicto con la misma credencial; el secreto nunca entra en la query key.
- Dos revisiones independientes compararon lógica y JSX contra el origen sin hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, Prettier acotado, build aislado y `diff --check`. El componente cohesivo grande es una frontera intermedia y se subdividirá en microcommits posteriores. No se hizo push.

## 2026-08-06 — Zona peligrosa administrativa aislada

**Agente:** Codex
**Estado:** quincuagésima segunda remediación de la auditoría técnica, implementada y validada localmente.

- El conteo total, la confirmación y el truncado salieron de `Admin.tsx` a `features/admin-tickets/AdminDangerZoneTab.tsx`; estado, consulta, mutación y presentación permanecen en una sola unidad cohesionada.
- La consulta conserva `incluir_vacios`, se habilita sólo con elevación administrativa y separa cachés mediante una versión opaca. La API key viaja únicamente en `RequestInit` y nunca forma parte de la query key. El borrado mantiene la confirmación literal `BORRAR` y sólo después del éxito limpia, invalida globalmente y notifica.
- La comparación independiente no encontró hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, Prettier acotado, build aislado y `diff --check`. No se hizo push.

## 2026-08-06 — Importador CSV separado de la página administrativa

**Agente:** Codex
**Estado:** quincuagésima primera remediación de la auditoría técnica, implementada y validada localmente.

- El estado del archivo, la simulación automática, la confirmación y la presentación del resultado salieron de `Admin.tsx` a `features/admin-tickets/AdminCsvImportTab.tsx`. La pestaña recibe únicamente el `RequestInit` elevado y no crea otra instancia de acceso administrativo.
- Se preservaron una única mutación, el vaciado del input para reseleccionar el mismo archivo, payloads `dry_run`, mensajes, deduplicación e invalidación global sólo después de una importación definitiva exitosa. El análisis previo no altera ninguna caché.
- La comparación independiente no encontró diferencias funcionales ni visuales. Aprobaron 85 pruebas del frontend, typecheck, ESLint, Prettier acotado al archivo nuevo, build aislado y `diff --check`. No se hizo push.

## 2026-08-06 — Pestaña de roles separada del directorio administrativo

**Agente:** Codex
**Estado:** quincuagésima remediación de la auditoría técnica, implementada y validada localmente.

- La consulta, filtro, formularios, protecciones y mutaciones de roles salieron a `features/admin-directory/AdminRolesTab.tsx`. `AdminRolesUsers.tsx` quedó en 31 líneas y sólo coordina elevación administrativa, cabecera y pestañas.
- El componente recibe el mismo `RequestInit` estable que usuarios. Conserva catálogo acotado, búsqueda remota, filtro local, debounce de 350 ms e invalidaciones cruzadas: alta, edición y activación refrescan roles + usuarios; borrar refresca roles.
- Una comparación independiente confirmó paridad literal de contenido, diálogos, textos, clases, IDs, atributos accesibles y protección de roles del sistema, sin hallazgos P0/P1/P2. Aprobaron 85 pruebas del frontend, typecheck, ESLint, build y `diff --check`. No se hizo push.

## 2026-08-06 — Pestaña de usuarios separada del directorio administrativo

**Agente:** Codex
**Estado:** cuadragésima novena remediación de la auditoría técnica, implementada y validada localmente.

- La consulta, filtros, paginación, formularios y mutaciones de usuarios salieron de `AdminRolesUsers.tsx` hacia `features/admin-directory/AdminUsersTab.tsx`; la página coordinadora bajó de 1.197 a 487 líneas.
- La frontera recibe únicamente el `RequestInit` administrativo. Conserva un catálogo propio de hasta 100 roles, las mismas query keys e invalidaciones, y ejecuta todos sus hooks de forma incondicional. Los diálogos permanecen montados fuera de `TabsContent`, por lo que cambiar de pestaña no descarta una edición abierta.
- Se preservaron literalmente textos, clases, identificadores, atributos accesibles, filtros y demoras de recarga. Aprobaron las 85 pruebas del frontend, typecheck, ESLint, `diff --check` y el build en una salida aislada porque el directorio normal estaba abierto por el servidor local. No se hizo push.

## 2026-08-06 — Modelo puro del directorio administrativo

**Agente:** Codex
**Estado:** cuadragésima octava remediación de la auditoría técnica, implementada y validada localmente.

- La inicialización de formularios, conversión para edición, selección del primer rol activo, mapa de etiquetas y filtro de roles salieron de la página a `features/admin-directory/model.ts`.
- La página consume esas funciones sin cambiar estado, consultas, mutaciones ni DOM. Los opcionales nulos, roles inactivos ya asignados y contraseñas vacías al editar conservan su semántica.
- Tres grupos de regresiones fijan formularios, catálogos, búsqueda por descripción y estado. Lint, typecheck, pruebas y build del frontend aprobaron. No se hizo push.

## 2026-08-06 — Inicio del feature administrativo de identidades

**Agente:** Codex
**Estado:** cuadragésima séptima remediación de la auditoría técnica, implementada y validada localmente.

- Se inició `features/admin-directory` con el badge de estado compartido por usuarios y roles, extraído literalmente de la página monolítica.
- Clases, variantes, etiquetas y puntos de uso permanecen iguales; el corte establece el destino de los siguientes paneles sin introducir lógica ni props nuevas.
- Lint, typecheck y build del frontend aprobaron. No se hizo push.

## 2026-08-06 — Sesión explícita del borrador de contacto

**Agente:** Codex
**Estado:** cuadragésima sexta remediación de la auditoría técnica, implementada y validada localmente.

- El editor de datos dejó de excluir dependencias de su efecto. Una transición pura modela apertura, cierre y cambio de ticket, de modo que React puede observar el objeto completo sin borrar el draft ante revisiones SSE del mismo ID.
- Abrir, reabrir o navegar a otro ticket captura datos + versión nuevos; `reloadLatest` conserva su reinicio intencional independiente ante conflictos optimistas.
- Cuatro regresiones fijan la transición y su inmutabilidad. Lint, typecheck y pruebas del frontend aprobaron. No se hizo push.

## 2026-08-06 — Gestión de usuarios separada del router administrativo

**Agente:** Codex
**Estado:** cuadragésima quinta remediación de la auditoría técnica, implementada y validada localmente.

- Listado, alta, edición y reset de usuarios salieron a `admin-users.ts` con paths relativos. `admin.ts` quedó reducido a 109 líneas: doble guard, alta manual y composición de roles, usuarios y operaciones masivas.
- Se preservaron la selección pública que nunca expone `password_hash`, scrypt fuera del lock, escritura + revocación de sesiones dentro de la transacción, protección del último SysAdmin y cierre SSE/reset del limiter sólo después del commit.
- La nueva caracterización verifica los estados 401/403 del guard, alcance exitoso del GET y ausencia de hashes. La cobertura previa continúa fijando altas, PATCH, resets, concurrencia, rollback, roles inactivos y cambios reales o nulos de rol.
- Aprobaron 61 pruebas dirigidas, typecheck de backend, ESLint y `diff --check`. No se hizo push.

## 2026-08-06 — Ciclo de vida explícito del stream SSE

**Agente:** Codex
**Estado:** cuadragésima cuarta remediación de la auditoría técnica, implementada y validada localmente.

- `useEventosEnVivo` dejó de silenciar `react-hooks/exhaustive-deps`: declara la navegación estable de Wouter y la instancia de QueryClient que determinan el ciclo de la conexión.
- El hook usa directamente la función estable de toasts y ya no se suscribe a cada cambio de su estado global; los avisos siguen siendo idénticos sin provocar rerenders del layout.
- Lint, typecheck y pruebas del frontend aprobaron. No se hizo push.

## 2026-08-06 — CRUD de roles separado del router administrativo

**Agente:** Codex
**Estado:** cuadragésima tercera remediación de la auditoría técnica, implementada y validada localmente.

- Las cuatro rutas de catálogo y CRUD de roles salieron de `admin.ts` a un router hijo con paths relativos. El padre lo monta después de `requireSysAdmin` y `requireAdminKey`, preservando el orden observable de los controles.
- Cuatro helpers usados también por usuarios se movieron a un módulo puro compartido; no se duplicaron ni se introdujeron imports circulares.
- Una regresión específica comprueba SysAdmin sin clave, Operador con clave y el recorrido real de alta + listado filtrado/paginado. Las reglas previas de PATCH, DELETE, roles base y revocación continúan cubiertas por RBAC.
- Aprobaron 50 pruebas RBAC, cinco de operaciones Admin, typecheck de backend, ESLint y `diff --check`. No se hizo push.

## 2026-08-06 — Dependencia directa no utilizada en scripts

**Agente:** Codex
**Estado:** cuadragésima segunda remediación de la auditoría técnica, implementada y validada localmente.

- Se verificó el grafo actual de imports: no quedan archivos TS/TSX huérfanos en backend o frontend y todos los componentes UI tienen consumidores.
- `scripts` declaró `drizzle-orm` sin importarlo directamente; el paquete accede a persistencia mediante `@workspace/db`. Se retiró únicamente esa declaración redundante, conservando Drizzle donde sí es dependencia real.
- Se validaron tests y typecheck de scripts, además del lint global. No se hizo push.

## 2026-08-06 — Auditoría de tickets separada del transporte HTTP

**Agente:** Codex
**Estado:** cuadragésima primera remediación de la auditoría técnica, implementada y validada localmente.

- La derivación del autor, la selección ordenada de campos editados y la redacción de la nota salieron de `routes/tickets.ts` hacia un módulo de dominio sin dependencias de Express ni de la base.
- Las constantes internas no se exportan y los helpers aceptan contratos estructurales mínimos, evitando ciclos y acoplamiento con modelos de ejecución.
- Pruebas unitarias fijan fallbacks, exclusiones, orden, etiquetas y puntuación; una regresión integrada comprueba el cableado exacto dentro del PATCH transaccional.
- Las 26 pruebas dirigidas, el typecheck de backend, ESLint y `diff --check` aprobaron. No se hizo push.

## 2026-08-06 — Cierre de la deuda explícita de `any`

**Agente:** Codex
**Estado:** cuadragésima remediación de la auditoría técnica, implementada y validada localmente.

- El Dashboard dejó de ocultar con `any` que la fecha límite del contrato general de Ticket puede ser nula. Una respuesta inconsistente se omite de la tabla de vencidos en lugar de calcular contra una fecha inválida.
- `no-explicit-any` pasó de advertencia a error y el gate exige cero warnings. La deuda inventariada bajó de 18 a cero en tres microcommits.
- Se validaron lint, typecheck y las pruebas del frontend. No se hizo push.

## 2026-08-06 — Inferencia de tipos en métricas del Dashboard

**Agente:** Codex
**Estado:** trigésima novena remediación de la auditoría técnica, implementada y validada localmente.

- Se eliminaron 13 `any` de reducciones, búsquedas, gráficos y actividad reciente; todos sus tipos ya estaban determinados por las respuestas OpenAPI o por Recharts.
- El presupuesto temporal de ESLint bajó de 14 a una advertencia. El último caso se aisló porque requiere manejar de forma explícita una fecha límite nullable, no sólo borrar una anotación.
- No cambió el cálculo ni la presentación de las métricas. No se hizo push.

## 2026-08-06 — Tipado inferido en layout y listado de tickets

**Agente:** Codex
**Estado:** trigésima octava remediación de la auditoría técnica, implementada y validada localmente.

- Se eliminaron cuatro `any` explícitos que anulaban información ya disponible en el cliente OpenAPI: tres estadísticas del sidebar y cada elemento del listado de tickets.
- El presupuesto de ESLint bajó de 18 a 14 advertencias; por lo tanto, estas supresiones no pueden reaparecer sin romper el gate.
- No se modificó el contrato ni el comportamiento de consultas, métricas o renderizado. No se hizo push.

## 2026-08-06 — ESLint tipado como compuerta de calidad

**Agente:** Codex
**Estado:** trigésima séptima remediación de la auditoría técnica, implementada y validada localmente.

- Se incorporó ESLint flat para TypeScript/TSX. Las fuentes productivas usan `projectService` y reglas de promesas; React suma `rules-of-hooks` y dependencias exhaustivas. Tests y configuración se analizan sin tipo, mientras generated, `dist`, `build` y dependencias quedan fuera.
- `pnpm run lint` exige cero errores y permite como máximo las 18 advertencias `no-explicit-any` ya inventariadas: 14 en Dashboard, tres en el layout y una en Tickets. Cualquier `any` nuevo rompe el gate; los siguientes commits reducirán ese límite hasta cero.
- Se corrigieron promesas ignoradas, dependencias de hooks, un import duplicado, imports muertos y `@ts-ignore` innecesarios. Las regex que deliberadamente procesan controles conservan la regla activa y llevan una supresión local explicada.
- Los `throw` de la restauración SQLite salieron del `finally` sin perder el error original: éxito, rollback, cleanup y sus fallos combinados conservan códigos, causas, orden y artefactos. Nuevas regresiones verifican éxito + cleanup fallido, operación + cleanup y las dos causas de `ROLLBACK_FAILED`.
- `lint` se ejecuta primero dentro de `quality`. ESLint, typecheck, suites del workspace, build y quality completo aprobaron; las pruebas de restore cerraron 30 correctas y una omisión esperada por symlinks en Windows. No se hizo push.

## 2026-08-06 — Exportación CSV incremental y acotada en memoria

**Agente:** Codex
**Estado:** trigésima sexta remediación de la auditoría técnica, implementada y validada localmente.

- `GET /api/tickets/export.csv` conserva el mismo `WHERE` y orden Drizzle del listado, pero ejecuta el SQL compilado mediante el cursor `iterate()` de `better-sqlite3`. Ya no materializa todos los tickets ni construye el archivo completo antes de responder.
- Encabezado y filas se serializan como fragmentos con paridad byte a byte respecto del contrato anterior: BOM UTF-8, punto y coma, CRLF, textos entrecomillados, neutralización de fórmulas, fechas de Buenos Aires y ausencia de salto final permanecen iguales.
- La primera fila se prepara antes de enviar headers para conservar los errores HTTP de preflight. Después, `pipeline` regula backpressure; la fuente anticipa como máximo un fragmento fuera del buffer acotado del destino. Un aborto o error cierra explícitamente el iterador y libera el statement.
- Cada descarga tiene además un deadline absoluto, configurable con `TICKET_CSV_EXPORT_TIMEOUT_MS` y de cinco minutos por defecto. El timer no mantiene vivo el proceso, se limpia de forma idempotente y aborta el pipeline/cursor; así un cliente lento no puede retener indefinidamente el snapshot lector ni favorecer crecimiento ilimitado del WAL.
- Las regresiones prueban múltiples chunks, parámetros enlazados, cero uso de `.all()`, paridad exacta, backpressure, desconexión, deadline sin esperas reales, fallos de lectura inicial y tardío, filtros de fecha compilados por Drizzle y las integraciones previas de headers/filtros/orden. TypeScript, la suite completa de backend y `git diff --check` aprobaron. No se hizo push.

## 2026-08-06 — Agregaciones SQL y calendario estable del Dashboard

**Agente:** Codex
**Estado:** trigésima quinta remediación de la auditoría técnica, implementada y validada localmente.

- Los endpoints de estadísticas y motivos dejaron de materializar todos los tickets para contarlos en JavaScript. Totales, vencidos, finalizados y promedio se resuelven mediante una agregación condicional; estados, prioridades y motivos usan `GROUP BY`, conservando el contrato y la exclusión de cuarentena. El ID mínimo formaliza el orden estable de primera aparición y los valores históricos fuera del catálogo siguen incluidos en los desgloses.
- Las lecturas necesarias para los KPIs comparten una transacción diferida y, por lo tanto, el mismo snapshot de SQLite. Los contadores “hoy” permanecen globales respecto del período seleccionado, igual que antes.
- El día operativo se calcula explícitamente en `America/Argentina/Buenos_Aires`, sin depender de la zona horaria del proceso. El handler permite inyectar el reloj en pruebas, lo que cubre medianoche, rango inclusivo, período invertido y contratos Zod de manera determinista.
- Se agregaron pruebas puras de las consultas y pruebas HTTP reales para rango, cuarentena, orden, promedio y errores. TypeScript y las 172 pruebas de backend aprobaron; una revisión independiente no dejó hallazgos críticos ni altos. No se hizo push.

## 2026-08-06 — Índices temporales medidos para lecturas operativas

**Agente:** Codex
**Estado:** trigésima cuarta remediación de la auditoría técnica, implementada y validada localmente.

- La migración aditiva `0015` incorpora cuatro índices compuestos: `tickets(fecha_creacion, id)`, `tickets(fecha_limite, id)`, `tickets(fecha_resolucion, id)` y `seguimientos(fecha_creacion, id)`. Cubren actividad reciente, vencidos y conteos diarios sin modificar datos ni contratos HTTP.
- La selección se basó en los planes reales de las consultas del producto. La regresión crea datos representativos, compara resultados antes y después de migrar y exige con `EXPLAIN QUERY PLAN` búsquedas por cada índice, además de eliminar los ordenamientos temporales de los tres listados cronológicos medidos.
- No se agregó un índice para la búsqueda libre con `%texto%` ni para el orden visual combinado por fecha/hora: SQLite no puede aprovechar de forma fiable un B-tree convencional en esos casos. Esas optimizaciones requieren, respectivamente, FTS o una clave de orden materializada y quedan separadas para no sumar índices sin beneficio demostrado.
- Schema Drizzle, snapshot, journal y prueba de la cadena completa quedaron alineados. Integridad, claves foráneas, paridad de resultados, `schema:check`, TypeScript y 66 pruebas de base aprobaron; una prueba de symlink permanece omitida de forma esperada en Windows. No se hizo push.

## 2026-08-06 — Cuarentena materializada y transaccional

**Agente:** Codex
**Estado:** trigésima tercera remediación de la auditoría técnica, implementada y validada localmente.

- La clasificación de tickets completamente vacíos deja de recalcular una condición extensa y un `NOT EXISTS` sobre seguimientos en cada listado, contador o gráfico. La migración `0014` hace un backfill exacto hacia la proyección interna `tickets_cuarentena(ticket_id)` sin modificar ni eliminar tickets.
- Triggers de SQLite mantienen esa proyección dentro de la misma transacción ante altas y cambios de tickets, y ante altas, bajas o movimientos de seguimientos. Completar o gestionar un registro lo vuelve visible inmediatamente; si se revierten todos sus datos operativos y no quedan seguimientos, vuelve a cuarentena.
- La regla pura `esTicketVacio` continúa siendo el oráculo previo a persistencia y conserva los marcadores históricos y el mismo conjunto Unicode de espacios. Las consultas públicas resuelven ahora la pertenencia mediante la clave primaria del marcador, sin recorrer `seguimientos`.
- El flujo local conserva compatibilidad con las bases históricas creadas mediante `drizzle-kit push`, que no tienen ledger. Drizzle y el reconciliador cargan la misma `.env` raíz antes de resolver `TICKETS_DB_PATH`; luego `push` encadena una reconciliación basada directamente en la SQL versionada `0014`. El backend valida tabla, FK, registro/hash exacto de la migración, cuerpos literales de los cinco triggers y paridad real de marcadores antes de cualquier servicio. La reparación ocurre bajo `BEGIN IMMEDIATE`; una base con ledger incompleto, trigger adicional o tabla incompatible falla cerrada en vez de ser maquillada.
- Los fixtures de rutas, importación y truncate ejercitan la proyección. La suite cubre paridad de backfill, cadena completa, instalación legacy, no-op migrado, trigger alterado, rollback de DDL, todos los campos funcionales, metadatos ignorados, múltiples seguimientos, movimientos, cascadas, integridad y planes `EXPLAIN`.
- Validaciones: 65 pruebas de base (64 aprobadas y una omisión esperada de symlink en Windows), 166/166 de backend y quality gate completo aprobados. También se ejecutó el `push` real sobre una SQLite temporal y el bundle construido arrancó contra ella con readiness `200`; schema Drizzle, codegen, TypeScript, builds, formato e integridad SQLite quedaron verdes. Las regresiones incluyen `.env` raíz, alteración de literales SQL y desincronización manual de marcadores. Persisten únicamente los avisos frontend ya conocidos de sourcemaps y chunk mayor a 500 kB. No se hizo push.

## 2026-08-06 — Índice medido para seguimientos

**Agente:** Codex
**Estado:** trigésima segunda remediación de la auditoría técnica, implementada y validada localmente.

- `seguimientos(ticket_id, fecha_creacion, id)` tiene ahora un índice compuesto versionado. Resuelve tanto la comprobación de pertenencia usada por la cuarentena como el historial cronológico de un ticket sin recorrer toda la tabla ni crear una tabla temporal para ordenar.
- La decisión se tomó sobre `EXPLAIN QUERY PLAN`: antes aparecían `SCAN seguimientos` y `USE TEMP B-TREE FOR ORDER BY`; la regresión exige ahora `SEARCH seguimientos USING INDEX seguimientos_ticket_fecha_id_idx` y ausencia del sort temporal en el historial. Una medición sintética de diagnóstico sobre 10.000 tickets redujo el conteo visible de aproximadamente 338 ms a 40 ms, pero el tiempo no se usa como aserción frágil ni como SLO.
- La migración `0013` preserva las filas existentes, declara el mismo índice en el schema y forma parte de la cadena completa. No mezcla todavía la materialización de cuarentena, que queda como el siguiente cambio independiente.
- Validaciones: 55 pruebas de base (54 aprobadas y una omisión esperada de symlink en Windows), migración focalizada, `EXPLAIN`, integridad SQLite, schema Drizzle, TypeScript y `git diff --check` aprobados.

## 2026-08-06 — Ledger durable y recuperación de releases interrumpidas

**Agente:** Codex
**Estado:** trigésima primera remediación de la auditoría técnica, implementada y validada localmente.

- El despliegue incorpora un estado durable fuera del checkout en `/var/lib/ticketsadmin/releases/release-state.json`. El directorio operativo debe ser real, privado, propiedad del runner y modo `0700`; el documento se publica atómicamente con modo `0600` y falla cerrado si está vacío, corrupto, sustituido, tiene un contrato desconocido o permisos incorrectos.
- El contrato diferencia `current`, `previous` y `pending`. La intención de rollout se registra como write-ahead después del checkpoint y antes de invocar Compose; una candidata solo se promociona tras demostrar IDs exactos, topología, health, mount `/data`, exclusividad del volumen y los tres smokes HTTP.
- El siguiente intento reconcilia un `pending` bajo el mismo `flock`: puede confirmar la candidata exacta ya saludable, reconocer un baseline exacto ya recuperado o recrear un baseline compatible por sus dos IDs inmutables. Esto permite retomar de forma determinista después de `SIGKILL`, caída del runner o reinicio del host sin elegir por tags ni adivinar una release.
- Un rollback de aplicación nunca restaura SQLite. Checkpoint, release y recuperación de datos permanecen separados; tampoco se elimina el volumen, se ejecuta `compose down` ni se hace prune global.
- Legacy y fix-forward solo pueden consolidarse hacia adelante si la candidata exacta ya está completamente verificada; una topología parcial exige intervención manual. En un primer deploy interrumpido no existe `current`: solo se reintenta o contiene la candidata identificada, conservando ledger y volumen.
- La contención tiene su propia fase write-ahead `containing_first_deploy`, por lo que puede repetirse después de otro corte. Los estados terminales se reanudan sin editar el JSON mediante `workflow_dispatch`, ligados al `attemptId` y a la `generation` exactos; una autorización obsoleta o una topología desconocida falla cerrada.
- La recuperación manual falla cerrada si falta el ledger, si cambió su generación o si el contrato Compose deriva. Un retry autorizado legacy/fix-forward persiste primero la fase `retrying_forward`: aun si el proceso se corta antes de Compose, el siguiente intento solo puede volver a verificar y promover la candidata registrada, nunca consolidar el baseline incompatible.
- Validaciones: las 35 regresiones Linux del ledger, rollout y rollback aprobaron sin omisiones; `bash -n`, TypeScript y ShellCheck aprobaron. El quality gate completo confirmó codegen, esquema Drizzle, suites del workspace y builds; solo permanecen los avisos frontend ya conocidos de sourcemaps y chunk mayor a 500 kB. Una revisión independiente no dejó P0/P1 abiertos.
- Documentación afectada: contrato operativo de deploy, arquitectura y esta bitácora.

## 2026-08-06 — Rollback automático de aplicación compatible

**Agente:** Codex
**Estado:** trigésima remediación de la auditoría técnica, implementada localmente.

- Backend y frontend incorporan tres contratos de compatibilidad: epoch de runtime, identidad Git del árbol completo de migraciones Drizzle y SHA-256 de la configuración Compose canonicalizada. El hash elimina imagen/build y reemplaza las tres credenciales por sentinels antes de calcularse; una credencial omitida invalida el contrato.
- El orquestador identifica el baseline y las candidatas por IDs inmutables, exige coherencia entre ambos componentes y solo habilita rollback cuando runtime, base y Compose coinciden. Ante un fallo posterior al comienzo del rollout, recrea el par baseline exacto y vuelve a verificar topología, imágenes, health, mount, exclusividad del volumen y los tres smokes HTTP; el job conserva el error original.
- Un primer deploy fallido no inventa un baseline: inspecciona todos los contenedores del proyecto, demuestra servicio e imagen candidata y detiene únicamente esos IDs. En ningún camino se restaura SQLite, se elimina el volumen, se ejecuta `compose down` ni se hace prune global.
- La adopción histórica y una transición fix-forward solo pueden autorizarse mediante inputs mutuamente excluyentes de un `workflow_dispatch`; los push automáticos no reciben excepciones. La aprobación queda ligada al `release-id` y a los dos IDs de imagen capturados bajo el mismo lock. También se reconoce de forma controlada el formato de release inmediatamente anterior a los labels de compatibilidad.
- El contrato Compose, proyecto y volumen se recalculan inmediatamente antes del `up` candidato y del rollback. El runbook aclara la naturaleza cooperativa del lock y que `SIGKILL` o reinicio todavía requieren intervención hasta incorporar el ledger durable.
- Los E2E ejecutan el `main` real con Docker/Git/curl/jq simulados: upgrade exitoso con checkpoint, reemplazo parcial y rollback exacto, rechazo/aceptación legacy, adopción pre-ledger, baseline o ID discordante y credencial Compose ausente. Auditan todos los comandos Docker, los mounts readonly, la identidad de helpers y que ningún sentinel secreto llegue a stdout, stderr, outputs, manifiestos o eventos.
- Validaciones: `pnpm run quality` aprobó 391 pruebas de workspace (377 ejecutadas y 14 omisiones justificadas por plataforma), codegen, schema Drizzle, TypeScript y ambos builds. Los ocho E2E de release aprobaron en Linux sin omisiones y una auditoría independiente cerró sin P0/P1. Las imágenes Docker reales se construyeron con los labels nuevos; los tres CLIs empaquetados y `nginx -t` aprobaron sin levantar servicios. Persisten únicamente los avisos frontend ya registrados de sourcemaps y chunk mayor a 500 kB.
- Archivos principales: workflow, Compose, Dockerfiles, orquestador de release, E2E de rollback y documentación operativa/arquitectónica.

## 2026-08-06 — Checkpoint automático y rollout serializado

**Agente:** Codex
**Estado:** vigesimonovena remediación de la auditoría técnica, implementada localmente.

- `scripts/deploy/deploy-release.sh` concentra bajo un solo `flock` la identidad de candidatas, baseline, freshness de `main`, checkpoint, revalidación, `compose up`, inspección post-rollout y smoke. Build permanece fuera del lock; ninguna credencial viaja por argumentos ni al helper.
- La topología falla cerrada ante pares parciales/duplicados, servicios orphan, health degradado, mount incorrecto, volumen huérfano o cualquier otro contenedor activo o detenido que conserve `ticketsadmin_tickets_data`. La ausencia del volumen se decide mediante un listado exitoso y coincidencia exacta: un error del daemon nunca se interpreta como primer deploy.
- Backend y frontend comparten ahora `io.ticketsadmin.release-id` además de revisión/origen OCI. La adopción del `origin/main` histórico solo acepta una vez el par saludable sin labels y con las referencias Compose originales; cualquier baseline mixto o manual se rechaza.
- La candidata backend crea el snapshot desde el volumen readonly en un helper sin red, capabilities ni secretos y con expiración. El host extrae por `docker exec ... cat`, compara SHA-256/bytes/páginas y otro contenedor aislado con watchdog ejecuta `verify-db.mjs` sobre el staging readonly.
- El `.db` se publica mediante hardlink no-clobber y se vuelve a fijar por inode/hash. El manifiesto v1, sin entorno ni secretos, se sincroniza y publica último como marcador de completitud. Nunca se restaura SQLite por un fallo de release.
- Compose recibe los IDs exactos, no las referencias, y después del `up` se comprueban nuevamente cantidad de contenedores, imagen ejecutada, health, mount y exclusividad del volumen antes de los tres smokes HTTP.
- El workflow exige herramientas, directorios `0700` y lock `0600` preprovisionados. `.gitattributes` fija LF para shell; el runbook documenta preparación, adopción y operación cooperativa.
- Pruebas: contratos estáticos del workflow/orquestador, sintaxis Bash, parser duplicado y un harness Linux real con Docker/Git/curl/jq simulados que recorrió el primer deploy completo y confirmó IDs/outputs sin filtrar sentinels. El rollback de aplicación sobre las imágenes baseline queda en el siguiente commit; nunca incluirá restauración automática de datos.
- Validaciones: 378 pruebas totales aprobadas por `pnpm run quality` (375 ejecutadas y 3 omisiones justificadas por Windows), sin drift de OpenAPI ni schema, con TypeScript y builds completos. Un contenedor Linux ejecutó además las 14 pruebas portables sin omisiones. Se construyeron las dos imágenes Docker reales, se inspeccionaron sus IDs/labels y aprobaron los tres CLIs empaquetados y `nginx -t`; solo permanecen los avisos frontend ya registrados de sourcemaps y chunk mayor a 500 kB.
- Archivos principales: workflow, Compose, Dockerfiles, orquestador de release, pruebas y documentación operativa/arquitectónica.

## 2026-08-06 — Evidencia SQLite transportable para el predeploy

**Agente:** Codex
**Estado:** vigesimoctava remediación de la auditoría técnica, implementada localmente.

- `backup-db.mjs --json`, ejecutado directamente sin el wrapper de pnpm, reabre el pathname ya publicado y emite exactamente una evidencia v1 con operación, formato single-file, SHA-256, bytes, páginas y los checks de integridad/FK/schema. El modo humano anterior se conserva.
- El nuevo `verify:db` abre una copia transportada en readonly, rechaza WAL/sidecars y vuelve a ejecutar todos los checks. `--expect-evidence` ignora las rutas y compara estrictamente almacenamiento, SHA-256, bytes y páginas.
- Los errores JSON no incluyen stack ni variables de entorno: usan contrato, código y exit estables para distinguir argumentos/evidencia inválidos, fallo físico y mismatch. Los CLIs siguen sin imprimir API keys ni bootstrap.
- Backend empaqueta `backup-db.mjs`, `verify-db.mjs` y `restore-db.mjs`; el build ejecuta el `--help` de los tres artefactos finales como smoke real.
- Las regresiones E2E crean un backup, simulan su transporte a otra ruta, prueban evidencia alterada, argumentos/contratos ajenos y una segunda SQLite físicamente válida con igual tamaño y páginas: esta última se rechaza solamente por SHA-256.
- Archivos principales: contratos/CLIs en `scripts/src`, empaquetado backend, scripts del workspace, pruebas y documentación operativa.
- Validaciones: 15 pruebas de scripts y 364 pruebas totales aprobadas. `pnpm run quality` confirmó codegen sin drift, schema Drizzle, todos los tests, TypeScript y builds; el backend ejecutó además los tres smokes de CLI y el envelope JSON de los bundles finales. Solo permanecen los avisos frontend ya registrados de sourcemaps y chunk mayor a 500 kB.

## 2026-08-06 — Imágenes de release identificables y despliegue sin rebuild

**Agente:** Codex
**Estado:** vigesimoséptima remediación de la auditoría técnica, implementada localmente.

- Compose dejó de depender de tags implícitas: backend y frontend reciben referencias separadas, con defaults locales explícitos y `pull_policy: never` para que el servidor no sustituya un artefacto por una descarga inesperada.
- Cada ejecución de GitHub Actions usa un tag único que combina SHA completo, `run_id` y `run_attempt`. Las imágenes registran además revisión y repositorio en labels OCI.
- Después del build se inspeccionan el ID y la revisión de ambas candidatas; también se ejecutan los bundles de backup/restore y `nginx -t` sin red. El rollout usa `--no-build`, por lo que solo puede arrancar el par previamente comprobado.
- Se eliminó el `docker image prune -f` global: el runner comparte host con otros proyectos y no debe limpiar artefactos fuera de `ticketsAdmin` ni destruir el futuro punto de rollback.
- `.dockerignore` excluye ahora el store local de pnpm, temporales y cobertura. La construcción diagnóstica reveló que esos directorios inflaban el contexto de 166,20 kB a 403,50 MB; no forman parte de ningún artefacto de producción.
- Los Dockerfiles copian primero manifests y lockfile, instalan dependencias y recién después incorporan el código. Cambiar TypeScript deja de invalidar innecesariamente la capa costosa de `pnpm install`.
- Archivos principales: Compose, ambos Dockerfiles, workflow de deploy, contrato operativo y pruebas estáticas del pipeline.
- Validaciones: Compose aceptó la configuración; las 6 pruebas de scripts y las 355 pruebas totales aprobaron. `pnpm run quality` confirmó además codegen sin drift, schema Drizzle, TypeScript y builds. Dos construcciones Docker reales produjeron ambos artefactos, ejecutaron sus CLIs y validaron Nginx; solo permanecen los avisos frontend ya registrados de sourcemaps y chunk mayor a 500 kB.

## 2026-08-06 — Restauración SQLite offline con recovery previa

**Agente:** Codex
**Estado:** vigesimosexta remediación de la auditoría técnica, implementada localmente.

- Se agregó una primitiva separada del proceso web: exige confirmación offline, canonicaliza rutas y aliases, rechaza destinos simbólicos o relaciones base/sidecar y coordina intentos mediante un lock exclusivo cuya identidad `dev/ino` bigint se revalida durante toda la operación.
- Un destino existente publica primero una recovery privada, verificada y no-clobber, y la fija por inode más SHA-256 para impedir que un rollback consuma una copia sustituida; recién después consolida WAL y debe poder volver a journal `DELETE`. Una conexión activa, un lock/recovery sustituido o sidecars persistentes hacen fallar cerrado sin eliminar archivos ajenos.
- Cada backup privado se normaliza a journal `DELETE` antes de verificar y publicar; el verificador rechaza headers WAL o sidecars sin crearlos ni consumirlos. Así backup, recovery, candidato instalado y rollback son snapshots autocontenidos y comparan integridad, FK, esquema, bytes, páginas y SHA-256 estable. Un destino existente usa `rename` atómico; uno originalmente ausente usa hard link no-clobber, por lo que una aparición concurrente nunca se sobrescribe sin recovery.
- Los temporales viven en staging `0700`, conservan `uid`/`gid`/modo tradicional, hacen `fsync` y ya no se limpian recursivamente: solo se desvinculan nombres e inodes conocidos y el directorio debe quedar vacío. Un staging reemplazado se preserva.
- Una falla posterior a la publicación repone la base anterior solo si el path visible continúa siendo exactamente el inode publicado. Si también falla ese rollback, recovery, staging y lock se conservan deliberadamente para intervención manual.
- El CLI local y su bundle Docker exigen `--confirm-stopped`; no ofrecen `--force`. La restauración de un volumen vacío requiere además `--allow-missing-target`; el build ejecuta el `--help` del artefacto final como smoke real.
- El runbook separa rollback de aplicación y recuperación de datos: detiene y verifica el runner dedicado, falla ante cualquier servicio activo, usa una release compatible ya identificada, reinicia los mismos contenedores con `compose start` y nunca restaura SQLite automáticamente tras un deploy fallido.
- Archivos principales: primitiva/tipos/CLI de restore, helpers operativos, empaquetado backend, suites de base/scripts, arquitectura y runbook.
- Validaciones: 30 escenarios de restauración y 11 de backup; 53 pruebas de `@workspace/db` (52 aprobadas y una omitida localmente porque Windows no permitió crear el symlink final), 5 de scripts y 354 pruebas totales. `pnpm run quality` aprobó codegen sin drift, schema Drizzle, tests, typecheck y builds; tres revisiones independientes cerraron con 0 P0/P1/P2. Permanecen solo los avisos ya conocidos de sourcemaps en cuatro componentes UI y del chunk frontend mayor a 500 kB.

## 2026-08-05 — Backup SQLite endurecido y probado

**Agente:** Codex
**Estado:** vigesimoquinta remediación de la auditoría técnica, implementada localmente.

- La copia online conserva commits que todavía están en WAL y excluye transacciones abiertas. Antes de publicarse verifica `integrity_check`, claves foráneas y tablas más columnas históricas mínimas de `tickets` y `seguimientos`; el ledger de migraciones no se exige porque `drizzle-kit push` es un origen local válido.
- Los archivos con PII y hashes se construyen dentro de un staging `0700` y quedan en modo `0600` en POSIX, incluso con un umask permisivo. Archivo y entrada de directorio se sincronizan donde la plataforma lo soporta; Windows conserva la publicación segura pero requiere ACL privadas en el directorio.
- La publicación mantiene la garantía no-clobber mediante hard link: dos productores concurrentes dejan exactamente una copia completa y nunca pisan un destino. Sus temporales privados se eliminan tanto en éxito como ante errores.
- Se centralizaron verificación y operaciones de archivo para sostener el siguiente bloque de restauración sin duplicar reglas.
- Las regresiones reales cubren WAL confirmado, escritura no confirmada, corrupción, esquema ajeno, FK huérfana, destino existente, mismo inode, permisos, concurrencia y limpieza de temporales.
- Archivos principales: `lib/db/src/backup.ts`, `lib/db/src/sqlite-verification.ts`, `lib/db/src/sqlite-files.ts`, suite de base y documentación operativa.
- Validaciones: 8 regresiones específicas, 20 pruebas de `@workspace/db` y 320 pruebas totales aprobadas; `pnpm run quality` confirmó además codegen sin drift, cadena Drizzle, typecheck y builds de producción. Permanecen únicamente los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Readiness aplicada al despliegue

**Agente:** Codex
**Estado:** vigesimocuarta remediación de la auditoría técnica, implementada localmente.

- El healthcheck del backend dejó de aceptar liveness como disponibilidad: consulta `/api/readyz`, exige HTTP 200 y el cuerpo exacto `{"status":"ready"}`. El período inicial de 60 segundos cubre migraciones, bootstrap y reconciliaciones sin retrasar un éxito temprano.
- El frontend queda healthy únicamente si Nginx sirve el mount point real de React y el proxy devuelve el JSON exacto de readiness. Las descargas se capturan antes del grep para conservar el código de error de `wget`; una fallback SPA, un 503 o una respuesta truncada no pueden producir un falso positivo.
- Compose espera ambos servicios durante hasta 180 segundos. `depends_on.restart` reinicia Nginx ante reemplazos explícitos del backend para renovar su DNS interno; se documentó que no responde a degradaciones, auto-restarts ni reemplazos externos.
- El runner valida antes del build que Docker Compose sea al menos 2.17, soporte `--wait`/`--wait-timeout`, disponga de `curl` y acepte la configuración. Tras el rollout hace smoke sobre API directa, SPA y API proxied. En ese commit el prune ocurría solo después del éxito; el 2026-08-06 se retiró por afectar globalmente al host compartido.
- Se agregaron regresiones estáticas por bloque de servicio/step, normalizadas para LF/CRLF, que evitan coincidencias accidentales entre SPA y API y verifican orden, condiciones, contenido, límites de diagnóstico y proxy Nginx.
- Archivos principales: Compose, workflow de deploy, pruebas operativas, arquitectura y runbook.
- Validaciones: `docker compose config --quiet`, 6 pruebas focalizadas y 312 pruebas totales aprobadas. El gate completo se ejecuta sobre el commit local antes de continuar al siguiente bloque.

## 2026-08-05 — Readiness real del backend

**Agente:** Codex
**Estado:** vigesimotercera remediación de la auditoría técnica, implementada localmente.

- Se separaron los contratos operativos: `GET /api/healthz` es liveness estática y responde únicamente `200 { status: "ok" }`; `GET /api/readyz` publica `200 { status: "ready" }` o `503 { status: "unavailable" }`. Ambos endpoints son públicos, usan `Cache-Control: no-store` y OpenAPI/codegen conserva tipos distintos para éxito y error.
- El proceso mantiene un estado monótono `starting → ready → draining`. Solo se anuncia listo desde el evento HTTP `listening`; una señal o error inicia el drenaje como primera acción síncrona y el estado nunca puede volver a `ready`, incluso ante una carrera de arranque.
- Readiness falla cerrado fuera de la fase lista. Dentro de ella verifica que el handle SQLite siga abierto y ejecuta una lectura acotada de `tickets.id` y `tickets.version`, validando conexión y schema mínimo sin conteos, escrituras ni recorridos completos. Un error se registra internamente, pero la respuesta no filtra excepciones, paths ni detalles del motor.
- La ruta quedó construible por inyección para probar dependencias fallidas sin cerrar la base compartida. Se cubrieron el estado irreversible, la ausencia de sondas durante arranque/drenaje, recuperación de un fallo transitorio, schema ausente, handle cerrado, separación exacta de schemas Zod, respuesta HTTP genérica y orden del apagado.
- Archivos principales: contrato y artefactos OpenAPI, control y sonda de readiness, router de health, composition root/ciclo de salida, pruebas y documentación técnica.
- Validaciones: 16 pruebas focalizadas, schema Drizzle, 166 pruebas backend y 308 pruebas totales aprobadas; typecheck y builds de producción completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Apagado controlado del backend

**Agente:** Codex
**Estado:** vigesimosegunda remediación de la auditoría técnica, implementada localmente.

- El proceso captura `SIGTERM` y `SIGINT` mediante un controlador idempotente: detiene nuevas revisiones automáticas, deja de aceptar conexiones HTTP, pone el registro SSE en drenaje irreversible y espera en paralelo los sockets y la revisión de prioridad que ya estaban activos. Un request SSE aceptado antes de la señal pero autenticado después recibe `503` y no puede reabrir el stream.
- `server.close()` puede resolver aunque siga vivo un handler async cuyo cliente abortó. Por eso SQLite no se cierra ahí: queda registrado un cierre síncrono en `beforeExit`, cuando Node ya no tiene trabajos libuv capaces de reanudar esos handlers. La salida forzada nunca intenta cerrar una base potencialmente en uso.
- El deadline de 20 segundos permanece referenciado durante el drenaje visible y luego pasa a `unref`: permite una salida natural, pero todavía fuerza sockets y código de error si un trabajo huérfano mantiene vivo el proceso. El log de ese camino se vacía con un fusible acotado antes de salir.
- El runner de prioridad conserva ahora la promesa de la ejecución lanzada por su intervalo y expone una espera explícita; detener el timer ya no pierde el trabajo que estaba en curso.
- El backend de larga vida reemplaza al shell mediante `exec`, por lo que recibe directamente la señal de Docker. Compose reserva 30 segundos antes de `SIGKILL`, dejando margen al deadline interno y al log final.
- Se agregaron pruebas deterministas, sin señales reales ni esperas temporales como condición de éxito, para idempotencia, orden de drenaje, watchdog, `beforeExit`, cliente HTTP abortado, alta SSE tardía, wiring de señales, configuración Docker y espera del runner periódico.
- Residual deliberado: durante `dist/migrate.mjs` el shell todavía es PID 1 y los handlers se instalan después del bootstrap de aplicación. Separar la migración en un servicio one-shot y hacer cancelable todo el startup requieren otro bloque; las migraciones SQLite actuales son transaccionales y este commit no mezcla esa reestructuración.
- Validaciones: 18 pruebas focalizadas, 160 pruebas backend y 302 pruebas totales aprobadas; `pnpm run quality` también verificó codegen sin drift, cadena Drizzle, typecheck y builds de producción.

## 2026-08-05 — Quality gate reproducible antes del deploy

**Agente:** Codex
**Estado:** vigesimoprimera remediación de la auditoría técnica, implementada localmente.

- Se fijó `pnpm@11.13.1` mediante `packageManager`, alineado con Node 24, para que local, GitHub Actions y Docker no elijan versiones distintas del gestor.
- `pnpm run codegen:check` regenera el cliente React Query y los schemas Zod y consulta `git status --porcelain` sobre ambos árboles. El gate detecta tanto archivos versionados modificados como tipos nuevos sin agregar, caso que `git diff` por sí solo omite.
- `pnpm run quality` encadena codegen sin drift, `drizzle-kit check`, las suites completas, typecheck y builds. Es el único comando que usan los workflows para evitar dos definiciones divergentes de calidad.
- El workflow reutilizable `Quality` corre en `ubuntu-latest` para cada pull request y también puede ejecutarse manualmente. `Deploy` lo invoca primero y el job self-hosted queda condicionado a su resultado; una revisión fallida no toca los contenedores.
- La exclusión mutua cubre el workflow completo y el runner compara el SHA con el `main` remoto antes de construir y nuevamente antes de reiniciar, evitando desplegar una ejecución que quedó obsoleta durante el build. El job self-hosted tiene un límite de 45 minutos. Las API keys reales dejaron de estar disponibles para checkout/build y solo se inyectan en el step que recrea los servicios; Compose recibe placeholders no sensibles durante el build.
- Se documentaron el comando local, el flujo PR/deploy y el alcance exacto del gate. Este commit no agrega todavía espera de health, smoke, backup previo ni rollback automático: quedan separados en los siguientes bloques operativos.
- Validaciones: detección positiva de un archivo generado no trackeado, `pnpm run codegen:check`, 291 pruebas y builds/typecheck completos mediante `pnpm run quality`.

## 2026-08-05 — Control optimista end-to-end de tickets

**Agente:** Codex
**Estado:** vigésima remediación de la auditoría técnica, implementada localmente.

- OpenAPI expone `Ticket.version` como entero positivo, requerido y de solo lectura. Cada `TicketUpdate` exige `expected_version`, al menos un campo editable y rechaza propiedades ajenas; el codegen propagó tipos/validadores de campo y el backend aplica además la whitelist y la cardinalidad del objeto.
- `PATCH /tickets/:id` usa `BEGIN IMMEDIATE`, compara la versión antes de evaluar un no-op y repite la condición en el UPDATE. Una escritura real incrementa dato + versión y crea su seguimiento en la misma transacción.
- Un snapshot viejo recibe `409` con `code: TICKET_VERSION_CONFLICT`, ticket y revisiones esperada/actual. No cambia datos, asignación ni fechas, no audita y no emite SSE. Un no-op vigente conserva la versión.
- Gestión, datos de contacto y CRUD Admin congelan datos + versión al abrir. Los helpers siguen produciendo change-sets mínimos y agregan la precondición solo después de descartar `{}`; nunca toman la versión viva refrescada por SSE.
- Ante conflicto, los tres editores permanecen abiertos y conservan el draft para que pueda revisarse o copiarse. Guardar queda bloqueado hasta que la persona elige explícitamente descartar sus cambios y cargar la revisión actual; si esa recarga falla, el draft sigue intacto.
- Una respuesta exitosa solo actualiza la caché si no existe ya una versión más nueva recibida por SSE/refetch. Las promociones automáticas toman la versión autoritativa de `UPDATE RETURNING` y la incluyen en `ticket_actualizado` después del commit.
- Se agregaron regresiones para validación de precondiciones, no-op, rollback, retry con versión nueva, dos PATCH competidores (uno 200 y uno 409), baseline congelado y traducción estricta del código de error.
- Archivos principales: OpenAPI/codegen, ruta PATCH, tres editores, helper de versión, suites backend/frontend y documentación operativa.
- Validaciones: 291 pruebas correctas (backend 149, frontend 77, base de datos 12, política compartida 4, ingesta 48 y scripts 1), codegen, typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Base monotónica para concurrencia de tickets

**Agente:** Codex
**Estado:** decimonovena remediación de la auditoría técnica, implementada localmente.

- Se agregó `tickets.version`, entero no nulo con default 1 y restricción positiva. La migración aditiva `0012` preserva filas históricas, evita reconstruir la tabla y deja el mismo default para altas futuras.
- La versión no forma parte de `TicketInput`, CSV ni datos funcionales: webhook, alta administrativa e importadores no pueden imponerla desde afuera.
- Las promociones automáticas de prioridad y la reconciliación conservadora de categorías incrementan la revisión mediante `version = version + 1` en el mismo UPDATE protegido por compare-and-set.
- Un fallo al insertar la auditoría revierte prioridad y versión juntas; repetir una promoción o reconciliación sin cambios no vuelve a incrementar la fila.
- Se actualizaron las fixtures que representan el schema actual y se agregó una prueba de migración para históricos, defaults, constraint, integridad e idempotencia de la cadena completa.
- Archivos principales: schema/migración Drizzle, mutadores internos, fixtures, pruebas y documentación.
- Validaciones: 282 pruebas correctas (backend 145, frontend 72, base de datos 12, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — PATCH mínimo en el CRUD administrativo

**Agente:** Codex
**Estado:** decimoctava remediación de la auditoría técnica, implementada localmente.

- El formulario de tickets de Administración dejó de usar un `Record<string, string>` y casts `any`: altas, ediciones y nombres de campo comparten ahora un contrato tipado.
- Al abrir una fila se captura un baseline independiente. La edición compara contra ese snapshot y envía únicamente hora, contacto, motivo, resumen, notas, audio, estado o prioridad que realmente cambiaron; `conversation_id` continúa deshabilitado y nunca entra en el PATCH.
- Borrar teléfono, DNI, empresa, email, resumen, notas o audio produce `null`, no un string vacío ni una omisión accidental. Las altas manuales, por separado, recortan los requeridos y omiten opcionales vacíos.
- Un refresco SSE del listado no modifica el baseline abierto. Guardar un formulario sin diferencias cierra el diálogo con una confirmación local y no genera request ni seguimiento espurio.
- Se agregaron pruebas puras para alta determinista, normalización, limpieza explícita, PATCH mínimo, no-op e independencia frente a un ticket actualizado por SSE.
- Archivos principales: formulario/helper de tickets administrativos, pantalla Admin, pruebas y documentación.
- Validaciones: 281 pruebas correctas (backend 145, frontend 72, base de datos 11, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Baseline inmutable para datos de contacto

**Agente:** Codex
**Estado:** decimoséptima remediación de la auditoría técnica, implementada localmente.

- `TicketDataEditDialog` dejó de comparar el formulario contra el objeto `ticket` vivo. Al abrir crea dos objetos separados: baseline autoritativo y draft editable; el PATCH se calcula únicamente entre ambos.
- Si SSE actualiza teléfono, DNI, empresa, email, motivo u otro dato mientras el diálogo está abierto, ese valor remoto no se interpreta como una edición inversa del usuario y no vuelve al backend desde un formulario stale.
- El baseline se renueva al abrir o cambiar de ticket, pero deliberadamente permanece congelado durante la edición. El submit también rechaza programáticamente un no-op además de mantener el botón deshabilitado.
- Se eliminó el helper ambiguo que aceptaba un `Ticket` vivo y quedó una única API explícita `buildFunctionalTicketUpdateFromBaseline`.
- Se agregó una regresión pura que reproduce un teléfono actualizado por SSE mientras el draft cambia solo el email y exige un PATCH exclusivo de email.
- Archivos principales: diálogo de datos, helper/test de edición y documentación.
- Validaciones: 275 pruebas correctas (backend 145, frontend 66, base de datos 11, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — PATCH mínimo para la gestión del ticket

**Agente:** Codex
**Estado:** decimosexta remediación de la auditoría técnica, implementada localmente.

- El diálogo de estado dejó de enviar siempre una instantánea completa de estado, prioridad, notas y progreso. Captura un baseline autoritativo al abrirse y construye un `TicketUpdate` solo con diferencias reales.
- Si un SSE refresca el ticket mientras el diálogo permanece abierto, los campos que la persona no tocó se omiten y no pisan el trabajo de otro usuario ni una promoción automática de prioridad. La fecha límite administrativa se compara contra el mismo baseline, no contra el ticket vivo.
- Elegir un estado actualiza visualmente el slider al progreso canónico del nuevo paso; si luego se ajusta manualmente, se respeta ese valor explícito. Volver al estado original restaura también el progreso capturado al abrir, incluso en tickets históricos no canónicos. Cambios aislados de prioridad, progreso o notas permanecen aislados; borrar notas produce `null` y guardar sin cambios no llama a la API.
- Se reemplazó el estado `any` por un formulario tipado y se centralizó el mapa estado/progreso para evitar dos fuentes divergentes.
- Se agregaron pruebas puras para PATCH mínimo, estado/progreso acoplados, borrado de notas, progreso aislado y no-op.
- Archivos principales: `TicketDetail`, helper/test de edición y documentación.
- Validaciones: 274 pruebas correctas (backend 145, frontend 65, base de datos 11, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Contrato nullable preciso para tickets

**Agente:** Codex
**Estado:** decimoquinta remediación de la auditoría técnica, implementada localmente.

- OpenAPI distingue propiedades ausentes de valores nulos: todos los campos que Drizzle devuelve siempre en `Ticket` y `Seguimiento` quedaron requeridos, aunque su valor admita `null`; `TicketDetail.seguimientos` también es obligatorio.
- El codegen eliminó los `?` y `.nullish()` incorrectos en respuestas. Frontend, validadores Zod y backend comparten ahora la forma real de la API sin inventar que `progreso`, fechas o datos de contacto pueden omitirse.
- `TicketUpdate.notas` acepta `null`; tanto `null` como texto vacío se persisten como SQL `NULL` y cada cambio real continúa auditado. `fecha_limite` y `fecha_resolucion` deliberadamente siguen rechazando `null` para preservar las reglas automáticas de resolución y reapertura.
- Se agregaron pruebas HTTP contra los schemas generados que exigen la presencia de cada propiedad nullable y del historial, además de borrado/restauración de notas y auditoría de las tres transiciones.
- Archivos principales: contrato OpenAPI, artefactos generados, PATCH de tickets, pruebas y documentación.
- Validaciones: 268 pruebas correctas (backend 145, frontend 59, base de datos 11, política compartida 4, ingesta 48 y scripts 1), codegen, typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Cierre visible de sesiones revocadas

**Agente:** Codex
**Estado:** decimocuarta remediación de la auditoría técnica, implementada localmente.

- Las revocaciones administrativas de cuenta, rol o contraseña envían `sesion_revocada` a cada stream SSE afectado después de confirmar la transacción y luego cierran la conexión. Una falla al notificar continúa siendo secundaria y no cambia una gestión ya persistida.
- El cierre administrativo quedó separado del cierre técnico: el cambio propio de contraseña rota la cookie y descarta silenciosamente los streams anteriores, por lo que no puede expulsar por carrera a una sesión nueva válida. Reenviar el mismo rol tampoco emite el evento.
- El frontend valida el JSON recibido y descarta campos de tipos inesperados. Ante el evento terminal cierra explícitamente `EventSource`, limpia toda la caché y reemplaza la ruta por la entrada pública. Allí revalida la cookie sin mostrar datos stale: un `401` deja el login y una cookie nueva válida remonta la identidad y el stream. Una caída transitoria conserva la reconexión automática.
- Se agregaron pruebas unitarias para serialización, aislamiento de usuarios, streams rotos, cierres silenciosos y parsing defensivo, además de la prueba HTTP con stream real que exige recibir el evento antes del EOF.
- Archivos principales: registro SSE, rutas administrativas, listener del layout, parser de eventos, pruebas y documentación.
- Validaciones: 266 pruebas correctas (backend 143, frontend 59, base de datos 11, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Revocación al cambiar el rol de un usuario

**Agente:** Codex
**Estado:** decimotercera remediación de la auditoría técnica, implementada localmente.

- `PATCH /admin/users/:id` compara el rol solicitado con el rol autoritativo. Un cambio real actualiza la cuenta y elimina todas sus sesiones dentro de la misma transacción; después del commit cierra sus streams SSE.
- Una cookie previa no puede heredar una promoción ni conservar el rol anterior. Reenviar el mismo `role_id` conserva la sesión y evita expulsiones por formularios que todavía envían snapshots completos.
- Si falla la revocación, también se revierte el cambio de rol. La protección del último SysAdmin y el rechazo de roles inactivos permanecen dentro de la misma decisión transaccional.
- Se agregaron pruebas HTTP con sesión y stream reales para cambio, no-op y rollback forzado de la revocación.
- Archivos principales: ruta administrativa de usuarios, contrato OpenAPI, pruebas RBAC/SSE y documentación.
- Validaciones: 261 pruebas correctas (backend 142, frontend 55, base de datos 11, política compartida 4, ingesta 48 y scripts 1), codegen, typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Importación y truncate atómicos

**Agente:** Codex
**Estado:** duodécima remediación de la auditoría técnica, implementada localmente.

- El importador HTTP y el CLI preparan las filas antes de escribir y ejecutan snapshot, deduplicación e inserts dentro de una única transacción. Un error de persistencia revierte todas las filas insertables; las inválidas conservan su salteo, advertencia y conteo.
- Las corridas reales usan `BEGIN IMMEDIATE` para evitar snapshots obsoletos al competir con otro escritor; `dry_run` usa una transacción diferida, deduplica igual y no crea filas ni secuencias.
- El truncate incluye seguimientos, tickets y reinicio de `sqlite_sequence` en una transacción inmediata. Se eliminó el `catch` amplio que podía ocultar errores y los conteos usan `changes` sin materializar miles de IDs.
- Los eventos SSE permanecen después del commit: una operación fallida no anuncia datos revertidos.
- Se agregaron pruebas HTTP de rollback al fallar el segundo insert, solicitudes simultáneas idempotentes, simulación sin escrituras, rollback total del truncate y reinicio de ambos IDs; el CLI tiene además una prueba real en un proceso separado.
- Archivos principales: rutas administrativas, CLI de importación, suites backend/scripts y documentación.
- Validaciones: 258 pruebas correctas (backend 139, frontend 55, base de datos 11, política compartida 4, ingesta 48 y scripts 1), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Cabeceras HTTP seguras en Nginx

**Agente:** Codex
**Estado:** undécima remediación de la auditoría técnica, implementada localmente.

- Nginx dejó de publicar su versión y elimina defensivamente una eventual firma `X-Powered-By` del upstream.
- SPA, API, SSE y errores reciben siempre `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` y una `Permissions-Policy` que deshabilita sensores, cámara, captura de pantalla, geolocalización, micrófono, pagos y USB, capacidades que la aplicación no utiliza.
- CSP sigue fuera de alcance hasta inventariar explícitamente fuentes Google, audio externo, estilos dinámicos y descargas `blob:`. HSTS y cookie `Secure` esperan un borde TLS real; no se presentó este hardening como sustituto de HTTPS.
- Se agregó una prueba que exige valores exactos, `always` y alcance `server`, para evitar perder cabeceras en una `location` o en respuestas de error.
- Archivos principales: `frontend/nginx.conf`, prueba de configuración y documentación de arquitectura/despliegue.
- Validaciones: 253 pruebas correctas (backend 135, frontend 55, base de datos 11, política compartida 4 e ingesta 48), typecheck y build completos. La imagen Docker del frontend se construyó, `nginx -t` aprobó y un smoke HTTP dentro del contenedor confirmó las cuatro cabeceras y `Server: nginx` sin versión. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — API same-origin sin CORS global

**Agente:** Codex
**Estado:** décima remediación de la auditoría técnica, implementada localmente.

- Se eliminó `cors()` abierto y las dependencias `cors`/`@types/cors`. La UI ya consume `/api` desde el mismo origen por Vite/Nginx; n8n es servidor-a-servidor y no usa la política CORS del navegador.
- Express desactiva `X-Powered-By` antes de montar middlewares. Una prueba HTTP real verifica el healthcheck same-origin, un `Origin` no confiable y su preflight: ninguno recibe `Access-Control-Allow-*` ni revela el framework.
- No se mezclaron TLS, `Secure`, HSTS, CSP ni `trust proxy`: requieren hostname/certificado, migrar consumidores y restringir el acceso directo al backend en commits operativos separados.
- Archivos principales: `backend/src/app.ts`, manifiesto/lockfile, prueba HTTP y documentación de arquitectura/transporte.
- Validaciones: 251 pruebas correctas (backend 135, frontend 53, base de datos 11, política compartida 4 e ingesta 48), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB.

## 2026-08-05 — Hash no reutilizable para sesiones en reposo

**Agente:** Codex
**Estado:** novena remediación de la auditoría técnica, implementada localmente.

- La cookie conserva un bearer aleatorio de 256 bits, pero login, lookup, cambio propio, logout y SSE derivan un hash SHA-256 versionado con separación de dominio. SQLite y el registro en memoria de SSE ya no conservan el raw reutilizable.
- El valor persistido usa `sha256:<64 hex>`: aunque se copie desde la base, el extractor estricto no lo acepta como cookie. La columna física histórica `token` se mantiene para rollback estructural y Drizzle la expone como `token_hash` para impedir confusiones en código.
- `0011_invalidate_plaintext_sessions.sql` revoca una sola vez las sesiones anteriores. `purgeUnsafeStoredSessions()` corre antes del seed y del puerto, elimina raws, prefijos falsos, mayúsculas, longitudes y caracteres inválidos, y cubre un rollback seguido de roll-forward sin imprimir valores.
- La transición obliga a un único re-login, no admite binarios viejos/nuevos simultáneos y fija `06db746` como piso de rollback seguro por su extractor estricto. Backups anteriores pueden contener bearer históricos y deben tratarse como secretos; TLS sigue siendo un frente separado.
- Archivos principales: `backend/src/lib/session-cookie.ts`, `backend/src/lib/session-store.ts`, autenticación/SSE, schema Drizzle, migración `0011`, pruebas y documentación operativa.
- Validaciones: 250 pruebas correctas (backend 134, frontend 53, base de datos 11, política compartida 4 e ingesta 48), typecheck y build completos. El build conserva los avisos ya registrados de sourcemaps en cuatro componentes UI y del bundle frontend mayor a 500 kB, pendientes del tramo de route splitting.

## 2026-08-05 — Ciclo estricto de la cookie de sesión

**Agente:** Codex
**Estado:** octava remediación de la auditoría técnica, implementada localmente.

- Se centralizaron creación y borrado de `gsb_session` con `HttpOnly`, `SameSite=Lax`, `Path=/`, alcance host-only y siete días de expiración absoluta. El borde acepta únicamente los 64 caracteres hexadecimales que genera `randomBytes(32)`.
- Cookies malformadas, desconocidas, vencidas o asociadas a cuentas/roles inactivos reciben `401` y son eliminadas; `/auth/me` y el candado global no generan un borrado cuando nunca recibieron cookie. Logout sí la expira siempre para conservar su semántica idempotente. El instante exacto de expiración y fechas inválidas fallan cerrado.
- Todas las respuestas de `/auth/*` incluyen `Cache-Control: no-store`; logout quedó explícitamente idempotente y público en OpenAPI. SSE reutiliza el extractor único en lugar de interpretar la cookie por separado.
- `Secure` permanece deliberadamente desactivado porque el despliegue actual sirve HTTP: se activará junto con TLS para no romper las sesiones del navegador ni ofrecer una falsa sensación de cifrado.
- Archivos principales: `backend/src/lib/session-cookie.ts`, `backend/src/lib/auth.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/events.ts`, contrato generado, pruebas y documentación.
- Validaciones: 246 pruebas correctas (backend 131, frontend 53, base de datos 10, política compartida 4 e ingesta 48), codegen, typecheck y build completos. El build conserva los avisos preexistentes de sourcemaps de cuatro componentes UI y del bundle frontend mayor a 500 kB; su reducción sigue en el tramo de route splitting del roadmap.

## 2026-08-05 — Validación temprana de secretos entre servicios

**Agente:** Codex
**Estado:** séptima remediación de la auditoría técnica, implementada localmente.

- El backend valida `WEBHOOK_API_KEY` y `ADMIN_API_KEY` antes del seed y antes de abrir el puerto: ambas deben existir, ser diferentes, tener al menos 32 caracteres y no usar controles, espacios exteriores, un único carácter repetido ni placeholders públicos conocidos.
- Los errores identifican únicamente la variable y la regla incumplida; nunca incluyen el valor. Una configuración inválida aborta el proceso, por lo que `/healthz` no puede quedar verde con servicios administrativos o de ingesta inutilizables.
- `.env.example` deja ambas claves vacías y documenta generación aleatoria con `openssl rand -hex 32`; copiar el ejemplo ya no satisface Compose con credenciales públicas.
- Archivos principales: `.env.example`, `backend/src/lib/service-secrets.ts`, `backend/src/index.ts`, pruebas unitarias y documentación operativa/arquitectónica.
- Validaciones: 236 pruebas correctas (backend 121, frontend 53, base de datos 10, política compartida 4 e ingesta 48), typecheck/build completos y comprobación no reveladora de que el entorno local cumple la política.

## 2026-08-04 — Rate limit y capacidad acotada del login

**Agente:** Codex
**Estado:** sexta remediación de la auditoría técnica, implementada y validada localmente.

- `POST /api/auth/login` reserva ahora cada intento por el SHA-256 del username normalizado antes de consultar credenciales o iniciar scrypt. Solo un rechazo real confirma el fallo: diez fallos de una ventana deslizante de 15 minutos hacen que la siguiente solicitud bloquee la identidad por 15 minutos y responda `429 LOGIN_RATE_LIMITED`, `Retry-After`, `retry_after_seconds` y `Cache-Control: no-store`.
- Usuarios inexistentes, inactivos, roles inactivos y claves incorrectas comparten la misma mecánica y el mismo mensaje genérico, sin introducir una señal nueva de enumeración. Un login confirmado borra el bucket; crear o renombrar una cuenta y restablecer su contraseña también lo limpian para que el camino de recuperación administrativa sea inmediato.
- Se agregó una compuerta global para el trabajo criptográfico público: token bucket con ráfaga inicial de 30 KDF y reposición de 30 por minuto, como máximo cuatro simultáneos y ocho en cola. El exceso recibe el mismo `429`; si una solicitud no consigue capacidad, pierde una carrera administrativa o termina en `5xx`, su reserva de cuenta se reembolsa. Una desconexión no cancela trabajo ya admitido y el resultado de la verificación igualmente cierra la reserva, evitando eludir el límite mediante abortos. Esto limita ráfaga y consumo sostenido aunque el atacante rote identidades.
- El store mantiene solo hashes, admite hasta 20.000 identidades y hace limpieza/evicción perezosa sin priorizar la expulsión de bloqueos activos. Es estado local de la única instancia backend actual: un reinicio lo limpia y una futura topología horizontal deberá reemplazarlo por un store compartido. No se confía en `X-Forwarded-For` porque el puerto 5000 sigue expuesto directamente.
- OpenAPI documenta los errores reales `400`, `401` y el nuevo `429`, incluido su header y espera estructurada. Orval regeneró el cliente y `LoginMutationError` dejó de ser `void`. El frontend usa `retry_after_seconds` para diferenciar una saturación breve de los 15 minutos de un bloqueo de cuenta, sin mostrar datos técnicos.
- Archivos principales: `backend/src/lib/login-rate-limit.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/admin.ts`, `lib/api-spec/openapi.yaml`, artefactos generados, pruebas backend/frontend y documentación operativa/arquitectónica.
- Validaciones ejecutadas antes del commit: 231 pruebas correctas (backend 116, frontend 53, base de datos 10, política compartida 4 e ingesta 48), incluidas carreras de renombre/reset, saturación y aborto deliberado del cliente; además, codegen, typecheck completo, build de producción y `git diff --check`. El build conserva únicamente las advertencias ya auditadas de sourcemaps y del bundle frontend de ~942 kB, reservadas para la etapa específica de optimización.

## 2026-08-04 — Cambio obligatorio de contraseña temporal

**Agente:** Codex
**Estado:** quinta remediación de la auditoría técnica, implementada y validada localmente.

- Se agregó `usuarios.debe_cambiar_password` como estado autoritativo. La migración `0010_require_password_change.sql` conserva en `false` a todas las cuentas históricas y deja `NOT NULL DEFAULT true` más `CHECK (0,1)` para que futuras altas omitidas fallen de forma segura.
- Alta y reset administrativo, bootstrap inicial y rotación del seed heredado emiten contraseñas temporales. El rehash automático de un formato histórico preserva el flag y un seed posterior nunca vuelve a activarlo sobre una clave ya asegurada.
- Se incorporó `POST /api/auth/password`: verifica la contraseña actual con compatibilidad histórica, aplica la política compartida a la nueva, rechaza reutilización y realiza con comparación optimista una transacción que cambia hash/flag, revoca todas las sesiones y crea un token nuevo. Carreras y fallos revierten la operación completa.
- Después de autenticar, un segundo guard backend bloquea tickets, dashboard, administración y SSE con el código estable `PASSWORD_CHANGE_REQUIRED` mientras el flag no sea exactamente `false`. `/auth/me`, logout y el cambio propio siguen disponibles; por lo tanto la restricción no depende de la UI.
- El frontend agregó `/cambiar-contrasena` fuera del layout privado, con contraseña temporal, nueva, repetición, ayudas accesibles y cierre de sesión. Login, raíz y `AuthGate` comparten una decisión de ruta probada; no se puede escapar mediante navegación ni volver a la pantalla después de regularizar la cuenta. La raíz tampoco confía en un usuario stale si `/auth/me` falló o sigue revalidando, y limpia las queries funcionales antes de instalar otra identidad para evitar rebotes o datos cruzados.
- Roles y usuarios ahora identifica claves temporales, muestra el badge **Cambio de contraseña pendiente** y actualiza el listado después de un reset. OpenAPI expone el flag de solo lectura, el nuevo endpoint, errores estructurados y la respuesta `PASSWORD_CHANGE_REQUIRED` en todas las operaciones protegidas; Orval regeneró tipos, cliente React y validadores Zod.
- Archivos principales: `lib/db/src/schema/admin.ts`, migración y prueba `0010`, `lib/api-spec/openapi.yaml`, artefactos generados, `backend/src/lib/auth.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/admin.ts`, `backend/src/lib/seed.ts`, `frontend/src/App.tsx`, `frontend/src/pages/ChangePassword.tsx`, `frontend/src/lib/session-state.ts` y `frontend/src/pages/AdminRolesUsers.tsx`.
- Validaciones ejecutadas antes del commit: 217 pruebas correctas en la suite completa (backend 102, frontend 53, base de datos 10, política compartida 4 e ingesta 48), codegen, typecheck completo, build de producción, `drizzle-kit check`, migrador real idempotente, `git diff --check` y dos revisiones cruzadas. El build conserva únicamente las advertencias ya auditadas de sourcemaps y tamaño del bundle, fuera del alcance de este commit.

## 2026-08-04 — Política única de contraseñas nuevas

**Agente:** Codex
**Estado:** cuarta remediación de la auditoría técnica, implementada y validada localmente.

- Se creó `@workspace/password-policy`, paquete puro consumido por backend y frontend. Alta de usuario, reset y bootstrap exigen 16–128 unidades UTF-16; rechazan controles C0/DEL, whitespace exterior, una lista acotada de valores comunes/placeholders públicos y claves de un único carácter repetido. Admiten frases con espacios interiores y no fuerzan reglas de composición.
- OpenAPI reutiliza un único componente `NewPassword` para alta y reset, con longitud, `writeOnly` y un patrón que rechaza controles C0/DEL y whitespace exterior. Orval regeneró cliente/tipos y Zod; la blocklist contextual y el rechazo de un único carácter repetido se aplican después mediante el paquete compartido y antes de cualquier hash o mutación.
- Login conserva un contrato diferente de 1–128 para no bloquear claves históricas. No aplica trim ni blocklist al verificar y puede rehashear credenciales cortas, comunes o con espacios exteriores; esa excepción no existe en ninguna entrada de contraseña nueva.
- La UI usa la misma política para validación, ayudas, estados deshabilitados y límites de los inputs. Los mensajes explican longitud, controles, espacios exteriores o clave predecible sin mostrar errores técnicos. El campo de login limita el payload a 128 sin aplicar reglas retroactivas.
- Los consumidores manejan exhaustivamente todos los códigos de violación, de modo que ampliar la unión obliga a actualizar backend, bootstrap y frontend en compilación. `hashPassword` permanece como primitiva criptográfica sin política para permitir migraciones históricas.
- Se agregaron pruebas puras, de paridad OpenAPI/Zod, de rutas y de UI: límites 15/16/128/129, whitespace exterior/interior, controles C0/DEL, blocklist normalizada, placeholders públicos, repetición de un único carácter, alta/reset sin mutaciones ante rechazo, revocación válida, bootstrap y login histórico de 1–128 con rehash.
- Archivos principales: `lib/password-policy/`, `lib/api-spec/openapi.yaml`, artefactos generados de API, `backend/src/lib/seed.ts`, `backend/src/routes/admin.ts`, `frontend/src/lib/password-policy.ts`, `frontend/src/pages/AdminRolesUsers.tsx` y `frontend/src/pages/Login.tsx`.
- Validaciones ejecutadas antes del commit: 199 pruebas correctas (backend 93, frontend 46, política compartida 4, base de datos 8 e ingesta 48), codegen, typecheck completo, build de producción, `git diff --check` y revisión cruzada. El build conserva únicamente las advertencias ya auditadas de sourcemaps y tamaño del bundle, fuera del alcance de este commit.

## 2026-08-04 — Scrypt asíncrono y hashes versionados

**Agente:** Codex
**Estado:** tercera remediación de la auditoría técnica, implementada y validada localmente.

- Se reemplazó `scryptSync` por `crypto.scrypt` asíncrono en login, alta/reset de usuarios y bootstrap. Los hashes se calculan antes de entrar a las transacciones SQLite, por lo que el trabajo criptográfico no bloquea el event loop ni mantiene locks de base innecesarios.
- El formato nuevo declara versión y parámetros: `scrypt$v1$16384$8$1$<salt>$<hash>`. El lector conserva compatibilidad con `scrypt:<salt>:<hash>` y marca únicamente ese formato válido como candidato a rehash.
- Un login correcto con hash legado deriva una sal nueva y migra la credencial. La creación de la sesión y el rehash ocurren dentro de una transacción que relee usuario, rol y hash; si una desactivación o reset cambió el registro durante el KDF, la contraseña anterior no obtiene una sesión. Dos logins simultáneos revalidan una sola vez el hash migrado para no rechazar una clave que continúa vigente.
- El login ejecuta el mismo trabajo scrypt también para usuarios inexistentes o hashes ausentes/malformados mediante un hash dummy válido. Todos esos casos conservan el mismo estado y cuerpo `401`, reduciendo la enumeración temporal de cuentas.
- Se agregaron pruebas de formato actual, sales independientes, compatibilidad/rehash legado, rechazo de formatos inseguros, hash dummy, avance del event loop, comportamiento HTTP uniforme, logins simultáneos, login contra reset concurrente y rollback de rehash/sesión. También se adaptaron las suites de seed/RBAC al contrato asíncrono.
- Archivos principales: `backend/src/lib/passwords.ts`, `backend/src/lib/seed.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/admin.ts`, `backend/test/passwords.test.ts`, `backend/test/seed.test.ts` y `backend/test/rbac-routes.test.ts`.
- Validaciones ejecutadas antes del commit: 183 pruebas correctas (backend 83, frontend 44, base de datos 8 e ingesta 48), typecheck completo, build de producción, `git diff --check` y revisión cruzada del diff. El build conserva únicamente las advertencias ya auditadas de sourcemaps y tamaño del bundle, fuera del alcance de este commit.

## 2026-08-04 — Invariantes RBAC y roles protegidos

**Agente:** Codex
**Estado:** segunda remediación de la auditoría técnica, implementada y validada localmente.

- Se centralizó la política de roles del backend en `backend/src/lib/rbac.ts`: `SysAdmin`, `Administrador` y `Operador` son roles base reservados, con comparación normalizada y una única definición de capacidades.
- Los roles base ya no pueden renombrarse, desactivarse ni eliminarse desde la API. Sus descripciones siguen siendo editables. Tampoco se puede crear o renombrar un rol personalizado usando un nombre reservado, incluso con diferencias de mayúsculas o espacios.
- El seed crea o reactiva los tres roles base sin renombrar masivamente `Administrador` a `SysAdmin`. La migración de la identidad histórica queda limitada a la cuenta semilla correspondiente y no promueve a otros administradores.
- El login y la validación de cada request rechazan usuarios o roles inactivos. Desactivar un usuario o rol revoca en la misma transacción todas las sesiones afectadas y cierra sus streams SSE; reactivarlo no revive cookies anteriores. El heartbeat del stream revalida además la sesión cada 25 segundos.
- El backend impide desactivar o degradar al último SysAdmin activo con identidad de acceso y hash de contraseña utilizable. Un hash nulo, vacío o malformado no cuenta como cuenta de recuperación.
- Las altas y cambios de rol solo aceptan roles activos. La pantalla de Roles y usuarios refleja las mismas restricciones, deshabilita las acciones imposibles y explica por qué están protegidas; el backend continúa siendo la autoridad final.
- Se agregaron pruebas integradas para los guards de roles, revocación real de sesiones y SSE, asignaciones a roles inactivos, preservación del último SysAdmin y migración segura del seed, más pruebas unitarias del espejo de capacidades y mensajes de error en frontend.
- Archivos principales: `backend/src/lib/rbac.ts`, `backend/src/lib/auth.ts`, `backend/src/lib/events.ts`, `backend/src/lib/seed.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/events.ts`, `backend/src/routes/admin.ts`, `backend/test/rbac-routes.test.ts`, `frontend/src/lib/roles.ts` y `frontend/src/pages/AdminRolesUsers.tsx`.
- Validaciones ejecutadas antes del commit: 174 pruebas correctas (backend 74, frontend 44, base de datos 8 e ingesta 48), typecheck completo, generación OpenAPI, build de producción y `git diff --check`. El build conserva únicamente las advertencias ya auditadas de sourcemaps y tamaño del bundle, fuera del alcance de este commit.

## 2026-08-04 — Bootstrap seguro del SysAdmin

**Agente:** Codex
**Estado:** primera remediación de la auditoría técnica, implementada y validada localmente.

- Se eliminó la contraseña fija del usuario semilla. Una base sin `password_hash` ahora exige `BOOTSTRAP_SYSADMIN_PASSWORD`, con una longitud de 16 a 128 caracteres y validación previa a cualquier mutación.
- El secreto se usa únicamente para calcular el hash scrypt: no se guarda en texto plano, no se imprime y no viaja al frontend. El arranque falla antes de abrir el puerto si una instalación nueva no provee una clave válida.
- Para actualizar instalaciones antiguas, el seed detecta exclusivamente la credencial pública heredada de `sysadmin`/`admin`, exige el secreto externo, rota el hash y revoca sus sesiones en una única transacción. Cualquier contraseña ya cambiada queda intacta.
- El secreto quedó vacío en `.env.example` y su antiguo placeholder se rechaza explícitamente, evitando inicializar una cuenta con un valor público copiado desde el repositorio.
- Se incorporó la variable opcional al contenedor y al paso de despliegue, y se actualizaron `.env.example`, README, documentación de backend, flujo, arquitectura y despliegue.
- Se agregó una suite integrada que comprueba: rechazo sin secreto y sin mutaciones parciales, rechazo de valores inválidos, creación con hash verificable, no sobrescritura posterior, rotación heredada, revocación selectiva de sesiones, idempotencia y rollback ante fallos.
- Validaciones ejecutadas: test específico del seed y typecheck del backend; antes del commit también se ejecutó la suite completa del workspace y el build de producción.

## 2026-07-24 — Integración de la versión 0.5 con estado laboral y Serin

**Agente:** Codex
**Estado:** paquete integrado y validado para su publicación en `main`.

- Se conservó sin cambios la migración `0007_add_estado_empleado.sql`, ya aplicada en el entorno remoto. Las migraciones locales de v0.5 se regeneraron como `0008_v05_auditoria_ticket.sql` y `0009_add_embargos_category.sql`, con snapshots y timestamps posteriores en el journal.
- Se comprobó el migrador real tanto sobre una base que ya tenía `0007` como desde una base vacía. En ambos casos la segunda ejecución fue idempotente, las claves foráneas de auditoría conservaron `ON DELETE SET NULL` y `PRAGMA integrity_check` devolvió `ok`.
- Se preservaron en el mismo webhook la persistencia de `estado_empleado`, la creación atómica del seguimiento inicial de Serin y la idempotencia por `conversation_id`. Una prueba HTTP integrada verifica que un reintento no duplica el seguimiento.
- El CSV completo incorpora la columna **Estado laboral**. Si una edición manual cambia DNI o empresa, el backend invalida el estado laboral obtenido previamente desde Serin y registra ambos cambios en el historial, evitando asociar un dato antiguo a otra identidad o empresa.
- Se regeneraron los clientes y validadores desde OpenAPI. La validación final quedó en 147 pruebas correctas (backend 50, base de datos 8, ingesta 48 y frontend 41), `drizzle-kit check`, typecheck y build de producción correctos.
- El alcance se limitó al paquete v0.5 y a su convivencia con los cambios de estado laboral/Serin ya presentes en `main`; no se incluyeron `.env`, bases locales, backups ni artefactos de ejecución.

## 2026-07-22 — Paquete local v0.5: clasificación, SLA, auditoría y gestión ampliada

**Agente:** Codex
**Estado:** implementación y validación local completas; integración a `main` autorizada el 2026-07-24 como versión 0.5.

### Categoría Embargos y migración conservadora

- Se agregó `embargos` al catálogo estable compartido entre schema, clasificador, OpenAPI y frontend, con la etiqueta visible **Embargos**.
- Las reglas se evalúan antes de `legales` y de categorías generales. Captan variantes de embargo/desembargo, retenciones o descuentos judiciales y órdenes/oficios relacionados; la expresión “sin embargo” se excluye explícitamente para evitar falsos positivos.
- La migración integrada `0009_add_embargos_category.sql` hace un primer backfill conservador. Después, antes de abrir el puerto, una reconciliación idempotente promueve únicamente a Embargos los históricos que ahora cumplen la regla. Mantiene la prioridad del motivo explícito, no recalcula categorías ajenas y conserva `motivo`/`resumen` byte a byte.

### Prioridad automática según horas hábiles

- El cálculo compartido de SLA ahora también determina las horas hábiles firmadas que faltan. Sábados y domingos siguen sin consumir tiempo; los feriados continúan contando como hábiles.
- Los tickets visibles, con fecha límite y sin estado final, suben a `alta` al quedar 24 horas hábiles o menos y a `urgente` al quedar 12 horas hábiles o menos o estar vencidos. El proceso nunca degrada una prioridad superior.
- El backend ejecuta una pasada antes de abrir el puerto y luego cada 5 minutos. `PRIORIDAD_AUTOMATICA_INTERVAL_MS` permite configurar el intervalo (mínimo 10 segundos); el runner impide solapamientos y un error de revisión queda logueado sin detener el servidor.
- Cada promoción usa comparación condicional para no pisar cambios concurrentes. Ticket y seguimiento de autor `Sistema` se escriben dentro de la misma transacción y el evento SSE se emite después del commit.
- No se recalculan vencimientos históricos: la automatización evalúa la `fecha_limite` ya existente en cada ticket elegible.

### Auditoría estructurada desde v0.5

- La migración `0008_v05_auditoria_ticket.sql` amplía `seguimientos` con prioridad anterior/nueva, asignación anterior/nueva (ID y snapshot legible) y `campos_editados`.
- `PATCH /api/tickets/:id` relee el estado autoritativo, persiste únicamente diferencias reales y crea un único seguimiento dentro de la misma transacción. Estado, prioridad y asignación guardan sus valores anterior/nuevo; los demás cambios guardan nombres de campos, no copias de valores sensibles.
- La identidad del autor y la autoasignación se derivan de la sesión. Las notas manuales aceptan solo la nota: el cliente no puede falsificar autor, estado ni snapshots de auditoría.
- Al reabrir un ticket resuelto/cerrado se limpia `fecha_resolucion`; si vuelve a resolverse se registra un instante nuevo. Pasar de resuelto a cerrado conserva la fecha de resolución existente.
- La nueva trazabilidad empieza con v0.5. La migración preserva los seguimientos existentes y no inventa cambios de estado, prioridad o responsable anteriores.

### Exportación y ordenamiento server-side

- `GET /api/tickets/export.csv` reutiliza exactamente los filtros y el orden del listado, pero omite la paginación para exportar todos los tickets operativos coincidentes. El archivo usa UTF-8 con BOM, separador `;`, CRLF, celdas entre comillas y mitigación de fórmulas de planilla.
- El botón **Exportar CSV** quedó junto a los filtros de Tickets y conserva el criterio activo; informa progreso y resultado mediante toasts.
- El listado acepta `sort_by`/`order` sobre una whitelist cerrada. El orden se resuelve en SQL antes de paginar, incluye reglas semánticas para estado/prioridad, ubica vacíos al final y usa ID como desempate estable. Los nombres de columna del cliente nunca se interpolan en SQL.
- Tickets y Administración usan encabezados ordenables accesibles; cambiar orden o filtros vuelve a la primera página.

### Administración, cuarentena y detalle editable

- La tabla de Administración se amplió con ID, fecha/hora, conversation ID, contacto (teléfono/email), empresa, categoría/motivo, estado, prioridad, asignado y vencimiento. Conserva paginación, scroll horizontal controlado y acciones accesibles.
- Cada registro puede abrirse en `/admin/tickets/:id`. Esa variante del detalle envía `incluir_vacios=true` y `x-admin-key`, por lo que un SysAdmin puede inspeccionar y completar tickets en cuarentena sin hacerlos visibles para la operación hasta que dejen de cumplir la condición de vacío.
- En el detalle normal se agregó un lápiz junto a **Datos del Contacto** para editar nombre, apellido, teléfono, DNI/CUIT, empresa, email, motivo y resumen. El formulario genera un PATCH mínimo, convierte opcionales vacíos a `null` y vuelve a clasificar al cambiar motivo/resumen.
- Los campos funcionales anteriores están disponibles para cualquier sesión autenticada. Hora, notificación, audio, fecha límite y fecha de resolución quedan protegidos como datos técnicos y requieren SysAdmin + `x-admin-key`; la seguridad se valida en el backend además de la UI.
- La línea de tiempo muestra cambios de estado, prioridad, asignación y campos editados con etiquetas legibles. Teléfono y email mantienen sus filas fijas y fallbacks cuando no existe dato.

### Validación de entradas y autenticación documentada

- El contrato OpenAPI declara la cookie `gsb_session` como seguridad global. Health y login son públicos; el webhook usa exclusivamente `x-api-key`; las 12 operaciones administrativas requieren sesión y `x-admin-key` simultáneamente (AND).
- Los emails editados se validan en frontend, contrato y backend. Un email vacío se normaliza a `null`; un formato inválido responde 400 sin persistir cambios.
- `fecha_limite` y `fecha_resolucion` se validan sobre el JSON crudo antes de la coerción Zod. PATCH, webhook y alta administrativa rechazan `null`, booleanos, números, fechas imposibles o sin zona y aceptan únicamente date-time RFC3339 con zona.
- Una pestaña SSE desconectada se elimina del conjunto de clientes y no puede transformar en error HTTP una gestión ya confirmada en SQLite.

### Archivos principales

- Backend: `backend/src/routes/tickets.ts`, `backend/src/lib/ticket-query.ts`, `backend/src/lib/ticket-csv.ts`, `backend/src/lib/prioridad-automatica.ts`, `backend/src/lib/prioridad-automatica-runner.ts`, `backend/src/lib/reclasificar-motivos.ts` y `backend/src/index.ts`.
- Frontend: `frontend/src/pages/TicketList.tsx`, `frontend/src/pages/Admin.tsx`, `frontend/src/pages/TicketDetail.tsx`, `frontend/src/components/SortableTableHead.tsx`, `frontend/src/components/tickets/TicketDataEditDialog.tsx`, `frontend/src/lib/ticket-edit.ts` y `frontend/src/lib/ticket-list-controls.ts`.
- Contrato/datos: `lib/api-spec/openapi.yaml`, clientes generados, schemas Drizzle, `lib/ingesta/src/motivos.ts`, `lib/ingesta/src/sla.ts` y migraciones integradas `0007`/`0008`/`0009`.
- Documentación: `README.md`, `backend/README_BACKEND.md`, `frontend/README_FRONTEND.md`, `docs/FLUJO.md` y esta bitácora.

### Validación final local

- 128 pruebas correctas: backend 42, base de datos 7, ingesta 46 y frontend 33. Cubren transacción/rollback de auditoría, desconexión SSE, concurrencia de promociones, no degradación, selección de tickets elegibles, runner, reconciliación, entradas RFC3339, exportación y ordenamiento.
- `pnpm run typecheck`, codegen OpenAPI y `pnpm run build`: correctos. Vite conserva únicamente sus advertencias conocidas de sourcemaps de componentes UI y tamaño del bundle; no son fallos de compilación.
- Cadena completa de migraciones probada desde una base vacía y smoke HTTP real aprobado: login/cookie, doble protección SysAdmin, webhook, Embargos, listado/orden, CSV, edición, autoasignación, historial, escalado automático a Urgente y logout.
- La base local fue respaldada en `backups/tickets-pre-v0.5-2026-07-22.db`, actualizada mediante Drizzle e iniciada una vez con v0.5. `PRAGMA integrity_check` devolvió `ok`; se compararon los 12 registros preexistentes contra el backup y `motivo`/`resumen` permanecieron byte a byte intactos.
- QA visual aprobado en 1440×1000 y 1024×900 para detalle operativo, detalle Admin, registro en cuarentena, historial/asignación y ambos editores: sin overflow, recortes ni errores de consola/red.
- Higiene final: temporales de migración, smoke y QA eliminados. El paquete quedó listo para su integración controlada con los cambios de estado laboral y origen Serin que ya estaban publicados.

## 2026-07-23 — Estado Activo/Inactivo del empleado

**Agente:** Codex
**Contexto:** el JSON de n8n incorporó el campo opcional `estado_empleado`. El cambio se aisló en la rama `feature/estado-empleado`; el trabajo local todavía no probado de v0.5 quedó protegido en un stash y no se mezcló.

### Cambio realizado

- El contrato acepta únicamente `Activo` o `Inactivo` respetando Title Case, y el webhook y el alta administrativa conservan el valor.
- La tabla `tickets` incorpora una columna nullable mediante una migración aditiva. Los registros históricos quedan con `null`.
- En el listado y el detalle de Tickets se muestra `Activo` o `Inactivo` debajo de la empresa. Si no existe empresa, el valor está ausente/desconocido o se recibe el marcador `Sin empresa asignada/asociada`, la interfaz queda como antes.
- Cuando el webhook crea un ticket con una empresa real, ticket y seguimiento inicial se guardan en una misma transacción. El historial comienza con `Los datos fueron extraídos y persistidos desde Serin con el DNI proporcionado.`, bajo el autor `Sistema`.
- La inserción usa el `conversation_id` como conflicto idempotente: un reintento devuelve el ticket existente y no duplica el seguimiento. Los historiales se ordenan por fecha y luego por ID para garantizar cuál es la primera entrada.
- La nota automática no se incluye en `actividad-reciente`: queda disponible donde fue solicitada, dentro del historial del ticket, sin duplicar el evento de alta en el Dashboard.
- `estado_empleado` no participa de la regla de cuarentena: por sí solo no convierte un registro completamente vacío en un ticket operativo.
- Se regeneraron los tipos y validadores derivados de OpenAPI.

Archivos principales: `lib/api-spec/openapi.yaml`, `lib/db/src/schema/tickets.ts`, `lib/db/drizzle/0007_add_estado_empleado.sql`, rutas de ingesta del backend, `frontend/src/lib/estado-empleado.ts`, `TicketList.tsx`, `TicketDetail.tsx` y pruebas asociadas.

### Integración con v0.5

- La colisión de numeración se resolvió conservando `0007_add_estado_empleado.sql`, que ya estaba aplicada en producción, y regenerando el paquete v0.5 como `0008_v05_auditoria_ticket.sql` y `0009_add_embargos_category.sql`.
- Los timestamps del journal quedaron estrictamente posteriores a `0007`, de modo que una base existente aplica ambas migraciones nuevas y una instalación limpia recorre la misma secuencia completa.

### Validaciones

- Tests del workspace: DB 6/6, ingesta 26/26 y frontend 28/28 correctos.
- Typecheck completo y build de producción de backend/frontend: correctos; permanecen únicamente las advertencias conocidas de sourcemaps y tamaño del bundle.
- Smoke test sobre una base temporal migrada: el webhook conservó `estado_empleado: Activo` en su respuesta y rechazó la variante incorrecta `activo` con HTTP 400.
- Smoke HTTP del seguimiento Serin: empresa real generó exactamente una entrada; el reintento respondió `created: false` sin duplicarla; un ticket sin empresa generó cero entradas. Un fallo forzado al insertar el seguimiento revirtió también el ticket, confirmando la atomicidad.
- Smoke autenticado del detalle y Dashboard: el historial devolvió la nota de `Sistema` como primera y única entrada, mientras que `actividad-reciente` conservó únicamente `ticket_creado`.
- La columna aditiva se aplicó también a la base local para poder probar esta rama; `PRAGMA integrity_check` devolvió `ok`.
- `git diff --check`: correcto, sin errores de whitespace.

## 2026-07-21 — Ajuste visual final de los filtros de Tickets

**Agente:** Codex
**Contexto:** la primera distribución en filas todavía dejaba el buscador demasiado corto y el ícono de búsqueda podía percibirse descentrado.

### Cambio realizado

- Categoría pasó a encabezar la segunda fila, dejando la primera exclusivamente para una búsqueda amplia, estado y prioridad.
- El buscador absorbe todo el espacio restante; en la revisión visual midió 728 px a 1440 y 568 px a 1280.
- La lupa ahora forma parte de un contenedor `flex` de altura fija, por lo que queda centrada por layout y no mediante posición absoluta o transformaciones.
- En escritorio se usan tres filas estables: búsqueda/estado/prioridad; categoría/fecha/hora; empresa/plazo/limpiar. En resoluciones menores cada grupo se apila sin cortes automáticos.

Archivos: `frontend/src/pages/TicketList.tsx`, `frontend/README_FRONTEND.md` y esta bitácora.

### Validaciones

- Revisión visual del listado en escritorio y viewport reducido.
- Typecheck, tests y build de producción del frontend: correctos.
- `git diff --check`: sin errores de whitespace.

## 2026-07-21 — Corrección del layout de filtros de Tickets

**Agente:** Codex
**Contexto:** tras agregar prefijos persistentes, todos los controles permanecían dentro de un único `flex-wrap`; la mezcla de anchos completos y fijos producía saltos irregulares y deformaba la barra según el ancho disponible.

### Cambio realizado

- Se reemplazó el wrap automático por dos filas explícitas con CSS Grid.
- La primera fila contiene búsqueda, estado, prioridad y categoría; la segunda agrupa fecha, hora, empresa, plazo y la acción para limpiar.
- En tablet cada fila se reorganiza en dos columnas y en móvil en una sola, sin cambiar la lógica de filtrado.
- Los rangos de fecha y hora pueden contraerse sin desbordar, y el padding de la página se redujo en móvil.

Archivos: `frontend/src/pages/TicketList.tsx`, `frontend/README_FRONTEND.md` y esta bitácora.

### Validaciones

- Typecheck del frontend: correcto.
- Tests del frontend: correctos.
- Build de producción del frontend: correcto.
- `git diff --check`: sin errores de whitespace.

## 2026-07-21 — Contexto persistente en los filtros de Tickets

**Agente:** Codex
**Contexto:** los selects controlados usaban `_all` como valor inicial; por eso Radix mostraba `Todos/Todas` y nunca el placeholder que indicaba a qué filtro pertenecía cada uno.

### Cambio realizado

- Estado, prioridad y categoría mantienen un prefijo visible dentro del trigger: `Estado: Todos`, `Prioridad: Todas` y `Categoría: Todas`; al seleccionar otra opción el prefijo permanece.
- Fecha, hora, empresa y plazo también tienen etiquetas compactas persistentes. El switch ahora se presenta como `Plazo: Solo vencidos`.
- La búsqueda explica qué campos abarca y todos los controles recibieron nombres accesibles para lectores de pantalla.
- Se mantuvo la altura compacta de la barra. Los controles permiten wrap y ocupan todo el ancho en pantallas pequeñas para evitar desbordes.
- No se modificó la lógica ni los parámetros enviados al backend; el cambio es exclusivamente de presentación y accesibilidad.

Archivos: `frontend/src/pages/TicketList.tsx`, `frontend/README_FRONTEND.md` y esta bitácora.

### Validaciones

- Tests del frontend: 24/24 correctos.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- `git diff --check`: sin errores de whitespace.

## 2026-07-21 — Errores seguros, responsable en Tickets y períodos del Dashboard

**Agente:** Codex
**Contexto:** se pidió eliminar detalles técnicos de los toasts de error, mostrar el responsable de cada ticket en el listado y permitir que todo el Dashboard se visualice sin filtro, por semana, por mes o entre dos fechas.

### Cambios realizados

- Se centralizó la presentación de errores en `frontend/src/lib/error-messages.ts`. La UI inspecciona `status`, `response.status` y únicamente respuestas de negocio conocidas; nunca imprime `Error.message`, HTTP, método, URL, JSON, HTML, stack ni detalles internos de Zod. Login, Administración, Roles y usuarios, edición de tickets, seguimientos y logout usan mensajes humanos. La creación y el reset de contraseñas también validan longitud y coincidencia antes de llamar a la API.
- El listado operativo ganó la columna **Asignado**. Muestra el snapshot visible `asignado_a` limpio y, si está vacío o es nulo, `Sin asignar`. No cambia la asignación ni reescribe registros; `asignado_usuario_id` continúa siendo la identidad autoritativa en el backend.
- El Dashboard incorporó el selector **Todo / Semana actual / Mes actual / Período personalizado**. Todo sigue siendo el default; semana usa lunes a domingo, mes usa el mes calendario completo y el rango desde/hasta incluye ambos días. El personalizado conserva un borrador y solo aplica fechas completas y ordenadas.
- Los presets se recalculan automáticamente al cambiar el día y los controles permiten wrap en anchos intermedios para no desbordar junto al sidebar.
- Los cuatro endpoints del Dashboard aceptan `fecha_desde` y `fecha_hasta`. Estados, prioridades, motivos, vencidos y resueltos del período usan la misma cohorte por fecha de creación; actividad usa la fecha real de cada ticket/seguimiento. El badge global del sidebar permanece sin filtro.
- Se agregaron `resueltos_periodo` y `nuevos_periodo` al contrato sin retirar `resueltos_hoy` ni `nuevos_hoy`, preservando la compatibilidad y el comportamiento exacto de Todo.
- Los días calendario se interpretan explícitamente en `America/Argentina/Buenos_Aires`, sin depender de la zona del proceso; el límite “hasta” incluye el día completo y un rango invertido responde `400`.
- No fue necesaria ninguna migración ni se modificaron tickets existentes.

Archivos principales: `frontend/src/lib/error-messages.ts`, `frontend/src/lib/asignacion.ts`, `frontend/src/lib/dashboard-period.ts`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/TicketList.tsx`, `backend/src/lib/dashboard-date-range.ts`, `backend/src/routes/dashboard.ts` y `lib/api-spec/openapi.yaml`.

### Validaciones

- Contrato React Query/Zod regenerado desde OpenAPI.
- `pnpm -r --if-present test`: 53 pruebas correctas (24 ingesta/SLA, 5 base de datos y 24 frontend). Los casos nuevos cubren ausencia de filtraciones técnicas, mensajes administrativos/login, fallback de asignación, lunes-domingo, mes calendario, rango personalizado y formato local.
- `pnpm run typecheck`: correcto en librerías, backend, frontend y scripts.
- `pnpm run build`: backend y frontend compilaron correctamente; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- Smoke HTTP aislado sobre una base temporal migrada: login/logout correctos; los cuatro endpoints aceptaron el mismo rango; la respuesta de stats incluyó las nuevas métricas y un rango invertido devolvió `400`. El proceso y la base temporal se eliminaron al finalizar.
- El parser de período se verificó además con `TZ=UTC`: mantuvo correctamente los límites de medianoche de Buenos Aires.
- `git diff --check`: sin errores de whitespace.

## 2026-07-20 — Aclaración visible del estado Pendiente

**Agente:** Codex
**Contexto:** se pidió aclarar en la interfaz que el estado Pendiente corresponde a una persona que ya fue contactada.

### Cambio realizado

- La etiqueta se centralizó como `Pendiente (fue contactado)` y se reutiliza en badges, filtro de Tickets, selector y progreso del detalle, historial, Dashboard, resumen lateral y Administración.
- El badge conserva la presentación en mayúsculas: `PENDIENTE (FUE CONTACTADO)`.
- Se ajustó el espacio del progreso y del resumen lateral para permitir que la aclaración se distribuya sin desbordar.
- El valor técnico continúa siendo `pendiente`: no se modificaron la base de datos, el backend, el contrato OpenAPI ni los filtros enviados a la API.

Archivos principales: `frontend/src/lib/estados.ts`, `frontend/src/lib/utils-tickets.tsx`, pantallas de Tickets, Dashboard y Administración.

### Validaciones

- Tests del frontend: 7/7 correctos, incluidos los nuevos casos de etiquetas de estado.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- Smoke sobre el módulo servido por Vite: respondió con `Pendiente (fue contactado)`; frontend y backend continúan escuchando en los puertos 3000 y 5000.
- `git diff --check`: sin errores de whitespace.

## 2026-07-20 — SLA de 48 horas hábiles sin fines de semana

**Agente:** Codex
**Contexto:** el plazo de resolución sumaba 48 horas corridas, por lo que sábado y domingo reducían indebidamente el tiempo disponible.

### Implementación

- Se centralizó el cálculo en `lib/ingesta/src/sla.ts`, compartido por webhook, alta manual y los importadores CSV/Excel.
- El reloj del SLA cuenta las 24 horas de lunes a viernes y se pausa durante sábado y domingo. Los feriados no forman parte de esta corrección y continúan contando.
- La zona de negocio queda fijada en `America/Argentina/Buenos_Aires`, independientemente de la zona horaria de la máquina que ejecute el importador.
- El webhook y el alta manual capturan un único instante para `fecha_creacion` y para la base del SLA, evitando diferencias de milisegundos.
- En importaciones históricas, una fecha y una hora en columnas separadas se combinan antes de calcular el SLA; la columna de hora tiene precedencia y queda normalizada como `HH:mm`.
- Las fechas locales/ISO y las celdas Excel se interpretan de forma estable en Buenos Aires, sin retroceder tres horas ni cambiar de día por la zona del proceso. Fechas u horas imposibles dejan la fila como inválida.
- Las fechas límite explícitas y las ediciones manuales se preservan.
- No se recalcularon tickets existentes: no hay una marca confiable que permita separar vencimientos automáticos históricos de ajustes humanos sin riesgo de sobrescribirlos.

Ejemplos: lunes 10:00 vence miércoles 10:00; jueves 10:00 vence lunes 10:00; viernes 10:00 vence martes 10:00. Un ingreso de fin de semana empieza a consumir sus 48 horas el lunes a las 00:00.

Archivos principales: `lib/ingesta/src/sla.ts`, `lib/ingesta/src/index.ts`, `backend/src/routes/webhooks.ts`, `backend/src/routes/admin.ts`, contrato OpenAPI y documentación operativa.

### Validaciones

- Pruebas unitarias del SLA: días de semana, cruces de fin de semana, ingresos sábado/domingo, límite exacto al comenzar el sábado, preservación de hora/milisegundos, inmutabilidad y entradas inválidas.
- Prueba de integración del importador: `24/07/2026 10:00` (viernes) conserva la hora de Buenos Aires y vence `28/07/2026 10:00` (martes).
- Contrato regenerado desde OpenAPI con `pnpm --filter @workspace/api-spec run codegen`.
- `pnpm -r --if-present test`: 33 pruebas correctas (24 de ingesta/SLA, 5 de base de datos y 4 de presentación del frontend).
- Las 24 pruebas de ingesta/SLA también pasaron con `TZ=UTC`, confirmando que el resultado no depende de la zona configurada en el servidor.
- `pnpm run typecheck`: correcto en librerías, backend, frontend y scripts.
- `pnpm run build`: backend y frontend compilaron correctamente; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- Backend reiniciado con el artefacto compilado; `GET /api/healthz` respondió HTTP `200`. No se modificaron ni recalcularon filas existentes para validar esta corrección.

## 2026-07-20 — Cuarentena administrativa de tickets vacíos

**Agente:** Codex
**Contexto:** se pidió evitar que los registros recibidos sin ningún dato útil aparezcan en Tickets o distorsionen el Dashboard, sin perderlos y manteniéndolos disponibles para revisión administrativa.

### Regla acordada

- Los registros se conservan en SQLite tal como llegaron: no se descartan, borran, reescriben ni se les aplica un backfill destructivo.
- La cuarentena es una condición derivada y estrictamente AND. Un ticket se considera vacío solo si:
  - `nombre` está vacío o vale `Sin nombre` / `Sin nombre proporcionado`; `apellido`, `telefono`, `dni`, `empresa`, `email`, `resumen` y `notas` están vacíos; `motivo` está vacío o vale `Sin especificar`;
  - además conserva `estado = nuevo`, `prioridad = media`, `progreso = 0`, `notificado = false` y no tiene asignación ni seguimientos.
- `id`, `conversation_id`, `hora`, fechas, `motivo_categoria` y `audio_url` se ignoran para esta decisión porque son técnicos, derivados o automáticos. Una URL de grabación por sí sola no rescata un registro sin información útil.
- Un registro que ya tenga seguimientos no se oculta. Si Administración completa cualquier dato o cambia uno de los valores operativos anteriores, la condición deja de cumplirse y el ticket reaparece automáticamente en la operación.

### Visibilidad y seguridad

- Los tickets en cuarentena quedan fuera del listado operativo, detalle, seguimientos, Dashboard, badges, actividad reciente, motivos, vencidos y toasts de ingreso/importación.
- Continúan visibles en la tabla de Administración mediante `incluir_vacios=true`.
- Incluir vacíos exige sesión SysAdmin y `ADMIN_API_KEY` válida; el parámetro no amplía el acceso de Operadores ni Administradores.

Archivos de documentación actualizados: `README.md`, `docs/FLUJO.md` y `docs/BITACORA_AGENTES.MD`.

### Validaciones

- Contrato regenerado desde OpenAPI con `pnpm --filter @workspace/api-spec run codegen`.
- `pnpm run typecheck`: correcto en librerías, backend, frontend y scripts.
- `pnpm -r --if-present test`: 19 pruebas correctas (clasificación, migración, presentación de contacto y nueva paridad entre el helper de cuarentena y su condición SQL).
- `pnpm run build`: backend y frontend compilaron correctamente.
- Verificación de solo lectura sobre la base local: 12 registros totales, 1 en cuarentena y 11 operativos. No se modificó ninguna fila para realizar esta comprobación.
- Prueba HTTP aislada sobre las rutas reales: el listado operativo devolvió 11; solicitar vacíos sin rol devolvió `403`, con SysAdmin pero sin llave devolvió `401`, y con ambas credenciales devolvió los 12. El detalle y los seguimientos del registro en cuarentena respondieron `404`; tampoco apareció en estadísticas, motivos, vencidos ni actividad reciente.

## 2026-07-20 — Teléfono y email fijos en la ficha del ticket

**Agente:** Codex
**Contexto:** se pidió que Datos del Contacto mantenga una estructura estable aunque el llamante no haya proporcionado vías de contacto.

### Cambio realizado

- Las filas de teléfono y email se renderizan siempre, con la misma altura, iconografía y espaciado.
- Cuando existe el dato se muestra limpio de espacios externos; cuando falta se informa `Teléfono no proporcionado` o `Email no proporcionado`.
- Nombre conserva `Sin nombre proporcionado`; empresa y DNI continúan siendo datos opcionales y solo se muestran cuando existen.
- No se reescribieron valores de la base: los fallbacks son exclusivamente de presentación.

Archivos principales: `frontend/src/pages/TicketDetail.tsx`, `frontend/src/lib/contacto.ts` y `frontend/test/contacto.test.ts`.

### Validaciones ejecutadas

- Tests del helper de contacto: 4/4 correctos.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- Smoke sobre el módulo servido por Vite: HTTP `200`, ambos mensajes de fallback presentes y teléfono sin renderizado condicional.
- `git diff --check`: sin errores de whitespace.

## 2026-07-20 — Email exclusivo del detalle del ticket

**Agente:** Codex
**Contexto:** se ajustó la ubicación del email para mantener compacto el listado general y concentrar todos los datos del llamante en la ficha individual.

### Cambio realizado

- El email se retiró de la columna Contacto de `/tickets`; allí permanecen nombre y empresa.
- La sección Datos del Contacto de `/tickets/:id` ahora renderiza siempre la fila de email.
- Si existe una dirección se muestra completa; si el dato es nulo, vacío o contiene solo espacios se informa `Email no proporcionado`.
- Se mantiene el fallback `Sin nombre proporcionado` y no se modifica ningún dato persistido.

Archivos principales: `frontend/src/pages/TicketList.tsx`, `frontend/src/pages/TicketDetail.tsx`, `frontend/README_FRONTEND.md` y `docs/FLUJO.md`.

### Validaciones ejecutadas

- Tests del helper de contacto: 3/3 correctos.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto; solo permanecen las advertencias conocidas de sourcemaps y tamaño del bundle.
- `git diff --check`: sin errores de whitespace.

## 2026-07-20 — Email y nombre visible en Tickets

**Agente:** Codex
**Contexto:** se reportó que el listado de Tickets no mostraba el email aun cuando el llamante lo había proporcionado, y se pidió una leyenda clara para contactos sin nombre.

### Diagnóstico y cambio

- El email no se perdía: webhook, SQLite, contrato OpenAPI y `GET /tickets` ya lo transportaban correctamente. La base local confirmó 5 tickets con email válido sobre 12 registros; la columna Contacto de `TicketList.tsx` simplemente no renderizaba el campo.
- La columna Contacto ahora muestra nombre, email —solo si contiene texto— y empresa. Los valores se recortan únicamente para presentación; no se reescriben los datos originales.
- Se agregó `getContactDisplayName`, usado en listado, detalle, tickets vencidos del Dashboard, actividad reciente, notificaciones SSE y CRUD administrativo. Cuando nombre y apellido están vacíos muestra `Sin nombre proporcionado`; también unifica visualmente el marcador histórico `Sin nombre`.
- Se agregó `getContactDisplayEmail` para evitar renderizar emails vacíos o compuestos solo por espacios.
- La base local contenía 1 contacto sin nombre completo y 2 marcadores históricos `Sin nombre`; no se ejecutó ningún backfill ni se modificó ninguna fila.

Archivos principales: `frontend/src/lib/contacto.ts`, `frontend/src/pages/TicketList.tsx`, `frontend/src/pages/TicketDetail.tsx`, `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Admin.tsx` y `frontend/src/components/layout/AppLayout.tsx`.

### Validaciones ejecutadas

- Tests unitarios del helper de presentación: 3/3 correctos.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto; permanecen únicamente las advertencias conocidas de sourcemaps y tamaño del bundle.
- Smoke HTTP local: frontend `:3000/` y backend `:5000/api/healthz` respondieron `200`.
- `git diff --check`: sin errores de whitespace.

## 2026-07-17 — Filtros, fechas/timezone y backup SQLite

**Agente:** Codex
**Contexto:** aplicación en desarrollo local. Se implementaron los puntos 2, 3 y 4 de la auditoría inicial. El endurecimiento de autenticación/PII quedó expresamente fuera de este alcance.

### 1. Filtros y paginación de tickets

- `fecha_desde` y `fecha_hasta` aceptan `YYYY-MM-DD` y se convierten al inicio y fin del día calendario local, respectivamente.
- Fechas inexistentes o con otro formato ahora responden `400`.
- `vencidos` acepta únicamente los booleanos `true` y `false`; se eliminó el comportamiento de Zod que convertía cualquier string no vacío en `true`.
- `page` debe ser entero y mayor o igual a 1.
- `limit` debe ser entero entre 1 y 100.
- Se actualizó OpenAPI, la configuración de Orval y los tipos/schemas generados.

Archivos principales: `backend/src/routes/tickets.ts`, `lib/api-spec/openapi.yaml`, `lib/api-spec/orval.config.ts`, `lib/api-zod/src/generated/**` y `lib/api-client-react/src/generated/api.schemas.ts`.

### 2. Edición de fecha límite y timezone

- El `datetime-local` del detalle muestra la hora local del navegador en vez de cortar directamente un ISO UTC.
- Una fecha modificada se valida y se convierte nuevamente a ISO/UTC antes del PATCH.
- Si el control no fue modificado, `fecha_limite` no se reenvía: se preserva el instante original, incluidos segundos y milisegundos.
- Fechas imposibles y horas inexistentes por cambios de DST son rechazadas en el cliente.
- El contrato actual no permite eliminar una fecha límite. Si se vacía el control, la UI lo informa y no envía el PATCH.
- Docker fija por defecto `TZ=America/Argentina/Buenos_Aires`, configurable mediante `TZ`, para que los filtros por día tengan la misma semántica que el entorno local.

Archivos principales: `frontend/src/lib/datetime-local.ts`, `frontend/src/pages/TicketDetail.tsx`, `.env.example` y `docker-compose.yml`.

### 3. Backup SQLite compatible con WAL

- Se agregó un backup online basado en `better-sqlite3#backup`, por lo que incorpora transacciones confirmadas que todavía estén en el WAL.
- La copia se genera primero como archivo parcial, se valida con `PRAGMA integrity_check` y recién entonces se publica.
- El destino es obligatorio, no puede ser la base de origen y nunca se sobrescribe.
- El CLI carga el `.env` del workspace, respeta `TICKETS_DB_PATH` y resuelve rutas relativas desde el directorio desde el que fue invocado.
- Comando local:

  ```bash
  pnpm run backup:db -- --output ./backups/tickets-AAAA-MM-DD.db
  ```

- El mismo CLI se empaqueta como `backend/dist/backup-db.mjs` para ejecutarlo dentro del contenedor.
- El runbook Docker dejó de copiar `tickets.db` con `cat`; ahora crea la copia verificada en `/tmp`, la extrae con `docker compose cp` y luego limpia el temporal.
- Se fijó el proyecto Compose como `ticketsadmin`, se aclaró la diferencia entre el checkout del runner y el checkout operativo, y se documentó cómo satisfacer `WEBHOOK_API_KEY` en comandos manuales sin reemplazar el secreto real del servicio.
- `/backups/` quedó excluido de Git y del contexto de build Docker.

Archivos principales: `lib/db/src/backup.ts`, `lib/db/src/db-path.ts`, `lib/db/package.json`, `scripts/src/backup-db.ts`, `scripts/package.json`, `backend/build.mjs`, `package.json`, `.gitignore`, `.dockerignore`, `README.md` y `docs/DEPLOY.md`.

### Validaciones ejecutadas

- `pnpm.cmd run build`: correcto; typecheck de backend, frontend, scripts y librerías, más builds de backend y frontend.
- Smoke HTTP sobre un backend temporal:
  - filtros de fecha válidos: `200`;
  - fecha inválida y booleano inválido: `400`;
  - `page=0`, `page=1.5`, `limit=-1` y `limit=101`: `400`;
  - consulta normal y `vencidos=false`: mismo total de 15 registros.
- Backup mediante CLI TypeScript y mediante el bundle de producción: ambos `Integridad: ok`, 7 páginas, 28.672 bytes y 15 tickets.
- Intento de reutilizar un destino existente: rechazado con exit code 1.
- Conversión verificada con `America/Argentina/Buenos_Aires`: `2026-07-17T15:30:45.123Z` se representa como `2026-07-17T12:30` en el control local.
- `docker-compose config -q`: configuración válida.
- `git diff --check`: sin errores de whitespace.

### Observaciones pendientes

- No se implementó la eliminación de `fecha_limite`; requiere hacer nullable ese campo en OpenAPI y regenerar ambos lados.
- No se modificaron los archivos SSE en desarrollo (`backend/src/lib/events.ts` y `backend/src/routes/events.ts`) ni el ajuste previo de `AppLayout.tsx`.
- Continúan las advertencias no bloqueantes de Vite por sourcemaps de algunos componentes UI y por el bundle principal de aproximadamente 850 kB.
- No se agregaron tests permanentes ni lint en esta intervención; corresponden al siguiente bloque de calidad del proyecto.

## 2026-07-17 — Orden compuesto por día y hora del llamado

**Agente:** Codex
**Contexto:** se ajustó el orden ascendente/descendente de la columna «Fecha y Hora» del listado de tickets.

### Cambio realizado

- El orden dejó de usar el timestamp completo de `fecha_creacion` como único criterio.
- Primero se ordena por el día calendario local derivado de `fecha_creacion`.
- Dentro de cada día se ordena por el campo `hora` del llamado.
- Cuando dos llamados tienen el mismo día y la misma hora, se usa `id` como desempate estable para evitar saltos entre páginas.
- La dirección elegida (`asc` o `desc`) se aplica a los tres criterios, por lo que descendente es el reverso exacto de ascendente.
- Se aclaró esta semántica en la descripción del parámetro `order` de OpenAPI.

Archivos afectados: `backend/src/routes/tickets.ts` y `lib/api-spec/openapi.yaml`.

### Validaciones ejecutadas

- Typecheck de backend: correcto.
- Build de backend: correcto.
- Smoke HTTP contra un backend temporal y la base local:
  - 15 tickets verificados en ascendente y descendente;
  - orden por día, hora e `id`: correcto en ambos sentidos;
  - el resultado descendente fue el reverso exacto del ascendente;
  - dentro del 16/07/2026, por ejemplo, `00:00` quedó antes de `11:34`, `13:43`, `14:26`, `14:48`, `17:44` y `17:52` en ascendente.
- El servidor temporal y sus logs fueron eliminados al finalizar la prueba.

### Observación

- Los 15 registros actuales tienen `hora` en formato `HH:MM`. El contrato todavía acepta strings libres; si en el futuro ingresan horas sin cero inicial o con otro formato, conviene validar y normalizar `hora` en OpenAPI, webhooks e importación.

## 2026-07-17 — Admin: paginación y catálogo de roles y usuarios

**Agente:** Codex
**Contexto:** se amplió el área administrativa con paginación equivalente a la lista de tickets, acceso del sidebar identificado con un escudo y una pantalla persistente para gestionar roles y usuarios.

### Interfaz administrativa

- La tabla de registros de `/admin` ahora permite mostrar 10, 25, 50 o 100 filas, indica total y página actual, y ofrece navegación Anterior/Siguiente.
- Los cambios de tamaño vuelven a la primera página y, después de borrar o filtrar registros, la página se ajusta únicamente cuando existe una respuesta real del servidor. Esto evita que una consulta en curso haga rebotar la navegación a la página 1.
- Se extrajeron el ingreso de `ADMIN_API_KEY`, los mensajes de error y la navegación a componentes compartidos por las pantallas de administración.
- El acceso «Administración» del sidebar general conserva la rueda de configuración a la izquierda y muestra el escudo solicitado en el extremo derecho del botón.
- Dentro de Administración, el acceso principal conserva el nombre «Tickets» y su icono de ticket; el escudo se quitó de ese botón.
- Se agregó `/admin/roles-usuarios`, con:
  - listado paginado y filtros de usuarios;
  - alta y edición de nombre, apellido, email, rol y estado;
  - activación/desactivación sin borrado físico;
  - alta, edición, activación/desactivación y borrado de roles;
  - bloqueo del borrado de un rol mientras tenga usuarios asignados;
  - selector de roles que distingue los inactivos y exige al menos un rol activo para crear usuarios.

### Persistencia y API

- Se agregaron las tablas SQLite `roles` y `usuarios` en `lib/db/src/schema/admin.ts`.
- Los nombres de rol y emails son únicos; los emails se guardan en minúsculas y `usuarios.role_id` referencia a `roles.id` con borrado restringido.
- Se generó la migración Drizzle `lib/db/drizzle/0001_sticky_ted_forrester.sql` y su snapshot para que el cambio también se aplique al iniciar el backend empaquetado o Docker.
- Se incorporaron endpoints protegidos por el middleware administrativo existente:
  - `GET/POST /api/admin/roles`;
  - `PATCH/DELETE /api/admin/roles/:id`;
  - `GET/POST /api/admin/users`;
  - `PATCH /api/admin/users/:id`.
- El contrato se agregó a OpenAPI y se regeneraron el cliente React Query y los validadores Zod.

### Alcance de seguridad

- Los registros de usuarios y roles son por ahora un **catálogo administrativo persistente**, no identidades autenticables.
- No se agregaron contraseñas, login, sesiones ni autorización efectiva por rol. Asignar un rol todavía no habilita ni restringe pantallas.
- `ADMIN_API_KEY` continúa siendo la única llave de las rutas `/api/admin/*` y sigue siendo opcional en desarrollo; si no está configurada, esas rutas quedan abiertas.
- El CRUD general de tickets conserva el modelo actual sin autenticación. Antes de exponer el sistema a internet hace falta implementar autenticación y autorización completas.

### Base local y recuperación

- Antes de cambiar el schema se creó el backup WAL-safe `backups/pre-admin-roles-20260717T133213.db`.
- El backup pasó `PRAGMA integrity_check` y quedó fuera de Git.
- Se aplicó el schema a la base local con Drizzle; las tablas `roles` y `usuarios` quedaron disponibles y la integridad posterior resultó `ok`.

### Validaciones ejecutadas

- Codegen de OpenAPI, cliente React Query y Zod: correcto.
- `pnpm.cmd run build`: correcto; incluye typecheck de librerías, backend, frontend y scripts, más los builds de backend y frontend.
- Smoke HTTP sobre una base temporal:
  - acceso sin llave: `401`;
  - paginación inválida: `400`;
  - nombres de rol y emails duplicados: `409`;
  - email duplicado con diferencias de mayúsculas: `409`;
  - 13 usuarios distribuidos correctamente en páginas de 10 y 3;
  - filtro booleano inválido: `400`;
  - borrado de rol asignado: `409`;
  - desactivación y filtro por estado: correctos;
  - reasignación y posterior borrado de un rol sin usuarios: `204`;
  - búsqueda de roles y rol inexistente: resultados esperados.
- El backend temporal, sus logs y la base temporal se eliminaron al terminar la prueba.
- Persisten únicamente las advertencias no bloqueantes conocidas de Vite por sourcemaps y por el tamaño del bundle principal.

### Archivos locales preservados

- No se mezclaron los cambios SSE que continuaron desarrollándose en paralelo en `backend/src/lib/events.ts`, `backend/src/routes/events.ts`, `backend/src/routes/index.ts`, `backend/src/routes/webhooks.ts`, `frontend/nginx.conf` y `frontend/src/components/layout/AppLayout.tsx`.
- El escudo se agregó como indicador secundario en el extremo derecho del link «Administración» del sidebar, preservando la rueda original, el resto de su comportamiento y los cambios SSE concurrentes.

## 2026-07-17 — Actualización en vivo (SSE) al recibir llamados

**Agente:** Claude
**Contexto:** el usuario pidió que la app se actualice "solo cuando hay un nuevo llamado", sin recargar. Se completaron los archivos SSE que estaban en desarrollo y se integraron con el trabajo de roles/usuarios ya presente en el árbol.

### Cambio realizado

- `GET /api/events` (fuera del contrato OpenAPI a propósito: es un stream `text/event-stream` que Orval no puede modelar): mantiene la conexión abierta, manda `retry: 5000` para reconexión automática del navegador y un heartbeat cada 25 s para que los proxies no corten por inactividad.
- Registro de clientes y difusión en `backend/src/lib/events.ts` (estado en memoria del proceso; si algún día se escala horizontalmente hace falta pub/sub externo).
- Emisores: el webhook de n8n emite `ticket_creado` (con contacto y motivo), `/admin/import` emite `tickets_importados` (solo en corridas reales con insertados > 0) y `/admin/truncate` emite `datos_actualizados`.
- Frontend: `useEventosEnVivo()` en `AppLayout` — una única conexión `EventSource` por pestaña; ante cualquier evento invalida todas las queries de React Query (refresca listado, dashboard y sidebar al instante) y muestra un toast con el contacto y el motivo del llamado nuevo. El polling de 30 s del sidebar se conserva como respaldo.
- nginx (producción): location dedicado `/api/events` con `proxy_buffering off` y `proxy_read_timeout 1h` — sin esto nginx bufferea el stream y los eventos no llegan.

### Decisiones de integración

- Por pedido explícito del usuario, `/admin` vuelve a estar visible en el sidebar (revierte la decisión local anterior). Cuando exista login con permisos, el link se mostrará solo a usuarios habilitados. Se conservó el icono de escudo elegido por la intervención concurrente.
- Los broadcasts se insertaron sobre la versión actual de `backend/src/routes/admin.ts` (la que incluye roles/usuarios), sin tocar esa lógica.

### Validaciones ejecutadas

- Typecheck completo del workspace: correcto (con el trabajo de roles/usuarios del árbol incluido).
- Prueba en vivo contra el backend de desarrollo: con una conexión SSE abierta vía curl, un POST real al webhook entregó `{"tipo":"ticket_creado","ticket_id":24,...}` en el stream en el momento; el ticket de prueba se eliminó después.
- Archivos afectados: `backend/src/lib/events.ts`, `backend/src/routes/events.ts`, `backend/src/routes/index.ts`, `backend/src/routes/webhooks.ts`, `backend/src/routes/admin.ts` (solo broadcasts), `frontend/src/components/layout/AppLayout.tsx`, `frontend/nginx.conf`, `docs/FLUJO.md`.

## 2026-07-17 — Toasts semánticos y mensajes de acciones

**Agente:** Codex
**Contexto:** mientras el login se desarrolla en paralelo, se mejoró el sistema existente de notificaciones Radix sin cambiar el flujo de autenticación ni migrar al componente Sonner que permanece sin uso.

### Sistema visual

- Se incorporaron variantes `success`, `info`, `warning` y `destructive`, además del estilo neutro existente.
- Cada variante muestra un icono Lucide y colores semánticos suaves: verde para éxitos, azul para información/SSE, ámbar para advertencias y rojo para errores.
- El diseño ahora usa una tarjeta más compacta, borde, sombra, mejor jerarquía entre título y descripción y botón de cierre visible con etiqueta accesible.
- Las duraciones dependen de la severidad: los éxitos desaparecen antes y los errores permanecen más tiempo para poder leerlos.
- Se permiten hasta tres avisos simultáneos y las notificaciones cerradas se retiran del estado al terminar la animación, en lugar de conservarse durante más de 16 minutos.

### Mensajes y comportamiento

- Admin informa qué ticket se creó, actualizó o eliminó; la importación detalla nuevos, existentes e inválidos; el vaciado muestra sus conteos con tono de advertencia.
- Roles y usuarios identifica la persona, email o rol afectado al crear, editar, activar, desactivar o eliminar.
- El detalle del ticket muestra su número y estado al actualizar, conserva el texto del seguimiento agregado y presenta el error real devuelto por la API cuando está disponible.
- Las validaciones locales de formularios y fechas usan advertencias, reservando el rojo para fallos reales de la operación.
- Los eventos SSE de llamados e importaciones usan el tono informativo y se deduplican con el éxito local correspondiente para evitar dos avisos por una misma acción.

### Convivencia con login y validación

- No se editaron los archivos de backend, contratos, migraciones ni código generado que estaban siendo modificados por el trabajo paralelo de login.
- Los únicos puntos compartidos fueron los llamados a `toast` ya existentes en `AppLayout.tsx` y `TicketDetail.tsx`; se conservaron los cambios de sesión presentes.
- Typecheck del frontend: correcto.
- Build de producción del frontend: correcto. Continúan únicamente las advertencias conocidas por sourcemaps y tamaño del bundle.

## 2026-07-17 — Login obligatorio, sesiones y bloqueo total de la API

**Agente:** Claude
**Contexto:** fases 1 y 2 del plan de autenticación definido por el usuario: credenciales + sesiones + bloqueo de todas las URLs. Los permisos por rol con checkboxes quedan para la fase siguiente.

### Cambio realizado

- **Schema (migración 0002)**: columna `usuarios.password_hash` (nullable: un usuario del catálogo sin contraseña no puede loguearse) y tabla `sesiones` (token PK, usuario_id con borrado en cascada, expiración). Aplicada a la base local con push; en Docker la aplica el migrador al arrancar.
- **Contraseñas**: scrypt del módulo `crypto` de Node (formato `scrypt:<salt>:<hash>`, comparación en tiempo constante). Sin dependencias nativas nuevas — el build de Docker no cambia.
- **Contrato OpenAPI**: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (schemas `LoginInput` y `AuthUser`) + codegen de cliente React Query y Zod.
- **Backend**:
  - `requireSession` como candado global en `routes/index.ts`: TODA la API exige sesión salvo `healthz`, el webhook de n8n (clave propia) y el login. Incluye `/api/events` (SSE) y `/api/admin/*`.
  - Sesiones en cookie `gsb_session` (`httpOnly`, `SameSite=Lax`, 7 días) respaldadas en la tabla, con purga perezosa de vencidas en cada login. Logout revoca la fila y limpia la cookie.
  - Un usuario desactivado en el catálogo pierde acceso aunque su sesión siga viva.
  - `/api/admin/*` mantiene además `x-admin-key` → **doble verificación** (`ADMIN_API_KEY` ya configurada en `.env`).
  - **Seed idempotente** al arrancar: solo si ningún usuario tiene contraseña, crea el rol `Administrador` y el usuario `admin`/`admin` (con warning en el log para cambiar la clave). No revive al admin si ya existen cuentas con contraseña — y evita el lockout total.
  - **Seguimientos**: `autor` sale siempre de la sesión; el valor del cliente se ignora (el historial deja de ser falsificable). Se quitó el `'Usuario Actual'` hardcodeado del frontend.
- **Frontend**:
  - `AuthGate` en `App.tsx`: sin sesión, cualquier URL renderiza únicamente la pantalla de login. Este fue el comportamiento inicial; la separación posterior de rutas normaliza el acceso en `/` y lleva el Dashboard a `/dashboard`.
  - Pantalla `Login.tsx` con manejo de errores 401 vs. red.
  - Ante cualquier respuesta 401 de la API (sesión vencida/revocada), un `QueryCache.onError` invalida `/auth/me` y el gate devuelve al login.
  - Footer del sidebar: usuario logueado + rol + botón de cerrar sesión (limpia todo el caché de queries).
  - El stream SSE queda detrás del gate: solo conecta con sesión iniciada.

### Validaciones ejecutadas

- Typecheck completo del workspace: correcto.
- Batería E2E contra el backend de desarrollo y la base local (12 casos, todos correctos):
  - `healthz` público: 200; `/api/tickets` y `/api/events` sin sesión: 401;
  - webhook n8n sin sesión pero con su `x-api-key`: 201 — **la ingesta automática no se ve afectada por el login**;
  - login con clave incorrecta: 401 (mensaje genérico); login `admin`/`admin`: 200 + cookie; `/auth/me`: datos correctos con rol `Administrador`;
  - con sesión: tickets 200; seguimiento creado con `autor: "Admin"` pese a que el cliente mandó un autor falsificado;
  - `/api/admin/roles` con sesión pero sin `x-admin-key`: 401; con ambas llaves: 200 (doble verificación);
  - logout: 204 y el mismo cookie jar pasa a recibir 401.
  - El ticket de prueba creado por el webhook se eliminó al final.
- Frontend respondiendo 200 con el gate activo.

### Nota operativa

- Al deployar esto al servidor de testing, el seed crea `admin`/`admin` allá también: **entrar y cambiar la clave** (o crear usuarios propios) apenas se despliegue. n8n no requiere ningún cambio.

## 2026-07-17 — Rol SysAdmin: acceso a administración restringido por rol

**Agente:** Claude
**Contexto:** el usuario definió que la cuenta semilla es suya, se llama SysAdmin (el "usuario Dios"), y que el botón/pestaña Administración solo debe verse y ser accesible para quienes tengan ese rol. También corrigió el proceso: no se pushea sin su OK explícito tras probar localmente.

### Cambio realizado

- **Fix previo (loop infinito)**: el handler global de 401 invalidaba `/auth/me` incluso cuando la que fallaba era `/auth/me` misma → refetch → 401 → loop (~3.900 requests) y pantalla en blanco. Ahora esa query queda excluida del handler.
- **Comportamiento histórico, reemplazado el 2026-08-04**: esta intervención renombraba el rol `Administrador` → `SysAdmin` y mantenía una credencial semilla pública. La remediación actual crea roles separados, migra únicamente la identidad histórica cuando corresponde y exige `BOOTSTRAP_SYSADMIN_PASSWORD`; `admin/admin` y `sysadmin/admin` ya no son credenciales válidas del producto.
- **Backend**: middleware `requireSysAdmin` — `/api/admin/*` exige rol SysAdmin (403 sin él) además de la sesión y de `x-admin-key`. Tres candados: sesión + rol + clave.
- **Frontend**: el link «Administración» del sidebar solo se renderiza para `me.rol === 'SysAdmin'`; las rutas `/admin` y `/admin/roles-usuarios` muestran NotFound para cualquier otro rol (guard `SoloSysAdmin`). Constante compartida en `frontend/src/lib/roles.ts`, espejo de `backend/src/lib/auth.ts`.

### Validaciones ejecutadas

- Typecheck completo: correcto.
- E2E contra el backend de desarrollo y la base local:
  - login viejo `admin`: 401 (renombrado); login `sysadmin`: 200 con rol SysAdmin;
  - SysAdmin + x-admin-key sobre `/admin/roles`: 200;
  - se creó un rol `Operador` y un usuario común; sin contraseña no puede loguearse (401); con contraseña accede a tickets (200);
  - **el usuario común recibe 403 en `/api/admin/*` aunque presente la x-admin-key correcta** — la clave sola no alcanza, el rol manda;
  - usuario y rol de prueba eliminados al final (base limpia: solo sysadmin/SysAdmin).

### Pendiente conocido (resuelto el 2026-08-04)

- Los roles base ahora están protegidos contra renombre, desactivación y borrado, y no se permite degradar ni desactivar al último SysAdmin utilizable.

## 2026-07-17 — Roles Operador/Administrador, reset de contraseña y leyenda de la llave

**Agente:** Claude
**Contexto:** el usuario definió la jerarquía de roles y pidió: llavesita de reset de contraseña por usuario, rol Operador que no puede cerrar tickets (opción grisada con leyenda), rol Administrador (todo menos el panel admin), y una leyenda real sobre la llave de administración con indicador de estado.

### Cambio realizado

- **Roles base en el seed** (idempotente, corre en cada arranque): `Administrador` ("gestión completa de tickets, puede cerrarlos, sin panel de administración") y `Operador` ("gestión básica, no puede cerrar tickets"). Jerarquía: SysAdmin > Administrador > Operador.
- **Cerrar tickets restringido**: `PATCH /api/tickets/:id` con `estado: "cerrado"` responde 403 salvo rol SysAdmin o Administrador (`puedeCerrarTickets` en `backend/src/lib/auth.ts`, espejo en `frontend/src/lib/roles.ts`). En el detalle del ticket, la opción "CERRADO" aparece deshabilitada para el resto con la leyenda "Solo puede ser cerrado por un administrador".
- **Reset de contraseña**: nuevo endpoint `POST /admin/users/{id}/password` (contrato OpenAPI + codegen; mínimo 6 caracteres). Hashea con scrypt y **revoca todas las sesiones del usuario**. En la pantalla de roles y usuarios, cada fila tiene la llavesita ámbar que abre el diálogo (clave nueva + repetir, validación en vivo).
- **Llave de administración**: leyenda real en el header del panel ("segunda verificación además de sesión y rol; queda guardada solo en esta pestaña") + indicador en vivo del estado — verde "Llave activa", rojo "Llave inválida" o "Falta la llave" — verificado con una consulta mínima a la API con la llave actual.

### Validaciones ejecutadas

- Typecheck completo: correcto.
- E2E contra el backend de desarrollo:
  - roles base presentes tras el arranque (Administrador, Operador, SysAdmin);
  - reset de contraseña: 204; contraseña corta: 400;
  - usuario Operador logueado: cerrar → 403, en_proceso → 200; SysAdmin: cerrar → 200;
  - reset de contraseña con el usuario logueado: su sesión vieja pasó a 401 al instante;
  - ticket usado en la prueba restaurado a su estado original y usuario de prueba eliminado (quedan solo sysadmin y los tres roles).

### Pendiente

- Cambios sin commitear a la espera del OK del usuario tras la prueba local.

## 2026-07-23 — Ordenamiento múltiple en Tickets y Administrador

**Agente:** Codex

- Las tablas de Tickets y Administrador ahora admiten varios criterios ordenados por prioridad.
- Un clic normal conserva el comportamiento simple: selecciona una única columna o invierte su dirección. `Shift + clic` agrega otra columna o invierte una ya seleccionada sin perder las demás.
- Cada encabezado activo muestra su dirección y un número (`1`, `2`, etc.) que identifica la prioridad.
- El botón `Restablecer orden` limpia la combinación y vuelve a `Fecha de llegada` descendente, con los tickets más recientes primero, tanto en Tickets como en Administrador.
- El backend aplica todos los criterios antes de paginar mediante el parámetro compatible `sort=columna:direccion,...`; `sort_by` y `order` se mantienen para clientes anteriores.
- La exportación CSV utiliza exactamente los mismos filtros y el mismo orden compuesto que la tabla.
- El desempate técnico por ID se agrega una sola vez al final, evitando que anule los criterios secundarios.

### Validaciones ejecutadas

- Backend: 48/48 pruebas correctas, incluidos orden secundario antes de paginar, CSV, parámetros inválidos y compatibilidad anterior.
- Frontend: 36/36 pruebas correctas, incluidos reemplazo, combinación, inversión, serialización y reutilización en CSV.
- Typecheck y build completo del workspace: correctos.
- Backend y frontend reiniciados localmente en los puertos `5000` y `3000`, ambos con respuesta HTTP `200`.
- Cambios locales en `version/0.5`, sin commit ni push.

## 2026-07-17 — Persistencia de llave, visibilidad de secretos y categoría Legales

**Agente:** Codex
**Contexto:** se pidió no tener que volver a ingresar la `ADMIN_API_KEY` después de cada login, mantener los secretos ocultos con opción de visualizarlos y sumar `Legales` a la clasificación automática de motivos.

### Llave administrativa recordada

- La llave **no se guarda en la base de datos** ni se incorpora a usuarios, roles o sesiones. Guardar el secreto maestro reversible en SQLite eliminaría el valor de la segunda verificación y aumentaría su exposición.
- `useAdminAccess` la persiste en `localStorage` bajo `admin-key:user:<id>`, separada por usuario SysAdmin. El valor legado de `sessionStorage` se migra una sola vez.
- El logout conserva esta preferencia local, pero sigue revocando la sesión, limpiando React Query y recargando la raíz. Vaciar manualmente el campo elimina la llave persistida para ese usuario.
- El campo permanece enmascarado por defecto y tiene un botón accesible para mostrar/ocultar. La llave tampoco forma parte del `queryKey` de React Query.
- Alcance de seguridad: la comodidad funciona solamente en ese navegador/perfil. Como todo valor de `localStorage`, podría ser leído por JavaScript del mismo origen ante una vulnerabilidad XSS; cifrarlo solo del lado cliente no aporta protección real sin solicitar otro secreto.

### Campos de contraseña

- Se agregó el componente reutilizable `PasswordInput` con ojo abierto/cerrado, botón `type="button"`, texto accesible, foco visible y soporte de campos deshabilitados.
- Se aplicó al login, contraseña inicial y repetición al crear usuarios, y ambos campos del restablecimiento de contraseña.
- Al cerrar, cancelar o guardar los diálogos administrativos, los valores de contraseña se eliminan del estado React y la visibilidad vuelve a oculta al reabrir.

### Categoría `Legales`

- El código estable `legales` y la etiqueta **Legales** se agregaron al clasificador compartido, schema Drizzle, contrato OpenAPI, clientes generados, filtros, badges y gráficos.
- Las reglas priorizan señales legales explícitas: carta documento, telegrama laboral, SECLO, asesoramiento jurídico, intimaciones, demandas/juicios/audiencias con contexto laboral o judicial y contacto explícito con abogados.
- Se agregaron casos negativos para evitar falsos positivos: un recibo destinado a un abogado conserva `recibos_documentacion`, una abogada postulándose conserva `empleo_postulaciones` y una referencia genérica al nombre legal de la empresa queda sin clasificar.
- La migración de datos `0006_add_legales_category.sql` actualiza únicamente `motivo_categoria`; respeta la prioridad del motivo sobre el resumen y conserva intactos `motivo` y `resumen`. Incluye snapshot y journal de Drizzle para mantener la cadena de migraciones.
- Antes del backfill local se creó `backups/pre-legales-20260717-171039.db`, verificado con `integrity_check = ok`. La base actual no contenía coincidencias legales: se modificaron 0 filas, los campos originales conservaron el mismo hash y la integridad permaneció en `ok`.

### Validaciones

- Tests del clasificador: 10/10 correctos, incluidos prioridad motivo/resumen, acentos y falsos positivos.
- Test de la migración sobre SQLite en memoria: correcto; solo cambia la categoría derivada de los fixtures legales.
- Typecheck del frontend: correcto.
- Build completo del workspace: correcto. El codegen de OpenAPI también finalizó correctamente.
- Servicios verificados después del reinicio: frontend `/` y `/dashboard` en HTTP 200; backend `/api/healthz` en HTTP 200.
- La comprobación E2E adicional del navegador no se contabilizó porque Chromium quedó bloqueado; se detuvieron exclusivamente esos procesos de prueba y se eliminó su perfil temporal.
- No se realizó commit ni push.

## 2026-07-17 — API key obligatoria para gestiones SysAdmin y redirección de logout

**Agente:** Codex
**Contexto:** se detectó que el CRUD de tickets dentro de Administración mezclaba endpoints protegidos por `x-admin-key` con rutas operativas que solo exigían sesión. Por eso un SysAdmin podía vaciar el campo de la llave y aun así editar o borrar desde esa pantalla. También se pidió que el cierre de sesión navegue automáticamente a la raíz, donde vive el login.

### Autorización aplicada

- `requireAdminKey` ahora **falla cerrado**: si `ADMIN_API_KEY` falta, está vacía o contiene solo espacios, responde `503`. Una llave ausente o incorrecta responde `401`; nunca se abre el panel por falta de configuración.
- Todas las rutas `/api/admin/*` mantienen el orden de candados: sesión válida → rol `SysAdmin` → `x-admin-key`. Esto incluye alta/edición de usuarios y roles, reset de contraseñas, alta manual de tickets, importación y truncate.
- `DELETE /api/tickets/:id` quedó reservado a sesión SysAdmin + API key. Ya no puede ejecutarlo cualquier usuario autenticado.
- `PATCH /api/tickets/:id` diferencia los usos:
  - los campos operativos `estado`, `prioridad`, `notas`, `progreso` y `fecha_limite` conservan el flujo normal por sesión/rol;
  - modificar datos administrativos u originales (`hora`, contacto, empresa, motivo/resumen, audio, notificación o fecha de resolución) exige SysAdmin + API key.
- El formulario CRUD de Administración ahora envía `x-admin-key` tanto al editar como al eliminar. La validación es del backend; ocultar botones o rutas en el frontend no se considera una defensa.

### Logout y experiencia de usuario

- Tras un logout exitoso se limpia React Query, se bloquea el doble clic mientras la petición está pendiente y se recarga `/` con reemplazo de historial para descartar por completo el estado autenticado anterior. La llave administrativa se conserva en el almacenamiento local por usuario, según la actualización posterior documentada en esta bitácora.
- No existe una pantalla independiente en `/login`: cuando no hay sesión, `AuthGate` muestra el formulario de acceso en la raíz (`http://<host>:3000/`).
- El indicador de la llave muestra específicamente cuando el servidor responde `503` por falta de `ADMIN_API_KEY`.

### Contrato, despliegue y validaciones

- OpenAPI documenta la autorización condicional del `PATCH`, el borrado exclusivo de SysAdmin y las respuestas `401/403/503`; los clientes React Query y Zod se regeneraron correctamente.
- `.env.example`, Docker Compose, el workflow de deploy y los README/runbooks declaran `ADMIN_API_KEY` como obligatoria. Compose corta el despliegue si no se entrega la variable.
- `pnpm run build`: correcto para librerías, backend, frontend y scripts. Persisten únicamente los avisos no bloqueantes conocidos de sourcemaps y tamaño del bundle.
- Pruebas HTTP contra los servidores reconstruidos, usando IDs inexistentes para no modificar tickets reales:
  - edición administrativa sin llave / con llave incorrecta → `401`; con llave válida llega al recurso y devuelve `404`;
  - edición operativa sin llave llega al recurso y devuelve `404`, confirmando que no se bloqueó el trabajo diario;
  - borrado sin llave → `401`; con llave válida → `204` sobre ID inexistente;
  - alta de usuario o rol sin llave → `401`; con llave válida y body deliberadamente inválido → `400`, confirmando que superó autorización y llegó a validación;
  - backend aislado con `ADMIN_API_KEY` en blanco → `503` en `/api/admin/roles`.
- Las sesiones temporales se cerraron al finalizar. Backend y frontend quedaron activos en `5000` y `3000`, ambos con HTTP `200`. No se realizó commit ni push.

## 2026-07-17 — Raíz de login y pantallas de error

**Agente:** Codex
**Contexto:** se corrigió el destino del logout porque el login no es una ruta propia: se renderiza en `/` cuando no existe una sesión válida. También se unificó el tratamiento visual de errores para evitar pantallas vacías o mensajes 404 engañosos ante problemas de permisos, red o servidor.

### Navegación y sesión

- El logout recarga `/` mediante reemplazo de historial; no genera ni utiliza `/login`.
- Un `401` de sesión invalida/revalida `/auth/me`, normaliza la URL a `/` y muestra allí el formulario de acceso.
- Los `401` causados por una API key administrativa ausente o incorrecta no cierran la sesión del SysAdmin: se informan dentro de la gestión correspondiente.

### Experiencia de error

- Se agregó una pantalla reutilizable con textos en español para `401`, `403`, `404`, `409`, `500`, `503` y errores desconocidos.
- Todas las variantes ofrecen **Volver al inicio**; los fallos recuperables de red o servidor agregan **Reintentar** con indicador de carga.
- El acceso a Administración sin rol SysAdmin muestra correctamente `403`, y una ruta inexistente muestra `404`.
- Un límite global de errores de React captura fallos de render no controlados y ofrece recargar la aplicación.
- Dashboard, listado de tickets, detalle y CRUD administrativo distinguen un fallo de carga de un resultado vacío y permiten reintentar. Un ticket inexistente conserva su tratamiento específico como `404`.

### Documentación

- Se actualizaron `frontend/README_FRONTEND.md`, `docs/FLUJO.md` y esta bitácora con la raíz real del login y la matriz de errores.
- `pnpm --filter @workspace/frontend run typecheck`: correcto.
- `pnpm run build`: correcto para librerías, backend, frontend y scripts; solo permanecen los avisos no bloqueantes ya conocidos de sourcemaps y tamaño del bundle.
- Verificación HTTP final: frontend en `3000` y backend (`/api/healthz`) en `5000`, ambos con respuesta `200`.
- `git diff --check`: correcto; únicamente se informaron las advertencias esperadas de conversión LF/CRLF de Git en Windows.
- No se realizó commit ni push.

## 2026-07-17 — Separación entre login y Dashboard

**Agente:** Codex
**Contexto:** después del logout la URL cambiaba a `/`, pero esa misma ruta también renderizaba el Dashboard. `queryClient.clear()` elimina las queries, aunque un observer activo puede conservar brevemente su último resultado; durante esa ventana la raíz volvía a mostrar contenido autenticado. Se eligió la alternativa de conservar el login en la raíz y crear `/dashboard` como ruta independiente.

### Contrato de navegación

- `/` es la entrada pública: sin sesión muestra el formulario de login y con una sesión válida redirige a `/dashboard` mediante reemplazo de historial.
- `/dashboard` contiene el Dashboard y está protegido, al igual que `/tickets` y `/admin`, por `AuthGate`.
- El login exitoso actualiza primero el caché de `/auth/me` y navega explícitamente a `/dashboard`.
- El enlace Dashboard del sidebar apunta a `/dashboard` y su estado activo contempla subrutas sin confundirlo con la raíz.
- No se agregó un endpoint de backend ni una pantalla `/login`: el cambio es exclusivamente de routing del frontend.

### Logout sin estado residual

- Después del `204` se limpia React Query, se conserva la llave administrativa local del usuario y se usa `window.location.replace(import.meta.env.BASE_URL)` para recargar la raíz.
- La recarga completa desmonta el árbol autenticado y vuelve a consultar `/auth/me` con la cookie ya eliminada; así no puede reaparecer el Dashboard por un usuario retenido en memoria.
- Las pantallas de error autenticadas vuelven por defecto a `/dashboard`; los errores ocurridos mientras se verifica la sesión vuelven a `/`.

### Documentación y validación

- Se actualizaron `frontend/README_FRONTEND.md`, `docs/FLUJO.md` y esta bitácora con el nuevo mapa de rutas.
- `pnpm run build`: correcto para librerías, backend, frontend y scripts; solo permanecen los avisos no bloqueantes ya conocidos de sourcemaps y tamaño del bundle.
- Prueba E2E headless con un perfil aislado de navegador:
  - abrir `/dashboard` sin sesión terminó en `/` mostrando Login;
  - un login exitoso terminó en `/dashboard` mostrando el Dashboard;
  - el botón de logout terminó en `/` mostrando nuevamente Login.
- `/` y `/dashboard` respondieron `200` como rutas SPA, y `/api/auth/me` sin cookie respondió `401`.
- Los perfiles y scripts temporales usados para la prueba se eliminaron del workspace.
- No se realizó commit ni push.

## 2026-07-17 — Clasificación automática de motivos sin alterar datos de n8n

**Agente:** Codex
**Contexto:** el Dashboard agrupaba literalmente cada redacción recibida en `motivo`, por lo que pequeñas variaciones generaban categorías distintas. El usuario aprobó normalizar la visualización con la condición explícita de no modificar ningún dato de origen.

### Protección de los datos originales

- `tickets.motivo` y `tickets.resumen` se conservan exactamente como llegaron. La clasificación trabaja sobre texto normalizado en memoria y escribe únicamente la nueva columna derivada `motivo_categoria`.
- Antes del cambio se creó el backup WAL-safe `backups/pre-motivo-categorias-20260717-150952.db`; pasó `PRAGMA integrity_check` y permanece fuera de Git.
- El backfill local comparó por SHA-256 los campos `id`, `motivo` y `resumen` antes y después: los 15 tickets conservaron el mismo hash (`9bcf05faff3fe83fbcb4e667bb45c84feb7782a5d8db4b2c6f5603c58447fd4c`).
- Los textos ambiguos o desconocidos no se fuerzan a una categoría: quedan en `sin_clasificar`.

### Taxonomía y reglas

- Categorías estables: `haberes_pagos`, `recibos_documentacion`, `vacaciones_licencias`, `bajas_liquidacion`, `empleo_postulaciones`, `contacto_general`, `reclamos` y `sin_clasificar`.
- El clasificador compartido elimina tildes, signos y diferencias de mayúsculas solo en una copia para comparar patrones. Primero evalúa `motivo`; consulta `resumen` únicamente si el motivo no coincide, evitando que un detalle secundario pise la intención explícita.
- Se contemplaron redacciones reales de la base, incluida finalización del período de prueba, liquidación/entrega de uniforme, llamada perdida y el typo `incorporciones`.
- Webhook n8n, alta manual, importación CSV/Excel y edición de motivo/resumen usan la misma función. El cliente no puede enviar ni sobrescribir directamente la categoría derivada.

### Base, API e interfaz

- Schema Drizzle y migración `0003_faulty_zaran.sql`: columna `motivo_categoria` no nula con fallback seguro y backfill determinista para bases ya existentes.
- `GET /api/dashboard/motivos` agrupa por código estable y devuelve también su etiqueta legible; `GET /api/tickets` acepta el filtro exacto `motivo_categoria` sin reemplazar el filtro textual de `motivo`.
- OpenAPI, validadores Zod y cliente React Query fueron regenerados con el nuevo campo y enum.
- Dashboard usa etiquetas y colores fijos por categoría. El listado suma filtro y badge de categoría, pero mantiene visible debajo la frase original del contacto.

### Validaciones ejecutadas

- Codegen y typecheck completo del workspace: correctos.
- La base local quedó íntegra y distribuida en las ocho categorías: bajas 3, empleo 3, sin clasificar 3, recibos 2 y una en cada categoría restante.
- La migración se ejecutó además sobre una base temporal con 11 fixtures, incluyendo prioridad de motivo sobre resumen: categorías esperadas, campos originales idénticos e `integrity_check = ok`.
- El archivo temporal de validación se eliminó al terminar. Los cambios permanecen sin commit ni push hasta indicación explícita del usuario.

## 2026-07-17 — Footer del sidebar V0.2 y reinicio local

**Agente:** Codex

- Se conservó el nombre del usuario y el rol en líneas independientes dentro del bloque de sesión.
- La marca se separó visualmente mediante una línea tenue y quedó al pie como `GSB IT - V0.2`, sin modificar autenticación, navegación, SSE ni logout.
- Se reiniciaron backend y frontend para cargar el clasificador y la interfaz actuales. El backend quedó escuchando en `5000` y el frontend en `3000`, ambos con respuesta HTTP `200`; `/api/dashboard/motivos` respondió correctamente desde la sesión abierta.

## 2026-07-17 — Categoría y empresa reorganizadas en el listado

**Agente:** Codex

- La columna visible `Empresa` fue reemplazada por `Categoría` y ahora contiene el badge cromático de la clasificación automática.
- La columna `Motivo` volvió a mostrar únicamente el texto original recibido, sin ocultarlo ni reemplazarlo.
- La empresa se movió debajo del nombre del contacto en tipografía secundaria; cuando no existe o solo contiene espacios se muestra `Sin empresa asociada`.
- El dato y el filtro de empresa se conservaron. También se mantuvieron las ocho columnas, sus skeletons y el `colSpan` del estado vacío.

## 2026-07-17 — Autoasignación por transición de estado

**Agente:** Codex
**Regla acordada:** una transición real de estado asigna el ticket al usuario autenticado que la ejecutó. La primera salida de `nuevo` lo toma y una transición posterior realizada por otra persona lo reasigna a esa última persona. Editar otros campos o reenviar el mismo estado conserva al responsable actual.

### Implementación y compatibilidad

- Antes del cambio se creó el backup WAL-safe `backups/pre-autoasignacion-20260717-154250.db`, verificado con `integrity_check = ok`.
- Tras aplicar y verificar el esquema local se creó además `backups/post-autoasignacion-20260717-155422.db`, también íntegro.
- La migración aditiva `0005_sturdy_night_nurse.sql` incorpora `tickets.asignado_usuario_id`, FK nullable a `usuarios.id` con `ON DELETE SET NULL`. No se intentó inferir responsables históricos por nombre.
- `asignado_usuario_id` es la identidad autoritativa. `asignado_a` se conserva como nombre visible y como compatibilidad para valores históricos recibidos por webhook o importaciones.
- `PATCH /api/tickets/:id` obtiene el usuario exclusivamente de `res.locals.authUser`; el cliente no puede enviar el ID ni falsificar la asignación mediante texto libre. En una transición se actualizan estado, ID y nombre dentro del mismo `UPDATE`.
- Cambiar notas, prioridad o progreso sin una transición no modifica la asignación. Intentar cerrar sin rol Administrador/SysAdmin sigue devolviendo `403` antes de reasignar.
- Cada actualización emite `ticket_actualizado` por SSE, por lo que las demás sesiones invalidan su caché y ven al responsable nuevo sin recargar manualmente.
- El campo libre “Asignado a” se retiró de la edición administrativa normal. Webhook e importadores siguen aceptando el valor externo legado sin convertirlo automáticamente en un usuario.

### Validaciones ejecutadas

- Contrato OpenAPI y clientes Zod/React Query regenerados; typecheck completo correcto.
- E2E sobre base temporal y backend aislado con dos operadores:
  - Ana cambió `nuevo → en_proceso` y quedó asignada;
  - Bruno editó prioridad reenviando `en_proceso` y la asignación siguió en Ana;
  - Bruno cambió `en_proceso → pendiente` y recibió la asignación;
  - Ana editó solo notas y la asignación permaneció en Bruno.
- La cadena real de migraciones `0000` a `0005` se aplicó en otra base temporal. Al eliminar el usuario asignado, la FK pasó a `null`, el snapshot textual se conservó y `integrity_check` resultó `ok`.
- Las bases, usuarios, sesiones y tickets temporales se eliminaron al finalizar. No se realizó commit ni push.

## 2026-07-17 — Nombre de usuario y contraseña al crear usuarios

**Agente:** Claude
**Contexto:** el usuario pidió que al crear un usuario desde el panel se pueda definir directamente su nombre de usuario y contraseña (en vez de crear el usuario sin clave y usar por separado la llavesita de reset) — "nosotros gestionamos todo y le damos los datos para que se logueen".

### Cambio realizado

- **Schema**: nueva columna `usuarios.username` (text, unique, **nullable** — migración 0004, `ALTER TABLE ADD COLUMN` sin default para no romper la fila existente de sysadmin). El login pasa a validar contra `username`, no contra `email` (que queda como dato de contacto).
- **Seed (`ensureAdminSeed`)**: además de lo que ya hacía, ahora (a) backfillea `username = email` para cualquier usuario existente con `username` nulo — corre en cada arranque, no-op una vez aplicado — y (b) setea `username: "sysadmin"` explícitamente en el alta/renombre del usuario semilla. Esto hizo que la cuenta sysadmin ya desplegada (creada antes de este cambio) recuperara el login solo, sin intervención manual.
- **Contrato OpenAPI**: `AdminUserInput` (creación) ahora exige `username` y `password` (mínimo 6 caracteres) además de lo que ya pedía; `AdminUserUpdate` admite `username` opcional (sin `password` — cambiar la clave de un usuario existente sigue siendo exclusivo del endpoint de reset, que revoca sesiones). `AdminUser` expone `username`.
- **Backend `POST/PATCH /admin/users`**: valida unicidad de `username` y `email` con chequeos proactivos antes del insert/update (para poder devolver un 409 específico por campo, ya que dos columnas UNIQUE no se pueden distinguir con un catch genérico); hashea la contraseña con `hashPassword()` al crear.
- **Fix de seguridad encontrado de paso**: `GET/POST/PATCH /admin/users` devolvían la fila completa de Drizzle, **incluido `password_hash`**, en la respuesta HTTP. Antes era inofensivo (siempre `null`), pero con contraseñas reales esto exponía el hash al cliente. Se agregó `PUBLIC_USER_COLUMNS` (proyección explícita sin `password_hash`) y se aplicó a las tres rutas.
- **Frontend** (`AdminRolesUsers.tsx`): el formulario de alta ahora pide nombre de usuario (siempre) y contraseña + repetir (solo al crear, con validación de mínimo 6 caracteres y coincidencia); al editar un usuario existente no se piden campos de contraseña — el cambio de clave sigue yendo por la llavesita de reset. La tabla ganó una columna "Nombre de usuario".

### Validaciones ejecutadas

- Typecheck completo del workspace: correcto.
- **Se detectó y corrigió un error propio durante la verificación**: la primera corrida de pruebas E2E dio resultados inconsistentes (sin campo `username` en las respuestas, `password_hash: null` visible, login por username fallando) porque el backend de desarrollo seguía corriendo una build vieja de antes de estos cambios (`pnpm run dev` no tiene watch mode). Se detectó por la presencia de `password_hash` en la respuesta (imposible bajo el código nuevo), se mató el proceso viejo, se reconstruyó y se repitió la prueba completa contra el código real.
- E2E contra el backend reconstruido (11 casos, todos correctos): alta con username+password sin `password_hash` en la respuesta; username duplicado → 409; email duplicado → 409; contraseña corta → 400; login por `username` → 200 con rol correcto; login por el email viejo → 401 (corte limpio); el usuario nuevo ve tickets pero no admin (403, la restricción por rol se mantiene); el listado de usuarios no expone `password_hash` en ningún registro; el backfill del seed dejó a `sysadmin` con `username: "sysadmin"` sin intervención manual.
- Datos de prueba (usuario `jperez` y un registro accidental creado contra el backend viejo) eliminados al finalizar; la base quedó con un único usuario (`sysadmin`).

### Pendiente

- Cambios sin commitear a la espera del OK del usuario tras la prueba local.
