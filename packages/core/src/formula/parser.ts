import { tokenize, Token, TokenType } from './tokenizer';
import { ASTNode, ASTNodeType } from '../types';

export { ASTNodeType } from '../types';

export class ParseError extends Error {
  constructor(message: string, public pos: number = 0) {
    super(message);
    this.name = 'ParseError';
  }
}

class Parser {
  private tokens: Token[] = [];
  private pos = 0;

  constructor(tokens: Token[], startIndex = 0) {
    this.tokens = tokens;
    this.pos = startIndex;
  }

  getRemainingTokens(): Token[] {
    return this.tokens.slice(this.pos);
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: TokenType.EOF, value: '', pos: -1 };
  }

  private advance(): Token {
    return this.tokens[this.pos++] ?? { type: TokenType.EOF, value: '', pos: -1 };
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new ParseError(`Expected ${type} but got ${token.type}`, token.pos);
    }
    return this.advance();
  }

  private match(...types: TokenType[]): Token | null {
    const token = this.peek();
    if (types.includes(token.type)) {
      return this.advance();
    }
    return null;
  }

  parse(): ASTNode {
    return this.expression();
  }

  parseRestAsScript(): { language: string; code: string } {
    const lang = this.expect(TokenType.Identifier).value;
    this.expect(TokenType.Colon);
    // 收集剩余的 token
    const parts: string[] = [];
    while (this.peek().type !== TokenType.EOF) {
      // 检查此 token 与前一个 token 之间是否有空白
      if (parts.length > 0) {
        const prevEnd = this.tokens[this.pos - 1].pos + this.tokens[this.pos - 1].value.length;
        const currStart = this.tokens[this.pos].pos;
        if (currStart > prevEnd) {
          parts.push(' '); // 将空白重构为空格
        }
      }
      parts.push(this.tokens[this.pos++].value);
    }
    return { language: lang, code: parts.join('') };
  }

  // expression → 相等性比较
  private expression(): ASTNode {
    return this.equality();
  }

  // 相等性 → 比较 (("==" | "!=") 比较)*
  private equality(): ASTNode {
    let node = this.comparison();
    while (true) {
      if (this.match(TokenType.Operator)) {
        const op = this.tokens[this.pos - 1].value;
        if (op === '==' || op === '!=') {
          const right = this.comparison();
          node = { type: ASTNodeType.BinaryOp, operator: op as any, left: node, right };
        } else {
          // 回退 - 不是当前层级的运算符
          this.pos--;
          break;
        }
      } else {
        break;
      }
    }
    return node;
  }

  // 比较 → 加法 ((">" | "<" | ">=" | "<=") 加法)*
  private comparison(): ASTNode {
    let node = this.addition();
    while (true) {
      if (this.match(TokenType.Operator)) {
        const op = this.tokens[this.pos - 1].value;
        if (op === '>' || op === '<' || op === '>=' || op === '<=') {
          const right = this.addition();
          node = { type: ASTNodeType.BinaryOp, operator: op as any, left: node, right };
        } else {
          this.pos--;
          break;
        }
      } else {
        break;
      }
    }
    return node;
  }

  // 加法 → 乘法 (("+" | "-") 乘法)*
  private addition(): ASTNode {
    let node = this.multiplication();
    while (true) {
      if (this.match(TokenType.Operator)) {
        const op = this.tokens[this.pos - 1].value;
        if (op === '+' || op === '-') {
          const right = this.multiplication();
          node = { type: ASTNodeType.BinaryOp, operator: op as any, left: node, right };
        } else {
          this.pos--;
          break;
        }
      } else {
        break;
      }
    }
    return node;
  }

  // 乘法 → 幂运算 (("*" | "/" | "%") 幂运算)*
  private multiplication(): ASTNode {
    let node = this.exponentiation();
    while (true) {
      if (this.match(TokenType.Operator)) {
        const op = this.tokens[this.pos - 1].value;
        if (op === '*' || op === '/' || op === '%') {
          const right = this.exponentiation();
          node = { type: ASTNodeType.BinaryOp, operator: op as any, left: node, right };
        } else {
          this.pos--;
          break;
        }
      } else {
        break;
      }
    }
    return node;
  }

  // 幂运算 → 一元 ("^" 一元)?
  private exponentiation(): ASTNode {
    let node = this.unary();
    if (this.match(TokenType.Operator)) {
      const op = this.tokens[this.pos - 1].value;
      if (op === '^') {
        const right = this.unary();
        node = { type: ASTNodeType.BinaryOp, operator: '^', left: node, right };
      } else {
        this.pos--;
      }
    }
    return node;
  }

  // 一元 → ("+" | "-") 一元 | 基本表达式
  private unary(): ASTNode {
    if (this.match(TokenType.Operator)) {
      const op = this.tokens[this.pos - 1].value;
      if (op === '+' || op === '-') {
        const operand = this.unary();
        return { type: ASTNodeType.UnaryOp, operator: op, operand };
      }
      this.pos--;
    }
    return this.primary();
  }

  // 基本表达式 → NUMBER | STRING | BOOLEAN | IDENTIFIER | 单元格引用 | 函数调用 | "(" expression ")"
  private primary(): ASTNode {
    const token = this.peek();

    if (token.type === TokenType.Number) {
      this.advance();
      return { type: ASTNodeType.Literal, value: parseFloat(token.value) };
    }

    if (token.type === TokenType.String) {
      this.advance();
      return { type: ASTNodeType.Literal, value: token.value };
    }

    if (token.type === TokenType.Boolean) {
      this.advance();
      return { type: ASTNodeType.Literal, value: token.value === 'true' };
    }

    if (token.type === TokenType.IdRef) {
      this.advance();
      const refId = token.value;

      let timeRange: { start: number; end: number } | '*' | null = null;
      let timeExpression: ASTNode | null = null;

      if (this.match(TokenType.LBracket)) {
        const bracketContent: Token[] = [];
        let depth = 1;
        while (depth > 0) {
          const t = this.peek();
          if (t.type === TokenType.EOF) {
            throw new ParseError('Unclosed bracket in ID reference', t.pos);
          }
          if (t.type === TokenType.LBracket) depth++;
          if (t.type === TokenType.RBracket) {
            depth--;
            if (depth === 0) { this.advance(); break; }
          }
          bracketContent.push(this.advance());
        }

        if (bracketContent.length === 1) {
          const content = bracketContent[0];
          if (content.type === TokenType.Wildcard) {
            timeRange = '*';
          } else if (content.type === TokenType.Number) {
            timeRange = { start: parseFloat(content.value), end: parseFloat(content.value) };
          } else {
            timeExpression = parseBracketTokens(bracketContent);
          }
        } else if (bracketContent.length === 3) {
          if (bracketContent[0].type === TokenType.Number &&
              bracketContent[1].value === ':' &&
              bracketContent[2].type === TokenType.Number) {
            timeRange = {
              start: parseFloat(bracketContent[0].value),
              end: parseFloat(bracketContent[2].value)
            };
          } else {
            timeExpression = parseBracketTokens(bracketContent);
          }
        } else {
          timeExpression = parseBracketTokens(bracketContent);
        }
      }

      return {
        type: ASTNodeType.CellRef,
        table: '@',
        field: refId,
        timeShift: 0,
        timeRange,
        timeExpression,
      };
    }

    if (token.type === TokenType.Table) {
      // Table 后面可能跟着 [（简写语法，不带 .Field）
      // 或者 .Field（完整语法）
      const next = this.tokens[this.pos + 1];
      if (next && next.type === TokenType.LBracket) {
        // 简写语法: 表1[t] 或 发电量[t]
        const table = this.advance().value;
        this.advance(); // consume [
        const bracketTokens: Token[] = [];
        while (this.peek().type !== TokenType.RBracket && this.peek().type !== TokenType.EOF) {
          bracketTokens.push(this.advance());
        }
        this.expect(TokenType.RBracket);
        const timeExpr = bracketTokens.length > 0 ? parseBracketTokens(bracketTokens) : null;
        return {
          type: ASTNodeType.CellRef,
          table,
          field: 'value', // 简写语法的默认字段
          timeShift: 0,
          timeRange: null,
          timeExpression: timeExpr,
        };
      }
      return this.cellRef();
    }

    // 检查脚本块: identifier: ...
    if (token.type === TokenType.Identifier) {
      const next = this.tokens[this.pos + 1];
      if (next && next.type === TokenType.Colon) {
        // 脚本块
        const { language, code } = this.parseRestAsScript();
        return { type: ASTNodeType.ScriptBlock, language: language as 'javascript', code };
      }
      // 可能是函数调用或裸标识符
      const after = this.tokens[this.pos + 1];
      if (after && after.type === TokenType.LParen) {
        return this.functionCall();
      }
      this.advance();
      return { type: ASTNodeType.Identifier, name: token.value };
    }

    if (token.type === TokenType.LParen) {
      this.advance();
      const expr = this.expression();
      this.expect(TokenType.RParen);
      return expr;
    }

    throw new ParseError(`Unexpected token ${token.type}: ${token.value}`, token.pos);
  }

  // 单元格引用 → Table DOT Field ( "[" 时间访问器 "]" )?
  private cellRef(): ASTNode {
    const table = this.expect(TokenType.Table).value;
    this.expect(TokenType.Dot);
    const fieldToken = this.peek();
    if (fieldToken.type !== TokenType.Field && fieldToken.type !== TokenType.Number) {
      throw new ParseError(`Expected Field or Number but got ${fieldToken.type}`, fieldToken.pos);
    }
    this.advance();
    const field = fieldToken.value;

    let timeRange: { start: number; end: number } | '*' | null = null;
    let timeExpression: ASTNode | null = null;

    if (this.match(TokenType.LBracket)) {
      const bracketContent: Token[] = [];
      let depth = 1;
      while (depth > 0) {
        const t = this.peek();
        if (t.type === TokenType.EOF) {
          throw new ParseError('Unclosed bracket in cell reference', t.pos);
        }
        if (t.type === TokenType.LBracket) depth++;
        if (t.type === TokenType.RBracket) {
          depth--;
          if (depth === 0) { this.advance(); break; }
        }
        bracketContent.push(this.advance());
      }

      // 解析方括号内容
      if (bracketContent.length === 1) {
        const content = bracketContent[0];
        if (content.type === TokenType.Wildcard) {
          timeRange = '*';
        } else if (content.type === TokenType.Number) {
          timeRange = { start: parseFloat(content.value), end: parseFloat(content.value) };
        } else {
          // 可能是表达式，如 "t"、"t-1" 等
          timeExpression = parseBracketTokens(bracketContent);
        }
      } else if (bracketContent.length === 3) {
        // 如 "1:5"
        if (bracketContent[0].type === TokenType.Number &&
            bracketContent[1].value === ':' &&
            bracketContent[2].type === TokenType.Number) {
          timeRange = {
            start: parseFloat(bracketContent[0].value),
            end: parseFloat(bracketContent[2].value)
          };
        } else {
          timeExpression = parseBracketTokens(bracketContent);
        }
      } else {
        timeExpression = parseBracketTokens(bracketContent);
      }
    }

    return {
      type: ASTNodeType.CellRef,
      table,
      field,
      timeShift: 0,
      timeRange,
      timeExpression,
    };
  }

  // 函数调用 → IDENTIFIER "(" (expression ("," expression)*)? ")"
  private functionCall(): ASTNode {
    const name = this.expect(TokenType.Identifier).value;
    this.expect(TokenType.LParen);
    const args: ASTNode[] = [];
    while (!this.match(TokenType.RParen)) {
      if (this.peek().type === TokenType.EOF) {
        throw new ParseError('Unclosed parenthesis in function call', this.peek().pos);
      }
      args.push(this.expression());
      if (!this.match(TokenType.RParen)) {
        this.expect(TokenType.Comma);
      } else {
        break;
      }
    }
    return { type: ASTNodeType.FunctionCall, name, args };
  }
}

// 辅助函数：使用子解析器解析方括号内容
function parseBracketTokens(tokens: Token[]): ASTNode {
  const parser = new Parser(tokens);
  return parser.expression();
}

export function parse(formula: string): ASTNode {
  const tokens = tokenize(formula);
  // 跳过前导的 =（如果存在）
  let startIdx = 0;
  if (tokens.length > 0 && tokens[0].type === TokenType.Operator && tokens[0].value === '=') {
    startIdx = 1;
  }
  const parser = new Parser(tokens, startIdx);
  const ast = parser.parse();
  // 检查尾部是否有多余 token
  const remaining = parser.getRemainingTokens();
  if (remaining.length > 0) {
    const t = remaining[0];
    throw new ParseError(`Unexpected trailing token ${t.type}: ${t.value}`, t.pos);
  }
  return ast;
}
