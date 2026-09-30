import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql, { PoolConnection } from 'mysql2/promise';
import sqlite3 from 'sqlite3';

export type PersistedCollections = Record<string, Map<string, unknown>>;

type DatabaseDriver = 'mariadb' | 'sqlite';

const collectionTables = {
  users: 'user_profiles',
  portalAccounts: 'user_accounts',
  credentials: 'user_credentials',
  webSessions: 'user_web_sessions',
  mobileSessions: 'user_mobile_sessions',
  mobileHandoffs: 'user_mobile_handoffs',
  passwordResets: 'user_password_resets',
  marketItems: 'marketplace_items',
  fulfillmentOrders: 'marketplace_orders',
  donations: 'marketplace_donations',
  portalEvents: 'task_events',
  weeklyEntries: 'task_weekly_entries',
  taskTemplates: 'task_templates',
  submissions: 'review_queue',
  nfcTags: 'wristband_tags',
  accessoryQrTags: 'wristband_accessory_tags',
  recycleRightLocations: 'locations_recycle_right',
  pickLockerLocations: 'locations_pick_lockers',
  popStationLocations: 'locations_popstations',
  weightCalibrations: 'impact_weight_calibrations',
} as const;

type CollectionName = keyof typeof collectionTables;
const tableNames = [...new Set(Object.values(collectionTables))];

function tableForCollection(name: string) {
  const table = collectionTables[name as CollectionName];
  if (!table) throw new Error(`No database table is configured for collection: ${name}`);
  return table;
}

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
  ? mysql.createPool({ ...mariaConfig, charset: 'utf8mb4', connectionLimit: 8, enableKeepAlive: true })
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

async function sqliteTableExists(table: string) {
  const rows = await sqliteAll<{ total: number }>('SELECT COUNT(*) AS total FROM sqlite_master WHERE type = ? AND name = ?', ['table', table]);
  return Number(rows[0]?.total ?? 0) > 0;
}

async function createSchema() {
  if (databaseDriver === 'sqlite') {
    await sqliteRun('PRAGMA journal_mode = WAL');
    await sqliteRun('PRAGMA foreign_keys = ON');
    for (const table of tableNames) {
      await sqliteRun(`CREATE TABLE IF NOT EXISTS ${table} (
        record_key TEXT NOT NULL PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    }
    await sqliteRun(`CREATE TABLE IF NOT EXISTS schema_metadata (
      metadata_key TEXT NOT NULL PRIMARY KEY,
      metadata_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    return;
  }

  for (const table of tableNames) {
    await mariaPool!.execute(`CREATE TABLE IF NOT EXISTS ${table} (
      record_key VARCHAR(191) NOT NULL,
      payload LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (record_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  await mariaPool!.execute(`CREATE TABLE IF NOT EXISTS schema_metadata (
    metadata_key VARCHAR(191) NOT NULL,
    metadata_value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (metadata_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function legacyRows(collection: string) {
  if (databaseDriver === 'sqlite') {
    if (!await sqliteTableExists('app_state')) return [];
    return sqliteAll<{ record_key: string; payload: string }>('SELECT record_key, payload FROM app_state WHERE collection = ? ORDER BY record_key', [collection]);
  }
  const [tables] = await mariaPool!.execute("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'app_state'");
  if (Number((tables as Array<{ total: number }>)[0]?.total ?? 0) === 0) return [];
  const [rows] = await mariaPool!.execute('SELECT record_key, payload FROM app_state WHERE collection = ? ORDER BY record_key', [collection]);
  return rows as Array<{ record_key: string; payload: string }>;
}

async function hydrateCollection(name: string, target: Map<string, unknown>) {
  const table = tableForCollection(name);
  const sql = `SELECT record_key, payload FROM ${table} ORDER BY record_key`;
  const rows = databaseDriver === 'sqlite'
    ? await sqliteAll<{ record_key: string; payload: string }>(sql)
    : (await mariaPool!.execute(sql))[0] as Array<{ record_key: string; payload: string }>;

  const sourceRows = rows.length ? rows : await legacyRows(name);
  if (!sourceRows.length) return false;
  target.clear();
  for (const row of sourceRows) target.set(row.record_key, JSON.parse(row.payload) as unknown);
  return true;
}

async function writeSqliteCollections(collections: PersistedCollections) {
  await sqliteRun('BEGIN IMMEDIATE');
  try {
    for (const [name, records] of Object.entries(collections)) {
      const table = tableForCollection(name);
      await sqliteRun(`DELETE FROM ${table}`);
      for (const [key, value] of records) {
        await sqliteRun(`INSERT INTO ${table} (record_key, payload, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, [key, JSON.stringify(value)]);
      }
    }
    await sqliteRun("INSERT OR REPLACE INTO schema_metadata (metadata_key, metadata_value, updated_at) VALUES ('domain_schema_version', '2', CURRENT_TIMESTAMP)");
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
      const table = tableForCollection(name);
      await connection.execute(`DELETE FROM ${table}`);
      for (const [key, value] of records) {
        await connection.execute(`INSERT INTO ${table} (record_key, payload, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`, [key, JSON.stringify(value)]);
      }
    }
    await connection.execute("INSERT INTO schema_metadata (metadata_key, metadata_value) VALUES ('domain_schema_version', '2') ON DUPLICATE KEY UPDATE metadata_value = VALUES(metadata_value)");
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

async function retireLegacyState() {
  if (databaseDriver === 'sqlite') {
    if (await sqliteTableExists('app_state')) await sqliteRun('DROP TABLE app_state');
    return;
  }
  const [tables] = await mariaPool!.execute("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'app_state'");
  if (Number((tables as Array<{ total: number }>)[0]?.total ?? 0) > 0) await mariaPool!.execute('DROP TABLE app_state');
}

let writeQueue = Promise.resolve();

function snapshotCollections(collections: PersistedCollections): PersistedCollections {
  return Object.fromEntries(Object.entries(collections).map(([name, records]) => [
    name,
    new Map([...records].map(([key, value]) => [key, structuredClone(value)])),
  ]));
}

export async function initializeDatabase(collections: PersistedCollections) {
  await createSchema();
  let needsWrite = false;
  for (const [name, records] of Object.entries(collections)) {
    const hydrated = await hydrateCollection(name, records);
    if (!hydrated) needsWrite = true;
  }
  if (needsWrite || Object.keys(collections).length > 0) await writeCollections(collections);
  await retireLegacyState();
}

export function persistDatabase(collections: PersistedCollections) {
  const snapshot = snapshotCollections(collections);
  const operation = writeQueue.then(() => writeCollections(snapshot));
  writeQueue = operation.catch(() => undefined);
  return operation;
}

export async function resetDatabase() {
  await createSchema();
  if (databaseDriver === 'sqlite') {
    await sqliteRun('BEGIN IMMEDIATE');
    try {
      for (const table of tableNames) await sqliteRun(`DELETE FROM ${table}`);
      await sqliteRun('DELETE FROM schema_metadata');
      await sqliteRun('COMMIT');
      await sqliteRun('VACUUM');
    } catch (error) {
      await sqliteRun('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } else {
    const connection: PoolConnection = await mariaPool!.getConnection();
    try {
      await connection.beginTransaction();
      for (const table of tableNames) await connection.execute(`DELETE FROM ${table}`);
      await connection.execute('DELETE FROM schema_metadata');
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
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
