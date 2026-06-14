import { tokenize, Token, TokenType } from './tokenizer';

/**
 * Extract all table.field references from a formula string.
 *
 * Pattern: TokenType.Table + Dot + TokenType.Field
 * Covers both `表名.指标名` and `参数.参数名`.
 *
 * ScriptBlock formulas return an empty array.
 */
export function extractTableReferences(formula: string): Array<{ table: string; field: string }> {
  if (!formula) return [];
  try {
    const tokens = tokenize(formula) as Token[];
    if (tokens[tokens.length - 1]?.type === TokenType.EOF) tokens.pop();

    const refs: Array<{ table: string; field: string }> = [];
    for (let i = 0; i < tokens.length - 2; i++) {
      const t = tokens[i];
      const dot = tokens[i + 1];
      const f = tokens[i + 2];
      if (
        t &&
        t.type === TokenType.Table &&
        dot &&
        dot.value === '.' &&
        f &&
        f.type === TokenType.Field
      ) {
        refs.push({ table: t.value, field: f.value });
      }
    }
    return refs;
  } catch {
    return [];
  }
}

/**
 * Rename all table-name references inside `formula`.
 *
 * Only touches TokenType.Table tokens whose value === `oldName`.
 * All dotted field names (`oldName.指标`) and bracket syntax
 * (`oldName[t]`) are updated.
 *
 * If formula cannot be tokenised the original string is returned
 * unchanged.
 */
export function renameTableInFormula(formula: string, oldName: string, newName: string): string {
  if (!formula || !oldName || oldName === newName) return formula;
  return renameTokenSub(formula, oldName, newName, TokenType.Table);
}

/**
 * Rename a specific parameter reference inside `formula`.
 *
 * Specifically replaces `参数.oldName` with `参数.newName`.
 * The namespace (`参数`) is preserved, only the field part is
 * rewritten.
 */
export function renameParamInFormula(formula: string, oldName: string, newName: string): string {
  if (!formula || !oldName || oldName === newName) return formula;
  return renameFieldAfterTable(formula, '参数', oldName, newName);
}

/* ------------------------------------------------------------------ */
/*  Low-level helpers                                                  */
/* ------------------------------------------------------------------ */

function renameTokenSub(formula: string, oldName: string, newName: string, type: TokenType): string {
  try {
    const tokens = tokenize(formula) as Token[];
    if (tokens.length > 0 && tokens[tokens.length - 1].type === TokenType.EOF) tokens.pop();

    let result = '';
    let lastPos = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== type || t.value !== oldName) continue;

      result += formula.slice(lastPos, t.pos);
      result += newName;
      lastPos = t.pos + t.value.length;
    }

    result += formula.slice(lastPos);
    return result;
  } catch {
    return formula;
  }
}

/**
 * Replace `tableName.fieldName` with `tableName.newFieldName`.
 * Only replaces when the *exact* table-token and field-token pair
 * matches `tableName` + `oldFieldName`.
 */
function renameFieldAfterTable(formula: string, tableName: string, oldFieldName: string, newFieldName: string): string {
  try {
    const tokens = tokenize(formula) as Token[];
    if (tokens.length > 0 && tokens[tokens.length - 1].type === TokenType.EOF) tokens.pop();

    let result = '';
    let lastPos = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== TokenType.Table || t.value !== tableName) continue;

      // Need Dot + Field next
      if (i + 2 >= tokens.length) continue;
      const dot = tokens[i + 1];
      const f = tokens[i + 2];
      if (!dot || dot.value !== '.' || !f || f.type !== TokenType.Field || f.value !== oldFieldName) continue;

      // Matched — replace the whole `tableName.fieldName` segment
      result += formula.slice(lastPos, t.pos);
      result += tableName + '.' + newFieldName;
      lastPos = f.pos + f.value.length;
      i += 2; // skip Dot + Field
    }

    result += formula.slice(lastPos);
    return result;
  } catch {
    return formula;
  }
}
