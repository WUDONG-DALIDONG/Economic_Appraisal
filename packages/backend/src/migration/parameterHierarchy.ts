import Database from 'better-sqlite3';

/**
 * 迁移参数表以支持层级编码。
 *
 * 添加缺失的列：code、parent_id、sort_order。
 * 同时为已有的扁平参数分配初始顺序编码。
 */
export function migrateParameterHierarchy(db: Database.Database): void {
  const hasColumn = (col: string) => {
    return !!db
      .prepare(`
        SELECT 1 FROM pragma_table_info('parameters')
        WHERE name = ?
      `).get(col);
  };

  // 添加缺失的列
  if (!hasColumn('code')) {
    db.prepare('ALTER TABLE parameters ADD COLUMN code TEXT').run();
  }
  if (!hasColumn('parent_id')) {
    db.prepare('ALTER TABLE parameters ADD COLUMN parent_id TEXT').run();
  }
  if (!hasColumn('sort_order')) {
    db.prepare('ALTER TABLE parameters ADD COLUMN sort_order INTEGER DEFAULT 0').run();
  }

  // 为 code 为 NULL 的参数分配初始编码。
  // 按 model_id 分组，分配顺序编号。
  const rows = db.prepare(`
    SELECT id, model_id FROM parameters
    WHERE code IS NULL
    ORDER BY model_id, id
  `).all() as Array<{ id: string; model_id: string }>;

  let lastModelId: string | null = null;
  let counter = 0;

  for (const row of rows) {
    if (row.model_id !== lastModelId) {
      lastModelId = row.model_id;
      counter = 0;
    }
    counter++;
    db.prepare('UPDATE parameters SET code = ? WHERE id = ?')
      .run(String(counter), row.id);
  }
}
