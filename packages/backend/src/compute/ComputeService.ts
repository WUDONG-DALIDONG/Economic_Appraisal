import { parse } from '@economic/core/src/formula/parser';
import { financialFunctions } from '@economic/core/src/formula/financialFunctions';
import { ModelDefinition, CellType, ParameterDefinition } from '@economic/core';
import { recomputeCodes } from '@economic/core/src/utils/coding.js';
import { ASTCompiler } from '@economic/executor/src/compiler/ASTCompiler';
import { SafeVM } from '@economic/executor/src/vm/SafeVM';
import { ResultRepository } from '../repository/ResultRepository.js';
import { collectDependencies } from '@economic/core/src/dag/dependencyExtractor.js';
import { buildDAG } from '@economic/core/src/dag/engine.js';
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

  private static readonly MAX_ITERATIONS = 100;
  private static readonly CONVERGENCE_THRESHOLD = 0.01;

  compute(model: ModelDefinition): ComputeResult {
    const start = Date.now();
    const resultRepo = new ResultRepository(this.db);
    const errors: ComputeResult['errors'] = [];
    const results: ComputeResult['results'] = [];

    // Clear stale results to ensure clean computation
    resultRepo.deleteByModel(model.id);

    const cellMap = new Map(model.cells.map(c => [c.id, c]));
    const paramMap = new Map(model.parameters.map(p => [p.id, p]));
    const tableNameToId = new Map(model.tables.map(t => [t.name, t.id]));
    const constructionYears = model.timeline.constructionYears ?? 0;
    const operationYears = Math.max(0, model.timeline.operationYears ?? 0);
    const constructionCols = Math.ceil(constructionYears);
    const maxTime = Math.max(0, constructionCols + operationYears - 1);

    // Step 1: evaluate derived parameters (param -> param only)
    const paramValues = this.evaluateDerivedParameters(model.parameters);

    // Step 2: build cell DAG and topologically sort
    const dag = buildDAG(
      model.cells,
      (table, field) => {
        if (table === '@') return field;
        return this.resolveCellId(table, field, model, tableNameToId);
      },
      collectDependencies
    );

    // Remove self-references (e.g. [t-1] cumulative formulas) to avoid false cycles
    for (const [id, node] of dag.nodes) {
      node.dependencies = node.dependencies.filter(depId => depId !== id);
      node.dependents = node.dependents.filter(depId => depId !== id);
    }

    // Topological sort after removing self-loops
    const orderedCellIds = this.topologicalSort(dag.nodes);

    if (orderedCellIds !== null) {
      // No cycle — normal computation path
      this.computeCellsInOrder(orderedCellIds, cellMap, paramValues, paramMap, resultRepo, model, tableNameToId, constructionCols, maxTime, errors, results);
    } else {
      // Cycle detected — iterative convergence path
      const nonCycleIds = this.getNonCycleIds(dag.nodes);
      const cycleIds = this.getCycleIds(dag.nodes);

      // Step 3a: compute non-cycle cells in topological order first
      if (nonCycleIds.length > 0) {
        const nonCycleOrdered = this.topologicalSortFiltered(dag.nodes, new Set(nonCycleIds));
        if (nonCycleOrdered) {
          this.computeCellsInOrder(nonCycleOrdered, cellMap, paramValues, paramMap, resultRepo, model, tableNameToId, constructionCols, maxTime, errors, results);
        }
      }

      // Step 3b: iterative computation for cycle cells
      this.computeCycleIteratively(
        cycleIds, dag.nodes, cellMap, paramValues, paramMap, resultRepo,
        model, tableNameToId, constructionCols, maxTime, errors, results
      );
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
   * Compute a list of cell IDs in the given order (topological).
   * Shared by normal path and iterative path.
   */
  private computeCellsInOrder(
    orderedCellIds: string[],
    cellMap: Map<string, ModelDefinition['cells'][number]>,
    paramValues: Map<string, unknown>,
    paramMap: Map<string, ParameterDefinition>,
    resultRepo: ResultRepository,
    model: ModelDefinition,
    tableNameToId: Map<string, string>,
    constructionCols: number,
    maxTime: number,
    errors: ComputeResult['errors'],
    results: ComputeResult['results']
  ): void {
    const timeRange = Array.from({ length: maxTime + 1 }, (_, i) => i);

    for (const cellId of orderedCellIds) {
      const cell = cellMap.get(cellId);
      if (!cell || cell.type !== CellType.Formula || !cell.formula.trim()) continue;

      for (const t of timeRange) {
        if (!this.isInScope(cell.scope, t, constructionCols)) {
          resultRepo.save(cell.id, model.id, t, 0);
          results.push({ cellId: cell.id, timeIndex: t, value: 0 });
          continue;
        }

        try {
          const ast = parse(cell.formula);
          const jsCode = this.compiler.compile(ast);
          const ctx = this.buildContext(
            t, cellMap, paramValues, paramMap, resultRepo, cell.id, model.id, tableNameToId, constructionCols, model.parameters
          );
          const result = this.vm.execute(jsCode, { ctx });
          if (result === '#REF!') {
            errors.push({ cellId: cell.id, timeIndex: t, error: '#REF! - 引用了已删除的指标' });
            resultRepo.save(cell.id, model.id, t, null);
            results.push({ cellId: cell.id, timeIndex: t, value: null });
          } else {
            const numericResult = typeof result === 'number' ? result : null;
            resultRepo.save(cell.id, model.id, t, numericResult);
            results.push({ cellId: cell.id, timeIndex: t, value: numericResult });
          }
        } catch (e: any) {
          errors.push({ cellId: cell.id, timeIndex: t, error: e.message });
          resultRepo.save(cell.id, model.id, t, null);
          results.push({ cellId: cell.id, timeIndex: t, value: null });
        }
      }
    }
  }

  /**
   * Iterative computation for cells involved in dependency cycles.
   * 
   * Algorithm:
   * 1. Seed cycle cells with initial values (defaultValue or 0)
   * 2. Repeatedly compute cycle cells in dependency order
   * 3. After each full pass, check if results have converged
   * 4. Stop when max difference < threshold, or max iterations reached
   */
  private computeCycleIteratively(
    cycleIds: string[],
    dagNodes: Map<string, { cellId: string; dependencies: string[]; dependents: string[] }>,
    cellMap: Map<string, ModelDefinition['cells'][number]>,
    paramValues: Map<string, unknown>,
    paramMap: Map<string, ParameterDefinition>,
    resultRepo: ResultRepository,
    model: ModelDefinition,
    tableNameToId: Map<string, string>,
    constructionCols: number,
    maxTime: number,
    errors: ComputeResult['errors'],
    results: ComputeResult['results']
  ): void {
    const timeRange = Array.from({ length: maxTime + 1 }, (_, i) => i);
    const cycleSet = new Set(cycleIds);

    // Determine computation order within cycle: sort by dependency depth
    // (cells with fewer in-cycle deps first)
    const cycleOrdered = this.sortCycleCells(cycleIds, dagNodes, cycleSet);

    // Seed initial values for cycle cells
    for (const cellId of cycleIds) {
      const cell = cellMap.get(cellId);
      if (!cell) continue;

      for (const t of timeRange) {
        if (!this.isInScope(cell.scope, t, constructionCols)) {
          resultRepo.save(cell.id, model.id, t, 0);
          continue;
        }

        // Use defaultValue as seed, or 0 if unavailable
        const dv = cell.defaultValue ?? 0;
        let seedValue = 0;
        if (Array.isArray(dv) && t < dv.length) {
          seedValue = dv[t] ?? 0;
        } else if (typeof dv === 'number') {
          seedValue = dv;
        }

        resultRepo.save(cell.id, model.id, t, seedValue);
      }
    }

    // Iterative convergence loop
    let iteration = 0;
    let converged = false;

    while (iteration < ComputeService.MAX_ITERATIONS && !converged) {
      iteration++;
      converged = true;

      for (const cellId of cycleOrdered) {
        const cell = cellMap.get(cellId);
        if (!cell || cell.type !== CellType.Formula || !cell.formula.trim()) continue;

        for (const t of timeRange) {
          if (!this.isInScope(cell.scope, t, constructionCols)) continue;

          try {
            const ast = parse(cell.formula);
            const jsCode = this.compiler.compile(ast);
            const ctx = this.buildContext(
              t, cellMap, paramValues, paramMap, resultRepo, cell.id, model.id, tableNameToId, constructionCols, model.parameters
            );
            const result = this.vm.execute(jsCode, { ctx });

            if (result === '#REF!') {
              errors.push({ cellId: cell.id, timeIndex: t, error: '#REF! - 引用了已删除的指标' });
              resultRepo.save(cell.id, model.id, t, null);
              continue;
            }

            const numericResult = typeof result === 'number' ? result : null;

            // Check convergence: compare with previous value
            const prevResults = resultRepo.findByCell(cell.id);
            const prev = prevResults.find(r => r.timeIndex === t && r.modelId === model.id);
            const prevValue = prev?.value ?? 0;
            const newValue = numericResult ?? 0;

            if (Math.abs(newValue - prevValue) > ComputeService.CONVERGENCE_THRESHOLD) {
              converged = false;
            }

            resultRepo.save(cell.id, model.id, t, numericResult);
          } catch (e: any) {
            errors.push({ cellId: cell.id, timeIndex: t, error: e.message });
            resultRepo.save(cell.id, model.id, t, null);
          }
        }
      }
    }

    // Collect final results for cycle cells
    for (const cellId of cycleIds) {
      const cell = cellMap.get(cellId);
      if (!cell || cell.type !== CellType.Formula || !cell.formula.trim()) continue;

      for (const t of timeRange) {
        const stored = resultRepo.findByCell(cell.id);
        const found = stored.find(r => r.timeIndex === t && r.modelId === model.id);
        results.push({ cellId: cell.id, timeIndex: t, value: found?.value ?? null });
      }
    }

    // Add convergence warning if not fully converged
    if (!converged) {
      errors.push({
        cellId: cycleIds[0],
        timeIndex: 0,
        error: `循环依赖迭代未收敛（${iteration}次迭代），结果可能不精确`
      });
    }
  }

  /**
   * Get cell IDs that are NOT part of any dependency cycle.
   */
  private getNonCycleIds(nodes: Map<string, { cellId: string; dependencies: string[]; dependents: string[] }>): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const [id, node] of nodes) {
      inDegree.set(id, node.dependencies.length);
      adjList.set(id, [...node.dependents]);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const nonCycle: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      nonCycle.push(id);
      for (const dependent of adjList.get(id) || []) {
        const newDeg = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    return nonCycle;
  }

  /**
   * Get cell IDs that ARE part of a dependency cycle.
   */
  private getCycleIds(nodes: Map<string, { cellId: string; dependencies: string[]; dependents: string[] }>): string[] {
    const nonCycle = new Set(this.getNonCycleIds(nodes));
    const cycleIds: string[] = [];
    for (const [id] of nodes) {
      if (!nonCycle.has(id)) cycleIds.push(id);
    }
    return cycleIds;
  }

  /**
   * Topological sort for a subset of nodes (filtered by allowedIds).
   */
  private topologicalSortFiltered(
    nodes: Map<string, { cellId: string; dependencies: string[]; dependents: string[] }>,
    allowedIds: Set<string>
  ): string[] | null {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const id of allowedIds) {
      const node = nodes.get(id);
      if (!node) continue;
      const filteredDeps = node.dependencies.filter(d => allowedIds.has(d));
      const filteredDependents = node.dependents.filter(d => allowedIds.has(d));
      inDegree.set(id, filteredDeps.length);
      adjList.set(id, filteredDependents);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const ordered: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      ordered.push(id);
      for (const dependent of adjList.get(id) || []) {
        const newDeg = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    if (ordered.length === allowedIds.size) return ordered;
    return null;
  }

  /**
   * Sort cycle cells into a reasonable computation order.
   * Cells with fewer in-cycle dependencies come first.
   */
  private sortCycleCells(
    cycleIds: string[],
    dagNodes: Map<string, { cellId: string; dependencies: string[]; dependents: string[] }>,
    cycleSet: Set<string>
  ): string[] {
    return [...cycleIds].sort((a, b) => {
      const aDeps = (dagNodes.get(a)?.dependencies ?? []).filter(d => cycleSet.has(d)).length;
      const bDeps = (dagNodes.get(b)?.dependencies ?? []).filter(d => cycleSet.has(d)).length;
      return aDeps - bDeps;
    });
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
   * Supports:
   *   - ctx.参数.名称 ref
   *   - ctx.参数.父.子 ref (按 display path 或 code path)
   *   - bare param id/name refs
   * Only returns IDs of other parameters.
   */
  private extractParamDepsFromFormula(
    formula: string,
    parameters: ParameterDefinition[]
  ): string[] {
    const paramIdSet = new Set(parameters.map(p => p.id));
    const paramNameToId = new Map(parameters.map(p => [p.name, p.id]));
    // Build code -> id lookup for hierarchical code refs
    const codeToId = new Map(parameters.map(p => [p.code, p.id]).filter(([c]) => c) as [string, string][]);
    // Build code -> full path mapping for parameter refs by path
    const paramCodeToPath = this.buildParamPathMap(parameters);
    const pathToId = new Map<string, string>();
    for (const [code, path] of paramCodeToPath.entries()) {
      pathToId.set(path, codeToId.get(code)!);
    }

    const deps = new Set<string>();

    try {
      const ast = parse(formula);
      function visit(node: any) {
        if (!node) return;
        switch (node.type) {
          case 'CellRef': {
            if (node.table === '@') {
              deps.add(node.field);
            } else if (node.table === '参数') {
              const parts = (node.field as string).split('.');
              // Try full path match first
              const path = '参数.' + node.field;
              const byPath = pathToId.get(path);
              if (byPath) {
                deps.add(byPath);
                break;
              }
              // Try leaf code match
              const leafCode = parts[parts.length - 1];
              const byCode = codeToId.get(leafCode);
              if (byCode) {
                deps.add(byCode);
                break;
              }
              // Try leaf name match
              const leafName = parts[parts.length - 1];
              const byName = paramNameToId.get(leafName);
              if (byName) deps.add(byName);
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

  /**
   * Build parameter code -> full display path map.
   * E.g. code "1.2" → "参数.总投资.建设投资"
   */
  private buildParamPathMap(parameters: ParameterDefinition[]): Map<string, string> {
    const codeToName = new Map(parameters.map(p => [p.code, p.name]).filter(([c]) => c) as [string, string][]);
    const codeToParentId = new Map(parameters.map(p => [p.code, p.parentId ?? null]).filter(([c]) => c) as [string, string | null][]);
    const result = new Map<string, string>();
    for (const p of parameters) {
      if (!p.code) continue;
      const parts: string[] = [];
      let curCode: string | null = p.code;
      while (curCode) {
        parts.unshift(codeToName.get(curCode) ?? curCode);
        curCode = codeToParentId.get(curCode) ?? null;
        // If parentId is a cell id rather than code, stop
        if (curCode && !codeToName.has(curCode)) break;
      }
      result.set(p.code, '参数.' + parts.join('.'));
    }
    return result;
  }

  private buildContext(
    t: number,
    cellMap: Map<string, ModelDefinition['cells'][number]>,
    paramValues: Map<string, unknown>,
    paramMap: Map<string, ParameterDefinition>,
    resultRepo: ResultRepository,
    _targetCellId: string,
    modelId: string,
    tableNameToId: Map<string, string>,
    constructionCols: number,
    parameters: ParameterDefinition[]
  ) {
    const ctx: any = {
      t,
      functions: financialFunctions,
      参数: {},
    };

    const codeToId = new Map(parameters.map(p => [p.code, p.id]).filter(([c]) => c) as [string, string][]);

    ctx.getById = (id: string, timeIdx?: number) => {
      const idx = timeIdx ?? t;

      // Check if it's a parameter
      if (paramMap.has(id)) {
        const val = paramValues.get(id);
        return val !== undefined ? val : 0;
      }

      // Check if it's a cell
      const cell = cellMap.get(id);
      if (!cell) return '#REF!';

      if (!this.isInScope(cell.scope, idx, constructionCols)) return 0;
      const results = resultRepo.findByCell(id);
      const found = results.find(r => r.timeIndex === idx && r.modelId === modelId);
      if (found) return found.value;
      const dv = cell.defaultValue ?? 0;
      if (Array.isArray(dv) && idx >= 0 && idx < dv.length) return dv[idx];
      if (Array.isArray(dv)) return 0;
      return dv;
    };

    ctx.getCellArrayById = (id: string) => {
      if (paramMap.has(id)) {
        const v = paramValues.get(id);
        return v !== undefined ? [v] : [];
      }

      const cell = cellMap.get(id);
      if (!cell) return [];
      const results = resultRepo.findByCell(id);
      return results
        .filter(r => this.isInScope(cell.scope, r.timeIndex, constructionCols))
        .map(r => r.value)
        .filter(v => v !== null);
    };

    ctx.getCell = (tableRef: string, field: string, timeIdx?: number) => {
      if (tableRef === '参数') {
        // Hierarchical path resolution for parameters
        const parts = field.split('.');
        // Try full path match backwards
        let resolvedId: string | undefined;
        for (let i = parts.length; i >= 1; i--) {
          const pathCode = parts.slice(parts.length - i).join('.');
          resolvedId = codeToId.get(pathCode);
          if (resolvedId) break;
        }
        // Fallback: match by name
        if (!resolvedId) {
          for (const p of parameters) {
            if (p.name === field || (parts.length > 0 && p.name === parts[parts.length - 1])) {
              resolvedId = p.id;
              break;
            }
          }
        }
        if (resolvedId && paramValues.has(resolvedId)) {
          return paramValues.get(resolvedId);
        }
        // Legacy name fallback via ctx.参数 name map
        return ctx.参数[field] ?? 0;
      }
      // Resolve table name -> table ID
      const resolvedTableId = tableNameToId.get(tableRef) ?? tableRef;
      const idx = timeIdx ?? t;

      // Phase 1: match by stable code (preferred)
      for (const [, cell] of cellMap) {
        if (cell.tableId === resolvedTableId && cell.code === field) {
          if (!this.isInScope(cell.scope, idx, constructionCols)) return 0;
          const results = resultRepo.findByCell(cell.id);
          const found = results.find(r => r.timeIndex === idx && r.modelId === modelId);
          if (found) return found.value;
          const dv = cell.defaultValue ?? 0;
          if (Array.isArray(dv) && idx >= 0 && idx < dv.length) return dv[idx];
          if (Array.isArray(dv)) return 0;
          return dv;
        }
      }

      // Phase 2: fallback match by name (legacy compat)
      for (const [, cell] of cellMap) {
        if (cell.tableId === resolvedTableId && cell.name === field) {
          if (!this.isInScope(cell.scope, idx, constructionCols)) return 0;
          const results = resultRepo.findByCell(cell.id);
          const found = results.find(r => r.timeIndex === idx && r.modelId === modelId);
          if (found) return found.value;
          const dv = cell.defaultValue ?? 0;
          if (Array.isArray(dv) && idx >= 0 && idx < dv.length) return dv[idx];
          if (Array.isArray(dv)) return 0;
          return dv;
        }
      }
      return 0;
    };

    ctx.getCellArray = (tableRef: string, field: string) => {
      if (tableRef === '参数') {
        // Hierarchical path resolution for parameters
        const parts = field.split('.');
        let resolvedId: string | undefined;
        for (let i = parts.length; i >= 1; i--) {
          const pathCode = parts.slice(parts.length - i).join('.');
          resolvedId = codeToId.get(pathCode);
          if (resolvedId) break;
        }
        if (!resolvedId) {
          for (const p of parameters) {
            if (p.name === field || (parts.length > 0 && p.name === parts[parts.length - 1])) {
              resolvedId = p.id;
              break;
            }
          }
        }
        if (resolvedId) {
          const v = paramValues.get(resolvedId);
          return v !== undefined ? [v] : [];
        }
        const v = ctx.参数[field];
        return v !== undefined ? [v] : [];
      }
      const resolvedTableId = tableNameToId.get(tableRef) ?? tableRef;

      // Phase 1: match by stable code
      for (const [, cell] of cellMap) {
        if (cell.tableId === resolvedTableId && cell.code === field) {
          const results = resultRepo.findByCell(cell.id);
          return results
            .filter(r => this.isInScope(cell.scope, r.timeIndex, constructionCols))
            .map(r => r.value)
            .filter(v => v !== null);
        }
      }
      // Phase 2: fallback match by name
      for (const [, cell] of cellMap) {
        if (cell.tableId === resolvedTableId && cell.name === field) {
          const results = resultRepo.findByCell(cell.id);
          return results
            .filter(r => this.isInScope(cell.scope, r.timeIndex, constructionCols))
            .map(r => r.value)
            .filter(v => v !== null);
        }
      }
      return [];
    };

    // Direct cell-id references
    for (const [id, cell] of cellMap) {
      if (id === _targetCellId) continue;
      if (!this.isInScope(cell.scope, t, constructionCols)) {
        ctx[id] = 0;
        continue;
      }
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

    // Parameter values: expose by id, name, and hierarchical paths
    const paramNs: Record<string, unknown> = {};
    const paramPathValueMap = this.buildParamValueMap(parameters, paramValues);
    for (const [path, value] of paramPathValueMap.entries()) {
      // Set nested object structure: 参数.总投资.建设投资
      const parts = path.split('.');
      let cur = paramNs;
      for (let i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] === undefined) cur[parts[i]] = {};
        cur = cur[parts[i]] as Record<string, unknown>;
      }
      cur[parts[parts.length - 1]] = value;
    }
    // Also expose flat name entries for backward compat
    for (const [id, value] of paramValues) {
      ctx[id] = value;
      const paramDef = paramMap.get(id);
      if (paramDef) paramNs[paramDef.name] = value;
    }
    ctx['参数'] = paramNs;

    return ctx;
  }

  /**
   * Build flat path -> value map for parameters (e.g. "总投资.建设投资" -> 100)
   */
  private buildParamValueMap(
    parameters: ParameterDefinition[],
    paramValues: Map<string, unknown>
  ): Map<string, unknown> {
    const codeToId = new Map(parameters.map(p => [p.code, p.id]).filter(([c]) => c) as [string, string][]);
    const codeToName = new Map(parameters.map(p => [p.code, p.name]).filter(([c]) => c) as [string, string][]);
    const codeToParentId = new Map(parameters.map(p => [p.code, p.parentId ?? null]).filter(([c]) => c) as [string, string | null][]);
    const result = new Map<string, unknown>();
    for (const p of parameters) {
      if (!p.code) continue;
      const parts: string[] = [];
      let curCode: string | null = p.code;
      while (curCode) {
        parts.unshift(codeToName.get(curCode) ?? curCode);
        // parentId could be cell ID or code; if it's not a code, stop
        const parentId = codeToParentId.get(curCode);
        if (parentId && codeToName.has(parentId)) {
          curCode = parentId;
        } else {
          break;
        }
      }
      const path = parts.join('.');
      result.set(path, paramValues.get(p.id));
    }
    return result;
  }

  /**
   * Build VM context for parameter evaluation.
   * Exposes ctx.参数 namespace with hierarchical paths, bare param ids, and names.
   */
  private buildParamContext(
    evaluatedValues: Map<string, unknown>,
    parameters: ParameterDefinition[]
  ): Record<string, unknown> {
    const ctx: Record<string, unknown> = { t: 0, functions: financialFunctions, 参数: {} };

    // Expose by id
    for (const [id, val] of evaluatedValues) {
      ctx[id] = val;
    }

    // Build 参数 namespace with hierarchical paths
    const paramPathValueMap = this.buildParamValueMap(parameters, evaluatedValues);
    const paramNs: Record<string, unknown> = {};
    for (const [path, value] of paramPathValueMap.entries()) {
      const parts = path.split('.');
      let cur = paramNs;
      for (let i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] === undefined) cur[parts[i]] = {};
        cur = cur[parts[i]] as Record<string, unknown>;
      }
      cur[parts[parts.length - 1]] = value;
    }

    // Also expose flat entries for backward compat
    for (const p of parameters) {
      const val = evaluatedValues.get(p.id);
      if (val !== undefined) {
        paramNs[p.name] = val;
      }
    }
    ctx['参数'] = paramNs;

    return ctx;
  }

  /**
   * Resolve a table+field reference to a cell ID.
   * Used by DAG dependency extraction to map formula references to cell IDs.
   * Mirrors the lookup logic in getCell(): code-first, then name fallback.
   */
  private resolveCellId(
    table: string,
    field: string,
    model: ModelDefinition,
    tableNameToId: Map<string, string>
  ): string | undefined {
    if (table === '参数') return undefined;

    const resolvedTableId = tableNameToId.get(table) ?? table;

    // Phase 1: match by code
    for (const c of model.cells) {
      if (c.tableId === resolvedTableId && c.code === field) {
        return c.id;
      }
    }

    // Phase 2: match by name
    for (const c of model.cells) {
      if (c.tableId === resolvedTableId && c.name === field) {
        return c.id;
      }
    }

    return undefined;
  }

  /**
   * Topological sort of DAG nodes (after self-loops removed).
   * Returns null if a real cycle exists (excluding self-references).
   */
  private topologicalSort(nodes: Map<string, { cellId: string; dependencies: string[]; dependents: string[] }>): string[] | null {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const [id, node] of nodes) {
      inDegree.set(id, node.dependencies.length);
      adjList.set(id, [...node.dependents]);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const ordered: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      ordered.push(id);
      for (const dependent of adjList.get(id) || []) {
        const newDeg = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    if (ordered.length === nodes.size) {
      return ordered;
    }

    return null;
  }

  /**
   * Check if a cell is in scope at a given time index.
   * Returns true if the cell should be visible/accessible at time t.
   */
  private isInScope(
    scope: ModelDefinition['cells'][number]['scope'],
    t: number,
    constructionCols: number
  ): boolean {
    const effectiveScope = scope ?? 'both';
    if (effectiveScope === 'both') return true;
    if (effectiveScope === 'construction') return t < constructionCols;
    if (effectiveScope === 'operation') return t >= constructionCols;
    return true;
  }
}
