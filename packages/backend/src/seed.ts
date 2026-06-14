import Database from 'better-sqlite3';
import { initSchema } from './repository/initDb.js';
import { ModelRepository } from './repository/ModelRepository.js';
import { ResultRepository } from './repository/ResultRepository.js';
import { ModelDefinition, CellType, ParameterType } from '@economic/core';

export const sampleModel: ModelDefinition = {
  id: '光储-001',
  name: '光储项目财务模型',
  version: '0.1.0',
  description: '光伏电站 + 储能项目经济评价（演示模板）',
  tables: [
    { id: 't1', name: '参数输入表', order: 0, description: '项目基础参数' },
    { id: 't2', name: '投资估算表', order: 1, description: '建设期投资明细' },
    { id: 't3', name: '利润表', order: 2, description: '运营期损益' },
  ],
  cells: [
    { id: 'c1', name: '总投资', tableId: 't2', formula: '=c2+c3', type: CellType.Formula, unit: '万元', isArray: false },
    { id: 'c2', name: '光伏投资', tableId: 't2', formula: '', type: CellType.Input, unit: '万元', defaultValue: 500, isArray: false },
    { id: 'c3', name: '储能投资', tableId: 't2', formula: '', type: CellType.Input, unit: '万元', defaultValue: 300, isArray: false },
    { id: 'c4', name: '年收入', tableId: 't3', formula: '=c5*0.35', type: CellType.Formula, unit: '万元', isArray: true },
    { id: 'c5', name: '发电量', tableId: 't3', formula: '', type: CellType.Input, unit: '万kWh', defaultValue: 200, isArray: true },
    { id: 'c6', name: '年成本', tableId: 't3', formula: '=c5*0.05', type: CellType.Formula, unit: '万元', isArray: true },
    { id: 'c7', name: '净利润', tableId: 't3', formula: '=c4-c6', type: CellType.Formula, unit: '万元', isArray: true },
  ],
  parameters: [
    { id: 'p1', name: '装机容量', type: ParameterType.Number, defaultValue: 100, unit: 'MW', description: '光伏装机容量' },
    { id: 'p2', name: '建设期', type: ParameterType.Number, defaultValue: 0.5, unit: '年', description: '建设期时长（年）' },
    { id: 'p3', name: '运营期', type: ParameterType.Number, defaultValue: 20, unit: '年', description: '运营期时长（年）' },
    { id: 'p4', name: '上网电价', type: ParameterType.Number, defaultValue: 0.35, unit: '元/kWh', description: '上网电价' },
  ],
  timeline: { constructionYears: 0.5, operationYears: 20, startYear: 2024 },
  metadata: { author: 'template', createdAt: '2024-06-13', updatedAt: '2024-06-13' },
};

export function seedData(db: Database.Database): void {
  initSchema(db);

  const modelRepo = new ModelRepository(db);
  const resultRepo = new ResultRepository(db);

  modelRepo.create(sampleModel);

  const results: Array<{ cellId: string; t: number; value: number | null }> = [
    { cellId: 'c1', t: 0, value: 800 },
    { cellId: 'c2', t: 0, value: 500 },
    { cellId: 'c3', t: 0, value: 300 },
    { cellId: 'c4', t: 1, value: 70 },
    { cellId: 'c4', t: 2, value: 63 },
    { cellId: 'c4', t: 3, value: 56.7 },
    { cellId: 'c5', t: 1, value: 200 },
    { cellId: 'c5', t: 2, value: 180 },
    { cellId: 'c5', t: 3, value: 162 },
    { cellId: 'c6', t: 1, value: 10 },
    { cellId: 'c6', t: 2, value: 9 },
    { cellId: 'c6', t: 3, value: 8.1 },
    { cellId: 'c7', t: 1, value: 60 },
    { cellId: 'c7', t: 2, value: 54 },
    { cellId: 'c7', t: 3, value: 48.6 },
  ];

  for (const r of results) {
    resultRepo.save(r.cellId, sampleModel.id, r.t, r.value);
  }

  console.log('[seed] seeded model', sampleModel.id, 'with', results.length, 'results');
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
