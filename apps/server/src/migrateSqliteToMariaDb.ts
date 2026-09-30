import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import sqlite3 from 'sqlite3';

type StateRow = { collection: string; record_key: string; payload: string; updated_at: string };

const collectionTables: Record<string, string> = {
  users: 'user_profiles', portalAccounts: 'user_accounts', credentials: 'user_credentials', webSessions: 'user_web_sessions', mobileSessions: 'user_mobile_sessions', mobileHandoffs: 'user_mobile_handoffs', passwordResets: 'user_password_resets', marketItems: 'marketplace_items', fulfillmentOrders: 'marketplace_orders', donations: 'marketplace_donations', portalEvents: 'task_events', weeklyEntries: 'task_weekly_entries', submissions: 'review_queue', nfcTags: 'wristband_tags', accessoryQrTags: 'wristband_accessory_tags', recycleRightLocations: 'locations_recycle_right', pickLockerLocations: 'locations_pick_lockers', popStationLocations: 'locations_popstations',
};

const defaultSource = fileURLToPath(new URL('../data/novo.sqlite', import.meta.url));
const sourcePath = process.env.NOVO_SQLITE_SOURCE || process.env.NOVO_DB_PATH || defaultSource;
const mariaConfig = { host: process.env.NOVO_DB_HOST || '127.0.0.1', port: Number(process.env.NOVO_DB_PORT || 3306), user: process.env.NOVO_DB_USER || 'novo', password: process.env.NOVO_DB_PASSWORD || '', database: process.env.NOVO_DB_NAME || 'novo' };

function openSource() {
  return new sqlite3.Database(sourcePath, sqlite3.OPEN_READONLY);
}

function sourceAll<T>(source: sqlite3.Database, sql: string, parameters: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => source.all(sql, parameters, (error, rows) => error ? reject(error) : resolve(rows as T[])));
}

async function readRows() {
  const source = openSource();
  try {
    const legacy = await sourceAll<{ total: number }>(source, "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = 'app_state'");
    if (Number(legacy[0]?.total ?? 0) > 0) return sourceAll<StateRow>(source, 'SELECT collection, record_key, payload, updated_at FROM app_state ORDER BY collection, record_key');
    const rows: StateRow[] = [];
    for (const [collection, table] of Object.entries(collectionTables)) {
      const exists = await sourceAll<{ total: number }>(source, "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = ?", [table]);
      if (Number(exists[0]?.total ?? 0) === 0) continue;
      const records = await sourceAll<Omit<StateRow, 'collection'>>(source, `SELECT record_key, payload, updated_at FROM ${table} ORDER BY record_key`);
      rows.push(...records.map((record) => ({ ...record, collection })));
    }
    return rows;
  } finally {
    source.close(() => undefined);
  }
}

const rows = await readRows();
for (const row of rows) JSON.parse(row.payload);

const target = await mysql.createConnection({ ...mariaConfig, charset: 'utf8mb4' });
try {
  for (const table of Object.values(collectionTables)) {
    await target.execute(`CREATE TABLE IF NOT EXISTS ${table} (
      record_key VARCHAR(191) NOT NULL,
      payload LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (record_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  await target.execute(`CREATE TABLE IF NOT EXISTS schema_metadata (
    metadata_key VARCHAR(191) NOT NULL PRIMARY KEY,
    metadata_value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  let existing = 0;
  for (const table of Object.values(collectionTables)) {
    const [countRows] = await target.execute(`SELECT COUNT(*) AS total FROM ${table}`);
    existing += Number((countRows as Array<{ total: number }>)[0]?.total ?? 0);
  }
  if (existing > 0 && process.env.NOVO_MIGRATION_REPLACE !== '1') throw new Error(`MariaDB target already contains ${existing} domain rows. Set NOVO_MIGRATION_REPLACE=1 to replace them.`);

  await target.beginTransaction();
  try {
    if (existing > 0) for (const table of Object.values(collectionTables)) await target.execute(`DELETE FROM ${table}`);
    for (const row of rows) {
      const table = collectionTables[row.collection];
      if (!table) throw new Error(`Unknown source collection: ${row.collection}`);
      await target.execute(`INSERT INTO ${table} (record_key, payload, updated_at) VALUES (?, ?, ?)`, [row.record_key, row.payload, row.updated_at]);
    }
    await target.execute("INSERT INTO schema_metadata (metadata_key, metadata_value) VALUES ('domain_schema_version', '2') ON DUPLICATE KEY UPDATE metadata_value = VALUES(metadata_value)");
    await target.commit();
  } catch (error) {
    await target.rollback();
    throw error;
  }

  let migrated = 0;
  for (const table of Object.values(collectionTables)) {
    const [countRows] = await target.execute(`SELECT COUNT(*) AS total FROM ${table}`);
    migrated += Number((countRows as Array<{ total: number }>)[0]?.total ?? 0);
  }
  if (migrated !== rows.length) throw new Error(`Migration verification failed: expected ${rows.length}, found ${migrated}.`);
  console.log(`Migrated ${migrated} rows into domain tables at mariadb://${mariaConfig.user}@${mariaConfig.host}:${mariaConfig.port}/${mariaConfig.database}`);
} finally {
  await target.end();
}
