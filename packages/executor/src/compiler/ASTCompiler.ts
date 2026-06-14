import {
  ASTNode,
  ASTNodeType,
  type CellRefNode,
  type FunctionCallNode,
} from '@economic/core';

/**
 * Compiles an AST (Abstract Syntax Tree) into JavaScript code strings.
 *
 * The generated code uses a `ctx` runtime object with these APIs:
 * - ctx.t: current time index (relative year)
 * - ctx.getCell(table, field, timeIndex): retrieve a single cell value
 * - ctx.getCellArray(table, field): retrieve all time-period values for a cell
 * - ctx.functions[name](args...): invoke financial/helper functions
 *
 * This ensures frontend interpreter and backend compiler produce identical
 * results given the same runtime context.
 */
export class ASTCompiler {
  compile(node: ASTNode): string {
    switch (node.type) {
      case ASTNodeType.Literal:
        return this.compileLiteral(node.value);

      case ASTNodeType.Identifier:
        return this.compileIdentifier(node.name);

      case ASTNodeType.CellRef:
        return this.compileCellRef(node);

      case ASTNodeType.BinaryOp:
        return `(${this.compile(node.left)} ${node.operator} ${this.compile(node.right)})`;

      case ASTNodeType.UnaryOp:
        return `(${node.operator}${this.compile(node.operand)})`;

      case ASTNodeType.FunctionCall:
        return this.compileFunctionCall(node);

      case ASTNodeType.ScriptBlock:
        throw new Error(
          'ScriptBlock compilation not supported in ASTCompiler. Use SafeVM for scripts.'
        );

      default:
        throw new Error(`Unknown AST node type: ${(node as ASTNode).type}`);
    }
  }

  private compileLiteral(value: number | string | boolean | null): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
    return String(value);
  }

  private compileIdentifier(name: string): string {
    if (name === 't') {
      return 'ctx.t';
    }
    // Other identifiers reference runtime variables on ctx
    return `ctx.${name}`;
  }

  private compileCellRef(node: CellRefNode): string {
    const { table, field, timeRange, timeExpression } = node;

    if (timeRange === '*') {
      return `ctx.getCellArray("${table}", "${field}")`;
    }

    let timeArg: string;
    if (timeExpression) {
      timeArg = this.compile(timeExpression);
    } else {
      timeArg = 'ctx.t';
    }

    return `ctx.getCell("${table}", "${field}", ${timeArg})`;
  }

  private compileFunctionCall(node: FunctionCallNode): string {
    const args = node.args.map(arg => this.compile(arg)).join(', ');
    return `ctx.functions["${node.name}"](${args})`;
  }
}
