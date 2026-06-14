export enum TokenType {
  Number = 'Number',
  String = 'String',
  Boolean = 'Boolean',
  Identifier = 'Identifier',
  Table = 'Table',
  Field = 'Field',
  Operator = 'Operator',
  LParen = 'LParen',
  RParen = 'RParen',
  LBracket = 'LBracket',
  RBracket = 'RBracket',
  Comma = 'Comma',
  Colon = 'Colon',
  Dot = 'Dot',
  Semicolon = 'Semicolon',
  Wildcard = 'Wildcard',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}
