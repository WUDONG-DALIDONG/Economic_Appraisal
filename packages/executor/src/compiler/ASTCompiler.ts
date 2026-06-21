import {
  ASTNode,
  ASTNodeType,
  type CellRefNode,
  type FunctionCallNode,
} from '@economic/core';

/**
 * 将 AST（抽象语法树）编译为 JavaScript 代码字符串。
 *
 * 生成的代码使用 `ctx` 运行时对象，提供以下 API：
 * - ctx.t: 当前时间索引（相对年份）
 * - ctx.getCell(table, field, timeIndex): 获取单个单元格的值
 * - ctx.getCellArray(table, field): 获取单元格所有时间周期的值
 * - ctx.functions[name](args...): 调用财务/辅助函数
 *
 * 这确保了前端解释器和后端编译器在相同的运行时上下文中
 * 产生一致的结果。
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
    // 其他标识符引用 ctx 上的运行时变量
    return `ctx.${name}`;
  }

  private compileCellRef(node: CellRefNode): string {
    const { table, field, timeRange, timeExpression } = node;

    if (table === '@') {
      if (timeRange === '*') {
        return `ctx.getCellArrayById("${field}")`;
      }

      let timeArg: string;
      if (timeExpression) {
        timeArg = this.compile(timeExpression);
      } else {
        timeArg = 'ctx.t';
      }

      return `ctx.getById("${field}", ${timeArg})`;
    }

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
