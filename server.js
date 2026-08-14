import { createServer } from 'node:http';
import { readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, normalize, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { rutaEnMontaje } from './lib/volumen.js';
import { TASKS, VIDEOS, CHECKLIST, PROCESOS, PRODUCTS, EJEMPLOS, INFOS, GUIONES } from './seed.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
const UPLOADS = join(DATA_DIR, 'uploads');
const BACKUPS = join(DATA_DIR, 'backups');
const TZ = process.env.TZ_APP || 'America/Lima';
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 100);
const MAX_SNAPS = Number(process.env.MAX_BACKUPS || 12);
const REQUIRE_DATA = /^(1|true|si|sí|yes)$/i.test(process.env.REQUIRE_DATA || '');
const ALLOW_EPHEMERAL = /^(1|true|si|sí|yes)$/i.test(process.env.ALLOW_EPHEMERAL || '');
const VERSION = '2026-08-14-9';

/* ================= DB ================= */
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOADS, { recursive: true });
mkdirSync(BACKUPS, { recursive: true });
const DB_FILE = join(DATA_DIR, 'nova.db');
const BASE_NUEVA = !existsSync(DB_FILE); // si es nueva, o es la primera vez o el volumen no persistió

// ¿DATA_DIR está en un volumen montado, o en el disco temporal del contenedor?
// Un contenedor sin volumen pierde TODO en cada despliegue, así que se detecta y se avisa.
function enVolumenMontado(dir) {
  try {
    if (!existsSync('/proc/self/mountinfo')) return null; // fuera de Linux no se puede saber
    return rutaEnMontaje(readFileSync('/proc/self/mountinfo', 'utf8'), dir);
  } catch { return null; }
}
const EN_CONTENEDOR = existsSync('/.dockerenv');
const EFIMERO = EN_CONTENEDOR && enVolumenMontado(DATA_DIR) === false;

// Sin volumen la app arranca igual (se está preparando la migración a Postgres),
// pero avisa fuerte: en el log, en /health y con el cartel rojo dentro de la app.
if (EFIMERO) {
  console.warn(`[AVISO] ${DATA_DIR} NO es un volumen persistente: lo que se guarde ahí se pierde en cada despliegue.`);
  console.warn(`[AVISO] Solución: Coolify → Storage → Persistent Storage con Destination Path ${DATA_DIR} — o migrar a PostgreSQL.`);
}

// Seguro de producción: con REQUIRE_DATA=1 la app se niega a arrancar si no encuentra la base,
// en vez de crear una vacía y hacer creer que el contenido se borró.
if (REQUIRE_DATA && BASE_NUEVA) {
  console.error(`[FATAL] REQUIRE_DATA está activado y no existe ${DB_FILE}.`);
  console.error('[FATAL] Casi seguro que el volumen persistente no está montado en ' + DATA_DIR + '.');
  console.error('[FATAL] No se arranca para no crear una base vacía encima. Revisa el volumen y vuelve a desplegar.');
  process.exit(1);
}

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS tasks(
  id INTEGER PRIMARY KEY, ord INTEGER, data TEXT NOT NULL, done_on TEXT);
CREATE TABLE IF NOT EXISTS videos(
  id INTEGER PRIMARY KEY, ord INTEGER, title TEXT, type TEXT, dur TEXT, guion TEXT, url TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS checklist(
  id INTEGER PRIMARY KEY, ord INTEGER, day TEXT, item TEXT, done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS procesos(
  id INTEGER PRIMARY KEY, ord INTEGER, data TEXT NOT NULL, url TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS products(
  id TEXT PRIMARY KEY, ord INTEGER, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media(
  id INTEGER PRIMARY KEY, product_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT, url TEXT NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS ejemplos(
  id INTEGER PRIMARY KEY, ord INTEGER, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attach(
  id INTEGER PRIMARY KEY, owner TEXT NOT NULL, owner_id TEXT NOT NULL, kind TEXT NOT NULL,
  title TEXT, url TEXT NOT NULL, ord INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS infos(
  id INTEGER PRIMARY KEY, ord INTEGER, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS guiones(
  id INTEGER PRIMARY KEY, ord INTEGER, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dudas(
  id INTEGER PRIMARY KEY, created TEXT, autor TEXT, texto TEXT, url TEXT DEFAULT '',
  estado TEXT DEFAULT 'abierta', respuesta TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
`);

const meta = (k) => db.prepare('SELECT v FROM meta WHERE k=?').get(k)?.v;
const setMeta = (k, v) => db.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v));

// Migraciones sobre bases que ya existían.
const columnas = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const addCol = (t, col, def) => { if (!columnas(t).includes(col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); };
addCol('media', 'nota', "TEXT DEFAULT ''");
addCol('media', 'ord', 'INTEGER DEFAULT 0');

const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;

// El contenido de ejemplo se inserta UNA sola vez en la vida de la base. Si el equipo
// borra todas las tareas, un reinicio no se las devuelve: lo borrado, borrado se queda.
const YA_SEMBRADA = meta('sembrada') === '1';
const seed = (t, sql, rows) => {
  if (YA_SEMBRADA || count(t)) return;
  const st = db.prepare(sql);
  rows.forEach((args) => st.run(...args));
};
seed('tasks', 'INSERT INTO tasks(ord,data) VALUES(?,?)', TASKS.map((t, i) => [i, JSON.stringify(t)]));
seed('videos', 'INSERT INTO videos(ord,title,type,dur,guion) VALUES(?,?,?,?,?)', VIDEOS.map((v, i) => [i, v.title, v.type, v.dur, v.guion]));
seed('checklist', 'INSERT INTO checklist(ord,day,item) VALUES(?,?,?)', CHECKLIST.flatMap((g, i) => g.items.map((it, j) => [i * 100 + j, g.day, it])));
seed('procesos', 'INSERT INTO procesos(ord,data) VALUES(?,?)', PROCESOS.map((p, i) => [i, JSON.stringify(p)]));
seed('products', 'INSERT INTO products(id,ord,data) VALUES(?,?,?)', PRODUCTS.map((p, i) => [p.id, i, JSON.stringify(p)]));
seed('ejemplos', 'INSERT INTO ejemplos(ord,data) VALUES(?,?)', EJEMPLOS.map((e, i) => [i, JSON.stringify(e)]));
seed('infos', 'INSERT INTO infos(ord,data) VALUES(?,?)', INFOS.map((x, i) => [i, JSON.stringify(x)]));
seed('guiones', 'INSERT INTO guiones(ord,data) VALUES(?,?)', GUIONES.map((g, i) => [i, JSON.stringify(g)]));
if (!YA_SEMBRADA) {
  setMeta('sembrada', '1');
  if (!meta('creada')) setMeta('creada', new Date().toISOString());
}
const ARRANQUE = new Date().toISOString();
setMeta('ultimo_arranque', ARRANQUE);
setMeta('version', VERSION);

/* ================= ESTADO ================= */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const attachOf = (rows, owner, id, kind) =>
  rows.filter((a) => a.owner === owner && a.owner_id === String(id) && a.kind === kind)
    .map(({ id: aid, kind: k, title, url }) => ({ id: aid, kind: k, title, url }));

// Los procesos guardaban un solo video en la columna `url`; ahora viven en data.vids.
const procVids = (data, url) => {
  if (Array.isArray(data.vids)) return data.vids;
  return url ? [{ url, nota: '' }] : [];
};

function getState() {
  const hoy = today();
  const media = db.prepare('SELECT id,product_id,kind,title,url,nota,ord FROM media ORDER BY ord, id').all();
  const att = db.prepare('SELECT id,owner,owner_id,kind,title,url FROM attach ORDER BY ord, id').all();
  return {
    hoy,
    version: VERSION,
    maxUploadMb: MAX_MB,
    baseCreada: meta('creada') || null,
    arrancado: ARRANQUE,
    efimero: EFIMERO, // true = los datos NO están en un volumen persistente
    tasks: db.prepare('SELECT id,data,done_on FROM tasks ORDER BY ord').all()
      .map((r) => ({ id: r.id, ...JSON.parse(r.data), done: r.done_on === hoy })),
    videos: db.prepare('SELECT id,title,type,dur,guion,url FROM videos ORDER BY ord').all()
      .map((v, i) => ({ ...v, n: i + 1 })),
    checklist: db.prepare('SELECT id,ord,day,item,done FROM checklist ORDER BY ord').all()
      .reduce((acc, r) => {
        let g = acc.find((x) => x.day === r.day);
        if (!g) acc.push((g = { day: r.day, items: [] }));
        g.items.push({ id: r.id, text: r.item, done: !!r.done });
        return acc;
      }, []),
    procesos: db.prepare('SELECT id,data,url FROM procesos ORDER BY ord').all()
      .map((r) => {
        const data = JSON.parse(r.data);
        return { id: r.id, ...data, vids: procVids(data, r.url) };
      }),
    products: db.prepare('SELECT id,data FROM products ORDER BY ord').all()
      .map((r) => ({
        ...JSON.parse(r.data),
        id: r.id,
        media: {
          images: media.filter((m) => m.product_id === r.id && m.kind === 'image'),
          videos: media.filter((m) => m.product_id === r.id && m.kind === 'video'),
        },
      })),
    ejemplos: db.prepare('SELECT id,data FROM ejemplos ORDER BY ord').all()
      .map((r) => ({
        id: r.id,
        ...JSON.parse(r.data),
        media: {
          images: attachOf(att, 'ejemplo', r.id, 'image'),
          audios: attachOf(att, 'ejemplo', r.id, 'audio'),
        },
      })),
    infos: db.prepare('SELECT id,data FROM infos ORDER BY ord').all()
      .map((r) => ({ id: r.id, ...JSON.parse(r.data) })),
    guiones: db.prepare('SELECT id,data FROM guiones ORDER BY ord').all()
      .map((r) => ({ id: r.id, ...JSON.parse(r.data) })),
    dudas: db.prepare('SELECT id,created,autor,texto,url,estado,respuesta FROM dudas ORDER BY id DESC').all(),
  };
}

/* ================= VALIDACIÓN ================= */
class HttpError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}

const str = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v, max = 2000) => String(v ?? '').trim().slice(0, max); // conserva saltos de línea
const req = (v, max, field) => {
  const s = str(v, max);
  if (!s) throw new HttpError(400, `Falta ${field}`);
  return s;
};
const oneOf = (v, opts, def) => (opts.includes(v) ? v : def);
const strList = (v, max = 40, len = 400) =>
  (Array.isArray(v) ? v : []).slice(0, max).map((x) => str(x, len)).filter(Boolean);
const objList = (v, max, map) =>
  (Array.isArray(v) ? v : []).slice(0, max).map(map).filter(Boolean);

// Se aceptan links http(s) y los archivos subidos a esta misma app (/uploads/…).
const cleanUrl = (u) => {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (/^\/uploads\/[\w.-]+$/.test(s)) return s;
  try {
    const p = new URL(s);
    return p.protocol === 'http:' || p.protocol === 'https:' ? s : null;
  } catch { return null; }
};
const urlOrFail = (u) => {
  const s = cleanUrl(u);
  if (s === null) throw new HttpError(400, 'Link inválido');
  return s;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const tips = (v) => objList(v, 20, (t) => {
  const x = text(t?.x, 600);
  return x ? { t: oneOf(t?.t, ['info', 'warn', 'alert'], 'info'), x } : null;
});

const normTask = (b) => ({
  time: TIME_RE.test(str(b.time, 5)) ? str(b.time, 5) : '09:00',
  block: str(b.block, 60) || 'General',
  range: str(b.range, 40),
  tag: str(b.tag, 30).toUpperCase() || 'TAREA',
  prio: oneOf(b.prio, ['crit', 'imp', 'reg'], 'reg'),
  dur: str(b.dur, 20),
  title: req(b.title, 160, 'el título'),
  desc: text(b.desc, 1500),
  steps: strList(b.steps, 30, 300),
  outcomes: outcomes(b.outcomes), // qué hacer según cómo salga: ok / a medias / mal
  tips: tips(b.tips),
  procId: Number(b.procId) || null, // proceso detallado que amplía la tarea
  guionId: Number(b.guionId) || null, // guion de ventas que se usa al ejecutarla
  url: urlOrFail(b.url), // video de cómo ejecutarla
  nota: text(b.nota, 300),
  expected: text(b.expected, 800), // qué debe quedar listo para darla por hecha
});

const normVideo = (b) => ({
  title: req(b.title, 160, 'el título'),
  type: str(b.type, 80),
  dur: str(b.dur, 20),
  guion: text(b.guion, 4000),
  url: urlOrFail(b.url),
});

const normCheck = (b) => ({
  day: str(b.day, 40) || 'Día 1',
  item: req(b.item, 300, 'el ítem'),
});

// Cada proceso admite hasta 2 videos, cada uno con su comentario. La posición importa:
// si el 1 está vacío y el 2 lleno, el 2 sigue siendo el "Video 2"; sólo se podan los huecos del final.
const trimVids = (arr) => {
  while (arr.length && !arr[arr.length - 1].url && !arr[arr.length - 1].nota) arr.pop();
  return arr;
};
const normVids = (v) => trimVids((Array.isArray(v) ? v : []).slice(0, 2)
  .map((x) => ({ url: urlOrFail(x?.url), nota: text(x?.nota, 400) })));

// Qué hacer según cómo salga: mismo formato en tareas y en procesos.
const outcomes = (v) => objList(v, 12, (o) => {
  const t = str(o?.t, 200), r = text(o?.r, 900);
  return t || r ? { k: oneOf(o?.k, ['ok', 'warn', 'bad'], 'ok'), t, r } : null;
});

const normProceso = (b) => ({
  name: req(b.name, 160, 'el nombre'),
  when: str(b.when, 120),
  steps: strList(b.steps, 30, 300),
  outcomes: outcomes(b.outcomes),
  tips: tips(b.tips),
  vids: normVids(b.vids),
  guionId: Number(b.guionId) || null, // guion de ventas que se usa en este proceso
});

const normProducto = (b) => ({
  name: req(b.name, 120, 'el nombre'),
  brand: str(b.brand, 60),
  price: str(b.price, 60),
  desc: text(b.desc, 1500),
  packs: objList(b.packs, 12, (p) => {
    const q = str(p?.q, 60), pr = str(p?.p, 40);
    return q || pr ? { q, p: pr, ...(p?.best ? { best: true } : {}) } : null;
  }),
  beneficios: strList(b.beneficios, 25, 200),
  specs: objList(b.specs, 25, (s) => {
    const k = str(s?.k, 60), v = str(s?.v, 240);
    return k || v ? { k, v } : null;
  }),
  objeciones: objList(b.objeciones, 25, (o) => {
    const q = str(o?.o, 200), r = text(o?.r, 900);
    return q || r ? { o: q, r } : null;
  }),
  argumentos: text(b.argumentos, 1500),
  // Qué lo hace diferente: texto, comparativa contra otros y un video que lo explique.
  difTexto: text(b.difTexto, 1500),
  compara: objList(b.compara, 12, (c) => {
    const k = str(c?.k, 80), a = str(c?.a, 160), otros = str(c?.b, 160);
    return k || a || otros ? { k, a, b: otros } : null;
  }),
  difUrl: urlOrFail(b.difUrl),
  difNota: text(b.difNota, 300),
  // Mensaje listo para responder por WhatsApp cuando piden información.
  waMsg: text(b.waMsg, 1500),
});

const normEjemplo = (b) => {
  const kind = oneOf(b.kind, ['chat', 'call'], 'chat');
  const e = {
    kind,
    title: req(b.title, 160, 'el título'),
    obj: str(b.obj, 80),
    dur: str(b.dur, 30),
    desc: text(b.desc, 500),
    learn: text(b.learn, 900),
    guion: strList(b.guion, 30, 300), // estructura de la llamada, se muestra en un pop-up
  };
  if (kind === 'chat') {
    e.chat = objList(b.chat, 40, (m) => {
      const t = text(m?.t, 700);
      if (!t) return null;
      const s = oneOf(m?.s, ['in', 'out'], 'in');
      return { s, w: str(m?.w, 40) || (s === 'out' ? 'Vendedora' : 'Cliente'), t };
    });
  } else {
    e.note = text(b.note, 900);
  }
  return e;
};

// Guion: apertura + casos (qué decir en cada situación) + preguntas del cliente + cierre.
const normGuion = (b) => ({
  title: req(b.title, 160, 'el título del caso'),
  tag: str(b.tag, 40),
  when: str(b.when, 160),
  apertura: text(b.apertura, 2500),
  casos: objList(b.casos, 30, (c) => {
    const n = str(c?.n, 200), t = text(c?.t, 3000);
    return n || t ? { n, t } : null;
  }),
  qas: objList(b.qas, 30, (x) => {
    const q = text(x?.q, 300), r = text(x?.r, 2000), nota = text(x?.nota, 400);
    return q || r ? { q, r, nota } : null;
  }),
  cierre: text(b.cierre, 1200),
  tips: tips(b.tips),
});

const normInfo = (b) => ({
  title: req(b.title, 160, 'el título'),
  tag: str(b.tag, 40),
  body: text(b.body, 4000),
  links: objList(b.links, 12, (l) => {
    const t = str(l?.t, 120), u = cleanUrl(l?.u);
    return u ? { t: t || u, u } : null;
  }),
});

/* ================= HELPERS DE TABLA ================= */
const nextOrd = (t) => db.prepare(`SELECT COALESCE(MAX(ord),-1)+1 n FROM ${t}`).get().n;

const must = (t, id, col = 'id') => {
  const row = db.prepare(`SELECT * FROM ${t} WHERE ${col}=?`).get(col === 'id' && t !== 'products' ? Number(id) : id);
  if (!row) throw new HttpError(404, 'No existe');
  return row;
};

const removeRow = (t, id) => {
  must(t, id);
  db.prepare(`DELETE FROM ${t} WHERE id=?`).run(t === 'products' ? id : Number(id));
};

// Guarda el orden que llega desde el arrastre: la posición en el array es el nuevo `ord`.
function setOrder(t, ids, isText) {
  const list = (Array.isArray(ids) ? ids : []).slice(0, 500);
  if (!list.length) throw new HttpError(400, 'Orden vacío');
  const up = db.prepare(`UPDATE ${t} SET ord=? WHERE id=?`);
  list.forEach((id, i) => up.run(i, isText ? String(id) : Number(id)));
  return list.length;
}

// El checklist se reordena dentro de un día sin mover los demás grupos de sitio.
function setChecklistOrder(ids) {
  const wanted = (Array.isArray(ids) ? ids : []).map(Number);
  if (!wanted.length) throw new HttpError(400, 'Orden vacío');
  const rows = db.prepare('SELECT id, day FROM checklist ORDER BY ord').all();
  const day = rows.find((r) => r.id === wanted[0])?.day;
  if (day === undefined) throw new HttpError(404, 'No existe');
  const queue = wanted.filter((id) => rows.some((r) => r.id === id && r.day === day));
  const final = rows.map((r) => (r.day === day ? queue.shift() ?? r.id : r.id));
  return setOrder('checklist', final);
}

// El runbook siempre se muestra en orden cronológico: el `ord` se recalcula por hora.
function reorderTasksByTime() {
  const rows = db.prepare('SELECT id, data FROM tasks').all()
    .map((r) => ({ id: r.id, time: JSON.parse(r.data).time || '00:00' }))
    .sort((a, b) => a.time.localeCompare(b.time) || a.id - b.id);
  const up = db.prepare('UPDATE tasks SET ord=? WHERE id=?');
  rows.forEach((r, i) => up.run(i, r.id));
}

const slug = (s) => str(s, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'producto';
const freeId = (base) => {
  let id = base, n = 2;
  while (db.prepare('SELECT 1 FROM products WHERE id=?').get(id)) id = `${base}-${n++}`;
  return id;
};

/* ================= ARCHIVOS SUBIDOS ================= */
const EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a',
  'audio/aac': '.aac', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/webm': '.weba',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

const readRaw = (request, limit) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  request.on('data', (c) => {
    size += c.length;
    if (size > limit) { reject(new HttpError(413, `El archivo supera el límite de ${MAX_MB} MB`)); request.destroy(); return; }
    chunks.push(c);
  });
  request.on('end', () => resolve(Buffer.concat(chunks)));
  request.on('error', reject);
});

async function handleUpload(request, res) {
  const type = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) throw new HttpError(415, 'Formato no admitido. Usa imagen (png/jpg/webp), audio (mp3/m4a/ogg/wav) o video (mp4/webm).');
  const buf = await readRaw(request, MAX_MB * 1024 * 1024);
  if (!buf.length) throw new HttpError(400, 'Archivo vacío');
  const name = randomUUID() + ext;
  await writeFile(join(UPLOADS, name), buf);
  const kind = type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : 'video';
  return json(res, 201, { url: '/uploads/' + name, kind, size: buf.length });
}

// Un mismo archivo puede estar reutilizado desde la biblioteca en varios sitios,
// así que sólo se borra del disco cuando ya no queda ninguna referencia.
const REF_COLS = [['videos', 'url'], ['media', 'url'], ['attach', 'url'], ['dudas', 'url']];
const REF_JSON = ['procesos', 'tasks', 'products'];
function urlEnUso(url) {
  for (const [t, col] of REF_COLS) if (db.prepare(`SELECT 1 FROM ${t} WHERE ${col}=? LIMIT 1`).get(url)) return true;
  for (const t of REF_JSON) if (db.prepare(`SELECT 1 FROM ${t} WHERE instr(data, ?) > 0 LIMIT 1`).get(url)) return true;
  return false;
}
// Llamar SIEMPRE después de haber quitado la referencia en la base.
const gcUpload = async (url) => {
  const m = /^\/uploads\/([\w.-]+)$/.exec(String(url || ''));
  if (!m || urlEnUso(url)) return;
  await unlink(join(UPLOADS, basename(m[1]))).catch(() => {});
};

async function listarBiblioteca() {
  const names = await readdir(UPLOADS).catch(() => []);
  const files = [];
  for (const name of names) {
    if (!/^[\w.-]+$/.test(name)) continue;
    const mime = MIME_BY_EXT[extname(name)];
    if (!mime) continue;
    const st = await stat(join(UPLOADS, name)).catch(() => null);
    if (!st) continue;
    const url = '/uploads/' + name;
    files.push({
      url,
      kind: mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : 'video',
      size: st.size,
      at: st.mtimeMs,
      enUso: urlEnUso(url),
    });
  }
  return files.sort((a, b) => b.at - a.at).slice(0, 300);
}

/* ================= ZIP (descarga masiva) ================= */
// ZIP sin comprimir, escrito a mano para no añadir dependencias.
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

function zipFiles(entries) {
  const locales = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // nombres en utf-8
    lh.writeUInt16LE(0, 8); // guardado sin comprimir
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(e.data.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locales.push(lh, name, e.data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(e.data.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + e.data.length;
  }
  const cd = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entries.length, 8);
  fin.writeUInt16LE(entries.length, 10);
  fin.writeUInt32LE(cd.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, cd, fin]);
}

const sinAcentos = (s) => str(s, 60).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .-]+/g, '_');

// Todo el material de un producto que vive en este servidor, en un solo archivo.
async function zipProducto(res, id) {
  const p = must('products', id);
  const nombre = JSON.parse(p.data).name || id;
  const rows = db.prepare('SELECT kind,title,url,ord FROM media WHERE product_id=? ORDER BY ord, id').all(id)
    .filter((m) => /^\/uploads\/[\w.-]+$/.test(m.url));
  if (!rows.length) throw new HttpError(404, 'Este producto no tiene archivos subidos a este servidor (los links externos no se pueden empaquetar)');
  const entries = [];
  let n = 0;
  for (const m of rows) {
    const data = await readFile(join(UPLOADS, basename(m.url))).catch(() => null);
    if (!data) continue;
    n += 1;
    entries.push({ name: `${String(n).padStart(2, '0')}-${sinAcentos(m.title) || m.kind}${extname(m.url)}`, data });
  }
  if (!entries.length) throw new HttpError(404, 'No se encontraron los archivos');
  const zip = zipFiles(entries);
  res.writeHead(200, {
    'content-type': 'application/zip',
    'content-length': zip.length,
    'content-disposition': `attachment; filename="${sinAcentos(nombre) || 'producto'}.zip"`,
  });
  res.end(zip);
}

/* ================= COPIA DE SEGURIDAD ================= */
const TABLAS = ['tasks', 'videos', 'checklist', 'procesos', 'products', 'media', 'ejemplos', 'attach', 'infos', 'dudas', 'guiones'];

const backupJSON = () => {
  const out = { app: 'nova-onboarding', version: VERSION, fecha: new Date().toISOString(), tablas: {} };
  for (const t of TABLAS) out.tablas[t] = db.prepare(`SELECT * FROM ${t}`).all();
  return out;
};

function restaurar(b) {
  if (!b || typeof b !== 'object' || !b.tablas) throw new HttpError(400, 'El archivo no parece una copia de esta app');
  db.exec('BEGIN');
  try {
    for (const t of TABLAS) {
      db.exec(`DELETE FROM ${t}`);
      const rows = Array.isArray(b.tablas[t]) ? b.tablas[t] : [];
      if (!rows.length) continue;
      const cols = columnas(t).filter((c) => c in rows[0]);
      const st = db.prepare(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`);
      for (const r of rows) st.run(...cols.map((c) => (r[c] === undefined || r[c] === null ? null : r[c])));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw new HttpError(400, 'No se pudo restaurar: ' + err.message);
  }
}

// Instantáneas automáticas dentro del volumen: protegen de borrados accidentales y de
// restauraciones equivocadas. No sustituyen a bajarse la copia: si el volumen se pierde,
// estas se pierden con él.
function snapshot(motivo) {
  try {
    if (!TABLAS.reduce((n, t) => n + count(t), 0)) return null;
    const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `${sello}-${motivo}.json`;
    writeFileSync(join(BACKUPS, name), JSON.stringify(backupJSON()));
    const previas = readdirSync(BACKUPS).filter((f) => f.endsWith('.json')).sort();
    for (const f of previas.slice(0, Math.max(0, previas.length - MAX_SNAPS))) rmSync(join(BACKUPS, f), { force: true });
    return name;
  } catch (err) {
    console.error('No se pudo crear la instantánea:', err.message);
    return null;
  }
}

const listarSnapshots = () => readdirSync(BACKUPS).filter((f) => f.endsWith('.json')).sort().reverse()
  .map((name) => {
    const st = statSync(join(BACKUPS, name));
    return { name, size: st.size, at: st.mtimeMs };
  });

// Lector de ZIP mínimo, para poder devolver una copia completa (contenido + archivos).
function unzip(buf) {
  const out = {};
  let i = 0;
  while (i + 30 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const flags = buf.readUInt16LE(i + 6);
    const metodo = buf.readUInt16LE(i + 8);
    const comp = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.toString('utf8', i + 30, i + 30 + nameLen);
    const ini = i + 30 + nameLen + extraLen;
    if (flags & 8) throw new HttpError(400, 'Ese ZIP guarda los tamaños al final y no se puede leer aquí. Vuelve a exportar la copia desde la app.');
    const datos = buf.subarray(ini, ini + comp);
    out[name] = metodo === 0 ? Buffer.from(datos) : inflateRawSync(datos);
    i = ini + comp;
  }
  return out;
}

/* ================= HTTP ================= */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const readBody = (request) => new Promise((resolve, reject) => {
  let raw = '';
  request.on('data', (c) => { raw += c; if (raw.length > 3e5) { reject(new HttpError(413, 'Contenido demasiado grande')); request.destroy(); } });
  request.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new HttpError(400, 'json inválido')); } });
  request.on('error', reject);
});

const ok = (res) => json(res, 200, { ok: true });

async function api(request, res, path) {
  const seg = path.split('/').filter(Boolean).slice(1); // sin 'api'
  const [ent, id, sub] = seg;
  const M = request.method;

  if (ent === 'uploads' && M === 'POST') return handleUpload(request, res);

  /* ---------- PRUEBA DE CONEXIÓN A POSTGRES ---------- */
  // Sólo comprueba que se puede conectar con las variables de entorno; no toca ningún dato.
  if (ent === 'pgtest' && M === 'GET') {
    const E = process.env;
    const cs = E.DATABASE_URL || E.POSTGRES_URL || '';
    const host = E.PGHOST || E.POSTGRES_HOST || E.DB_HOST || '';
    if (!cs && !host) {
      return json(res, 200, {
        ok: false, configurado: false,
        error: 'Faltan las variables de conexión. Define DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME, o DATABASE_URL (postgres://usuario:clave@host:5432/base).',
      });
    }
    let pg;
    try { ({ default: pg } = await import('pg')); }
    catch { return json(res, 200, { ok: false, configurado: true, error: 'El módulo pg no está en esta build. Redespliega para que la imagen lo instale.' }); }
    const t0 = Date.now();
    const client = new pg.Client(cs ? {
      connectionString: cs,
      connectionTimeoutMillis: 6000,
    } : {
      host,
      port: Number(E.PGPORT || E.POSTGRES_PORT || E.DB_PORT || 5432),
      user: E.PGUSER || E.POSTGRES_USER || E.DB_USER || 'postgres',
      password: E.PGPASSWORD || E.POSTGRES_PASSWORD || E.DB_PASSWORD || '',
      database: E.PGDATABASE || E.POSTGRES_DB || E.DB_NAME || 'postgres',
      connectionTimeoutMillis: 6000,
      ssl: /^(1|true)$/i.test(E.PGSSL || E.DB_SSL || '') ? { rejectUnauthorized: false } : undefined,
    });
    try {
      await client.connect();
      const r = await client.query('SELECT version() AS v, current_database() AS db');
      return json(res, 200, {
        ok: true, configurado: true, ms: Date.now() - t0,
        base: r.rows[0].db,
        version: String(r.rows[0].v).split(' on ')[0],
      });
    } catch (err) {
      return json(res, 200, { ok: false, configurado: true, ms: Date.now() - t0, error: String(err.message || err) });
    } finally {
      client.end().catch(() => {});
    }
  }

  /* ---------- COPIA DE SEGURIDAD ---------- */
  if (ent === 'backup' && M === 'GET') {
    const datos = backupJSON();
    if (id === 'zip') {
      const entries = [{ name: 'contenido.json', data: Buffer.from(JSON.stringify(datos, null, 2), 'utf8') }];
      for (const name of await readdir(UPLOADS).catch(() => [])) {
        if (!/^[\w.-]+$/.test(name)) continue;
        const data = await readFile(join(UPLOADS, name)).catch(() => null);
        if (data) entries.push({ name: 'uploads/' + name, data });
      }
      const zip = zipFiles(entries);
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': zip.length,
        'content-disposition': `attachment; filename="nova-copia-${today()}.zip"`,
      });
      return res.end(zip);
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="nova-copia-${today()}.json"`,
    });
    return res.end(JSON.stringify(datos, null, 2));
  }

  if (ent === 'backups' && M === 'GET') {
    if (!id) return json(res, 200, { backups: listarSnapshots() });
    const name = basename(id);
    if (!/^[\w.-]+\.json$/.test(name) || !existsSync(join(BACKUPS, name))) throw new HttpError(404, 'No existe esa instantánea');
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` });
    return res.end(readFileSync(join(BACKUPS, name)));
  }

  if (ent === 'restore' && M === 'POST') {
    const tipo = String(request.headers['content-type'] || '').split(';')[0].trim();
    const raw = await readRaw(request, Math.max(MAX_MB, 200) * 1024 * 1024);
    if (!raw.length) throw new HttpError(400, 'No llegó ningún archivo');
    let restaurados = 0;
    // Antes de tocar nada se guarda cómo estaba, por si la restauración era la equivocada.
    const previa = snapshot('antes-de-restaurar');

    // Restaurar una instantánea del propio servidor: { "snapshot": "…json" }
    if (tipo === 'application/json') {
      let posible = null;
      try { posible = JSON.parse(raw.toString('utf8')); } catch { /* se valida abajo */ }
      if (posible && typeof posible.snapshot === 'string') {
        const name = basename(posible.snapshot);
        if (!/^[\w.-]+\.json$/.test(name) || !existsSync(join(BACKUPS, name))) throw new HttpError(404, 'No existe esa instantánea');
        restaurar(JSON.parse(readFileSync(join(BACKUPS, name), 'utf8')));
        return json(res, 200, { ok: true, archivos: 0, previa });
      }
    }
    if (tipo === 'application/zip' || raw.readUInt32LE(0) === 0x04034b50) {
      const files = unzip(raw);
      const contenido = files['contenido.json'];
      if (!contenido) throw new HttpError(400, 'El ZIP no trae contenido.json');
      restaurar(JSON.parse(contenido.toString('utf8')));
      for (const [name, data] of Object.entries(files)) {
        if (!name.startsWith('uploads/')) continue;
        const base = basename(name);
        if (!/^[\w.-]+$/.test(base)) continue;
        await writeFile(join(UPLOADS, base), data);
        restaurados += 1;
      }
    } else {
      restaurar(JSON.parse(raw.toString('utf8')));
    }
    return json(res, 200, { ok: true, archivos: restaurados, previa });
  }

  // Biblioteca interna: todo lo que ya se subió, para reutilizarlo sin volver a subirlo.
  if (ent === 'library' && M === 'GET' && !id) return json(res, 200, { files: await listarBiblioteca() });

  const body = M === 'GET' ? {} : await readBody(request);

  if (M === 'GET' && ent === 'state' && !id) return json(res, 200, getState());

  /* ---------- TAREAS DEL RUNBOOK ---------- */
  if (ent === 'tasks') {
    if (M === 'POST' && !id) {
      const r = db.prepare('INSERT INTO tasks(ord,data) VALUES(?,?)').run(nextOrd('tasks'), JSON.stringify(normTask(body)));
      reorderTasksByTime();
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && sub === 'done') {
      must('tasks', id);
      db.prepare('UPDATE tasks SET done_on=? WHERE id=?').run(body.done ? today() : null, Number(id));
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      const old = JSON.parse(must('tasks', id).data);
      db.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(normTask(body)), Number(id));
      reorderTasksByTime();
      await gcUpload(old.url);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) {
      const old = JSON.parse(must('tasks', id).data);
      removeRow('tasks', id);
      await gcUpload(old.url);
      return ok(res);
    }
  }

  /* ---------- VIDEOS DE ONBOARDING ---------- */
  if (ent === 'videos') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: setOrder('videos', body.ids) });
    // Vaciar la sección entera de una vez (la app pide confirmación antes).
    if (M === 'POST' && id === 'vaciar') {
      const urls = db.prepare('SELECT url FROM videos').all().map((v) => v.url);
      const n = db.prepare('DELETE FROM videos').run().changes;
      for (const u of urls) await gcUpload(u);
      return json(res, 200, { ok: true, borrados: n });
    }
    if (M === 'POST' && !id) {
      const v = normVideo(body);
      const r = db.prepare('INSERT INTO videos(ord,title,type,dur,guion,url) VALUES(?,?,?,?,?,?)')
        .run(nextOrd('videos'), v.title, v.type, v.dur, v.guion, v.url);
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && sub === 'url') {
      const old = must('videos', id);
      const url = urlOrFail(body.url);
      db.prepare('UPDATE videos SET url=? WHERE id=?').run(url, Number(id));
      if (old.url !== url) await gcUpload(old.url);
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      const old = must('videos', id);
      const v = normVideo(body);
      db.prepare('UPDATE videos SET title=?,type=?,dur=?,guion=?,url=? WHERE id=?')
        .run(v.title, v.type, v.dur, v.guion, v.url, Number(id));
      if (old.url !== v.url) await gcUpload(old.url);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) {
      const old = must('videos', id);
      removeRow('videos', id);
      await gcUpload(old.url);
      return ok(res);
    }
  }

  /* ---------- CHECKLIST ---------- */
  if (ent === 'checklist') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: setChecklistOrder(body.ids) });
    if (M === 'POST' && id === 'vaciar') {
      const n = db.prepare('DELETE FROM checklist').run().changes;
      return json(res, 200, { ok: true, borrados: n });
    }
    if (M === 'POST' && !id) {
      const c = normCheck(body);
      // El ítem nuevo entra al final de su día; si el día no existe, al final de todo.
      const last = db.prepare('SELECT MAX(ord) m FROM checklist WHERE day=?').get(c.day).m;
      let ord;
      if (last === null || last === undefined) {
        ord = nextOrd('checklist');
      } else {
        ord = last + 1;
        db.prepare('UPDATE checklist SET ord = ord + 1 WHERE ord >= ?').run(ord);
      }
      const r = db.prepare('INSERT INTO checklist(ord,day,item) VALUES(?,?,?)').run(ord, c.day, c.item);
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && sub === 'done') {
      must('checklist', id);
      db.prepare('UPDATE checklist SET done=? WHERE id=?').run(body.done ? 1 : 0, Number(id));
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      must('checklist', id);
      const c = normCheck(body);
      db.prepare('UPDATE checklist SET day=?, item=? WHERE id=?').run(c.day, c.item, Number(id));
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { removeRow('checklist', id); return ok(res); }
  }

  /* ---------- PROCESOS ---------- */
  if (ent === 'procesos') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: setOrder('procesos', body.ids) });
    if (M === 'POST' && !id) {
      const p = normProceso(body);
      const r = db.prepare('INSERT INTO procesos(ord,data,url) VALUES(?,?,?)')
        .run(nextOrd('procesos'), JSON.stringify(p), p.vids[0]?.url || '');
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    // Guardado rápido de un video suelto (1 o 2) sin abrir el editor completo.
    if (M === 'PUT' && id && sub === 'video') {
      const row = must('procesos', id);
      const data = JSON.parse(row.data);
      const vids = procVids(data, row.url);
      const n = Number(body.n) === 2 ? 1 : 0;
      const url = urlOrFail(body.url);
      while (vids.length < n) vids.push({ url: '', nota: '' });
      const old = vids[n]?.url;
      const next = { url, nota: text(body.nota, 400) };
      if (n < vids.length) vids[n] = next; else vids.push(next);
      data.vids = trimVids(vids);
      db.prepare('UPDATE procesos SET data=?, url=? WHERE id=?')
        .run(JSON.stringify(data), data.vids[0]?.url || '', Number(id));
      if (old && old !== url) await gcUpload(old);
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      const row = must('procesos', id);
      const antes = procVids(JSON.parse(row.data), row.url).map((v) => v.url);
      const p = normProceso(body);
      db.prepare('UPDATE procesos SET data=?, url=? WHERE id=?')
        .run(JSON.stringify(p), p.vids[0]?.url || '', Number(id));
      for (const u of antes) await gcUpload(u);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) {
      const row = must('procesos', id);
      const antes = procVids(JSON.parse(row.data), row.url).map((v) => v.url);
      removeRow('procesos', id);
      for (const u of antes) await gcUpload(u);
      return ok(res);
    }
  }

  /* ---------- PRODUCTOS + MEDIA ---------- */
  if (ent === 'products') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: setOrder('products', body.ids, true) });
    if (M === 'POST' && !id) {
      const p = normProducto(body);
      const newId = freeId(slug(p.name));
      db.prepare('INSERT INTO products(id,ord,data) VALUES(?,?,?)').run(newId, nextOrd('products'), JSON.stringify(p));
      return json(res, 201, { id: newId });
    }
    if (M === 'GET' && id && sub === 'zip') return zipProducto(res, id);
    if (M === 'POST' && id && sub === 'media') {
      must('products', id);
      const url = urlOrFail(body.url);
      if (!url) throw new HttpError(400, 'Link inválido');
      const kind = body.kind === 'video' ? 'video' : 'image';
      const ord = db.prepare('SELECT COALESCE(MAX(ord),-1)+1 n FROM media WHERE product_id=?').get(id).n;
      const r = db.prepare('INSERT INTO media(product_id,kind,title,url,nota,ord) VALUES(?,?,?,?,?,?)')
        .run(id, kind, str(body.title, 120) || (kind === 'video' ? 'Video' : 'Imagen'), url, text(body.nota, 400), ord);
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && sub === 'media' && seg[3] === 'order') {
      must('products', id);
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number);
      if (!ids.length) throw new HttpError(400, 'Orden vacío');
      const up = db.prepare('UPDATE media SET ord=? WHERE id=? AND product_id=?');
      ids.forEach((mid, i) => up.run(i, mid, id));
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      const antes = JSON.parse(must('products', id).data).difUrl;
      db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify(normProducto(body)), id);
      await gcUpload(antes);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) {
      must('products', id);
      const urls = db.prepare('SELECT url FROM media WHERE product_id=?').all(id).map((m) => m.url);
      db.prepare('DELETE FROM media WHERE product_id=?').run(id);
      db.prepare('DELETE FROM products WHERE id=?').run(id);
      for (const u of urls) await gcUpload(u);
      return ok(res);
    }
  }

  if (ent === 'media' && id) {
    if (M === 'PUT' && !sub) {
      const row = must('media', id);
      db.prepare('UPDATE media SET title=?, nota=? WHERE id=?')
        .run(str(body.title, 120) || (row.kind === 'video' ? 'Video' : 'Imagen'), text(body.nota, 400), Number(id));
      return ok(res);
    }
    if (M === 'DELETE' && !sub) {
      const row = must('media', id);
      db.prepare('DELETE FROM media WHERE id=?').run(Number(id));
      await gcUpload(row.url);
      return ok(res);
    }
  }

  /* ---------- EJEMPLOS REALES ---------- */
  if (ent === 'ejemplos') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: setOrder('ejemplos', body.ids) });
    if (M === 'POST' && !id) {
      const r = db.prepare('INSERT INTO ejemplos(ord,data) VALUES(?,?)').run(nextOrd('ejemplos'), JSON.stringify(normEjemplo(body)));
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    // Capturas de conversación y audios de la llamada.
    if (M === 'POST' && id && sub === 'attach') {
      must('ejemplos', id);
      const kind = oneOf(body.kind, ['image', 'audio'], 'image');
      const url = urlOrFail(body.url);
      if (!url) throw new HttpError(400, 'Falta el archivo o el link');
      const r = db.prepare('INSERT INTO attach(owner,owner_id,kind,title,url,ord) VALUES(?,?,?,?,?,?)')
        .run('ejemplo', String(id), kind, str(body.title, 120) || (kind === 'audio' ? 'Audio' : 'Captura'), url, nextOrd('attach'));
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && !sub) {
      must('ejemplos', id);
      db.prepare('UPDATE ejemplos SET data=? WHERE id=?').run(JSON.stringify(normEjemplo(body)), Number(id));
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) {
      must('ejemplos', id);
      const urls = db.prepare('SELECT url FROM attach WHERE owner=? AND owner_id=?').all('ejemplo', String(id)).map((a) => a.url);
      db.prepare('DELETE FROM attach WHERE owner=? AND owner_id=?').run('ejemplo', String(id));
      removeRow('ejemplos', id);
      for (const u of urls) await gcUpload(u);
      return ok(res);
    }
  }

  if (ent === 'attach' && M === 'DELETE' && id) {
    const row = must('attach', id);
    db.prepare('DELETE FROM attach WHERE id=?').run(Number(id));
    await gcUpload(row.url);
    return ok(res);
  }

  /* ---------- GUIONES POR CASO ---------- */
  if (ent === 'guiones') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: setOrder('guiones', body.ids) });
    if (M === 'POST' && !id) {
      const r = db.prepare('INSERT INTO guiones(ord,data) VALUES(?,?)').run(nextOrd('guiones'), JSON.stringify(normGuion(body)));
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && !sub) {
      must('guiones', id);
      db.prepare('UPDATE guiones SET data=? WHERE id=?').run(JSON.stringify(normGuion(body)), Number(id));
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { removeRow('guiones', id); return ok(res); }
  }

  /* ---------- INFORMACIÓN DEL NEGOCIO ---------- */
  if (ent === 'infos') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: setOrder('infos', body.ids) });
    if (M === 'POST' && !id) {
      const r = db.prepare('INSERT INTO infos(ord,data) VALUES(?,?)').run(nextOrd('infos'), JSON.stringify(normInfo(body)));
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && !sub) {
      must('infos', id);
      db.prepare('UPDATE infos SET data=? WHERE id=?').run(JSON.stringify(normInfo(body)), Number(id));
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { removeRow('infos', id); return ok(res); }
  }

  /* ---------- SOPORTE: DUDAS DE LA ASESORA ---------- */
  if (ent === 'dudas') {
    if (M === 'POST' && !id) {
      const r = db.prepare('INSERT INTO dudas(created,autor,texto,url,estado,respuesta) VALUES(?,?,?,?,?,?)')
        .run(new Date().toISOString(), str(body.autor, 60) || 'Vendedora', req(body.texto, 1500, 'la duda'), urlOrFail(body.url), 'abierta', '');
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && sub === 'estado') {
      must('dudas', id);
      db.prepare('UPDATE dudas SET estado=? WHERE id=?').run(oneOf(body.estado, ['abierta', 'resuelta'], 'abierta'), Number(id));
      return ok(res);
    }
    if (M === 'PUT' && id && sub === 'respuesta') {
      must('dudas', id);
      const resp = text(body.respuesta, 1500);
      db.prepare('UPDATE dudas SET respuesta=?, estado=? WHERE id=?')
        .run(resp, resp ? 'resuelta' : 'abierta', Number(id));
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      must('dudas', id);
      db.prepare('UPDATE dudas SET autor=?, texto=?, url=? WHERE id=?')
        .run(str(body.autor, 60) || 'Vendedora', req(body.texto, 1500, 'la duda'), urlOrFail(body.url), Number(id));
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) {
      const row = must('dudas', id);
      removeRow('dudas', id);
      await gcUpload(row.url);
      return ok(res);
    }
  }

  throw new HttpError(404, 'No encontrado');
}

const server = createServer(async (request, res) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  try {
    // /health también sirve para diagnosticar: si "arrancado" cambia a cada rato,
    // el contenedor se está reiniciando y con un volumen mal montado eso borra la base.
    if (path === '/health') {
      return json(res, 200, {
        ok: true,
        version: VERSION,
        baseCreada: meta('creada') || null,
        arrancado: ARRANQUE,
        segundosEnPie: Math.round(process.uptime()),
        requireData: REQUIRE_DATA,
        volumenPersistente: EN_CONTENEDOR ? !EFIMERO : null,
      });
    }
    if (path.startsWith('/api/')) return await api(request, res, path);
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(res, 405, { error: 'Método no permitido' });

    // Archivos subidos por el equipo (viven en el volumen persistente, junto a la base).
    if (path.startsWith('/uploads/')) {
      const name = basename(normalize(path));
      if (!/^[\w.-]+$/.test(name)) return json(res, 403, { error: 'Prohibido' });
      const buf = await readFile(join(UPLOADS, name));
      res.writeHead(200, {
        'content-type': MIME_BY_EXT[extname(name)] || 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      return res.end(request.method === 'HEAD' ? undefined : buf);
    }

    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^([/\\.]+)/, '');
    const file = join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'Prohibido' });
    const buf = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(request.method === 'HEAD' ? undefined : buf);
  } catch (err) {
    if (err instanceof HttpError) return json(res, err.code, { error: err.message });
    if (err?.code === 'ENOENT') return json(res, 404, { error: 'No encontrado' });
    console.error(err);
    json(res, 500, { error: 'Error del servidor' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NOVA Onboarding ${VERSION} en http://0.0.0.0:${PORT} · datos en ${DATA_DIR}`);
  if (BASE_NUEVA) {
    console.warn('[AVISO] No había base de datos en ' + DB_FILE + ': se ha creado una nueva con el contenido inicial.');
    console.warn('[AVISO] Si esperabas encontrar el contenido del equipo, el volumen persistente no está montado en ' + DATA_DIR + '.');
    console.warn('[AVISO] Cuando la app ya tenga contenido real, pon REQUIRE_DATA=1 para que no vuelva a arrancar vacía.');
  } else {
    console.log(`Base existente reutilizada (creada ${meta('creada') || '¿?'}), no se toca el contenido guardado.`);
  }
  if (!REQUIRE_DATA) console.warn('[AVISO] REQUIRE_DATA no está activado: si el volumen desaparece, la app arrancaría vacía sin avisar.');
  console.log('Contenido actual: ' + TABLAS.map((t) => `${t}=${count(t)}`).join(' '));
  const snap = snapshot('arranque');
  if (snap) console.log(`Instantánea de seguridad guardada: ${join(BACKUPS, snap)}`);
  // Una instantánea al día mientras el proceso siga vivo.
  setInterval(() => snapshot('diaria'), 24 * 60 * 60 * 1000).unref();
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
}
