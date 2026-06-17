import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../src/repository/initDb';
import { ModelRepository } from '../src/repository/ModelRepository';
import { ModelDefinition, ComputeMode } from '@economic/core';

describe('ModelRepository', () => {
  let db: Database.Database;
  let repo: ModelRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    repo = new ModelRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  // ------------------------------------------------------------------------
  // CREATE
  // ------------------------------------------------------------------------
  it('creates a model', () => {
    const model: ModelDefinition = {
      id: 'model-1',
      name: 'Test Model',
      version: '1.0.0',
      description: 'A test model',
      tables: [],
      cells: [],
      parameters: [],
      timeline: { constructionYears: 1, operationYears: 20, startYear: 2024 },
      metadata: { author: 'test', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    };
    repo.create(model);
    const retrieved = repo.findById('model-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe('Test Model');
  });

  it('creates model with tables', () => {
    const model: ModelDefinition = {
      id: 'model-2',
      name: 'Model With Tables',
      version: '1.0.0',
      description: null as unknown as string,
      tables: [
        { id: 't1', name: 'Table 1', order: 0 },
        { id: 't2', name: 'Table 2', order: 1 },
      ],
      cells: [
        { id: 'c1', name: 'Cell 1', tableId: 't1', formula: '=1+1', computeMode: 'Formula' as const, valueType: 'number' as const, unit: '%', isArray: false },
        { id: 'c2', name: 'Cell 2', tableId: 't1', formula: '=2+2', computeMode: 'Formula' as const, valueType: 'number' as const, unit: '%', isArray: false },
      ],
      parameters: [],
      timeline: { constructionYears: 0.5, operationYears: 20, startYear: 2024 },
      metadata: { author: 'test', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    };
    repo.create(model);
    const tables = repo.findTablesByModel('model-2');
    expect(tables).toHaveLength(2);
    expect(tables.map(t => t.name)).toEqual(['Table 1', 'Table 2']);
  });

  // ------------------------------------------------------------------------
  // READ
  // ------------------------------------------------------------------------
  it('returns null for non-existent model', () => {
    const result = repo.findById('no-such-id');
    expect(result).toBeNull();
  });

  it('lists all models', () => {
    repo.create(makeModel('m1', 'First'));
    repo.create(makeModel('m2', 'Second'));
    const list = repo.findAll();
    expect(list).toHaveLength(2);
    expect(list.map(m => m.name)).toContain('First');
    expect(list.map(m => m.name)).toContain('Second');
  });

  // ------------------------------------------------------------------------
  // UPDATE
  // ------------------------------------------------------------------------
  it('updates a model name', () => {
    repo.create(makeModel('m3', 'Old Name'));
    repo.update('m3', { name: 'New Name' });
    const updated = repo.findById('m3');
    expect(updated!.name).toBe('New Name');
  });

  // ------------------------------------------------------------------------
  // DELETE
  // ------------------------------------------------------------------------
  it('deletes a model and its tables', () => {
    const model: ModelDefinition = {
      ...makeModel('m4', 'Delete Me'),
      tables: [{ id: 'ta', name: 'A', order: 0 }],
    };
    repo.create(model);
    repo.delete('m4');
    expect(repo.findById('m4')).toBeNull();
    expect(repo.findTablesByModel('m4')).toHaveLength(0);
  });
});

function makeModel(id: string, name: string): ModelDefinition {
  return {
    id,
    name,
    version: '1.0.0',
    description: '',
    tables: [],
    cells: [],
    parameters: [],
    timeline: { constructionYears: 0, operationYears: 20, startYear: 2024 },
    metadata: { author: 'test', createdAt: 'now', updatedAt: 'now' },
  };
}
