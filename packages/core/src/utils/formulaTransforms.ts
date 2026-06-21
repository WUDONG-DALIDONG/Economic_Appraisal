import { CellDefinition, ParameterDefinition } from '../types';
import { normalizeFullwidth } from './normalizeFullwidth';

function buildCellIdMaps(
  cells: CellDefinition[],
  tables: { id: string; name: string }[]
) {
  const idToCell = new Map(cells.map(c => [c.id, c]));
  const idToTableName = new Map<string, string>();
  for (const c of cells) {
    idToTableName.set(c.id, tables.find(t => t.id === c.tableId)?.name ?? c.tableId);
  }

  const idToPath = new Map<string, string>();
  for (const c of cells) {
    const tblName = idToTableName.get(c.id) ?? '';
    const parts: string[] = [];
    let curId: string | null = c.id;
    while (curId) {
      const cc = idToCell.get(curId);
      if (!cc) break;
      parts.unshift((cc.name || '').trim());
      curId = cc.parentId ?? null;
    }
    idToPath.set(c.id, `${tblName}.${parts.join('.')}`);
  }

  const pathToId = new Map<string, string>();
  for (const [id, path] of idToPath.entries()) {
    pathToId.set(path, id);
  }

  return { idToPath, pathToId, idToCell, idToTableName };
}

function buildParamIdMaps(parameters: ParameterDefinition[]) {
  const idToParam = new Map(parameters.map(p => [p.id, p]));

  const idToPath = new Map<string, string>();
  for (const p of parameters) {
    const parts: string[] = [];
    let curId: string | null = p.id;
    while (curId) {
      const pp = idToParam.get(curId);
      if (!pp) break;
      parts.unshift((pp.name || '').trim());
      curId = pp.parentId ?? null;
    }
    idToPath.set(p.id, `全局参数.${parts.join('.')}`);
  }

  const pathToId = new Map<string, string>();
  for (const [id, path] of idToPath.entries()) {
    pathToId.set(path, id);
  }

  return { idToPath, pathToId, idToParam };
}

export function formulaIdToDisplay(
  formula: string,
  model: {
    cells: CellDefinition[];
    tables: { id: string; name: string }[];
    parameters: ParameterDefinition[];
  }
): string {
  if (!formula) return '';
  const { idToPath: cellIdToPath } = buildCellIdMaps(model.cells, model.tables);
  const { idToPath: paramIdToPath } = buildParamIdMaps(model.parameters);

  return formula.replace(
    /@\{([^}]+)\}/g,
    (match, id: string) => {
      const cellPath = cellIdToPath.get(id);
      if (cellPath) return cellPath;
      const paramPath = paramIdToPath.get(id);
      if (paramPath) return paramPath;
      return match;
    }
  );
}

export function formulaDisplayToId(
  displayFormula: string,
  model: {
    cells: CellDefinition[];
    tables: { id: string; name: string }[];
    parameters: ParameterDefinition[];
  }
): string {
  // 将公式中的全角字符先规范化，确保路径匹配和 tokenize 一致
  displayFormula = normalizeFullwidth(displayFormula);

  if (!displayFormula) return displayFormula;
  const { pathToId: cellPathToId, idToPath: cellIdToPath } = buildCellIdMaps(model.cells, model.tables);
  const { pathToId: paramPathToId, idToPath: paramIdToPath } = buildParamIdMaps(model.parameters);

  // 构建叶子名称 -> ID 列表的映射，用于模糊匹配
  const cellLeafNameToIds = new Map<string, string[]>();
  for (const [id, path] of cellIdToPath.entries()) {
    const leaf = path.split('.').pop()!;
    if (!cellLeafNameToIds.has(leaf)) cellLeafNameToIds.set(leaf, []);
    cellLeafNameToIds.get(leaf)!.push(id);
  }
  const paramLeafNameToIds = new Map<string, string[]>();
  for (const [id, path] of paramIdToPath.entries()) {
    const leaf = path.split('.').pop()!;
    if (!paramLeafNameToIds.has(leaf)) paramLeafNameToIds.set(leaf, []);
    paramLeafNameToIds.get(leaf)!.push(id);
  }

  const tableNames = new Set(model.tables.map(t => t.name));

  let result = '';
  let i = 0;

  while (i < displayFormula.length) {
    if (!/[\w\u4e00-\u9fff（）：:]/.test(displayFormula[i])) {
      result += displayFormula[i];
      i++;
      continue;
    }

    let j = i;
    while (j < displayFormula.length && /[\w\u4e00-\u9fff（）：:]/.test(displayFormula[j])) {
      j++;
    }
    const word1 = displayFormula.slice(i, j);

    if ((tableNames.has(word1) || word1 === '全局参数') && j < displayFormula.length && displayFormula[j] === '.') {
      let restStart = j + 1;
      let k = restStart;
      let bestPath: string | null = null;
      let bestId: string | null = null;
      let bestEnd = restStart - 1;
      let lastScannedEnd = restStart;

      while (k < displayFormula.length) {
        while (k < displayFormula.length && /[\w\u4e00-\u9fff()（）：:]/.test(displayFormula[k])) {
          k++;
        }
        lastScannedEnd = k;
        const candidatePath = word1 + '.' + displayFormula.slice(restStart, k);

        const cellId = cellPathToId.get(candidatePath);
        if (cellId) {
          bestPath = candidatePath;
          bestId = cellId;
          bestEnd = k;
        }

        const paramId = paramPathToId.get(candidatePath);
        if (paramId) {
          bestPath = candidatePath;
          bestId = paramId;
          bestEnd = k;
        }

        if (k < displayFormula.length && displayFormula[k] === '.') {
          k++;
          continue;
        }
        break;
      }

      if (!bestId) {
        const leafName = displayFormula.slice(restStart, lastScannedEnd);
        const paramIds = paramLeafNameToIds.get(leafName);
        if (paramIds && paramIds.length >= 1) {
          bestId = paramIds[0];
          bestEnd = lastScannedEnd;
        } else {
          const cellIds = cellLeafNameToIds.get(leafName);
          if (cellIds && cellIds.length >= 1) {
            bestId = cellIds[0];
            bestEnd = lastScannedEnd;
          }
        }
      }

      if (bestId) {
        result += `@{${bestId}}`;
        i = bestEnd;
        continue;
      }

      const codeRegex = /^\d+(?:\.\d+)*$/;
      const afterDot = displayFormula.slice(restStart, k);
      if (codeRegex.test(afterDot)) {
        result += word1 + '.' + afterDot;
        i = k;
        continue;
      }
    }

    result += word1;
    i = j;
  }

  return result;
}

// 旧版基于编码的函数（过渡期间保留以兼容）

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

  const pathToCode = new Map<string, string>();
  for (const [code, path] of codeToPath.entries()) {
    pathToCode.set(path, code);
  }

  return { codeToPath, pathToCode, codeToId };
}

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

  let result = formula;

  result = result.replace(
    new RegExp('([\\w\\u4e00-\\u9fff]+)\\.((?:\\d+(?:\\.\\d+)*))', 'g'),
    (match, tblName, code) => {
      if (tblName === '全局参数') {
        const paramPath = paramCodeToPath.get(code);
        return paramPath ? `全局参数.${paramPath}` : match;
      }
      const path = codeToPath.get(code);
      return path ?? match;
    }
  );

  return result;
}

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

  const pathToCode = new Map<string, string>();
  for (const [code, path] of codeToPath.entries()) {
    pathToCode.set(path, code);
  }

  const tableNames = new Set(model.tables.map(t => t.name));

  let result = '';
  let i = 0;

  while (i < displayFormula.length) {
    if (!/[\w\u4e00-\u9fff（）：:]/.test(displayFormula[i])) {
      result += displayFormula[i];
      i++;
      continue;
    }

    let j = i;
    while (j < displayFormula.length && /[\w\u4e00-\u9fff（）：:]/.test(displayFormula[j])) {
      j++;
    }
    const word1 = displayFormula.slice(i, j);

    if ((tableNames.has(word1) || word1 === '全局参数') && j < displayFormula.length && displayFormula[j] === '.') {
      let restStart = j + 1;
      let k = restStart;
      let bestPath: string | null = null;
      let bestEnd = restStart - 1;

      let lastSegEnd = restStart;
      while (k < displayFormula.length) {
        while (k < displayFormula.length && /[\w\u4e00-\u9fff()（）：:]/.test(displayFormula[k])) {
          k++;
        }
        const candidatePath = word1 + '.' + displayFormula.slice(restStart, k);
        if (pathToCode.has(candidatePath)) {
          bestPath = candidatePath;
          bestEnd = k;
        }
        if (word1 === '全局参数' && paramPathToCode.has(displayFormula.slice(restStart, k))) {
          bestPath = word1 + '.' + displayFormula.slice(restStart, k);
          bestEnd = k;
        }
        if (k < displayFormula.length && displayFormula[k] === '.') {
          lastSegEnd = k + 1;
          k++;
          continue;
        }
        break;
      }

      if (bestPath) {
        if (word1 === '全局参数') {
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

      const codeRegex = /^\d+(?:\.\d+)*$/;
      const afterDot = displayFormula.slice(restStart, k);
      if (codeRegex.test(afterDot)) {
        result += word1 + '.' + afterDot;
        i = k;
        continue;
      }

      const codes = nameToCodes.get(afterDot);
      if (codes && codes.length > 0) {
        result += word1 + '.' + codes[0];
        i = k;
        continue;
      }
    }

    result += word1;
    i = j;
  }

  return result;
}

export function normalizeFormula(formula: string): string {
  return formula.startsWith('=') ? formula.slice(1) : formula;
}

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

export function getCellDisplayPathById(
  id: string,
  model: {
    cells: CellDefinition[];
    tables: { id: string; name: string }[];
  }
): string | null {
  const { idToPath } = buildCellIdMaps(model.cells, model.tables);
  return idToPath.get(id) ?? null;
}
