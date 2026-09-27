import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import sqlite3 from 'sqlite3';

export type PersistedCollections = Record<string, Map<string, unknown>>;

type DatabaseDriver = 'mariadb' | 'sqlite';

const defaultPath = fileURLToPath(new URL('../data/novo.sqlite', import.meta.url));
export const databasePath = process.env.NOVO_DB_PATH || defaultPath;
export const databaseDriver = (
  process.env.NOVO_DB_DRIVER || (process.env.NOVO_DB_PATH ? 'sqlite' : process.env.NOVO_DB_HOST ? 'mariadb' : 'sqlite')
).toLowerCase() as DatabaseDriver;

if (databaseDriver !== 'mariadb' && databaseDriver !== 'sqlite') {
  throw new Error(`Unsupported NOVO_DB_DRIVER: ${databaseDriver}`);
}

const mariaConfig = {
  host: process.env.NOVO_DB_HOST || '127.0.0.1',
  port: Number(process.env.NOVO_DB_PORT || 3306),
  user: process.env.NOVO_DB_USER || 'novo',
  password: process.env.NOVO_DB_PASSWORD || '',
  database: process.env.NOVO_DB_NAME || 'novo',
};

export const databaseTarget = databaseDriver === 'mariadb'
  ? `mariadb://${mariaConfig.user}@${mariaConfig.host}:${mariaConfig.port}/${mariaConfig.database}`
  : databasePath;

if (databaseDriver === 'sqlite' && databasePath !== ':memory:') {
  mkdirSync(dirname(databasePath), { recursive: true });
}

const sqliteDatabase = databaseDriver === 'sqlite' ? new sqlite3.Database(databasePath) : null;
const mariaPool = databaseDriver === 'mariadb'
  ? mysql.createPool({
      ...mariaConfig,
      charset: 'utf8mb4',
      connectionLimit: 8,
      enableKeepAlive: true,
    })
  : null;

function sqliteRun(sql: string, parameters: unknown[] = []) {
  if (!sqliteDatabase) throw new Error('SQLite is not configured.');
  return new Promise<void>((resolve, reject) => {
    sqliteDatabase.run(sql, parameters, (error) => error ? reject(error) : resolve());
  });
}

function sqliteAll<T>(sql: string, parameters: unknown[] = []) {
  if (!sqliteDatabase) throw new Error('SQLite is not configured.');
  return new Promise<T[]>((resolve, reject) => {
    sqliteDatabase.all(sql, parameters, (error, rows) => error ? reject(error) : resolve(rows as T[]));
  });
}

async function createSchema() {
  if (databaseDriver === 'sqlite') {
    await sqliteRun('PRAGMA journal_mode = WAL');
    await sqliteRun('PRAGMA foreign_keys = ON');
    await sqliteRun(`
      CREATE TABLE IF NOT EXISTS app_state (
        collection TEXT NOT NULL,
        record_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (collection, record_key)
      )
    `);
    await sqliteRun('CREATE INDEX IF NOT EXISTS app_state_collection_idx ON app_state(collection)');
    return;
  }

  await mariaPool!.execute(`
    CREATE TABLE IF NOT EXISTS app_state (
      collection VARCHAR(191) NOT NULL,
      record_key VARCHAR(191) NOT NULL,
      payload LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (collection, record_key),
      KEY app_state_collection_idx (collection)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function hydrateCollection(name: string, target: Map<string, unknown>) {
  const sql = 'SELECT record_key, payload FROM app_state WHERE collection = ? ORDER BY record_key';
  const rows = databaseDriver === 'sqlite'
    ? await sqliteAll<{ record_key: string; payload: string }>(sql, [name])
    : (await mariaPool!.execute(sql, [name]))[0] as { record_key: string; payload: string }[];

  if (!rows.length) return false;
  target.clear();
  for (const row of rows) target.set(row.record_key, JSON.parse(row.payload) as unknown);
  return true;
}

async function writeSqliteCollections(collections: PersistedCollections) {
  await sqliteRun('BEGIN IMMEDIATE');
  try {
    for (const [name, records] of Object.entries(collections)) {
      await sqliteRun('DELETE FROM app_state WHERE collection = ?', [name]);
      for (const [key, value] of records) {
        await sqliteRun(
          'INSERT INTO app_state (collection, record_key, payload, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          [name, key, JSON.stringify(value)],
        );
      }
    }
    await sqliteRun('COMMIT');
  } catch (error) {
    await sqliteRun('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function writeMariaCollections(collections: PersistedCollections) {
  const connection = await mariaPool!.getConnection();
  try {
    await connection.beginTransaction();
    for (const [name, records] of Object.entries(collections)) {
      await connection.execute('DELETE FROM app_state WHERE collection = ?', [name]);
      for (const [key, value] of records) {
        await connection.execute(
          'INSERT INTO app_state (collection, record_key, payload, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          [name, key, JSON.stringify(value)],
        );
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

async function writeCollections(collections: PersistedCollections) {
  if (databaseDriver === 'sqlite') return writeSqliteCollections(collections);
  return writeMariaCollections(collections);
}

let writeQueue = Promise.resolve();

export async function initializeDatabase(collections: PersistedCollections) {
  await createSchema();
  let needsSeed = false;
  for (const [name, records] of Object.entries(collections)) {
    const hydrated = await hydrateCollection(name, records);
    if (!hydrated) needsSeed = true;
  }
  if (needsSeed) await writeCollections(collections);
}

export function persistDatabase(collections: PersistedCollections) {
  writeQueue = writeQueue.then(() => writeCollections(collections));
  return writeQueue;
}

export async function resetDatabase() {
  await createSchema();
  if (databaseDriver === 'sqlite') {
    await sqliteRun('DELETE FROM app_state');
    await sqliteRun('VACUUM');
  } else {
    await mariaPool!.execute('DELETE FROM app_state');
  }
}

export async function closeDatabase() {
  await writeQueue;
  if (mariaPool) {
    await mariaPool.end();
    return;
  }
  if (!sqliteDatabase) return;
  await new Promise<void>((resolve, reject) => {
    sqliteDatabase.close((error) => error ? reject(error) : resolve());
  });
}
