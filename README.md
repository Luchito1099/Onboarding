# NOVA Onboarding — Ventas COD

App de onboarding y runbook operativo para el equipo de ventas COD.
Node 24 sin dependencias npm + SQLite embebido (`node:sqlite`). Imagen Docker ~80 MB.

## Qué hace

- **Onboarding** — videos de lanzamiento con su guion. Pegas el link de YouTube y queda guardado.
- **Runbook diario** — tareas por hora con pasos y tips. El "completado" se resetea solo cada día (zona horaria `TZ_APP`).
- **Procesos** — paso a paso de cada proceso, cada uno con su video de YouTube incrustado.
- **Fichas de producto** — packs, beneficios, specs, objeciones + imágenes y videos de YouTube por link.
- **Ejemplos reales** — chats y llamadas modelo.

Todos los videos son **links de YouTube incrustados** (iframe `youtube-nocookie`). No se suben archivos: no hace falta almacenamiento de media.

## Modo edición

El botón **Editar** de la barra superior activa el modo edición en toda la app. Con él puedes **crear, editar, reordenar y eliminar** cualquier contenido —tareas del runbook, videos, ítems del checklist, procesos, fichas de producto y ejemplos— desde un formulario, sin tocar código ni volver a desplegar. Cada guardado va directo a SQLite.

Detalles de comportamiento:

- El **runbook se ordena solo por hora**: al crear o editar una tarea se recoloca en la línea de tiempo, por eso no tiene flechas de subir/bajar.
- En el **checklist**, escribir un día que no existe crea ese grupo; el ítem nuevo entra al final de su día.
- Al **eliminar un producto** se borran también sus imágenes y videos.
- Los campos de tips y "qué aprender" aceptan formato mínimo (`<b>`, `<i>`, `<br>`); el resto del HTML se escapa.
- Las marcas de progreso (tarea completada, ítem del checklist) no dependen del modo edición: están siempre disponibles.

## Responsive

Una sola interfaz para escritorio, tablet y móvil:

- **≥1181 px** — barra lateral de áreas + columna de contenido + rail de "turno activo".
- **≤1180 px** — el rail desaparece y la tarjeta de turno activo se mueve al cuerpo del runbook.
- **≤900 px** — la barra lateral pasa a ser un menú deslizable (botón ☰ + fondo oscurecido).
- **≤640 px** — los modales se abren como hoja inferior, los formularios pasan a una columna y los inputs suben a 16 px para que iOS no haga zoom.

Las grillas de productos, ejemplos y media son fluidas (`auto-fill`), y el layout respeta el área segura de los móviles con notch.

## Deploy en Coolify

1. **New Resource → Application → Public/Private Repository**, apuntando a este repo.
2. Build Pack: **Dockerfile**.
3. **Port**: `3000`.
4. **Persistent Storage** (importante, si no se pierden los links y el progreso):
   `Volume Mount` → Destination Path `/data`.
5. Health check ya viene en el Dockerfile (`/health`).

`GET /health` responde `{"ok":true,"version":"…"}`; esa versión sirve para comprobar de un vistazo si el deploy tomó el último commit.

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

Todo el contenido es editable por API. `:id` es numérico salvo en productos, donde es el slug del nombre.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/state` | Todo el contenido y el progreso |
| POST | `/api/tasks` | Crea tarea del runbook |
| PUT | `/api/tasks/:id` | Edita la tarea (se reordena por hora) |
| PUT | `/api/tasks/:id/done` | `{done}` — marca la tarea del día |
| DELETE | `/api/tasks/:id` | Elimina la tarea |
| POST | `/api/videos` | Crea video de onboarding |
| PUT | `/api/videos/:id` | Edita título, tipo, duración, guion y link |
| PUT | `/api/videos/:id/url` | `{url}` — sólo el link de YouTube |
| PUT | `/api/videos/:id/move` | `{dir:'up'\|'down'}` — reordena |
| DELETE | `/api/videos/:id` | Elimina el video |
| POST | `/api/checklist` | `{day,item}` — crea ítem (crea el día si no existe) |
| PUT | `/api/checklist/:id` | Edita día e ítem |
| PUT | `/api/checklist/:id/done` | `{done}` — marca el ítem |
| PUT | `/api/checklist/:id/move` | Reordena dentro de su día |
| DELETE | `/api/checklist/:id` | Elimina el ítem |
| POST · PUT · DELETE | `/api/procesos[/:id]` | Alta, edición y borrado de procesos |
| PUT | `/api/procesos/:id/url` | `{url}` — sólo el video del proceso |
| PUT | `/api/procesos/:id/move` | Reordena |
| POST · PUT · DELETE | `/api/products[/:id]` | Alta, edición y borrado de fichas |
| PUT | `/api/products/:id/move` | Reordena |
| POST | `/api/products/:id/media` | `{kind,title,url}` — agrega imagen o video |
| DELETE | `/api/media/:id` | Quita imagen o video |
| POST · PUT · DELETE | `/api/ejemplos[/:id]` | Alta, edición y borrado de ejemplos |
| PUT | `/api/ejemplos/:id/move` | Reordena |

Los textos se validan y recortan en el servidor: los campos obligatorios que llegan vacíos devuelven `400`, los links no `http(s)` se rechazan, y las filas vacías de listas (pasos, tips, packs, specs) se descartan.

> La app no tiene login: pensada para uso interno detrás de la URL privada de Coolify.
> Si la vas a exponer públicamente, ponle Basic Auth desde el proxy de Coolify — sin eso, cualquiera con el link puede usar el modo edición.

`nova-ventas.html` es el prototipo original estático que dio origen a esta app; se conserva sólo como referencia.
