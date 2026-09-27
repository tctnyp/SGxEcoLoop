import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import sqlite3 from 'sqlite3';

type StateRow = {
  collection: string;
  record_key: string;
  payload: string;
  updated_at: string;
};

const defaultSource = fileURLToPath(new URL('../data/novo.sqlite', import.meta.url));
const sourcePath = process.env.NOVO_SQLITE_SOURCE || process.env.NOVO_DB_PATH || defaultSource;
const mariaConfig = {
  host: process.env.NOVO_DB_HOST || '127.0.0.1',
  port: Number(process.env.NOVO_DB_PORT || 3306),
  user: process.env.NOVO_DB_USER || 'novo',
  password: process.env.NOVO_DB_PASSWORD || '',
  database: process.env.NOVO_DB_NAME || 'novo',
};

function readRows() {
  const source = new sqlite3.Database(sourcePath, sqlite3.OPEN_READONLY);
  return new Promise<StateRow[]>((resolve, reject) => {
    source.all(
      'SELECT collection, record_key, payload, updated_at FROM app_state ORDER BY collection, record_key',
      (error, rows) => {
        source.close(() => undefined);
        if (error) reject(error);
        else resolve(rows as StateRow[]);
      },
    );
  });
}

const rows = await readRows();
for (const row of rows) JSON.parse(row.payload);

const target = await mysql.createConnection({ ...mariaConfig, charset: 'utf8mb4' });
try {
  await target.execute(`
    CREATE TABLE IF NOT EXISTS app_state (
      collection VARCHAR(191) NOT NULL,
      record_key VARCHAR(191) NOT NULL,
      payload LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (collection, record_key),
      KEY app_state_collection_idx (collection)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [countRows] = await target.execute('SELECT COUNT(*) AS total FROM app_state');
  const existing = Number((countRows as { total: number }[])[0]?.total || 0);
  if (existing > 0 && process.env.NOVO_MIGRATION_REPLACE !== '1') {
    throw new Error(`MariaDB target already contains ${existing} rows. Set NOVO_MIGRATION_REPLACE=1 to replace them.`);
  }

  await target.beginTransaction();
  try {
    if (existing > 0) await target.execute('DELETE FROM app_state');
    for (const row of rows) {
      await target.execute(
        'INSERT INTO app_state (collection, record_key, payload, updated_at) VALUES (?, ?, ?, ?)',
        [row.collection, row.record_key, row.payload, row.updated_at],
      );
    }
    await target.commit();
  } catch (error) {
    await target.rollback();
    throw error;
  }

  const [verifiedRows] = await target.execute('SELECT COUNT(*) AS total FROM app_state');
  const migrated = Number((verifiedRows as { total: number }[])[0]?.total || 0);
  if (migrated !== rows.length) throw new Error(`Migration verification failed: expected ${rows.length}, found ${migrated}.`);

  console.log(`Migrated ${migrated} rows from ${sourcePath} to mariadb://${mariaConfig.user}@${mariaConfig.host}:${mariaConfig.port}/${mariaConfig.database}`);
} finally {
  await target.end();
}
