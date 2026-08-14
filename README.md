# NOVA Onboarding — Ventas COD

App de onboarding y runbook operativo para el equipo de ventas COD.
Node 24 sin dependencias npm + SQLite embebido (`node:sqlite`). Imagen Docker ~80 MB.

## Qué hace

- **Onboarding** — videos de lanzamiento con su guion y checklist de primeros días. **Llega vacío**: cada equipo carga los suyos. La pestaña siempre está; mientras no haya contenido se ve en blanco, con una nota que explica cómo añadirlo.
- **Runbook diario** — tareas por hora. Cada una lleva descripción, pasos, **qué hacer según el resultado**, tips, un botón al **proceso detallado**, su **video** y el **resultado esperado**. El "completado" se resetea solo cada día (zona horaria `TZ_APP`).
- **Procesos** — paso a paso de cada proceso, con **hasta 2 videos, cada uno con su comentario**.
- **Guiones por caso** — qué decir en cada situación: apertura, preguntas del cliente con su respuesta literal y cierre. Con buscador y botón de copiar.
- **Fichas de producto** — packs, beneficios, specs, objeciones, **qué lo hace diferente** (con comparativa y video), **mensaje listo para WhatsApp** y una galería de fotos y videos con descripción de uso, copiar, descargar y ZIP.
- **Ejemplos reales** — chats y llamadas modelo, con **capturas pegables**, **audio de la llamada** y un **guion en pop-up**.
- **Información del negocio** — el contexto que hay que saber antes de operar.
- **Soporte** — la vendedora escribe sus dudas (con captura) y se responden desde la misma pantalla.

## Modo edición

El botón **Editar** de la barra superior activa el modo edición en toda la app. Con él puedes **crear, editar, reordenar y eliminar** cualquier contenido desde un formulario, sin tocar código ni volver a desplegar. Cada guardado va directo a SQLite.

Detalles de comportamiento:

- **Reordenar es arrastrar.** Cada elemento muestra un asa (⠿); se arrastra con el ratón o con el dedo y el orden se guarda al soltar. Funciona en videos, procesos, productos, ejemplos, bloques de información e ítems del checklist (dentro de su día).
- El **runbook se ordena solo por hora**: al crear o editar una tarea se recoloca en la línea de tiempo, por eso no se arrastra.
- En el **checklist**, escribir un día que no existe crea ese grupo; el ítem nuevo entra al final de su día.
- Al **eliminar un producto o un ejemplo** se borran también sus archivos adjuntos.
- Las marcas de progreso (tarea completada, ítem del checklist) y el formulario de dudas **no dependen del modo edición**: están siempre disponibles.

### Negrita y cursiva

Los campos de contenido llevan botones **B** / *i* junto a su etiqueta. Selecciona el texto y pulsa el botón, o usa **Ctrl+B** / **Ctrl+I**. Pulsar de nuevo sobre el texto ya formateado quita el formato.

Por debajo se guarda como texto plano con marcadores, `**negrita**` y `_cursiva_`, así que también puedes escribirlos a mano. Al pintar, sólo se convierten esos marcadores y las etiquetas `<b>`, `<i>`, `<u>` y `<br>` que ya traía el contenido original: cualquier otro HTML se escapa y se muestra como texto, de modo que pegar algo en un campo no puede inyectar código en la página.

## Guiones por caso

Cada guion cubre una situación ("Llamada — Confirmación pedidos Lima COD") y contiene:

- **Cómo abrir** — lo que se dice primero. Opcional: si cada caso ya trae su saludo, se deja vacío.
- **Casos** — una entrada por situación ("Ubicación no encontrada en el mapa", "Pedido del mismo día antes de las 10:30"), cada una con su texto completo.
- **Qué puede preguntar y qué responder** — una entrada por pregunta u objeción, con la respuesta literal y una nota interna (*Para ti*).
- **Cómo cerrar** y **recordatorios**.

Los casos y las preguntas son **desplegables**: se abre sólo el que hace falta, uno a uno, sin perder de vista el resto. Pensado para usarlo en mitad de una llamada.

Los guiones se escriben **sólo en esta pestaña**. Desde una tarea del runbook o desde un proceso se elige cuál aplica (campo *Guion de ventas*), y aparece un botón que lleva al guion ya abierto — así vive en un único sitio y se referencia desde donde haga falta.

El buscador de arriba filtra por título, caso, pregunta o cualquier palabra del texto, y abre directamente lo que encuentra.

## Estructura de una tarea del runbook

Además de descripción, pasos y tips, cada tarea puede llevar:

- **¿Qué hacer según el resultado?** — escenarios marcados como salió bien / a medias / no salió, cada uno con qué hacer entonces.
- **Proceso detallado** — botón que abre el proceso completo en su pestaña, ya desplegado.
- **Video** de cómo ejecutarla, con comentario.
- **Resultado esperado** — qué debe quedar terminado para poder marcarla como completada.

Todo es opcional: una tarea sin esos campos se ve igual que antes.

## Ficha de producto

**Galería.** Cada foto o video se ve en formato **1:1** con su título y, debajo, **para qué se usa** ("úsala como primera imagen: beneficios + prueba social"). La primera imagen lleva la marca *Principal* y es la portada del producto; el orden se cambia arrastrando.

Cada archivo trae dos botones:

- **Copiar** — en una imagen subida a este servidor copia **la imagen misma** al portapapeles, lista para pegar en WhatsApp; si el navegador no lo permite o es un link externo, copia el enlace.
- **Descargar** — baja el archivo; si es un link de YouTube o Drive lo abre en su sitio.

Arriba está **Descargar todo (ZIP)**: empaqueta en un solo archivo el material del producto que vive en este servidor (los links externos no se pueden empaquetar y se avisa).

**Qué lo hace diferente.** Debajo de *Cómo presentarlo*: un texto, una **tabla comparativa** contra otros productos (aspecto · el nuestro · otros) y un **video** que lo explique, por link de YouTube, Google Drive o archivo subido. En móvil la tabla se apila.

**Mensaje para WhatsApp.** Un mensaje predeterminado por producto para cuando el cliente pide información, con botones **Copiar mensaje** (en formato WhatsApp) y **Abrir WhatsApp**, que abre `wa.me` con el texto listo para elegir el contacto. Usa huecos como `[nombre]`.

## Biblioteca interna

Todo archivo subido queda disponible para reutilizarlo desde el botón **Biblioteca** —en productos, procesos, videos de onboarding, capturas y audios— sin volver a subirlo. La biblioteca marca cuáles están en uso.

Un archivo sólo se borra del disco cuando **ya no queda ninguna referencia** a él: quitarlo de un sitio no lo elimina si otro lo sigue usando.

## Videos: YouTube, Google Drive o archivo

Cualquier campo de video acepta tres formas, y las tres se reproducen **dentro de la app**:

| Fuente | Cómo se pega | Cómo se ve |
|---|---|---|
| YouTube | cualquier formato de link (`youtu.be`, `watch?v=`, `shorts`, `embed`) | iframe `youtube-nocookie` |
| Google Drive | el link de compartir tal cual (`/file/d/…/view?usp=drive_link`) | vista previa de Drive incrustada, con miniatura |
| Archivo propio | botón **Subir archivo** | reproductor `<video>` nativo |

Para que un video de Drive se vea, el archivo debe estar compartido como **“Cualquiera con el enlace”**; si no, Drive muestra su pantalla de permisos dentro del marco. Si la miniatura no carga por permisos, la tarjeta cae al icono por defecto sin romperse.

Un link que no sea de ninguna de las tres se guarda igual y se ofrece como enlace externo.

## Archivos: links o subida

Además de pegar links, se pueden **subir archivos** desde el móvil o el escritorio:

| Dónde | Qué se sube |
|---|---|
| Onboarding | video de cada lección (o link de YouTube) |
| Procesos | video 1 y video 2, cada uno con comentario |
| Ejemplos reales | capturas de la conversación y audio de la llamada |
| Soporte | captura que acompaña a la duda |

Formatos admitidos: imagen (png, jpg, webp, gif), audio (mp3, m4a, ogg, wav, weba) y video (mp4, webm, mov). Límite por archivo: **100 MB**, configurable con `MAX_UPLOAD_MB`.

Los archivos se guardan en `DATA_DIR/uploads` —el mismo volumen que la base— y se sirven desde `/uploads/…`. Al quitar un adjunto o reemplazar un video, el archivo se borra del disco.

**Capturas de conversación:** con el ejemplo abierto, `Ctrl+V` pega directamente la captura del portapapeles. También se puede arrastrar la imagen sobre la zona punteada o tocarla para elegir un archivo. En Soporte funciona igual pegando dentro del cuadro de texto.

**Guion de la llamada:** cada ejemplo puede tener una lista de pasos que se abre en un pop-up sobre el ejemplo, para seguir la estructura mientras se escucha.

## Responsive

Una sola interfaz para escritorio, tablet y móvil:

- **≥1501 px** — el contenido se topa a 1500 px y se **centra**, para que en monitores anchos no quede todo pegado a la izquierda. Los textos largos se limitan a ~82 caracteres por línea aunque la columna sea ancha.
- **1181–1500 px** — barra lateral + columna de contenido, que ocupa todo el ancho disponible, + rail de "turno activo".
- **≤1180 px** — el rail desaparece y la tarjeta de turno activo se mueve al cuerpo del runbook.
- **≤900 px** — la barra lateral pasa a ser un menú deslizable (botón ☰ + fondo oscurecido).
- **≤640 px** — los modales se abren como hoja inferior, los formularios pasan a una columna y los inputs suben a 16 px para que iOS no haga zoom.

Las grillas son fluidas (`auto-fill`), el arrastre usa eventos de puntero (funciona con dedo igual que con ratón) y el layout respeta el área segura de los móviles con notch.

## Protección de datos

Reglas que cumple la app, cubiertas por las pruebas de `npm test`:

1. **Actualizar nunca borra.** El contenido de ejemplo se inserta **una sola vez en la vida de la base** (queda marcado en la tabla `meta`). Si el equipo borra todas las tareas, un reinicio **no** se las devuelve.
2. **Las migraciones sólo añaden.** Nunca hay `DROP TABLE` ni se quitan columnas: una base de una versión anterior se actualiza conservando todo.
3. **Sin volumen no arranca.** Dentro de un contenedor, la app comprueba si `DATA_DIR` está en un volumen montado. Si no lo está, **se niega a arrancar** con un mensaje que explica cómo montarlo — porque todo lo que se guardara ahí se perdería en el siguiente despliegue. Para una prueba de usar y tirar se puede forzar con `ALLOW_EPHEMERAL=1`. Si aun así corre sin volumen, la app muestra un aviso rojo permanente y `/health` lo reporta en `volumenPersistente`.
4. **`REQUIRE_DATA=1` es el segundo seguro.** Con esa variable puesta, si al arrancar no encuentra `nova.db` la app **se niega a arrancar** (sale con error, el despliegue se marca como fallido) en vez de crear una base vacía. Es la protección contra un volumen mal montado.
   > Actívala en Coolify en cuanto la app tenga contenido real. Es la diferencia entre "el deploy falla y lo arreglas" y "la app arranca vacía y parece que se borró todo".
5. **Instantáneas automáticas** en `DATA_DIR/backups`: una en cada arranque, una al día y una **antes de cada restauración**. Se conservan las últimas 12 (`MAX_BACKUPS`).
6. **Restaurar es reversible**: antes de sobrescribir se guarda cómo estaba.

Las instantáneas viven en el mismo volumen, así que protegen de borrados y de restauraciones equivocadas, **no** de perder el volumen. Para eso, descarga la copia (abajo) y guárdala fuera.

```bash
npm test   # 11 pruebas de protección y respaldo
```

## Copia de seguridad (importante)

En la pestaña **Información del negocio**, con el modo edición activo, hay un bloque **Copia de seguridad**:

- **Descargar copia completa (ZIP)** — todo el contenido escrito por el equipo **y** los archivos subidos.
- **Sólo el contenido (JSON)** — los textos, sin archivos.
- **Restaurar desde una copia** — reemplaza todo el contenido actual por el del archivo. Pide confirmación porque es destructivo.

Guarda la copia **fuera del servidor**. Si el volumen de datos se pierde, restaurar el ZIP devuelve el contenido y los archivos a su sitio.

**Cómo saber si perdiste la base:** en los logs del contenedor, al arrancar, la app dice una de dos cosas:

```
Base existente reutilizada, no se toca el contenido guardado.
Contenido actual: tasks=12 videos=6 ...
```

o bien, si el volumen no está montado:

```
[AVISO] No había base de datos en /data/nova.db: se ha creado una nueva con el contenido inicial.
[AVISO] Si esperabas encontrar el contenido del equipo, el volumen persistente no está montado en /data.
```

Actualizar la app **nunca** toca el contenido guardado: el contenido inicial sólo se inserta en tablas vacías y las migraciones sólo añaden columnas.

## PostgreSQL (en preparación)

La app sigue guardando en SQLite, pero ya trae el cliente de PostgreSQL y una prueba de conexión para preparar la migración:

1. En Coolify, define las variables de conexión. Se aceptan tres formatos, en este orden de preferencia:
   - `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` (el formato del equipo),
   - `DATABASE_URL` = `postgres://usuario:clave@host:5432/base`,
   - o el juego estándar `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE`.
   Si el servidor exige TLS, añade `DB_SSL=1` (o `PGSSL=1`).
2. En la app: **Información del negocio → Editar → Probar conexión a PostgreSQL**. Un pop-up dice "Conexión exitosa" (con la base, la versión y la latencia) o el motivo del fallo.
3. `GET /api/pgtest` hace lo mismo por API. No toca ningún dato: sólo conecta y pregunta la versión.

> Si la base corre en el mismo Coolify, el host es el nombre interno del servicio de Postgres, no `localhost`.

## Deploy en Coolify

1. **New Resource → Application → Public/Private Repository**, apuntando a este repo.
2. Build Pack: **Dockerfile**.
3. **Port**: `3000`.
4. **Persistent Storage** (imprescindible: aquí viven la base, los archivos subidos **y las instantáneas**):
   `Volume Mount` → Destination Path `/data`.
5. **Environment Variables** → añade `REQUIRE_DATA=1` en cuanto la app tenga contenido real.
6. Health check ya viene en el Dockerfile (`/health`).

`GET /health` responde algo así:

```json
{"ok":true,"version":"…","baseCreada":"2026-08-14T…","arrancado":"2026-08-14T…","segundosEnPie":1840,"requireData":true}
```

- `version` — comprueba de un vistazo si el deploy tomó el último commit.
- `baseCreada` — cuándo se creó la base. Si cambia, es que se perdió y se creó otra.
- `segundosEnPie` — si al recargar vuelve siempre a un número pequeño, **el contenedor se está reiniciando solo**; con el volumen mal montado, cada reinicio vacía la base.

Variables opcionales:

| Variable | Default | Para qué |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `DATA_DIR` | `/data` | Dónde viven `nova.db` y `uploads/` |
| `TZ_APP` | `America/Lima` | Zona horaria del corte diario del runbook |
| `MAX_UPLOAD_MB` | `100` | Tamaño máximo por archivo subido |
| `REQUIRE_DATA` | — | Ponla a `1` en producción: si no encuentra la base, no arranca |
| `ALLOW_EPHEMERAL` | — | Sólo para pruebas: permite arrancar sin volumen persistente |
| `MAX_BACKUPS` | `12` | Instantáneas automáticas que se conservan |

## Local

```bash
node server.js          # http://localhost:3000
docker compose up --build
```

## Estructura

```
server.js    API + estáticos + archivos subidos + esquema SQLite
seed.js      Contenido inicial (sólo se inserta una vez, en una base nueva)
public/      La app (una sola página)
test/        Pruebas de protección de datos y respaldo (npm test)
Dockerfile   Imagen para Coolify
```

## API

Todo el contenido es editable por API. `:id` es numérico salvo en productos, donde es el slug del nombre.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/state` | Todo el contenido y el progreso |
| POST | `/api/uploads` | Sube un archivo (cuerpo binario + `content-type`); devuelve `{url,kind,size}` |
| GET | `/api/library` | Lista los archivos subidos, con tamaño, tipo y si están en uso |
| GET | `/api/pgtest` | Prueba la conexión a PostgreSQL con las variables de entorno |
| GET | `/api/backup` · `/api/backup/zip` | Copia de seguridad: JSON del contenido, o ZIP con contenido + archivos |
| POST | `/api/restore` | Restaura una copia (cuerpo JSON o ZIP, o `{"snapshot":"…"}`). Guarda una copia previa |
| GET | `/api/backups` · `/api/backups/:archivo` | Instantáneas automáticas del volumen: listar y descargar |
| POST · PUT · DELETE | `/api/guiones[/:id]` | Guiones por caso |
| POST · PUT · DELETE | `/api/tasks[/:id]` | Alta, edición y borrado de tareas (se ordenan por hora) |
| PUT | `/api/tasks/:id/done` | `{done}` — marca la tarea del día |
| POST · PUT · DELETE | `/api/videos[/:id]` | Alta, edición y borrado de videos de onboarding |
| PUT | `/api/videos/:id/url` | `{url}` — sólo el link o archivo |
| POST · PUT · DELETE | `/api/checklist[/:id]` | Alta, edición y borrado de ítems |
| POST | `/api/videos/vaciar` · `/api/checklist/vaciar` | Vacía la sección de onboarding de una vez |
| PUT | `/api/checklist/:id/done` | `{done}` — marca el ítem |
| POST · PUT · DELETE | `/api/procesos[/:id]` | Alta, edición y borrado de procesos |
| PUT | `/api/procesos/:id/video` | `{n,url,nota}` — guarda el video 1 o 2 con su comentario |
| POST · PUT · DELETE | `/api/products[/:id]` | Alta, edición y borrado de fichas |
| POST | `/api/products/:id/media` | `{kind,title,url,nota}` — agrega imagen o video |
| PUT | `/api/media/:id` | `{title,nota}` — edita el título y la descripción de uso |
| PUT | `/api/products/:id/media/order` | `{ids}` — orden de la galería (el primero es la portada) |
| GET | `/api/products/:id/zip` | Descarga en ZIP el material del producto subido a este servidor |
| DELETE | `/api/media/:id` | Quita imagen o video del producto |
| POST · PUT · DELETE | `/api/ejemplos[/:id]` | Alta, edición y borrado de ejemplos |
| POST | `/api/ejemplos/:id/attach` | `{kind,title,url}` — captura (`image`) o audio (`audio`) |
| DELETE | `/api/attach/:id` | Quita la captura o el audio |
| POST · PUT · DELETE | `/api/infos[/:id]` | Bloques de información del negocio |
| POST · PUT · DELETE | `/api/dudas[/:id]` | Dudas de soporte |
| PUT | `/api/dudas/:id/respuesta` | `{respuesta}` — responde y marca resuelta (vacía, reabre) |
| PUT | `/api/dudas/:id/estado` | `{estado}` — `abierta` o `resuelta` |
| PUT | `/api/{videos,procesos,products,ejemplos,infos,guiones,checklist}/order` | `{ids}` — guarda el orden del arrastre |

Los textos se validan y recortan en el servidor: los campos obligatorios que llegan vacíos devuelven `400`, los links que no son `http(s)` (ni `/uploads/…`) se rechazan, las filas vacías de listas se descartan y los formatos de archivo no admitidos devuelven `415`.

> La app no tiene login: pensada para uso interno detrás de la URL privada de Coolify.
> Si la vas a exponer públicamente, ponle Basic Auth desde el proxy de Coolify — sin eso, cualquiera con el link puede editar contenido y subir archivos.

`nova-ventas.html` es el prototipo original estático que dio origen a esta app; se conserva sólo como referencia.
