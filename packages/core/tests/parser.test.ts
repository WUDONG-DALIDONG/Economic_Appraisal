import { describe, it, expect } from 'vitest';
import { parse, ParseError } from '../src/formula/parser';
import { ASTNodeType } from '../src/types';

describe('Parser - 字面量', () => {
  it('parses literal number', () => {
    const ast = parse('42');
    expect(ast.type).toBe(ASTNodeType.Literal);
    expect(ast.value).toBe(42);
  });

  it('parses literal string', () => {
    const ast = parse('"hello"');
    expect(ast.type).toBe(ASTNodeType.Literal);
    expect(ast.value).toBe('hello');
  });

  it('parses literal boolean', () => {
    const ast = parse('true');
    expect(ast.type).toBe(ASTNodeType.Literal);
    expect(ast.value).toBe(true);
  });
});

describe('Parser - 二进制运算', () => {
  it('parses addition', () => {
    const ast = parse('1 + 2');
    expect(ast.type).toBe(ASTNodeType.BinaryOp);
    expect(ast.operator).toBe('+');
    expect(ast.left.value).toBe(1);
    expect(ast.right.value).toBe(2);
  });

  it('parses subtraction', () => {
    const ast = parse('5 - 3');
    expect(ast.operator).toBe('-');
    expect(ast.left.value).toBe(5);
    expect(ast.right.value).toBe(3);
  });

  it('parses multiplication', () => {
    const ast = parse('4 * 5');
    expect(ast.operator).toBe('*');
  });

  it('parses division', () => {
    const ast = parse('10 / 2');
    expect(ast.operator).toBe('/');
  });

  it('parses power', () => {
    const ast = parse('2 ^ 3');
    expect(ast.operator).toBe('^');
  });
});

describe('Parser - 优先级', () => {
  it('multiplication has higher precedence than addition', () => {
    const ast = parse('1 + 2 * 3');
    expect(ast.operator).toBe('+');
    expect(ast.left.value).toBe(1);
    expect(ast.right.operator).toBe('*');
    expect(ast.right.left.value).toBe(2);
    expect(ast.right.right.value).toBe(3);
  });

  it('power has higher precedence than multiplication', () => {
    const ast = parse('2 * 3 ^ 2');
    expect(ast.operator).toBe('*');
    expect(ast.right.operator).toBe('^');
    expect(ast.right.left.value).toBe(3);
    expect(ast.right.right.value).toBe(2);
  });

  it('left associativity for same precedence', () => {
    const ast = parse('1 - 2 - 3');
    expect(ast.operator).toBe('-');
    expect(ast.left.operator).toBe('-');
    expect(ast.left.left.value).toBe(1);
    expect(ast.left.right.value).toBe(2);
    expect(ast.right.value).toBe(3);
  });

  it('parentheses override precedence', () => {
    const ast = parse('(1 + 2) * 3');
    expect(ast.operator).toBe('*');
    expect(ast.left.operator).toBe('+');
    expect(ast.left.left.value).toBe(1);
    expect(ast.left.right.value).toBe(2);
    expect(ast.right.value).toBe(3);
  });
});

describe('Parser - 一元运算', () => {
  it('parses negation', () => {
    const ast = parse('-5');
    expect(ast.type).toBe(ASTNodeType.UnaryOp);
    expect(ast.operator).toBe('-');
    expect(ast.operand.value).toBe(5);
  });

  it('parses double negation', () => {
    const ast = parse('--5');
    expect(ast.operator).toBe('-');
    expect(ast.operand.operator).toBe('-');
    expect(ast.operand.operand.value).toBe(5);
  });

  it('parses unary plus', () => {
    const ast = parse('+3');
    expect(ast.type).toBe(ASTNodeType.UnaryOp);
    expect(ast.operator).toBe('+');
    expect(ast.operand.value).toBe(3);
  });
});

describe('Parser - 单元格引用', () => {
  it('parses simple cell reference', () => {
    const ast = parse('表1.A');
    expect(ast.type).toBe(ASTNodeType.CellRef);
    expect(ast.table).toBe('表1');
    expect(ast.field).toBe('A');
    expect(ast.timeShift).toBe(0);
    expect(ast.timeRange).toBeNull();
  });

  it('parses cell reference with time shift expression', () => {
    const ast = parse('表1.A[t-1]');
    expect(ast.type).toBe(ASTNodeType.CellRef);
    expect(ast.table).toBe('表1');
    expect(ast.field).toBe('A');
    expect(ast.timeRange).toBeNull();
  });

  it('parses cell reference with wildtdcard', () => {
    const ast = parse('表1.A[*]');
    expect(ast.type).toBe(ASTNodeType.CellRef);
    expect(ast.table).toBe('表1');
    expect(ast.field).toBe('A');
    expect(ast.timeRange).toBe('*');
  });

  it('parses cell reference with explicit range', () => {
    const ast = parse('表1.A[1:5]');
    expect(ast.type).toBe(ASTNodeType.CellRef);
    expect(ast.timeRange).toEqual({ start: 1, end: 5 });
  });
});

describe('Parser - 函数调用', () => {
  it('parses function without args', () => {
    const ast = parse('PI()');
    expect(ast.type).toBe(ASTNodeType.FunctionCall);
    expect(ast.name).toBe('PI');
    expect(ast.args).toHaveLength(0);
  });

  it('parses function with single arg', () => {
    const ast = parse('ABS(-5)');
    expect(ast.type).toBe(ASTNodeType.FunctionCall);
    expect(ast.name).toBe('ABS');
    expect(ast.args).toHaveLength(1);
    expect(ast.args[0].type).toBe(ASTNodeType.UnaryOp);
  });

  it('parses function with multiple args', () => {
    const ast = parse('SUM(表1.A[*])');
    expect(ast.type).toBe(ASTNodeType.FunctionCall);
    expect(ast.name).toBe('SUM');
    expect(ast.args).toHaveLength(1);
    expect(ast.args[0].type).toBe(ASTNodeType.CellRef);
    expect(ast.args[0].timeRange).toBe('*');
  });

  it('parses nested functions', () => {
    const ast = parse('MAX(SUM(表1.A), 表1.B)');
    expect(ast.type).toBe(ASTNodeType.FunctionCall);
    expect(ast.name).toBe('MAX');
    expect(ast.args).toHaveLength(2);
    expect(ast.args[0].type).toBe(ASTNodeType.FunctionCall);
    expect(ast.args[0].name).toBe('SUM');
    expect(ast.args[1].type).toBe(ASTNodeType.CellRef);
  });
});

describe('Parser - 公式整体', () => {
  it('parses formula with leading =', () => {
    const ast = parse('=1 + 2');
    expect(ast.type).toBe(ASTNodeType.BinaryOp);
    expect(ast.left.value).toBe(1);
    expect(ast.right.value).toBe(2);
  });

  it('parses complex Excel formula', () => {
    const ast = parse('=POWER(1-衰减率, t-1) * 发电量[t]');
    expect(ast.type).toBe(ASTNodeType.BinaryOp);
    expect(ast.operator).toBe('*');
    expect(ast.left.type).toBe(ASTNodeType.FunctionCall);
    expect(ast.left.name).toBe('POWER');
    expect(ast.left.args).toHaveLength(2);
    expect(ast.right.type).toBe(ASTNodeType.CellRef);
    expect(ast.right.table).toBe('发电量');
  });

  it('parses comparison in formula', () => {
    const ast = parse('表1.A >= 表1.B');
    expect(ast.type).toBe(ASTNodeType.BinaryOp);
    expect(ast.operator).toBe('>=');
    expect(ast.left.type).toBe(ASTNodeType.CellRef);
    expect(ast.right.type).toBe(ASTNodeType.CellRef);
  });
});

describe('Parser - 脚本块', () => {
  it('parses script block as ScriptBlock node', () => {
    const ast = parse('javascript:return x + y;');
    expect(ast.type).toBe(ASTNodeType.ScriptBlock);
    expect(ast.language).toBe('javascript');
    expect(ast.code).toBe('return x + y;');
  });
});

describe('Parser - 错误处理', () => {
  it('throws on unmatched left parenthesis', () => {
    expect(() => parse('(1 + 2')).toThrow(ParseError);
  });

  it('throws on unmatched right parenthesis', () => {
    expect(() => parse('1 + 2)')).toThrow(ParseError);
  });

  it('throws on empty input after =', () => {
    expect(() => parse('=')).toThrow(ParseError);
  });

  it('throws on unexpected token', () => {
    expect(() => parse('1 + +')).toThrow(ParseError);
  });
});

describe('Parser - 标识符', () => {
  it('parses bare identifier', () => {
    const ast = parse('pi');
    expect(ast.type).toBe(ASTNodeType.Identifier);
    expect(ast.name).toBe('pi');
  });

  it('parses identifier in expression', () => {
    const ast = parse('pi * 2');
    expect(ast.type).toBe(ASTNodeType.BinaryOp);
    expect(ast.left.type).toBe(ASTNodeType.Identifier);
    expect(ast.left.name).toBe('pi');
  });
});
