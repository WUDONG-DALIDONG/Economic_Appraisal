import type { FastifyInstance } from 'fastify';
import type { Database } from 'better-sqlite3';
import { ModelDefinition } from '@economic/core';
import { ModelRepository } from '../repository/ModelRepository.js';
import { ResultRepository } from '../repository/ResultRepository.js';
import { ExcelExporter } from '../export/ExcelExporter.js';
import { ComputeService } from '../compute/ComputeService.js';

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

  // Plus a lightweight route to list models (helps frontend pick one)
  fastify.get('/api/models', async () => {
    return modelRepo.findAll();
  });

  // Get single model
  fastify.get('/api/models/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const model = modelRepo.findById(id);
    if (!model) {
      reply.status(404);
      return { error: 'Model not found' };
    }
    return model;
  });

  // Create model
  fastify.post('/api/models', async (request, reply) => {
    const body = request.body as ModelDefinition;
    if (!body.id || !body.name) {
      reply.status(400);
      return { error: 'id and name are required' };
    }
    try {
      modelRepo.create(body);
      return { id: body.id, status: 'created' };
    } catch (e: any) {
      reply.status(409);
      return { error: e.message };
    }
  });

  // Update (full replace)
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
    modelRepo.updateFull(body);
    return { id, status: 'updated' };
  });

  // Delete
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

  // Compute
  fastify.post('/api/models/:id/compute', async (request, reply) => {
    const { id } = request.params as { id: string };
    const model = modelRepo.findById(id);
    if (!model) {
      reply.status(404);
      return { error: 'Model not found' };
    }
    const computeService = new ComputeService(db);
    const result = computeService.compute(model);
    return result;
  });
}
