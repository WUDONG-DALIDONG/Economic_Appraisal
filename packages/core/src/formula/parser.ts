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
    // Collect remaining tokens
    const parts: string[] = [];
    while (this.peek().type !== TokenType.EOF) {
      // Check if there was whitespace between this and previous token
      if (parts.length > 0) {
        const prevEnd = this.tokens[this.pos - 1].pos + this.tokens[this.pos - 1].value.length;
        const currStart = this.tokens[this.pos].pos;
        if (currStart > prevEnd) {
          parts.push(' '); // Reconstruct whitespace as space
        }
      }
      parts.push(this.tokens[this.pos++].value);
    }
    return { language: lang, code: parts.join('') };
  }

  // expression → equality
  private expression(): ASTNode {
    return this.equality();
  }

  // equality → comparison (("==" | "!=") comparison)*
  private equality(): ASTNode {
    let node = this.comparison();
    while (true) {
      if (this.match(TokenType.Operator)) {
        const op = this.tokens[this.pos - 1].value;
        if (op === '==' || op === '!=') {
          const right = this.comparison();
          node = { type: ASTNodeType.BinaryOp, operator: op as any, left: node, right };
        } else {
          // Put it back - not our operator
          this.pos--;
          break;
        }
      } else {
        break;
      }
    }
    return node;
  }

  // comparison → addition ((">" | "<" | ">=" | "<=") addition)*
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

  // addition → multiplication (("+" | "-") multiplication)*
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

  // multiplication → exponentiation (("*" | "/" | "%") exponentiation)*
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

  // exponentiation → unary ("^" unary)?
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

  // unary → ("+" | "-") unary | primary
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

  // primary → NUMBER | STRING | BOOLEAN | IDENTIFIER | cellRef | functionCall | "(" expression ")"
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

    if (token.type === TokenType.Table) {
      // Table might be followed by [ (terse syntax without .Field)
      // or by .Field (full syntax)
      const next = this.tokens[this.pos + 1];
      if (next && next.type === TokenType.LBracket) {
        // Terse syntax: 表1[t] or 发电量[t]
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
          field: 'value', // default field for terse syntax
          timeShift: 0,
          timeRange: null,
          timeExpression: timeExpr,
        };
      }
      return this.cellRef();
    }

    // Check for script block: identifier: ...
    if (token.type === TokenType.Identifier) {
      const next = this.tokens[this.pos + 1];
      if (next && next.type === TokenType.Colon) {
        // Script block
        const { language, code } = this.parseRestAsScript();
        return { type: ASTNodeType.ScriptBlock, language: language as 'javascript', code };
      }
      // Could be function call or bare identifier
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

  // cellRef → Table DOT Field ( "[" timeAccessor "]" )?
  private cellRef(): ASTNode {
    const table = this.expect(TokenType.Table).value;
    this.expect(TokenType.Dot);
    const field = this.expect(TokenType.Field).value;

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

      // Parse bracket content
      if (bracketContent.length === 1) {
        const content = bracketContent[0];
        if (content.type === TokenType.Wildcard) {
          timeRange = '*';
        } else if (content.type === TokenType.Number) {
          timeRange = { start: parseFloat(content.value), end: parseFloat(content.value) };
        } else {
          // Could be expression like "t", "t-1" etc.
          timeExpression = parseBracketTokens(bracketContent);
        }
      } else if (bracketContent.length === 3) {
        // e.g. "1:5"
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

  // functionCall → IDENTIFIER "(" (expression ("," expression)*)? ")"
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

// Helper to parse bracket content using a sub-parser
function parseBracketTokens(tokens: Token[]): ASTNode {
  const parser = new Parser(tokens);
  return parser.expression();
}

export function parse(formula: string): ASTNode {
  const tokens = tokenize(formula);
  // Skip leading = if present
  let startIdx = 0;
  if (tokens.length > 0 && tokens[0].type === TokenType.Operator && tokens[0].value === '=') {
    startIdx = 1;
  }
  const parser = new Parser(tokens, startIdx);
  const ast = parser.parse();
  // Check for trailing tokens
  const remaining = parser.getRemainingTokens();
  if (remaining.length > 0) {
    const t = remaining[0];
    throw new ParseError(`Unexpected trailing token ${t.type}: ${t.value}`, t.pos);
  }
  return ast;
}
