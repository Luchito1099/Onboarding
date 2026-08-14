// Pruebas de protección de datos: qué pasa con el contenido del equipo en cada despliegue.
// Corren sobre el motor SQLite (sin variables DB_*), que comparte el código con PostgreSQL.
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
// El runner hereda el entorno: se limpian las variables de Postgres para forzar SQLite.
const SIN_PG = { DATABASE_URL: '', POSTGRES_URL: '', PGHOST: '', POSTGRES_HOST: '', DB_HOST: '' };

function arranca(env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [SERVER], {
      env: { ...process.env, ...SIN_PG, PORT: String(PUERTO), DATA_DIR: DIR, ...env },
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

/* ---------- 1. la app empieza VACÍA: cero contenido de ejemplo ---------- */
test('una base nueva arranca sin ningún contenido de ejemplo', async () => {
  const { proc, salida } = await arranca();
  const s = await estado();
  await para(proc);
  for (const k of ['tasks', 'videos', 'checklist', 'procesos', 'products', 'ejemplos', 'infos', 'guiones', 'dudas']) {
    assert.equal(s[k].length, 0, `${k} debe empezar vacío`);
  }
  assert.match(salida, /VACÍA|Base existente/, 'el log lo deja claro');
});

/* ---------- 2. un despliegue no toca lo que el equipo escribió ---------- */
test('un redespliegue conserva lo editado, lo creado y el progreso', async () => {
  let { proc } = await arranca();
  const t1 = (await api('POST', '/api/tasks', { title: 'Tarea real del equipo', time: '08:00' })).data.id;
  await api('POST', '/api/tasks', { title: 'Otra tarea real', time: '10:15' });
  await api('POST', '/api/guiones', { title: 'Guion real', apertura: 'Hola' });
  const ck = (await api('POST', '/api/checklist', { day: 'Día 1', item: 'Ítem real' })).data.id;
  await api('PUT', `/api/checklist/${ck}/done`, { done: true });
  await api('PUT', `/api/tasks/${t1}`, { title: 'Tarea real (editada)', time: '07:30' });
  await para(proc);

  ({ proc } = await arranca()); // esto es un deploy: mismo volumen, código nuevo
  const s = await estado();
  await para(proc);

  assert.equal(s.tasks.length, 2, 'no aparece nada que el equipo no haya creado');
  assert.ok(s.tasks.some((t) => t.title === 'Tarea real (editada)'), 'la edición sobrevive');
  assert.equal(s.tasks[0].title, 'Tarea real (editada)', 'y se reordenó por su nueva hora');
  assert.ok(s.guiones.some((g) => g.title === 'Guion real'));
  assert.equal(s.checklist[0].items[0].done, true, 'el progreso del checklist se conserva');
});

/* ---------- 3. no existe eliminar: primero archivo, luego (si acaso) borrado ---------- */
test('eliminar archiva; desde el archivo se restaura o se elimina definitivamente', async () => {
  let { proc } = await arranca();
  const id = (await api('POST', '/api/infos', { title: 'Bloque importante', body: 'texto' })).data.id;

  const r1 = await api('DELETE', `/api/infos/${id}`);
  assert.equal(r1.status, 200);
  assert.equal(r1.data.archivado, true, 'la respuesta dice que se archivó, no que se borró');
  assert.equal((await estado()).infos.length, 0, 'deja de verse en la app');

  const arch = (await api('GET', '/api/archivo')).data.archivo;
  assert.equal(arch.length, 1, 'aparece en el archivo');
  assert.equal(arch[0].titulo, 'Bloque importante');
  assert.equal(arch[0].ent, 'infos');

  // el borrado directo definitivo NO existe: sobre algo activo se rechaza
  const activo = (await api('POST', '/api/infos', { title: 'Otro bloque', body: 'x' })).data.id;
  const noDirecto = await api('DELETE', `/api/archivo/infos/${activo}`);
  assert.equal(noDirecto.status, 400, 'no se puede eliminar definitivamente algo sin archivar');
  assert.match(noDirecto.data.error, /archív/i);

  // restaurar lo devuelve intacto
  await api('POST', `/api/archivo/infos/${id}/restaurar`);
  const s2 = await estado();
  assert.equal(s2.infos.length, 2);
  assert.ok(s2.infos.some((x) => x.title === 'Bloque importante'));

  // archivar de nuevo y, ahora sí, eliminar definitivamente
  await api('DELETE', `/api/infos/${id}`);
  const r2 = await api('DELETE', `/api/archivo/infos/${id}`);
  assert.equal(r2.status, 200);
  assert.equal((await api('GET', '/api/archivo')).data.archivo.length, 0);
  assert.equal((await estado()).infos.length, 1);
  await para(proc);

  // y todo eso sobrevive a un reinicio
  ({ proc } = await arranca());
  const s3 = await estado();
  await para(proc);
  assert.equal(s3.infos.length, 1);
  assert.equal(s3.infos[0].title, 'Otro bloque');
});

test('lo archivado sobrevive a los reinicios hasta que alguien decida', async () => {
  let { proc } = await arranca();
  const id = (await api('POST', '/api/guiones', { title: 'Guion archivado', apertura: 'x' })).data.id;
  await api('DELETE', `/api/guiones/${id}`);
  await para(proc);

  ({ proc } = await arranca());
  const arch = (await api('GET', '/api/archivo')).data.archivo;
  await para(proc);
  assert.ok(arch.some((x) => x.ent === 'guiones' && x.titulo === 'Guion archivado'),
    'el archivo persiste tras reiniciar');
});

/* ---------- 4. una base con esquema viejo se migra sin perder nada ---------- */
test('una base de una versión anterior se actualiza sin perder datos', async () => {
  const viejo = mkdtempSync(join(tmpdir(), 'nova-viejo-'));
  const db = new DatabaseSync(join(viejo, 'nova.db'));
  // esquema como era antes: sin archived_at, media sin nota/ord, sin guiones/infos/dudas
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
  assert.equal(s.tasks.length, 1, 'no se añade ningún contenido de ejemplo');
  assert.ok(Array.isArray(s.guiones), 'las tablas nuevas se crean vacías');
});

/* ---------- 5. el seguro REQUIRE_DATA (modo SQLite) ---------- */
test('con REQUIRE_DATA=1 la app se niega a arrancar si no encuentra la base', async () => {
  const vacio = mkdtempSync(join(tmpdir(), 'nova-vacio-'));
  const dirOriginal = DIR;
  DIR = vacio;
  const { proc, salida, code } = await arranca({ REQUIRE_DATA: '1' });
  DIR = dirOriginal;

  assert.equal(proc, null, 'el proceso no se queda arrancado');
  assert.equal(code, 1, 'sale con error para que el despliegue se marque como fallido');
  assert.match(salida, /FATAL/);
  assert.ok(!existsSync(join(vacio, 'nova.db')), 'y no llega a crear una base vacía');
  rmSync(vacio, { recursive: true, force: true });
});

test('con REQUIRE_DATA=1 y la base en su sitio, arranca con normalidad', async () => {
  const { proc, salida } = await arranca({ REQUIRE_DATA: '1' });
  const s = await estado();
  await para(proc);
  assert.match(salida, /Base existente/);
  assert.ok(Array.isArray(s.tasks));
});

/* ---------- 6. instantáneas automáticas ---------- */
test('cada arranque con contenido deja una instantánea en el volumen', async () => {
  const { proc } = await arranca();
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

/* ---------- 7. copia completa y restauración tras perderlo todo ---------- */
test('la copia en ZIP devuelve contenido y archivos tras perderlo todo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nova-zip-'));
  const dirOriginal = DIR;
  DIR = dir;

  let { proc } = await arranca();
  await api('POST', '/api/tasks', { title: 'Tarea que no se puede perder', time: '07:00' });
  const prodId = (await api('POST', '/api/products', { name: 'Producto real' })).data.id;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const subida = (await api('POST', '/api/uploads', png, { 'content-type': 'image/png' })).data;
  await api('POST', `/api/products/${prodId}/media`, { kind: 'image', title: 'Foto real', url: subida.url });

  const zip = Buffer.from(await (await fetch(BASE + '/api/backup/zip')).arrayBuffer());
  assert.equal(zip.subarray(0, 4).toString('hex'), '504b0304', 'la copia es un ZIP válido');
  await para(proc);

  // desastre: desaparece el volumen entero
  rmSync(dir, { recursive: true, force: true });
  ({ proc } = await arranca());
  assert.equal((await estado()).tasks.length, 0, 'sin volumen, el contenido no está');

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
  assert.ok(s.products.find((p) => p.id === prodId).media.images.some((m) => m.title === 'Foto real'), 'vuelve la foto');
  assert.equal(foto.status, 200, 'y el archivo se puede volver a abrir');
});

test('un archivo que no es una copia se rechaza sin tocar el contenido', async () => {
  const { proc } = await arranca();
  const antes = await estado();
  const r = await api('POST', '/api/restore', { esto: 'no es una copia' });
  const despues = await estado();
  await para(proc);
  assert.equal(r.status, 400, 'se rechaza');
  assert.equal(despues.tasks.length, antes.tasks.length);
  assert.equal(despues.guiones.length, antes.guiones.length);
});

/* ---------- 8. el código no destruye nada por sí solo ---------- */
test('el arranque no ejecuta ninguna sentencia destructiva', async () => {
  const { readFileSync } = await import('node:fs');
  const codigo = readFileSync(SERVER, 'utf8');
  const arranqueSolo = codigo.slice(0, codigo.indexOf('/* ================= VALIDACIÓN'));
  assert.ok(!/DROP\s+TABLE/i.test(codigo), 'en ningún sitio se hace DROP TABLE');
  assert.ok(!/DELETE\s+FROM/i.test(arranqueSolo), 'el arranque no borra filas');
  assert.ok(!/ALTER\s+TABLE[^\n]*DROP/i.test(codigo), 'las migraciones no quitan columnas');
  assert.match(codigo, /ADD COLUMN/, 'las migraciones sólo añaden columnas');
});

/* ---------- 9. detección de volumen y diagnóstico ---------- */
test('se detecta si la carpeta de datos NO está en un volumen persistente', async () => {
  const { rutaEnMontaje } = await import('../lib/volumen.js');
  const raiz = '25 0 8:1 / / rw,relatime shared:1 - ext4 /dev/sda1 rw';
  const conVolumen = `${raiz}\n38 25 0:35 / /data rw,relatime shared:2 - ext4 /dev/sdb rw`;
  assert.equal(rutaEnMontaje(conVolumen, '/data'), true);
  assert.equal(rutaEnMontaje(conVolumen, '/data/uploads'), true);
  assert.equal(rutaEnMontaje(raiz, '/data'), false);
  assert.equal(rutaEnMontaje(conVolumen, '/otra'), false);
  assert.equal(rutaEnMontaje('', '/data'), false);
});

test('el /health dice el motor de datos y el estado del volumen', async () => {
  const { proc } = await arranca();
  const health = (await api('GET', '/health')).data;
  const s = await estado();
  await para(proc);
  assert.equal(health.motor, 'sqlite', 'sin variables DB_* el motor es SQLite');
  assert.equal(health.volumenPersistente, null, 'fuera de Docker se informa como desconocido');
  assert.ok('efimero' in s);
  assert.equal(s.motor, 'sqlite');
});

/* ---------- 10. prueba de conexión a PostgreSQL ---------- */
test('sin variables de Postgres, /api/pgtest lo dice claro y no rompe nada', async () => {
  const { proc } = await arranca();
  const r = await api('GET', '/api/pgtest');
  await para(proc);
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, false);
  assert.equal(r.data.configurado, false, 'distingue "no configurado" de "falló"');
  assert.match(r.data.error, /DB_HOST/, 'explica qué variables definir, en el formato DB_*');
});

test('con un Postgres inalcanzable, /api/pgtest devuelve el error sin colgarse', async () => {
  const { proc } = await arranca();
  const t0 = Date.now();
  const r = await api('GET', '/api/pgtest?host=127.0.0.1&port=9&user=x&password=x&database=onboarding');
  const tardo = Date.now() - t0;
  const salud = await api('GET', '/health');
  await para(proc);
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, false);
  assert.equal(r.data.configurado, true);
  assert.ok(r.data.error, 'trae el motivo del fallo');
  assert.ok(tardo < 10000, `responde en un tiempo razonable (${tardo} ms)`);
  assert.equal(salud.data.ok, true, 'y la app sigue viva después del intento');
});

/* ---------- 11. la imagen Docker trae todo lo que el servidor importa ---------- */
test('el Dockerfile copia cada módulo local que server.js importa', async () => {
  const { readFileSync } = await import('node:fs');
  const docker = readFileSync(join(RAIZ, 'Dockerfile'), 'utf8');
  const codigo = readFileSync(SERVER, 'utf8');
  const locales = [...codigo.matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);
  assert.ok(locales.length >= 2, 'server.js importa módulos locales');
  for (const ruta of locales) {
    const raizModulo = ruta.split('/')[0];
    assert.ok(new RegExp(`COPY [^\\n]*\\b${raizModulo}\\b`).test(docker),
      `el Dockerfile debe copiar "${raizModulo}" (lo importa server.js como ./${ruta})`);
  }
  assert.match(docker, /npm install/, 'la imagen instala las dependencias npm (pg)');
});

/* ---------- 12. las instantáneas no crecen sin control ---------- */
test('se conservan como máximo las últimas instantáneas configuradas', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nova-rota-'));
  const dirOriginal = DIR;
  DIR = dir;
  let { proc } = await arranca({ MAX_BACKUPS: '3' });
  await api('POST', '/api/guiones', { title: 'Contenido para las instantáneas', apertura: 'x' });
  await para(proc);
  for (let i = 0; i < 4; i++) {
    ({ proc } = await arranca({ MAX_BACKUPS: '3' }));
    await para(proc);
  }
  const guardadas = readdirSync(join(dir, 'backups')).filter((f) => f.endsWith('.json'));
  DIR = dirOriginal;
  rmSync(dir, { recursive: true, force: true });
  assert.ok(guardadas.length <= 3, `se conservan 3 como mucho, había ${guardadas.length}`);
});
