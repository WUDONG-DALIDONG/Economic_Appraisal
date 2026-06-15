import Database from 'better-sqlite3';

/**
 * Migrate parameters table to support hierarchical coding.
 *
 * Adds missing columns: code, parent_id, sort_order.
 * Also assigns initial sequential codes to legacy flat parameters.
 */
export function migrateParameterHierarchy(db: Database.Database): void {
  const hasColumn = (col: string) => {
    return !!db
      .prepare(`
        SELECT 1 FROM pragma_table_info('parameters')
        WHERE name = ?
      `).get(col);
  };

  // Add missing columns
  if (!hasColumn('code')) {
    db.prepare('ALTER TABLE parameters ADD COLUMN code TEXT').run();
  }
  if (!hasColumn('parent_id')) {
    db.prepare('ALTER TABLE parameters ADD COLUMN parent_id TEXT').run();
  }
  if (!hasColumn('sort_order')) {
    db.prepare('ALTER TABLE parameters ADD COLUMN sort_order INTEGER DEFAULT 0').run();
  }

  // Assign initial codes to parameters that have NULL code.
  // Group by model_id, assign sequential numbers.
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
