import { parse } from '@economic/core/src/formula/parser';
import { financialFunctions } from '@economic/core/src/formula/financialFunctions';
import { ModelDefinition, CellType, ParameterDefinition } from '@economic/core';
import { ASTCompiler } from '@economic/executor/src/compiler/ASTCompiler';
import { SafeVM } from '@economic/executor/src/vm/SafeVM';
import { ResultRepository } from '../repository/ResultRepository.js';
import { collectDependencies } from '@economic/core/src/dag/dependencyExtractor.js';
import type { Database } from 'better-sqlite3';

export interface ComputeResult {
  cellCount: number;
  maxTimeIndex: number;
  durationMs: number;
  errors: Array<{ cellId: string; timeIndex: number; error: string }>;
  results: Array<{
    cellId: string;
    timeIndex: number;
    value: number | null;
  }>;
}

/**
 * ComputeService orchestrates full-model computation.
 *
 * Pipeline:
 *   1. Evaluate derived parameters (topological sort of parameter DAG, only
 *      parameter→parameter references allowed)
 *   2. For each formula cell, parse → compile → run in VM2 sandbox
 *   3. Save result per time index into results table
 *
 * The VM context exposes:
 *   - ctx.t                : current time index
 *   - ctx.getCell()        : table+field lookup (for Excel-style refs)
 *   - ctx.getCellArray()   : retrieve all time-series values for a cell
 *   - ctx.functions        : financial helper functions (NPV, IRR, etc.)
 *   - ctx.<cellId>         : direct value access for bare identifier refs
 *   - ctx.参数             : { [paramName]: paramValue } 命名空间
 */
export class ComputeService {
  private compiler = new ASTCompiler();
  private vm = new SafeVM({ timeout: 5000 });

  constructor(private db: Database.Database) {}

  compute(model: ModelDefinition): ComputeResult {
    const start = Date.now();
    const resultRepo = new ResultRepository(this.db);
    const errors: ComputeResult['errors'] = [];
    const results: ComputeResult['results'] = [];

    const cellMap = new Map(model.cells.map(c => [c.id, c]));
    const paramMap = new Map(model.parameters.map(p => [p.id, p]));
    const tableNameToId = new Map(model.tables.map(t => [t.name, t.id]));
    const constructionYears = model.timeline.constructionYears ?? 0;
    const operationYears = Math.max(0, model.timeline.operationYears ?? 0);
    const constructionCols = Math.ceil(constructionYears);
    const maxTime = Math.max(0, constructionCols + operationYears - 1);

    // Step 1: evaluate derived parameters (param -> param only)
    const paramValues = this.evaluateDerivedParameters(model.parameters);

    // Step 2: compute all formula cells
    for (const cell of model.cells) {
      if (cell.type !== CellType.Formula || !cell.formula.trim()) continue;

      // Every cell is processed as an array across all time indices
      const timeRange = Array.from({ length: maxTime + 1 }, (_, i) => i);

      for (const t of timeRange) {
        try {
          const ast = parse(cell.formula);
          const jsCode = this.compiler.compile(ast);
          const ctx = this.buildContext(
            t, cellMap, paramValues, paramMap, resultRepo, cell.id, model.id, tableNameToId
          );
          const result = this.vm.execute(jsCode, { ctx });
          const numericResult = typeof result === 'number' ? result : null;
          resultRepo.save(cell.id, model.id, t, numericResult);
          results.push({ cellId: cell.id, timeIndex: t, value: numericResult });
        } catch (e: any) {
          errors.push({ cellId: cell.id, timeIndex: t, error: e.message });
          resultRepo.save(cell.id, model.id, t, null);
          results.push({ cellId: cell.id, timeIndex: t, value: null });
        }
      }
    }

    return {
      cellCount: model.cells.filter(c => c.type === CellType.Formula && c.formula.trim()).length,
      maxTimeIndex: maxTime,
      durationMs: Date.now() - start,
      errors,
      results,
    };
  }

  /**
   * Evaluate derived parameters.
   *
   * Parameters without a `formula` use their `defaultValue` directly.
   * Parameters with a `formula` are computed in topological order,
   * referencing only other parameter values (ctx.参数 or bare identifier).
   */
  private evaluateDerivedParameters(parameters: ParameterDefinition[]): Map<string, unknown> {
    const values = new Map<string, unknown>();
    const paramMap = new Map(parameters.map(p => [p.id, p]));

    // Simple topological sort for parameter-only DAG
    const inDegree = new Map<string, number>();
    const deps = new Map<string, string[]>(); // paramId -> [depParamId, ...]

    for (const p of parameters) {
      inDegree.set(p.id, 0);
      deps.set(p.id, []);
    }

    for (const p of parameters) {
      if (!p.formula) continue;
      const depIds = this.extractParamDepsFromFormula(
        p.formula, parameters
      );
      deps.set(p.id, depIds);
      inDegree.set(p.id, depIds.length);
      // Update dependent counts
      for (const depId of depIds) {
        if (!inDegree.has(depId)) inDegree.set(depId, 0);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const processed: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      processed.push(id);
      const param = paramMap.get(id)!;

      if (!param.formula) {
        values.set(id, param.defaultValue);
      } else {
        try {
          const ast = parse(param.formula);
          const jsCode = this.compiler.compile(ast);
          const ctx = this.buildParamContext(values, parameters);
          const result = this.vm.execute(jsCode, { ctx });
          values.set(id, result);
        } catch (e: any) {
          values.set(id, param.defaultValue);
        }
      }

      // Decrement dependents' in-degree
      for (const [pid, paramDeps] of deps) {
        if (paramDeps.includes(id)) {
          const newDeg = (inDegree.get(pid) || 0) - 1;
          inDegree.set(pid, newDeg);
          if (newDeg === 0 && !processed.includes(pid)) {
            queue.push(pid);
          }
        }
      }
    }

    // Fallback: any parameter not topologically reachable gets its default
    for (const p of parameters) {
      if (!values.has(p.id)) {
        values.set(p.id, p.defaultValue);
      }
    }

    return values;
  }

  /**
   * Extract parameter dependencies from a formula.
   * Supports: bare param id refs (=p1), ctx.参数.name refs.
   * Only returns IDs of other parameters.
   */
  private extractParamDepsFromFormula(
    formula: string,
    parameters: ParameterDefinition[]
  ): string[] {
    const paramIdSet = new Set(parameters.map(p => p.id));
    const paramNameToId = new Map(parameters.map(p => [p.name, p.id]));
    const deps = new Set<string>();

    try {
      const ast = parse(formula);
      function visit(node: any) {
        if (!node) return;
        switch (node.type) {
          case 'CellRef': {
            // Check if table === '参数' → it's a parameter ref
            if (node.table === '参数') {
              const pid = paramNameToId.get(node.field);
              if (pid) deps.add(pid);
            }
            break;
          }
          case 'Identifier': {
            if (node.name !== 't' && paramIdSet.has(node.name)) {
              deps.add(node.name);
            }
            break;
          }
          case 'BinaryOp':
            visit(node.left);
            visit(node.right);
            break;
          case 'UnaryOp':
            visit(node.operand);
            break;
          case 'FunctionCall':
            for (const arg of node.args) visit(arg);
            break;
        }
      }
      visit(ast);
    } catch {
      // parse failed → no deps
    }
    return Array.from(deps);
  }

  private buildContext(
    t: number,
    cellMap: Map<string, ModelDefinition['cells'][number]>,
    paramValues: Map<string, unknown>,
    paramMap: Map<string, ParameterDefinition>,
    resultRepo: ResultRepository,
    targetCellId: string,
    modelId: string,
    tableNameToId: Map<string, string>
  ) {
    const ctx: any = {
      t,
      functions: financialFunctions,
      参数: {},
    };

    ctx.getCell = (tableRef: string, field: string, timeIdx?: number) => {
      if (tableRef === '参数') {
        return ctx.参数[field] ?? 0;
      }
      // Resolve table name -> table ID
      const resolvedTableId = tableNameToId.get(tableRef) ?? tableRef;
      const idx = timeIdx ?? t;
      for (const [, cell] of cellMap) {
        if (cell.tableId === resolvedTableId && cell.name === field && cell.id !== targetCellId) {
          const results = resultRepo.findByCell(cell.id);
          const found = results.find(r => r.timeIndex === idx && r.modelId === modelId);
          if (found) return found.value;
          // Handle Input cell `defaultValue` as array
          const dv = cell.defaultValue ?? 0;
          if (Array.isArray(dv) && idx < dv.length) return dv[idx];
          if (Array.isArray(dv)) return 0;
          return dv;
        }
      }
      return 0;
    };

    ctx.getCellArray = (tableRef: string, field: string) => {
      if (tableRef === '参数') {
        const v = ctx.参数[field];
        return v !== undefined ? [v] : [];
      }
      const resolvedTableId = tableNameToId.get(tableRef) ?? tableRef;
      for (const [, cell] of cellMap) {
        if (cell.tableId === resolvedTableId && cell.name === field && cell.id !== targetCellId) {
          const results = resultRepo.findByCell(cell.id);
          return results.map(r => r.value).filter(v => v !== null);
        }
      }
      return [];
    };

    // Direct cell-id references
    for (const [id, cell] of cellMap) {
      if (id === targetCellId) continue;
      const results = resultRepo.findByCell(id);
      const found = results.find(r => r.timeIndex === t && r.modelId === modelId);
      if (found) {
        ctx[id] = found.value;
      } else {
        const dv = cell.defaultValue ?? 0;
        if (Array.isArray(dv) && t < dv.length) {
          ctx[id] = dv[t];
        } else if (Array.isArray(dv)) {
          ctx[id] = 0;
        } else {
          ctx[id] = dv;
        }
      }
    }

    // Parameter values (by id and in 参数 namespace)
    const paramNs: Record<string, unknown> = {};
    for (const [id, value] of paramValues) {
      ctx[id] = value;
      const paramDef = paramMap.get(id);
      if (paramDef) paramNs[paramDef.name] = value;
    }
    ctx['参数'] = paramNs;

    return ctx;
  }

  /**
   * Build VM context for parameter evaluation.
   * Only exposes ctx.参数 namespace and bare param ids.
   */
  private buildParamContext(
    evaluatedValues: Map<string, unknown>,
    parameters: ParameterDefinition[]
  ): Record<string, unknown> {
    const ctx: Record<string, unknown> = { t: 0, functions: financialFunctions, 参数: {} };

    const nameToId = new Map(parameters.map(p => [p.name, p.id]));

    // Expose by id
    for (const [id, val] of evaluatedValues) {
      ctx[id] = val;
    }

    // Build 参数 namespace by name
    const paramNs: Record<string, unknown> = {};
    for (const p of parameters) {
      const val = evaluatedValues.get(p.id);
      if (val !== undefined) {
        paramNs[p.name] = val;
      }
    }
    ctx['参数'] = paramNs;

    return ctx;
  }
}
