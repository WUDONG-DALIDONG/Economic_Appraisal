/**
 * Extract cell dependencies from an AST formula.
 */
import { ASTNode, ASTNodeType } from '../types';
import { parse } from '../formula/parser';

export interface ResolveContext {
  resolveCellId(table: string, field: string): string | undefined;
}

export function collectDependencies(
  formula: string,
  context: ResolveContext
): string[] {
  // For script blocks, do best-effort regex extraction
  if (formula.startsWith('javascript:')) {
    return extractScriptDependencies(formula, context);
  }

  let ast: ASTNode;
  try {
    ast = parse(formula);
  } catch {
    return [];
  }

  const deps = new Set<string>();

  function visit(node: ASTNode) {
    switch (node.type) {
      case ASTNodeType.CellRef: {
        if (node.table === '@') {
          deps.add(node.field);
        } else {
          const cellId = context.resolveCellId(node.table, node.field);
          if (cellId) deps.add(cellId);
        }
        break;
      }
      case ASTNodeType.BinaryOp: {
        visit(node.left);
        visit(node.right);
        break;
      }
      case ASTNodeType.UnaryOp: {
        visit(node.operand);
        break;
      }
      case ASTNodeType.FunctionCall: {
        for (const arg of node.args) visit(arg);
        break;
      }
    }
  }

  visit(ast);
  return Array.from(deps);
}

function extractScriptDependencies(formula: string, context: ResolveContext): string[] {
  const deps = new Set<string>();
  const regex = /(\w+)(?:\.(\w+))?/g;
  let m;
  while ((m = regex.exec(formula)) !== null) {
    const table = m[1];
    const field = m[2];
    if (field) {
      const cellId = context.resolveCellId(table, field);
      if (cellId) deps.add(cellId);
    }
  }
  return Array.from(deps);
}
