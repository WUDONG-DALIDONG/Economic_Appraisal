import { formulaDisplayToId } from '@economic/core/src/utils/formulaTransforms.js';
import { parse } from '@economic/core/src/formula/parser';
import { financialFunctions } from '@economic/core/src/formula/financialFunctions';
import { ModelDefinition, ComputeMode, ParameterDefinition } from '@economic/core';
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
  paramValues: Array<{ paramId: string; value: unknown }>;
}

/**
 * ComputeService 编排全模型计算。
 *
 * 计算管线：
 *   1. 计算派生参数（参数 DAG 拓扑排序，仅允许参数→参数引用）
 *   2. 对每个公式单元格，解析 → 编译 → 在 VM2 沙箱中运行
 *   3. 按时间索引将结果保存到 results 表
 *
 * VM 上下文暴露：
 *   - ctx.t                : 当前时间索引
 *   - ctx.getCell()        : 表+字段查找（用于 Excel 风格引用）
 *   - ctx.getCellArray()   : 获取单元格的全时间序列值
 *   - ctx.functions        : 财务辅助函数（NPV、IRR 等）
 *   - ctx.<cellId>         : 裸标识符引用的直接值访问
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

    // 清除过期结果以确保干净的计算
    resultRepo.deleteByModel(model.id);

    const cellMap = new Map(model.cells.map(c => [c.id, c]));
    const paramMap = new Map(model.parameters.map(p => [p.id, p]));
    const tableNameToId = new Map(model.tables.map(t => [t.name, t.id]));
    const constructionYears = model.timeline.constructionYears ?? 0;
    const operationYears = Math.max(0, model.timeline.operationYears ?? 0);
    const constructionCols = Math.ceil(constructionYears);
    const maxTime = Math.max(0, constructionCols + operationYears - 1);

    // 兜底：将显示格式的公式引用转换为 @{id} 格式，避免解析错误
    for (const c of model.cells) {
      if (c.formula) {
        try {
          c.formula = formulaDisplayToId(c.formula, model);
        } catch (err: any) {
          errors.push({ cellId: c.id, timeIndex: -1, error: `公式引用转换失败: ${err.message}` });
          console.warn('[ComputeService] formulaDisplayToId failed for cell', c.id, c.name, ':', err.message, '| formula=', c.formula);
          // 既然无法转换该 cell 的公式，直接清空跳过，避免后续 27 次重复报错
          c.formula = '';
        }
      }
    }
    for (const p of model.parameters) {
      if (p.formula) {
        try {
          p.formula = formulaDisplayToId(p.formula, model);
        } catch (err: any) {
          errors.push({ cellId: p.id, timeIndex: -1, error: `参数公式引用转换失败: ${err.message}` });
          console.warn('[ComputeService] formulaDisplayToId failed for param', p.id, p.name, ':', err.message, '| formula=', p.formula);
          p.formula = '';
        }
      }
    }

    // 步骤 1：计算派生参数（仅 param -> param）
    const paramValues = this.evaluateDerivedParameters(model.parameters);

    // 内存结果缓存：替代 DB 查询
    const memResults = new Map<string, Map<number, number | null>>();
    // parse + compile 缓存：每个 cell 的 formula 只编译一次
    const formulaCache = new Map<string, string>();

    // 步骤 2：构建单元格 DAG 并拓扑排序
    const dag = buildDAG(
      model.cells,
      (table, field) => {
        if (table === '@') return field;
        return this.resolveCellId(table, field, model, tableNameToId);
      },
      collectDependencies
    );

    // 移除自引用（如 [t-1] 累积公式）以避免假循环
    for (const [id, node] of dag.nodes) {
      node.dependencies = node.dependencies.filter(depId => depId !== id);
      node.dependents = node.dependents.filter(depId => depId !== id);
    }

    // 移除自环后进行拓扑排序
    const orderedCellIds = this.topologicalSort(dag.nodes);

    if (orderedCellIds !== null) {
      // 无循环 — 正常计算路径
      this.computeCellsInOrder(orderedCellIds, cellMap, paramValues, paramMap, resultRepo, model, tableNameToId, constructionCols, maxTime, errors, results, memResults, formulaCache);
    } else {
      // 检测到循环 — 迭代收敛路径
      const nonCycleIds = this.getNonCycleIds(dag.nodes);
      const cycleIds = this.getCycleIds(dag.nodes);

      // 步骤 3a：先按拓扑顺序计算非循环单元格
      if (nonCycleIds.length > 0) {
        const nonCycleOrdered = this.topologicalSortFiltered(dag.nodes, new Set(nonCycleIds));
        if (nonCycleOrdered) {
          this.computeCellsInOrder(nonCycleOrdered, cellMap, paramValues, paramMap, resultRepo, model, tableNameToId, constructionCols, maxTime, errors, results, memResults, formulaCache);
        }
      }

      // 步骤 3b：循环单元格的迭代计算
      this.computeCycleIteratively(
        cycleIds, dag.nodes, cellMap, paramValues, paramMap, resultRepo,
        model, tableNameToId, constructionCols, maxTime, errors, results, memResults, formulaCache
      );
    }

    // 将内存中的所有结果批量写入数据库
    const batchEntries: Array<{ cellId: string; timeIndex: number; value: number | null }> = [];
    for (const { cellId, timeIndex, value } of results) {
      batchEntries.push({ cellId, timeIndex, value });
    }
    if (batchEntries.length > 0) {
      resultRepo.saveAllBatch(model.id, batchEntries);
    }

    return {
      cellCount: model.cells.filter(c => c.computeMode === ComputeMode.Formula && c.formula.trim()).length,
      maxTimeIndex: maxTime,
      durationMs: Date.now() - start,
      errors,
      results,
      paramValues: Array.from(paramValues.entries()).map(([paramId, value]) => ({ paramId, value })),
    };
  }

  /**
   * 按给定顺序（拓扑序）计算单元格 ID 列表。
   * 正常路径和迭代路径共用。
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
    results: ComputeResult['results'],
    memResults: Map<string, Map<number, number | null>>,
    formulaCache: Map<string, string>
  ): void {
    const timeRange = Array.from({ length: maxTime + 1 }, (_, i) => i);

    for (const cellId of orderedCellIds) {
      const cell = cellMap.get(cellId);
      if (!cell || cell.computeMode !== ComputeMode.Formula || !cell.formula.trim()) continue;

      for (const t of timeRange) {
        if (!this.isInScope(cell.scope, t, constructionCols)) {
          if (!memResults.has(cell.id)) memResults.set(cell.id, new Map());
          memResults.get(cell.id)!.set(t, 0);
          results.push({ cellId: cell.id, timeIndex: t, value: 0 });
          continue;
        }

        try {
          let jsCode = formulaCache.get(cell.formula);
          if (!jsCode) {
            const ast = parse(cell.formula);
            jsCode = this.compiler.compile(ast);
            formulaCache.set(cell.formula, jsCode);
          }
          const ctx = this.buildContext(
            t, cellMap, paramValues, paramMap, memResults, model.id, tableNameToId, constructionCols, model.parameters, maxTime
          );
          const result = this.vm.executeShared(jsCode, { ctx });
          if (result === '#REF!') {
            errors.push({ cellId: cell.id, timeIndex: t, error: '#REF! - 引用了已删除的指标' });
            if (!memResults.has(cell.id)) memResults.set(cell.id, new Map());
            memResults.get(cell.id)!.set(t, null);
            results.push({ cellId: cell.id, timeIndex: t, value: null });
          } else {
            const numericResult = typeof result === 'number' ? result : null;
            if (!memResults.has(cell.id)) memResults.set(cell.id, new Map());
            memResults.get(cell.id)!.set(t, numericResult);
            results.push({ cellId: cell.id, timeIndex: t, value: numericResult });
          }
        } catch (e: any) {
          errors.push({ cellId: cell.id, timeIndex: t, error: e.message });
          if (!memResults.has(cell.id)) memResults.set(cell.id, new Map());
          memResults.get(cell.id)!.set(t, null);
          results.push({ cellId: cell.id, timeIndex: t, value: null });
        }
      }
    }
  }

  /**
   * 依赖循环中单元格的迭代计算。
   * 
   * 算法：
   * 1. 用初始值（defaultValue 或 0）初始化循环单元格
   * 2. 按依赖顺序重复计算循环单元格
   * 3. 每轮完整遍历后，检查结果是否已收敛
   * 4. 当最大差值 < 阈值，或达到最大迭代次数时停止
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
    results: ComputeResult['results'],
    memResults: Map<string, Map<number, number | null>>,
    formulaCache: Map<string, string>
  ): void {
    const timeRange = Array.from({ length: maxTime + 1 }, (_, i) => i);
    const cycleSet = new Set(cycleIds);

    // 确定循环内的计算顺序：按依赖深度排序（循环内依赖更少的单元格优先）
    const cycleOrdered = this.sortCycleCells(cycleIds, dagNodes, cycleSet);

    // 用初始值初始化循环单元格
    for (const cellId of cycleIds) {
      const cell = cellMap.get(cellId);
      if (!cell) continue;

      for (const t of timeRange) {
        if (!this.isInScope(cell.scope, t, constructionCols)) {
          if (!memResults.has(cell.id)) memResults.set(cell.id, new Map());
          memResults.get(cell.id)!.set(t, 0);
          continue;
        }

        // 使用 defaultValue 作为种子值，若无则用 0
        const dv = cell.defaultValue ?? 0;
        let seedValue = 0;
        if (Array.isArray(dv) && t < dv.length) {
          seedValue = dv[t] ?? 0;
        } else if (typeof dv === 'number') {
          seedValue = dv;
        }

        if (!memResults.has(cell.id)) memResults.set(cell.id, new Map());
        memResults.get(cell.id)!.set(t, seedValue);
      }
    }

    // 迭代收敛循环
    let iteration = 0;
    let converged = false;

    while (iteration < ComputeService.MAX_ITERATIONS && !converged) {
      iteration++;
      converged = true;

      for (const cellId of cycleOrdered) {
        const cell = cellMap.get(cellId);
        if (!cell || cell.computeMode !== ComputeMode.Formula || !cell.formula.trim()) continue;

        for (const t of timeRange) {
          if (!this.isInScope(cell.scope, t, constructionCols)) continue;

          try {
            let jsCode = formulaCache.get(cell.formula);
            if (!jsCode) {
              const ast = parse(cell.formula);
              jsCode = this.compiler.compile(ast);
              formulaCache.set(cell.formula, jsCode);
            }
            const ctx = this.buildContext(
              t, cellMap, paramValues, paramMap, memResults, model.id, tableNameToId, constructionCols, model.parameters, maxTime
            );
            const result = this.vm.executeShared(jsCode, { ctx });

            if (result === '#REF!') {
              errors.push({ cellId: cell.id, timeIndex: t, error: '#REF! - 引用了已删除的指标' });
              if (!memResults.has(cell.id)) memResults.set(cell.id, new Map());
              memResults.get(cell.id)!.set(t, null);
              continue;
            }

            const numericResult = typeof result === 'number' ? result : null;

            // 检查收敛性：与前一次值比较
            const cellResults = memResults.get(cell.id);
            const prevValue = cellResults?.get(t) ?? 0;
            const newValue = numericResult ?? 0;

            if (Math.abs(newValue - prevValue) > ComputeService.CONVERGENCE_THRESHOLD) {
              converged = false;
            }

            if (!memResults.has(cell.id)) memResults.set(cell.id, new Map());
            memResults.get(cell.id)!.set(t, numericResult);
          } catch (e: any) {
            errors.push({ cellId: cell.id, timeIndex: t, error: e.message });
            if (!memResults.has(cell.id)) memResults.set(cell.id, new Map());
            memResults.get(cell.id)!.set(t, null);
          }
        }
      }
    }

    // 收集循环单元格的最终结果
    for (const cellId of cycleIds) {
      const cell = cellMap.get(cellId);
      if (!cell || cell.computeMode !== ComputeMode.Formula || !cell.formula.trim()) continue;

      for (const t of timeRange) {
        const cellResults = memResults.get(cell.id);
        const found = cellResults?.get(t);
        results.push({ cellId: cell.id, timeIndex: t, value: found !== undefined ? found : null });
      }
    }

    // 若未完全收敛则添加收敛警告
    if (!converged) {
      errors.push({
        cellId: cycleIds[0],
        timeIndex: 0,
        error: `循环依赖迭代未收敛（${iteration}次迭代），结果可能不精确`
      });
    }
  }

  /**
   * 获取不属于任何依赖循环的单元格 ID。
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
   * 获取属于依赖循环的单元格 ID。
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
   * 对节点子集进行拓扑排序（按 allowedIds 过滤）。
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
   * 将循环单元格排序为合理的计算顺序。
   * 循环内依赖更少的单元格排在前面。
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
   * 计算派生参数。
   *
   * 没有 `formula` 的参数直接使用其 `defaultValue`。
   * 有 `formula` 的参数按拓扑顺序计算，
   * 仅引用其他参数值（ctx.参数 或裸标识符）。
   */
  private evaluateDerivedParameters(parameters: ParameterDefinition[]): Map<string, unknown> {
    const values = new Map<string, unknown>();
    const paramMap = new Map(parameters.map(p => [p.id, p]));

    // 简单的参数 DAG 拓扑排序
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
      // 更新被依赖者的入度计数
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
          console.warn(`[ComputeService] 参数公式计算失败: param=${param.id}, formula=${param.formula}, error=${e.message}`);
          values.set(id, param.defaultValue);
        }
      }

      // 减少依赖者的入度
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

    // 兜底：任何拓扑上不可达的参数使用其默认值
    for (const p of parameters) {
      if (!values.has(p.id)) {
        values.set(p.id, p.defaultValue);
      }
    }

    return values;
  }

  /**
   * 从公式中提取参数依赖。
   * 支持：
   *   - ctx.全局参数.名称 引用
   *   - ctx.全局参数.父.子 引用（按显示路径或编码路径）
   *   - 裸参数 ID/名称引用
   * 仅返回其他参数的 ID。
   */
  private extractParamDepsFromFormula(
    formula: string,
    parameters: ParameterDefinition[]
  ): string[] {
    const paramIdSet = new Set(parameters.map(p => p.id));
    const paramNameToId = new Map(parameters.map(p => [p.name, p.id]));
    // 构建编码 -> ID 查找表，用于层级编码引用
    const codeToId = new Map(parameters.map(p => [p.code, p.id]).filter(([c]) => c) as [string, string][]);
    // 构建编码 -> 完整路径映射，用于按路径引用参数
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
            } else if (node.table === '全局参数') {
              const parts = (node.field as string).split('.');
              // 优先尝试完整路径匹配
              const path = '全局参数.' + node.field;
              const byPath = pathToId.get(path);
              if (byPath) {
                deps.add(byPath);
                break;
              }
              // 尝试叶子编码匹配
              const leafCode = parts[parts.length - 1];
              const byCode = codeToId.get(leafCode);
              if (byCode) {
                deps.add(byCode);
                break;
              }
              // 尝试叶子名称匹配
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
      // 解析失败 → 无依赖
    }
    return Array.from(deps);
  }

  /**
   * 构建参数编码 -> 完整显示路径的映射。
   * 例如编码 "1.2" → "全局参数.总投资.建设投资"
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
        // 如果 parentId 是单元格 ID 而非编码，停止
        if (curCode && !codeToName.has(curCode)) break;
      }
      result.set(p.code, '全局参数.' + parts.join('.'));
    }
    return result;
  }

  private buildContext(
    t: number,
    cellMap: Map<string, ModelDefinition['cells'][number]>,
    paramValues: Map<string, unknown>,
    paramMap: Map<string, ParameterDefinition>,
    memResults: Map<string, Map<number, number | null>>,
    modelId: string,
    tableNameToId: Map<string, string>,
    constructionCols: number,
    parameters: ParameterDefinition[],
    maxTime: number
  ) {
    const ctx: any = {
      t,
      functions: financialFunctions,
      全局参数: {},
    };

    const codeToId = new Map(parameters.map(p => [p.code, p.id]).filter(([c]) => c) as [string, string][]);

    ctx.getById = (id: string, timeIdx?: number) => {
      const idx = timeIdx ?? t;

      // 检查是否为参数
      if (paramMap.has(id)) {
        const val = paramValues.get(id);
        return val !== undefined ? val : 0;
      }

      // 检查是否为单元格
      const cell = cellMap.get(id);
      if (!cell) return '#REF!';

      if (!this.isInScope(cell.scope, idx, constructionCols)) return 0;

      const cellResults = memResults.get(id);
      if (cellResults) {
        if (cellResults.has(idx)) return cellResults.get(idx);
      }
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

      const cellResults = memResults.get(id);
      if (!cellResults) return [];
      const arr: number[] = [];
      for (let ti = 0; ti <= maxTime; ti++) {
        if (!this.isInScope(cell.scope, ti, constructionCols)) continue;
        if (cellResults.has(ti)) {
          const v = cellResults.get(ti);
          if (v !== null) arr.push(v);
        }
      }
      return arr;
    };

    ctx.getCell = (tableRef: string, field: string, timeIdx?: number) => {
      if (tableRef === '全局参数') {
        // 参数的层级路径解析
        const parts = field.split('.');
        // 反向尝试完整路径匹配
        let resolvedId: string | undefined;
        for (let i = parts.length; i >= 1; i--) {
          const pathCode = parts.slice(parts.length - i).join('.');
          resolvedId = codeToId.get(pathCode);
          if (resolvedId) break;
        }
        // 兜底：按名称匹配
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
        // 通过 ctx.全局参数 名称映射的旧版兜底
        return ctx.全局参数[field] ?? 0;
      }
      // 解析表名 -> 表 ID
      const resolvedTableId = tableNameToId.get(tableRef) ?? tableRef;
      const idx = timeIdx ?? t;

      // 阶段 1：按稳定编码匹配（首选）
      for (const [, cell] of cellMap) {
        if (cell.tableId === resolvedTableId && cell.code === field) {
          if (!this.isInScope(cell.scope, idx, constructionCols)) return 0;
          const cellResults = memResults.get(cell.id);
          if (cellResults && cellResults.has(idx)) return cellResults.get(idx);
          const dv = cell.defaultValue ?? 0;
          if (Array.isArray(dv) && idx >= 0 && idx < dv.length) return dv[idx];
          if (Array.isArray(dv)) return 0;
          return dv;
        }
      }

      // 阶段 2：按名称兜底匹配（旧版兼容）
      for (const [, cell] of cellMap) {
        if (cell.tableId === resolvedTableId && cell.name === field) {
          if (!this.isInScope(cell.scope, idx, constructionCols)) return 0;
          const cellResults = memResults.get(cell.id);
          if (cellResults && cellResults.has(idx)) return cellResults.get(idx);
          const dv = cell.defaultValue ?? 0;
          if (Array.isArray(dv) && idx >= 0 && idx < dv.length) return dv[idx];
          if (Array.isArray(dv)) return 0;
          return dv;
        }
      }
      return 0;
    };

    ctx.getCellArray = (tableRef: string, field: string) => {
      if (tableRef === '全局参数') {
        // 参数的层级路径解析
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
        const v = ctx.全局参数[field];
        return v !== undefined ? [v] : [];
      }
      const resolvedTableId = tableNameToId.get(tableRef) ?? tableRef;

      // 阶段 1：按稳定编码匹配
      for (const [, cell] of cellMap) {
        if (cell.tableId === resolvedTableId && cell.code === field) {
          const cellResults = memResults.get(cell.id);
          if (!cellResults) return [];
          const arr: number[] = [];
          for (let ti = 0; ti <= maxTime; ti++) {
            if (!this.isInScope(cell.scope, ti, constructionCols)) continue;
            if (cellResults.has(ti)) {
              const v = cellResults.get(ti);
              if (v !== null) arr.push(v);
            }
          }
          return arr;
        }
      }
      // 阶段 2：按名称兜底匹配
      for (const [, cell] of cellMap) {
        if (cell.tableId === resolvedTableId && cell.name === field) {
          const cellResults = memResults.get(cell.id);
          if (!cellResults) return [];
          const arr: number[] = [];
          for (let ti = 0; ti <= maxTime; ti++) {
            if (!this.isInScope(cell.scope, ti, constructionCols)) continue;
            if (cellResults.has(ti)) {
              const v = cellResults.get(ti);
              if (v !== null) arr.push(v);
            }
          }
          return arr;
        }
      }
      return [];
    };

    // 直接单元格 ID 引用（向后兼容）
    for (const [id, cell] of cellMap) {
      if (!this.isInScope(cell.scope, t, constructionCols)) {
        ctx[id] = 0;
        continue;
      }
      const cellResults = memResults.get(id);
      if (cellResults && cellResults.has(t)) {
        ctx[id] = cellResults.get(t);
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

    // 参数值：按 ID、名称和层级路径暴露
    const paramNs: Record<string, unknown> = {};
    const paramPathValueMap = this.buildParamValueMap(parameters, paramValues);
    for (const [path, value] of paramPathValueMap.entries()) {
      // 设置嵌套对象结构：全局参数.总投资.建设投资
      const parts = path.split('.');
      let cur = paramNs;
      for (let i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] === undefined) cur[parts[i]] = {};
        cur = cur[parts[i]] as Record<string, unknown>;
      }
      cur[parts[parts.length - 1]] = value;
    }
    // 同时暴露扁平名称条目以保持向后兼容
    for (const [id, value] of paramValues) {
      ctx[id] = value;
      const paramDef = paramMap.get(id);
      if (paramDef) paramNs[paramDef.name] = value;
    }
    ctx['全局参数'] = paramNs;

    return ctx;
  }

  /**
   * 构建参数的扁平路径 -> 值映射（例如 "总投资.建设投资" -> 100）
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
        // parentId 可能是单元格 ID 或编码；如果不是编码则停止
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
   * 构建参数计算的 VM 上下文。
   * 暴露 ctx.全局参数 命名空间（含层级路径）、裸参数 ID 和名称。
   */
  private buildParamContext(
    evaluatedValues: Map<string, unknown>,
    parameters: ParameterDefinition[]
  ): Record<string, unknown> {
    const ctx: Record<string, unknown> = { t: 0, functions: financialFunctions, 全局参数: {} };

    ctx.getById = (id: string, _timeIdx?: number) => {
      if (evaluatedValues.has(id)) return evaluatedValues.get(id);
      return 0;
    };

    const paramNameToId = new Map(parameters.map(p => [p.name, p.id]));
    const codeToId = new Map(parameters.map(p => [p.code, p.id]).filter(([c]) => c) as [string, string][]);
    ctx.getCell = (tableRef: string, field: string, _timeIdx?: number) => {
      if (tableRef === '全局参数') {
        const byName = paramNameToId.get(field);
        if (byName && evaluatedValues.has(byName)) return evaluatedValues.get(byName);
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
        if (resolvedId && evaluatedValues.has(resolvedId)) return evaluatedValues.get(resolvedId);
        return (ctx as any)['全局参数']?.[field] ?? 0;
      }
      return 0;
    };

    ctx.getCellArrayById = (id: string) => {
      if (evaluatedValues.has(id)) {
        const v = evaluatedValues.get(id);
        return v !== undefined ? [v] : [];
      }
      return [];
    };

    ctx.getCellArray = (tableRef: string, field: string) => {
      const val = (ctx.getCell as any)(tableRef, field);
      return val !== undefined ? [val] : [];
    };

    for (const [id, val] of evaluatedValues) {
      ctx[id] = val;
    }

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

    for (const p of parameters) {
      const val = evaluatedValues.get(p.id);
      if (val !== undefined) {
        paramNs[p.name] = val;
      }
    }
    ctx['全局参数'] = paramNs;

    return ctx;
  }

  /**
   * 将表+字段引用解析为单元格 ID。
   * DAG 依赖提取时用于将公式引用映射到单元格 ID。
   * 与 getCell() 的查找逻辑一致：编码优先，名称兜底。
   */
  private resolveCellId(
    table: string,
    field: string,
    model: ModelDefinition,
    tableNameToId: Map<string, string>
  ): string | undefined {
    if (table === '全局参数') return undefined;

    const resolvedTableId = tableNameToId.get(table) ?? table;

    // 阶段 1：按编码匹配
    for (const c of model.cells) {
      if (c.tableId === resolvedTableId && c.code === field) {
        return c.id;
      }
    }

    // 阶段 2：按名称匹配
    for (const c of model.cells) {
      if (c.tableId === resolvedTableId && c.name === field) {
        return c.id;
      }
    }

    return undefined;
  }

  /**
   * DAG 节点的拓扑排序（移除自环后）。
   * 若存在真正的循环（不含自引用）则返回 null。
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
   * 检查单元格在给定时间索引是否在作用域内。
   * 若单元格在时间 t 应可见/可访问则返回 true。
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
