import Database from 'better-sqlite3';

export function migrateComputeModeValueType(db: Database.Database): void {
  const hasColumn = (table: string, col: string) => {
    return !!db
      .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
      .get(table, col);
  };

  if (!hasColumn('cells', 'value_type')) {
    db.prepare("ALTER TABLE cells ADD COLUMN value_type TEXT NOT NULL DEFAULT 'number'").run();
  }

  if (!hasColumn('parameters', 'compute_mode')) {
    db.prepare("ALTER TABLE parameters ADD COLUMN compute_mode TEXT NOT NULL DEFAULT 'Input'").run();
    db.prepare("UPDATE parameters SET compute_mode = 'Formula' WHERE formula IS NOT NULL AND formula != ''").run();
  }
}
