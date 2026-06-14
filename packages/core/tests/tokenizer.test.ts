import { describe, it, expect } from 'vitest';
import { tokenize, TokenType, Token } from '../src/formula/tokenizer';

describe('Tokenizer - 基本字面量', () => {
  it('tokenizes a number', () => {
    const tokens = tokenize('42');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ type: TokenType.Number, value: '42', pos: 0 });
  });

  it('tokenizes a decimal number', () => {
    const tokens = tokenize('3.14');
    expect(tokens[0]).toMatchObject({ type: TokenType.Number, value: '3.14' });
  });

  it('tokenizes a string literal', () => {
    const tokens = tokenize('"hello"');
    expect(tokens[0]).toMatchObject({ type: TokenType.String, value: 'hello' });
  });

  it('tokenizes a negative number', () => {
    const tokens = tokenize('-5');
    expect(tokens[0]).toMatchObject({ type: TokenType.Operator, value: '-' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Number, value: '5' });
  });

  it('tokenizes true and false', () => {
    const t1 = tokenize('true');
    expect(t1[0]).toMatchObject({ type: TokenType.Boolean, value: 'true' });
    const t2 = tokenize('false');
    expect(t2[0]).toMatchObject({ type: TokenType.Boolean, value: 'false' });
  });
});

describe('Tokenizer - 运算符', () => {
  it('tokenizes arithmetic operators', () => {
    const ops = ['+', '-', '*', '/', '^', '%'];
    for (const op of ops) {
      const tokens = tokenize(op);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({ type: TokenType.Operator, value: op });
    }
  });

  it('tokenizes comparison operators', () => {
    const ops = ['==', '!=', '>=', '<=', '>', '<'];
    for (const op of ops) {
      const tokens = tokenize(op);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({ type: TokenType.Operator, value: op });
    }
  });
});

describe('Tokenizer - 单元格引用', () => {
  it('tokenizes simple cell reference', () => {
    const tokens = tokenize('表1.A');
    expect(tokens[0]).toMatchObject({ type: TokenType.Table, value: '表1' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Dot, value: '.' });
    expect(tokens[2]).toMatchObject({ type: TokenType.Field, value: 'A' });
  });

  it('tokenizes cell reference with time shift', () => {
    const tokens = tokenize('表1.A[-1]');
    expect(tokens[0]).toMatchObject({ type: TokenType.Table, value: '表1' });
    expect(tokens[2]).toMatchObject({ type: TokenType.Field, value: 'A' });
    expect(tokens[3]).toMatchObject({ type: TokenType.LBracket, value: '[' });
    expect(tokens[4]).toMatchObject({ type: TokenType.Operator, value: '-' });
    expect(tokens[5]).toMatchObject({ type: TokenType.Number, value: '1' });
    expect(tokens[6]).toMatchObject({ type: TokenType.RBracket, value: ']' });
  });

  it('tokenizes cell reference with wildcard range', () => {
    const tokens = tokenize('表1.A[*]');
    expect(tokens[0]).toMatchObject({ type: TokenType.Table, value: '表1' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Dot, value: '.' });
    expect(tokens[2]).toMatchObject({ type: TokenType.Field, value: 'A' });
    expect(tokens[3]).toMatchObject({ type: TokenType.LBracket, value: '[' });
    expect(tokens[4]).toMatchObject({ type: TokenType.Wildcard, value: '*' });
    expect(tokens[5]).toMatchObject({ type: TokenType.RBracket, value: ']' });
  });

  it('tokenizes cell reference with explicit range', () => {
    const tokens = tokenize('表1.A[1:5]');
    expect(tokens[0]).toMatchObject({ type: TokenType.Table, value: '表1' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Dot, value: '.' });
    expect(tokens[2]).toMatchObject({ type: TokenType.Field, value: 'A' });
    expect(tokens[3]).toMatchObject({ type: TokenType.LBracket, value: '[' });
    expect(tokens[4]).toMatchObject({ type: TokenType.Number, value: '1' });
    expect(tokens[5]).toMatchObject({ type: TokenType.Colon, value: ':' });
    expect(tokens[6]).toMatchObject({ type: TokenType.Number, value: '5' });
    expect(tokens[7]).toMatchObject({ type: TokenType.RBracket, value: ']' });
  });

  it('tokenizes terse syntax 表1[t]', () => {
    const tokens = tokenize('表1[t]');
    expect(tokens[0]).toMatchObject({ type: TokenType.Table, value: '表1' });
    expect(tokens[1]).toMatchObject({ type: TokenType.LBracket, value: '[' });
    expect(tokens[2]).toMatchObject({ type: TokenType.Identifier, value: 't' });
    expect(tokens[3]).toMatchObject({ type: TokenType.RBracket, value: ']' });
  });
});

describe('Tokenizer - 函数调用', () => {
  it('tokenizes SUM function', () => {
    const tokens = tokenize('SUM(表1.A[*])');
    expect(tokens[0]).toMatchObject({ type: TokenType.Identifier, value: 'SUM' });
    expect(tokens[1]).toMatchObject({ type: TokenType.LParen, value: '(' });
    expect(tokens[2]).toMatchObject({ type: TokenType.Table, value: '表1' });
    expect(tokens[4]).toMatchObject({ type: TokenType.Field, value: 'A' });
    expect(tokens[5]).toMatchObject({ type: TokenType.LBracket, value: '[' });
    expect(tokens[6]).toMatchObject({ type: TokenType.Wildcard, value: '*' });
    expect(tokens[7]).toMatchObject({ type: TokenType.RBracket, value: ']' });
    expect(tokens[8]).toMatchObject({ type: TokenType.RParen, value: ')' });
  });

  it('tokenizes POWER function', () => {
    const tokens = tokenize('POWER(1-0.02, t-1)');
    expect(tokens[0]).toMatchObject({ type: TokenType.Identifier, value: 'POWER' });
    const values = tokens.map((t: Token) => t.value);
    expect(values).toContain('POWER');
    expect(values).toContain('(');
    expect(values).toContain(')');
    expect(values).toContain(',');
  });

  it('tokenizes nested functions', () => {
    const tokens = tokenize('SUM(表1.A, 表1.B, MAX(表1.C, 表1.D))');
    const identifiers = tokens.filter((t: Token) => t.type === TokenType.Identifier);
    expect(identifiers).toHaveLength(2);
    expect(identifiers.map(t => t.value)).toContain('SUM');
    expect(identifiers.map(t => t.value)).toContain('MAX');
  });
});

describe('Tokenizer - 公式整体', () => {
  it('tokenizes a simple formula', () => {
    const tokens = tokenize('=表1.A + 表1.B');
    expect(tokens[0]).toMatchObject({ type: TokenType.Operator, value: '=' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Table, value: '表1' });
    expect(tokens[2]).toMatchObject({ type: TokenType.Dot, value: '.' });
    expect(tokens[3]).toMatchObject({ type: TokenType.Field, value: 'A' });
    expect(tokens[4]).toMatchObject({ type: TokenType.Operator, value: '+' });
    expect(tokens[5]).toMatchObject({ type: TokenType.Table, value: '表1' });
  });

  it('tokenizes a formula with multiplication and parentheses', () => {
    const tokens = tokenize('=(表1.A + 表1.B) * 表1.C');
    expect(tokens[0].value).toBe('=');
    expect(tokens[1].value).toBe('(');
    expect(tokens[2]).toMatchObject({ type: TokenType.Table, value: '表1' });
    // + 在索引5, ) 在索引9
    expect(tokens[9]).toMatchObject({ type: TokenType.RParen, value: ')' });
    expect(tokens[10]).toMatchObject({ type: TokenType.Operator, value: '*' });
  });

  it('tokenizes complex formula from Excel template', () => {
    const formula = '=POWER(1-衰减率, t-1) * 发电量[t]';
    const tokens = tokenize(formula);
    expect(tokens.length).toBeGreaterThan(0);
    const values = tokens.map((t: Token) => t.value);
    expect(values).toContain('POWER');
    expect(values).toContain('衰减率');
    expect(values).toContain('t');
    expect(values).toContain('发电量');
    expect(values).toContain('*');
  });
});

describe('Tokenizer - 脚本块', () => {
  it('tokenizes script block prefix', () => {
    const tokens = tokenize('javascript:return 42;');
    expect(tokens[0]).toMatchObject({ type: TokenType.Identifier, value: 'javascript' });
    expect(tokens[1]).toMatchObject({ type: TokenType.Colon, value: ':' });
    expect(tokens[2]).toMatchObject({ type: TokenType.Identifier, value: 'return' });
  });
});

describe('Tokenizer - 错误处理', () => {
  it('throws on invalid character', () => {
    expect(() => tokenize('A1 @ B1')).toThrow();
  });

  it('throws on unterminated string', () => {
    expect(() => tokenize('"hello')).toThrow();
  });

  it('handles empty string', () => {
    const tokens = tokenize('   ');
    expect(tokens).toHaveLength(0);
  });
});

describe('Tokenizer - token positions', () => {
  it('records correct positions', () => {
    const tokens = tokenize('A1 + B1');
    // A1 is Identifier at pos 0
    expect(tokens[0].pos).toBe(0);
    // + is Operator at pos 3 (A1 + space)
    expect(tokens[1].pos).toBe(3);
    // B1 is Identifier at pos 5
    expect(tokens[2].pos).toBe(5);
  });
});
