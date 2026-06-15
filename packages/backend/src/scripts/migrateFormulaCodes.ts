// packages/backend/src/scripts/migrateFormulaCodes.ts
// Migrate existing cell formulas from name-based references to code-based references.
// Uses @economic/core/formulaDisplayToCode to resolve references robustly.
//
// Run:
//   DB_PATH=./data.db npx tsx packages/backend/src/scripts/migrateFormulaCodes.ts

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { formulaDisplayToCode, ModelDefinition } from '@economic/core';
import { ModelRepository } from '../repository/ModelRepository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../');
const DB_PATH = process.env.DB_PATH || path.join(repoRoot, 'data.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const repo = new ModelRepository(db);
const models = repo.findAll();

console.log(`Found ${models.length} model(s).\n`);

let migratedCount = 0;

const updateCell = db.prepare('UPDATE cells SET formula = ? WHERE id = ?');

for (const m of models) {
  const model = repo.findById(m.id);
  if (!model) {
    console.warn(`  ⚠️  Cannot fetch model ${m.name} (${m.id})`);
    continue;
  }

  let changed = false;
  db.transaction(() => {
    for (const cell of model.cells) {
      if (!cell.formula || cell.formula === '') continue;
      const original = cell.formula;
      const updated = formulaDisplayToCode(original, model);
      if (updated !== original) {
        updateCell.run(updated, cell.id);
        console.log(`  [${model.name}] ${cell.name}:\n    ${original}\n    -> ${updated}`);
        changed = true;
      }
    }
  })();

  if (changed) migratedCount++;
}

console.log(`\nDone. ${migratedCount} model(s) updated.`);
db.close();
