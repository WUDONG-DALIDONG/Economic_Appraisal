import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { ModelDefinition, ParameterDefinition } from '@economic/core';
import { ValueType, ComputeMode, recomputeCodes, getCodeDepth, normalizeFullwidth, duplicateNodes } from '@economic/core';
import { FormulaEditor } from '../components/FormulaEditor.js';
import { FormulaEditModal } from '../components/FormulaEditModal.js';
import { FloatingToolbar } from '../components/FloatingToolbar.js';
import { ContextMenu } from '../components/ContextMenu.js';
import { formatNumber } from '../utils/formatNumber.js';
import { useTheme } from '../ThemeContext.js';

interface ParameterTreeEditorProps {
  model: ModelDefinition;
  parameters: ParameterDefinition[];
  onChange: (params: ParameterDefinition[]) => void;
  computeResult?: { paramValues?: Array<{ paramId: string; value: unknown }> } | null;
  onRename?: (oldName: string, newName: string, paramId: string) => void;
}

const CODE_COL_WIDTH = 70;
const ID_COL_WIDTH = 140;
const ACTION_COL_WIDTH = 160;
const NAME_COL_WIDTH = 160;
const COMPUTE_MODE_COL_WIDTH = 70;
const TYPE_COL_WIDTH = 90;
const UNIT_COL_WIDTH = 80;
const VALUE_COL_WIDTH = 100;
const FORMULA_COL_WIDTH = 80;

function paramColLeft(showId: boolean, col: 'code' | 'id' | 'name' | 'action' | 'computeMode' | 'valueType' | 'unit' | 'value' | 'formula'): number {
  const idW = showId ? ID_COL_WIDTH : 0;
  switch (col) {
    case 'code': return 0;
    case 'id': return CODE_COL_WIDTH;
    case 'name': return CODE_COL_WIDTH + idW;
    case 'action': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH;
    case 'computeMode': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH + ACTION_COL_WIDTH;
    case 'valueType': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH + ACTION_COL_WIDTH + COMPUTE_MODE_COL_WIDTH;
    case 'unit': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH + ACTION_COL_WIDTH + COMPUTE_MODE_COL_WIDTH + TYPE_COL_WIDTH;
    case 'value': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH + ACTION_COL_WIDTH + COMPUTE_MODE_COL_WIDTH + TYPE_COL_WIDTH + UNIT_COL_WIDTH;
    case 'formula': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH + ACTION_COL_WIDTH + COMPUTE_MODE_COL_WIDTH + TYPE_COL_WIDTH + UNIT_COL_WIDTH + VALUE_COL_WIDTH;
  }
}

export const ParameterTreeEditor: React.FC<ParameterTreeEditorProps> = ({
  model,
  parameters,
  onChange,
  computeResult,
  onRename,
}) => {
  const { theme } = useTheme();
  const [collapsedCodes, setCollapsedCodes] = useState<Set<string>>(new Set());
  const [editingFormulaParamId, setEditingFormulaParamId] = useState<string | null>(null);
  const [showIdColumn, setShowIdColumn] = useState(false);
  const [floatingToolbar, setFloatingToolbar] = useState<{ paramId: string; x: number; y: number } | null>(null);
  const [editingParamId, setEditingParamId] = useState<string | null>(null);
  const [editingRawValue, setEditingRawValue] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ paramId: string; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const paramValueMap = useMemo(() => {
    const m = new Map<string, unknown>();
    if (computeResult?.paramValues) {
      for (const pv of computeResult.paramValues) {
        m.set(pv.paramId, pv.value);
      }
    }
    return m;
  }, [computeResult?.paramValues]);

  const si = showIdColumn;

  const renameRef = useRef<{ id: string; oldName: string } | null>(null);

  const paramsWithCodes = useMemo(() => {
    const indexMap = new Map(parameters.map((p, i) => [p.id, i]));
    const codeMap = recomputeCodes(
      parameters.map((p, i) => ({
        id: p.id,
        parentId: p.parentId ?? null,
        sortOrder: p.sortOrder ?? i,
      }))
    );
    const withCodes = parameters.map((p) => ({
      ...p,
      code: codeMap.get(p.id) || p.code || '',
    }));
    withCodes.sort((a, b) => {
      const codeA = codeMap.get(a.id) || '';
      const codeB = codeMap.get(b.id) || '';
      if (codeA && codeB) return compareCode(codeA, codeB);
      const soA = a.sortOrder ?? 0;
      const soB = b.sortOrder ?? 0;
      if (soA !== soB) return soA - soB;
      return (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0);
    });
    return withCodes;
  }, [parameters]);

  const displayParams = useMemo(() => {
    const visible: ParameterDefinition[] = [];
    for (const param of paramsWithCodes) {
      if (!param.code) {
        visible.push(param);
        continue;
      }
      const parts = param.code.split('.');
      let isHidden = false;
      for (let i = 1; i < parts.length; i++) {
        const ancestorCode = parts.slice(0, i).join('.');
        if (collapsedCodes.has(ancestorCode)) {
          isHidden = true;
          break;
        }
      }
      if (!isHidden) visible.push(param);
    }
    return visible;
  }, [paramsWithCodes, collapsedCodes]);

  const hasChildren = (paramId: string) =>
    paramsWithCodes.some((p) => p.parentId === paramId);

  const getDescendants = (targetId: string): string[] => {
    const result: string[] = [];
    const queue = [targetId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const p of paramsWithCodes) {
        if (p.parentId === id) {
          result.push(p.id);
          queue.push(p.id);
        }
      }
    }
    return result;
  };

  const updateParam = (id: string, updates: Partial<ParameterDefinition>) => {
    if (updates.name !== undefined) {
      const param = paramsWithCodes.find((p) => p.id === id);
      if (param) {
        const siblings = paramsWithCodes.filter(
          (p) => p.parentId === param.parentId && p.id !== id
        );
        if (siblings.some((p) => p.name === updates.name)) {
          alert(`同父节点下已存在名为 "${updates.name}" 的参数`);
          // 清空输入框，等待用户输入新名字
          onChange(paramsWithCodes.map((p) => (p.id === id ? { ...p, name: '' } : p)));
          return;
        }
      }
    }
    onChange(paramsWithCodes.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const removeParam = (id: string) => {
    const desc = getDescendants(id);
    const msg = desc.length > 0
      ? `确定删除该参数及其 ${desc.length} 个子参数？`
      : '确定删除该参数？';
    if (!confirm(msg)) return;
    const removeSet = new Set([id, ...desc]);
    const target = paramsWithCodes.find((p) => p.id === id);
    const newParentId = target ? target.parentId : null;
    const remaining = paramsWithCodes.filter((p) => !removeSet.has(p.id));
    onChange(
      remaining
        .map((p) => (removeSet.has(p.parentId ?? '') ? { ...p, parentId: newParentId } : p))
    );
    const visibleIds = displayParams.map(p => p.id);
    const idx = visibleIds.indexOf(id);
    const nextId = idx < visibleIds.length - 1 ? visibleIds[idx + 1] : idx > 0 ? visibleIds[idx - 1] : null;
    if (nextId && !removeSet.has(nextId)) {
      setSelectedIds(new Set([nextId]));
      setLastClickedId(nextId);
    } else {
      setSelectedIds(new Set());
      setLastClickedId(null);
    }
  };

  const indentParam = (id: string) => {
    const idx = paramsWithCodes.findIndex((p) => p.id === id);
    if (idx <= 0) return;
    const target = paramsWithCodes[idx];
    const prev = paramsWithCodes[idx - 1];
    let newParentId: string | null;
    if (prev.parentId && prev.parentId !== target.parentId) {
      newParentId = prev.parentId;
    } else {
      newParentId = prev.id;
    }
    if (target.parentId === newParentId) return;
    if (prev.code && target.code && prev.code.startsWith(target.code + '.')) return;
    const updated = paramsWithCodes.map((p) => (p.id === id ? { ...p, parentId: newParentId } : p));
    onChange(updated.map((p, i) => ({ ...p, sortOrder: i })));
    setSelectedIds(new Set([id]));
    setLastClickedId(id);
  };

  const outdentParam = (id: string) => {
    const target = paramsWithCodes.find((p) => p.id === id);
    if (!target || !target.parentId) return;
    const parent = paramsWithCodes.find((p) => p.id === target.parentId);
    const updated = paramsWithCodes.map((p) =>
      p.id === id ? { ...p, parentId: parent?.parentId ?? null } : p
    );
    onChange(updated.map((p, i) => ({ ...p, sortOrder: i })));
    setSelectedIds(new Set([id]));
    setLastClickedId(id);
  };

  const insertParamAt = (id: string) => {
    const target = paramsWithCodes.find((p) => p.id === id);
    if (!target) return;
    const targetIdx = paramsWithCodes.findIndex((p) => p.id === id);

    const descendants = getDescendants(target.id);
    const insertIdx = targetIdx + descendants.length + 1;

    const lastDescOrTarget = descendants.length > 0
      ? paramsWithCodes.find(p => p.id === descendants[descendants.length - 1]) ?? target
      : target;
    const refSo = lastDescOrTarget.sortOrder ?? 0;

    let nextSibling: ParameterDefinition | null = null;
    for (let i = insertIdx; i < paramsWithCodes.length; i++) {
      if (paramsWithCodes[i].parentId === target.parentId) {
        nextSibling = paramsWithCodes[i];
        break;
      }
    }

    const newSo = nextSibling
      ? (refSo + (nextSibling.sortOrder ?? refSo + 1)) / 2
      : refSo + 1;

    const siblings = paramsWithCodes.filter((p) => p.parentId === target.parentId);
    const siblingNames = new Set(siblings.map((p) => p.name));
    let newName = '新参数';
    if (siblingNames.has(newName)) {
      let counter = 1;
      while (siblingNames.has(`新参数${counter}`)) counter++;
      newName = `新参数${counter}`;
    }
    const newParam: ParameterDefinition = {
      id: `p-${Date.now()}`,
      name: newName,
      valueType: ValueType.Number,
      computeMode: ComputeMode.Input,
      defaultValue: 0,
      sortOrder: newSo,
      parentId: target.parentId,
    };
    const updated = [...paramsWithCodes];
    updated.splice(insertIdx, 0, newParam);
    onChange(updated.map((p, i) => ({ ...p, sortOrder: i })));
    setSelectedIds(new Set([newParam.id]));
    setLastClickedId(newParam.id);
  };

  const duplicateParam = (id: string) => {
    let counter = 1;
    const randHex = (len: number) => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    };
    const newParams = duplicateNodes(paramsWithCodes, id, {
      rootSuffix: '_副本',
      generateId: () => `p-${Date.now()}-${randHex(6)}-${counter++}`,
    });
    onChange(newParams);
    // 找到新复制的根节点 ID（新生成的第一个节点）
    const rootClone = newParams.find((p) => p.name?.endsWith('_副本'));
    if (rootClone) {
      const idx = newParams.findIndex((p) => p.id === rootClone.id);
      if (idx >= 0) {
        setSelectedIds(new Set([rootClone.id]));
        setLastClickedId(rootClone.id);
      }
    }
  };

  const handleRowContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedIds(new Set([id]));
    setLastClickedId(id);
    setFloatingToolbar(null); // 关闭现有浮动工具栏
    setContextMenu({ paramId: id, x: e.clientX, y: e.clientY });
  };

  const moveUpParam = (id: string) => {
    const targetIdx = paramsWithCodes.findIndex((p) => p.id === id);
    if (targetIdx <= 0) return;
    const target = paramsWithCodes[targetIdx];

    const targetSiblings = paramsWithCodes.filter((p) => p.parentId === target.parentId);
    const targetSibIdx = targetSiblings.findIndex((p) => p.id === id);
    if (targetSibIdx <= 0) return;

    const prevSibling = targetSiblings[targetSibIdx - 1];
    const targetDesc = getDescendants(target.id);
    const prevDesc = getDescendants(prevSibling.id);

    const updated = [...paramsWithCodes];
    const prevStartIdx = updated.findIndex((p) => p.id === prevSibling.id);
    const prevBlockSize = 1 + prevDesc.length;
    const targetBlockSize = 1 + targetDesc.length;

    const prevBlock = updated.splice(prevStartIdx, prevBlockSize);
    const targetStartIdxNew = updated.findIndex((p) => p.id === target.id);
    const targetBlock = updated.splice(targetStartIdxNew, targetBlockSize);

    updated.splice(prevStartIdx, 0, ...targetBlock, ...prevBlock);

    const result = updated.map((p, i) => ({ ...p, sortOrder: i }));
    onChange(result);
    setSelectedIds(new Set([id]));
    setLastClickedId(id);
  };

  const moveDownParam = (id: string) => {
    const targetIdx = paramsWithCodes.findIndex((p) => p.id === id);
    if (targetIdx < 0 || targetIdx >= paramsWithCodes.length - 1) return;
    const target = paramsWithCodes[targetIdx];

    const targetSiblings = paramsWithCodes.filter((p) => p.parentId === target.parentId);
    const targetSibIdx = targetSiblings.findIndex((p) => p.id === id);
    if (targetSibIdx === -1 || targetSibIdx >= targetSiblings.length - 1) return;

    const nextSibling = targetSiblings[targetSibIdx + 1];
    const targetDesc = getDescendants(target.id);
    const nextDesc = getDescendants(nextSibling.id);

    const updated = [...paramsWithCodes];
    const targetStartIdx = updated.findIndex((p) => p.id === target.id);
    const targetBlockSize = 1 + targetDesc.length;
    const nextBlockSize = 1 + nextDesc.length;

    const targetBlock = updated.splice(targetStartIdx, targetBlockSize);
    const nextStartIdxNew = updated.findIndex((p) => p.id === nextSibling.id);
    const nextBlock = updated.splice(nextStartIdxNew, nextBlockSize);

    updated.splice(targetStartIdx, 0, ...nextBlock, ...targetBlock);

    const result = updated.map((p, i) => ({ ...p, sortOrder: i }));
    onChange(result);
    setSelectedIds(new Set([id]));
    setLastClickedId(id);
  };

  const toggleCollapse = (code: string) => {
    setCollapsedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleRowClick = useCallback((e: React.MouseEvent, id: string) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else if (e.shiftKey && lastClickedId) {
      const ids = displayParams.map(p => p.id);
      const start = ids.indexOf(lastClickedId);
      const end = ids.indexOf(id);
      if (start >= 0 && end >= 0) {
        const [lo, hi] = [Math.min(start, end), Math.max(start, end)];
        setSelectedIds(new Set(ids.slice(lo, hi + 1)));
      }
    } else {
      setSelectedIds(new Set([id]));
    }
    setLastClickedId(id);
  }, [lastClickedId, displayParams]);

  const scrollToRow = useCallback((id: string) => {
    const el = containerRef.current?.querySelector(`[data-row-id="${id}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!lastClickedId) return;
    const ids = displayParams.map(p => p.id);
    const idx = ids.indexOf(lastClickedId);
    if (idx < 0) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) {
        const newId = ids[idx - 1];
        if (e.ctrlKey || e.metaKey) {
          setSelectedIds(prev => new Set([...prev, newId]));
        } else {
          setSelectedIds(new Set([newId]));
        }
        setLastClickedId(newId);
        scrollToRow(newId);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx < ids.length - 1) {
        const newId = ids[idx + 1];
        if (e.ctrlKey || e.metaKey) {
          setSelectedIds(prev => new Set([...prev, newId]));
        } else {
          setSelectedIds(new Set([newId]));
        }
        setLastClickedId(newId);
        scrollToRow(newId);
      }
    } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setSelectedIds(new Set(ids));
    }
  }, [lastClickedId, displayParams, scrollToRow]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('tr[data-row-id]')) {
      setSelectedIds(new Set());
    }
  }, []);

  const handleNameBlur = (id: string) => {
    if (!renameRef.current || !onRename) return;
    const param = paramsWithCodes.find((p) => p.id === id);
    if (!param || param.id !== renameRef.current.id) {
      renameRef.current = null;
      return;
    }
    const newName = param.name;
    const oldName = renameRef.current.oldName;
    renameRef.current = null;
    if (oldName !== newName) {
      onRename(oldName, newName, param.id);
    }
  };

  const codeDepth = (code?: string): number => {
    if (!code) return 1;
    return getCodeDepth(code);
  };

  const fixedHeaderStyle = (left: number, width: number): React.CSSProperties => ({
    position: 'sticky',
    left,
    top: 0,
    zIndex: 3,
    background: theme.bgSecondary,
    borderBottom: `2px solid ${theme.borderPrimary}`,
    borderRight: `1px solid ${theme.borderPrimary}`,
    padding: '6px 8px',
    fontSize: 12,
    fontWeight: 600,
    width,
    minWidth: width,
    textAlign: 'left' as const,
  });

  const fixedCellStyle = (left: number, _width: number, isSelected: boolean = false): React.CSSProperties => ({
    position: 'sticky',
    left,
    zIndex: 1,
    background: isSelected ? theme.rowSelectedBg : theme.bgPrimary,
    borderBottom: `1px solid ${theme.borderSecondary}`,
    borderRight: `1px solid ${theme.borderPrimary}`,
    padding: '4px 8px',
    fontSize: 12,
  });

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: theme.textSecondary }}>
          共 {parameters.length} 个参数
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={() => setShowIdColumn(!showIdColumn)}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              border: `1px solid ${theme.borderPrimary}`,
              background: showIdColumn ? theme.accent : theme.bgPrimary,
              color: showIdColumn ? theme.btnPrimaryText : theme.textSecondary,
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            ID
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{ border: `1px solid ${theme.borderPrimary}`, borderRadius: 4, overflow: 'auto', position: 'relative', maxHeight: '60vh' }}
        onClick={handleContainerClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={fixedHeaderStyle(paramColLeft(si, 'code'), CODE_COL_WIDTH)}>
                编码
              </th>
              {si && (
                <th style={fixedHeaderStyle(paramColLeft(si, 'id'), ID_COL_WIDTH)}>
                  ID
                </th>
              )}
              <th style={fixedHeaderStyle(paramColLeft(si, 'name'), NAME_COL_WIDTH)}>
                名称
              </th>
              <th style={fixedHeaderStyle(paramColLeft(si, 'action'), ACTION_COL_WIDTH)}>
                操作
              </th>
              <th style={fixedHeaderStyle(paramColLeft(si, 'computeMode'), COMPUTE_MODE_COL_WIDTH)}>
                计算方式
              </th>
              <th style={fixedHeaderStyle(paramColLeft(si, 'valueType'), TYPE_COL_WIDTH)}>
                值类型
              </th>
              <th style={fixedHeaderStyle(paramColLeft(si, 'unit'), UNIT_COL_WIDTH)}>
                单位
              </th>
              <th style={fixedHeaderStyle(paramColLeft(si, 'value'), VALUE_COL_WIDTH)}>
                默认值
              </th>
              <th style={fixedHeaderStyle(paramColLeft(si, 'formula'), FORMULA_COL_WIDTH)}>
                公式
              </th>
            </tr>
          </thead>
          <tbody>
            {displayParams.map((param) => {
              const isLeaf = !hasChildren(param.id);
              const isParamCollapsed = param.code ? collapsedCodes.has(param.code) : false;
              const depth = codeDepth(param.code);
              const isSelected = selectedIds.has(param.id);
              return (
              <tr
                key={param.id}
                data-row-id={param.id}
                onClick={(e) => handleRowClick(e, param.id)}
                onContextMenu={(e) => handleRowContextMenu(e, param.id)}
                style={isSelected ? { background: theme.rowSelectedBg } : undefined}
              >
                  <td style={fixedCellStyle(paramColLeft(si, 'code'), CODE_COL_WIDTH, isSelected)}>
                    {hasChildren(param.id) ? (
                      <span
                        onClick={() => toggleCollapse(param.code!)}
                        style={{ cursor: 'pointer', marginRight: 4, userSelect: 'none' }}
                      >
                        {isParamCollapsed ? '▶' : '▼'}
                      </span>
                    ) : (
                      <span style={{ marginRight: 4, display: 'inline-block', width: 12 }} />
                    )}
                    {param.code || '-'}
                  </td>

                  {si && (
                    <td style={{
                      ...fixedCellStyle(paramColLeft(si, 'id'), ID_COL_WIDTH, isSelected),
                      fontSize: 10,
                      color: theme.textTertiary,
                      fontFamily: 'monospace',
                    }}>
                      {param.id}
                    </td>
                  )}

                  <td
                    style={{
                      ...fixedCellStyle(paramColLeft(si, 'name'), NAME_COL_WIDTH, isSelected),
                      paddingLeft: `${8 + (depth - 1) * 16}px`,
                    }}
                  >
                    <input
                      value={param.name}
                      onChange={(e) => updateParam(param.id, { name: normalizeFullwidth(e.target.value) })}
                      onFocus={() => { renameRef.current = { id: param.id, oldName: param.name }; }}
                      onBlur={() => {
                        const trimmed = param.name.trim();
                        if (trimmed !== param.name) {
                          updateParam(param.id, { name: trimmed });
                        }
                        handleNameBlur(param.id);
                      }}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        fontSize: 12,
                        padding: 0,
                        color: theme.textPrimary,
                      }}
                    />
                  </td>

                  <td style={{ ...fixedCellStyle(paramColLeft(si, 'action'), ACTION_COL_WIDTH, isSelected), display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                    <button
                      onClick={() => indentParam(param.id)}
                      title="缩进 (设为子级)"
                      style={{ width: 18, height: 20, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                    >
                      →
                    </button>
                    <button
                      onClick={() => outdentParam(param.id)}
                      title="反缩进 (提升)"
                      style={{ width: 18, height: 20, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                    >
                      ←
                    </button>
                    <button
                      onClick={() => moveUpParam(param.id)}
                      title="上移"
                      style={{ width: 18, height: 20, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveDownParam(param.id)}
                      title="下移"
                      style={{ width: 18, height: 20, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => insertParamAt(param.id)}
                      title="下方插入"
                      style={{ width: 18, height: 20, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                    >
                      +
                    </button>
                    <button
                      onClick={param.computeMode === ComputeMode.Title ? undefined : (e) => { setFloatingToolbar({ paramId: param.id, x: e.clientX, y: e.clientY }); setSelectedIds(new Set([param.id])); setLastClickedId(param.id); }}
                      title={`精度: ${param.precision ?? 2} 位`}
                      disabled={param.computeMode === ComputeMode.Title}
                      style={{ width: 24, height: 20, color: param.computeMode === ComputeMode.Title ? theme.textTertiary : theme.textSecondary, background: 'none', border: 'none', cursor: param.computeMode === ComputeMode.Title ? 'default' : 'pointer', fontSize: 10, fontFamily: 'monospace', padding: 0 }}
                    >
                      {param.precision ?? 2}d
                    </button>
                    <button
                      onClick={() => removeParam(param.id)}
                      title="删除"
                      style={{ width: 18, height: 20, color: theme.error, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                    >
                      ×
                    </button>
                  </td>

                  <td style={fixedCellStyle(paramColLeft(si, 'computeMode'), COMPUTE_MODE_COL_WIDTH, isSelected)}>
                    <select
                      value={param.computeMode || ComputeMode.Input}
                      onChange={(e) => updateParam(param.id, { computeMode: e.target.value as ComputeMode })}
                      style={{ border: 'none', background: 'transparent', fontSize: 12, padding: 0, color: theme.textPrimary }}
                    >
                      <option value={ComputeMode.Title}>−</option>
                      <option value={ComputeMode.Input}>输入</option>
                      <option value={ComputeMode.Formula}>公式</option>
                    </select>
                  </td>

                  <td style={fixedCellStyle(paramColLeft(si, 'valueType'), TYPE_COL_WIDTH, isSelected)}>
                    <select
                      value={param.valueType}
                      onChange={(e) => updateParam(param.id, { valueType: e.target.value as ValueType })}
                      disabled={param.computeMode === ComputeMode.Title}
                      style={{ border: 'none', background: 'transparent', fontSize: 12, padding: 0, color: theme.textPrimary }}
                    >
                      {Object.values(ValueType).map((t) => (
                        <option key={t} value={t}>{valueTypeLabel(t)}</option>
                      ))}
                    </select>
                  </td>

                  <td style={fixedCellStyle(paramColLeft(si, 'unit'), UNIT_COL_WIDTH, isSelected)}>
                    <input
                      value={param.unit || ''}
                      onChange={(e) => updateParam(param.id, { unit: normalizeFullwidth(e.target.value) })}
                      readOnly={param.computeMode === ComputeMode.Title}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        fontSize: 12,
                        padding: 0,
                        color: param.computeMode === ComputeMode.Title ? theme.textTertiary : theme.textPrimary,
                      }}
                    />
                  </td>

                  <td style={fixedCellStyle(paramColLeft(si, 'value'), VALUE_COL_WIDTH, isSelected)}>
                    {param.computeMode === ComputeMode.Title ? (
                      <span />
                    ) : param.computeMode === ComputeMode.Formula ? (
                      <input
                        type="text"
                        readOnly
                        value={
                          (() => {
                            const computedVal = paramValueMap.get(param.id);
                            const displayVal = computedVal !== undefined ? computedVal : param.defaultValue;
                            return (param.valueType === ValueType.Number || param.valueType === ValueType.Percentage) && typeof displayVal === 'number'
                              ? formatNumber(displayVal, param.precision, param.valueType, param.useGrouping)
                              : String(displayVal ?? '');
                          })()
                        }
                        style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 12, textAlign: 'right', padding: 0, color: theme.textSecondary }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={
                          (() => {
                            if ((param.valueType === ValueType.Number || param.valueType === ValueType.Percentage) && editingParamId === param.id) {
                              return editingRawValue[param.id] ?? '';
                            }
                            const computedVal = param.formula ? paramValueMap.get(param.id) : undefined;
                            const displayVal = computedVal !== undefined ? computedVal : param.defaultValue;
                            if ((param.valueType === ValueType.Number || param.valueType === ValueType.Percentage) && typeof displayVal === 'number') {
                              return formatNumber(displayVal, param.precision, param.valueType, param.useGrouping);
                            }
                            return String(displayVal ?? '');
                          })()
                        }
                        onFocus={() => {
                          setEditingParamId(param.id);
                          if (param.valueType === ValueType.Number || param.valueType === ValueType.Percentage) {
                            const computedVal = param.formula ? paramValueMap.get(param.id) : undefined;
                            const displayVal = computedVal !== undefined ? computedVal : param.defaultValue;
                            setEditingRawValue((prev) => ({
                              ...prev,
                              [param.id]: typeof displayVal === 'number' ? String(displayVal) : (displayVal ?? ''),
                            }));
                          }
                        }}
                        onBlur={() => {
                          setEditingParamId(null);
                          if ((param.valueType === ValueType.Number || param.valueType === ValueType.Percentage) && editingRawValue[param.id] !== undefined) {
                            const cleaned = editingRawValue[param.id].replace(/,/g, '');
                            const num = cleaned === '' ? 0 : Number(cleaned);
                            if (!isNaN(num)) updateParam(param.id, { defaultValue: num });
                            setEditingRawValue((prev) => {
                              const next = { ...prev };
                              delete next[param.id];
                              return next;
                            });
                          }
                        }}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/,/g, '');
                          if (param.valueType === ValueType.Number || param.valueType === ValueType.Percentage) {
                            setEditingRawValue((prev) => ({ ...prev, [param.id]: raw }));
                          } else {
                            updateParam(param.id, { defaultValue: e.target.value });
                          }
                        }}
                        style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 12, textAlign: 'right', padding: 0, color: theme.textPrimary }}
                      />
                    )}
                  </td>

                  <td style={fixedCellStyle(paramColLeft(si, 'formula'), FORMULA_COL_WIDTH, isSelected)}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                      {param.computeMode === ComputeMode.Formula ? (
                        <FormulaEditor
                          value={param.formula || ''}
                          onChange={(val) => updateParam(param.id, { formula: val })}
                          model={model}
                          currentCellId={param.id}
                          mode="compact"
                          scope="parameters-only"
                          onFocus={() => { setEditingFormulaParamId(param.id); setSelectedIds(new Set([param.id])); setLastClickedId(param.id); }}
                        />
                      ) : (
                        <span style={{ color: theme.textPlaceholder }}>−</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {displayParams.length === 0 && (
              <tr>
                <td
                  colSpan={si ? 9 : 8}
                  style={{
                    padding: 32,
                    textAlign: 'center',
                    color: theme.textPlaceholder,
                    fontSize: 14,
                  }}
                >
                  暂无参数，点击行内"+"按钮开始添加
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {floatingToolbar && (() => {
        const param = paramsWithCodes.find((p) => p.id === floatingToolbar.paramId);
        if (!param) return null;
        return (
          <FloatingToolbar
            x={floatingToolbar.x}
            y={floatingToolbar.y}
            currentPrecision={param.precision ?? 2}
            currentValueType={(param.valueType as 'number' | 'percentage') ?? 'number'}
            currentUseGrouping={param.useGrouping}
            onSelect={(p) => updateParam(floatingToolbar.paramId, { precision: p === 2 ? undefined : p })}
            onValueTypeChange={(t) => updateParam(floatingToolbar.paramId, { valueType: t })}
            onUseGroupingChange={(v) => updateParam(floatingToolbar.paramId, { useGrouping: v })}
            onClose={() => setFloatingToolbar(null)}
          />
        );
        })()}
      {editingFormulaParamId && (() => {
        const param = paramsWithCodes.find((p) => p.id === editingFormulaParamId);
        if (!param) return null;
        return (
          <FormulaEditModal
            title={`参数公式: ${param.name || ''}`}
            formula={param.formula || ''}
            onSave={(val) => {
              updateParam(param.id, { formula: val });
              setEditingFormulaParamId(null);
            }}
            onClose={() => setEditingFormulaParamId(null)}
            model={model}
            currentCellId={param.id}
            scope="parameters-only"
          />
        );
      })()}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: '复制并插入到下方',
              icon: '📋',
              onClick: () => duplicateParam(contextMenu.paramId),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </section>
  );
};

function valueTypeLabel(t: ValueType): string {
  const map: Record<string, string> = {
    [ValueType.Number]: '数值',
    [ValueType.Percentage]: '百分比',
    [ValueType.Enum]: '选项',
    [ValueType.String]: '文本',
    [ValueType.Boolean]: '布尔',
    [ValueType.Date]: '日期',
  };
  return map[t] || t;
}

function compareCode(a: string, b: string): number {
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  const minLen = Math.min(ap.length, bp.length);
  for (let i = 0; i < minLen; i++) {
    if (ap[i] !== bp[i]) return ap[i] - bp[i];
  }
  return ap.length - bp.length;
}
