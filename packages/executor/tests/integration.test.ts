import { describe, it, expect } from 'vitest';
import { parse } from '@economic/core/src/formula/parser';
import { ASTCompiler } from '../src/compiler/ASTCompiler';
import { SafeVM } from '../src/vm/SafeVM';
import { financialFunctions } from '@economic/core/src/formula/financialFunctions';

describe('Executor Integration', () => {
  const compiler = new ASTCompiler();
  const vm = new SafeVM();

  it('executes compiled arithmetic formula', () => {
    const ast = parse('=3 + 4 * 2');
    const code = compiler.compile(ast);
    const result = vm.execute(code, { ctx: { t: 0 } });
    expect(result).toBe(11);
  });

  it('executes NPV via compiled formula with wildcard array', () => {
    const ast = parse('=NPV(0.1, 表1.现金流[*])');
    const code = compiler.compile(ast);
    const result = vm.execute(code, {
      ctx: {
        t: 0,
        getCellArray: () => [-1000, 300, 400, 400, 300],
        getCell: () => null,
        functions: financialFunctions,
      },
    });
    expect(typeof result).toBe('number');
    expect(Math.abs(result as number - 98.86)).toBeLessThan(1);
  });

  it('executes IRR via compiled formula with wildcard array', () => {
    const ast = parse('=IRR(表1.现金流[*])');
    const code = compiler.compile(ast);
    const result = vm.execute(code, {
      ctx: {
        t: 0,
        getCellArray: () => [-1000, 300, 400, 400, 300],
        getCell: () => null,
        functions: financialFunctions,
      },
    });
    expect(typeof result).toBe('number');
    expect(result as number).toBeGreaterThan(0.1);
    expect(result as number).toBeLessThan(0.2);
  });

  it('executes time-shifted cell reference with ctx.getCell', () => {
    const ast = parse('=表1.收入[t-1]');
    const code = compiler.compile(ast);
    const result = vm.execute(code, {
      ctx: {
        t: 2,
        getCell: (table: string, field: string, t: number) => {
          const store: Record<string, number[]> = {
            '表1:收入': [100, 200, 300],
          };
          return store[`${table}:${field}`]?.[t] ?? null;
        },
      },
    });
    expect(result).toBe(200);
  });

  it('executes wildcard cell reference with ctx.getCellArray', () => {
    const ast = parse('=表1.收入[*]');
    const code = compiler.compile(ast);
    const result = vm.execute(code, {
      ctx: {
        t: 0,
        getCellArray: (table: string, field: string) => {
          const store: Record<string, number[]> = {
            '表1:收入': [100, 200, 300],
          };
          return store[`${table}:${field}`] ?? null;
        },
      },
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([100, 200, 300]);
  });
});
