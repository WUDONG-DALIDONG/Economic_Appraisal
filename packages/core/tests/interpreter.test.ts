import { describe, it, expect } from 'vitest';
import { evaluate, EvalContext } from '../src/formula/interpreter';
import { parse } from '../src/formula/parser';
import { ASTNode, TimeContext, CellValue, ASTNodeType } from '../src/types';
import { createTimeline } from '../src/timeline';

function makeContext(
  values: Record<string, Record<number, CellValue>>,
  timeCtx: TimeContext,
  customFunctions: Record<string, (...args: CellValue[]) => CellValue> = {}
): EvalContext {
  const allPeriods = [];
  for (let t = 1; t <= timeCtx.operationYears; t++) {
    allPeriods.push(createTimeline({
      constructionYears: timeCtx.constructionYears,
      operationYears: timeCtx.operationYears,
      startYear: timeCtx.absoluteYear - timeCtx.relativeYear + 1,
    }).getOperationPeriod(t)!);
  }

  return {
    getCellValue(table: string, field: string, timeIndex: number): CellValue {
      const key = `${table}.${field}`;
      return values[key]?.[timeIndex] ?? null;
    },
    getAllOperationPeriods: () => allPeriods,
    timeContext: timeCtx,
    functions: {
      SUM: (...args) => args.flat().reduce((a: number, b) => a + (typeof b === 'number' ? b : 0), 0),
      MAX: (...args) => Math.max(...args.flat().map(v => typeof v === 'number' ? v : -Infinity)),
      MIN: (...args) => Math.min(...args.flat().map(v => typeof v === 'number' ? v : Infinity)),
      ABS: (x) => typeof x === 'number' ? Math.abs(x) : null,
      POWER: (base, exp) =>
        (typeof base === 'number' && typeof exp === 'number') ? Math.pow(base, exp) : null,
      ...customFunctions,
    },
  };
}

describe('Interpreter - 字面量', () => {
  it('evaluates number literal', () => {
    const ctx = makeContext({}, {
      absoluteYear: 2024, relativeYear: 1,
      isConstruction: false, isOperation: true,
      constructionYears: 0, operationYears: 5, totalYears: 5,
    });
    const ast = parse('42');
    expect(evaluate(ast, ctx)).toBe(42);
  });

  it('evaluates string literal', () => {
    const ctx = makeContext({}, {
      absoluteYear: 2024, relativeYear: 1,
      isConstruction: false, isOperation: true,
      constructionYears: 0, operationYears: 5, totalYears: 5,
    });
    const ast = parse('"hello"');
    expect(evaluate(ast, ctx)).toBe('hello');
  });

  it('evaluates boolean literal', () => {
    const ctx = makeContext({}, {
      absoluteYear: 2024, relativeYear: 1,
      isConstruction: false, isOperation: true,
      constructionYears: 0, operationYears: 5, totalYears: 5,
    });
    expect(evaluate(parse('true'), ctx)).toBe(true);
    expect(evaluate(parse('false'), ctx)).toBe(false);
  });
});

describe('Interpreter - 算术运算', () => {
  const timeCtx: TimeContext = {
    absoluteYear: 2024, relativeYear: 3,
    isConstruction: false, isOperation: true,
    constructionYears: 0, operationYears: 10, totalYears: 10,
  };

  it('evaluates addition', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('2 + 3'), ctx)).toBe(5);
  });

  it('evaluates subtraction', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('10 - 3'), ctx)).toBe(7);
  });

  it('evaluates multiplication', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('4 * 5'), ctx)).toBe(20);
  });

  it('evaluates division', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('20 / 4'), ctx)).toBe(5);
  });

  it('evaluates power', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('2 ^ 3'), ctx)).toBe(8);
  });

  it('evaluates unary minus', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('-5'), ctx)).toBe(-5);
    expect(evaluate(parse('--5'), ctx)).toBe(5);
  });

  it('evaluates complex expression', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('(1 + 2) * 3'), ctx)).toBe(9);
    expect(evaluate(parse('10 / 2 + 5'), ctx)).toBe(10);
  });
});

describe('Interpreter - 单元格引用', () => {
  it('evaluates simple cell reference at current time', () => {
    const values: Record<string, Record<number, CellValue>> = {
      '表1.A': { 3: 100 },
    };
    const timeCtx: TimeContext = {
      absoluteYear: 2024, relativeYear: 3,
      isConstruction: false, isOperation: true,
      constructionYears: 0, operationYears: 10, totalYears: 10,
    };
    const ctx = makeContext(values, timeCtx);
    const ast = parse('表1.A');
    expect(evaluate(ast, ctx)).toBe(100);
  });

  it('evaluates wildcard reference as array', () => {
    const values: Record<string, Record<number, CellValue>> = {
      '表1.A': { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 },
    };
    const timeCtx: TimeContext = {
      absoluteYear: 2024, relativeYear: 1,
      isConstruction: false, isOperation: true,
      constructionYears: 0, operationYears: 5, totalYears: 5,
    };
    const ctx = makeContext(values, timeCtx);
    const ast = parse('表1.A[*]');
    const result = evaluate(ast, ctx);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it('evaluates explicit range as array', () => {
    const values: Record<string, Record<number, CellValue>> = {
      '表1.A': { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 },
    };
    const timeCtx: TimeContext = {
      absoluteYear: 2024, relativeYear: 1,
      isConstruction: false, isOperation: true,
      constructionYears: 0, operationYears: 5, totalYears: 5,
    };
    const ctx = makeContext(values, timeCtx);
    const ast = parse('表1.A[2:4]');
    const result = evaluate(ast, ctx);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([20, 30, 40]);
  });
});

describe('Interpreter - 函数调用', () => {
  const timeCtx: TimeContext = {
    absoluteYear: 2024, relativeYear: 1,
    isConstruction: false, isOperation: true,
    constructionYears: 0, operationYears: 5, totalYears: 5,
  };

  it('evaluates SUM function', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('SUM(1, 2, 3)'), ctx)).toBe(6);
  });

  it('evaluates SUM with wildcard', () => {
    const values: Record<string, Record<number, CellValue>> = {
      '表1.A': { 1: 10, 2: 20, 3: 30 },
    };
    const ctx = makeContext(values, timeCtx);
    expect(evaluate(parse('SUM(表1.A[*])'), ctx)).toBe(60);
  });

  it('evaluates MAX function', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('MAX(1, 5, 3)'), ctx)).toBe(5);
  });

  it('evaluates POWER function', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('POWER(2, 3)'), ctx)).toBe(8);
  });

  it('evaluates nested functions', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('MAX(SUM(1, 2), 5)'), ctx)).toBe(5);
  });
});

describe('Interpreter - 标识符 t', () => {
  it('evaluates t as current relative year', () => {
    const timeCtx: TimeContext = {
      absoluteYear: 2024, relativeYear: 5,
      isConstruction: false, isOperation: true,
      constructionYears: 0, operationYears: 10, totalYears: 10,
    };
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('t'), ctx)).toBe(5);
  });

  it('evaluates expression with t', () => {
    const timeCtx: TimeContext = {
      absoluteYear: 2024, relativeYear: 5,
      isConstruction: false, isOperation: true,
      constructionYears: 0, operationYears: 10, totalYears: 10,
    };
    const values: Record<string, Record<number, CellValue>> = {
      '表1.A': { 4: 100, 5: 200, 6: 300 },
    };
    const ctx = makeContext(values, timeCtx);
    // t-1 should evaluate to relativeYear - 1 = 4
    // But we need to test this with a proper timeExpression cell ref
    // For now, test arithmetic with t
    expect(evaluate(parse('t + 1'), ctx)).toBe(6);
    expect(evaluate(parse('t * 2'), ctx)).toBe(10);
  });
});

describe('Interpreter - 综合公式', () => {
  it('evaluates formula from Excel template', () => {
    const timeCtx: TimeContext = {
      absoluteYear: 2024, relativeYear: 3,
      isConstruction: false, isOperation: true,
      constructionYears: 0.583, operationYears: 25, totalYears: 25.583,
    };
    const values: Record<string, Record<number, CellValue>> = {
      '表1.A': { 3: 1000 },
    };
    const ctx = makeContext(values, timeCtx);
    // =表1.A * 0.13
    expect(evaluate(parse('=表1.A * 0.13'), ctx)).toBe(130);
  });
});

describe('Interpreter - 边界情况', () => {
  const timeCtx: TimeContext = {
    absoluteYear: 2024, relativeYear: 1,
    isConstruction: false, isOperation: true,
    constructionYears: 0, operationYears: 5, totalYears: 5,
  };

  it('returns null for missing cell reference', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('表1.不存在'), ctx)).toBeNull();
  });

  it('returns null for undefined function', () => {
    const ctx = makeContext({}, timeCtx);
    expect(evaluate(parse('UNKNOWN(1)'), ctx)).toBeNull();
  });

  it('handles division by zero', () => {
    const ctx = makeContext({}, timeCtx);
    // Should handle gracefully
    const result = evaluate(parse('1 / 0'), ctx);
    expect(result).toBe(Infinity); // or null depending on preference
  });
});
