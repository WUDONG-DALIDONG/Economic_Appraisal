import { copyFileSync, mkdirSync, readdirSync, statSync, unlinkSync, existsSync, writeFileSync, renameSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const DB_BACKUP_DIR = join(REPO_ROOT, 'backups', 'db');
const MODEL_BACKUP_DIR = join(REPO_ROOT, 'backups', 'models');
const MAX_DB_BACKUPS = 5;
const MAX_MODEL_BACKUPS = 20;

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 服务器启动前备份 SQLite 数据库。
 * 在 backups/db/ 中创建带时间戳的快照。
 */
export function backupDb(dbPath: string): string | null {
  if (!existsSync(dbPath)) return null;
  ensureDir(DB_BACKUP_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(DB_BACKUP_DIR, `data-${timestamp}.db`);
  try {
    copyFileSync(dbPath, backupPath);
    console.log(`[backup] DB snapshot saved to ${backupPath}`);
    cleanupOldBackups(DB_BACKUP_DIR, MAX_DB_BACKUPS);
    return backupPath;
  } catch (err) {
    console.error('[backup] Failed to backup DB:', err);
    return null;
  }
}

/**
 * 将单个模型备份为 JSON。
 * 在模型保存时调用（PUT /api/models/:id）。
 */
export function backupModel(modelId: string, modelName: string, data: unknown): string | null {
  ensureDir(MODEL_BACKUP_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeName = (modelName || modelId).replace(/[^\w\u4e00-\u9fff\-]/g, '_');
  const backupPath = join(MODEL_BACKUP_DIR, `${safeName}-${modelId}-${timestamp}.json`);
  try {
    const content = JSON.stringify(data, null, 2);
    // 通过临时文件原子写入
    const tempPath = backupPath + '.tmp';
    writeFileSync(tempPath, content, 'utf8');
    renameSync(tempPath, backupPath);
    console.log(`[backup] Model backup saved to ${backupPath}`);
    cleanupOldBackups(MODEL_BACKUP_DIR, MAX_MODEL_BACKUPS);
    return backupPath;
  } catch (err) {
    console.error('[backup] Failed to backup model:', err);
    return null;
  }
}

function cleanupOldBackups(dir: string, max: number) {
  try {
    const files = readdirSync(dir)
      .map(f => ({ name: f, time: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    for (let i = max; i < files.length; i++) {
      unlinkSync(join(dir, files[i].name));
      console.log(`[backup] Removed old backup: ${files[i].name}`);
    }
  } catch {
    // 忽略清理错误
  }
}
