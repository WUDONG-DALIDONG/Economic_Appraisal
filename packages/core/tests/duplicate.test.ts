import { describe, expect, it } from 'vitest';
import { duplicateNodes } from '../src/utils/duplicate.js';

describe('duplicateNodes', () => {
  const genId = (counter: { n: number }) => () => `new-${counter.n++}`;

  it('复制单个节点（无子节点）', () => {
    const items = [
      { id: 'a', name: 'A', parentId: null as string | null, sortOrder: 0, formula: '' },
      { id: 'b', name: 'B', parentId: null, sortOrder: 1, formula: '' },
    ];
    const counter = { n: 1 };
    const result = duplicateNodes(items, 'a', { rootSuffix: '_副本', generateId: genId(counter) });

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('new-1');
    expect(result[1].name).toBe('A_副本');
    expect(result[1].parentId).toBeNull();
    expect(result[2].id).toBe('b');
    expect(result[2].sortOrder).toBe(2);
  });

  it('复制带单个子节点的父节点', () => {
    const items = [
      { id: 'p1', name: 'Parent', parentId: null as string | null, sortOrder: 0, formula: '' },
      { id: 'c1', name: 'Child', parentId: 'p1', sortOrder: 1, formula: '' },
    ];
    const counter = { n: 1 };
    const result = duplicateNodes(items, 'p1', { rootSuffix: '_副本', generateId: genId(counter) });

    expect(result).toHaveLength(4);
    expect(result[0].id).toBe('p1');
    expect(result[1].id).toBe('c1');
    expect(result[2].id).toBe('new-1');
    expect(result[2].name).toBe('Parent_副本');
    expect(result[3].id).toBe('new-2');
    expect(result[3].name).toBe('Child'); // 子节点名不变
    expect(result[3].parentId).toBe('new-1'); // parentId 指向新父节点
  });

  it('复制多层嵌套节点', () => {
    const items = [
      { id: 'r', name: 'Root', parentId: null as string | null, sortOrder: 0, formula: '' },
      { id: 'm1', name: 'Mid1', parentId: 'r', sortOrder: 1, formula: '' },
      { id: 'l1', name: 'Leaf1', parentId: 'm1', sortOrder: 2, formula: '' },
      { id: 's', name: 'Sib', parentId: null, sortOrder: 3, formula: '' },
    ];
    const counter = { n: 1 };
    const result = duplicateNodes(items, 'r', { rootSuffix: '_副本', generateId: genId(counter) });

    expect(result).toHaveLength(7);
    // 原始块（0-2） + 新副本（3-5） + 原兄弟（6）
    expect(result[0].id).toBe('r');
    expect(result[1].id).toBe('m1');
    expect(result[2].id).toBe('l1');
    expect(result[3].id).toBe('new-1');
    expect(result[3].name).toBe('Root_副本');
    expect(result[4].id).toBe('new-2');
    expect(result[4].parentId).toBe('new-1');
    expect(result[5].id).toBe('new-3');
    expect(result[5].parentId).toBe('new-2');
    expect(result[6].id).toBe('s');
  });

  it('公式中的块内自引用替换为新 ID', () => {
    const items = [
      { id: 'a', name: 'A', parentId: null as string | null, sortOrder: 0, formula: '@{a} + 1' },
    ];
    const counter = { n: 1 };
    const result = duplicateNodes(items, 'a', { rootSuffix: '_副本', generateId: genId(counter) });

    expect(result).toHaveLength(2);
    expect(result[0].formula).toBe('@{a} + 1'); // 原节点不变
    expect(result[1].formula).toBe('@{new-1} + 1'); // 新节点引用新自己
  });

  it('公式中的外部引用保持原样', () => {
    const items = [
      { id: 'a', name: 'A', parentId: null as string | null, sortOrder: 0, formula: '@{ext} + @{b}' },
      { id: 'b', name: 'B', parentId: 'a', sortOrder: 1, formula: '' },
      { id: 'ext', name: 'Ext', parentId: null, sortOrder: 2, formula: '' },
    ];
    const counter = { n: 1 };
    const result = duplicateNodes(items, 'a', { rootSuffix: '_副本', generateId: genId(counter) });

    expect(result).toHaveLength(5);
    // 新 A（克隆自 a，位于 result[2]）的 formula 中：
    // ext 不在复制块内，保持不变；b 被替换为 new-2
    expect(result[2].formula).toBe('@{ext} + @{new-2}');
  });

  it('同名冲突时自动递增后缀', () => {
    const items = [
      { id: 'a', name: 'A', parentId: null as string | null, sortOrder: 0, formula: '' },
      { id: 'a2', name: 'A_副本', parentId: null, sortOrder: 1, formula: '' },
    ];
    const counter = { n: 1 };
    const result = duplicateNodes(items, 'a', { rootSuffix: '_副本', generateId: genId(counter) });

    expect(result).toHaveLength(3);
    const clone = result.find((n) => n.id === 'new-1');
    expect(clone!.name).toBe('A_副本2');
  });

  it('复制 sourceId 不存在的节点时返回原数组', () => {
    const items = [
      { id: 'a', name: 'A', parentId: null as string | null, sortOrder: 0, formula: '' },
    ];
    const result = duplicateNodes(items, 'nonexistent', { rootSuffix: '_副本', generateId: () => 'x' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('sortOrder 从 0 递增重排', () => {
    const items = [
      { id: 'a', name: 'A', parentId: null as string | null, sortOrder: 10, formula: '' },
      { id: 'b', name: 'B', parentId: null, sortOrder: 20, formula: '' },
    ];
    const counter = { n: 1 };
    const result = duplicateNodes(items, 'a', { rootSuffix: '_副本', generateId: genId(counter) });

    expect(result[0].sortOrder).toBe(0);
    expect(result[1].sortOrder).toBe(1); // 新副本
    expect(result[2].sortOrder).toBe(2);
  });

  it('复制中间节点时保持前后顺序', () => {
    const items = [
      { id: 'x', name: 'X', parentId: null as string | null, sortOrder: 0, formula: '' },
      { id: 'y', name: 'Y', parentId: null, sortOrder: 1, formula: '' },
      { id: 'z', name: 'Z', parentId: null, sortOrder: 2, formula: '' },
    ];
    const counter = { n: 1 };
    const result = duplicateNodes(items, 'y', { rootSuffix: '_副本', generateId: genId(counter) });

    expect(result.map((n) => n.id)).toEqual(['x', 'y', 'new-1', 'z']);
  });

  it('复制子树不影响其他同级节点的 parentId', () => {
    const items = [
      { id: 'r1', name: 'R1', parentId: null as string | null, sortOrder: 0, formula: '' },
      { id: 'c1', name: 'C1', parentId: 'r1', sortOrder: 1, formula: '' },
      { id: 'r2', name: 'R2', parentId: null, sortOrder: 2, formula: '' },
      { id: 'c2', name: 'C2', parentId: 'r2', sortOrder: 3, formula: '' },
    ];
    const counter = { n: 1 };
    const result = duplicateNodes(items, 'r1', { rootSuffix: '_副本', generateId: genId(counter) });

    // r2 和 c2 的 parentId 应保持不变
    const r2Copy = result.find((n) => n.id === 'r2');
    const c2Copy = result.find((n) => n.id === 'c2');
    expect(r2Copy!.parentId).toBeNull();
    expect(c2Copy!.parentId).toBe('r2');
  });

  it('连续复制时后缀继续递增', () => {
    const items = [
      { id: 'a', name: 'A', parentId: null as string | null, sortOrder: 0, formula: '' },
    ];
    const counter = { n: 1 };

    let result = duplicateNodes(items, 'a', { rootSuffix: '_副本', generateId: genId(counter) });
    result = duplicateNodes(result, 'a', { rootSuffix: '_副本', generateId: genId(counter) });

    expect(result).toHaveLength(3);
    // 第二次复制插入到原始节点 a 之后，所以新副本在索引 1
    expect(result[1].name).toBe('A_副本2');
    expect(result[2].name).toBe('A_副本');
  });
});
