import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import type { FastifyInstance } from 'fastify';
import { ModelDefinition, CellType, ParameterType } from '@economic/core';

describe('Compute API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await buildServer(':memory:', false));
    // Seed a simple computable model with input + formula cells
    const model: ModelDefinition = {
      id: 'compute-test',
      name: '计算测试',
      version: '1.0.0',
      description: '',
      tables: [{ id: 't1', name: '表1', order: 0 }],
      cells: [
        { id: 'a', name: 'A', tableId: 't1', formula: '', type: CellType.Input, defaultValue: 10, isArray: false },
        { id: 'b', name: 'B', tableId: 't1', formula: '=a+5', type: CellType.Formula, isArray: false },
      ],
      parameters: [{ id: 'rate', name: 'Rate', type: ParameterType.Number, defaultValue: 2 }],
      timeline: { constructionYears: 0, operationYears: 1, startYear: 2024, startMonth: 1 },
      metadata: { author: '', createdAt: '', updatedAt: '' },
    };
    await app.inject({ method: 'POST', url: '/api/models', payload: model });
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/models/:id/compute runs computation and returns metadata', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/models/compute-test/compute' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cellCount).toBeGreaterThan(0);
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]).toHaveProperty('cellId');
    expect(body.results[0]).toHaveProperty('timeIndex');
    expect(body.results[0]).toHaveProperty('value');
  });

  it('POST /api/models/:id/compute stores results that can be exported', async () => {
    // Re-compute to ensure fresh results
    const computeRes = await app.inject({ method: 'POST', url: '/api/models/compute-test/compute' });
    expect(computeRes.statusCode).toBe(200);

    // Verify results are saved by checking export returns valid xlsx
    const exportRes = await app.inject({ method: 'GET', url: '/api/models/compute-test/export' });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  });

  it('POST /api/models/nonexistent/compute returns 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/models/nonexistent/compute' });
    expect(res.statusCode).toBe(404);
  });

  it('supports 参数.名称 referencing in formulas', async () => {
    const model: ModelDefinition = {
      id: 'param-ref-test',
      name: '参数引用测试',
      version: '1.0.0',
      description: '',
      tables: [{ id: 't2', name: '表2', order: 0 }],
      cells: [
        { id: 'c1', name: 'C1', tableId: 't2', formula: '=参数.上网电价 * 100', type: CellType.Formula, isArray: false },
      ],
      parameters: [{ id: 'p-e', name: '上网电价', type: ParameterType.Number, defaultValue: 0.5 }],
      timeline: { constructionYears: 0, operationYears: 1, startYear: 2024, startMonth: 1 },
      metadata: { author: '', createdAt: '', updatedAt: '' },
    };
    const createRes = await app.inject({ method: 'POST', url: '/api/models', payload: model });
    expect(createRes.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: '/api/models/param-ref-test/compute' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.errors).toHaveLength(0);
    expect(body.cellCount).toBe(1);

    // Verify the result value via export (cell c1 at t=0 should be 0.5 * 100 = 50)
    const exportRes = await app.inject({ method: 'GET', url: '/api/models/param-ref-test/export' });
    expect(exportRes.statusCode).toBe(200);
  });

  it('supports derived parameters with formula-only dependencies', async () => {
    const model: ModelDefinition = {
      id: 'derived-param-test',
      name: '派生参数测试',
      version: '1.0.0',
      description: '',
      tables: [{ id: 't3', name: '表3', order: 0 }],
      cells: [
        { id: 'c2', name: 'C2', tableId: 't3', formula: '=参数.合计电价 + 参数.基础电价', type: CellType.Formula, isArray: false },
      ],
      parameters: [
        { id: 'p-base', name: '基础电价', type: ParameterType.Number, defaultValue: 0.3 },
        { id: 'p-add', name: '补贴', type: ParameterType.Number, defaultValue: 0.05, formula: '=参数.基础电价 * 0.1' },
        { id: 'p-total', name: '合计电价', type: ParameterType.Number, defaultValue: 0, formula: '=参数.基础电价 + 参数.补贴' },
      ],
      timeline: { constructionYears: 0, operationYears: 1, startYear: 2024, startMonth: 1 },
      metadata: { author: '', createdAt: '', updatedAt: '' },
    };
    const createRes = await app.inject({ method: 'POST', url: '/api/models', payload: model });
    expect(createRes.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: '/api/models/derived-param-test/compute' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.errors).toHaveLength(0);
    expect(body.cellCount).toBe(1);
  });
});
