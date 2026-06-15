import { describe, it, expect } from 'vitest';
import {
  formulaCodeToDisplay,
  formulaDisplayToCode,
  findAmbiguousRefs,
  getCellDisplayPath,
} from '../src/utils/formulaTransforms';
import { CellDefinition, Parameter } from '../src/types';

function makeCells(): CellDefinition[] {
  return [
    // Root: 施工进度安排
    { id: 'c1', code: '1', name: '施工进度安排', parentId: null, sortOrder: 0, tableId: 't1', formula: '', type: 'Input', isArray: true, scope: 'both' },
    // Dynamic investment group
    { id: 'c2', code: '2', name: '动态总投资', parentId: null, sortOrder: 1, tableId: 't1', formula: '', type: 'Input', isArray: true, scope: 'both' },
    { id: 'c21', code: '2.1', name: '静态总投资', parentId: 'c2', sortOrder: 2, tableId: 't1', formula: '=参数.项目静态总投资*资金筹措表.1', type: 'Formula', isArray: true, scope: 'both' },
    { id: 'c22', code: '2.2', name: '建设期利息', parentId: 'c2', sortOrder: 3, tableId: 't1', formula: '=资金筹措表.3.1.2', type: 'Formula', isArray: true, scope: 'both' },
    // Source group
    { id: 'c3', code: '3', name: '资金来源', parentId: null, sortOrder: 4, tableId: 't1', formula: '', type: 'Input', isArray: true, scope: 'both' },
    { id: 'c31', code: '3.1', name: '资本金', parentId: 'c3', sortOrder: 5, tableId: 't1', formula: '', type: 'Input', isArray: true, scope: 'both' },
    { id: 'c311', code: '3.1.1', name: '用于建设投资', parentId: 'c31', sortOrder: 6, tableId: 't1', formula: '', type: 'Input', isArray: true, scope: 'both' },
    { id: 'c312', code: '3.1.2', name: '用于建设期利息', parentId: 'c31', sortOrder: 7, tableId: 't1', formula: '', type: 'Input', isArray: true, scope: 'both' },
    { id: 'c32', code: '3.2', name: '债务资金', parentId: 'c3', sortOrder: 8, tableId: 't1', formula: '', type: 'Input', isArray: true, scope: 'both' },
    { id: 'c321', code: '3.2.1', name: '用于建设投资', parentId: 'c32', sortOrder: 9, tableId: 't1', formula: '', type: 'Input', isArray: true, scope: 'both' },
    { id: 'c322', code: '3.2.2', name: '用于建设期利息', parentId: 'c32', sortOrder: 10, tableId: 't1', formula: '', type: 'Input', isArray: true, scope: 'both' },
  ];
}

const tables = [{ id: 't1', name: '资金筹措表' }];
const parameters: Parameter[] = [
  { id: 'p1', name: '项目静态总投资' },
  { id: 'p2', name: '建设期利息贷款利率' },
];

const model = { cells: makeCells(), tables, parameters };

describe('formulaCodeToDisplay', () => {
  it('converts single code ref to full path', () => {
    expect(formulaCodeToDisplay('=资金筹措表.3.2.2', model)).toBe('=资金筹措表.资金来源.债务资金.用于建设期利息');
  });

  it('converts multiple code refs', () => {
    expect(formulaCodeToDisplay('=资金筹措表.3.1.2 + 资金筹措表.3.2.2', model))
      .toBe('=资金筹措表.资金来源.资本金.用于建设期利息 + 资金筹措表.资金来源.债务资金.用于建设期利息');
  });

  it('leaves param refs unchanged', () => {
    expect(formulaCodeToDisplay('=参数.项目静态总投资 * 资金筹措表.1', model))
      .toBe('=参数.项目静态总投资 * 资金筹措表.施工进度安排');
  });

  it('handles formula without leading =', () => {
    expect(formulaCodeToDisplay('资金筹措表.2.1', model))
      .toBe('资金筹措表.动态总投资.静态总投资');
  });

  it('does not touch unknown codes', () => {
    expect(formulaCodeToDisplay('=资金筹措表.99.99', model))
      .toBe('=资金筹措表.99.99');
  });
});

describe('formulaDisplayToCode', () => {
  it('converts full path back to code', () => {
    expect(formulaDisplayToCode('=资金筹措表.资金来源.债务资金.用于建设期利息', model))
      .toBe('=资金筹措表.3.2.2');
  });

  it('converts full path with params mixed', () => {
    expect(formulaDisplayToCode('=资金筹措表.资金来源.资本金.用于建设期利息 + 参数.项目静态总投资', model))
      .toBe('=资金筹措表.3.1.2 + 参数.项目静态总投资');
  });

  it('preserves existing code refs as-is', () => {
    expect(formulaDisplayToCode('=资金筹措表.2.1 + 参数.项目静态总投资', model))
      .toBe('=资金筹措表.2.1 + 参数.项目静态总投资');
  });

  it('maps legacy bare name to first code for backward compat', () => {
    // "用于建设期利息" is ambiguous but backward compat picks first (3.1.2)
    expect(formulaDisplayToCode('=资金筹措表.用于建设期利息', model))
      .toBe('=资金筹措表.3.1.2');
  });

  it('handles longer path correctly over shorter path with same prefix', () => {
    // 2.2 is "建设期利息", 3.1.2 is "资本金.用于建设期利息"; ensure deep path wins
    // Actually the full path for 3.1.2 ends with "资本金.用于建设期利息" — let's test directly
    expect(formulaDisplayToCode('=资金筹措表.资金来源.资本金.用于建设期利息', model))
      .toBe('=资金筹措表.3.1.2');
  });

  it('returns empty string for empty input', () => {
    expect(formulaDisplayToCode('', model)).toBe('');
  });
});

describe('findAmbiguousRefs', () => {
  it('finds ambiguous "用于建设期利息" in a name-based formula', () => {
    const ambig = findAmbiguousRefs('=资金筹措表.用于建设期利息 + 1', { cells: model.cells, tables: model.tables });
    expect(ambig.length).toBe(1);
    expect(ambig[0].name).toBe('用于建设期利息');
    expect(ambig[0].codes).toContain('3.1.2');
    expect(ambig[0].codes).toContain('3.2.2');
  });

  it('finds ambiguous "用于建设投资"', () => {
    const ambig = findAmbiguousRefs('=资金筹措表.用于建设投资', { cells: model.cells, tables: model.tables });
    expect(ambig.length).toBe(1);
    expect(ambig[0].name).toBe('用于建设投资');
  });

  it('returns empty when no ambiguous refs', () => {
    expect(findAmbiguousRefs('=资金筹措表.3.1.2', { cells: model.cells, tables: model.tables })).toEqual([]);
  });
});

describe('getCellDisplayPath', () => {
  it('returns full path for 3.2.2', () => {
    expect(getCellDisplayPath('3.2.2', model)).toBe('资金筹措表.资金来源.债务资金.用于建设期利息');
  });

  it('returns null for unknown code', () => {
    expect(getCellDisplayPath('99.99', model)).toBeNull();
  });

  it('returns root-level path with table prefix', () => {
    expect(getCellDisplayPath('1', model)).toBe('资金筹措表.施工进度安排');
  });
});
