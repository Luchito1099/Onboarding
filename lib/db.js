// Adaptador de datos con dos motores:
//  - PostgreSQL (producción): el contenido Y los archivos subidos viven en la base,
//    así que un despliegue nuevo no pierde absolutamente nada.
//  - SQLite (desarrollo y tests): mismo comportamiento, sin necesitar un Postgres local.
// La interfaz es la misma en ambos: query/exec/tx asíncronos y un almacén de archivos.

import { mkdirSync } from 'node:fs';
import { readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

// '?' → $1..$n (nuestro SQL nunca lleva '?' literales dentro de cadenas)
const aPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => '$' + (++i));
};

export async function abrirDB(cfg) {
  return cfg.motor === 'postgres' ? abrirPostgres(cfg) : abrirSQLite(cfg);
}

/* ================= POSTGRES ================= */
async function abrirPostgres(cfg) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ ...cfg.pg, max: 5 });
  pool.on('error', (err) => console.error('[pg] error de conexión en reposo:', err.message));

  const query = async (sql, params = []) => {
    const r = await pool.query(aPg(sql), params);
    return { rows: r.rows, rowCount: r.rowCount ?? 0 };
  };

  return {
    motor: 'postgres',
    query,
    exec: async (sql) => { await pool.query(sql); },
    // Transacción real sobre un único cliente del pool.
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const q = async (sql, params = []) => {
          const r = await client.query(aPg(sql), params);
          return { rows: r.rows, rowCount: r.rowCount ?? 0 };
        };
        const out = await fn(q);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    columnas: async (t) => (await query(
      'SELECT column_name FROM information_schema.columns WHERE table_name=?', [t],
    )).rows.map((r) => r.column_name),
    close: () => pool.end(),

    // Archivos subidos, dentro de la propia base (bytea).
    files: {
      put: async (name, mime, data) => {
        await query(
          'INSERT INTO nova_files(name,mime,data,at) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data',
          [name, mime, data, new Date().toISOString()],
        );
      },
      get: async (name) => (await query('SELECT mime,data FROM nova_files WHERE name=?', [name])).rows[0] || null,
      del: async (name) => { await query('DELETE FROM nova_files WHERE name=?', [name]); },
      list: async () => (await query('SELECT name,mime,length(data) AS size,at FROM nova_files ORDER BY at DESC')).rows
        .map((r) => ({ name: r.name, mime: r.mime, size: Number(r.size), at: Date.parse(r.at) || 0 })),
    },
  };
}

/* ================= SQLITE ================= */
async function abrirSQLite(cfg) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(cfg.sqliteFile);
  db.exec('PRAGMA journal_mode = WAL');
  mkdirSync(cfg.uploadsDir, { recursive: true });

  const query = async (sql, params = []) => {
    const st = db.prepare(sql);
    if (/^\s*(select|with)/i.test(sql) || /returning/i.test(sql)) {
      const rows = st.all(...params);
      return { rows, rowCount: rows.length };
    }
    const r = st.run(...params);
    return { rows: [], rowCount: Number(r.changes) };
  };

  return {
    motor: 'sqlite',
    query,
    exec: async (sql) => db.exec(sql),
    tx: async (fn) => {
      db.exec('BEGIN');
      try {
        const out = await fn(query);
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    columnas: async (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name),
    close: () => db.close(),

    // Archivos subidos en disco, como siempre (modo desarrollo).
    files: {
      put: async (name, _mime, data) => { await writeFile(join(cfg.uploadsDir, basename(name)), data); },
      get: async (name) => {
        const data = await readFile(join(cfg.uploadsDir, basename(name))).catch(() => null);
        return data ? { mime: cfg.mimePorExt(name) || 'application/octet-stream', data } : null;
      },
      del: async (name) => { await unlink(join(cfg.uploadsDir, basename(name))).catch(() => {}); },
      list: async () => {
        const names = await readdir(cfg.uploadsDir).catch(() => []);
        const out = [];
        for (const name of names) {
          if (!/^[\w.-]+$/.test(name) || !cfg.mimePorExt(name)) continue;
          const st = await stat(join(cfg.uploadsDir, name)).catch(() => null);
          if (st) out.push({ name, mime: cfg.mimePorExt(name), size: st.size, at: st.mtimeMs });
        }
        return out.sort((a, b) => b.at - a.at);
      },
    },
  };
}
