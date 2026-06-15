import { CellDefinition, ParameterDefinition } from '../types';

/**
 * Build simple code->path map for parameters (similar to buildCellMaps but for params).
 */
function buildParamMaps(parameters: ParameterDefinition[]) {
  const codeToName = new Map(parameters.map(p => [p.code, p.name]).filter(([c]) => c) as [string, string][]);
  const codeToParentId = new Map(parameters.map(p => [p.code, p.parentId ?? null]).filter(([c]) => c) as [string, string | null][]);
  const codeToId = new Map(parameters.map(p => [p.code, p.id]).filter(([c]) => c) as [string, string][]);
  const codeToPath = new Map<string, string>();

  for (const p of parameters) {
    if (!p.code) continue;
    const parts: string[] = [];
    let curCode: string | null = p.code;
    while (curCode) {
      parts.unshift(codeToName.get(curCode) ?? curCode);
      const parentId = codeToParentId.get(curCode);
      if (parentId && codeToName.has(parentId)) {
        curCode = parentId;
      } else {
        break;
      }
    }
    codeToPath.set(p.code, parts.join('.'));
  }

  // path -> code reverse map
  const pathToCode = new Map<string, string>();
  for (const [code, path] of codeToPath.entries()) {
    pathToCode.set(path, code);
  }

  return { codeToPath, pathToCode, codeToId };
}

/**
 * Build reverse lookup maps:
 *  - codeToPath:   code -> "表.父.子" display path
 *  - codeToName:   code -> leaf cell name
 *  - nameToCodes:  cell name -> codes[] (multiple cells may share same name)
 */
function buildCellMaps(
  cells: CellDefinition[],
  tables: { id: string; name: string }[]
) {
  const nameToCodes = new Map<string, string[]>();
  const codeToName = new Map<string, string>();
  const codeToTableName = new Map<string, string>();
  const codeToParentId = new Map<string, string | null>();

  for (const c of cells) {
    codeToName.set(c.code, c.name);
    codeToTableName.set(c.code, tables.find(t => t.id === c.tableId)?.name ?? c.tableId);
    codeToParentId.set(c.code, c.parentId ?? null);
    const arr = nameToCodes.get(c.name) ?? [];
    if (!arr.includes(c.code)) arr.push(c.code);
    nameToCodes.set(c.name, arr);
  }

  // Build full display path per code
  const codeToPath = new Map<string, string>();
  for (const c of cells) {
    const tblName = codeToTableName.get(c.code) ?? '';
    const parts: string[] = [];
    let curId: string | null = c.id;
    while (curId) {
      const cc = cells.find(x => x.id === curId);
      if (!cc) break;
      parts.unshift(cc.name);
      curId = codeToParentId.get(cc.code) ?? null;
    }
    const fullPath = `${tblName}.${parts.join('.')}`;
    codeToPath.set(c.code, fullPath);
  }

  return { nameToCodes, codeToName, codeToPath, codeToTableName };
}

/**
 * Build simple name->code map for parameters (parameters have no hierarchy/codes)
 */
function buildParamMap(parameters: ParameterDefinition[]) {
  const map = new Map<string, string>();
  const dupeCounts = new Map<string, number>();
  for (const p of parameters) {
    map.set(p.name, p.id); // param reference is just id internally – actually param refs stored as name in formulas
  }
  return map;
}

/**
 * Convert a stored formula (using cell codes) to a human-displayable formula
 * using full hierarchical paths.
 *
 * E.g.: "=3.2.2 + 参数.1.2"
 *   -> "=资金筹措表.资金来源.债务资金.用于建设期利息 + 参数.总投资.建设投资"
 */
export function formulaCodeToDisplay(
  formula: string,
  model: {
    cells: CellDefinition[];
    tables: { id: string; name: string }[];
    parameters: ParameterDefinition[];
  }
): string {
  if (!formula) return '';
  const { codeToPath } = buildCellMaps(model.cells, model.tables);
  const { codeToPath: paramCodeToPath } = buildParamMaps(model.parameters);

  // Tokenize: table.code pattern  OR  参数.name pattern
  // Simple regex split preserving delimiters:
  // We replace occurrences of "表名.code" and "参数.名称"
  let result = formula;

  // Replace cell refs: table.code (where code is dot-separated digits)
  // Pattern: word chars (table name) followed by '.' then digit-based code
  result = result.replace(
    new RegExp('([\\w\\u4e00-\\u9fff]+)\\.((?:\\d+(?:\\.\\d+)*))', 'g'),
    (match, tblName, code) => {
      // Parameter ref: "参数.1.2"
      if (tblName === '参数') {
        const paramPath = paramCodeToPath.get(code);
        return paramPath ? `参数.${paramPath}` : match;
      }
      const path = codeToPath.get(code);
      return path ?? match;
    }
  );

  return result;
}

/**
 * Convert a human-entered formula (with full paths or names) back to stored
 * code-based formula.
 *
 * Rules:
 *  1. "表名.完整.路径" -> find the cell whose path == full path -> use its code
 *  2. "表名.code"      -> pass through if code found in model
 *  3. "表名.简单名称"   -> if ambiguous, use first matching code (backward compat)
 *  4. "参数.名称"       -> convert to path segments -> find code -> store as 参数.code
 *  5. "参数.code"       -> pass through (parameter refs stored as code paths)
 */
export function formulaDisplayToCode(
  displayFormula: string,
  model: {
    cells: CellDefinition[];
    tables: { id: string; name: string }[];
    parameters: ParameterDefinition[];
  }
): string {
  if (!displayFormula) return displayFormula;
  const { nameToCodes, codeToPath, codeToTableName } = buildCellMaps(model.cells, model.tables);
  const { codeToPath: paramCodeToPath, pathToCode: paramPathToCode } = buildParamMaps(model.parameters);

  // Build reverse: path -> code
  const pathToCode = new Map<string, string>();
  for (const [code, path] of codeToPath.entries()) {
    pathToCode.set(path, code);
  }

  // Build table name list (for detecting table refs)
  const tableNames = new Set(model.tables.map(t => t.name));

  // We'll do a simple token scan.
  // Algorithm: scan from left to right. Whenever we see a word that matches
  // a table name, check if the next tokens (joined by '.') form a full path.
  // If yes, replace with code. Otherwise leave as-is.
  let result = '';
  let i = 0;

  while (i < displayFormula.length) {
    // Skip anything that's not a word start ( letter/数字/中文 )
    if (!/[\w\u4e00-\u9fff]/.test(displayFormula[i])) {
      result += displayFormula[i];
      i++;
      continue;
    }

    // Read the next word
    let j = i;
    while (j < displayFormula.length && /[\w\u4e00-\u9fff]/.test(displayFormula[j])) {
      j++;
    }
    const word1 = displayFormula.slice(i, j);

    // Check if it's a table name followed by '.'
    if ((tableNames.has(word1) || word1 === '参数') && j < displayFormula.length && displayFormula[j] === '.') {
      // This is a "表名." or "参数." prefix — try to find the longest matching path
      let restStart = j + 1; // after the first '.'
      let k = restStart;
      // Read subsequent segments split by dots, building candidate paths
      let bestPath: string | null = null;
      let bestEnd = restStart - 1; // exclusive end index

      // We scan dot-separated segments starting from table name prefix
      // The full path is: tableName + '.' + segment1 + '.' + segment2 + ...
      let lastSegEnd = restStart;
      while (k < displayFormula.length) {
        // skip to next dot or non-word
        while (k < displayFormula.length && /[\w\u4e00-\u9fff]/.test(displayFormula[k])) {
          k++;
        }
        // segment [lastSegEnd, k)
        const candidatePath = word1 + '.' + displayFormula.slice(restStart, k);
        if (pathToCode.has(candidatePath)) {
          bestPath = candidatePath;
          bestEnd = k;
        }
        if (word1 === '参数' && paramPathToCode.has(displayFormula.slice(restStart, k))) {
          bestPath = word1 + '.' + displayFormula.slice(restStart, k);
          bestEnd = k;
        }
        // continue scanning for deeper matches
        if (k < displayFormula.length && displayFormula[k] === '.') {
          lastSegEnd = k + 1;
          k++;
          continue;
        }
        break;
      }

      // If we found a deep path match, replace it entirely
      if (bestPath) {
        if (word1 === '参数') {
          const paramPathSegment = bestPath.slice(word1.length + 1);
          const code = paramPathToCode.get(paramPathSegment);
          if (code) {
            result += word1 + '.' + code;
            i = bestEnd;
            continue;
          }
        }
        const code = pathToCode.get(bestPath)!;
        result += word1 + '.' + code;
        i = bestEnd;
        continue;
      }

      // No deep path match — check if it's a bare code reference like "表名.1.2"
      // This is case: user typed code directly — we should preserve table.code form
      // Detect: word1 '.' digit(s) [ '.' digit(s) ]*
      const codeRegex = /^\d+(?:\.\d+)*$/;
      const afterDot = displayFormula.slice(restStart, k);
      if (codeRegex.test(afterDot)) {
        // Preserve as table.code
        result += word1 + '.' + afterDot;
        i = k;
        continue;
      }

      // Otherwise it's a legacy bare name reference: e.g. "表名.名称"
      // Try to map to a code using nameToCodes (first match for backward compat)
      const codes = nameToCodes.get(afterDot);
      if (codes && codes.length > 0) {
        result += word1 + '.' + codes[0];
        i = k;
        continue;
      }
      // Could not resolve — fallthrough to raw word
    }

    // Not a table reference, or not followed by '.', or unresolved
    result += word1;
    i = j;
  }

  return result;
}

/**
 * Normalize a formula string for display or storage.
 * Removes leading '=' if present.
 */
export function normalizeFormula(formula: string): string {
  return formula.startsWith('=') ? formula.slice(1) : formula;
}

/**
 * Given a formula and model metadata, determine if it contains any
 * ambiguous cell name references (multiple cells share same name).
 * Returns list of ambiguous names with matching codes.
 */
export function findAmbiguousRefs(
  formula: string,
  model: {
    cells: CellDefinition[];
    tables: { id: string; name: string }[];
  }
): { name: string; codes: string[] }[] {
  const { nameToCodes } = buildCellMaps(model.cells, model.tables);
  const found: { name: string; codes: string[] }[] = [];
  const added = new Set<string>();
  for (const [name, codes] of nameToCodes.entries()) {
    if (codes.length <= 1) continue;
    const regex = new RegExp(`[\\w\\u4e00-\\u9fff]+\\.${escapeRegex(name)}(?![\\w\\u4e00-\\u9fff])`, 'g');
    if (regex.test(formula) && !added.has(name)) {
      found.push({ name, codes });
      added.add(name);
    }
  }
  return found;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Given a cell code, return its full hierarchical display path for the formula column.
 * E.g. code="3.2.2" -> "资金筹措表.资金来源.债务资金.用于建设期利息"
 */
export function getCellDisplayPath(
  code: string,
  model: {
    cells: CellDefinition[];
    tables: { id: string; name: string }[];
  }
): string | null {
  const { codeToPath } = buildCellMaps(model.cells, model.tables);
  return codeToPath.get(code) ?? null;
}
