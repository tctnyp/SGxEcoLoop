import { closeDatabase, databasePath, resetDatabase } from './database.js';

try {
  await resetDatabase();
  await closeDatabase();
  console.log(`Reset novo SQLite database at ${databasePath}`);
  console.log('Restart the server to initialize an empty database and any NOVO_*_EMAIL bootstrap roles.');
} catch (error) {
  console.error('Could not reset the novo database.', error);
  process.exitCode = 1;
}
