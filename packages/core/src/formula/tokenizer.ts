import { TokenType, Token } from './interface';

export { TokenType, type Token } from './interface';

export function tokenize(formula: string): Token[] {
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

    // Multi-character operators first (== , !=, >=, <=)
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

    // Single character punctuation
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

    // Comparison operators without = second char
    if (char === '>' || char === '<') {
      addToken(TokenType.Operator, char, start);
      advance();
      continue;
    }

    // Number
    if (/\d/.test(char)) {
      while (/\d/.test(peek())) advance();
      if (peek() === '.') {
        advance();
        while (/\d/.test(peek())) advance();
      }
      addToken(TokenType.Number, formula.slice(start, pos), start);
      continue;
    }

    // ID reference: @{cellId} or @{paramId}
    if (char === '@' && formula[pos + 1] === '{') {
      const start = pos;
      pos += 2; // skip @{
      const idStart = pos;
      while (pos < formula.length && formula[pos] !== '}') {
        pos++;
      }
      if (pos >= formula.length) throw new Error(`Unterminated @{id} reference at position ${start}`);
      const id = formula.slice(idStart, pos);
      pos++; // skip }
      addToken(TokenType.IdRef, id, start);
      continue;
    }

    // String literal
    if (char === '"') {
      advance(); // consume opening quote
      while (!isAtEnd() && peek() !== '"') {
        advance();
      }
      if (isAtEnd()) throw new Error(`Unterminated string at position ${start}`);
      advance(); // consume closing quote
      addToken(TokenType.String, formula.slice(start + 1, pos - 1), start);
      continue;
    }

    // Wildcard temporarily (will be reclassified in post-processing)
    if (char === '*') {
      addToken(TokenType.Wildcard, '*', start);
      advance();
      continue;
    }

    // Equal sign
    if (char === '=') {
      addToken(TokenType.Operator, '=', start);
      advance();
      continue;
    }

    // Identifier / Table / Field name (includes Chinese characters)
    if (/[a-zA-Z_\u4e00-\u9fa5]/.test(char)) {
      while (!isAtEnd() && /[a-zA-Z0-9_\u4e00-\u9fa5]/.test(peek())) {
        advance();
      }
      addToken(TokenType.Identifier, formula.slice(start, pos), start);
      continue;
    }

    throw new Error(`Unexpected character '${char}' at position ${pos}`);
  }

  // =================== Post-processing ===================

  // Step 1: * inside [...] -> Wildcard; otherwise -> Operator
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

  // Step 2: preceded by . -> Field name
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.Identifier) {
      const prev = tokens[i - 1];
      if (prev && prev.value === '.') {
        tokens[i].type = TokenType.Field;
      }
    }
  }

  // Step 2b: preceded by . -> Field name (for Numbers used as cell codes like 表4.1)
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type === TokenType.Number) {
      const prev = tokens[i - 1];
      if (prev && prev.value === '.') {
        tokens[i].type = TokenType.Field;
      }
    }
  }

  // Step 2c: merge consecutive Field.Dot.Number/Field into single Field
  // e.g. "3.2" + "." + "2" -> "3.2.2" (supports multi-level codes like 1.2.3.4)
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

  // Step 3: followed by . -> Table name
  //          or followed by [ and not preceded by . -> Table name
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

  // Step 4: true, false -> Boolean
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
