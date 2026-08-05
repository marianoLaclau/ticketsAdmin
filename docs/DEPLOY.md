# Despliegue en el servidor de testing (Docker + CI/CD)

> Server de testing: Linux con acceso SSH. CI/CD vía GitHub Actions con un
> **self-hosted runner** instalado en el propio servidor — cada push a `main`
> reconstruye las imágenes y reinicia los contenedores ahí mismo, sin
> necesidad de exponer SSH a GitHub ni usar un registro de imágenes externo.

## Arquitectura del despliegue

```
GitHub (push a main)
        │
        ▼
Self-hosted runner (corriendo EN el servidor de testing)
        │  docker compose build && docker compose up -d
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
- `docker-compose.yml` fija el nombre de proyecto `ticketsadmin`, de modo que contenedores, red y volumen conservan el mismo namespace aunque el workflow y un operador ejecuten Compose desde checkouts distintos.
- El backend corre con `TZ=America/Argentina/Buenos_Aires` por defecto (configurable con `TZ`). Los filtros por día calendario usan el timezone local del proceso, igual que en desarrollo.
- Nginx aplica a SPA, API, SSE y errores `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` y una `Permissions-Policy` mínima; además no publica su versión. Esto no reemplaza TLS. CSP se evaluará por separado después de inventariar fuentes, estilos dinámicos, audio y descargas `blob:`; HSTS y la cookie `Secure` sí se habilitarán cuando exista un borde HTTPS real.

## 1. Preparar el servidor

Docker y otros runners de self-hosted ya están instalados en el servidor (se usan para otros proyectos) — no hace falta tocar eso. Lo que sigue es específico de **este** repo.

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

El backend limita el login por identidad: diez credenciales rechazadas dentro de 15 minutos hacen que la siguiente solicitud active un bloqueo de 15 minutos (`429` más `Retry-After`). Un login válido o un alta, cambio de username o reset de contraseña desde SysAdmin libera esa identidad; errores internos y rechazos por capacidad no suman fallos. Los contadores no están en SQLite: viven hasheados y acotados en la memoria de la única instancia, por lo que un redeploy los reinicia. Esto es esperado en la topología actual; no levantar una segunda réplica sin migrar el rate limit a un store compartido. La protección de scrypt admite una ráfaga inicial de 30 trabajos públicos y repone 30 por minuto, con cuatro activos y ocho en espera, para conservar capacidad durante ráfagas y ataques sostenidos.

GitHub inyecta esos secretos solo durante el job. Para ejecutar manualmente comandos que crean o recrean servicios (`up`, `create`, un `run` normal), guardar las variables en un archivo fuera del repo y con permisos restringidos, por ejemplo `/etc/ticketsadmin/compose.env`, y usar:

```bash
docker compose --env-file /etc/ticketsadmin/compose.env up -d
```

El archivo debe definir `WEBHOOK_API_KEY` y `ADMIN_API_KEY`; para una base sin hashes o con el seed histórico también debe definir `BOOTSTRAP_SYSADMIN_PASSWORD`. Puede definir `TZ` y no se commitea. Las dos API keys fallan cerradas si faltan o no cumplen la política. Para comandos que solo inspeccionan o actúan sobre contenedores existentes (`ps`, `logs`, `exec`, `cp`), Compose igualmente exige interpolar las API keys, pero se puede usar un placeholder porque no cambia el entorno del contenedor ya creado:

```bash
WEBHOOK_API_KEY=not-used-for-readonly-command ADMIN_API_KEY=not-used-for-readonly-command docker compose ps
```

No usar ese placeholder con `up`, `create` ni para iniciar la API.

## 4. Primer despliegue

Con el runner instalado y los secretos configurados, cualquier push a `main` dispara el deploy. Para forzar el primero sin esperar un push:

- En GitHub: **Actions → Deploy → Run workflow** (el trigger `workflow_dispatch` está habilitado para esto), o
- Hacer un push cualquiera a `main`.

Seguir el progreso en la pestaña **Actions** del repo. Al terminar:

```bash
# desde el servidor, para confirmar que quedó arriba
curl http://localhost:5000/api/healthz
curl http://localhost:3000/
curl -I http://localhost:3000/
curl -I http://localhost:3000/api/healthz
WEBHOOK_API_KEY=not-used-for-readonly-command ADMIN_API_KEY=not-used-for-readonly-command docker compose ps
```

Los dos `curl -I` deben mostrar las cuatro cabeceras de seguridad configuradas por Nginx y no deben revelar una versión en `Server`. La API directa en `:5000` no pasa por Nginx; su exposición de red sigue siendo un frente operativo separado.

## 5. Actualizar la configuración de n8n

Una vez que el servidor tiene su IP fija definitiva, actualizar en n8n el nodo HTTP Request (ver `docs/FLUJO.md`, sección "Configuración del nodo HTTP Request en n8n") para que apunte a:

```
http://<IP-FIJA-DEL-SERVIDOR-DE-TESTING>:5000/api/webhooks/ticket
```

con el mismo header `x-api-key` (el valor cargado como secreto `WEBHOOK_API_KEY`).

## Operación del día a día

- **Cada push a `main` redeploya solo.** No hace falta tocar el servidor a mano.
- **Cada comando Compose** se ejecuta desde un checkout actual del repo (el workspace del runner o `/opt/ticketsAdmin` actualizado). El proyecto se llama siempre `ticketsadmin`.
- **Ver logs**: `WEBHOOK_API_KEY=not-used-for-readonly-command docker compose logs -f backend` (o `frontend`).
- **Ver estado**: `WEBHOOK_API_KEY=not-used-for-readonly-command docker compose ps`
- **Backup de la base**: no usar `cat`, `cp` ni copiar solamente `/data/tickets.db`; SQLite está en WAL y eso puede omitir transacciones confirmadas. La imagen del backend incluye un CLI que usa la API online de SQLite y publica la copia solo después de `PRAGMA integrity_check`. Para guardar el backup fuera del volumen Docker:
  ```bash
  mkdir -p "$HOME/backups/ticketsadmin"
  BACKUP_NAME="tickets-$(date -u +%Y%m%dT%H%M%SZ).db"
  WEBHOOK_API_KEY=not-used-by-backup docker compose exec -T backend \
    node dist/backup-db.mjs --output "/tmp/$BACKUP_NAME"
  WEBHOOK_API_KEY=not-used-by-backup docker compose cp \
    "backend:/tmp/$BACKUP_NAME" "$HOME/backups/ticketsadmin/$BACKUP_NAME"
  WEBHOOK_API_KEY=not-used-by-backup docker compose exec -T backend \
    rm -f "/tmp/$BACKUP_NAME"
  ```
  El placeholder solo satisface la interpolación de Compose: `exec` usa el entorno real del backend que ya está corriendo y no lo modifica. El destino es obligatorio y nunca se sobrescribe; una ejecución exitosa informa `Integridad: ok`. El `cp` extrae la copia ya verificada y el último comando elimina el temporal del contenedor. Copiar luego el archivo a almacenamiento externo según la política de retención.
- **Cambios de schema**: si se modifica `lib/db/src/schema/tickets.ts`, hay que generar la migración ANTES de mergear a main:
  ```bash
  pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts
  ```
  Esto crea un nuevo archivo en `lib/db/drizzle/`. Commitear ese archivo junto con el cambio de schema — el próximo deploy lo aplica solo.
- **Rollback rápido**: `git revert` el commit problemático y pushear — el pipeline redeploya la versión anterior. Si el commit incluía un cambio estructural ya aplicado, diseñar una migración *forward* compatible y específica; no asumir que revertir código revierte la base ni improvisar una inversa destructiva. `0011` es una excepción de datos deliberada: no cambia columnas, su `DELETE` no es reversible y **no** se debe restaurar un backup ni crear una migración inversa para recuperar sesiones. El rollback funciona sobre la columna existente y exige re-login, pero solo está soportado hasta `06db746`; restaurar una base anterior o arrancar código más viejo reintroduciría el riesgo de bearer reutilizables y además podría perder datos funcionales posteriores.
