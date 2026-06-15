import Database from 'better-sqlite3';
import { initSchema } from './repository/initDb.js';
import { ModelRepository } from './repository/ModelRepository.js';
import { ResultRepository } from './repository/ResultRepository.js';
import { ModelDefinition, CellType, ParameterType } from '@economic/core';

// Auto-exported from model "测试模型" (光储-001) on 2026-06-14T15:13:16.857Z
export const sampleModel: ModelDefinition = {
  "id": "光储-001",
  "name": "测试模型",
  "version": "0.1.0",
  "description": "通用经济评价模型（可自定义）",
  "tables": [
    {
      "id": "t1",
      "name": "资金筹措表",
      "order": 0,
      "description": "项目基础参数"
    }
  ],
  "cells": [
    {
      "id": "cell-1781449364997",
      "name": "施工进度安排",
      "code": "1",
      "parentId": null,
      "sortOrder": 0,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449374956",
      "name": "动态总投资",
      "code": "2",
      "parentId": null,
      "sortOrder": 1,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449384482",
      "name": "静态总投资",
      "code": "2.1",
      "parentId": "cell-1781449374956",
      "sortOrder": 2,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449396061",
      "name": "建设期利息",
      "code": "2.2",
      "parentId": "cell-1781449374956",
      "sortOrder": 3,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449403195",
      "name": "流动资金",
      "code": "2.3",
      "parentId": "cell-1781449374956",
      "sortOrder": 4,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449411511",
      "name": "资金来源",
      "code": "3",
      "parentId": null,
      "sortOrder": 5,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449425574",
      "name": "资本金",
      "code": "3.1",
      "parentId": "cell-1781449411511",
      "sortOrder": 6,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449434398",
      "name": "用于建设投资",
      "code": "3.1.1",
      "parentId": "cell-1781449425574",
      "sortOrder": 7,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449443530",
      "name": "用于建设期利息",
      "code": "3.1.2",
      "parentId": "cell-1781449425574",
      "sortOrder": 8,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449450872",
      "name": "用于流动资金",
      "code": "3.1.3",
      "parentId": "cell-1781449425574",
      "sortOrder": 9,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449466784",
      "name": "债务资金",
      "code": "3.2",
      "parentId": "cell-1781449411511",
      "sortOrder": 10,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449480047",
      "name": "用于建设投资",
      "code": "3.2.1",
      "parentId": "cell-1781449466784",
      "sortOrder": 11,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449494710",
      "name": "用于建设期利息",
      "code": "3.2.2",
      "parentId": "cell-1781449466784",
      "sortOrder": 12,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    },
    {
      "id": "cell-1781449502210",
      "name": "用于流动资金",
      "code": "3.2.3",
      "parentId": "cell-1781449466784",
      "sortOrder": 13,
      "tableId": "t1",
      "formula": "",
      "type": "Input",
      "unit": "",
      "isArray": true,
      "scope": "both"
    }
  ],
  "parameters": [
    {
      "id": "p1",
      "name": "装机容量",
      "type": "number",
      "defaultValue": 100,
      "unit": "MW",
      "description": "光伏装机容量"
    },
    {
      "id": "p2",
      "name": "建设期利息贷款利率",
      "type": "percentage",
      "defaultValue": 3.5,
      "unit": "",
      "description": "建设期时长（年）"
    },
    {
      "id": "p3",
      "name": "项目静态总投资",
      "type": "number",
      "defaultValue": 26700,
      "unit": "年",
      "description": "运营期时长（年）"
    }
  ],
  "timeline": {
    "constructionYears": 0.5,
    "operationYears": 20,
    "startYear": 2024
  },
  "metadata": {
    "author": "template",
    "createdAt": "2024-06-13",
    "updatedAt": "2024-06-13"
  }
};

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
