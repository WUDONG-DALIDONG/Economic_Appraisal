import Database from 'better-sqlite3';

/**
 * 初始化经济评估系统的 SQLite 数据库模式。
 *
 * 表：
 *  - models：顶层模型定义
 *  - tables：模型所属的表定义
 *  - cells：表所属的单元格定义（公式 + 元数据）
 *  - parameters：模型级参数（含默认值）
 *  - results：按时间索引的计算结果
 */
export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT,
      timeline_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      description TEXT,
      UNIQUE(model_id, name),
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cells (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      parent_id TEXT,
      sort_order INTEGER DEFAULT 0,
      formula TEXT NOT NULL,
      cell_type TEXT NOT NULL,
      value_type TEXT NOT NULL DEFAULT 'number',
      unit TEXT,
      description TEXT,
      default_value TEXT,
      is_array INTEGER NOT NULL DEFAULT 0,
      scope TEXT DEFAULT 'both',
      precision INTEGER,
      use_grouping INTEGER,
      FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS parameters (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      name TEXT NOT NULL,
      param_type TEXT NOT NULL,
      default_value TEXT NOT NULL,
      formula TEXT,
      min_value REAL,
      max_value REAL,
      unit TEXT,
      description TEXT,
      options_json TEXT,
      code TEXT,
      parent_id TEXT,
      sort_order INTEGER DEFAULT 0,
      precision INTEGER,
      compute_mode TEXT NOT NULL DEFAULT 'Input',
      use_grouping INTEGER,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cell_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      time_index INTEGER NOT NULL,
      value TEXT,
      computed_at TEXT NOT NULL,
      FOREIGN KEY (cell_id) REFERENCES cells(id) ON DELETE CASCADE,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      UNIQUE(cell_id, model_id, time_index)
    );
  `);
}
