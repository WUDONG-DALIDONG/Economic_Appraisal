import { tokenize, Token, TokenType } from './tokenizer';

/**
 * 从公式字符串中提取所有 table.field 引用。
 *
 * 模式: TokenType.Table + Dot + TokenType.Field
 * 同时覆盖 `表名.指标名` 和 `全局参数.参数名`。
 *
 * ScriptBlock 公式返回空数组。
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
 * 重命名 `formula` 中所有表名引用。
 *
 * 仅修改值等于 `oldName` 的 TokenType.Table token。
 * 所有点分字段名（`oldName.指标`）和方括号语法
 *（`oldName[t]`）都会被更新。
 *
 * 如果公式无法分词，则原样返回原始字符串。
 */
export function renameTableInFormula(formula: string, oldName: string, newName: string): string {
  if (!formula || !oldName || oldName === newName) return formula;
  return renameTokenSub(formula, oldName, newName, TokenType.Table);
}

/**
 * 重命名 `formula` 中的特定参数引用。
 *
 * 具体来说，将 `全局参数.oldName` 替换为 `全局参数.newName`。
 * 命名空间（`全局参数`）保持不变，仅重写字段部分。
 */
export function renameParamInFormula(formula: string, oldName: string, newName: string): string {
  if (!formula || !oldName || oldName === newName) return formula;
  return renameFieldAfterTable(formula, '全局参数', oldName, newName);
}

/* ------------------------------------------------------------------ */
/*  底层辅助函数                                                        */
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
 * 将 `tableName.fieldName` 替换为 `tableName.newFieldName`。
 * 仅当 table token 和 field token 完全匹配
 * `tableName` + `oldFieldName` 时才替换。
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

      // 后面需要 Dot + Field
      if (i + 2 >= tokens.length) continue;
      const dot = tokens[i + 1];
      const f = tokens[i + 2];
      if (!dot || dot.value !== '.' || !f || f.type !== TokenType.Field || f.value !== oldFieldName) continue;

      // 匹配成功 — 替换整个 `tableName.fieldName` 段
      result += formula.slice(lastPos, t.pos);
      result += tableName + '.' + newFieldName;
      lastPos = f.pos + f.value.length;
      i += 2; // 跳过 Dot + Field
    }

    result += formula.slice(lastPos);
    return result;
  } catch {
    return formula;
  }
}
