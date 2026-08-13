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
const VERSION = '2026-08-13-1';

/* ================= DB ================= */
mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'nova.db'));
db.exec('PRAGMA journal_mode = WAL');
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

/* ================= HTTP ================= */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e5) { reject(new Error('body too large')); req.destroy(); } });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('json inválido')); } });
  req.on('error', reject);
});

// Sólo se aceptan links http(s); el front decide cómo incrustarlos (YouTube => iframe).
const cleanUrl = (u) => {
  const s = String(u ?? '').trim();
  if (!s) return '';
  try {
    const p = new URL(s);
    return p.protocol === 'http:' || p.protocol === 'https:' ? s : null;
  } catch { return null; }
};

async function api(req, res, path) {
  const seg = path.split('/').filter(Boolean); // ['api', ...]
  const body = req.method === 'GET' ? {} : await readBody(req);

  if (req.method === 'GET' && seg.length === 2 && seg[1] === 'state') return json(res, 200, getState());

  if (req.method === 'PUT' && seg[1] === 'tasks' && seg[2]) {
    db.prepare('UPDATE tasks SET done_on=? WHERE id=?').run(body.done ? today() : null, Number(seg[2]));
    return json(res, 200, { ok: true });
  }
  if (req.method === 'PUT' && seg[1] === 'checklist' && seg[2]) {
    db.prepare('UPDATE checklist SET done=? WHERE id=?').run(body.done ? 1 : 0, Number(seg[2]));
    return json(res, 200, { ok: true });
  }
  if (req.method === 'PUT' && (seg[1] === 'videos' || seg[1] === 'procesos') && seg[2]) {
    const url = cleanUrl(body.url);
    if (url === null) return json(res, 400, { error: 'Link inválido' });
    db.prepare(`UPDATE ${seg[1] === 'videos' ? 'videos' : 'procesos'} SET url=? WHERE id=?`).run(url, Number(seg[2]));
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && seg[1] === 'products' && seg[2] && seg[3] === 'media') {
    const url = cleanUrl(body.url);
    if (!url) return json(res, 400, { error: 'Link inválido' });
    const kind = body.kind === 'video' ? 'video' : 'image';
    if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(seg[2])) return json(res, 404, { error: 'Producto no existe' });
    const r = db.prepare('INSERT INTO media(product_id,kind,title,url) VALUES(?,?,?,?)')
      .run(seg[2], kind, String(body.title || '').slice(0, 120) || (kind === 'video' ? 'Video' : 'Imagen'), url);
    return json(res, 201, { id: Number(r.lastInsertRowid) });
  }
  if (req.method === 'DELETE' && seg[1] === 'media' && seg[2]) {
    db.prepare('DELETE FROM media WHERE id=?').run(Number(seg[2]));
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'No encontrado' });
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (path === '/health') return json(res, 200, { ok: true, version: VERSION });
    if (path.startsWith('/api/')) return await api(req, res, path);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Método no permitido' });

    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^([/\\.]+)/, '');
    const file = join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'Prohibido' });
    const buf = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  } catch (err) {
    if (err?.code === 'ENOENT') return json(res, 404, { error: 'No encontrado' });
    console.error(err);
    json(res, 500, { error: 'Error del servidor' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`NOVA Onboarding en http://0.0.0.0:${PORT} · datos en ${DATA_DIR}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
}
