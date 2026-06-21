/**
 * 通用节点深度复制引擎
 *
 * 支持参数（ParameterDefinition）和表格指标（CellDefinition）的深度复制，
 * 连同全部子节点一同复制并插入到原块正后方。
 */

export interface Duplicateable {
  id: string;
  parentId?: string | null;
  name?: string;
  formula?: string;
  sortOrder?: number;
}

export interface DuplicateOptions {
  /** 根节点名称后缀（如 '_副本'） */
  rootSuffix: string;

  /** 生成新 ID 的工厂函数 */
  generateId: () => string;
}

/**
 * 深度复制节点块。
 *
 * 复制逻辑：
 * - 深度复制源节点及其全部子节点（递归）。
 * - 新 ID 映射旧 ID → 新 ID。
 * - formula 中 @{oldId} 替换为 @{newId}（仅替换被复制块内的引用）。
 * - 根节点名加后缀，子节点名保持不变。
 * - 同名冲突时后缀自动递增（如 _副本、_副本2）。
 * - 插入位置：原块最后一个节点之后，其他节点整体后移。
 * - sortOrder 从 0 重排，确保 recomputeCodes() 正确。
 *
 * @param nodes   当前完整节点列表
 * @param sourceId 要复制的源节点 ID
 * @param options 复制选项
 * @returns       包含新副本的完整节点列表
 */
export function duplicateNodes<T extends Duplicateable>(
  nodes: T[],
  sourceId: string,
  options: DuplicateOptions
): T[] {
  // 1. 收集源节点 + 全部后代（BFS）
  const sourceBlock: T[] = [];
  const queue: string[] = [sourceId];
  const sourceIdSet = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    sourceIdSet.add(currentId);
    const node = nodes.find((n) => n.id === currentId);
    if (node) {
      sourceBlock.push(node);
      // 查找直接子节点
      for (const n of nodes) {
        if (n.parentId === currentId && !sourceIdSet.has(n.id)) {
          queue.push(n.id);
        }
      }
    }
  }

  if (sourceBlock.length === 0) {
    return nodes;
  }

  const sourceNode = nodes.find((n) => n.id === sourceId)!;

  // 2. 建立旧 ID → 新 ID 映射
  const idMap = new Map<string, string>();
  for (const node of sourceBlock) {
    idMap.set(node.id, options.generateId());
  }

  // 3. 根节点 suffix 避免同 parent 冲突
  const siblingNames = new Set(
    nodes
      .filter((n) => n.parentId === sourceNode.parentId && n.id !== sourceId)
      .map((n) => n.name ?? '')
  );

  let newRootName = (sourceNode.name ?? '') + options.rootSuffix;
  let counter = 2;
  while (siblingNames.has(newRootName)) {
    newRootName = (sourceNode.name ?? '') + options.rootSuffix + counter;
    counter++;
  }

  // 4. 复制每个节点并更新字段
  const newBlock = sourceBlock.map((node) => {
    const isRoot = node.id === sourceId;
    const newId = idMap.get(node.id)!;
    const newParentId = isRoot
      ? node.parentId ?? null
      : idMap.get(node.parentId!);

    // formula: 替换 @{oldId} → @{newId}（仅替换被复制块内的引用）
    let newFormula = node.formula;
    if (newFormula) {
      // 正则替换 @{xxx}，xxx 在 idMap 中才替换
      newFormula = newFormula.replace(
        /@\{([^}]+)\}/g,
        (match, refId) => {
          if (idMap.has(refId)) {
            return `@{${idMap.get(refId)}}`;
          }
          return match; // 保持外部引用不变
        }
      );
    }

    return {
      ...node,
      id: newId,
      parentId: newParentId,
      name: isRoot ? newRootName : node.name,
      formula: newFormula,
      // sortOrder 稍后重排，这里保持原值
    } as T;
  });

  // 5. 找到插入位置：原块最后一个节点之后
  const lastSourceIndex = nodes.findIndex((n) => n.id === sourceBlock[sourceBlock.length - 1].id);
  const insertIndex = lastSourceIndex + 1;

  // 6. 拼接新数组
  const before = nodes.slice(0, insertIndex);
  const after = nodes.slice(insertIndex);
  const result = [...before, ...newBlock, ...after];

  // 7. sortOrder 从 0 递增重排（确保 recomputeCodes() 正确）
  return result.map((n, i) => ({ ...n, sortOrder: i }));
}
