import { describe, it, expect } from 'vitest';
import { ExcelExporter } from '../src/export/ExcelExporter';
import { ModelDefinition, CellType, TableDefinition, CellDefinition, ParameterDefinition } from '@economic/core';
import { ResultRow } from '../src/repository/ResultRepository';
import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeModel(): ModelDefinition {
  const tables: TableDefinition[] = [
    { id: 'input', name: '参数输入', order: 0 },
    { id: 'invest', name: '投资估算表', order: 1 },
    { id: 'profit', name: '利润表', order: 2 },
  ];

  const cells: CellDefinition[] = [
    // input
    { id: 'capacity', name: '装机容量', tableId: 'input', formula: '', type: CellType.Input, unit: 'MW', defaultValue: 100, isArray: false },
    { id: 'price', name: '上网电价', tableId: 'input', formula: '', type: CellType.Input, unit: '元/kWh', defaultValue: 0.35, isArray: false },
    // invest
    { id: 'totalInvest', name: '总投资', tableId: 'invest', formula: '=input.装机容量 * 3.5', type: CellType.Formula, unit: '万元', isArray: false },
    // profit
    { id: 'year1Revenue', name: '第1年收入', tableId: 'profit', formula: '=input.装机容量 * input.上网电价', type: CellType.Formula, unit: '万元', isArray: true },
    { id: 'year2Revenue', name: '第2年收入', tableId: 'profit', formula: '=input.装机容量 * input.上网电价 * 0.9', type: CellType.Formula, unit: '万元', isArray: true },
  ];

  const parameters: ParameterDefinition[] = [
    { id: 'discountRate', name: '折现率', type: 'number', defaultValue: 0.08, unit: '%', description: '项目折现率' },
    { id: 'taxRate', name: '所得税率', type: 'number', defaultValue: 0.25, unit: '%' },
  ];

  return {
    id: 'test-model-001',
    name: '光储测试模型',
    version: '1.0.0',
    description: '用于导出的测试模型',
    tables,
    cells,
    parameters,
    timeline: { baseYear: 2024, constructionYears: 0.5, operationYears: 20, startMonth: 1 },
    metadata: {},
  };
}

function makeResults(): ResultRow[] {
  return [
    { id: 1, cellId: 'capacity', modelId: 'test-model-001', timeIndex: 0, value: 100, computedAt: '' },
    { id: 2, cellId: 'price', modelId: 'test-model-001', timeIndex: 0, value: 0.35, computedAt: '' },
    { id: 3, cellId: 'totalInvest', modelId: 'test-model-001', timeIndex: 0, value: 350, computedAt: '' },
    { id: 4, cellId: 'year1Revenue', modelId: 'test-model-001', timeIndex: 1, value: 35, computedAt: '' },
    { id: 5, cellId: 'year2Revenue', modelId: 'test-model-001', timeIndex: 2, value: 31.5, computedAt: '' },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExcelExporter', () => {
  it('exports a valid xlsx buffer', () => {
    const exporter = new ExcelExporter();
    const buf = exporter.export(makeModel(), makeResults());
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('creates correct sheet names', () => {
    const exporter = new ExcelExporter();
    const buf = exporter.export(makeModel(), makeResults());
    const wb = XLSX.read(buf, { type: 'buffer' });

    expect(wb.SheetNames).toContain('参数输入');
    expect(wb.SheetNames).toContain('投资估算表');
    expect(wb.SheetNames).toContain('利润表');
    expect(wb.SheetNames).toContain('模型说明');
    expect(wb.SheetNames).toContain('模型参数');
  });

  it('table sheet has correct headers', () => {
    const exporter = new ExcelExporter();
    const buf = exporter.export(makeModel(), makeResults());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets['投资估算表'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    expect(data[0]).toContain('指标');
    expect(data[0]).toContain('类型');
    expect(data[0]).toContain('单位');
    expect(data[0]).toContain('公式');
    expect(data[0]).toContain('建设期');
  });

  it('table sheet contains cell values', () => {
    const exporter = new ExcelExporter();
    const buf = exporter.export(makeModel(), makeResults());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets['投资估算表'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    // Row 2 = totalInvest
    const totalInvestRow = data.find((row: string[]) => row[0] === '总投资');
    expect(totalInvestRow).toBeDefined();
    expect(totalInvestRow![1]).toBe('Formula');
    expect(totalInvestRow![2]).toBe('万元');
    expect(totalInvestRow![3]).toBe('=input.装机容量 * 3.5');
    // Value at 建设期 (column index 4 because of formula column)
    expect(totalInvestRow![4]).toBe(350);
  });

  it('profit sheet has year columns', () => {
    const exporter = new ExcelExporter();
    const buf = exporter.export(makeModel(), makeResults());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets['利润表'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    expect(data[0]).toContain('第1年');
    expect(data[0]).toContain('第2年');

    const y1Row = data.find((row: string[]) => row[0] === '第1年收入');
    expect(y1Row).toBeDefined();
    expect(y1Row![1]).toBe('Formula');
    expect(y1Row![5]).toBe(35); // header=6 cols, 第1年 is col index 5
  });

  it('parameters sheet contains all params', () => {
    const exporter = new ExcelExporter();
    const buf = exporter.export(makeModel(), makeResults());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets['模型参数'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    expect(data[0]).toEqual(['参数名', '当前值', '类型', '单位', '描述']);
    expect(data.length).toBe(3); // header + 2 params

    const discountRow = data.find((row: string[]) => row[0] === '折现率');
    expect(discountRow).toBeDefined();
    expect(discountRow![1]).toBe(0.08);
  });

  it('metadata sheet contains model info', () => {
    const exporter = new ExcelExporter();
    const buf = exporter.export(makeModel(), makeResults());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets['模型说明'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    const nameRow = data.find((row: string[]) => row[0] === '模型名称');
    expect(nameRow![1]).toBe('光储测试模型');

    const versionRow = data.find((row: string[]) => row[0] === '版本');
    expect(versionRow![1]).toBe('1.0.0');
  });

  it('can exclude formulas', () => {
    const exporter = new ExcelExporter();
    const buf = exporter.export(makeModel(), makeResults(), { includeFormulas: false });
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets['投资估算表'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    expect(data[0]).not.toContain('公式');
    expect(data[0].length).toBe(6); // 指标,类型,单位,建设期,第1年,第2年
  });

  it('empty results produce sheet with headers only', () => {
    const exporter = new ExcelExporter();
    const buf = exporter.export(makeModel(), []);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets['投资估算表'];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

    expect(data.length).toBe(2); // header + totalInvest row (no time values)
  });
});
