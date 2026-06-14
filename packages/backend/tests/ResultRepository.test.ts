import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../src/repository/initDb';
import { ResultRepository } from '../src/repository/ResultRepository';

describe('ResultRepository', () => {
  let db: Database.Database;
  let results: ResultRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    results = new ResultRepository(db);

    // Seed a model + cell for FK constraints
    db.prepare("INSERT INTO models (id, name, version, timeline_json, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run('m1', 'Model', '1.0', '{}', '{}', 'now', 'now');
    db.prepare("INSERT INTO tables (id, model_id, name, display_order) VALUES (?, ?, ?, ?)")
      .run('t1', 'm1', 'Table 1', 0);
    db.prepare("INSERT INTO cells (id, table_id, model_id, name, formula, cell_type, is_array) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run('c1', 't1', 'm1', 'Revenue', '=100', 'Formula', 0);
  });

  afterEach(() => {
    db.close();
  });

  it('saves a computed result', () => {
    results.save('c1', 'm1', 0, 123.45);
    const found = results.findByCell('c1');
    expect(found).toHaveLength(1);
    expect(found[0].value).toBe(123.45);
    expect(found[0].timeIndex).toBe(0);
  });

  it('saves multiple time indices for one cell', () => {
    results.save('c1', 'm1', 0, 100);
    results.save('c1', 'm1', 1, 200);
    results.save('c1', 'm1', 2, 300);
    const found = results.findByCell('c1');
    expect(found).toHaveLength(3);
    expect(found.map(r => r.value)).toEqual([100, 200, 300]);
  });

  it('overwrites existing value for same cell+time', () => {
    results.save('c1', 'm1', 0, 100);
    results.save('c1', 'm1', 0, 999);
    const found = results.findByCell('c1');
    expect(found).toHaveLength(1);
    expect(found[0].value).toBe(999);
  });

  it('returns empty array for unknown cell', () => {
    expect(results.findByCell('no-such-cell')).toEqual([]);
  });
});
