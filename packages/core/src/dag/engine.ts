import { CellDefinition } from '../types';

export interface DAGNode {
  cellId: string;
  dependencies: string[];
  dependents: string[];
}

export interface ResolveContext {
  resolveCellId(table: string, field: string): string | undefined;
}

export interface DAG {
  nodes: Map<string, DAGNode>;
  ordered: string[];
  hasCycle: boolean;
  cyclePath?: string[];
}

export function buildDAG(
  cells: CellDefinition[],
  resolveCellId: (table: string, field: string) => string | undefined,
  dependencyCollector: (formula: string, resolve: ResolveContext) => string[]
): DAG {
  const nodes = new Map<string, DAGNode>();

  for (const cell of cells) {
    nodes.set(cell.id, {
      cellId: cell.id,
      dependencies: [],
      dependents: [],
    });
  }

  const ctx: ResolveContext = { resolveCellId };
  
  for (const cell of cells) {
    const node = nodes.get(cell.id)!;
    if (cell.type === 'Formula' || cell.type === 'Script') {
      const deps = dependencyCollector(cell.formula, ctx);
      for (const depId of deps) {
        if (nodes.has(depId)) {
          node.dependencies.push(depId);
          nodes.get(depId)!.dependents.push(cell.id);
        }
      }
    }
  }

  const { ordered, hasCycle, cyclePath } = topologicalSort(nodes);
  return { nodes, ordered, hasCycle, cyclePath };
}

function topologicalSort(nodes: Map<string, DAGNode>): {
  ordered: string[]; hasCycle: boolean; cyclePath?: string[];
} {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const [id, node] of nodes) {
    inDegree.set(id, node.dependencies.length);
    adjList.set(id, node.dependents);
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
    return { ordered, hasCycle: false };
  }

  const cycleNodes = new Set<string>();
  for (const [id, deg] of inDegree) {
    if (deg > 0) cycleNodes.add(id);
  }

  const cyclePath = findCyclePath(nodes, cycleNodes);
  return { ordered, hasCycle: true, cyclePath };
}

function findCyclePath(nodes: Map<string, DAGNode>, cycleNodes: Set<string>): string[] {
  for (const start of cycleNodes) {
    const path = [start];
    const visited = new Set<string>();
    visited.add(start);
    let current = start;

    while (true) {
      const node = nodes.get(current)!;
      const next = node.dependencies.find(dep => cycleNodes.has(dep) && !visited.has(dep));
      if (!next) {
        const closing = node.dependencies.find(dep => dep === start);
        if (closing) {
          path.push(start);
          return path;
        }
        break;
      }
      path.push(next);
      visited.add(next);
      current = next;
    }
  }
  return Array.from(cycleNodes);
}

export function getDependencies(dag: DAG, cellId: string): string[] {
  return dag.nodes.get(cellId)?.dependencies || [];
}

export function getDependents(dag: DAG, cellId: string): string[] {
  return dag.nodes.get(cellId)?.dependents || [];
}

export function getTransitiveDependents(dag: DAG, cellId: string): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const queue = [cellId];
  visited.add(cellId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = dag.nodes.get(current);
    if (!node) continue;

    for (const dep of node.dependents) {
      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
        if (dep !== cellId) result.push(dep);
      }
    }
  }

  return result.sort((a, b) => dag.ordered.indexOf(a) - dag.ordered.indexOf(b));
}
