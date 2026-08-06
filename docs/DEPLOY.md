# Despliegue en el servidor de testing (Docker + CI/CD)

> Server de testing: Linux con acceso SSH. CI/CD vía GitHub Actions con un
> **self-hosted runner** instalado en el propio servidor. Cada push a `main`
> pasa primero por un quality gate hospedado por GitHub y, solo si lo aprueba,
> reconstruye las imágenes y reinicia los contenedores en el servidor, sin
> exponer SSH ni usar un registro de imágenes externo.

## Arquitectura del despliegue

```
GitHub (PR o push a main)
        │
        ▼
Quality gate (codegen + schema + tests + typecheck + build)
        │
        ▼  solo push de main con gate aprobado
Self-hosted runner (corriendo EN el servidor de testing)
        │  build versionado → verifica IDs → up --no-build → smoke
        ▼
┌─────────────────────────────────────────────┐
│  Servidor de testing (IP fija interna)       │
│                                               │
│  ┌────────────┐        ┌──────────────────┐  │
│  │  frontend  │  /api  │     backend      │  │
│  │  (nginx)   │───────▶│    (Express)     │  │
│  │  :3000→80  │        │      :5000       │  │
│  └────────────┘        └────────┬─────────┘  │
│                                  │ volumen    │
│                          ┌───────▼────────┐   │
│                          │ tickets_data   │   │
│                          │ (SQLite)       │   │
│                          └────────────────┘   │
└─────────────────────────────────────────────┘
        ▲
        │ POST /api/webhooks/ticket (x-api-key)
       n8n (misma red interna)
```

- **`:5000`** — la API. Es donde apunta el nodo HTTP Request de n8n.
- **`:3000`** — el frontend, para que los operadores gestionen los tickets.
- El volumen nombrado `tickets_data` persiste el archivo SQLite entre reconstrucciones/reinicios de contenedores — **no se pierde al redeployar**.
- Las migraciones de la base (`lib/db/drizzle/*.sql`) se aplican solas al arrancar el contenedor del backend (ver `backend/src/migrate.ts`), antes de levantar la API. Es idempotente: en cada arranque solo aplica lo que falte.
- Una vez terminadas las migraciones, Node reemplaza al shell y recibe directamente `SIGTERM`. El backend deja de aceptar tráfico, bloquea altas SSE tardías y espera sockets/prioridad automática; SQLite se cierra recién en `beforeExit`, cubriendo handlers async de clientes abortados. El watchdog es de 20 segundos y Compose concede 30 antes de `SIGKILL`. Durante el migrador y el bootstrap inicial todavía no está instalado todo este ciclo; separarlos en fases cancelables queda como hardening posterior y las migraciones actuales siguen siendo transaccionales.
- Los pull requests ejecutan `.github/workflows/quality.yml` sin desplegar. El workflow de deploy reutiliza exactamente ese gate y el job self-hosted depende de su resultado; no construye ni reinicia contenedores si hay drift de codegen/schema, una prueba falla, TypeScript no compila o un build falla. Consulta `origin/main` antes de construir y nuevamente justo antes de reiniciar los servicios, por lo que omite un SHA que quedó obsoleto incluso durante el build.
- Antes de construir, el runner exige Docker Compose `>= 2.17.0`, comprueba las opciones de espera, la presencia de `curl` y valida el archivo con placeholders no sensibles. Una instalación incompatible falla antes de tocar servicios.
- El healthcheck del backend consulta `/api/readyz` y valida su JSON exacto. El frontend solo queda healthy si Nginx sirve la SPA real y también puede alcanzar ese JSON a través del proxy `/api`; por eso una fallback HTML no puede enmascarar una API rota. Hay 60 segundos de gracia para migraciones/bootstrap, pero cualquier éxito anticipado habilita el servicio de inmediato.
- Cada ejecución construye un par backend/frontend con referencias distintas y un tag irrepetible `git-<SHA>-run-<run_id>-<attempt>`. Ambas imágenes llevan `org.opencontainers.image.revision=<SHA>`; el runner inspecciona label e ID, ejecuta los CLIs empaquetados y `nginx -t`, y recién entonces vuelve a comprobar `main`. Un rerun no mueve la referencia de una ejecución anterior.
- `docker compose up --no-build --wait --wait-timeout 180` convierte un servicio no saludable en un deploy fallido y no puede reconstruir ni sustituir silenciosamente el artefacto ya verificado. Después se repiten tres smoke tests desde el host sobre API directa, SPA y proxy. Ante un fallo se publican estado y hasta 100 líneas de logs, sin seguimiento infinito.
- No se ejecuta un `docker image prune` global: el host es compartido con otros proyectos y esa operación podría eliminar artefactos ajenos o el único punto de rollback. La retención dirigida se incorporará cuando los manifiestos `current`/`previous` queden consolidados; hasta entonces el espacio se supervisa y cualquier falta de capacidad hace fallar el build antes del rollout.
- `depends_on.backend.restart: true` hace que una actualización explícita mediante Compose reinicie Nginx y renueve la resolución del nombre `backend`. No reacciona a degradaciones ni reemplazos externos: Compose no es un orquestador con autohealing por health. La espera confirma un instante y tampoco implica rollback automático; ese mecanismo se trata por separado.
- `docker-compose.yml` fija el nombre de proyecto `ticketsadmin`, de modo que contenedores, red y volumen conservan el mismo namespace aunque el workflow y un operador ejecuten Compose desde checkouts distintos.
- El backend corre con `TZ=America/Argentina/Buenos_Aires` por defecto (configurable con `TZ`). Los filtros por día calendario usan el timezone local del proceso, igual que en desarrollo.
- Nginx aplica a SPA, API, SSE y errores `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` y una `Permissions-Policy` mínima; además no publica su versión. Esto no reemplaza TLS. CSP se evaluará por separado después de inventariar fuentes, estilos dinámicos, audio y descargas `blob:`; HSTS y la cookie `Secure` sí se habilitarán cuando exista un borde HTTPS real.

## 1. Preparar el servidor

Docker y otros runners de self-hosted ya están instalados en el servidor (se usan para otros proyectos) — no hace falta tocar eso. Este repo requiere Docker Compose `2.17.0` o posterior; el workflow lo verifica antes de construir. Lo que sigue es específico de **este** repo.

### 1.1. Verificar que los puertos 5000 y 3000 estén libres y abrir el firewall

Como el servidor ya corre otros proyectos, confirmar antes que ninguno esté usando esos puertos:

```bash
sudo ss -tlnp | grep -E ':(5000|3000)\b'
```

Si aparece algo, avisar antes de continuar (hay que cambiar el mapeo de puertos en `docker-compose.yml` de este repo). Si están libres, abrir el firewall:

```bash
sudo ufw allow 5000/tcp   # API — la usa n8n
sudo ufw allow 3000/tcp   # Frontend — lo usan los operadores
sudo ufw status
```

(Si el servidor no usa `ufw` sino `iptables`/`firewalld`/reglas del proveedor cloud, adaptar según corresponda.)

### 1.2. Checkout del runner y checkout operativo

El deploy **no corre desde `/opt/ticketsAdmin`**: `actions/checkout` crea y actualiza automáticamente `GITHUB_WORKSPACE`, normalmente en una ruta similar a:

```
~/actions-runner-ticketsAdmin/_work/ticketsAdmin/ticketsAdmin
```

No hace falta clonar el repositorio para que funcione CI/CD. Si se quiere una ruta estable para tareas manuales, se puede mantener además un checkout operativo:

```bash
sudo mkdir -p /opt/ticketsAdmin
sudo chown $USER:$USER /opt/ticketsAdmin
git clone https://github.com/marianoLaclau/ticketsAdmin.git /opt/ticketsAdmin
```

Ese checkout es solo para operación manual y debe actualizarse antes de usar código o configuración nuevos. El nombre fijo `ticketsadmin` de Compose hace que ambos checkouts apunten al mismo proyecto desplegado.

## 2. Registrar un runner para este repo

Los runners de GitHub Actions se registran **por repositorio** (salvo que uses un runner group a nivel organización). Como ya tenés runners corriendo para otros proyectos en este mismo servidor, hace falta uno más, dedicado a `ticketsAdmin` — es perfectamente normal tener varias instancias de runner en la misma máquina, cada una en su propia carpeta.

Este paso requiere un token temporal que **solo GitHub genera** — no se puede automatizar desde acá.

1. En GitHub, en el repo `ticketsAdmin`: **Settings → Actions → Runners → New self-hosted runner**, elegir **Linux x64**.
2. GitHub va a mostrar comandos como estos (con un token único, distinto cada vez que se genera la página — copiarlos de ahí, no de acá). Usar una carpeta con nombre distintivo para no pisar los runners de los otros proyectos:

```bash
mkdir -p ~/actions-runner-ticketsAdmin && cd ~/actions-runner-ticketsAdmin
curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/download/<version>/actions-runner-linux-x64-<version>.tar.gz
tar xzf actions-runner-linux-x64.tar.gz

./config.sh --url https://github.com/marianoLaclau/ticketsAdmin --token <TOKEN-QUE-DA-GITHUB> --name ticketsAdmin-runner
```

3. Instalarlo como servicio para que sobreviva a reinicios del servidor:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

4. **Importante**: el runner corre como el usuario que lo instaló. Ese usuario necesita poder ejecutar `docker` (grupo `docker`) — si los otros runners ya corren ahí y ya construyen/levantan contenedores, seguramente ya está resuelto; si no, `sudo usermod -aG docker $USER` y reiniciar el servicio del runner.

5. Verificar en GitHub (**Settings → Actions → Runners**) que el nuevo runner aparece como **Idle** (verde), junto a los de los otros proyectos.

## 3. Configurar los secretos

El workflow recibe las credenciales desde GitHub Actions, **nunca** desde el repositorio:

1. Generar valores largos e independientes:
   ```bash
   openssl rand -hex 32  # WEBHOOK_API_KEY
   openssl rand -hex 32  # ADMIN_API_KEY
   openssl rand -hex 24  # BOOTSTRAP_SYSADMIN_PASSWORD
   ```
2. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Crear:
   - `WEBHOOK_API_KEY`: autentica la ingesta de n8n.
   - `ADMIN_API_KEY`: segunda verificación de operaciones SysAdmin.
   - `BOOTSTRAP_SYSADMIN_PASSWORD`: obligatoria si el volumen contiene una base sin hashes o la credencial pública del seed histórico.

El bootstrap crea o asegura `sysadmin`, persiste solamente el hash scrypt y luego se vuelve un no-op. La clave debe tener 16–128 caracteres, no contener controles C0/DEL, no comenzar ni terminar con espacios y no ser un placeholder público conocido ni un único carácter repetido; el comando aleatorio anterior cumple la política. La credencial queda marcada como temporal: el primer login solo permite reemplazarla o cerrar sesión. Si detecta el seed histórico también activa ese cambio obligatorio y revoca sus sesiones anteriores. Después de verificar el login y completar el cambio, retirar `BOOTSTRAP_SYSADMIN_PASSWORD` de GitHub Actions y ejecutar otro deploy para recrear el backend sin el secreto en su entorno. Dejarlo configurado no resetea una cuenta ya asegurada, pero retirarlo reduce exposición innecesaria.

Las dos API keys deben existir, ser diferentes y tener al menos 32 caracteres; se rechazan placeholders públicos, un único carácter repetido, controles y espacios exteriores. Esta validación ocurre antes del seed y antes de escuchar HTTP, sin imprimir los valores. Si alguna falta o no cumple la política, el contenedor reinicia y nunca llega a estado healthy. Los campos correspondientes de `.env.example` están vacíos deliberadamente para que copiar el archivo no produzca un despliegue con credenciales conocidas.

La migración `0010_require_password_change.sql` se aplica automáticamente antes de arrancar la API. Mantiene habilitados a los usuarios existentes (`debe_cambiar_password=false`), mientras que toda alta o rotación posterior queda en estado temporal hasta que la propia persona defina su nueva contraseña.

La migración `0011_invalidate_plaintext_sessions.sql` revoca una sola vez todas las sesiones anteriores: es intencional y cada usuario deberá volver a ingresar. Desde entonces SQLite persiste solo un hash versionado del bearer. El backend vuelve a sanear el formato al arrancar para cubrir rollback → roll-forward; nunca registra tokens ni hashes. No ejecutar simultáneamente réplicas con código anterior y posterior a `0011`. Un rollback conserva la estructura física de la tabla, pero invalida las sesiones de la otra versión. El mínimo seguro para rollback es `06db746` (`Sanea el ciclo de la cookie de sesion`), que ya exige cookies raw de 64 hex; versiones más antiguas no deben arrancarse sobre una base posterior a `0011`. Los backups creados antes de `0011` o mientras corre un binario anterior pueden contener bearer y deben conservar la misma protección y retención que un secreto; los generados bajo el binario nuevo contienen hashes.

`0012_add_ticket_version.sql` es aditiva: asigna versión 1 a históricos y el código anterior ignora la columna si se hace rollback. Sin embargo, el contrato HTTP nuevo exige `expected_version` en cada PATCH. Backend y frontend deben desplegarse como una misma versión, sin réplicas mixtas; las pestañas que conservaron JavaScript anterior recibirán 400 al intentar guardar y deberán recargar una vez. n8n no se ve afectado porque su integración crea tickets por POST y no usa PATCH.

El backend limita el login por identidad: diez credenciales rechazadas dentro de 15 minutos hacen que la siguiente solicitud active un bloqueo de 15 minutos (`429` más `Retry-After`). Un login válido o un alta, cambio de username o reset de contraseña desde SysAdmin libera esa identidad; errores internos y rechazos por capacidad no suman fallos. Los contadores no están en SQLite: viven hasheados y acotados en la memoria de la única instancia, por lo que un redeploy los reinicia. Esto es esperado en la topología actual; no levantar una segunda réplica sin migrar el rate limit a un store compartido. La protección de scrypt admite una ráfaga inicial de 30 trabajos públicos y repone 30 por minuto, con cuatro activos y ocho en espera, para conservar capacidad durante ráfagas y ataques sostenidos.

GitHub inyecta esos secretos solo en el step que recrea los servicios; checkout, quality y build no los reciben. Para ejecutar manualmente comandos que crean o recrean servicios (`up`, `create`, un `run` normal), guardar las variables en un archivo fuera del repo y con permisos restringidos, por ejemplo `/etc/ticketsadmin/compose.env`, y usar:

```bash
docker compose --env-file /etc/ticketsadmin/compose.env up -d --wait --wait-timeout 180
```

El archivo debe definir `WEBHOOK_API_KEY` y `ADMIN_API_KEY`; para una base sin hashes o con el seed histórico también debe definir `BOOTSTRAP_SYSADMIN_PASSWORD`. Puede definir `TZ` y no se commitea. Las dos API keys fallan cerradas si faltan o no cumplen la política. Para comandos que solo inspeccionan o actúan sobre contenedores existentes (`ps`, `logs`, `exec`, `cp`), Compose igualmente exige interpolar las API keys, pero se puede usar un placeholder porque no cambia el entorno del contenedor ya creado:

```bash
WEBHOOK_API_KEY=not-used-for-readonly-command ADMIN_API_KEY=not-used-for-readonly-command docker compose ps
```

No usar ese placeholder con `up`, `create` ni para iniciar la API.

## 4. Primer despliegue

Con el runner instalado y los secretos configurados, cualquier push a `main` dispara primero Quality y luego el deploy. Para forzar el primero sin esperar un push:

- En GitHub: **Actions → Deploy → Run workflow** (el trigger `workflow_dispatch` está habilitado para esto), o
- Hacer un push cualquiera a `main`.

Seguir el progreso en la pestaña **Actions** del repo. Al terminar:

```bash
# desde el servidor, para confirmar que quedó arriba
test "$(curl -fsS --max-time 5 http://127.0.0.1:5000/api/readyz)" = '{"status":"ready"}'
SPA="$(curl -fsS --max-time 5 http://127.0.0.1:3000/)"
grep -Fq '<div id="root"></div>' <<< "$SPA"
test "$(curl -fsS --max-time 5 http://127.0.0.1:3000/api/readyz)" = '{"status":"ready"}'
curl -I http://localhost:3000/
curl -I http://localhost:3000/api/readyz
WEBHOOK_API_KEY=not-used-for-readonly-command ADMIN_API_KEY=not-used-for-readonly-command docker compose ps
```

Los tres primeros comandos deben terminar sin salida de error. Los dos `curl -I` deben mostrar las cuatro cabeceras de seguridad configuradas por Nginx y no deben revelar una versión en `Server`. La API directa en `:5000` no pasa por Nginx; su exposición de red sigue siendo un frente operativo separado. `healthz` continúa disponible como liveness, pero no demuestra que SQLite ni el schema requerido estén listos.

## 5. Actualizar la configuración de n8n

Una vez que el servidor tiene su IP fija definitiva, actualizar en n8n el nodo HTTP Request (ver `docs/FLUJO.md`, sección "Configuración del nodo HTTP Request en n8n") para que apunte a:

```
http://<IP-FIJA-DEL-SERVIDOR-DE-TESTING>:5000/api/webhooks/ticket
```

con el mismo header `x-api-key` (el valor cargado como secreto `WEBHOOK_API_KEY`).

## Operación del día a día

- **Cada push a `main` redeploya solo si pasa `pnpm run quality`, Compose llega a healthy y los tres smoke tests publicados responden el contenido esperado.** Los pull requests ejecutan el mismo gate pero nunca modifican el servidor.
- **Cada comando Compose** se ejecuta desde un checkout actual del repo (el workspace del runner o `/opt/ticketsAdmin` actualizado). El proyecto se llama siempre `ticketsadmin`.
- **Ver logs**: `WEBHOOK_API_KEY=not-used-for-readonly-command ADMIN_API_KEY=not-used-for-readonly-command docker compose logs -f backend` (o `frontend`).
- **Ver estado**: `WEBHOOK_API_KEY=not-used-for-readonly-command ADMIN_API_KEY=not-used-for-readonly-command docker compose ps`
- **Backup de la base**: no usar `cat`, `cp` ni copiar solamente `/data/tickets.db`; SQLite está en WAL y eso puede omitir transacciones confirmadas. La imagen del backend incluye un CLI que usa la API online de SQLite y publica la copia solo después de verificar integridad, claves foráneas y el esquema histórico mínimo de la aplicación. Para guardar el backup fuera del volumen Docker:
  ```bash
  TICKETSADMIN_BACKUP_DIR="/var/lib/ticketsadmin/backups"
  sudo install -d -m 0700 -o "$USER" -g "$(id -gn)" "$TICKETSADMIN_BACKUP_DIR"
  BACKUP_NAME="tickets-$(date -u +%Y%m%dT%H%M%SZ).db"
  WEBHOOK_API_KEY=not-used-by-backup ADMIN_API_KEY=not-used-by-backup docker compose exec -T backend \
    node dist/backup-db.mjs --output "/tmp/$BACKUP_NAME"
  WEBHOOK_API_KEY=not-used-by-backup ADMIN_API_KEY=not-used-by-backup docker compose cp \
    "backend:/tmp/$BACKUP_NAME" "$TICKETSADMIN_BACKUP_DIR/$BACKUP_NAME"
  WEBHOOK_API_KEY=not-used-by-backup ADMIN_API_KEY=not-used-by-backup docker compose exec -T backend \
    rm -f "/tmp/$BACKUP_NAME"
  ```
  Los placeholders solo satisfacen la interpolación de Compose: `exec` usa el entorno real del backend que ya está corriendo y no lo modifica. El destino es obligatorio y nunca se sobrescribe; una ejecución exitosa informa `Integridad: ok`. El archivo se crea `0600` en Linux porque contiene PII, hashes de contraseña y hashes de sesión. El `cp` extrae la copia ya verificada y el último comando elimina el temporal del contenedor. El directorio externo debe ser privado (`0700`, o ACL equivalente) y tener una política explícita de retención.
- **Cambios de schema**: si se modifica `lib/db/src/schema/tickets.ts`, hay que generar la migración ANTES de mergear a main:
  ```bash
  pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts
  ```
  Esto crea un nuevo archivo en `lib/db/drizzle/`. Commitear ese archivo junto con el cambio de schema — el próximo deploy lo aplica solo.
- **Rollback rápido**: `git revert` el commit problemático y pushear — el pipeline redeploya la versión anterior. Si el commit incluía un cambio estructural ya aplicado, diseñar una migración *forward* compatible y específica; no asumir que revertir código revierte la base ni improvisar una inversa destructiva. `0011` es una excepción de datos deliberada: no cambia columnas, su `DELETE` no es reversible y **no** se debe restaurar un backup ni crear una migración inversa para recuperar sesiones. El rollback funciona sobre la columna existente y exige re-login, pero solo está soportado hasta `06db746`; restaurar una base anterior o arrancar código más viejo reintroduciría el riesgo de bearer reutilizables y además podría perder datos funcionales posteriores.

### Restauración manual de SQLite

Restaurar datos y volver atrás código son decisiones distintas. **Nunca se restaura automáticamente un backup por un deploy fallido**, porque podría borrar tickets o gestiones recibidas después de crear ese backup. Este procedimiento se usa solo cuando se decidió recuperar un punto de datos concreto.

Precondiciones:

1. Identificar el backup, la release que lo generó y el alcance de datos que se perdería. Verificar explícitamente que la release actualmente desplegada sea compatible con ese esquema; si no lo es, preparar por separado el rollback de aplicación antes de iniciar esta intervención. La verificación física no garantiza por sí sola compatibilidad semántica.
2. Pausar el workflow de n8n o su reintento de ingesta y avisar la ventana de mantenimiento.
3. Deshabilitar primero el workflow **Deploy** en GitHub Actions para impedir nuevas asignaciones. No alcanza con mirar que la cola esté vacía mientras el runner todavía puede recibir trabajo.
4. Detener el runner dedicado de `ticketsAdmin`. Con el servicio ya inactivo, cancelar ejecuciones `queued`/`in_progress` y esperar a que todas queden en estado terminal; si alguna había comenzado, comprobar también que no dejó un build o proceso hijo activo. **No avanzar** mientras falte cualquiera de estas comprobaciones.
5. Ejecutar desde el mismo checkout/configuración que administra los contenedores actualmente desplegados. Este procedimiento reinicia exactamente esos contenedores detenidos; no construye ni selecciona implícitamente otra release.
6. Mantener backup y recovery fuera del checkout, en un directorio privado. No borrar ninguna copia hasta validar funcionalmente el sistema.

```bash
set -euo pipefail

TICKETSADMIN_RUNNER_DIR="$HOME/actions-runner-ticketsAdmin"
RUNNER_SERVICE="$(sudo cat "$TICKETSADMIN_RUNNER_DIR/.service")"
sudo "$TICKETSADMIN_RUNNER_DIR/svc.sh" stop
if sudo systemctl is-active --quiet "$RUNNER_SERVICE"; then
  echo "El runner dedicado sigue activo; restauración abortada" >&2
  exit 1
fi
```

Con el runner offline, volver a GitHub Actions: cancelar cualquier run de **Deploy** pendiente o activo y esperar a que no quede ninguno fuera de estado terminal. Este es un control humano obligatorio porque el host no conserva una credencial de GitHub con la cual probarlo automáticamente. Recién después ejecutar el bloque siguiente:

```bash
set -euo pipefail

TICKETSADMIN_RECOVERY_DIR="/var/lib/ticketsadmin/recovery"
RESTORE_SOURCE="/var/lib/ticketsadmin/backups/tickets-AAAA-MM-DD.db"
RESTORE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 0700 -o "$USER" -g "$(id -gn)" "$TICKETSADMIN_RECOVERY_DIR"
test -f "$RESTORE_SOURCE"
chmod 0600 "$RESTORE_SOURCE"

BACKEND_CONTAINER_ID="$(WEBHOOK_API_KEY=not-used-during-restore ADMIN_API_KEY=not-used-during-restore \
  docker compose ps -a -q backend)"
test -n "$BACKEND_CONTAINER_ID"
if [[ "$BACKEND_CONTAINER_ID" == *$'\n'* ]]; then
  echo "Se encontró más de un contenedor backend; restauración abortada" >&2
  exit 1
fi
BACKEND_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$BACKEND_CONTAINER_ID")"
TICKETS_VOLUME_NAME="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$BACKEND_CONTAINER_ID")"
test -n "$BACKEND_IMAGE_ID"
test -n "$TICKETS_VOLUME_NAME"
printf 'Restore con backend=%s image=%s volume=%s\n' \
  "$BACKEND_CONTAINER_ID" "$BACKEND_IMAGE_ID" "$TICKETS_VOLUME_NAME"

WEBHOOK_API_KEY=not-used-during-restore ADMIN_API_KEY=not-used-during-restore \
  docker compose stop frontend backend

RUNNING_SERVICES="$(WEBHOOK_API_KEY=not-used-during-restore ADMIN_API_KEY=not-used-during-restore \
  docker compose ps --status running --services)"
if [[ -n "$RUNNING_SERVICES" ]]; then
  printf 'Compose conserva servicios activos: %s\n' "$RUNNING_SERVICES" >&2
  exit 1
fi

VOLUME_HOLDERS="$(docker ps -q --filter "volume=$TICKETS_VOLUME_NAME")"
if [[ -n "$VOLUME_HOLDERS" ]]; then
  printf 'Hay contenedores ajenos usando el volumen SQLite: %s\n' "$VOLUME_HOLDERS" >&2
  exit 1
fi

docker run --rm --network none \
  --volume "$TICKETS_VOLUME_NAME:/data" \
  --volume "$RESTORE_SOURCE:/restore/source.db:ro" \
  --volume "$TICKETSADMIN_RECOVERY_DIR:/recovery" \
  "$BACKEND_IMAGE_ID" node dist/restore-db.mjs \
  --source /restore/source.db \
  --target /data/tickets.db \
  --recovery-output "/recovery/pre-restore-$RESTORE_STAMP.db" \
  --confirm-stopped

sudo chown "$(id -u):$(id -g)" \
  "$TICKETSADMIN_RECOVERY_DIR/pre-restore-$RESTORE_STAMP.db"
chmod 0600 "$TICKETSADMIN_RECOVERY_DIR/pre-restore-$RESTORE_STAMP.db"
```

El comando one-shot usa por ID exacto la imagen del contenedor backend detenido y descubre desde ese contenedor el volumen montado en `/data`; no depende de una tag que otro build haya podido mover, no ejecuta migraciones y no levanta la API. Los placeholders anteriores solo permiten interpolar Compose y no se usan para autenticar nada. Si el destino existe, la operación se niega a avanzar sin publicar antes `pre-restore-*.db`; tampoco sobrescribe una recovery anterior. `--allow-missing-target` solo corresponde a un volumen realmente vacío y requiere revisar dos veces la ruta.

Si informa `ROLLBACK_FAILED`, **no borrar** `.ticketmanager-restore-*`, `tickets.db.restore.lock` ni la recovery: el lock queda a propósito para impedir nuevos intentos hasta inspeccionar cuál snapshot está instalado. Un lock huérfano después de una caída también se investiga antes de retirarlo; no existe un `--force` que lo saltee.

Tras una restauración exitosa, reiniciar exactamente los contenedores que se detuvieron con `docker compose start`. A diferencia de `up`, `start` no crea ni reemplaza servicios ausentes; si alguno ya no existe, falla y obliga a preparar de forma separada una release explícitamente compatible. El arranque vuelve a ejecutar sus migraciones y debe alcanzar estado healthy antes de los tres smoke tests:

```bash
set -euo pipefail

docker compose --env-file /etc/ticketsadmin/compose.env start backend frontend
BACKEND_CONTAINER_ID="$(docker compose --env-file /etc/ticketsadmin/compose.env ps -a -q backend)"
FRONTEND_CONTAINER_ID="$(docker compose --env-file /etc/ticketsadmin/compose.env ps -a -q frontend)"
test -n "$BACKEND_CONTAINER_ID"
test -n "$FRONTEND_CONTAINER_ID"

for ATTEMPT in $(seq 1 90); do
  BACKEND_HEALTH="$(docker inspect --format '{{.State.Health.Status}}' "$BACKEND_CONTAINER_ID")"
  FRONTEND_HEALTH="$(docker inspect --format '{{.State.Health.Status}}' "$FRONTEND_CONTAINER_ID")"
  if [[ "$BACKEND_HEALTH" == "healthy" && "$FRONTEND_HEALTH" == "healthy" ]]; then
    break
  fi
  if [[ "$ATTEMPT" == "90" ]]; then
    echo "Los contenedores no alcanzaron estado healthy en 180 segundos" >&2
    exit 1
  fi
  sleep 2
done

test "$(curl -fsS --max-time 5 http://127.0.0.1:5000/api/readyz)" = '{"status":"ready"}'
SPA="$(curl -fsS --max-time 5 http://127.0.0.1:3000/)"
grep -Fq '<div id="root"></div>' <<< "$SPA"
test "$(curl -fsS --max-time 5 http://127.0.0.1:3000/api/readyz)" = '{"status":"ready"}'
```

Revisar tickets recientes, usuarios/roles, autenticación y una gestión completa antes de reactivar n8n. La recovery previa permanece retenida hasta cerrar formalmente la intervención.

Por último, comprobar otra vez en GitHub que no haya un deploy obsoleto en cola, reactivar el runner dedicado y verificar su servicio. Reactivar el workflow **Deploy** en GitHub recién después de este bloque; n8n se reanuda al final de la ventana de mantenimiento:

```bash
set -euo pipefail

TICKETSADMIN_RUNNER_DIR="$HOME/actions-runner-ticketsAdmin"
RUNNER_SERVICE="$(sudo cat "$TICKETSADMIN_RUNNER_DIR/.service")"
sudo "$TICKETSADMIN_RUNNER_DIR/svc.sh" start
sudo systemctl is-active --quiet "$RUNNER_SERVICE"
```
