# NOVA Onboarding — Ventas COD

App de onboarding y runbook operativo para el equipo de ventas COD.
Node 24 sin dependencias npm + SQLite embebido (`node:sqlite`). Imagen Docker ~80 MB.

## Qué hace

- **Onboarding** — 6 videos de lanzamiento con su guion. Pegas el link de YouTube y queda guardado.
- **Runbook diario** — tareas por hora con pasos y tips. El "completado" se resetea solo cada día (zona horaria `TZ_APP`).
- **Procesos** — paso a paso de cada proceso, cada uno con su video de YouTube incrustado.
- **Fichas de producto** — packs, beneficios, specs, objeciones + imágenes y videos de YouTube por link.
- **Ejemplos reales** — chats y llamadas modelo.

Todos los videos son **links de YouTube incrustados** (iframe `youtube-nocookie`). No se suben archivos: no hace falta almacenamiento de media.

## Deploy en Coolify

1. **New Resource → Application → Public/Private Repository**, apuntando a este repo.
2. Build Pack: **Dockerfile**.
3. **Port**: `3000`.
4. **Persistent Storage** (importante, si no se pierden los links y el progreso):
   `Volume Mount` → Destination Path `/data`.
5. Health check ya viene en el Dockerfile (`/health`).

Variables opcionales:

| Variable | Default | Para qué |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `DATA_DIR` | `/data` | Dónde vive `nova.db` |
| `TZ_APP` | `America/Lima` | Zona horaria del corte diario del runbook |

## Local

```bash
node server.js          # http://localhost:3000
docker compose up --build
```

## Estructura

```
server.js    API + estáticos + esquema SQLite
seed.js      Contenido inicial (sólo se inserta si la base está vacía)
public/      La app (una sola página)
Dockerfile   Imagen para Coolify
```

## API

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/state` | Todo el contenido y el progreso |
| PUT | `/api/tasks/:id` | `{done}` — marca tarea del runbook (por día) |
| PUT | `/api/checklist/:id` | `{done}` — marca ítem del checklist |
| PUT | `/api/videos/:id` | `{url}` — link de YouTube del video de onboarding |
| PUT | `/api/procesos/:id` | `{url}` — link de YouTube del proceso |
| POST | `/api/products/:id/media` | `{kind,title,url}` — agrega imagen o video |
| DELETE | `/api/media/:id` | Quita imagen o video |

> La app no tiene login: pensada para uso interno detrás de la URL privada de Coolify.
> Si la vas a exponer públicamente, ponle Basic Auth desde el proxy de Coolify.

`nova-ventas.html` es el prototipo original estático que dio origen a esta app; se conserva sólo como referencia.
