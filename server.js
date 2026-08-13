import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { TASKS, VIDEOS, CHECKLIST, PROCESOS, PRODUCTS, EJEMPLOS } from './seed.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
const TZ = process.env.TZ_APP || 'America/Lima';
const VERSION = '2026-08-13-3';

/* ================= DB ================= */
mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'nova.db'));
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
`);

const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
const seed = (t, sql, rows) => {
  if (count(t)) return;
  const st = db.prepare(sql);
  rows.forEach((args) => st.run(...args));
};
seed('tasks', 'INSERT INTO tasks(ord,data) VALUES(?,?)', TASKS.map((t, i) => [i, JSON.stringify(t)]));
seed('videos', 'INSERT INTO videos(ord,title,type,dur,guion) VALUES(?,?,?,?,?)', VIDEOS.map((v, i) => [i, v.title, v.type, v.dur, v.guion]));
seed('checklist', 'INSERT INTO checklist(ord,day,item) VALUES(?,?,?)', CHECKLIST.flatMap((g, i) => g.items.map((it, j) => [i * 100 + j, g.day, it])));
seed('procesos', 'INSERT INTO procesos(ord,data) VALUES(?,?)', PROCESOS.map((p, i) => [i, JSON.stringify(p)]));
seed('products', 'INSERT INTO products(id,ord,data) VALUES(?,?,?)', PRODUCTS.map((p, i) => [p.id, i, JSON.stringify(p)]));
seed('ejemplos', 'INSERT INTO ejemplos(ord,data) VALUES(?,?)', EJEMPLOS.map((e, i) => [i, JSON.stringify(e)]));

/* ================= ESTADO ================= */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

function getState() {
  const hoy = today();
  const media = db.prepare('SELECT id,product_id,kind,title,url FROM media ORDER BY id').all();
  return {
    hoy,
    version: VERSION,
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
      .map((r) => ({ id: r.id, ...JSON.parse(r.data), url: r.url || '' })),
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
      .map((r) => ({ id: r.id, ...JSON.parse(r.data) })),
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

// Sólo se aceptan links http(s); el front decide cómo incrustarlos (YouTube => iframe).
const cleanUrl = (u) => {
  const s = String(u ?? '').trim();
  if (!s) return '';
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
  tips: tips(b.tips),
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

const normProceso = (b) => ({
  name: req(b.name, 160, 'el nombre'),
  when: str(b.when, 120),
  steps: strList(b.steps, 30, 300),
  tips: tips(b.tips),
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

// Sube o baja una fila intercambiando el `ord` con su vecina dentro del mismo ámbito.
function moveRow(t, id, dir, where = '', args = []) {
  const row = must(t, id);
  if (dir !== 'up' && dir !== 'down') throw new HttpError(400, 'Dirección inválida');
  const cmp = dir === 'up' ? '<' : '>';
  const order = dir === 'up' ? 'DESC' : 'ASC';
  const nb = db.prepare(`SELECT id, ord FROM ${t} WHERE ord ${cmp} ? ${where} ORDER BY ord ${order} LIMIT 1`)
    .get(row.ord, ...args);
  if (!nb) return false;
  const up = db.prepare(`UPDATE ${t} SET ord=? WHERE id=?`);
  up.run(nb.ord, row.id);
  up.run(row.ord, nb.id);
  return true;
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

/* ================= HTTP ================= */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const readBody = (req_) => new Promise((resolve, reject) => {
  let raw = '';
  req_.on('data', (c) => { raw += c; if (raw.length > 2e5) { reject(new HttpError(413, 'Contenido demasiado grande')); req_.destroy(); } });
  req_.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new HttpError(400, 'json inválido')); } });
  req_.on('error', reject);
});

const ok = (res) => json(res, 200, { ok: true });

async function api(request, res, path) {
  const seg = path.split('/').filter(Boolean).slice(1); // sin 'api'
  const [ent, id, sub] = seg;
  const M = request.method;
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
      must('tasks', id);
      db.prepare('UPDATE tasks SET data=? WHERE id=?').run(JSON.stringify(normTask(body)), Number(id));
      reorderTasksByTime();
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { removeRow('tasks', id); return ok(res); }
  }

  /* ---------- VIDEOS DE ONBOARDING ---------- */
  if (ent === 'videos') {
    if (M === 'POST' && !id) {
      const v = normVideo(body);
      const r = db.prepare('INSERT INTO videos(ord,title,type,dur,guion,url) VALUES(?,?,?,?,?,?)')
        .run(nextOrd('videos'), v.title, v.type, v.dur, v.guion, v.url);
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && sub === 'url') {
      must('videos', id);
      db.prepare('UPDATE videos SET url=? WHERE id=?').run(urlOrFail(body.url), Number(id));
      return ok(res);
    }
    if (M === 'PUT' && id && sub === 'move') return json(res, 200, { moved: moveRow('videos', id, body.dir) });
    if (M === 'PUT' && id && !sub) {
      must('videos', id);
      const v = normVideo(body);
      db.prepare('UPDATE videos SET title=?,type=?,dur=?,guion=?,url=? WHERE id=?')
        .run(v.title, v.type, v.dur, v.guion, v.url, Number(id));
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { removeRow('videos', id); return ok(res); }
  }

  /* ---------- CHECKLIST ---------- */
  if (ent === 'checklist') {
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
    if (M === 'PUT' && id && sub === 'move') {
      const row = must('checklist', id);
      return json(res, 200, { moved: moveRow('checklist', id, body.dir, 'AND day=?', [row.day]) });
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
    if (M === 'POST' && !id) {
      const r = db.prepare('INSERT INTO procesos(ord,data,url) VALUES(?,?,?)')
        .run(nextOrd('procesos'), JSON.stringify(normProceso(body)), urlOrFail(body.url));
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && sub === 'url') {
      must('procesos', id);
      db.prepare('UPDATE procesos SET url=? WHERE id=?').run(urlOrFail(body.url), Number(id));
      return ok(res);
    }
    if (M === 'PUT' && id && sub === 'move') return json(res, 200, { moved: moveRow('procesos', id, body.dir) });
    if (M === 'PUT' && id && !sub) {
      must('procesos', id);
      db.prepare('UPDATE procesos SET data=?, url=? WHERE id=?')
        .run(JSON.stringify(normProceso(body)), urlOrFail(body.url), Number(id));
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { removeRow('procesos', id); return ok(res); }
  }

  /* ---------- PRODUCTOS + MEDIA ---------- */
  if (ent === 'products') {
    if (M === 'POST' && !id) {
      const p = normProducto(body);
      const newId = freeId(slug(p.name));
      db.prepare('INSERT INTO products(id,ord,data) VALUES(?,?,?)').run(newId, nextOrd('products'), JSON.stringify(p));
      return json(res, 201, { id: newId });
    }
    if (M === 'POST' && id && sub === 'media') {
      must('products', id);
      const url = urlOrFail(body.url);
      if (!url) throw new HttpError(400, 'Link inválido');
      const kind = body.kind === 'video' ? 'video' : 'image';
      const r = db.prepare('INSERT INTO media(product_id,kind,title,url) VALUES(?,?,?,?)')
        .run(id, kind, str(body.title, 120) || (kind === 'video' ? 'Video' : 'Imagen'), url);
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && sub === 'move') return json(res, 200, { moved: moveRow('products', id, body.dir) });
    if (M === 'PUT' && id && !sub) {
      must('products', id);
      db.prepare('UPDATE products SET data=? WHERE id=?').run(JSON.stringify(normProducto(body)), id);
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) {
      must('products', id);
      db.prepare('DELETE FROM media WHERE product_id=?').run(id);
      db.prepare('DELETE FROM products WHERE id=?').run(id);
      return ok(res);
    }
  }

  if (ent === 'media' && M === 'DELETE' && id) {
    must('media', id);
    db.prepare('DELETE FROM media WHERE id=?').run(Number(id));
    return ok(res);
  }

  /* ---------- EJEMPLOS REALES ---------- */
  if (ent === 'ejemplos') {
    if (M === 'POST' && !id) {
      const r = db.prepare('INSERT INTO ejemplos(ord,data) VALUES(?,?)').run(nextOrd('ejemplos'), JSON.stringify(normEjemplo(body)));
      return json(res, 201, { id: Number(r.lastInsertRowid) });
    }
    if (M === 'PUT' && id && sub === 'move') return json(res, 200, { moved: moveRow('ejemplos', id, body.dir) });
    if (M === 'PUT' && id && !sub) {
      must('ejemplos', id);
      db.prepare('UPDATE ejemplos SET data=? WHERE id=?').run(JSON.stringify(normEjemplo(body)), Number(id));
      return ok(res);
    }
    if (M === 'DELETE' && id && !sub) { removeRow('ejemplos', id); return ok(res); }
  }

  throw new HttpError(404, 'No encontrado');
}

const server = createServer(async (request, res) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  try {
    if (path === '/health') return json(res, 200, { ok: true, version: VERSION });
    if (path.startsWith('/api/')) return await api(request, res, path);
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(res, 405, { error: 'Método no permitido' });

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

server.listen(PORT, '0.0.0.0', () => console.log(`NOVA Onboarding ${VERSION} en http://0.0.0.0:${PORT} · datos en ${DATA_DIR}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
}
