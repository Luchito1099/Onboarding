import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, normalize, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { rutaEnMontaje } from './lib/volumen.js';
import { abrirDB } from './lib/db.js';

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
const VERSION = '2026-08-14-10';

/* ================= TIPOS DE ARCHIVO ================= */
const EXT = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a',
  'audio/aac': '.aac', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/webm': '.weba',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));
const mimePorExt = (name) => MIME_BY_EXT[extname(String(name)).toLowerCase()] || null;

/* ================= MOTOR DE DATOS ================= */
// PostgreSQL si hay variables de conexión (DB_* / DATABASE_URL / PG*); si no, SQLite local.
const E = process.env;
const PG_URL = E.DATABASE_URL || E.POSTGRES_URL || '';
const PG_HOST = E.PGHOST || E.POSTGRES_HOST || E.DB_HOST || '';
const MOTOR = (PG_URL || PG_HOST) ? 'postgres' : 'sqlite';
const PG_CFG = PG_URL
  ? { connectionString: PG_URL, connectionTimeoutMillis: 8000 }
  : {
    host: PG_HOST,
    port: Number(E.PGPORT || E.POSTGRES_PORT || E.DB_PORT || 5432),
    user: E.PGUSER || E.POSTGRES_USER || E.DB_USER || 'postgres',
    password: E.PGPASSWORD || E.POSTGRES_PASSWORD || E.DB_PASSWORD || '',
    database: E.PGDATABASE || E.POSTGRES_DB || E.DB_NAME || 'postgres',
    connectionTimeoutMillis: 8000,
    ssl: /^(1|true)$/i.test(E.PGSSL || E.DB_SSL || '') ? { rejectUnauthorized: false } : undefined,
  };

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOADS, { recursive: true });
mkdirSync(BACKUPS, { recursive: true });
const DB_FILE = join(DATA_DIR, 'nova.db');
const BASE_NUEVA = MOTOR === 'sqlite' && !existsSync(DB_FILE);

// ¿DATA_DIR está en un volumen montado o en el disco temporal del contenedor?
function enVolumenMontado(dir) {
  try {
    if (!existsSync('/proc/self/mountinfo')) return null; // fuera de Linux no se puede saber
    return rutaEnMontaje(readFileSync('/proc/self/mountinfo', 'utf8'), dir);
  } catch { return null; }
}
const EN_CONTENEDOR = existsSync('/.dockerenv');
const EFIMERO = EN_CONTENEDOR && enVolumenMontado(DATA_DIR) === false;

// Seguro para el modo SQLite: con REQUIRE_DATA=1 no se arranca sin la base.
if (MOTOR === 'sqlite' && REQUIRE_DATA && BASE_NUEVA) {
  console.error(`[FATAL] REQUIRE_DATA está activado y no existe ${DB_FILE}.`);
  console.error('[FATAL] Casi seguro que el volumen persistente no está montado en ' + DATA_DIR + '.');
  console.error('[FATAL] No se arranca para no crear una base vacía encima.');
  process.exit(1);
}
if (MOTOR === 'sqlite' && EFIMERO) {
  console.warn(`[AVISO] ${DATA_DIR} NO es un volumen persistente: lo que se guarde ahí se pierde en cada despliegue.`);
  console.warn('[AVISO] Solución: montar un volumen o configurar PostgreSQL (DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME).');
}

// Conexión (con reintentos en Postgres: la base puede tardar en levantar tras un deploy).
async function conectar() {
  if (MOTOR === 'sqlite') return abrirDB({ motor: 'sqlite', sqliteFile: DB_FILE, uploadsDir: UPLOADS, mimePorExt });
  let ultimo = null;
  for (let intento = 1; intento <= 15; intento++) {
    try {
      const db = await abrirDB({ motor: 'postgres', pg: PG_CFG });
      await db.query('SELECT 1');
      return db;
    } catch (err) {
      ultimo = err;
      console.warn(`[pg] intento ${intento}/15 fallido: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error('[FATAL] No se pudo conectar a PostgreSQL: ' + (ultimo && ultimo.message));
  console.error('[FATAL] Revisa DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME en las variables de entorno.');
  process.exit(1);
}
const db = await conectar();

/* ================= ESQUEMA ================= */
// Sin contenido de ejemplo: la app SIEMPRE empieza vacía y el equipo carga lo suyo.
const IDCOL = MOTOR === 'postgres' ? 'INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY' : 'INTEGER PRIMARY KEY';
await db.exec(`
CREATE TABLE IF NOT EXISTS tasks(
  id ${IDCOL}, ord INTEGER, data TEXT NOT NULL, done_on TEXT, archived_at TEXT);
CREATE TABLE IF NOT EXISTS videos(
  id ${IDCOL}, ord INTEGER, title TEXT, type TEXT, dur TEXT, guion TEXT, url TEXT DEFAULT '', archived_at TEXT);
CREATE TABLE IF NOT EXISTS checklist(
  id ${IDCOL}, ord INTEGER, day TEXT, item TEXT, done INTEGER DEFAULT 0, archived_at TEXT);
CREATE TABLE IF NOT EXISTS procesos(
  id ${IDCOL}, ord INTEGER, data TEXT NOT NULL, url TEXT DEFAULT '', archived_at TEXT);
CREATE TABLE IF NOT EXISTS products(
  id TEXT PRIMARY KEY, ord INTEGER, data TEXT NOT NULL, archived_at TEXT);
CREATE TABLE IF NOT EXISTS media(
  id ${IDCOL}, product_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT, url TEXT NOT NULL,
  nota TEXT DEFAULT '', ord INTEGER DEFAULT 0, archived_at TEXT);
CREATE TABLE IF NOT EXISTS ejemplos(
  id ${IDCOL}, ord INTEGER, data TEXT NOT NULL, archived_at TEXT);
CREATE TABLE IF NOT EXISTS attach(
  id ${IDCOL}, owner TEXT NOT NULL, owner_id TEXT NOT NULL, kind TEXT NOT NULL,
  title TEXT, url TEXT NOT NULL, ord INTEGER DEFAULT 0, archived_at TEXT);
CREATE TABLE IF NOT EXISTS infos(
  id ${IDCOL}, ord INTEGER, data TEXT NOT NULL, archived_at TEXT);
CREATE TABLE IF NOT EXISTS guiones(
  id ${IDCOL}, ord INTEGER, data TEXT NOT NULL, archived_at TEXT);
CREATE TABLE IF NOT EXISTS dudas(
  id ${IDCOL}, created TEXT, autor TEXT, texto TEXT, url TEXT DEFAULT '',
  estado TEXT DEFAULT 'abierta', respuesta TEXT DEFAULT '', archived_at TEXT);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
${MOTOR === 'postgres' ? 'CREATE TABLE IF NOT EXISTS nova_files(name TEXT PRIMARY KEY, mime TEXT, data BYTEA, at TEXT);' : ''}
`);

// Migraciones sobre bases que ya existían: sólo se AÑADEN columnas, nunca se quitan.
const addCol = async (t, col, def) => {
  if (!(await db.columnas(t)).includes(col)) await db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`);
};
await addCol('media', 'nota', "TEXT DEFAULT ''");
await addCol('media', 'ord', 'INTEGER DEFAULT 0');
for (const t of ['tasks', 'videos', 'checklist', 'procesos', 'products', 'media', 'ejemplos', 'attach', 'infos', 'guiones', 'dudas']) {
  await addCol(t, 'archived_at', 'TEXT');
}

const TABLAS = ['tasks', 'videos', 'checklist', 'procesos', 'products', 'media', 'ejemplos', 'attach', 'infos', 'guiones', 'dudas'];
const NUMERICAS = TABLAS.filter((t) => t !== 'products');

const q = async (sql, params) => (await db.query(sql, params)).rows;
const uno = async (sql, params) => (await q(sql, params))[0];
const count = async (t) => Number((await uno(`SELECT COUNT(*) AS c FROM ${t}`)).c);
const totalFilas = async () => {
  let n = 0;
  for (const t of TABLAS) n += await count(t);
  return n;
};

const meta = async (k) => (await uno('SELECT v FROM meta WHERE k=?', [k]))?.v;
const setMeta = (k, v) => db.query('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v', [k, String(v)]);

// En Postgres, tras insertar con ids explícitos (importación o restauración) hay que
// realinear las secuencias para que los próximos INSERT no choquen.
async function ajustarSecuencias() {
  if (MOTOR !== 'postgres') return;
  for (const t of NUMERICAS) {
    await db.query(`SELECT setval(pg_get_serial_sequence('${t}','id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
  }
}

/* ================= IMPORTACIÓN ÚNICA DESDE SQLITE ================= */
// Si Postgres está vacío y en el volumen quedó una base SQLite con contenido del equipo,
// se importa UNA sola vez para no perder nada. Nunca se importa contenido de ejemplo:
// se copia tal cual lo que hubiera.
async function importarDesdeSQLite() {
  if (MOTOR !== 'postgres' || await meta('importada_sqlite') || !existsSync(DB_FILE)) return;
  if (await totalFilas() > 0) { await setMeta('importada_sqlite', 'saltada-pg-con-datos'); return; }
  let vieja;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    vieja = new DatabaseSync(DB_FILE, { readOnly: true });
  } catch (err) {
    console.warn('[MIGRACIÓN] No se pudo abrir la base SQLite antigua:', err.message);
    return;
  }
  let filas = 0, archivos = 0;
  try {
    await db.tx(async (tq) => {
      for (const t of TABLAS) {
        let rows = [];
        try { rows = vieja.prepare(`SELECT * FROM ${t}`).all(); } catch { continue; }
        if (!rows.length) continue;
        const cols = (await db.columnas(t)).filter((c) => c in rows[0]);
        for (const r of rows) {
          await tq(
            `INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
            cols.map((c) => (r[c] === undefined ? null : r[c])),
          );
          filas += 1;
        }
      }
    });
    for (const name of await readdir(UPLOADS).catch(() => [])) {
      if (!/^[\w.-]+$/.test(name) || !mimePorExt(name)) continue;
      const data = await readFile(join(UPLOADS, name)).catch(() => null);
      if (data) { await db.files.put(name, mimePorExt(name), data); archivos += 1; }
    }
    await ajustarSecuencias();
    await setMeta('importada_sqlite', '1');
    console.log(`[MIGRACIÓN] Importados ${filas} registros y ${archivos} archivos desde la base SQLite del volumen.`);
  } catch (err) {
    console.error('[MIGRACIÓN] Falló la importación desde SQLite (Postgres queda vacío):', err.message);
  } finally {
    vieja.close();
  }
}
await importarDesdeSQLite();

if (!(await meta('creada'))) await setMeta('creada', new Date().toISOString());
const ARRANQUE = new Date().toISOString();
await setMeta('ultimo_arranque', ARRANQUE);
await setMeta('version', VERSION);

/* ================= ESTADO ================= */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

// Los procesos guardaban un solo video en la columna `url`; ahora viven en data.vids.
const procVids = (data, url) => {
  if (Array.isArray(data.vids)) return data.vids;
  return url ? [{ url, nota: '' }] : [];
};

async function getState() {
  const hoy = today();
  const media = await q('SELECT id,product_id,kind,title,url,nota,ord FROM media WHERE archived_at IS NULL ORDER BY ord, id');
  const att = await q('SELECT id,owner,owner_id,kind,title,url FROM attach WHERE archived_at IS NULL ORDER BY ord, id');
  const attachOf = (owner, id, kind) => att
    .filter((a) => a.owner === owner && a.owner_id === String(id) && a.kind === kind)
    .map(({ id: aid, kind: k, title, url }) => ({ id: aid, kind: k, title, url }));
  return {
    hoy,
    version: VERSION,
    motor: MOTOR,
    maxUploadMb: MAX_MB,
    baseCreada: await meta('creada') || null,
    arrancado: ARRANQUE,
    efimero: MOTOR === 'sqlite' ? EFIMERO : false,
    tasks: (await q('SELECT id,data,done_on FROM tasks WHERE archived_at IS NULL ORDER BY ord'))
      .map((r) => ({ id: r.id, ...JSON.parse(r.data), done: r.done_on === hoy })),
    videos: (await q('SELECT id,title,type,dur,guion,url FROM videos WHERE archived_at IS NULL ORDER BY ord'))
      .map((v, i) => ({ ...v, n: i + 1 })),
    checklist: (await q('SELECT id,ord,day,item,done FROM checklist WHERE archived_at IS NULL ORDER BY ord'))
      .reduce((acc, r) => {
        let g = acc.find((x) => x.day === r.day);
        if (!g) acc.push((g = { day: r.day, items: [] }));
        g.items.push({ id: r.id, text: r.item, done: !!r.done });
        return acc;
      }, []),
    procesos: (await q('SELECT id,data,url FROM procesos WHERE archived_at IS NULL ORDER BY ord'))
      .map((r) => {
        const data = JSON.parse(r.data);
        return { id: r.id, ...data, vids: procVids(data, r.url) };
      }),
    products: (await q('SELECT id,data FROM products WHERE archived_at IS NULL ORDER BY ord'))
      .map((r) => ({
        ...JSON.parse(r.data),
        id: r.id,
        media: {
          images: media.filter((m) => m.product_id === r.id && m.kind === 'image'),
          videos: media.filter((m) => m.product_id === r.id && m.kind === 'video'),
        },
      })),
    ejemplos: (await q('SELECT id,data FROM ejemplos WHERE archived_at IS NULL ORDER BY ord'))
      .map((r) => ({
        id: r.id,
        ...JSON.parse(r.data),
        media: { images: attachOf('ejemplo', r.id, 'image'), audios: attachOf('ejemplo', r.id, 'audio') },
      })),
    infos: (await q('SELECT id,data FROM infos WHERE archived_at IS NULL ORDER BY ord'))
      .map((r) => ({ id: r.id, ...JSON.parse(r.data) })),
    guiones: (await q('SELECT id,data FROM guiones WHERE archived_at IS NULL ORDER BY ord'))
      .map((r) => ({ id: r.id, ...JSON.parse(r.data) })),
    dudas: await q('SELECT id,created,autor,texto,url,estado,respuesta FROM dudas WHERE archived_at IS NULL ORDER BY id DESC'),
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

// Qué hacer según cómo salga: mismo formato en tareas y en procesos.
const outcomes = (v) => objList(v, 12, (o) => {
  const t = str(o?.t, 200), r = text(o?.r, 900);
  return t || r ? { k: oneOf(o?.k, ['ok', 'warn', 'bad'], 'ok'), t, r } : null;
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
    const q2 = str(p?.q, 60), pr = str(p?.p, 40);
    return q2 || pr ? { q: q2, p: pr, ...(p?.best ? { best: true } : {}) } : null;
  }),
  beneficios: strList(b.beneficios, 25, 200),
  specs: objList(b.specs, 25, (s) => {
    const k = str(s?.k, 60), v = str(s?.v, 240);
    return k || v ? { k, v } : null;
  }),
  objeciones: objList(b.objeciones, 25, (o) => {
    const q2 = str(o?.o, 200), r = text(o?.r, 900);
    return q2 || r ? { o: q2, r } : null;
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
    const q2 = text(x?.q, 300), r = text(x?.r, 2000), nota = text(x?.nota, 400);
    return q2 || r ? { q: q2, r, nota } : null;
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
const idVal = (t, id) => (t === 'products' ? String(id) : Number(id));
const nextOrd = async (t) => Number((await uno(`SELECT COALESCE(MAX(ord),-1)+1 AS n FROM ${t}`)).n);

const must = async (t, id) => {
  const row = await uno(`SELECT * FROM ${t} WHERE id=?`, [idVal(t, id)]);
  if (!row) throw new HttpError(404, 'No existe');
  return row;
};

// No existe eliminar directo: primero SIEMPRE se archiva. Desde el archivo se
// puede restaurar o, ahí sí, eliminar definitivamente.
async function archivar(t, id) {
  const row = await must(t, id);
  if (row.archived_at) throw new HttpError(400, 'Ya está en el archivo');
  await db.query(`UPDATE ${t} SET archived_at=? WHERE id=?`, [new Date().toISOString(), idVal(t, id)]);
  return row;
}

// Guarda el orden que llega desde el arrastre: la posición en el array es el nuevo `ord`.
async function setOrder(t, ids, isText) {
  const list = (Array.isArray(ids) ? ids : []).slice(0, 500);
  if (!list.length) throw new HttpError(400, 'Orden vacío');
  for (let i = 0; i < list.length; i++) {
    await db.query(`UPDATE ${t} SET ord=? WHERE id=?`, [i, isText ? String(list[i]) : Number(list[i])]);
  }
  return list.length;
}

// El checklist se reordena dentro de un día sin mover los demás grupos de sitio.
async function setChecklistOrder(ids) {
  const wanted = (Array.isArray(ids) ? ids : []).map(Number);
  if (!wanted.length) throw new HttpError(400, 'Orden vacío');
  const rows = await q('SELECT id, day FROM checklist WHERE archived_at IS NULL ORDER BY ord');
  const day = rows.find((r) => r.id === wanted[0])?.day;
  if (day === undefined) throw new HttpError(404, 'No existe');
  const queue = wanted.filter((id) => rows.some((r) => r.id === id && r.day === day));
  const final = rows.map((r) => (r.day === day ? queue.shift() ?? r.id : r.id));
  return setOrder('checklist', final);
}

// El runbook siempre se muestra en orden cronológico: el `ord` se recalcula por hora.
async function reorderTasksByTime() {
  const rows = (await q('SELECT id, data FROM tasks WHERE archived_at IS NULL'))
    .map((r) => ({ id: r.id, time: JSON.parse(r.data).time || '00:00' }))
    .sort((a, b) => a.time.localeCompare(b.time) || a.id - b.id);
  for (let i = 0; i < rows.length; i++) await db.query('UPDATE tasks SET ord=? WHERE id=?', [i, rows[i].id]);
}

const slug = (s) => str(s, 60).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'producto';
const freeId = async (base) => {
  let id = base, n = 2;
  while (await uno('SELECT 1 AS x FROM products WHERE id=?', [id])) id = `${base}-${n++}`;
  return id;
};

/* ================= ARCHIVOS SUBIDOS ================= */
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
  await db.files.put(name, type, buf);
  const kind = type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : 'video';
  return json(res, 201, { url: '/uploads/' + name, kind, size: buf.length });
}

// Un mismo archivo puede estar reutilizado en varios sitios (incluido el archivo de borrados):
// sólo se elimina del almacén cuando no queda NINGUNA referencia.
const REF_COLS = [['videos', 'url'], ['media', 'url'], ['attach', 'url'], ['dudas', 'url']];
const REF_JSON = ['procesos', 'tasks', 'products'];
async function urlEnUso(url) {
  for (const [t, col] of REF_COLS) {
    if (await uno(`SELECT 1 AS x FROM ${t} WHERE ${col}=? LIMIT 1`, [url])) return true;
  }
  const like = MOTOR === 'postgres' ? 'POSITION(? IN data) > 0' : 'instr(data, ?) > 0';
  for (const t of REF_JSON) {
    if (await uno(`SELECT 1 AS x FROM ${t} WHERE ${like} LIMIT 1`, [url])) return true;
  }
  return false;
}
// Llamar SIEMPRE después de haber quitado la referencia en la base.
const gcUpload = async (url) => {
  const m = /^\/uploads\/([\w.-]+)$/.exec(String(url || ''));
  if (!m || await urlEnUso(url)) return;
  await db.files.del(basename(m[1]));
};

async function listarBiblioteca() {
  const files = (await db.files.list()).slice(0, 300);
  const out = [];
  for (const f of files) {
    const url = '/uploads/' + f.name;
    out.push({
      url,
      kind: f.mime.startsWith('image/') ? 'image' : f.mime.startsWith('audio/') ? 'audio' : 'video',
      size: f.size,
      at: f.at,
      enUso: await urlEnUso(url),
    });
  }
  return out;
}

/* ================= ZIP ================= */
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
  const p = await must('products', id);
  const nombre = JSON.parse(p.data).name || id;
  const rows = (await q('SELECT kind,title,url,ord FROM media WHERE product_id=? AND archived_at IS NULL ORDER BY ord, id', [id]))
    .filter((m) => /^\/uploads\/[\w.-]+$/.test(m.url));
  if (!rows.length) throw new HttpError(404, 'Este producto no tiene archivos subidos a este servidor (los links externos no se pueden empaquetar)');
  const entries = [];
  let n = 0;
  for (const m of rows) {
    const f = await db.files.get(basename(m.url));
    if (!f) continue;
    n += 1;
    entries.push({ name: `${String(n).padStart(2, '0')}-${sinAcentos(m.title) || m.kind}${extname(m.url)}`, data: f.data });
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
const backupJSON = async () => {
  const out = { app: 'nova-onboarding', version: VERSION, fecha: new Date().toISOString(), tablas: {} };
  for (const t of TABLAS) out.tablas[t] = await q(`SELECT * FROM ${t}`);
  return out;
};

async function restaurar(b) {
  if (!b || typeof b !== 'object' || !b.tablas) throw new HttpError(400, 'El archivo no parece una copia de esta app');
  await db.tx(async (tq) => {
    for (const t of TABLAS) {
      await tq(`DELETE FROM ${t}`);
      const rows = Array.isArray(b.tablas[t]) ? b.tablas[t] : [];
      if (!rows.length) continue;
      const cols = (await db.columnas(t)).filter((c) => c in rows[0]);
      for (const r of rows) {
        await tq(
          `INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`,
          cols.map((c) => (r[c] === undefined ? null : r[c])),
        );
      }
    }
  });
  await ajustarSecuencias();
}

// Instantáneas automáticas en disco: protegen de borrados y restauraciones equivocadas.
// La fuente de verdad es la base (Postgres en producción); esto es un colchón extra.
async function snapshot(motivo) {
  try {
    if (!(await totalFilas())) return null;
    const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `${sello}-${motivo}.json`;
    writeFileSync(join(BACKUPS, name), JSON.stringify(await backupJSON()));
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

// Lector de ZIP mínimo, para poder restaurar una copia completa (contenido + archivos).
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

/* ================= ARCHIVO (borrado en dos pasos) ================= */
const ARCH = {
  tasks: { tipo: 'Tarea del runbook', titulo: (r) => JSON.parse(r.data).title },
  videos: { tipo: 'Video de onboarding', titulo: (r) => r.title },
  checklist: { tipo: 'Ítem del checklist', titulo: (r) => `${r.day} · ${r.item}` },
  procesos: { tipo: 'Proceso', titulo: (r) => JSON.parse(r.data).name },
  products: { tipo: 'Producto', titulo: (r) => JSON.parse(r.data).name },
  ejemplos: { tipo: 'Ejemplo', titulo: (r) => JSON.parse(r.data).title },
  infos: { tipo: 'Información del negocio', titulo: (r) => JSON.parse(r.data).title },
  guiones: { tipo: 'Guion', titulo: (r) => JSON.parse(r.data).title },
  dudas: { tipo: 'Duda de soporte', titulo: (r) => String(r.texto || '').slice(0, 90) },
  media: { tipo: 'Archivo de producto', titulo: (r) => r.title },
  attach: { tipo: 'Adjunto de ejemplo', titulo: (r) => r.title },
};

async function listarArchivo() {
  const out = [];
  for (const [t, def] of Object.entries(ARCH)) {
    for (const r of await q(`SELECT * FROM ${t} WHERE archived_at IS NOT NULL`)) {
      let titulo = '';
      try { titulo = def.titulo(r) || ''; } catch { titulo = ''; }
      out.push({ ent: t, id: r.id, tipo: def.tipo, titulo: String(titulo).slice(0, 120), fecha: r.archived_at });
    }
  }
  return out.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

// Eliminar definitivo: SÓLO sobre algo ya archivado, con limpieza de sus archivos.
async function eliminarDefinitivo(t, id) {
  if (!ARCH[t]) throw new HttpError(404, 'No existe');
  const row = await must(t, id);
  if (!row.archived_at) throw new HttpError(400, 'Primero archívalo: sólo se elimina definitivamente desde el archivo');
  const urls = [];
  if (t === 'videos' || t === 'media' || t === 'attach' || t === 'dudas') urls.push(row.url);
  if (t === 'tasks') urls.push(JSON.parse(row.data).url);
  if (t === 'procesos') {
    const data = JSON.parse(row.data);
    for (const v of procVids(data, row.url)) urls.push(v.url);
  }
  if (t === 'products') {
    const data = JSON.parse(row.data);
    urls.push(data.difUrl);
    for (const m of await q('SELECT url FROM media WHERE product_id=?', [row.id])) urls.push(m.url);
    await db.query('DELETE FROM media WHERE product_id=?', [row.id]);
  }
  if (t === 'ejemplos') {
    for (const a of await q('SELECT url FROM attach WHERE owner=? AND owner_id=?', ['ejemplo', String(row.id)])) urls.push(a.url);
    await db.query('DELETE FROM attach WHERE owner=? AND owner_id=?', ['ejemplo', String(row.id)]);
  }
  await db.query(`DELETE FROM ${t} WHERE id=?`, [idVal(t, id)]);
  for (const u of urls) await gcUpload(u);
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
const archivado = (res) => json(res, 200, { ok: true, archivado: true });

async function api(request, res, path) {
  const seg = path.split('/').filter(Boolean).slice(1); // sin 'api'
  const [ent, id, sub] = seg;
  const M = request.method;

  if (ent === 'uploads' && M === 'POST') return handleUpload(request, res);
  // Biblioteca interna: todo lo que ya se subió, para reutilizarlo sin volver a subirlo.
  if (ent === 'library' && M === 'GET' && !id) return json(res, 200, { files: await listarBiblioteca() });

  /* ---------- PRUEBA DE CONEXIÓN A POSTGRES ---------- */
  // Sólo comprueba que se puede conectar; admite ?host=&port=… para probar otro destino.
  if (ent === 'pgtest' && M === 'GET') {
    const sp = new URL(request.url, 'http://x').searchParams;
    const ov = (k) => sp.get(k) || '';
    const cs = ov('url') || PG_URL;
    const host = ov('host') || PG_HOST;
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
    const client = new pg.Client(cs && !ov('host') ? {
      connectionString: cs,
      connectionTimeoutMillis: 6000,
    } : {
      host,
      port: Number(ov('port') || PG_CFG.port || 5432),
      user: ov('user') || PG_CFG.user || 'postgres',
      password: ov('password') || PG_CFG.password || '',
      database: ov('database') || PG_CFG.database || 'postgres',
      connectionTimeoutMillis: 6000,
      ssl: /^(1|true)$/i.test(ov('ssl')) ? { rejectUnauthorized: false } : PG_CFG.ssl,
    });
    try {
      await client.connect();
      const r = await client.query('SELECT version() AS v, current_database() AS db');
      return json(res, 200, {
        ok: true, configurado: true, ms: Date.now() - t0,
        base: r.rows[0].db,
        version: String(r.rows[0].v).split(' on ')[0],
        motorActual: MOTOR,
      });
    } catch (err) {
      return json(res, 200, { ok: false, configurado: true, ms: Date.now() - t0, error: String(err.message || err) });
    } finally {
      client.end().catch(() => {});
    }
  }

  /* ---------- COPIA DE SEGURIDAD ---------- */
  if (ent === 'backup' && M === 'GET') {
    const datos = await backupJSON();
    if (id === 'zip') {
      const entries = [{ name: 'contenido.json', data: Buffer.from(JSON.stringify(datos, null, 2), 'utf8') }];
      for (const f of await db.files.list()) {
        const file = await db.files.get(f.name);
        if (file) entries.push({ name: 'uploads/' + f.name, data: file.data });
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
    const previa = await snapshot('antes-de-restaurar');

    // Restaurar una instantánea del propio servidor: { "snapshot": "…json" }
    if (tipo === 'application/json') {
      let posible = null;
      try { posible = JSON.parse(raw.toString('utf8')); } catch { /* se valida abajo */ }
      if (posible && typeof posible.snapshot === 'string') {
        const name = basename(posible.snapshot);
        if (!/^[\w.-]+\.json$/.test(name) || !existsSync(join(BACKUPS, name))) throw new HttpError(404, 'No existe esa instantánea');
        await restaurar(JSON.parse(readFileSync(join(BACKUPS, name), 'utf8')));
        return json(res, 200, { ok: true, archivos: 0, previa });
      }
    }

    if (tipo === 'application/zip' || raw.readUInt32LE(0) === 0x04034b50) {
      const files = unzip(raw);
      const contenido = files['contenido.json'];
      if (!contenido) throw new HttpError(400, 'El ZIP no trae contenido.json');
      await restaurar(JSON.parse(contenido.toString('utf8')));
      for (const [name, data] of Object.entries(files)) {
        if (!name.startsWith('uploads/')) continue;
        const base = basename(name);
        if (!/^[\w.-]+$/.test(base) || !mimePorExt(base)) continue;
        await db.files.put(base, mimePorExt(base), data);
        restaurados += 1;
      }
    } else {
      await restaurar(JSON.parse(raw.toString('utf8')));
    }
    return json(res, 200, { ok: true, archivos: restaurados, previa });
  }

  /* ---------- ARCHIVO: restaurar o eliminar definitivamente ---------- */
  if (ent === 'archivo') {
    if (M === 'GET' && !id) return json(res, 200, { archivo: await listarArchivo() });
    if (!ARCH[id]) throw new HttpError(404, 'No existe');
    if (M === 'POST' && sub && seg[3] === 'restaurar') {
      const row = await must(id, sub);
      if (!row.archived_at) throw new HttpError(400, 'No está archivado');
      await db.query(`UPDATE ${id} SET archived_at=NULL WHERE id=?`, [idVal(id, sub)]);
      if (id === 'tasks') await reorderTasksByTime();
      return ok(res);
    }
    if (M === 'DELETE' && sub && !seg[3]) {
      await eliminarDefinitivo(id, sub);
      return ok(res);
    }
  }

  const body = M === 'GET' ? {} : await readBody(request);

  if (M === 'GET' && ent === 'state' && !id) return json(res, 200, await getState());

  /* ---------- TAREAS DEL RUNBOOK ---------- */
  if (ent === 'tasks') {
    if (M === 'POST' && !id) {
      const r = await db.query('INSERT INTO tasks(ord,data) VALUES(?,?) RETURNING id', [await nextOrd('tasks'), JSON.stringify(normTask(body))]);
      await reorderTasksByTime();
      return json(res, 201, { id: Number(r.rows[0].id) });
    }
    if (M === 'PUT' && id && sub === 'done') {
      await must('tasks', id);
      await db.query('UPDATE tasks SET done_on=? WHERE id=?', [body.done ? today() : null, Number(id)]);
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      const old = JSON.parse((await must('tasks', id)).data);
      await db.query('UPDATE tasks SET data=? WHERE id=?', [JSON.stringify(normTask(body)), Number(id)]);
      await reorderTasksByTime();
      await gcUpload(old.url);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { await archivar('tasks', id); return archivado(res); }
  }

  /* ---------- VIDEOS DE ONBOARDING ---------- */
  if (ent === 'videos') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: await setOrder('videos', body.ids) });
    // Vaciar la sección entera de una vez: también pasa por el archivo, no se destruye nada.
    if (M === 'POST' && id === 'vaciar') {
      const r = await db.query('UPDATE videos SET archived_at=? WHERE archived_at IS NULL', [new Date().toISOString()]);
      return json(res, 200, { ok: true, borrados: r.rowCount });
    }
    if (M === 'POST' && !id) {
      const v = normVideo(body);
      const r = await db.query('INSERT INTO videos(ord,title,type,dur,guion,url) VALUES(?,?,?,?,?,?) RETURNING id',
        [await nextOrd('videos'), v.title, v.type, v.dur, v.guion, v.url]);
      return json(res, 201, { id: Number(r.rows[0].id) });
    }
    if (M === 'PUT' && id && sub === 'url') {
      const old = await must('videos', id);
      const url = urlOrFail(body.url);
      await db.query('UPDATE videos SET url=? WHERE id=?', [url, Number(id)]);
      if (old.url !== url) await gcUpload(old.url);
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      const old = await must('videos', id);
      const v = normVideo(body);
      await db.query('UPDATE videos SET title=?,type=?,dur=?,guion=?,url=? WHERE id=?',
        [v.title, v.type, v.dur, v.guion, v.url, Number(id)]);
      if (old.url !== v.url) await gcUpload(old.url);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { await archivar('videos', id); return archivado(res); }
  }

  /* ---------- CHECKLIST ---------- */
  if (ent === 'checklist') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: await setChecklistOrder(body.ids) });
    if (M === 'POST' && id === 'vaciar') {
      const r = await db.query('UPDATE checklist SET archived_at=? WHERE archived_at IS NULL', [new Date().toISOString()]);
      return json(res, 200, { ok: true, borrados: r.rowCount });
    }
    if (M === 'POST' && !id) {
      const c = normCheck(body);
      // El ítem nuevo entra al final de su día; si el día no existe, al final de todo.
      const last = (await uno('SELECT MAX(ord) AS m FROM checklist WHERE day=? AND archived_at IS NULL', [c.day]))?.m;
      let ord;
      if (last === null || last === undefined) {
        ord = await nextOrd('checklist');
      } else {
        ord = Number(last) + 1;
        await db.query('UPDATE checklist SET ord = ord + 1 WHERE ord >= ?', [ord]);
      }
      const r = await db.query('INSERT INTO checklist(ord,day,item) VALUES(?,?,?) RETURNING id', [ord, c.day, c.item]);
      return json(res, 201, { id: Number(r.rows[0].id) });
    }
    if (M === 'PUT' && id && sub === 'done') {
      await must('checklist', id);
      await db.query('UPDATE checklist SET done=? WHERE id=?', [body.done ? 1 : 0, Number(id)]);
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      await must('checklist', id);
      const c = normCheck(body);
      await db.query('UPDATE checklist SET day=?, item=? WHERE id=?', [c.day, c.item, Number(id)]);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { await archivar('checklist', id); return archivado(res); }
  }

  /* ---------- PROCESOS ---------- */
  if (ent === 'procesos') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: await setOrder('procesos', body.ids) });
    if (M === 'POST' && !id) {
      const p = normProceso(body);
      const r = await db.query('INSERT INTO procesos(ord,data,url) VALUES(?,?,?) RETURNING id',
        [await nextOrd('procesos'), JSON.stringify(p), p.vids[0]?.url || '']);
      return json(res, 201, { id: Number(r.rows[0].id) });
    }
    // Guardado rápido de un video suelto (1 o 2) sin abrir el editor completo.
    if (M === 'PUT' && id && sub === 'video') {
      const row = await must('procesos', id);
      const data = JSON.parse(row.data);
      const vids = procVids(data, row.url);
      const n = Number(body.n) === 2 ? 1 : 0;
      const url = urlOrFail(body.url);
      while (vids.length < n) vids.push({ url: '', nota: '' });
      const old = vids[n]?.url;
      const next = { url, nota: text(body.nota, 400) };
      if (n < vids.length) vids[n] = next; else vids.push(next);
      data.vids = trimVids(vids);
      await db.query('UPDATE procesos SET data=?, url=? WHERE id=?',
        [JSON.stringify(data), data.vids[0]?.url || '', Number(id)]);
      if (old && old !== url) await gcUpload(old);
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      const row = await must('procesos', id);
      const antes = procVids(JSON.parse(row.data), row.url).map((v) => v.url);
      const p = normProceso(body);
      await db.query('UPDATE procesos SET data=?, url=? WHERE id=?',
        [JSON.stringify(p), p.vids[0]?.url || '', Number(id)]);
      for (const u of antes) await gcUpload(u);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { await archivar('procesos', id); return archivado(res); }
  }

  /* ---------- PRODUCTOS + MEDIA ---------- */
  if (ent === 'products') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: await setOrder('products', body.ids, true) });
    if (M === 'POST' && !id) {
      const p = normProducto(body);
      const newId = await freeId(slug(p.name));
      await db.query('INSERT INTO products(id,ord,data) VALUES(?,?,?)', [newId, await nextOrd('products'), JSON.stringify(p)]);
      return json(res, 201, { id: newId });
    }
    if (M === 'GET' && id && sub === 'zip') return zipProducto(res, id);
    if (M === 'POST' && id && sub === 'media') {
      await must('products', id);
      const url = urlOrFail(body.url);
      if (!url) throw new HttpError(400, 'Link inválido');
      const kind = body.kind === 'video' ? 'video' : 'image';
      const ord = Number((await uno('SELECT COALESCE(MAX(ord),-1)+1 AS n FROM media WHERE product_id=?', [id])).n);
      const r = await db.query('INSERT INTO media(product_id,kind,title,url,nota,ord) VALUES(?,?,?,?,?,?) RETURNING id',
        [id, kind, str(body.title, 120) || (kind === 'video' ? 'Video' : 'Imagen'), url, text(body.nota, 400), ord]);
      return json(res, 201, { id: Number(r.rows[0].id) });
    }
    if (M === 'PUT' && id && sub === 'media' && seg[3] === 'order') {
      await must('products', id);
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number);
      if (!ids.length) throw new HttpError(400, 'Orden vacío');
      for (let i = 0; i < ids.length; i++) {
        await db.query('UPDATE media SET ord=? WHERE id=? AND product_id=?', [i, ids[i], id]);
      }
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      const antes = JSON.parse((await must('products', id)).data).difUrl;
      await db.query('UPDATE products SET data=? WHERE id=?', [JSON.stringify(normProducto(body)), id]);
      await gcUpload(antes);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { await archivar('products', id); return archivado(res); }
  }

  if (ent === 'media' && id) {
    if (M === 'PUT' && !sub) {
      const row = await must('media', id);
      await db.query('UPDATE media SET title=?, nota=? WHERE id=?',
        [str(body.title, 120) || (row.kind === 'video' ? 'Video' : 'Imagen'), text(body.nota, 400), Number(id)]);
      return ok(res);
    }
    if (M === 'DELETE' && !sub) { await archivar('media', id); return archivado(res); }
  }

  /* ---------- EJEMPLOS REALES ---------- */
  if (ent === 'ejemplos') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: await setOrder('ejemplos', body.ids) });
    if (M === 'POST' && !id) {
      const r = await db.query('INSERT INTO ejemplos(ord,data) VALUES(?,?) RETURNING id',
        [await nextOrd('ejemplos'), JSON.stringify(normEjemplo(body))]);
      return json(res, 201, { id: Number(r.rows[0].id) });
    }
    // Capturas de conversación y audios de la llamada.
    if (M === 'POST' && id && sub === 'attach') {
      await must('ejemplos', id);
      const kind = oneOf(body.kind, ['image', 'audio'], 'image');
      const url = urlOrFail(body.url);
      if (!url) throw new HttpError(400, 'Falta el archivo o el link');
      const r = await db.query('INSERT INTO attach(owner,owner_id,kind,title,url,ord) VALUES(?,?,?,?,?,?) RETURNING id',
        ['ejemplo', String(id), kind, str(body.title, 120) || (kind === 'audio' ? 'Audio' : 'Captura'), url, await nextOrd('attach')]);
      return json(res, 201, { id: Number(r.rows[0].id) });
    }
    if (M === 'PUT' && id && !sub) {
      await must('ejemplos', id);
      await db.query('UPDATE ejemplos SET data=? WHERE id=?', [JSON.stringify(normEjemplo(body)), Number(id)]);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { await archivar('ejemplos', id); return archivado(res); }
  }

  if (ent === 'attach' && M === 'DELETE' && id) { await archivar('attach', id); return archivado(res); }

  /* ---------- GUIONES POR CASO ---------- */
  if (ent === 'guiones') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: await setOrder('guiones', body.ids) });
    if (M === 'POST' && !id) {
      const r = await db.query('INSERT INTO guiones(ord,data) VALUES(?,?) RETURNING id',
        [await nextOrd('guiones'), JSON.stringify(normGuion(body))]);
      return json(res, 201, { id: Number(r.rows[0].id) });
    }
    if (M === 'PUT' && id && !sub) {
      await must('guiones', id);
      await db.query('UPDATE guiones SET data=? WHERE id=?', [JSON.stringify(normGuion(body)), Number(id)]);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { await archivar('guiones', id); return archivado(res); }
  }

  /* ---------- INFORMACIÓN DEL NEGOCIO ---------- */
  if (ent === 'infos') {
    if (M === 'PUT' && id === 'order') return json(res, 200, { n: await setOrder('infos', body.ids) });
    if (M === 'POST' && !id) {
      const r = await db.query('INSERT INTO infos(ord,data) VALUES(?,?) RETURNING id',
        [await nextOrd('infos'), JSON.stringify(normInfo(body))]);
      return json(res, 201, { id: Number(r.rows[0].id) });
    }
    if (M === 'PUT' && id && !sub) {
      await must('infos', id);
      await db.query('UPDATE infos SET data=? WHERE id=?', [JSON.stringify(normInfo(body)), Number(id)]);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { await archivar('infos', id); return archivado(res); }
  }

  /* ---------- SOPORTE: DUDAS DE LA ASESORA ---------- */
  if (ent === 'dudas') {
    if (M === 'POST' && !id) {
      const r = await db.query('INSERT INTO dudas(created,autor,texto,url,estado,respuesta) VALUES(?,?,?,?,?,?) RETURNING id',
        [new Date().toISOString(), str(body.autor, 60) || 'Vendedora', req(body.texto, 1500, 'la duda'), urlOrFail(body.url), 'abierta', '']);
      return json(res, 201, { id: Number(r.rows[0].id) });
    }
    if (M === 'PUT' && id && sub === 'estado') {
      await must('dudas', id);
      await db.query('UPDATE dudas SET estado=? WHERE id=?', [oneOf(body.estado, ['abierta', 'resuelta'], 'abierta'), Number(id)]);
      return ok(res);
    }
    if (M === 'PUT' && id && sub === 'respuesta') {
      await must('dudas', id);
      const resp = text(body.respuesta, 1500);
      await db.query('UPDATE dudas SET respuesta=?, estado=? WHERE id=?',
        [resp, resp ? 'resuelta' : 'abierta', Number(id)]);
      return ok(res);
    }
    if (M === 'PUT' && id && !sub) {
      await must('dudas', id);
      await db.query('UPDATE dudas SET autor=?, texto=?, url=? WHERE id=?',
        [str(body.autor, 60) || 'Vendedora', req(body.texto, 1500, 'la duda'), urlOrFail(body.url), Number(id)]);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { await archivar('dudas', id); return archivado(res); }
  }

  throw new HttpError(404, 'No encontrado');
}

const server = createServer(async (request, res) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  try {
    // /health también sirve para diagnosticar: si "arrancado" cambia a cada rato,
    // el contenedor se está reiniciando solo.
    if (path === '/health') {
      return json(res, 200, {
        ok: true,
        version: VERSION,
        motor: MOTOR,
        baseCreada: await meta('creada') || null,
        arrancado: ARRANQUE,
        segundosEnPie: Math.round(process.uptime()),
        requireData: REQUIRE_DATA,
        volumenPersistente: EN_CONTENEDOR ? !EFIMERO : null,
      });
    }
    if (path.startsWith('/api/')) return await api(request, res, path);
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(res, 405, { error: 'Método no permitido' });

    // Archivos subidos por el equipo (en Postgres viven dentro de la base).
    if (path.startsWith('/uploads/')) {
      const name = basename(normalize(path));
      if (!/^[\w.-]+$/.test(name)) return json(res, 403, { error: 'Prohibido' });
      const f = await db.files.get(name);
      if (!f) return json(res, 404, { error: 'No encontrado' });
      res.writeHead(200, {
        'content-type': f.mime || 'application/octet-stream',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      return res.end(request.method === 'HEAD' ? undefined : f.data);
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

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`NOVA Onboarding ${VERSION} en http://0.0.0.0:${PORT} · motor: ${MOTOR}${MOTOR === 'sqlite' ? ` · datos en ${DATA_DIR}` : ` · base ${PG_CFG.database || '(url)'}`}`);
  if (MOTOR === 'postgres') {
    console.log('El contenido y los archivos viven en PostgreSQL: los despliegues no tocan los datos.');
  } else if (BASE_NUEVA) {
    console.warn('[AVISO] No había base de datos: se ha creado una nueva VACÍA (esta app no trae contenido de ejemplo).');
  } else {
    console.log(`Base existente reutilizada (creada ${await meta('creada') || '¿?'}), no se toca el contenido guardado.`);
  }
  console.log('Contenido actual: ' + (await Promise.all(TABLAS.map(async (t) => `${t}=${await count(t)}`))).join(' '));
  const snap = await snapshot('arranque');
  if (snap) console.log(`Instantánea de seguridad guardada: ${join(BACKUPS, snap)}`);
  // Una instantánea al día mientras el proceso siga vivo.
  setInterval(() => { snapshot('diaria'); }, 24 * 60 * 60 * 1000).unref();
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => { Promise.resolve(db.close()).finally(() => process.exit(0)); }));
}
