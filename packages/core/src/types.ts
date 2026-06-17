/**
 * Economic Appraisal - Unified Type Definitions
 * 
 * Core types used by both frontend (AST Interpreter) and backend (AST Compiler)
 * to ensure identical computation behavior.
 */

// ============================================================================
// CellValue - The runtime value type used in cell evaluation
// ============================================================================

export type CellValue = number | string | boolean | null | CellValue[];

export function isNumericValue(value: CellValue): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isArrayValue(value: CellValue): value is CellValue[] {
  return Array.isArray(value);
}

// ============================================================================
// AST Node Types - Discriminated Union for Formula AST
// ============================================================================

export enum ASTNodeType {
  Literal = 'Literal',
  Identifier = 'Identifier',
  CellRef = 'CellRef',
  BinaryOp = 'BinaryOp',
  UnaryOp = 'UnaryOp',
  FunctionCall = 'FunctionCall',
  ScriptBlock = 'ScriptBlock',
}

export interface ASTNodeBase {
  type: ASTNodeType;
}

export interface LiteralNode extends ASTNodeBase {
  type: ASTNodeType.Literal;
  value: number | string | boolean | null;
}

export interface IdentifierNode extends ASTNodeBase {
  type: ASTNodeType.Identifier;
  name: string;
}

export interface CellRefNode extends ASTNodeBase {
  type: ASTNodeType.CellRef;
  table: string;
  field: string;
  timeShift: number;        // fixed offset (e.g. -1, 0, 1)
  timeRange: { start: number; end: number } | '*' | null;
  timeExpression?: ASTNode | null; // dynamic expression like [t-1]
}

export interface BinaryOpNode extends ASTNodeBase {
  type: ASTNodeType.BinaryOp;
  operator: '+' | '-' | '*' | '/' | '^' | '%' | '==' | '!=' | '>' | '<' | '>=' | '<=' | '&' | '|';
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOpNode extends ASTNodeBase {
  type: ASTNodeType.UnaryOp;
  operator: '+' | '-' | '!';
  operand: ASTNode;
}

export interface FunctionCallNode extends ASTNodeBase {
  type: ASTNodeType.FunctionCall;
  name: string;
  args: ASTNode[];
}

export interface ScriptBlockNode extends ASTNodeBase {
  type: ASTNodeType.ScriptBlock;
  language: 'javascript';
  code: string;
}

export type ASTNode =
  | LiteralNode
  | IdentifierNode
  | CellRefNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode
  | ScriptBlockNode;

// ============================================================================
// Cell Definition
// ============================================================================

export enum ComputeMode {
  Title = 'Title',
  Input = 'Input',
  Formula = 'Formula',
  Script = 'Script',
}

export enum ValueType {
  Number = 'number',
  Percentage = 'percentage',
  Enum = 'enum',
  String = 'string',
  Boolean = 'boolean',
  Date = 'date',
}

export interface CellDefinition {
  id: string;
  name: string;
  code?: string;          // 层级编码 (e.g. "1", "1.2", "1.2.3")
  parentId?: string | null; // null = 顶级
  sortOrder?: number;
  tableId: string;
  formula: string;
  computeMode: ComputeMode;
  valueType: ValueType;
  unit: string;
  description?: string;
  defaultValue?: CellValue;
  isArray?: boolean;
  scope?: 'construction' | 'operation' | 'both';
  precision?: number;
  useGrouping?: boolean;
}

// ============================================================================
// Table Definition
// ============================================================================

export interface TableDefinition {
  id: string;
  name: string;
  order: number;
  description?: string;
}

// ============================================================================
// Parameter Definition
// ============================================================================

export interface ParameterDefinition {
  id: string;
  name: string;
  code?: string;               // 层级编码 (e.g. "1", "1.2")
  parentId?: string | null;    // null = 顶级参数
  sortOrder?: number;
  valueType: ValueType;
  computeMode: ComputeMode;
  defaultValue: CellValue;
  formula?: string;            // 派生参数公式
  min?: number;
  max?: number;
  unit?: string;
  description?: string;
  options?: string[];
  precision?: number;
  useGrouping?: boolean;
}

// ============================================================================
// Model Definition
// ============================================================================

export interface ModelDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  tables: TableDefinition[];
  cells: CellDefinition[];
  parameters: ParameterDefinition[];
  timeline: {
    constructionYears: number;
    operationYears: number;
    startYear: number;
  };
  metadata: {
    author: string;
    createdAt: string;
    updatedAt: string;
  };
}

// ============================================================================
// Time Context - Passed to interpreters/compilers during cell evaluation
// ============================================================================

export interface TimeContext {
  absoluteYear: number;
  relativeYear: number;     // 1, 2, 3...
  isConstruction: boolean;
  isOperation: boolean;
  constructionYears: number;
  operationYears: number;
  totalYears: number;
}

// ============================================================================
// Cell Reference
// ============================================================================

export interface CellReference {
  table: string;
  field: string;
  timeIndex?: number | '*';
}

// ============================================================================
// Evaluation Result
// ============================================================================

export interface EvaluationResult {
  success: boolean;
  value: CellValue;
  error?: string;
  dependencies: string[];
}
