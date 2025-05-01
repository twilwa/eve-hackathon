import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { jobs } from '@shared/schema';
import { log } from './vite';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create SQLite database connection
const sqlite = new Database(resolve(__dirname, '../sqlite.db'));
sqlite.pragma('journal_mode = WAL'); // Better performance and concurrency

// Create drizzle instance
export const db = drizzle(sqlite, { schema: { jobs } });

// Initialize database and run migrations
export const initializeDatabase = async () => {
  try {
    // Ensure jobs table exists
    db.run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_system_id INTEGER NOT NULL,
        from_system_name TEXT NOT NULL,
        to_system_id INTEGER NOT NULL,
        to_system_name TEXT NOT NULL,
        reward REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        claimed_by TEXT,
        claimed_at TEXT,
        completed_at TEXT,
        proof_json TEXT
      )
    `);

    // Add index for status to speed up queries filtering by status
    db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status)`);

    // Create a table to store system entity details
    db.run(`
      CREATE TABLE IF NOT EXISTS system_details (
        system_id INTEGER PRIMARY KEY,
        entities_json TEXT NOT NULL,
        last_updated TEXT NOT NULL
      )
    `);
    
    log('SQLite database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};

// Utility to run a SQL query in a transaction
export const runTransaction = async <T>(callback: () => T): Promise<T> => {
  const transaction = db.transaction();
  try {
    transaction.execute('BEGIN');
    const result = callback();
    transaction.execute('COMMIT');
    return result;
  } catch (error) {
    transaction.execute('ROLLBACK');
    throw error;
  }
}; 