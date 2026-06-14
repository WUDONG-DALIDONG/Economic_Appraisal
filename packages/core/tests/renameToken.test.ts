import { describe, it, expect } from 'vitest';
import {
  renameTableInFormula,
  renameParamInFormula,
  extractTableReferences,
} from '../src/formula/renameToken';

describe('extractTableReferences', () => {
  it('extracts basic table.field refs', () => {
    const refs = extractTableReferences('=发电量.上网电价 + 成本.运维成本');
    expect(refs).toEqual([
      { table: '发电量', field: '上网电价' },
      { table: '成本', field: '运维成本' },
    ]);
  });

  it('extracts 参数 refs', () => {
    const refs = extractTableReferences('=参数.电价 * 发电量.上网电量');
    expect(refs).toEqual([
      { table: '参数', field: '电价' },
      { table: '发电量', field: '上网电量' },
    ]);
  });

  it('extracts terse bracket syntax (table[field])', () => {
    const refs = extractTableReferences('=发电量[t] * 参数.系数');
    // terse syntax table[t] → table interpreted as Table token, but no dot+field pair
    // it appears as Table + LBracket + ... so NOT counted by our dot-pair logic
    expect(refs).toEqual([
      { table: '参数', field: '系数' },
    ]);
  });

  it('returns empty on empty formula', () => {
    expect(extractTableReferences('')).toEqual([]);
  });

  it('returns empty on invalid formula', () => {
    expect(extractTableReferences('=^invalid')).toEqual([]);
  });
});

describe('renameTableInFormula', () => {
  it('renames simple dotted reference', () => {
    const out = renameTableInFormula('=发电量.上网电价 + 成本.运维费用', '发电量', '售电量');
    expect(out).toBe('=售电量.上网电价 + 成本.运维费用');
  });

  it('renames multiple occurrences', () => {
    const out = renameTableInFormula('=发电量.上网电价 + 发电量.弃电量', '发电量', '售电量');
    expect(out).toBe('=售电量.上网电价 + 售电量.弃电量');
  });

  it('renames in function arguments', () => {
    const out = renameTableInFormula('=NPV(参数.折现率, 发电量.现金流)', '发电量', '售电量');
    expect(out).toBe('=NPV(参数.折现率, 售电量.现金流)');
  });

  it('renames terse bracket syntax', () => {
    const out = renameTableInFormula('=发电量[t] + 影响系数', '发电量', '售电量');
    expect(out).toBe('=售电量[t] + 影响系数');
  });

  it('does NOT rename identifiers (no dot, not a table)', () => {
    const out = renameTableInFormula('=发电量比率 * 系数', '发电量', '售电量');
    // "发电量比率" is a single Identifier token, not Table
    expect(out).toBe('=发电量比率 * 系数');
  });

  it('preserves whitespace', () => {
    const out = renameTableInFormula('=  发电量.上网电价   +   成本.运维费用  ', '发电量', '售电量');
    expect(out).toBe('=  售电量.上网电价   +   成本.运维费用  ');
  });

  it('is case-sensitive', () => {
    const out = renameTableInFormula('=发电量.上网电价', '发电量', '售电量');
    expect(out).toBe('=售电量.上网电价');
  });

  it('returns original on bad formula (fragile, no parsing)', () => {
    // Invalid token but tokenize may or may not throw — we return original on catch
    const out = renameTableInFormula('= $ $ 发电量.电价', '发电量', '售电量');
    expect(out).toBe('= $ $ 发电量.电价'); // tokenize throws → returns original
  });

  it('returns same string when oldName === newName', () => {
    const formula = '=发电量.上网电价';
    expect(renameTableInFormula(formula, '发电量', '发电量')).toBe(formula);
  });

  it('returns original on empty formula', () => {
    expect(renameTableInFormula('', 'x', 'y')).toBe('');
  });

  it('renames inside complex expressions', () => {
    const out = renameTableInFormula(
      '=IF(参数.建设期>0, 投资.初期投资, 投资.运营投资 + 成本.人力)',
      '投资',
      '财务'
    );
    expect(out).toBe('=IF(参数.建设期>0, 财务.初期投资, 财务.运营投资 + 成本.人力)');
  });
});

describe('renameParamInFormula', () => {
  it('renames simple 参数.field', () => {
    const out = renameParamInFormula('=参数.电价 * 发电量.上网电量', '电价', '上网电价');
    expect(out).toBe('=参数.上网电价 * 发电量.上网电量');
  });

  it('renames multiple 参数 occurrences', () => {
    const out = renameParamInFormula('=参数.电价 + 参数.电价 * 2', '电价', '基础电价');
    expect(out).toBe('=参数.基础电价 + 参数.基础电价 * 2');
  });

  it('does NOT touch non-参数 namespace', () => {
    const out = renameParamInFormula('=参数.电价 + 电价.用电成本', '电价', '上网电价');
    // "电价.用电成本" — table=电价, not the 参数 namespace
    expect(out).toBe('=参数.上网电价 + 电价.用电成本');
  });

  it('does NOT touch identifiers named after the old param', () => {
    const out = renameParamInFormula('=电价 + 参数.电价', '电价', '基础电价');
    expect(out).toBe('=电价 + 参数.基础电价');
  });

  it('preserves formulas without 参数 references', () => {
    const formula = '=发电量.上网电量 * 2';
    expect(renameParamInFormula(formula, 'x', 'y')).toBe(formula);
  });

  it('returns same string when oldName === newName', () => {
    const formula = '=参数.电价';
    expect(renameParamInFormula(formula, '电价', '电价')).toBe(formula);
  });

  it('returns original on empty formula', () => {
    expect(renameParamInFormula('', 'x', 'y')).toBe('');
  });

  it('renames inside function calls', () => {
    const out = renameParamInFormula('=NPV(参数.折现率, 发电量.现金流)', '折现率', '内部收益率');
    expect(out).toBe('=NPV(参数.内部收益率, 发电量.现金流)');
  });
});
