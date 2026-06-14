import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../src/repository/initDb';

describe('initDb', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates models table', () => {
    initSchema(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const names = tables.map(t => t.name);
    expect(names).toContain('models');
    expect(names).toContain('tables');
    expect(names).toContain('cells');
    expect(names).toContain('parameters');
    expect(names).toContain('results');
  });

  it('models table has correct columns', () => {
    initSchema(db);
    const columns = db
      .prepare("PRAGMA table_info(models)")
      .all() as Array<{ name: string }>;
    const colNames = columns.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('version');
    expect(colNames).toContain('description');
    expect(colNames).toContain('timeline_json');
    expect(colNames).toContain('metadata_json');
  });
});
