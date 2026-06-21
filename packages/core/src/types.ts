/**
 * 经济评价 - 统一类型定义
 * 
 * 前端（AST 解释器）和后端（AST 编译器）共用的核心类型，
 * 以确保两端计算行为一致。
 */

// ============================================================================
// CellValue - 单元格求值时使用的运行时值类型
// ============================================================================

export type CellValue = number | string | boolean | null | CellValue[];

export function isNumericValue(value: CellValue): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isArrayValue(value: CellValue): value is CellValue[] {
  return Array.isArray(value);
}

// ============================================================================
// AST 节点类型 - 公式 AST 的可辨识联合类型
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
  timeShift: number;        // 固定偏移量（如 -1, 0, 1）
  timeRange: { start: number; end: number } | '*' | null;
  timeExpression?: ASTNode | null; // 动态表达式，如 [t-1]
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
// 单元格定义
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
// 表定义
// ============================================================================

export interface TableDefinition {
  id: string;
  name: string;
  order: number;
  description?: string;
}

// ============================================================================
// 参数定义
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
// 模型定义
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
// 时间上下文 - 在单元格求值时传递给解释器/编译器
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
// 单元格引用
// ============================================================================

export interface CellReference {
  table: string;
  field: string;
  timeIndex?: number | '*';
}

// ============================================================================
// 求值结果
// ============================================================================

export interface EvaluationResult {
  success: boolean;
  value: CellValue;
  error?: string;
  dependencies: string[];
}
