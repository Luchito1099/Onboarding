// Pruebas de protección de datos: qué pasa con el contenido del equipo en cada despliegue.
// Se ejecutan con:  npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const SERVER = join(RAIZ, 'server.js');
const PUERTO = 3210 + (process.pid % 200);
const BASE = `http://127.0.0.1:${PUERTO}`;
let DIR = '';

/* ---------- utilidades ---------- */
function arranca(env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [SERVER], {
      env: { ...process.env, PORT: String(PUERTO), DATA_DIR: DIR, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    const mira = (d) => {
      salida += d;
      if (salida.includes('Contenido actual')) resolve({ proc: p, salida });
    };
    p.stdout.on('data', mira);
    p.stderr.on('data', mira);
    p.on('exit', (code) => resolve({ proc: null, salida, code }));
    setTimeout(() => reject(new Error('el servidor no arrancó:\n' + salida)), 15000);
  });
}
const para = (proc) => new Promise((resolve) => {
  if (!proc || proc.exitCode !== null) return resolve();
  proc.on('exit', resolve);
  proc.kill();
});
const api = async (m, ruta, body, headers) => {
  const r = await fetch(BASE + ruta, {
    method: m,
    headers: headers || (body ? { 'content-type': 'application/json' } : undefined),
    body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const estado = () => api('GET', '/api/state').then((r) => r.data);

before(() => { DIR = mkdtempSync(join(tmpdir(), 'nova-test-')); });
after(() => rmSync(DIR, { recursive: true, force: true }));

/* ---------- 1. un despliegue no toca lo que el equipo escribió ---------- */
test('un redespliegue conserva lo editado, lo creado y el progreso', async () => {
  let { proc } = await arranca();
  const inicial = await estado();
  assert.equal(inicial.tasks.length, 4, 'la base nueva arranca con el runbook de ejemplo');
  await api('POST', '/api/checklist', { day: 'Día 1', item: 'Ítem para la prueba' });

  await api('PUT', `/api/tasks/${inicial.tasks[0].id}`, { title: 'Tarea real del equipo', time: '08:00' });
  const creada = (await api('POST', '/api/tasks', { title: 'Otra tarea real', time: '10:15' })).data.id;
  await api('POST', '/api/guiones', { title: 'Guion real', apertura: 'Hola' });
  const item = (await estado()).checklist[0].items[0].id;
  await api('PUT', `/api/checklist/${item}/done`, { done: true });
  await para(proc);

  ({ proc } = await arranca()); // esto es un deploy: mismo volumen, código nuevo
  const despues = await estado();
  await para(proc);

  assert.ok(despues.tasks.some((t) => t.title === 'Tarea real del equipo'), 'la tarea editada sigue editada');
  assert.ok(despues.tasks.some((t) => t.id === creada), 'la tarea creada sigue ahí');
  assert.ok(despues.guiones.some((g) => g.title === 'Guion real'), 'el guion creado sigue ahí');
  assert.equal(despues.tasks.length, 5, 'no se reinserta el contenido de ejemplo');
  assert.ok(!despues.tasks.some((t) => t.title === 'Enviar mensaje predeterminado de pedidos'),
    'no reaparece la tarea de ejemplo que se había renombrado');
  assert.equal(despues.checklist[0].items[0].done, true, 'el progreso del checklist se conserva');
});

/* ---------- 2. lo borrado no vuelve solo ---------- */
test('si el equipo borra contenido, un reinicio no se lo devuelve', async () => {
  let { proc } = await arranca();
  for (const t of (await estado()).tasks) await api('DELETE', `/api/tasks/${t.id}`);
  assert.equal((await estado()).tasks.length, 0);
  await para(proc);

  ({ proc } = await arranca());
  const tras = (await estado()).tasks.length;
  await para(proc);
  assert.equal(tras, 0, 'las tareas borradas siguen borradas tras el reinicio');
});

/* ---------- 2b. el onboarding nace vacío y vaciarlo es definitivo ---------- */
test('el onboarding no trae contenido de ejemplo en una base nueva', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nova-onb-'));
  const dirOriginal = DIR;
  DIR = dir;
  const { proc } = await arranca();
  const s = await estado();
  await para(proc);
  DIR = dirOriginal;
  rmSync(dir, { recursive: true, force: true });

  assert.equal(s.videos.length, 0, 'sin videos de ejemplo');
  assert.equal(s.checklist.length, 0, 'sin checklist de ejemplo');
});

test('vaciar el onboarding lo deja vacío también después de reiniciar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nova-vaciar-'));
  const dirOriginal = DIR;
  DIR = dir;

  let { proc } = await arranca();
  // el equipo carga sus propios videos y su checklist
  await api('POST', '/api/videos', { title: 'Video propio', dur: '1:00' });
  await api('POST', '/api/checklist', { day: 'Día 1', item: 'Un ítem propio' });
  assert.equal((await estado()).videos.length, 1);

  const r1 = await api('POST', '/api/videos/vaciar');
  const r2 = await api('POST', '/api/checklist/vaciar');
  assert.equal(r1.data.borrados, 1);
  assert.equal(r2.data.borrados, 1);
  let s = await estado();
  assert.equal(s.videos.length, 0);
  assert.equal(s.checklist.length, 0);
  await para(proc);

  ({ proc } = await arranca()); // reinicio / redespliegue
  s = await estado();
  await para(proc);
  DIR = dirOriginal;
  rmSync(dir, { recursive: true, force: true });

  assert.equal(s.videos.length, 0, 'los videos borrados no vuelven al reiniciar');
  assert.equal(s.checklist.length, 0, 'el checklist borrado tampoco vuelve');
});

/* ---------- 3. una base con esquema viejo se migra sin perder nada ---------- */
test('una base de una versión anterior se actualiza sin perder datos', async () => {
  const viejo = mkdtempSync(join(tmpdir(), 'nova-viejo-'));
  const db = new DatabaseSync(join(viejo, 'nova.db'));
  // esquema tal y como era antes: sin guiones, sin infos y con media sin nota/ord
  db.exec(`
    CREATE TABLE tasks(id INTEGER PRIMARY KEY, ord INTEGER, data TEXT NOT NULL, done_on TEXT);
    CREATE TABLE videos(id INTEGER PRIMARY KEY, ord INTEGER, title TEXT, type TEXT, dur TEXT, guion TEXT, url TEXT DEFAULT '');
    CREATE TABLE checklist(id INTEGER PRIMARY KEY, ord INTEGER, day TEXT, item TEXT, done INTEGER DEFAULT 0);
    CREATE TABLE procesos(id INTEGER PRIMARY KEY, ord INTEGER, data TEXT NOT NULL, url TEXT DEFAULT '');
    CREATE TABLE products(id TEXT PRIMARY KEY, ord INTEGER, data TEXT NOT NULL);
    CREATE TABLE media(id INTEGER PRIMARY KEY, product_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT, url TEXT NOT NULL);
    CREATE TABLE ejemplos(id INTEGER PRIMARY KEY, ord INTEGER, data TEXT NOT NULL);
  `);
  db.prepare('INSERT INTO tasks(ord,data) VALUES(?,?)').run(0, JSON.stringify({ time: '08:00', title: 'Tarea antigua', steps: [], tips: [] }));
  db.prepare('INSERT INTO products(id,ord,data) VALUES(?,?,?)').run('viejo', 0, JSON.stringify({ name: 'Producto antiguo' }));
  db.prepare('INSERT INTO media(product_id,kind,title,url) VALUES(?,?,?,?)').run('viejo', 'image', 'Foto antigua', 'https://x.com/a.jpg');
  db.close();

  const dirOriginal = DIR;
  DIR = viejo;
  const { proc } = await arranca();
  const s = await estado();
  await para(proc);
  DIR = dirOriginal;
  rmSync(viejo, { recursive: true, force: true });

  assert.ok(s.tasks.some((t) => t.title === 'Tarea antigua'), 'la tarea antigua sobrevive');
  assert.ok(s.products.some((p) => p.name === 'Producto antiguo'), 'el producto antiguo sobrevive');
  assert.equal(s.products.find((p) => p.id === 'viejo').media.images[0].title, 'Foto antigua', 'su foto sobrevive');
  assert.equal(s.tasks.length, 1, 'no se mezcla el contenido de ejemplo con el que ya había');
  assert.ok(Array.isArray(s.guiones), 'las tablas nuevas se crean vacías');
});

/* ---------- 4. el seguro de producción ---------- */
test('con REQUIRE_DATA=1 la app se niega a arrancar si no encuentra la base', async () => {
  const vacio = mkdtempSync(join(tmpdir(), 'nova-vacio-'));
  const dirOriginal = DIR;
  DIR = vacio;
  const { proc, salida, code } = await arranca({ REQUIRE_DATA: '1' });
  DIR = dirOriginal;

  assert.equal(proc, null, 'el proceso no se queda arrancado');
  assert.equal(code, 1, 'sale con error para que el despliegue se marque como fallido');
  assert.match(salida, /FATAL/, 'explica el motivo en el log');
  assert.match(salida, /volumen persistente/, 'apunta al volumen como causa');
  assert.ok(!existsSync(join(vacio, 'nova.db')), 'y no llega a crear una base vacía');
  rmSync(vacio, { recursive: true, force: true });
});

test('con REQUIRE_DATA=1 y la base en su sitio, arranca con normalidad', async () => {
  const { proc, salida } = await arranca({ REQUIRE_DATA: '1' });
  const s = await estado();
  await para(proc);
  assert.match(salida, /Base existente reutilizada/);
  assert.ok(Array.isArray(s.tasks));
});

/* ---------- 5. instantáneas automáticas ---------- */
test('cada arranque deja una instantánea en el volumen', async () => {
  let { proc } = await arranca();
  await api('POST', '/api/guiones', { title: 'Guion para la instantánea', apertura: 'Hola' });
  await para(proc);

  ({ proc } = await arranca());
  const { data } = await api('GET', '/api/backups');
  await para(proc);

  assert.ok(data.backups.length >= 1, 'hay instantáneas guardadas');
  assert.ok(data.backups.every((b) => b.size > 0), 'y no están vacías');
  assert.ok(existsSync(join(DIR, 'backups')), 'viven dentro del volumen de datos');
});

test('las instantáneas se pueden listar, descargar y restaurar', async () => {
  const { proc } = await arranca();
  const antes = (await estado()).guiones.length;
  const lista = (await api('GET', '/api/backups')).data.backups;
  assert.ok(lista.length, 'hay al menos una instantánea');

  const contenido = (await api('GET', `/api/backups/${lista[0].name}`)).data;
  assert.ok(contenido.tablas && contenido.tablas.tasks, 'la instantánea trae las tablas');

  await api('POST', '/api/guiones', { title: 'Esto sobra', apertura: 'x' });
  assert.equal((await estado()).guiones.length, antes + 1);

  const r = await api('POST', '/api/restore', { snapshot: lista[0].name });
  assert.equal(r.status, 200);
  assert.ok(r.data.previa, 'antes de restaurar guarda cómo estaba, por si acaso');
  assert.equal((await estado()).guiones.length, antes, 'la restauración deja el contenido como estaba');
  await para(proc);
});

/* ---------- 6. copia completa y restauración tras perder el volumen ---------- */
test('la copia en ZIP devuelve contenido y archivos tras perderlo todo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nova-zip-'));
  const dirOriginal = DIR;
  DIR = dir;

  let { proc } = await arranca();
  await api('PUT', `/api/tasks/${(await estado()).tasks[0].id}`, { title: 'Tarea que no se puede perder', time: '07:00' });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const subida = (await api('POST', '/api/uploads', png, { 'content-type': 'image/png' })).data;
  await api('POST', `/api/products/${(await estado()).products[0].id}/media`, { kind: 'image', title: 'Foto real', url: subida.url });

  const zip = Buffer.from(await (await fetch(BASE + '/api/backup/zip')).arrayBuffer());
  assert.equal(zip.subarray(0, 4).toString('hex'), '504b0304', 'la copia es un ZIP válido');
  await para(proc);

  // desastre: desaparece el volumen entero
  rmSync(dir, { recursive: true, force: true });
  ({ proc } = await arranca());
  assert.ok(!(await estado()).tasks.some((t) => t.title === 'Tarea que no se puede perder'), 'sin volumen, el contenido no está');

  const r = await fetch(BASE + '/api/restore', { method: 'POST', headers: { 'content-type': 'application/zip' }, body: zip });
  const res = await r.json();
  const s = await estado();
  const foto = await fetch(BASE + subida.url);
  await para(proc);
  DIR = dirOriginal;
  rmSync(dir, { recursive: true, force: true });

  assert.equal(r.status, 200);
  assert.equal(res.archivos, 1, 'también restaura los archivos subidos');
  assert.ok(s.tasks.some((t) => t.title === 'Tarea que no se puede perder'), 'vuelve el contenido');
  assert.ok(s.products[0].media.images.some((m) => m.title === 'Foto real'), 'vuelve la foto del producto');
  assert.equal(foto.status, 200, 'y el archivo se puede volver a abrir');
});

/* ---------- 7. una restauración inválida no rompe nada ---------- */
test('un archivo que no es una copia se rechaza sin tocar el contenido', async () => {
  const { proc } = await arranca();
  const antes = await estado();
  const r = await api('POST', '/api/restore', { esto: 'no es una copia' });
  const despues = await estado();
  await para(proc);

  assert.equal(r.status, 400, 'se rechaza');
  assert.equal(despues.tasks.length, antes.tasks.length, 'las tareas siguen igual');
  assert.equal(despues.guiones.length, antes.guiones.length, 'los guiones siguen igual');
});

/* ---------- 8. el código de arranque no borra nada ---------- */
test('el arranque no ejecuta ninguna sentencia destructiva', async () => {
  const { readFileSync } = await import('node:fs');
  const codigo = readFileSync(SERVER, 'utf8');
  const arranqueSolo = codigo.slice(0, codigo.indexOf('/* ================= VALIDACIÓN'));
  assert.ok(!/DROP\s+TABLE/i.test(codigo), 'en ningún sitio se hace DROP TABLE');
  assert.ok(!/DELETE\s+FROM/i.test(arranqueSolo), 'el arranque no borra filas');
  assert.ok(!/ALTER\s+TABLE[^\n]*DROP/i.test(codigo), 'las migraciones no quitan columnas');
  assert.match(codigo, /ADD COLUMN/, 'las migraciones sólo añaden columnas');
});

/* ---------- 9. las instantáneas no crecen sin control ---------- */
test('se conservan como máximo las últimas instantáneas configuradas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nova-rota-'));
  const dirOriginal = DIR;
  DIR = dir;
  for (let i = 0; i < 5; i++) {
    const { proc } = await arranca({ MAX_BACKUPS: '3' });
    await para(proc);
  }
  const guardadas = readdirSync(join(dir, 'backups')).filter((f) => f.endsWith('.json'));
  DIR = dirOriginal;
  rmSync(dir, { recursive: true, force: true });
  assert.ok(guardadas.length <= 3, `se conservan 3 como mucho, había ${guardadas.length}`);
});
