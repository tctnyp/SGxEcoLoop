import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';

export type PersistedCollections = Record<string, Map<string, unknown>>;

const defaultPath = fileURLToPath(new URL('../data/novo.sqlite', import.meta.url));
export const databasePath = process.env.NOVO_DB_PATH || defaultPath;

if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });

const database = new sqlite3.Database(databasePath);

function run(sql: string, parameters: unknown[] = []) {
  return new Promise<void>((resolve, reject) => {
    database.run(sql, parameters, (error) => error ? reject(error) : resolve());
  });
}

function all<T>(sql: string, parameters: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    database.all(sql, parameters, (error, rows) => error ? reject(error) : resolve(rows as T[]));
  });
}

async function createSchema() {
  await run('PRAGMA journal_mode = WAL');
  await run('PRAGMA foreign_keys = ON');
  await run(`
    CREATE TABLE IF NOT EXISTS app_state (
      collection TEXT NOT NULL,
      record_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (collection, record_key)
    )
  `);
  await run('CREATE INDEX IF NOT EXISTS app_state_collection_idx ON app_state(collection)');
}

async function hydrateCollection(name: string, target: Map<string, unknown>) {
  const rows = await all<{ record_key: string; payload: string }>(
    'SELECT record_key, payload FROM app_state WHERE collection = ? ORDER BY record_key',
    [name],
  );

  if (!rows.length) return false;
  target.clear();
  for (const row of rows) target.set(row.record_key, JSON.parse(row.payload) as unknown);
  return true;
}

async function writeCollections(collections: PersistedCollections) {
  await run('BEGIN IMMEDIATE');
  try {
    for (const [name, records] of Object.entries(collections)) {
      await run('DELETE FROM app_state WHERE collection = ?', [name]);
      for (const [key, value] of records) {
        await run(
          'INSERT INTO app_state (collection, record_key, payload, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          [name, key, JSON.stringify(value)],
        );
      }
    }
    await run('COMMIT');
  } catch (error) {
    await run('ROLLBACK').catch(() => undefined);
    throw error;
  }
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
  await run('DELETE FROM app_state');
  await run('VACUUM');
}

export function closeDatabase() {
  return new Promise<void>((resolve, reject) => {
    database.close((error) => error ? reject(error) : resolve());
  });
}
