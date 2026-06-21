import { TokenType, Token } from './interface';
import { normalizeFullwidth } from '../utils/normalizeFullwidth';

export { TokenType, type Token } from './interface';

export function tokenize(formula: string): Token[] {
  // 自动将全角字符替换为半角，避免 Unexpected character 错误
  formula = normalizeFullwidth(formula);

  const tokens: Token[] = [];
  let pos = 0;

  const peek = () => formula[pos];
  const advance = () => formula[pos++];
  const isAtEnd = () => pos >= formula.length;

  const addToken = (type: Token['type'], value: string, startPos: number) => {
    tokens.push({ type, value, pos: startPos });
  };

  while (!isAtEnd()) {
    const char = peek();

    if (/\s/.test(char)) {
      advance();
      continue;
    }

    const start = pos;

    // 先处理多字符运算符（==, !=, >=, <=）
    if (char === '=' && formula[pos + 1] === '=') {
      addToken(TokenType.Operator, '==', start); pos += 2; continue;
    }
    if (char === '!' && formula[pos + 1] === '=') {
      addToken(TokenType.Operator, '!=', start); pos += 2; continue;
    }
    if (char === '>' && formula[pos + 1] === '=') {
      addToken(TokenType.Operator, '>=', start); pos += 2; continue;
    }
    if (char === '<' && formula[pos + 1] === '=') {
      addToken(TokenType.Operator, '<=', start); pos += 2; continue;
    }

    // 单字符标点
    if ('+-/^%(),.:;[]'.includes(char)) {
      const tokType =
        char === '(' ? TokenType.LParen :
        char === ')' ? TokenType.RParen :
        char === '[' ? TokenType.LBracket :
        char === ']' ? TokenType.RBracket :
        char === ',' ? TokenType.Comma :
        char === ':' ? TokenType.Colon :
        char === '.' ? TokenType.Dot :
        char === ';' ? TokenType.Semicolon :
        TokenType.Operator;
      addToken(tokType, char, start);
      advance();
      continue;
    }

    // 不带 = 后缀的比较运算符
    if (char === '>' || char === '<') {
      addToken(TokenType.Operator, char, start);
      advance();
      continue;
    }

    // 数字
    if (/\d/.test(char)) {
      while (/\d/.test(peek())) advance();
      if (peek() === '.') {
        advance();
        while (/\d/.test(peek())) advance();
      }
      addToken(TokenType.Number, formula.slice(start, pos), start);
      continue;
    }

    // ID 引用: @{cellId} 或 @{paramId}
    if (char === '@' && formula[pos + 1] === '{') {
      const start = pos;
      pos += 2; // 跳过 @{
      const idStart = pos;
      while (pos < formula.length && formula[pos] !== '}') {
        pos++;
      }
      if (pos >= formula.length) throw new Error(`Unterminated @{id} reference at position ${start}`);
      const id = formula.slice(idStart, pos);
      pos++; // 跳过 }
      addToken(TokenType.IdRef, id, start);
      continue;
    }

    // 字符串字面量
    if (char === '"') {
      advance(); // 消费开引号
      while (!isAtEnd() && peek() !== '"') {
        advance();
      }
      if (isAtEnd()) throw new Error(`Unterminated string at position ${start}`);
      advance(); // 消费闭引号
      addToken(TokenType.String, formula.slice(start + 1, pos - 1), start);
      continue;
    }

    // 通配符（临时，将在后处理中重新分类）
    if (char === '*') {
      addToken(TokenType.Wildcard, '*', start);
      advance();
      continue;
    }

    // 等号
    if (char === '=') {
      addToken(TokenType.Operator, '=', start);
      advance();
      continue;
    }

    // 标识符 / 表名 / 字段名（包含中文字符）
    if (/[a-zA-Z_\u4e00-\u9fa5]/.test(char)) {
      while (!isAtEnd() && /[a-zA-Z0-9_\u4e00-\u9fa5]/.test(peek())) {
        advance();
      }
      addToken(TokenType.Identifier, formula.slice(start, pos), start);
      continue;
    }

    throw new Error(`Unexpected character '${char}' at position ${pos}`);
  }

  // =================== 后处理 ===================

  // 步骤 1: [...] 内的 * -> 通配符；否则 -> 运算符
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.Wildcard) {
      let bracketDepth = 0;
      for (let j = 0; j < i; j++) {
        if (tokens[j].value === '[') bracketDepth++;
        if (tokens[j].value === ']') bracketDepth--;
      }
      if (bracketDepth <= 0) {
        tokens[i].type = TokenType.Operator;
      }
    }
  }

  // 步骤 2: 前面是 . 的标识符 -> 字段名
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.Identifier) {
      const prev = tokens[i - 1];
      if (prev && prev.value === '.') {
        tokens[i].type = TokenType.Field;
      }
    }
  }

  // 步骤 2b: 前面是 . 的数字 -> 字段名（用于表码引用，如 表4.1）
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.Number) {
      const prev = tokens[i - 1];
      if (prev && prev.value === '.') {
        tokens[i].type = TokenType.Field;
      }
    }
  }

  // 步骤 2c: 合并连续的 Field.Dot.Number/Field 为单个 Field
  // 例如 "3.2" + "." + "2" -> "3.2.2"（支持多层编码如 1.2.3.4）
  {
    const merged: Token[] = [];
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i].type === TokenType.Field) {
        const startPos = tokens[i].pos;
        let value = tokens[i].value;
        while (
          i + 2 < tokens.length &&
          tokens[i + 1].type === TokenType.Dot &&
          (tokens[i + 2].type === TokenType.Number || tokens[i + 2].type === TokenType.Field)
        ) {
          value += '.' + tokens[i + 2].value;
          i += 2;
        }
        merged.push({ type: TokenType.Field, value, pos: startPos });
        i++;
      } else {
        merged.push(tokens[i]);
        i++;
      }
    }
    tokens.length = 0;
    tokens.push(...merged);
  }

  // 步骤 3: 后面跟着 . 的标识符 -> 表名
  //          或后面跟着 [ 且前面不是 . 的标识符 -> 表名
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.Identifier) {
      const next = tokens[i + 1];
      if (next && next.value === '.') {
        tokens[i].type = TokenType.Table;
      } else if (next && next.value === '[') {
        const prev = tokens[i - 1];
        if (!prev || prev.value !== '.') {
          tokens[i].type = TokenType.Table;
        }
      }
    }
  }

  // 步骤 4: true、false -> 布尔值
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.Identifier) {
      const val = tokens[i].value;
      if (val === 'true' || val === 'false') {
        tokens[i].type = TokenType.Boolean;
      }
    }
  }

  return tokens;
}
