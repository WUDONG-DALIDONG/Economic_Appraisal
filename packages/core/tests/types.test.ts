import { describe, it, expect } from 'vitest';
import {
  CellValue,
  isNumericValue,
  isArrayValue,
  CellReference,
  TimeContext,
  ASTNode,
  ASTNodeType,
  CellDefinition,
  ComputeMode,
  ValueType,
  TableDefinition,
  ModelDefinition,
  ParameterDefinition,
  EvaluationResult,
} from '../src/types';

describe('CellValue type guards', () => {
  it('isNumericValue returns true for numbers', () => {
    expect(isNumericValue(42)).toBe(true);
    expect(isNumericValue(3.14)).toBe(true);
    expect(isNumericValue(0)).toBe(true);
    expect(isNumericValue(-5)).toBe(true);
  });

  it('isNumericValue returns false for non-numbers', () => {
    expect(isNumericValue('hello')).toBe(false);
    expect(isNumericValue(true)).toBe(false);
    expect(isNumericValue(null)).toBe(false);
    expect(isNumericValue([1, 2, 3])).toBe(false);
    expect(isNumericValue(undefined)).toBe(false);
  });

  it('isArrayValue returns true for arrays', () => {
    expect(isArrayValue([1, 2, 3])).toBe(true);
    expect(isArrayValue([])).toBe(true);
    expect(isArrayValue([1])).toBe(true);
  });

  it('isArrayValue returns false for non-arrays', () => {
    expect(isArrayValue(42)).toBe(false);
    expect(isArrayValue('hello')).toBe(false);
    expect(isArrayValue(null)).toBe(false);
    expect(isArrayValue(undefined)).toBe(false);
  });
});

describe('ASTNode discriminated union', () => {
  it('Literal node has correct shape', () => {
    const node: ASTNode = {
      type: ASTNodeType.Literal,
      value: 42,
    };
    expect(node.type).toBe(ASTNodeType.Literal);
    expect(node.value).toBe(42);
  });

  it('CellRef node has correct shape', () => {
    const node: ASTNode = {
      type: ASTNodeType.CellRef,
      table: '表1',
      field: 'A',
      timeShift: 0,
      timeRange: null,
    };
    expect(node.type).toBe(ASTNodeType.CellRef);
    expect(node.table).toBe('表1');
    expect(node.field).toBe('A');
    expect(node.timeShift).toBe(0);
    expect(node.timeRange).toBeNull();
  });

  it('CellRef node supports wildcard timeRange', () => {
    const node: ASTNode = {
      type: ASTNodeType.CellRef,
      table: '表1',
      field: 'A',
      timeShift: 0,
      timeRange: '*',
    };
    expect(node.timeRange).toBe('*');
  });

  it('CellRef node supports explicit timeRange', () => {
    const node: ASTNode = {
      type: ASTNodeType.CellRef,
      table: '表1',
      field: 'A',
      timeShift: 0,
      timeRange: { start: 1, end: 5 },
    };
    expect(node.timeRange).toEqual({ start: 1, end: 5 });
  });

  it('BinaryOp node has left and right children', () => {
    const node: ASTNode = {
      type: ASTNodeType.BinaryOp,
      operator: '+',
      left: { type: ASTNodeType.Literal, value: 1 },
      right: { type: ASTNodeType.Literal, value: 2 },
    };
    expect(node.type).toBe(ASTNodeType.BinaryOp);
    expect(node.operator).toBe('+');
    expect(node.left.type).toBe(ASTNodeType.Literal);
    expect(node.right.type).toBe(ASTNodeType.Literal);
  });

  it('UnaryOp node has operand child', () => {
    const node: ASTNode = {
      type: ASTNodeType.UnaryOp,
      operator: '-',
      operand: { type: ASTNodeType.Literal, value: 5 },
    };
    expect(node.type).toBe(ASTNodeType.UnaryOp);
    expect(node.operator).toBe('-');
  });

  it('FunctionCall node has name and args', () => {
    const node: ASTNode = {
      type: ASTNodeType.FunctionCall,
      name: 'SUM',
      args: [
        { type: ASTNodeType.Literal, value: 1 },
        { type: ASTNodeType.Literal, value: 2 },
      ],
    };
    expect(node.type).toBe(ASTNodeType.FunctionCall);
    expect(node.name).toBe('SUM');
    expect(node.args).toHaveLength(2);
  });

  it('Identifier node has name', () => {
    const node: ASTNode = {
      type: ASTNodeType.Identifier,
      name: 'pi',
    };
    expect(node.type).toBe(ASTNodeType.Identifier);
    expect(node.name).toBe('pi');
  });

  it('ScriptBlock node has code', () => {
    const node: ASTNode = {
      type: ASTNodeType.ScriptBlock,
      language: 'javascript',
      code: 'return 42;',
    };
    expect(node.type).toBe(ASTNodeType.ScriptBlock);
    expect(node.language).toBe('javascript');
    expect(node.code).toBe('return 42;');
  });
});

describe('CellDefinition', () => {
  it('creates a basic cell definition', () => {
    const cell: CellDefinition = {
      id: 'cell-001',
      name: '静态投资额',
      tableId: 'table-1',
      formula: '=A1 + B1',
      computeMode: ComputeMode.Formula,
      valueType: ValueType.Number,
      unit: '万元',
      description: '项目总投资',
    };
    expect(cell.id).toBe('cell-001');
    expect(cell.tableId).toBe('table-1');
    expect(cell.computeMode).toBe(ComputeMode.Formula);
  });

  it('supports Input cell type', () => {
    const cell: CellDefinition = {
      id: 'cell-002',
      name: '建设期年数',
      tableId: 'table-1',
      formula: '',
      computeMode: ComputeMode.Input,
      valueType: ValueType.Number,
      unit: '年',
      defaultValue: 7,
    };
    expect(cell.computeMode).toBe(ComputeMode.Input);
    expect(cell.defaultValue).toBe(7);
  });

  it('supports Script cell type', () => {
    const cell: CellDefinition = {
      id: 'cell-003',
      name: '复杂计算',
      tableId: 'table-1',
      formula: 'javascript:return 42;',
      computeMode: ComputeMode.Script,
      valueType: ValueType.Number,
      unit: '',
    };
    expect(cell.computeMode).toBe(ComputeMode.Script);
  });
});

describe('ModelDefinition', () => {
  it('creates a minimal model definition', () => {
    const model: ModelDefinition = {
      id: 'model-001',
      name: '光储项目财务模型',
      version: '1.0',
      description: '光储一体化项目财务评价',
      tables: [],
      cells: [],
      parameters: [],
      timeline: {
        constructionYears: 0.583,
        operationYears: 25,
        startYear: 2024,
      },
      metadata: {
        author: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    expect(model.id).toBe('model-001');
    expect(model.timeline.constructionYears).toBe(0.583);
    expect(model.timeline.operationYears).toBe(25);
  });

  it('supports multiple tables', () => {
    const model: ModelDefinition = {
      id: 'model-002',
      name: '测试模型',
      version: '1.0',
      description: '',
      tables: [
        {
          id: 'table-1',
          name: '表1 投资估算',
          order: 1,
        },
        {
          id: 'table-2',
          name: '表4 利润表',
          order: 2,
        },
      ],
      cells: [],
      parameters: [],
      timeline: {
        constructionYears: 1,
        operationYears: 20,
        startYear: 2024,
      },
      metadata: {
        author: 'test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    expect(model.tables).toHaveLength(2);
    expect(model.tables[0].order).toBe(1);
  });
});

describe('ParameterDefinition', () => {
  it('creates a number parameter', () => {
    const param: ParameterDefinition = {
      id: 'param-001',
      name: '静态投资额',
      valueType: ValueType.Number,
      computeMode: ComputeMode.Input,
      defaultValue: 10000,
      min: 0,
      max: 1000000,
      unit: '万元',
      description: '项目总投资',
    };
    expect(param.valueType).toBe(ValueType.Number);
    expect(param.defaultValue).toBe(10000);
  });

  it('creates a percentage parameter', () => {
    const param: ParameterDefinition = {
      id: 'param-002',
      name: '增值税率',
      valueType: ValueType.Percentage,
      computeMode: ComputeMode.Input,
      defaultValue: 0.13,
      min: 0,
      max: 1,
      unit: '%',
      description: '增值税税率',
    };
    expect(param.valueType).toBe(ValueType.Percentage);
    expect(param.defaultValue).toBe(0.13);
  });

  it('creates an enum parameter', () => {
    const param: ParameterDefinition = {
      id: 'param-003',
      name: '折旧方法',
      valueType: ValueType.Enum,
      computeMode: ComputeMode.Input,
      defaultValue: '直线法',
      options: ['直线法', '双倍余额递减法', '年数总和法'],
      unit: '',
      description: '固定资产折旧方法',
    };
    expect(param.valueType).toBe(ValueType.Enum);
    expect(param.options).toContain('直线法');
  });
});

describe('TimeContext', () => {
  it('creates a valid time context', () => {
    const ctx: TimeContext = {
      absoluteYear: 2024,
      relativeYear: 1,
      isConstruction: false,
      isOperation: true,
      constructionYears: 0.583,
      operationYears: 25,
      totalYears: 25.583,
    };
    expect(ctx.absoluteYear).toBe(2024);
    expect(ctx.isConstruction).toBe(false);
    expect(ctx.isOperation).toBe(true);
  });
});

describe('EvaluationResult', () => {
  it('creates a successful evaluation result', () => {
    const result: EvaluationResult = {
      success: true,
      value: 1234.56,
      dependencies: ['cell-001', 'cell-002'],
    };
    expect(result.success).toBe(true);
    expect(result.value).toBe(1234.56);
    expect(result.dependencies).toHaveLength(2);
  });

  it('creates a failed evaluation result', () => {
    const result: EvaluationResult = {
      success: false,
      error: '除零错误',
      value: null,
      dependencies: [],
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe('除零错误');
    expect(result.value).toBeNull();
  });
});

describe('CellReference', () => {
  it('creates a basic cell reference', () => {
    const ref: CellReference = {
      table: '表1',
      field: 'A',
    };
    expect(ref.table).toBe('表1');
    expect(ref.field).toBe('A');
    expect(ref.timeIndex).toBeUndefined();
  });

  it('creates a time-indexed cell reference', () => {
    const ref: CellReference = {
      table: '表4',
      field: '净利润',
      timeIndex: 3,
    };
    expect(ref.timeIndex).toBe(3);
  });

  it('creates a wildcard time range reference', () => {
    const ref: CellReference = {
      table: '表7',
      field: '净现金流',
      timeIndex: '*',
    };
    expect(ref.timeIndex).toBe('*');
  });
});
