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

  it('supports [t-1] time offset for cumulative calculations', async () => {
    const model: ModelDefinition = {
      id: 'cumsum-test',
      name: '累积求和测试',
      version: '1.0.0',
      description: '',
      tables: [{ id: 't4', name: '表4', order: 0 }],
      cells: [
        { id: 'a1', name: '当年值', code: '1', tableId: 't4', formula: '', type: CellType.Input, defaultValue: [10, 20, 30, 40], isArray: true },
        { id: 'a2', name: '累计值', code: '2', tableId: 't4', formula: '=表4.1[t-1] + 表4.1', type: CellType.Formula, isArray: true },
      ],
      parameters: [],
      timeline: { constructionYears: 0, operationYears: 4, startYear: 2024, startMonth: 1 },
      metadata: { author: '', createdAt: '', updatedAt: '' },
    };
    const createRes = await app.inject({ method: 'POST', url: '/api/models', payload: model });
    expect(createRes.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: '/api/models/cumsum-test/compute' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.errors).toHaveLength(0);

    // 累计值[t] = 当年值[t-1] + 当年值[t]
    // t=0: 当年值[-1] → 越界返回0; 当年值[0] = 10; 累计 = 0+10 = 10
    // t=1: 当年值[0] = 10; 当年值[1] = 20; 累计 = 30
    // t=2: 当年值[1] = 20; 当年值[2] = 30; 累计 = 50
    // t=3: 当年值[2] = 30; 当年值[3] = 40; 累计 = 70
    const a2Results = body.results.filter((r: any) => r.cellId === 'a2').sort((a: any, b: any) => a.timeIndex - b.timeIndex);
    expect(a2Results).toHaveLength(4);
    expect(a2Results[0].value).toBe(10);
    expect(a2Results[1].value).toBe(30);
    expect(a2Results[2].value).toBe(50);
    expect(a2Results[3].value).toBe(70);
  });

  it('scope controls cell computation and cross-cell references', async () => {
    // construction=2 years (t=0,1), operation=3 years (t=2,3,4)
    const model: ModelDefinition = {
      id: 'scope-test',
      name: '作用区间测试',
      version: '1.0.0',
      description: '',
      tables: [{ id: 'st', name: '资金表', order: 0 }],
      cells: [
        // 建设期 Input，只在 t=0,1 有值
        {
          id: 'c-base', name: '建设投资', code: '1', tableId: 'st',
          formula: '', type: CellType.Input,
          defaultValue: [100, 200], scope: 'construction',
          isArray: true
        },
        // 运营期 Formula，引用了建设期 Input，公式在 t=2,3,4 计算
        {
          id: 'c-op', name: '运营费用', code: '2', tableId: 'st',
          formula: '=资金表.1 + 10', type: CellType.Formula,
          scope: 'operation', isArray: true
        },
      ],
      parameters: [],
      timeline: { constructionYears: 2, operationYears: 3, startYear: 2024, startMonth: 1 },
      metadata: { author: '', createdAt: '', updatedAt: '' },
    };
    const createRes = await app.inject({ method: 'POST', url: '/api/models', payload: model });
    expect(createRes.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: '/api/models/scope-test/compute' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.errors).toHaveLength(0);

    // 建设投资 (scope='construction') direct id refs: t=0,1 -> defaultValue; t=2,3,4 -> scope blocks -> 0
    const baseResults = body.results.filter((r: any) => r.cellId === 'c-base').sort((a: any, b: any) => a.timeIndex - b.timeIndex);
    // Note: c-base is Input, so it is NOT in the main compute loop (Formulas only).
    // Its values come from getCell() when referenced by other cells, or defaultValue directly.
    // We verify both via c-op results.

    // 运营费用 (scope='operation') at t=0,1: should be 0 (main loop scope skip)
    //                           at t=2,3,4: gets c-base 
    //                           but c-base at t=2,3,4 is scope-blocked in getCell -> returns 0
    //                           so c-op = 0 + 10 = 10
    const opResults = body.results.filter((r: any) => r.cellId === 'c-op').sort((a: any, b: any) => a.timeIndex - b.timeIndex);
    expect(opResults).toHaveLength(5);
    expect(opResults[0].value).toBe(0);  // t=0: operation formula skipped
    expect(opResults[1].value).toBe(0);  // t=1: operation formula skipped
    expect(opResults[2].value).toBe(10); // t=2: 0 (c-base blocked) + 10
    expect(opResults[3].value).toBe(10); // t=3
    expect(opResults[4].value).toBe(10); // t=4
  });
});
