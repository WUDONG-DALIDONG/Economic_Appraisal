import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/server.js';
import type { FastifyInstance } from 'fastify';

describe('Export API Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    ({ app } = await buildServer(':memory:', true));
  });

  afterAll(async () => {
    await app.close();
  });

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------
  it('GET /api/health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
  });

  // -----------------------------------------------------------------------
  // Model list
  // -----------------------------------------------------------------------
  it('GET /api/models returns seeded model list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/models' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Array<{ id: string; name: string }>;
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].name).toBe('光储项目财务模型');
  });

  // -----------------------------------------------------------------------
  // Single model
  // -----------------------------------------------------------------------
  it('GET /api/models/:id returns model', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/models/%E5%85%89%E5%82%A8-001',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('光储-001');
    expect(body.cells.length).toBeGreaterThan(0);
  });

  it('GET /api/models/nonexistent returns 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/models/nonexistent',
    });
    expect(res.statusCode).toBe(404);
  });

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------
  it('GET /api/models/:id/export returns xlsx buffer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/models/%E5%85%89%E5%82%A8-001/export',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.headers['content-disposition']).toContain('.xlsx');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/models/nonexistent/export returns 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/models/nonexistent/export',
    });
    expect(res.statusCode).toBe(404);
  });
});
