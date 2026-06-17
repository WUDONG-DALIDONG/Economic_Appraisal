import { describe, it, expect } from 'vitest';
import { parse } from '@economic/core/src/formula/parser';
import { evaluate, EvalContext } from '@economic/core/src/formula/interpreter';
import { financialFunctions } from '@economic/core/src/formula/financialFunctions';
import { buildDAG } from '@economic/core/src/dag/engine';
import { collectDependencies } from '@economic/core/src/dag/dependencyExtractor';
import { ASTCompiler } from '../src/compiler/ASTCompiler';
import { SafeVM } from '../src/vm/SafeVM';
import { TimeContext, CellValue, CellDefinition, ComputeMode, ValueType } from '@economic/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeCtx(t: number): TimeContext {
  return {
    absoluteYear: 2024 + t,
    relativeYear: t,
    isConstruction: t === 0,
    isOperation: t > 0,
    constructionYears: 0.5,
    operationYears: 20,
    totalYears: 21,
  };
}

function makeCtx(
  values: Record<string, Record<string, Record<number, CellValue>>>,
  timeContext: TimeContext
): EvalContext {
  return {
    getCellValue(table: string, field: string, idx: number) {
      return values[table]?.[field]?.[idx] ?? null;
    },
    getAllOperationPeriods() {
      const arr: TimeContext[] = [];
      for (let t = 1; t <= timeContext.operationYears; t++) arr.push(timeCtx(t));
      return arr;
    },
    functions: financialFunctions,
    timeContext,
  };
}

function resolveCellId(table: string, field: string): string | undefined {
  return field;
}

// ---------------------------------------------------------------------------
// Minimal 光储 model cells (subset used for validation)
// ---------------------------------------------------------------------------

const sampleCells: CellDefinition[] = [
  { id: 'capacity', name: '装机容量', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: 'MW', defaultValue: 100, isArray: false },
  { id: 'unitCost', name: '单位造价', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/W', defaultValue: 3.5, isArray: false },
  { id: 'decayRate', name: '衰减率', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '%', defaultValue: 0.10, isArray: false },
  { id: 'price', name: '电价', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/度', defaultValue: 0.35, isArray: false },
  { id: 'oam', name: '运维单价', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/度', defaultValue: 0.05, isArray: false },

  { id: 'totalInvest', name: '总投资', tableId: 'invest', formula: '=input.装机容量 * input.单位造价', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
  { id: 'generationFactor', name: '发电系数', tableId: 'profit', formula: '=POWER(1-input.衰减率, t-1)', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '', isArray: true },
  { id: 'revenue', name: '年收入', tableId: 'profit', formula: '=profit.发电系数[t] * input.电价', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '亿元', isArray: true },
  { id: 'cost', name: '年成本', tableId: 'profit', formula: '=profit.发电系数[t] * input.运维单价', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '亿元', isArray: true },
  { id: 'netProfit', name: '净利润', tableId: 'profit', formula: '=profit.年收入[t] - profit.年成本[t]', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '亿元', isArray: true },
];

describe('光储 Model validation', () => {
  // -------------------------------------------------------------------------
  it('parses all sample cell formulas without error', () => {
    for (const cell of sampleCells) {
      if (cell.computeMode === ComputeMode.Formula) {
        const ast = parse(cell.formula);
        expect(ast).toBeDefined();
      }
    }
  });

  // -------------------------------------------------------------------------
  it('builds DAG for sample model without cycles', () => {
    const dag = buildDAG(
      sampleCells,
      resolveCellId,
      collectDependencies
    );
    expect(dag.hasCycle).toBe(false);
    expect(dag.ordered.length).toBeGreaterThan(0);

    const investIndex = dag.ordered.indexOf('totalInvest');
    const capIndex = dag.ordered.indexOf('capacity');
    const costIndex = dag.ordered.indexOf('unitCost');
    expect(investIndex).toBeGreaterThan(capIndex);
    expect(investIndex).toBeGreaterThan(costIndex);
  });

  // -------------------------------------------------------------------------
  it('interpreter computes total investment correctly', () => {
    const ast = parse('=input.装机容量 * input.单位造价');
    const ctx = makeCtx(
      {
        input: {
          装机容量: { 0: 100, 1: 100, 2: 100, 3: 100, 4: 100, 5: 100 },
          单位造价: { 0: 3.5, 1: 3.5, 2: 3.5, 3: 3.5, 4: 3.5, 5: 3.5 },
        },
      },
      timeCtx(1)
    );
    expect(evaluate(ast, ctx)).toBe(350);
  });

  // -------------------------------------------------------------------------
  it('interpreter computes generation decay across years', () => {
    const ast = parse('=POWER(1-input.衰减率, t-1)');
    const ctxBase = makeCtx(
      { input: { 衰减率: { 0: 0.10, 1: 0.10, 2: 0.10, 3: 0.10, 4: 0.10, 5: 0.10 } } },
      timeCtx(0)
    );

    expect(evaluate(ast, { ...ctxBase, timeContext: timeCtx(1) })).toBe(1);
    expect(evaluate(ast, { ...ctxBase, timeContext: timeCtx(2) })).toBeCloseTo(0.9, 10);
    expect(evaluate(ast, { ...ctxBase, timeContext: timeCtx(5) })).toBeCloseTo(0.6561, 10);
  });

  // -------------------------------------------------------------------------
  it('compiler+VM agree with interpreter on decay formula', () => {
    const formula = '=POWER(1-input.衰减率, t-1)';

    const ast = parse(formula);
    const interpCtx = makeCtx(
      { input: { 衰减率: { 0: 0.10, 1: 0.10, 2: 0.10, 3: 0.10 } } },
      timeCtx(3)
    );
    const interpResult = evaluate(ast, interpCtx);

    const code = new ASTCompiler().compile(ast);
    const vmResult = new SafeVM().execute(code, {
      ctx: {
        t: 3,
        getCell: (_table: string, field: string, _t: number) => {
          if (field === '衰减率') return 0.10;
          return null;
        },
        getCellArray: () => [],
        getAllOperationPeriods() { return []; },
        functions: financialFunctions,
      },
    });

    expect(vmResult).toBe(interpResult);
    expect(vmResult).toBeCloseTo(Math.pow(0.9, 2), 10);
  });

  // -------------------------------------------------------------------------
  it('compiler+VM agree with interpreter on revenue formula', () => {
    const formula = '=profit.发电系数[t] * input.电价';

    const ast = parse(formula);
    const interpCtx = makeCtx(
      {
        profit: { 发电系数: { 0: null, 1: 1, 2: 0.9, 3: 0.81, 4: 0.729 } },
        input: { 电价: { 0: 0.35, 1: 0.35, 2: 0.35, 3: 0.35, 4: 0.35 } },
      },
      timeCtx(4)
    );
    const interpResult = evaluate(ast, interpCtx);

    const code = new ASTCompiler().compile(ast);
    const vmResult = new SafeVM().execute(code, {
      ctx: {
        t: 4,
        getCell: (table: string, field: string, t: number) => {
          const data: Record<string, Record<string, Record<number, number>>> = {
            profit: { 发电系数: { 0: NaN, 1: 1, 2: 0.9, 3: 0.81, 4: 0.729 } },
            input: { 电价: { 0: 0.35, 1: 0.35, 2: 0.35, 3: 0.35, 4: 0.35 } },
          };
          return data[table]?.[field]?.[t] ?? null;
        },
        getCellArray: () => [],
        getAllOperationPeriods() { return []; },
        functions: financialFunctions,
      },
    });

    expect(vmResult).toBe(interpResult);
    expect(vmResult).toBeCloseTo(0.729 * 0.35, 10);
  });

  // -------------------------------------------------------------------------
  it('NPV on 20-year revenue stream is positive', () => {
    const revenues: number[] = [];
    const year1NetCashFlow = 1000; // 亿元
    for (let t = 1; t <= 20; t++) {
      revenues.push(year1NetCashFlow * Math.pow(0.9, t - 1));
    }
    const cashFlows = [-3500, ...revenues]; // initial investment: 3500 亿元
    const npv = financialFunctions.NPV(0.08, cashFlows);
    expect(typeof npv).toBe('number');
    expect(npv as number).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  it('IRR on 20-year project is reasonable', () => {
    const cashFlows: number[] = [-3500];
    const year1NetCashFlow = 1000;
    for (let t = 1; t <= 20; t++) {
      cashFlows.push(year1NetCashFlow * Math.pow(0.9, t - 1));
    }
    const irr = financialFunctions.IRR(cashFlows);
    expect(typeof irr).toBe('number');
    expect(irr as number).toBeGreaterThan(0);
    expect(irr as number).toBeLessThan(1);

    const npvAtIRR = financialFunctions.NPV(irr as number, cashFlows);
    expect(Math.abs(npvAtIRR as number)).toBeLessThan(0.01);
  });
});
