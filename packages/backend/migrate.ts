import Database from 'better-sqlite3';
import { initSchema } from './src/repository/initDb.js';

const db = new Database('/home/dalidong/Economic_Appraisal/data.db');

try {
  // Step 1: Check which columns already exist
  const cols = db.prepare("PRAGMA table_info(cells)").all() as Array<{ name: string }>;
  const colSet = new Set(cols.map(c => c.name));

  if (!colSet.has('code')) {
    db.exec('ALTER TABLE cells ADD COLUMN code TEXT;');
    console.log('✅ Added column: code');
  } else {
    console.log('⏭️ Column code already exists');
  }

  if (!colSet.has('parent_id')) {
    db.exec('ALTER TABLE cells ADD COLUMN parent_id TEXT;');
    console.log('✅ Added column: parent_id');
  } else {
    console.log('⏭️ Column parent_id already exists');
  }

  if (!colSet.has('sort_order')) {
    db.exec('ALTER TABLE cells ADD COLUMN sort_order INTEGER DEFAULT 0;');
    db.exec('UPDATE cells SET sort_order = 0;');
    console.log('✅ Added column: sort_order');
  } else {
    console.log('⏭️ Column sort_order already exists');
  }

  // Step 2: Check which columns exist in parameters
  const paramCols = db.prepare("PRAGMA table_info(parameters)").all() as Array<{ name: string }>;
  const paramColSet = new Set(paramCols.map(c => c.name));
  if (!paramColSet.has('formula')) {
    db.exec('ALTER TABLE parameters ADD COLUMN formula TEXT;');
    console.log('✅ Added column: parameters.formula');
  }

  // Step 3: Ensure tables table has UNIQUE constraint if not already present
  // Note: SQLite doesn't enforce adding UNIQUE via ALTER easily, but initSchema 
  // uses IF NOT EXISTS so it's safe to re-run for new databases only.

  console.log('🎉 Migration complete!');
} catch (e: any) {
  console.error('Migration failed:', e.message);
} finally {
  db.close();
}
