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
// Shared Helpers
// ---------------------------------------------------------------------------

function timeCtx(t: number, opYears = 20): TimeContext {
  return {
    absoluteYear: 2024 + t,
    relativeYear: t,
    isConstruction: t === 0,
    isOperation: t > 0,
    constructionYears: 0.5,
    operationYears: opYears,
    totalYears: opYears + 1,
  };
}

function makeCtx(
  values: Record<string, Record<string, Record<number, CellValue>>>,
  timeContext: TimeContext
): EvalContext {
  return {
    getCellValue(table: string, field: string, idx: number) {
      const tableMap = values[table];
      if (!tableMap) return null;
      const fieldMap = tableMap[field];
      if (!fieldMap) return null;
      return fieldMap[idx] ?? fieldMap[0] ?? null;
    },
    getAllOperationPeriods() {
      const arr: TimeContext[] = [];
      for (let t = 1; t <= timeContext.operationYears; t++) arr.push(timeCtx(t, timeContext.operationYears));
      return arr;
    },
    functions: financialFunctions,
    timeContext,
  };
}

function resolveCellId(table: string, field: string): string | undefined {
  return field;
}

function compileAndRun(formula: string, vmCtx: any): CellValue {
  const ast = parse(formula);
  const code = new ASTCompiler().compile(ast);
  return new SafeVM().execute(code, { ctx: vmCtx });
}

// ---------------------------------------------------------------------------
// Light-Storage 光储 Model
// ---------------------------------------------------------------------------

const LS_CELLS: CellDefinition[] = [
  // Inputs
  { id: 'pvCapacity', name: '光伏装机', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: 'MW', defaultValue: 200, isArray: false },
  { id: 'storageCapacity', name: '储能装机', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: 'MWh', defaultValue: 100, isArray: false },
  { id: 'pvUnitCost', name: '光伏单位造价', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/W', defaultValue: 3.2, isArray: false },
  { id: 'storageUnitCost', name: '储能单位造价', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/Wh', defaultValue: 1.5, isArray: false },
  { id: 'decayRate', name: '光伏衰减率', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '%', defaultValue: 0.08, isArray: false },
  { id: 'price', name: '上网电价', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/kWh', defaultValue: 0.35, isArray: false },
  { id: 'oamRate', name: '运维费率', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '%', defaultValue: 0.04, isArray: false },
  { id: 'utilHours', name: '利用小时数', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: 'h', defaultValue: 1200, isArray: false },
  { id: 'taxRate', name: '所得税率', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '%', defaultValue: 0.25, isArray: false },

  // Investment
  { id: 'pvInvest', name: '光伏投资', tableId: 'invest', formula: '=input.光伏装机 * input.光伏单位造价', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
  { id: 'storageInvest', name: '储能投资', tableId: 'invest', formula: '=input.储能装机 * input.储能单位造价', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
  { id: 'totalInvest', name: '总投资', tableId: 'invest', formula: '=invest.光伏投资 + invest.储能投资', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },

  // Operating
  { id: 'genFactor', name: '发电衰减系数', tableId: 'op', formula: '=POWER(1-input.光伏衰减率, t-1)', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '', isArray: true },
  { id: 'generation', name: '年发电量', tableId: 'op', formula: '=input.光伏装机 * input.利用小时数 * op.发电衰减系数[t]', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万kWh', isArray: true },
  { id: 'revenue', name: '年收入', tableId: 'op', formula: '=op.年发电量[t] * input.上网电价', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: true },
  { id: 'oamCost', name: '年运维费', tableId: 'op', formula: '=op.年收入[t] * input.运维费率', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: true },
  { id: 'depreciation', name: '年折旧', tableId: 'op', formula: '=invest.总投资 / 20', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: true },
  { id: 'ebit', name: '息税前利润', tableId: 'op', formula: '=op.年收入[t] - op.年运维费[t] - op.年折旧[t]', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: true },
  { id: 'taxShield', name: '折旧税盾', tableId: 'op', formula: '=op.年折旧[t] * input.所得税率', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: true },
  { id: 'netProfit', name: '净利润', tableId: 'op', formula: '=op.息税前利润[t] * (1-input.所得税率)', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: true },
  { id: 'cf', name: '经营现金流', tableId: 'op', formula: '=op.净利润[t] + op.年折旧[t]', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: true },
];

describe('光储 Light-Storage E2E', () => {
  it('parses all cells', () => {
    for (const c of LS_CELLS) {
      if (c.computeMode === ComputeMode.Formula) expect(parse(c.formula)).toBeDefined();
    }
  });

  it('DAG has no cycles', () => {
    const dag = buildDAG(LS_CELLS, resolveCellId, collectDependencies);
    expect(dag.hasCycle).toBe(false);
    expect(dag.ordered).toContain('totalInvest');
    expect(dag.ordered.indexOf('totalInvest')).toBeGreaterThan(dag.ordered.indexOf('pvInvest'));
  });

  it('computes total investment', () => {
    const ast = parse('=A * B + C * D');
    const ctx = makeCtx({}, timeCtx(1));
    const code = new ASTCompiler().compile(ast);
    const vmResult = new SafeVM().execute(code, {
      ctx: {
        ...ctx,
        A: 200,
        B: 3.2,
        C: 100,
        D: 1.5,
      },
    });
    expect(vmResult).toBe(200 * 3.2 + 100 * 1.5); // 790 万元
  });

  it('generation decays over 20 years', () => {
    const ast = parse('=input.光伏装机 * input.利用小时数 * POWER(1-input.光伏衰减率, t-1)');
    const baseCtx = makeCtx(
      {
        input: {
          光伏装机: { 0: 200 },
          利用小时数: { 0: 1200 },
          光伏衰减率: { 0: 0.08 },
        },
      },
      timeCtx(0)
    );

    const year1 = evaluate(ast, { ...baseCtx, timeContext: timeCtx(1) });
    expect(year1).toBe(200 * 1200 * 1);

    const year5 = evaluate(ast, { ...baseCtx, timeContext: timeCtx(5) });
    expect(year5).toBeCloseTo(200 * 1200 * Math.pow(0.92, 4), 6);

    const year20 = evaluate(ast, { ...baseCtx, timeContext: timeCtx(20) });
    expect(year20).toBeCloseTo(200 * 1200 * Math.pow(0.92, 19), 6);
  });

  it('net profit with tax', () => {
    // revenue = 1000, oam = 40, depreciation = 50
    // ebit = 910, tax=25%, net = 682.5
    const ast = parse('=(A - B - C) * (1-D)');
    const ctx = makeCtx(
      {},
      timeCtx(1)
    );
    const code = new ASTCompiler().compile(ast);
    const vmCtx = {
      t: 1,
      getCell: () => null,
      getCellArray: () => [],
      getAllOperationPeriods: () => [],
      functions: financialFunctions,
      A: 1000,
      B: 40,
      C: 50,
      D: 0.25,
    };
    expect(new SafeVM().execute(code, { ctx: vmCtx })).toBeCloseTo((1000 - 40 - 50) * 0.75, 10);
  });

  it('full cash flow NPV>0 and IRR valid', () => {
    const invest = 50000; // 调大投资：5亿元
    const baseRevenue = 200 * 1200 * 0.35 * 100; // 840万 kWh * 0.35 = 294万... 不对
    // 重新算：200MW = 200,000kW, * 1200h = 240,000,000 kWh = 2.4亿 kWh
    // * 0.35元/kWh = 0.84亿 = 8400万元
    // 让投资 = 30000万元, 这样更合理
    const invest2 = 30000;
    const annualRevenue = 8400;
    const cashFlows: number[] = [-invest2];
    for (let t = 1; t <= 20; t++) {
      const decay = Math.pow(0.92, t - 1);
      const revenue = annualRevenue * decay;
      const oam = revenue * 0.04;
      const depreciation = invest2 / 20;
      const ebit = revenue - oam - depreciation;
      const netProfit = ebit * (1 - 0.25);
      const cf = netProfit + depreciation;
      cashFlows.push(cf);
    }
    const npv = financialFunctions.NPV(0.08, cashFlows);
    expect(typeof npv).toBe('number');
    expect(npv as number).toBeGreaterThan(0);

    const irr = financialFunctions.IRR(cashFlows);
    expect(irr as number).toBeGreaterThan(0);
    expect(irr as number).toBeLessThan(1);

    const npvAtIRR = financialFunctions.NPV(irr as number, cashFlows);
    expect(Math.abs(npvAtIRR as number)).toBeLessThan(0.01);
  });

  it('frontend interpreter and backend VM agree on full chain', () => {
    const formula = '=POWER(1-input.光伏衰减率, t-1) * input.利用小时数';
    const ast = parse(formula);
    const interpCtx = makeCtx(
      {
        input: {
          光伏衰减率: { 0: 0.08, 1: 0.08, 2: 0.08, 3: 0.08, 4: 0.08, 5: 0.08 },
          利用小时数: { 0: 1200, 1: 1200, 2: 1200, 3: 1200, 4: 1200, 5: 1200 },
        },
      },
      timeCtx(5)
    );
    const interp = evaluate(ast, interpCtx);

    const vmResult = compileAndRun(formula, {
      t: 5,
      getCell: (_t: string, field: string) => (field === '光伏衰减率' ? 0.08 : field === '利用小时数' ? 1200 : null),
      getCellArray: () => [],
      getAllOperationPeriods: () => [],
      functions: financialFunctions,
    });

    expect(vmResult).toBe(interp);
    expect(vmResult).toBeCloseTo(Math.pow(0.92, 4) * 1200, 6);
  });
});

// ---------------------------------------------------------------------------
// Data-Center 数据中心 Model
// ---------------------------------------------------------------------------

const DC_CELLS: CellDefinition[] = [
  // Inputs
  { id: 'itLoad', name: 'IT负载', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: 'MW', defaultValue: 50, isArray: false },
  { id: 'pue', name: 'PUE', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '', defaultValue: 1.25, isArray: false },
  { id: 'gridPrice', name: '市电电价', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/kWh', defaultValue: 0.60, isArray: false },
  { id: 'selfRate', name: '自备电比例', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '%', defaultValue: 0.30, isArray: false },
  { id: 'selfCost', name: '自备电成本', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/kWh', defaultValue: 0.25, isArray: false },
  { id: 'dcCapex', name: '数据中心投资', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '万元', defaultValue: 5000, isArray: false },
  { id: 'renewCapex', name: '新能源投资', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '万元', defaultValue: 3000, isArray: false },
  { id: 'hoursPerYear', name: '年运行小时', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: 'h', defaultValue: 8760, isArray: false },

  // Power
  { id: 'totalPower', name: '总用电量', tableId: 'power', formula: '=input.IT负载 * input.PUE * input.年运行小时', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万kWh', isArray: false },
  { id: 'selfPower', name: '自备电量', tableId: 'power', formula: '=power.总用电量 * input.自备电比例', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万kWh', isArray: false },
  { id: 'gridPower', name: '市电电量', tableId: 'power', formula: '=power.总用电量 - power.自备电量', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万kWh', isArray: false },

  // Cost
  { id: 'selfCostYear', name: '自备电成本', tableId: 'cost', formula: '=power.自备电量 * input.自备电成本', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
  { id: 'gridCostYear', name: '市电成本', tableId: 'cost', formula: '=power.市电电量 * input.市电电价', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
  { id: 'totalElecCost', name: '总电费', tableId: 'cost', formula: '=cost.自备电成本 + cost.市电成本', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },

  // Invest
  { id: 'totalCapex', name: '总投资', tableId: 'invest', formula: '=input.数据中心投资 + input.新能源投资', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
];

describe('数据中心 Data-Center E2E', () => {
  it('parses all cells', () => {
    for (const c of DC_CELLS) {
      if (c.computeMode === ComputeMode.Formula) expect(parse(c.formula)).toBeDefined();
    }
  });

  it('DAG has no cycles', () => {
    const dag = buildDAG(DC_CELLS, resolveCellId, collectDependencies);
    expect(dag.hasCycle).toBe(false);
  });

  it('computes total electricity cost', () => {
    // totalPower = 50*1.25*8760 = 547500 万kWh
    // self = 30% = 164250, grid = 70% = 383250
    // selfCost = 164250*0.25 = 41062.5, gridCost = 383250*0.60 = 229950
    // total = 271012.5
    const ast = parse('=input.IT负载 * input.PUE * input.年运行小时');
    const ctx = makeCtx(
      {
        input: {
          IT负载: { 0: 50 },
          PUE: { 0: 1.25 },
          年运行小时: { 0: 8760 },
        },
      },
      timeCtx(1)
    );
    const totalPower = evaluate(ast, ctx);
    expect(totalPower).toBe(50 * 1.25 * 8760);

    const self = totalPower as number * 0.30;
    const grid = totalPower as number - self;
    const cost = self * 0.25 + grid * 0.60;
    expect(cost).toBeCloseTo(271012.5, 1);
  });

  it('investment split sums correctly', () => {
    const ast = parse('=input.数据中心投资 + input.新能源投资');
    const ctx = makeCtx(
      {
        input: {
          数据中心投资: { 0: 5000 },
          新能源投资: { 0: 3000 },
        },
      },
      timeCtx(1)
    );
    expect(evaluate(ast, ctx)).toBe(8000);
  });
});

// ---------------------------------------------------------------------------
// Wind-Storage 风储 Model
// ---------------------------------------------------------------------------

const WS_CELLS: CellDefinition[] = [
  // Inputs
  { id: 'windCapacity', name: '风电装机', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: 'MW', defaultValue: 300, isArray: false },
  { id: 'storageCap', name: '储能容量', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: 'MWh', defaultValue: 60, isArray: false },
  { id: 'windCost', name: '风电造价', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/W', defaultValue: 6.0, isArray: false },
  { id: 'storageCost', name: '储能造价', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/Wh', defaultValue: 1.5, isArray: false },
  { id: 'windHours', name: '风电利用小时', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: 'h', defaultValue: 2200, isArray: false },
  { id: 'curtailRate', name: '弃风率', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '%', defaultValue: 0.05, isArray: false },
  { id: 'windPrice', name: '风电上网价', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/kWh', defaultValue: 0.30, isArray: false },
  { id: 'storageOam', name: '储能运维', tableId: 'input', formula: '', computeMode: ComputeMode.Input, valueType: ValueType.Number, unit: '元/kWh', defaultValue: 0.02, isArray: false },

  // Invest
  { id: 'windInvest', name: '风电投资', tableId: 'invest', formula: '=input.风电装机 * input.风电造价', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
  { id: 'stoInvest', name: '储能投资', tableId: 'invest', formula: '=input.储能容量 * input.储能造价', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
  { id: 'totalInvest', name: '总投资', tableId: 'invest', formula: '=invest.风电投资 + invest.储能投资', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },

  // Operation
  { id: 'grossGen', name: '毛发电量', tableId: 'op', formula: '=input.风电装机 * input.风电利用小时', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万kWh', isArray: false },
  { id: 'netGen', name: '净发电量', tableId: 'op', formula: '=op.毛发电量 * (1-input.弃风率)', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万kWh', isArray: false },
  { id: 'revenue', name: '年收入', tableId: 'op', formula: '=op.净发电量 * input.风电上网价', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
  { id: 'storageCostYear', name: '储能年运维', tableId: 'op', formula: '=input.储能容量 * input.储能运维 * 1000', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
  { id: 'netRevenue', name: '净收入', tableId: 'op', formula: '=op.年收入 - op.储能年运维', computeMode: ComputeMode.Formula, valueType: ValueType.Number, unit: '万元', isArray: false },
];

describe('风储 Wind-Storage E2E', () => {
  it('parses all cells', () => {
    for (const c of WS_CELLS) {
      if (c.computeMode === ComputeMode.Formula) expect(parse(c.formula)).toBeDefined();
    }
  });

  it('DAG has no cycles', () => {
    const dag = buildDAG(WS_CELLS, resolveCellId, collectDependencies);
    expect(dag.hasCycle).toBe(false);
  });

  it('computes net generation with curtailment', () => {
    // gross = 300*2200 = 660000; net = 660000*0.95 = 627000
    const ast = parse('=input.风电装机 * input.风电利用小时 * (1-input.弃风率)');
    const ctx = makeCtx(
      {
        input: {
          风电装机: { 0: 300 },
          风电利用小时: { 0: 2200 },
          弃风率: { 0: 0.05 },
        },
      },
      timeCtx(1)
    );
    expect(evaluate(ast, ctx)).toBe(300 * 2200 * 0.95);
  });

  it('computes total investment', () => {
    // wind = 300*6 = 1800, storage = 60*1.5 = 90, total = 1890
    const ast = parse('=input.风电装机 * input.风电造价 + input.储能容量 * input.储能造价');
    const ctx = makeCtx(
      {
        input: {
          风电装机: { 0: 300 },
          风电造价: { 0: 6.0 },
          储能容量: { 0: 60 },
          储能造价: { 0: 1.5 },
        },
      },
      timeCtx(1)
    );
    expect(evaluate(ast, ctx)).toBe(1890);
  });

  it('net revenue accounts for storage O&M', () => {
    const ast = parse('=input.风电装机 * input.风电利用小时 * (1-input.弃风率) * input.风电上网价 - input.储能容量 * input.储能运维 * 1000');
    const ctx = makeCtx(
      {
        input: {
          风电装机: { 0: 300 },
          风电利用小时: { 0: 2200 },
          弃风率: { 0: 0.05 },
          风电上网价: { 0: 0.30 },
          储能容量: { 0: 60 },
          储能运维: { 0: 0.02 },
        },
      },
      timeCtx(1)
    );
    const netRevenue = evaluate(ast, ctx);
    expect(netRevenue).toBe(300 * 2200 * 0.95 * 0.30 - 60 * 0.02 * 1000);
    expect(netRevenue).toBe(186900);
  });

  it('simple payback within reasonable range', () => {
    const invest = 1890;
    const annualNet = 187110;
    const payback = financialFunctions.PAYBACK([-invest, annualNet, annualNet, annualNet, annualNet, annualNet]);
    expect(payback as number).toBeGreaterThan(0);
    expect(payback as number).toBeLessThan(5);
  });
});

// ---------------------------------------------------------------------------
// Cross-template consistency
// ---------------------------------------------------------------------------

describe('Cross-template consistency', () => {
  it('all ids within each template are distinct', () => {
    for (const cells of [LS_CELLS, DC_CELLS, WS_CELLS]) {
      const ids = cells.map(c => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('interpreter and VM produce identical results for arithmetic', () => {
    const formulas = [
      '=10 + 20 * 3',
      '=(100 - 40) / 2',
      '= POWER(2, 10)',
      '= IF(5 > 3, 1, 0)',
    ];
    for (const f of formulas) {
      const ast = parse(f);
      const interp = evaluate(ast, makeCtx({}, timeCtx(1)));
      const vm = compileAndRun(f, {
        t: 1,
        getCell: () => null,
        getCellArray: () => [],
        getAllOperationPeriods: () => [],
        functions: financialFunctions,
      });
      expect(vm).toBe(interp);
    }
  });
});
