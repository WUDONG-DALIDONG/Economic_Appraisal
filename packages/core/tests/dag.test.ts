import { describe, it, expect } from 'vitest';
import { buildDAG, getTransitiveDependents, getDependencies, getDependents, DAG } from '../src/dag/engine';
import { collectDependencies } from '../src/dag/dependencyExtractor';
import { CellDefinition, ComputeMode, ValueType } from '../src/types';

function makeCell(id: string, formula: string, computeMode: ComputeMode = ComputeMode.Formula): CellDefinition {
  return { id, name: id, tableId: 'test', formula, computeMode, valueType: ValueType.Number, unit: '' };
}

// Simple resolve: Table.Field → cellId
function resolveCell(table: string, field: string): string | undefined {
  // Map: cell id is just the field name or table+field
  const key = `${table}.${field}`;
  // We'll accept either key or just field name
  return field;
}

function buildTestDAG(cells: CellDefinition[]): DAG {
  const map = new Map<string, string>();
  for (const c of cells) {
    map.set(`test.${c.name}`, c.id);
    map.set(c.name, c.id);
  }
  return buildDAG(
    cells,
    (table, field) => {
      const key = `${table}.${field}`;
      // Special case: for simple formulas, table is always 'test'
      return map.get(field) ?? map.get(key);
    },
    collectDependencies
  );
}

describe('DAG - 基本构建', () => {
  it('builds trivial DAG with no dependencies', () => {
    const cells: CellDefinition[] = [
      makeCell('A', '42'),
      makeCell('B', '100'),
    ];
    const dag = buildTestDAG(cells);
    expect(dag.hasCycle).toBe(false);
    expect(dag.ordered.length).toBe(2);
  });

  it('builds DAG with simple dependency', () => {
    const cells: CellDefinition[] = [
      makeCell('A', '42'),
      makeCell('B', '=test.A + 10'),
    ];
    const dag = buildTestDAG(cells);
    expect(dag.hasCycle).toBe(false);
    expect(dag.ordered.indexOf('A')).toBeLessThan(dag.ordered.indexOf('B'));
    expect(getDependencies(dag, 'B')).toContain('A');
  });

  it('builds DAG with chain of dependencies', () => {
    const cells: CellDefinition[] = [
      makeCell('C', '1'),
      makeCell('A', '=test.C + 1'),
      makeCell('B', '=test.A + 1'),
    ];
    const dag = buildTestDAG(cells);
    expect(dag.hasCycle).toBe(false);
    expect(dag.ordered).toEqual(['C', 'A', 'B']);
  });
});

describe('DAG - 循环检测', () => {
  it('detects simple cycle', () => {
    const cells: CellDefinition[] = [
      makeCell('A', '=test.B + 1'),
      makeCell('B', '=test.A + 1'),
    ];
    const dag = buildTestDAG(cells);
    expect(dag.hasCycle).toBe(true);
    expect(dag.cyclePath).toBeDefined();
    expect(dag.cyclePath!.length).toBeGreaterThan(1);
  });

  it('detects cycle in chain', () => {
    const cells: CellDefinition[] = [
      makeCell('A', '=test.B + 1'),
      makeCell('B', '=test.C + 1'),
      makeCell('C', '=test.A + 1'),
    ];
    const dag = buildTestDAG(cells);
    expect(dag.hasCycle).toBe(true);
  });

  it('allows no cycle in diamond dependency', () => {
    const cells: CellDefinition[] = [
      makeCell('A', '1'),
      makeCell('B1', '=test.A + 1'),
      makeCell('B2', '=test.A + 2'),
      makeCell('C', '=test.B1 + test.B2'),
    ];
    const dag = buildTestDAG(cells);
    expect(dag.hasCycle).toBe(false);
    expect(dag.ordered.indexOf('A')).toBe(0);
    expect(dag.ordered.indexOf('C')).toBe(3);
  });
});

describe('DAG - 传递依赖', () => {
  it('gets transitive dependents', () => {
    const cells: CellDefinition[] = [
      makeCell('A', '1'),
      makeCell('B', '=test.A + 1'),
      makeCell('C', '=test.B + 1'),
      makeCell('D', '=test.A + 1'),
    ];
    const dag = buildTestDAG(cells);
    const dependents = getTransitiveDependents(dag, 'A');
    expect(dependents).toContain('B');
    expect(dependents).toContain('C');
    expect(dependents).toContain('D');
    // C depends on B, so B should come before C in order
    expect(dependents.indexOf('B')).toBeLessThan(dependents.indexOf('C'));
  });
});

describe('DAG - 输入单元格', () => {
  it('ignores input cells as dependencies', () => {
    const cells: CellDefinition[] = [
      { id: 'A', name: 'A', tableId: 'test', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '', defaultValue: 42 },
      makeCell('B', '=test.A + 1'),
    ];
    const dag = buildTestDAG(cells);
    expect(dag.hasCycle).toBe(false);
    expect(dag.ordered).toContain('A');
  });
});
