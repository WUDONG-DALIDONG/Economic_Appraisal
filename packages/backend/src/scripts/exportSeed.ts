// packages/backend/src/scripts/exportSeed.ts
// Export current '测试模型' from DB as new seed template
// Usage: npx tsx exportSeed.ts

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { writeFileSync, existsSync } from 'fs';
import { ModelRepository } from '../repository/ModelRepository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../../');
const DB_PATH = process.env.DB_PATH || resolve(repoRoot, 'data.db');
const SEED_OUTPUT = resolve(__dirname, '../seed.ts');

if (!existsSync(DB_PATH)) {
  console.error('DB not found:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
const repo = new ModelRepository(db);

const models = repo.findAll();
const testModel = models.find(m => m.name === '测试模型');

if (!testModel) {
  console.error('Model "测试模型" not found in DB');
  console.log('Available models:', models.map(m => m.name).join(', '));
  process.exit(1);
}

const model = repo.findById(testModel.id);
if (!model) {
  console.error('Could not fetch full model');
  process.exit(1);
}

// Generate seed.ts content
const content = `import Database from 'better-sqlite3';
import { initSchema } from './repository/initDb.js';
import { ModelRepository } from './repository/ModelRepository.js';
import { ResultRepository } from './repository/ResultRepository.js';
import { ModelDefinition, CellType, ParameterType } from '@economic/core';

// Auto-exported from model "${model.name}" (${model.id}) on ${new Date().toISOString()}
export const sampleModel: ModelDefinition = ${JSON.stringify(model, null, 2)};

export function seedData(db: Database.Database): void {
  initSchema(db);

  const modelRepo = new ModelRepository(db);
  const resultRepo = new ResultRepository(db);

  modelRepo.create(sampleModel);

  console.log('[seed] seeded model', sampleModel.id, 'with', sampleModel.cells.length, 'cells');
}

// Allow CLI usage: DB_PATH=... node seed.js
if (process.argv[1]?.includes('seed')) {
  const dbPath = process.env.DB_PATH || ':memory:';
  const db = new Database(dbPath);
  seedData(db);
  if (dbPath !== ':memory:') {
    console.log('Database seeded to', dbPath);
  }
}
`;

writeFileSync(SEED_OUTPUT, content, 'utf8');
console.log(`[exportSeed] Wrote seed.ts with model "${model.name}" (${model.cells.length} cells)`);
db.close();
