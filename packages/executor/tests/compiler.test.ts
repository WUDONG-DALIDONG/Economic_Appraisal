import { describe, it, expect } from 'vitest';
import { ASTCompiler } from '../src/compiler/ASTCompiler';
import { ASTNode, ASTNodeType } from '@economic/core';

describe('ASTCompiler', () => {
  const compiler = new ASTCompiler();

  it('compiles Literal numbers', () => {
    const node: ASTNode = { type: ASTNodeType.Literal, value: 42 };
    expect(compiler.compile(node)).toBe('42');
  });

  it('compiles Literal strings', () => {
    const node: ASTNode = { type: ASTNodeType.Literal, value: 'hello' };
    expect(compiler.compile(node)).toBe('"hello"');
  });

  it('compiles Literal booleans', () => {
    const node: ASTNode = { type: ASTNodeType.Literal, value: true };
    expect(compiler.compile(node)).toBe('true');
  });

  it('compiles Literal null', () => {
    const node: ASTNode = { type: ASTNodeType.Literal, value: null };
    expect(compiler.compile(node)).toBe('null');
  });

  it('compiles Identifier t', () => {
    const node: ASTNode = { type: ASTNodeType.Identifier, name: 't' };
    expect(compiler.compile(node)).toBe('ctx.t');
  });

  it('compiles CellRef without time expression', () => {
    const node: ASTNode = {
      type: ASTNodeType.CellRef,
      table: '表1',
      field: '营业收入',
      timeShift: 0,
      timeRange: null,
    };
    expect(compiler.compile(node)).toBe('ctx.getCell("表1", "营业收入", ctx.t)');
  });

  it('compiles CellRef with time expression', () => {
    const node: ASTNode = {
      type: ASTNodeType.CellRef,
      table: '表1',
      field: '营业收入',
      timeShift: 0,
      timeRange: null,
      timeExpression: {
        type: ASTNodeType.BinaryOp,
        operator: '-',
        left: { type: ASTNodeType.Identifier, name: 't' },
        right: { type: ASTNodeType.Literal, value: 1 },
      },
    };
    expect(compiler.compile(node)).toBe(
      'ctx.getCell("表1", "营业收入", (ctx.t - 1))'
    );
  });

  it('compiles CellRef with wildcard', () => {
    const node: ASTNode = {
      type: ASTNodeType.CellRef,
      table: '表1',
      field: '营业收入',
      timeShift: 0,
      timeRange: '*',
    };
    expect(compiler.compile(node)).toBe('ctx.getCellArray("表1", "营业收入")');
  });

  it('compiles BinaryOp', () => {
    const node: ASTNode = {
      type: ASTNodeType.BinaryOp,
      operator: '+',
      left: { type: ASTNodeType.Literal, value: 3 },
      right: { type: ASTNodeType.Literal, value: 4 },
    };
    expect(compiler.compile(node)).toBe('(3 + 4)');
  });

  it('compiles UnaryOp negation', () => {
    const node: ASTNode = {
      type: ASTNodeType.UnaryOp,
      operator: '-',
      operand: { type: ASTNodeType.Literal, value: 5 },
    };
    expect(compiler.compile(node)).toBe('(-5)');
  });

  it('compiles UnaryOp logical not', () => {
    const node: ASTNode = {
      type: ASTNodeType.UnaryOp,
      operator: '!',
      operand: { type: ASTNodeType.Literal, value: true },
    };
    expect(compiler.compile(node)).toBe('(!true)');
  });

  it('compiles FunctionCall', () => {
    const node: ASTNode = {
      type: ASTNodeType.FunctionCall,
      name: 'SUM',
      args: [
        { type: ASTNodeType.Literal, value: 1 },
        { type: ASTNodeType.Literal, value: 2 },
      ],
    };
    expect(compiler.compile(node)).toBe('ctx.functions["SUM"](1, 2)');
  });

  it('compiles complex formula', () => {
    const node: ASTNode = {
      type: ASTNodeType.BinaryOp,
      operator: '*',
      left: {
        type: ASTNodeType.CellRef,
        table: '表1',
        field: '单价',
        timeShift: 0,
        timeRange: null,
      },
      right: {
        type: ASTNodeType.CellRef,
        table: '表1',
        field: '数量',
        timeShift: 0,
        timeRange: null,
      },
    };
    expect(compiler.compile(node)).toBe(
      '(ctx.getCell("表1", "单价", ctx.t) * ctx.getCell("表1", "数量", ctx.t))'
    );
  });
});
