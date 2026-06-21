import Fastify from 'fastify';
import cors from '@fastify/cors';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { resolve, join, dirname } from 'path';
import { readFileSync, existsSync } from 'fs';
import { initSchema } from './repository/initDb.js';
import { migrateParameterHierarchy } from './migration/parameterHierarchy.js';
import { migratePrecision } from './migration/addPrecision.js';
import { migrateFormulaIds } from './migration/migrateFormulaIds.js';
import { migrateComputeModeValueType } from './migration/computeModeValueType.js';
import { removeParameterNameUnique } from './migration/removeParameterNameUnique.js';
import { registerExportRoute } from './routes/export.js';
import { seedData } from './seed.js';
import { backupDb } from './backup.js';

const PORT = Number(process.env.PORT || 3001);

// 默认使用仓库根目录的文件数据库，数据在重启间持久化
const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || resolve(REPO_ROOT, '../../../data.db');

// 构建后的前端静态文件路径（monorepo: repo-root/packages/frontend/dist）
const FRONTEND_DIST = resolve(fileURLToPath(import.meta.url), '../../../frontend/dist');

export async function buildServer(dbPath = DB_PATH, shouldSeed = false) {
  // 在任何操作之前备份现有数据库
  backupDb(dbPath);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  initSchema(db);
  migrateParameterHierarchy(db);
  migratePrecision(db);
  migrateFormulaIds(db);
  migrateComputeModeValueType(db);
  removeParameterNameUnique(db);

  // 若使用 :memory:，填充演示数据以便导出功能开箱即用
  if (shouldSeed && dbPath === ':memory:') {
    seedData(db);
  }

  // 文件数据库首次运行时填充演示模型
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM models').get() as { count: number };
  if (dbPath !== ':memory:' && count === 0) {
    seedData(db);
    console.log('[seed] seeded demo model on fresh file DB');
  }

  const app = Fastify({ logger: { level: 'warn' } });

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await registerExportRoute(app, db);

  // 健康检查端点（保持在 API 命名空间以避免冲突）
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'economic-appraisal-backend',
  }));

  // 为所有非 API 路径提供构建后的前端静态文件
  app.get('/*', async (request, reply) => {
    const url = (request.url as string).split('?')[0]; // 去除查询字符串
    if (url.startsWith('/api/')) {
      reply.status(404);
      return { error: 'Not Found' };
    }

    // 解析文件路径；回退到 index.html 以支持 SPA 路由
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

  // 仅当此文件被直接执行时运行服务器（不在测试中导入时）
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
