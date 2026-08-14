# NOVA Onboarding — Ventas COD

App de onboarding y runbook operativo para el equipo de ventas COD.
Node 24 sin dependencias npm + SQLite embebido (`node:sqlite`). Imagen Docker ~80 MB.

## Qué hace

- **Onboarding** — videos de lanzamiento con su guion. Pegas el link de YouTube o de Google Drive, o subes el archivo.
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

Cada guion es un **caso** ("Cliente no respondió al mensaje del adelanto") y contiene:

- **Cómo abrir** — lo que se dice primero, tal cual.
- **Qué puede preguntar y qué responder** — una tarjeta por objeción o pregunta, con la respuesta literal y una nota interna (*Para ti*) que no se copia.
- **Cómo cerrar** y **recordatorios**.

Los guiones se escriben **sólo en esta pestaña**. Desde una tarea del runbook o desde un proceso se elige cuál aplica (campo *Guion de ventas*), y aparece un botón que lleva al caso ya abierto — así el guion vive en un único sitio y se referencia desde donde haga falta.

Cada respuesta tiene su botón **Copiar**, y hay uno para el guion completo. Al copiar se convierte al formato de WhatsApp: `**negrita**` sale como `*negrita*`. El buscador de arriba filtra por caso, pregunta o cualquier palabra del texto y abre directamente el caso encontrado — pensado para usarlo en mitad de una llamada.

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

- **≥1181 px** — barra lateral de áreas + columna de contenido + rail de "turno activo".
- **≤1180 px** — el rail desaparece y la tarjeta de turno activo se mueve al cuerpo del runbook.
- **≤900 px** — la barra lateral pasa a ser un menú deslizable (botón ☰ + fondo oscurecido).
- **≤640 px** — los modales se abren como hoja inferior, los formularios pasan a una columna y los inputs suben a 16 px para que iOS no haga zoom.

Las grillas son fluidas (`auto-fill`), el arrastre usa eventos de puntero (funciona con dedo igual que con ratón) y el layout respeta el área segura de los móviles con notch.

## Deploy en Coolify

1. **New Resource → Application → Public/Private Repository**, apuntando a este repo.
2. Build Pack: **Dockerfile**.
3. **Port**: `3000`.
4. **Persistent Storage** (imprescindible: aquí viven la base **y los archivos subidos**):
   `Volume Mount` → Destination Path `/data`.
5. Health check ya viene en el Dockerfile (`/health`).

`GET /health` responde `{"ok":true,"version":"…"}`; esa versión sirve para comprobar de un vistazo si el deploy tomó el último commit.

Variables opcionales:

| Variable | Default | Para qué |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP |
| `DATA_DIR` | `/data` | Dónde viven `nova.db` y `uploads/` |
| `TZ_APP` | `America/Lima` | Zona horaria del corte diario del runbook |
| `MAX_UPLOAD_MB` | `100` | Tamaño máximo por archivo subido |

## Local

```bash
node server.js          # http://localhost:3000
docker compose up --build
```

## Estructura

```
server.js    API + estáticos + archivos subidos + esquema SQLite
seed.js      Contenido inicial (sólo se inserta si la base está vacía)
public/      La app (una sola página)
Dockerfile   Imagen para Coolify
```

## API

Todo el contenido es editable por API. `:id` es numérico salvo en productos, donde es el slug del nombre.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/state` | Todo el contenido y el progreso |
| POST | `/api/uploads` | Sube un archivo (cuerpo binario + `content-type`); devuelve `{url,kind,size}` |
| GET | `/api/library` | Lista los archivos subidos, con tamaño, tipo y si están en uso |
| POST · PUT · DELETE | `/api/guiones[/:id]` | Guiones por caso |
| POST · PUT · DELETE | `/api/tasks[/:id]` | Alta, edición y borrado de tareas (se ordenan por hora) |
| PUT | `/api/tasks/:id/done` | `{done}` — marca la tarea del día |
| POST · PUT · DELETE | `/api/videos[/:id]` | Alta, edición y borrado de videos de onboarding |
| PUT | `/api/videos/:id/url` | `{url}` — sólo el link o archivo |
| POST · PUT · DELETE | `/api/checklist[/:id]` | Alta, edición y borrado de ítems |
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
