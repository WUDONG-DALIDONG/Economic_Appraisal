import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import type { FastifyInstance } from 'fastify';
import { ModelDefinition, CellType, ParameterType } from '@economic/core';

describe('Model CRUD API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await buildServer(':memory:', false));
  });

  afterAll(async () => {
    await app.close();
  });

  const sampleModel: ModelDefinition = {
    id: 'test-api-001',
    name: 'API测试模型',
    version: '1.0.0',
    description: '用于API测试',
    tables: [{ id: 't1', name: '表1', order: 0 }],
    cells: [{ id: 'c1', name: 'cell1', tableId: 't1', formula: '', type: CellType.Input, isArray: false }],
    parameters: [{ id: 'p1', name: 'p1', type: ParameterType.Number, defaultValue: 10 }],
    timeline: { constructionYears: 1, operationYears: 10, startYear: 2024, startMonth: 1 },
    metadata: {},
  };

  it('POST /api/models creates a model', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/models',
      payload: sampleModel,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('created');
  });

  it('GET /api/models returns list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/models' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.length).toBeGreaterThan(0);
  });

  it('GET /api/models/:id returns full model', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/models/test-api-001',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as ModelDefinition;
    expect(body.cells.length).toBe(1);
    expect(body.parameters.length).toBe(1);
    expect(body.tables[0].name).toBe('表1');
  });

  it('PUT /api/models/:id updates model', async () => {
    const updated = { ...sampleModel, name: 'Updated Model' };
    const res = await app.inject({
      method: 'PUT',
      url: '/api/models/test-api-001',
      payload: updated,
    });
    expect(res.statusCode).toBe(200);

    const getRes = await app.inject({ method: 'GET', url: '/api/models/test-api-001' });
    expect(JSON.parse(getRes.body).name).toBe('Updated Model');
  });

  it('DELETE /api/models/:id removes model', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/models/test-api-001' });
    expect(res.statusCode).toBe(204);

    const getRes = await app.inject({ method: 'GET', url: '/api/models/test-api-001' });
    expect(getRes.statusCode).toBe(404);
  });
});
