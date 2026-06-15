import { describe, it, expect } from 'vitest';
import {
  recomputeCodes,
  getCodeDepth,
  generateSummaryFormula,
  adjustIndentation,
} from '../src/utils/coding.js';

interface TestCell {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

const makeCells = (defs: Array<{ id: string; parentId?: string | null; sortOrder?: number }>): TestCell[] =>
  defs.map((d) => ({
    id: d.id,
    parentId: d.parentId ?? null,
    sortOrder: d.sortOrder ?? 0,
  }));

// ============================================================================
// recomputeCodes
// ============================================================================

describe('recomputeCodes', () => {
  it('assigns sequential top-level codes', () => {
    const cells = makeCells([
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
    ]);
    const result = recomputeCodes(cells);
    expect(result.get('a')).toBe('1');
    expect(result.get('b')).toBe('2');
    expect(result.get('c')).toBe('3');
  });

  it('assigns hierarchical codes for one level of children', () => {
    const cells = makeCells([
      { id: 'parent', sortOrder: 0 },
      { id: 'child1', parentId: 'parent', sortOrder: 0 },
      { id: 'child2', parentId: 'parent', sortOrder: 1 },
    ]);
    const result = recomputeCodes(cells);
    expect(result.get('parent')).toBe('1');
    expect(result.get('child1')).toBe('1.1');
    expect(result.get('child2')).toBe('1.2');
  });

  it('assigns multi-level hierarchical codes', () => {
    const cells = makeCells([
      { id: 'a', sortOrder: 0 },
      { id: 'a1', parentId: 'a', sortOrder: 0 },
      { id: 'a11', parentId: 'a1', sortOrder: 0 },
      { id: 'a12', parentId: 'a1', sortOrder: 1 },
      { id: 'b', sortOrder: 1 },
      { id: 'b1', parentId: 'b', sortOrder: 0 },
    ]);
    const result = recomputeCodes(cells);
    expect(result.get('a')).toBe('1');
    expect(result.get('a1')).toBe('1.1');
    expect(result.get('a11')).toBe('1.1.1');
    expect(result.get('a12')).toBe('1.1.2');
    expect(result.get('b')).toBe('2');
    expect(result.get('b1')).toBe('2.1');
  });

  it('respects sortOrder within siblings', () => {
    const cells = makeCells([
      { id: 'b', sortOrder: 2 },
      { id: 'a', sortOrder: 1 },
      { id: 'c', sortOrder: 3 },
    ]);
    const result = recomputeCodes(cells);
    expect(result.get('a')).toBe('1');
    expect(result.get('b')).toBe('2');
    expect(result.get('c')).toBe('3');
  });

  it('handles empty cells', () => {
    const result = recomputeCodes([]);
    expect(result.size).toBe(0);
  });

  it('handles orphans (parentId not in list) as roots', () => {
    const cells = makeCells([
      { id: 'a', parentId: 'nonexistent', sortOrder: 0 },
      { id: 'b', sortOrder: 0 },
    ]);
    const result = recomputeCodes(cells);
    expect(result.get('a')).toBe('1');
    expect(result.get('b')).toBe('2');
  });

  it('handles multiple top-level and child groups', () => {
    const cells = makeCells([
      { id: 't1', sortOrder: 0 },
      { id: 't1c1', parentId: 't1', sortOrder: 0 },
      { id: 't2', sortOrder: 1 },
      { id: 't2c1', parentId: 't2', sortOrder: 0 },
      { id: 't2c2', parentId: 't2', sortOrder: 1 },
      { id: 't3', sortOrder: 2 },
    ]);
    const result = recomputeCodes(cells);
    expect(result.get('t1')).toBe('1');
    expect(result.get('t1c1')).toBe('1.1');
    expect(result.get('t2')).toBe('2');
    expect(result.get('t2c1')).toBe('2.1');
    expect(result.get('t2c2')).toBe('2.2');
    expect(result.get('t3')).toBe('3');
  });
});

// ============================================================================
// getCodeDepth
// ============================================================================

describe('getCodeDepth', () => {
  it('returns 1 for top-level codes', () => {
    expect(getCodeDepth('1')).toBe(1);
    expect(getCodeDepth('99')).toBe(1);
  });

  it('returns 2 for one-level nested', () => {
    expect(getCodeDepth('1.1')).toBe(2);
    expect(getCodeDepth('9.12')).toBe(2);
  });

  it('returns 3 for two-level nested', () => {
    expect(getCodeDepth('1.1.1')).toBe(3);
    expect(getCodeDepth('3.2.1')).toBe(3);
  });
});

// ============================================================================
// generateSummaryFormula
// ============================================================================

describe('generateSummaryFormula', () => {
  it('returns empty for no children', () => {
    expect(generateSummaryFormula([])).toBe('');
  });

  it('generates SUM for single child', () => {
    expect(generateSummaryFormula(['1.1'])).toBe('SUM(1.1)');
  });

  it('generates SUM for multiple children', () => {
    expect(generateSummaryFormula(['1.1', '1.2', '1.3'])).toBe('SUM(1.1, 1.2, 1.3)');
  });
});

// ============================================================================
// adjustIndentation
// ============================================================================

describe('adjustIndentation', () => {
  it('indent: makes target child of previous sibling', () => {
    const cells = makeCells([
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
    ]);
    const result = adjustIndentation(cells, 'b', +1);
    const b = result.find((c) => c.id === 'b')!;
    expect(b.parentId).toBe('a');
  });

  it('outdent: promotes child to sibling of its parent', () => {
    const cells = makeCells([
      { id: 'parent', sortOrder: 0 },
      { id: 'child', parentId: 'parent', sortOrder: 0 },
    ]);
    const result = adjustIndentation(cells, 'child', -1);
    const child = result.find((c) => c.id === 'child')!;
    expect(child.parentId).toBe(null);
  });

  it('outdent nested child: moves to parent level', () => {
    const cells = makeCells([
      { id: 'a', sortOrder: 0 },
      { id: 'b', parentId: 'a', sortOrder: 0 },
      { id: 'c', parentId: 'b', sortOrder: 0 },
    ]);
    const result = adjustIndentation(cells, 'c', -1);
    const c = result.find((cell) => cell.id === 'c')!;
    expect(c.parentId).toBe('a');
  });

  it('indent root into previous sibling chain', () => {
    const cells = makeCells([
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
    ]);
    // Indent c under b
    let result = adjustIndentation(cells, 'c', +1);
    let c = result.find((cell) => cell.id === 'c')!;
    expect(c.parentId).toBe('b');

    // Indent again: c under b's last child... but b has no children
    // Actually c IS under b, so indenting c+1 would make it child of... no previous sibling
    // Let's indent b under a first, then indent c under b
  });

  it('preserves recalcSortOrder: depth-first order', () => {
    const cells = makeCells([
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
    ]);
    const result = adjustIndentation(cells, 'b', +1);
    // After indenting b under a, order should be: a, b, c (a has child b)
    const indices = new Map(result.map((c, i) => [c.id, i]));
    expect(indices.get('a')).toBeLessThan(indices.get('b')!);
    expect(indices.get('b')).toBeLessThan(indices.get('c')!);
  });

  it('no-op for unknown targetId', () => {
    const cells = makeCells([
      { id: 'a', sortOrder: 0 },
    ]);
    const result = adjustIndentation(cells, 'unknown', +1);
    expect(result).toEqual(cells);
  });

  it('outdent root is no-op', () => {
    const cells = makeCells([
      { id: 'a', sortOrder: 0 },
    ]);
    const result = adjustIndentation(cells, 'a', -1);
    const a = result.find((c) => c.id === 'a')!;
    expect(a.parentId).toBe(null);
  });
});
