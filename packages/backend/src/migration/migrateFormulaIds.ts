import Database from 'better-sqlite3';

export function migrateFormulaIds(db: Database.Database): void {
  const hasFormulaCol = db
    .prepare('SELECT 1 FROM pragma_table_info(\'cells\') WHERE name = \'formula\'')
    .get();
  if (!hasFormulaCol) return;

  const tables = db
    .prepare('SELECT id, name, model_id FROM tables')
    .all() as Array<{ id: string; name: string; model_id: string }>;

  const tableIdToName = new Map(tables.map(t => [t.id, t.name]));

  const allCells = db
    .prepare('SELECT id, table_id, code FROM cells WHERE code IS NOT NULL')
    .all() as Array<{ id: string; table_id: string; code: string }>;

  const allParams = db
    .prepare('SELECT id, code FROM parameters WHERE code IS NOT NULL')
    .all() as Array<{ id: string; code: string }>;

  const cellKeyToId = new Map<string, string>();
  for (const c of allCells) {
    const tblName = tableIdToName.get(c.table_id);
    if (!tblName) continue;
    cellKeyToId.set(`${tblName}.${c.code}`, c.id);
  }

  const paramKeyToId = new Map<string, string>();
  for (const p of allParams) {
    paramKeyToId.set(`参数.${p.code}`, p.id);
  }

  const formulaCells = db
    .prepare('SELECT id, formula FROM cells WHERE formula IS NOT NULL AND formula != \'\'')
    .all() as Array<{ id: string; formula: string }>;

  const formulaParams = db
    .prepare('SELECT id, formula FROM parameters WHERE formula IS NOT NULL AND formula != \'\'')
    .all() as Array<{ id: string; formula: string }>;

  const codeRegex = /([\w\u4e00-\u9fff]+)\.((?:\d+(?:\.\d+)*))/g;

  function convertFormula(formula: string): string {
    return formula.replace(codeRegex, (match, tblName: string, code: string) => {
      if (tblName === '参数') {
        const paramId = paramKeyToId.get(`参数.${code}`);
        if (paramId) return `@{${paramId}}`;
        return match;
      }
      const cellId = cellKeyToId.get(`${tblName}.${code}`);
      if (cellId) return `@{${cellId}}`;
      return match;
    });
  }

  const updateCell = db.prepare('UPDATE cells SET formula = ? WHERE id = ?');
  const updateParam = db.prepare('UPDATE parameters SET formula = ? WHERE id = ?');

  let cellCount = 0;
  for (const c of formulaCells) {
    const newFormula = convertFormula(c.formula);
    if (newFormula !== c.formula) {
      updateCell.run(newFormula, c.id);
      cellCount++;
    }
  }

  let paramCount = 0;
  for (const p of formulaParams) {
    const newFormula = convertFormula(p.formula);
    if (newFormula !== p.formula) {
      updateParam.run(newFormula, p.id);
      paramCount++;
    }
  }

  if (cellCount > 0 || paramCount > 0) {
    console.log(`[migration] formula IDs: migrated ${cellCount} cells, ${paramCount} parameters`);
  }
}
