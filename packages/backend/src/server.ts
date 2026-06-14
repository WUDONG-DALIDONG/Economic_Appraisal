import Fastify from 'fastify';
import cors from '@fastify/cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { resolve, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { initSchema } from './repository/initDb.js';
import { registerExportRoute } from './routes/export.js';
import { seedData } from './seed.js';

const PORT = Number(process.env.PORT || 3001);
const DB_PATH = process.env.DB_PATH || ':memory:';

// Path to built frontend static files (monorepo: repo-root/packages/frontend/dist)
const FRONTEND_DIST = resolve(fileURLToPath(import.meta.url), '../../../frontend/dist');

export async function buildServer(dbPath = DB_PATH, shouldSeed = false) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initSchema(db);

  // If using :memory:, seed some demo data so the export works out of the box
  if (shouldSeed && dbPath === ':memory:') {
    seedData(db);
  }

  const app = Fastify({ logger: { level: 'warn' } });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await registerExportRoute(app, db);

  // Health check endpoint (keep in API namespace to avoid conflicts)
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'economic-appraisal-backend',
  }));

  // Serve built frontend static files for any non-API path
  app.get('/*', async (request, reply) => {
    const url = (request.url as string).split('?')[0]; // strip query string
    if (url.startsWith('/api/')) {
      reply.status(404);
      return { error: 'Not Found' };
    }

    // Resolve file path; fall back to index.html for SPA routing
    let filePath = join(FRONTEND_DIST, url === '/' ? 'index.html' : url);
    if (!existsSync(filePath)) {
      filePath = join(FRONTEND_DIST, 'index.html');
    }

    const ext = filePath.split('.').pop() || '';
    const mimeTypes: Record<string, string> = {
      html: 'text/html',
      js: 'application/javascript',
      css: 'text/css',
      json: 'application/json',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      woff2: 'font/woff2',
      woff: 'font/woff',
    };

    reply.type(mimeTypes[ext] || 'application/octet-stream');
    return reply.send(readFileSync(filePath));
  });

  return { app, db };
}

async function main() {
  const seed = process.env.NODE_ENV !== 'production';
  const { app } = await buildServer(DB_PATH, seed);

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only run server when this file is executed directly (not imported in tests)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
