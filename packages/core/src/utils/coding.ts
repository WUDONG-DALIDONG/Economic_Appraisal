/**
 * Hierarchical indicator code system.
 *
 * Principle:
 * - Cell codes are dot-separated integers (x.y.z)
 * - Top-level cells: 1, 2, 3...
 * - First child of 1: 1.1, 1.2, 1.3...
 * - Child of 1.2: 1.2.1, 1.2.2...
 *
 * Codes are dynamic: after any structural change (add/remove/indent/outdent),
 * recomputeCodes() rebuilds all codes from scratch based on parentId relationships
 * and sortOrder.
 */

export interface CodingInput {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

/**
 * Recompute all hierarchical codes for a flat list of cells.
 *
 * Algorithm:
 * 1. Group cells by parentId
 * 2. Sort each group by sortOrder
 * 3. Assign top-level codes to root cells (parentId == null): 1, 2, 3...
 * 4. Recursively assign child codes: parentCode + '.' + childIndex
 *
 * Returns a map of cellId -> newCode
 */
export function recomputeCodes<T extends CodingInput>(cells: T[]): Map<string, string> {
  // Collect all valid cell IDs for orphan detection
  const validIds = new Set(cells.map(c => c.id));

  // Build parent -> children map (normalize orphan parentIds to null)
  const parentToChildren = new Map<string | null, T[]>();
  for (const cell of cells) {
    const parentId = cell.parentId && validIds.has(cell.parentId) ? cell.parentId : null;
    if (!parentToChildren.has(parentId)) {
      parentToChildren.set(parentId, []);
    }
    parentToChildren.get(parentId)!.push(cell);
  }

  // Sort each group's children by sortOrder (stable: equal sortOrder keeps original order)
  for (const [, children] of parentToChildren) {
    children.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
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
 * Get the depth level of a code (number of dot-separated segments).
 * e.g., "1" -> 1, "1.2" -> 2, "1.2.3" -> 3
 */
export function getCodeDepth(code: string): number {
  return code.split('.').length;
}

/**
 * Generate a parent summary formula from child codes.
 *
 * For a parent cell with children, generates SUM() of all child cells:
 *   children with codes [1.1, 1.2, 1.3] -> "SUM(1.1, 1.2, 1.3)"
 *
 * This is an initial proposal; user can edit afterwards.
 */
export function generateSummaryFormula(childCodes: string[]): string {
  if (childCodes.length === 0) return '';
  return 'SUM(' + childCodes.join(', ') + ')';
}

/**
 * Build parent-child relationships from a flat sorted list.
 *
 * Given a list of cells in display order, indent (increase depth) or
 * outdent (decrease depth) a cell by adjusting its parentId.
 *
 * @param cells  flat list in display order, each with { id, parentId, sortOrder }
 * @param targetId  id of the cell to re-parent
 * @param delta     +1 = indent (become child of previous sibling), -1 = outdent
 * @returns         new list with updated parentId(s)
 */
export function adjustIndentation<T extends CodingInput>(
  cells: T[],
  targetId: string,
  delta: number
): T[] {
  // Create a working copy
  const copy = cells.map((c, idx) => ({ ...c, _index: idx })) as Array<
    T & { _index: number }
  >;

  const targetIndex = copy.findIndex((c) => c.id === targetId);
  if (targetIndex < 0) return cells;

  const target = copy[targetIndex];

  if (delta > 0) {
    // Indent: become child of the previous sibling at the same depth
    // Find previous cell that is at same depth or shallower
    for (let i = targetIndex - 1; i >= 0; i--) {
      const candidate = copy[i];
      if (
        candidate.parentId === target.parentId ||
        (target.parentId !== null && candidate.id === target.parentId)
      ) {
        // Previous sibling or parent: target becomes child of candidate
        target.parentId = candidate.id;
        break;
      }
      if (candidate.parentId === null && target.parentId === null) {
        target.parentId = candidate.id;
        break;
      }
    }
  } else if (delta < 0) {
    // Outdent: move up one level
    if (target.parentId !== null) {
      // Find the parent cell
      const parent = copy.find((c) => c.id === target.parentId);
      if (parent) {
        target.parentId = parent.parentId;
      } else {
        target.parentId = null;
      }
    }
  }

  // Recalculate sortOrder based on new display order (parent depth-first)
  return recalcSortOrder(copy.map(({ _index, ...rest }) => rest as T));
}

/**
 * Recalculate sortOrder so cells are ordered depth-first with correct parent grouping.
 *
 * After structural changes (indent/outdent), sortOrder must reflect the new
 * display order for recomputeCodes() to work correctly.
 */
function recalcSortOrder<T extends CodingInput>(cells: T[]): T[] {
  // Build parent -> children
  const parentToChildren = new Map<string | null, T[]>();
  for (const cell of cells) {
    const parentId = cell.parentId ?? null;
    if (!parentToChildren.has(parentId)) {
      parentToChildren.set(parentId, []);
    }
    parentToChildren.get(parentId)!.push(cell);
  }

  // Sort each group by existing sortOrder to preserve relative order within group
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
