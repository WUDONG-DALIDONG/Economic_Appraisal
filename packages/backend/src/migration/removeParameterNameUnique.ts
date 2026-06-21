import Database from 'better-sqlite3';

/**
 * 迁移：移除 parameters 表的 UNIQUE(model_id, name) 约束
 *
 * SQLite 不允许直接删除与 UNIQUE/PRIMARY KEY 约束关联的隐式索引，
 * 因此采用“重建表”方式安全移除约束，同时保留全部数据。
 */
export function removeParameterNameUnique(db: Database.Database): void {
  // 检查当前 parameters 表是否含有由 UNIQUE 约束生成的隐式索引
  //   origin='pk'   → PRIMARY KEY（保留）
  //   origin='u'    → UNIQUE 约束（需要移除）
  const idxList = db.prepare("PRAGMA index_list('parameters')").all() as Array<{
    name: string;
    unique: number;
    origin: string;
  }>;

  const hasUnique = idxList.some(
    (idx) => idx.unique === 1 && idx.origin === 'u'
  );

  if (!hasUnique) {
    console.log('[migration] parameters UNIQUE(name) already removed');
    return;
  }

  // 列顺序必须与旧表完全一致，否则 INSERT INTO ... SELECT * 列错位
  db.exec(`
    CREATE TABLE parameters_new (
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
    INSERT INTO parameters_new SELECT * FROM parameters;
    DROP TABLE parameters;
    ALTER TABLE parameters_new RENAME TO parameters;
  `);

  console.log('[migration] removed UNIQUE(name) from parameters table');
}
