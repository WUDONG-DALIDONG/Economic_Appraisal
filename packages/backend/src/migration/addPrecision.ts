import Database from 'better-sqlite3';

export function migratePrecision(db: Database.Database): void {
  const hasColumn = (table: string, col: string) => {
    return !!db
      .prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
      .get(table, col);
  };

  if (!hasColumn('cells', 'precision')) {
    db.prepare('ALTER TABLE cells ADD COLUMN precision INTEGER').run();
  }

  if (!hasColumn('parameters', 'precision')) {
    db.prepare('ALTER TABLE parameters ADD COLUMN precision INTEGER').run();
  }
}
