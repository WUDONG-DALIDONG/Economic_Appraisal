import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import { ModelDefinition } from '@economic/core';
import { ModelRepository } from '../repository/ModelRepository.js';
import { ResultRepository } from '../repository/ResultRepository.js';
import { ExcelExporter } from '../export/ExcelExporter.js';
import { ComputeService } from '../compute/ComputeService.js';
import { backupModel } from '../backup.js';

export async function registerExportRoute(fastify: FastifyInstance, db: Database.Database) {
  const modelRepo = new ModelRepository(db);
  const resultRepo = new ResultRepository(db);
  const exporter = new ExcelExporter();

  fastify.get('/api/models/:id/export', async (request, reply) => {
    const { id } = request.params as { id: string };

    const model = modelRepo.findById(id);
    if (!model) {
      reply.status(404);
      return { error: 'Model not found' };
    }

    const results = resultRepo.findByModel(id);

    const buffer = exporter.export(model, results, {
      includeFormulas: true,
      includeMetadata: true,
    });

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(model.name)}.xlsx"`);
    return buffer;
  });

  // 轻量级路由：列出模型（帮助前端选择）
  fastify.get('/api/models', async () => {
    return modelRepo.findAll();
  });

  // 获取单个模型
  fastify.get('/api/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const model = modelRepo.findById(id);
    if (!model) {
      reply.status(404);
      return { error: 'Model not found' };
    }
    return model;
  });

  // 创建模型
  fastify.post('/api/models', async (request, reply) => {
    const body = request.body as ModelDefinition;
    if (!body.id || !body.name) {
      reply.status(400);
      return { error: 'id and name are required' };
    }
    try {
      modelRepo.create(body);
      backupModel(body.id, body.name, body);
      return { id: body.id, status: 'created' };
    } catch (e: any) {
      reply.status(409);
      return { error: e.message };
    }
  });

  // 更新（全量替换）
  fastify.put('/api/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as ModelDefinition;
    if (id !== body.id) {
      reply.status(400);
      return { error: 'path id does not match body id' };
    }
    const existing = modelRepo.findById(id);
    if (!existing) {
      reply.status(404);
      return { error: 'Model not found' };
    }
    // 更新前备份
    backupModel(id, existing.name, existing);
    try {
      modelRepo.updateFull(body);
    } catch (e: any) {
      console.error('[PUT /api/models/:id] updateFull error:', e.message);
      reply.status(500);
      return { error: e.message };
    }
    return { id, status: 'updated' };
  });

  // 删除
  fastify.delete('/api/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = modelRepo.findById(id);
    if (!existing) {
      reply.status(404);
      return { error: 'Model not found' };
    }
    modelRepo.delete(id);
    reply.status(204);
    return;
  });

  // 计算
  fastify.post('/api/models/:id/compute', async (request, reply) => {
    const { id } = request.params as { id: string };
    const model = modelRepo.findById(id);
    if (!model) {
      reply.status(404);
      return { error: 'Model not found' };
    }
    try {
      const computeService = new ComputeService(db);
      const result = computeService.compute(model);
      return result;
    } catch (e: any) {
      console.error('[POST /api/models/:id/compute] compute error:', e.message);
      reply.status(500);
      return { error: e.message };
    }
  });
}
