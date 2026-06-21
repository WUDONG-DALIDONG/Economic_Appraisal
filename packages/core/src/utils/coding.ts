/**
 * 层级指标编码体系。
 *
 * 原则：
 * - 单元格编码为点分隔整数（x.y.z）
 * - 顶层单元格：1, 2, 3...
 * - 1 的第一个子级：1.1, 1.2, 1.3...
 * - 1.2 的子级：1.2.1, 1.2.2...
 *
 * 编码是动态的：任何结构变更（添加/删除/缩进/反缩进）后，
 * recomputeCodes() 会根据 parentId 关系和 sortOrder 从头重建所有编码。
 */

export interface CodingInput {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

/**
 * 重新计算扁平单元格列表的所有层级编码。
 *
 * 算法：
 * 1. 按 parentId 分组
 * 2. 每组按 sortOrder 排序
 * 3. 为根单元格（parentId == null）分配顶层编码：1, 2, 3...
 * 4. 递归分配子级编码：parentCode + '.' + childIndex
 *
 * @returns 单元格 ID -> 新编码的映射
 */
export function recomputeCodes<T extends CodingInput>(cells: T[]): Map<string, string> {
  const validIds = new Set(cells.map(c => c.id));
  const indexMap = new Map(cells.map((c, i) => [c.id, i]));

  const parentToChildren = new Map<string | null, T[]>();
  for (const cell of cells) {
    const parentId = cell.parentId && validIds.has(cell.parentId) ? cell.parentId : null;
    if (!parentToChildren.has(parentId)) {
      parentToChildren.set(parentId, []);
    }
    parentToChildren.get(parentId)!.push(cell);
  }

  for (const [, children] of parentToChildren) {
    children.sort((a, b) => {
      const soDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (soDiff !== 0) return soDiff;
      return (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0);
    });
  }

  const result = new Map<string, string>();

  function assignCodes(parentId: string | null, prefix: string) {
    const children = parentToChildren.get(parentId) ?? [];
    for (let i = 0; i < children.length; i++) {
      const code = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      result.set(children[i].id, code);
      assignCodes(children[i].id, code);
    }
  }

  assignCodes(null, '');
  return result;
}

/**
 * 获取编码的深度层级（点分隔段数）。
 * 例如，"1" -> 1, "1.2" -> 2, "1.2.3" -> 3
 */
export function getCodeDepth(code: string): number {
  return code.split('.').length;
}

/**
 * 从子级编码生成父级汇总公式。
 *
 * 对于有子级的父单元格，生成所有子单元格的 SUM()：
 *   编码为 [1.1, 1.2, 1.3] 的子级 -> "SUM(1.1, 1.2, 1.3)"
 *
 * 这是初始建议，用户可随后编辑。
 */
export function generateSummaryFormula(childCodes: string[]): string {
  if (childCodes.length === 0) return '';
  return 'SUM(' + childCodes.join(', ') + ')';
}

/**
 * 从扁平排序列表构建父子关系。
 *
 * 给定按显示顺序排列的单元格列表，通过调整 parentId 来缩进（增加深度）或
 * 反缩进（减少深度）某个单元格。
 *
 * @param cells   按显示顺序的扁平列表，每项包含 { id, parentId, sortOrder }
 * @param targetId 要重新设置父级的单元格 ID
 * @param delta      +1 = 缩进（成为前一个兄弟的子级），-1 = 反缩进
 * @returns          更新了 parentId 的新列表
 */
export function adjustIndentation<T extends CodingInput>(
  cells: T[],
  targetId: string,
  delta: number
): T[] {
  // 创建工作副本
  const copy = cells.map((c, idx) => ({ ...c, _index: idx })) as Array<
    T & { _index: number }
  >;

  const targetIndex = copy.findIndex((c) => c.id === targetId);
  if (targetIndex < 0) return cells;

  const target = copy[targetIndex];

  if (delta > 0) {
    // 缩进：成为同深度前一个兄弟的子级
    // 查找前面同深度或更浅的单元格
    for (let i = targetIndex - 1; i >= 0; i--) {
      const candidate = copy[i];
      if (
        candidate.parentId === target.parentId ||
        (target.parentId !== null && candidate.id === target.parentId)
      ) {
        // 前一个兄弟或父级：目标成为候选的子级
        target.parentId = candidate.id;
        break;
      }
      if (candidate.parentId === null && target.parentId === null) {
        target.parentId = candidate.id;
        break;
      }
    }
  } else if (delta < 0) {
    // 反缩进：上移一级
    if (target.parentId !== null) {
      // 查找父级单元格
      const parent = copy.find((c) => c.id === target.parentId);
      if (parent) {
        target.parentId = parent.parentId;
      } else {
        target.parentId = null;
      }
    }
  }

  // 基于新的显示顺序（父级深度优先）重新计算 sortOrder
  return recalcSortOrder(copy.map(({ _index, ...rest }) => rest as T));
}

/**
 * 重新计算 sortOrder，使单元格按深度优先顺序排列且父级分组正确。
 *
 * 结构变更（缩进/反缩进）后，sortOrder 必须反映新的显示顺序，
 * recomputeCodes() 才能正确工作。
 */
function recalcSortOrder<T extends CodingInput>(cells: T[]): T[] {
  // 构建父级 -> 子级映射
  const parentToChildren = new Map<string | null, T[]>();
  for (const cell of cells) {
    const parentId = cell.parentId ?? null;
    if (!parentToChildren.has(parentId)) {
      parentToChildren.set(parentId, []);
    }
    parentToChildren.get(parentId)!.push(cell);
  }

  // 每组按现有 sortOrder 排序，保持组内相对顺序
  for (const [, children] of parentToChildren) {
    children.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  const result: T[] = [];
  let order = 0;

  function walk(parentId: string | null) {
    const children = parentToChildren.get(parentId) ?? [];
    for (const child of children) {
      result.push({ ...child, sortOrder: order++ });
      walk(child.id);
    }
  }

  walk(null);
  return result;
}
