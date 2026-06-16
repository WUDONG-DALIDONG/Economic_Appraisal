/**
 * AST Interpreter - Evaluates parsed AST nodes
 */
import {
  ASTNode,
  ASTNodeType,
  CellValue,
  TimeContext,
} from '../types';

export interface EvalContext {
  getCellValue(table: string, field: string, timeIndex: number): CellValue;
  getCellById(id: string, timeIndex: number): CellValue;
  getCellArrayById(id: string): CellValue[];
  getAllOperationPeriods(): TimeContext[];
  timeContext: TimeContext;
  functions: Record<string, (...args: CellValue[]) => CellValue>;
}

export function evaluate(node: ASTNode, ctx: EvalContext): CellValue {
  switch (node.type) {
    case ASTNodeType.Literal:
      return node.value;

    case ASTNodeType.Identifier: {
      if (node.name === 't') {
        return ctx.timeContext.relativeYear;
      }
      return null;
    }

    case ASTNodeType.CellRef: {
      if (node.table === '@') {
        if (node.timeRange === '*') {
          return ctx.getCellArrayById(node.field);
        }

        let timeIndex: number;
        if (node.timeExpression) {
          const evaluated = evaluate(node.timeExpression, ctx);
          if (typeof evaluated !== 'number') return null;
          timeIndex = evaluated;
        } else if (node.timeRange && typeof node.timeRange === 'object') {
          if (node.timeRange.start === node.timeRange.end) {
            timeIndex = node.timeRange.start;
          } else {
            const results: CellValue[] = [];
            for (let i = node.timeRange.start; i <= node.timeRange.end; i++) {
              results.push(ctx.getCellById(node.field, i));
            }
            return results;
          }
        } else {
          timeIndex = ctx.timeContext.relativeYear;
        }

        return ctx.getCellById(node.field, timeIndex);
      }

      if (node.timeRange === '*') {
        // Wildcard: collect all periods
        const allPeriods = ctx.getAllOperationPeriods();
        const results: CellValue[] = [];
        for (const period of allPeriods) {
          const val = ctx.getCellValue(node.table, node.field, period.relativeYear);
          results.push(val);
        }
        return results;
      }

      let timeIndex: number;
      if (node.timeExpression) {
        const evaluated = evaluate(node.timeExpression, ctx);
        if (typeof evaluated !== 'number') return null;
        timeIndex = evaluated;
      } else if (node.timeRange && typeof node.timeRange === 'object') {
        if (node.timeRange.start === node.timeRange.end) {
          // Single index like [0] or [1]
          timeIndex = node.timeRange.start;
        } else {
          // Range [1:5]
          const results: CellValue[] = [];
          for (let i = node.timeRange.start; i <= node.timeRange.end; i++) {
            results.push(ctx.getCellValue(node.table, node.field, i));
          }
          return results;
        }
      } else {
        timeIndex = ctx.timeContext.relativeYear;
      }

      return ctx.getCellValue(node.table, node.field, timeIndex);
    }

    case ASTNodeType.BinaryOp: {
      const left = evaluate(node.left, ctx);
      const right = evaluate(node.right, ctx);

      if (left === null || right === null) return null;

      switch (node.operator) {
        case '+': return (left as number) + (right as number);
        case '-': return (left as number) - (right as number);
        case '*': return (left as number) * (right as number);
        case '/': return (left as number) / (right as number);
        case '^': return Math.pow(left as number, right as number);
        case '%': return (left as number) % (right as number);
        case '==': return left === right;
        case '!=': return left !== right;
        case '>': return (left as number) > (right as number);
        case '<': return (left as number) < (right as number);
        case '>=': return (left as number) >= (right as number);
        case '<=': return (left as number) <= (right as number);
        default: return null;
      }
    }

    case ASTNodeType.UnaryOp: {
      const operand = evaluate(node.operand, ctx);
      if (operand === null) return null;

      switch (node.operator) {
        case '+': return +(operand as number);
        case '-': return -(operand as number);
        case '!': return !operand;
        default: return null;
      }
    }

    case ASTNodeType.FunctionCall: {
      const fn = ctx.functions[node.name];
      if (!fn) return null;
      const args = node.args.map(arg => evaluate(arg, ctx));
      return fn(...args);
    }

    case ASTNodeType.ScriptBlock:
      // Script blocks are not evaluated by the interpreter
      return null;

    default:
      return null;
  }
}
