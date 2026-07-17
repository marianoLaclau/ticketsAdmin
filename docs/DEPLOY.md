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
- `docker-compose.yml` no fija un nombre de proyecto explícito, así que Compose usa el nombre del directorio (`ticketsAdmin`) para namespacear contenedores/red/volumen — no debería chocar con los otros proyectos del servidor mientras cada uno viva en su propio directorio.

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

### 1.2. Clonar el repo

Usar un directorio propio, separado de los otros proyectos:

```bash
sudo mkdir -p /opt/ticketsAdmin
sudo chown $USER:$USER /opt/ticketsAdmin
git clone https://github.com/marianoLaclau/ticketsAdmin.git /opt/ticketsAdmin
cd /opt/ticketsAdmin
```

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

## 3. Configurar el secreto de la API key

El workflow necesita `WEBHOOK_API_KEY` para levantar el backend. Se guarda como secreto de GitHub, **nunca** en el repo:

1. Generar una clave (podés reusar la misma del `.env` local o generar una nueva):
   ```bash
   openssl rand -hex 32
   ```
2. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `WEBHOOK_API_KEY`
   - Value: la clave generada

## 4. Primer despliegue

Con el runner instalado y el secreto configurado, cualquier push a `main` dispara el deploy. Para forzar el primero sin esperar un push:

- En GitHub: **Actions → Deploy → Run workflow** (el trigger `workflow_dispatch` está habilitado para esto), o
- Hacer un push cualquiera a `main`.

Seguir el progreso en la pestaña **Actions** del repo. Al terminar:

```bash
# desde el servidor, para confirmar que quedó arriba
curl http://localhost:5000/api/healthz
curl http://localhost:3000/
docker compose ps
```

## 5. Actualizar la configuración de n8n

Una vez que el servidor tiene su IP fija definitiva, actualizar en n8n el nodo HTTP Request (ver `docs/FLUJO.md`, sección "Configuración del nodo HTTP Request en n8n") para que apunte a:

```
http://<IP-FIJA-DEL-SERVIDOR-DE-TESTING>:5000/api/webhooks/ticket
```

con el mismo header `x-api-key` (el valor cargado como secreto `WEBHOOK_API_KEY`).

## Operación del día a día

- **Cada push a `main` redeploya solo.** No hace falta tocar el servidor a mano.
- **Ver logs**: `docker compose logs -f backend` (o `frontend`) desde `/opt/ticketsAdmin`.
- **Ver estado**: `docker compose ps`
- **Backup de la base**: el archivo vive dentro del volumen `tickets_data`. Para copiarlo afuera:
  ```bash
  docker compose exec backend sh -c "cat /data/tickets.db" > backup-$(date +%F).db
  ```
- **Cambios de schema**: si se modifica `lib/db/src/schema/tickets.ts`, hay que generar la migración ANTES de mergear a main:
  ```bash
  pnpm --filter @workspace/db exec drizzle-kit generate --config ./drizzle.config.ts
  ```
  Esto crea un nuevo archivo en `lib/db/drizzle/`. Commitear ese archivo junto con el cambio de schema — el próximo deploy lo aplica solo.
- **Rollback rápido**: `git revert` el commit problemático y pushear — el pipeline redeploya la versión anterior. (Ojo: si el commit revertido incluía una migración que ya se aplicó, revertir el código no revierte la base — para eso hace falta una migración inversa manual.)
