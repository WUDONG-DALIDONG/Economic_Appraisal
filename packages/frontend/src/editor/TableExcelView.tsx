import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ModelDefinition, CellDefinition, ComputeMode, ValueType, recomputeCodes, getCodeDepth, formulaIdToDisplay } from '@economic/core';
import { generateTimelineColumns, TimelineColumn } from '../utils/timelineColumns.js';
import { FormulaEditor } from '../components/FormulaEditor.js';
import { FormulaEditModal } from '../components/FormulaEditModal.js';
import { FloatingToolbar } from '../components/FloatingToolbar.js';
import { formatNumber } from '../utils/formatNumber.js';
import { useTheme } from '../ThemeContext.js';

interface TableExcelViewProps {
  model: ModelDefinition;
  activeTableId: string;
  computeResult: { results: Array<{ cellId: string; timeIndex: number; value: number | null }>; errors?: Array<{ cellId: string; timeIndex: number; error: string }> } | null;
  onCellsChange: (cells: CellDefinition[]) => void;
}

const DEFAULT_COL_WIDTH = 100;

const CODE_COL_WIDTH = 80;
const ID_COL_WIDTH = 140;
const NAME_COL_WIDTH = 120;
const ACTION_COL_WIDTH = 160;
const TYPE_COL_WIDTH = 80;
const UNIT_COL_WIDTH = 60;
const FORMULA_COL_WIDTH = 80;
const SCOPE_COL_WIDTH = 80;
const SUMMARY_COL_WIDTH = 100;

function colLeft(showId: boolean, col: 'code' | 'id' | 'name' | 'action' | 'type' | 'unit' | 'formula' | 'scope' | 'summary'): number {
  const idW = showId ? ID_COL_WIDTH : 0;
  switch (col) {
    case 'code': return 0;
    case 'id': return CODE_COL_WIDTH;
    case 'name': return CODE_COL_WIDTH + idW;
    case 'action': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH;
    case 'type': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH + ACTION_COL_WIDTH;
    case 'unit': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH + ACTION_COL_WIDTH + TYPE_COL_WIDTH;
    case 'formula': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH + ACTION_COL_WIDTH + TYPE_COL_WIDTH + UNIT_COL_WIDTH;
    case 'scope': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH + ACTION_COL_WIDTH + TYPE_COL_WIDTH + UNIT_COL_WIDTH + FORMULA_COL_WIDTH;
    case 'summary': return CODE_COL_WIDTH + idW + NAME_COL_WIDTH + ACTION_COL_WIDTH + TYPE_COL_WIDTH + UNIT_COL_WIDTH + FORMULA_COL_WIDTH + SCOPE_COL_WIDTH;
  }
}

function fixedColsCount(showId: boolean): number {
  return showId ? 9 : 8;
}

export const TableExcelView: React.FC<TableExcelViewProps> = ({
  model,
  activeTableId,
  computeResult,
  onCellsChange,
}) => {
  const { theme } = useTheme();
  const tableCells = model.cells.filter((c) => c.tableId === activeTableId);
  const columns = generateTimelineColumns(model.timeline);

  const [collapsedCodes, setCollapsedCodes] = useState<Set<string>>(new Set());
  const [editingFormulaCellId, setEditingFormulaCellId] = useState<string | null>(null);
  const [showIdColumn, setShowIdColumn] = useState(false);
  const [floatingToolbar, setFloatingToolbar] = useState<{ cellId: string; x: number; y: number } | null>(null);

  const resultMap = useMemo(() => {
    const map = new Map<string, number | null>();
    if (computeResult?.results) {
      for (const r of computeResult.results) {
        map.set(`${r.cellId}:${r.timeIndex}`, r.value);
      }
    }
    return map;
  }, [computeResult]);

  const refErrorMap = useMemo(() => {
    const map = new Set<string>();
    if (computeResult?.errors) {
      for (const e of computeResult.errors) {
        if (e.error?.includes('#REF!')) {
          map.add(`${e.cellId}:${e.timeIndex}`);
        }
      }
    }
    return map;
  }, [computeResult]);

  const hasResults = resultMap.size > 0;

  const [colWidths, setColWidths] = useState<number[]>(
    () => new Array(columns.length).fill(DEFAULT_COL_WIDTH)
  );

  const [editingCell, setEditingCell] = useState<{
    cellId: string;
    colIndex: number;
    value: string;
  } | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    colIndex: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    setColWidths((prev) => {
      if (prev.length === columns.length) return prev;
      const next = new Array(columns.length).fill(DEFAULT_COL_WIDTH);
      for (let i = 0; i < Math.min(prev.length, columns.length); i++) {
        next[i] = prev[i];
      }
      return next;
    });
  }, [columns.length]);

  const cellsWithCodes = useMemo(() => {
    const indexMap = new Map(tableCells.map((c, i) => [c.id, i]));
    const codeMap = recomputeCodes(
      tableCells.map((c, i) => ({
        id: c.id,
        parentId: c.parentId ?? null,
        sortOrder: c.sortOrder ?? i,
      }))
    );
    const otherCells = model.cells.filter((c) => c.tableId !== activeTableId);
    const updatedTableCells = tableCells.map((c) => ({
      ...c,
      code: codeMap.get(c.id) || c.code || '',
    }));
    updatedTableCells.sort((a, b) => {
      const codeA = codeMap.get(a.id) || '';
      const codeB = codeMap.get(b.id) || '';
      if (codeA && codeB) return compareCode(codeA, codeB);
      const soA = a.sortOrder ?? 0;
      const soB = b.sortOrder ?? 0;
      if (soA !== soB) return soA - soB;
      return (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0);
    });
    return [...otherCells, ...updatedTableCells];
  }, [tableCells, activeTableId, model.cells]);

  const displayCells = useMemo(() => {
    const tableRows = cellsWithCodes.filter((c) => c.tableId === activeTableId);
    const visible: CellDefinition[] = [];
    for (const cell of tableRows) {
      if (!cell.code) {
        visible.push(cell);
        continue;
      }
      const parts = cell.code.split('.');
      let isHidden = false;
      for (let i = 1; i < parts.length; i++) {
        const ancestorCode = parts.slice(0, i).join('.');
        if (collapsedCodes.has(ancestorCode)) {
          isHidden = true;
          break;
        }
      }
      if (!isHidden) visible.push(cell);
    }
    return visible;
  }, [cellsWithCodes, activeTableId, collapsedCodes]);

  const updateCell = (cellId: string, updates: Partial<CellDefinition>) => {
    if (updates.name !== undefined) {
      const cell = cellsWithCodes.find((c) => c.id === cellId);
      if (cell) {
        const siblings = cellsWithCodes.filter(
          (c) => c.tableId === cell.tableId && c.parentId === cell.parentId && c.id !== cellId
        );
        if (siblings.some((c) => c.name === updates.name)) {
          return;
        }
      }
    }
    const next = cellsWithCodes.map((c) =>
      c.id === cellId ? { ...c, ...updates } : c
    );
    onCellsChange(next);
  };

  const removeCell = (cellId: string) => {
    const fam = buildFamilies();
    const toRemove = getDescendants(fam, cellId);
    const msg = toRemove.length > 0
      ? `确定删除该指标及其 ${toRemove.length} 个子指标？`
      : '确定删除该指标？';
    if (!confirm(msg)) return;

    const tableRows = cellsWithCodes.filter((c) => c.tableId === activeTableId);
    const otherRows = cellsWithCodes.filter((c) => c.tableId !== activeTableId);
    const removeSet = new Set([cellId, ...toRemove]);
    const target = fam.get(cellId);
    const newParentId = target ? target.parentId : null;

    const updatedRows = tableRows
      .filter((c) => !removeSet.has(c.id))
      .map((c) =>
        removeSet.has(c.parentId ?? '') ? { ...c, parentId: newParentId } : c
      );
    onCellsChange([...otherRows, ...updatedRows]);
  };

  const moveUpCell = (cellId: string) => {
    const tableRows = [...cellsWithCodes.filter((c) => c.tableId === activeTableId)];
    const otherRows = cellsWithCodes.filter((c) => c.tableId !== activeTableId);
    const targetIdx = tableRows.findIndex((c) => c.id === cellId);
    if (targetIdx <= 0) return;
    const target = tableRows[targetIdx];

    const targetSiblings = tableRows.filter((c) => c.parentId === target.parentId);
    const targetSibIdx = targetSiblings.findIndex((c) => c.id === cellId);
    if (targetSibIdx <= 0) return;

    const prevSibling = targetSiblings[targetSibIdx - 1];
    const targetDesc = getDescendants(buildFamilies(), target.id);
    const prevDesc = getDescendants(buildFamilies(), prevSibling.id);

    const updated = [...tableRows];
    const prevStartIdx = updated.findIndex((c) => c.id === prevSibling.id);
    const prevBlockSize = 1 + prevDesc.length;
    const targetBlockSize = 1 + targetDesc.length;

    const prevBlock = updated.splice(prevStartIdx, prevBlockSize);
    const targetStartIdxNew = updated.findIndex((c) => c.id === target.id);
    const targetBlock = updated.splice(targetStartIdxNew, targetBlockSize);

    updated.splice(prevStartIdx, 0, ...targetBlock, ...prevBlock);

    const updatedRows = updated.map((c, i) => ({ ...c, sortOrder: i }));
    onCellsChange([...otherRows, ...updatedRows]);
  };

  const moveDownCell = (cellId: string) => {
    const tableRows = [...cellsWithCodes.filter((c) => c.tableId === activeTableId)];
    const otherRows = cellsWithCodes.filter((c) => c.tableId !== activeTableId);
    const targetIdx = tableRows.findIndex((c) => c.id === cellId);
    if (targetIdx < 0 || targetIdx >= tableRows.length - 1) return;
    const target = tableRows[targetIdx];

    const targetSiblings = tableRows.filter((c) => c.parentId === target.parentId);
    const targetSibIdx = targetSiblings.findIndex((c) => c.id === cellId);
    if (targetSibIdx === -1 || targetSibIdx >= targetSiblings.length - 1) return;

    const nextSibling = targetSiblings[targetSibIdx + 1];
    const targetDesc = getDescendants(buildFamilies(), target.id);
    const nextDesc = getDescendants(buildFamilies(), nextSibling.id);

    const updated = [...tableRows];
    const targetStartIdx = updated.findIndex((c) => c.id === target.id);
    const targetBlockSize = 1 + targetDesc.length;
    const nextBlockSize = 1 + nextDesc.length;

    const targetBlock = updated.splice(targetStartIdx, targetBlockSize);
    const nextStartIdxNew = updated.findIndex((c) => c.id === nextSibling.id);
    const nextBlock = updated.splice(nextStartIdxNew, nextBlockSize);

    updated.splice(targetStartIdx, 0, ...nextBlock, ...targetBlock);

    const updatedRows = updated.map((c, i) => ({ ...c, sortOrder: i }));
    onCellsChange([...otherRows, ...updatedRows]);
  };

  const insertCellAt = (cellId: string) => {
    const tableRows = [...cellsWithCodes.filter((c) => c.tableId === activeTableId)];
    const otherRows = cellsWithCodes.filter((c) => c.tableId !== activeTableId);

    const target = tableRows.find((c) => c.id === cellId);
    if (!target) return;
    const parentId = target.parentId;

    const targetDesc = getDescendants(buildFamilies(), target.id);
    const lastDescOrTarget = targetDesc.length > 0
      ? tableRows.find(c => c.id === targetDesc[targetDesc.length - 1]) ?? target
      : target;
    const refSo = lastDescOrTarget.sortOrder ?? 0;

    const targetIdx = tableRows.findIndex((c) => c.id === cellId);
    const insertIdx = targetIdx + targetDesc.length + 1;

    let nextSibling: CellDefinition | null = null;
    for (let i = insertIdx; i < tableRows.length; i++) {
      if (tableRows[i].parentId === parentId) {
        nextSibling = tableRows[i];
        break;
      }
    }

    const newSo = nextSibling
      ? (refSo + (nextSibling.sortOrder ?? refSo + 1)) / 2
      : refSo + 1;

    const siblings = tableRows.filter((c) => c.parentId === parentId);
    const siblingNames = new Set(siblings.map((c) => c.name));
    let newName = '新指标';
    if (siblingNames.has(newName)) {
      let counter = 1;
      while (siblingNames.has(`新指标${counter}`)) counter++;
      newName = `新指标${counter}`;
    }

    const newCell: CellDefinition = {
      id: `cell-${Date.now()}`,
      name: newName,
      tableId: activeTableId,
      formula: '',
      computeMode: ComputeMode.Input,
      valueType: ValueType.Number,
      isArray: true,
      unit: '',
      sortOrder: newSo,
      parentId,
    };

    const updatedRows = [...tableRows];
    updatedRows.splice(insertIdx, 0, newCell);

    onCellsChange([...otherRows, ...updatedRows.map((c, i) => ({ ...c, sortOrder: i }))]);
  };



  const indentCell = (cellId: string) => {
    const tableRows = cellsWithCodes.filter((c) => c.tableId === activeTableId);
    const otherRows = cellsWithCodes.filter((c) => c.tableId !== activeTableId);

    const idx = tableRows.findIndex((c) => c.id === cellId);
    if (idx <= 0) return;

    const target = tableRows[idx];
    const prev = tableRows[idx - 1];

    if (target.parentId === prev.id) return;
    if (prev.code && target.code && prev.code.startsWith(target.code + '.')) return;

    const newParentId = prev.id;
    const updatedRows = tableRows.map((c) =>
      c.id === cellId ? { ...c, parentId: newParentId } : c
    );
    onCellsChange([...otherRows, ...updatedRows.map((c, i) => ({ ...c, sortOrder: i }))]);
  };

  const outdentCell = (cellId: string) => {
    const tableRows = cellsWithCodes.filter((c) => c.tableId === activeTableId);
    const otherRows = cellsWithCodes.filter((c) => c.tableId !== activeTableId);

    const target = tableRows.find((c) => c.id === cellId);
    if (!target || target.parentId === null) return;

    const parent = tableRows.find((c) => c.id === target.parentId);
    const newParentId = parent?.parentId ?? null;

    const updatedRows = tableRows.map((c) =>
      c.id === cellId ? { ...c, parentId: newParentId } : c
    );
    onCellsChange([...otherRows, ...updatedRows.map((c, i) => ({ ...c, sortOrder: i }))]);
  };

  const buildFamilies = (): Map<string, { parentId: string | null; children: string[] }> => {
    const tableRows = cellsWithCodes.filter((c) => c.tableId === activeTableId);
    const fam = new Map<string, { parentId: string | null; children: string[] }>();
    for (const row of tableRows) {
      fam.set(row.id, { parentId: row.parentId ?? null, children: [] });
    }
    for (const row of tableRows) {
      if (row.parentId != null) {
        const p = fam.get(row.parentId);
        if (p) p.children.push(row.id);
      } else {
        const p = fam.get('__root__') ?? { parentId: null, children: [] };
        fam.set('__root__', p);
        p.children.push(row.id);
      }
    }
    return fam;
  };

  const getDescendants = (fam: Map<string, { parentId: string | null; children: string[] }>, id: string): string[] => {
    const node = fam.get(id);
    if (!node) return [];
    const result: string[] = [];
    for (const child of node.children) {
      result.push(child);
      result.push(...getDescendants(fam, child));
    }
    return result;
  };

  const toggleCollapse = (code: string) => {
    setCollapsedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const hasChildren = (cellId: string): boolean => {
    const tableRows = cellsWithCodes.filter((c) => c.tableId === activeTableId);
    return tableRows.some((c) => c.parentId === cellId);
  };

  const isCollapsed = (code: string): boolean => collapsedCodes.has(code);

  const getCellDisplayValue = (
    cell: CellDefinition,
    col: TimelineColumn,
    colContext: 'formula-column' | 'timeline'
  ): string => {
    if (cell.computeMode === ComputeMode.Title) return '';

    if (cell.scope && cell.scope !== 'both') {
      if (cell.scope === 'construction' && col.period === 'operation') return '';
      if (cell.scope === 'operation' && col.period === 'construction') return '';
    }

    if (cell.computeMode === ComputeMode.Formula) {
      if (colContext === 'formula-column') {
        return formulaIdToDisplay(cell.formula, model);
      }
      if (colContext === 'timeline') {
        if (refErrorMap.has(`${cell.id}:${col.index}`)) return '#REF!';
        const resultVal = resultMap.get(`${cell.id}:${col.index}`);
        if (resultVal !== undefined && resultVal !== null) {
          return formatNumber(resultVal, cell.precision, cell.valueType, cell.useGrouping);
        }
        return '';
      }
    }

    if (cell.computeMode === ComputeMode.Input) {
      const arr = Array.isArray(cell.defaultValue) ? cell.defaultValue : [];
      const val = arr[col.index] ?? '';
      if (val !== undefined && val !== null && val !== '') {
        const numVal = Number(val);
        if (!isNaN(numVal) && val !== '') {
          return formatNumber(numVal, cell.precision, cell.valueType, cell.useGrouping);
        }
        return String(val);
      }
      return '';
    }

    return '';
  };

  const isCellEditable = (cell: CellDefinition, col: TimelineColumn): boolean => {
    if (cell.scope && cell.scope !== 'both') {
      if (cell.scope === 'construction' && col.period === 'operation') return false;
      if (cell.scope === 'operation' && col.period === 'construction') return false;
    }
    if (cell.computeMode === ComputeMode.Formula || cell.computeMode === ComputeMode.Title) return false;
    return true;
  };

  const handleCellEdit = (cell: CellDefinition, col: TimelineColumn, rawValue: string) => {
    if (cell.scope && cell.scope !== 'both') {
      if (cell.scope === 'construction' && col.period === 'operation') return;
      if (cell.scope === 'operation' && col.period === 'construction') return;
    }
    if (cell.computeMode === ComputeMode.Formula || cell.computeMode === ComputeMode.Title) return;
    const arr = Array.isArray(cell.defaultValue) ? [...cell.defaultValue] : [];
    const numVal = rawValue === '' ? undefined : Number(rawValue);
    while (arr.length <= col.index) arr.push(undefined as any);
    arr[col.index] = numVal as any;
    while (arr.length > 0 && arr[arr.length - 1] === undefined) arr.pop();
    updateCell(cell.id, { defaultValue: arr });
  };

  const handleDragStart = useCallback(
    (e: React.MouseEvent, colIndex: number) => {
      e.preventDefault();
      dragState.current = {
        colIndex,
        startX: e.clientX,
        startWidth: colWidths[colIndex],
      };

      const handleMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const delta = ev.clientX - dragState.current.startX;
        const newWidth = Math.max(40, dragState.current.startWidth + delta);
        setColWidths((prev) => {
          const next = [...prev];
          next[dragState.current!.colIndex] = newWidth;
          return next;
        });
      };

      const handleUp = () => {
        dragState.current = null;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };

      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [colWidths]
  );

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

  const fixedCellStyle = (left: number, _width: number): React.CSSProperties => ({
    position: 'sticky',
    left,
    zIndex: 1,
    background: theme.bgPrimary,
    borderBottom: `1px solid ${theme.borderSecondary}`,
    borderRight: `1px solid ${theme.borderPrimary}`,
    padding: '4px 8px',
    fontSize: 12,
  });

  const si = showIdColumn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: theme.textSecondary }}>
          共 {tableCells.length} 个指标，{columns.length} 个时间列
          {hasResults ? ' · 已计算' : ''}
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
        ref={tableRef}
        style={{
          flex: 1,
          overflow: 'auto',
          border: `1px solid ${theme.borderPrimary}`,
          borderRadius: 4,
          position: 'relative',
        }}
      >
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={fixedHeaderStyle(colLeft(si, 'code'), CODE_COL_WIDTH)}>
                编码
              </th>
              {si && (
                <th style={fixedHeaderStyle(colLeft(si, 'id'), ID_COL_WIDTH)}>
                  ID
                </th>
              )}
              <th style={fixedHeaderStyle(colLeft(si, 'name'), NAME_COL_WIDTH)}>
                名称
              </th>
              <th style={fixedHeaderStyle(colLeft(si, 'action'), ACTION_COL_WIDTH)}>
                操作
              </th>
              <th style={fixedHeaderStyle(colLeft(si, 'type'), TYPE_COL_WIDTH)}>
                计算方式
              </th>
              <th style={fixedHeaderStyle(colLeft(si, 'unit'), UNIT_COL_WIDTH)}>
                单位
              </th>
              <th style={fixedHeaderStyle(colLeft(si, 'formula'), FORMULA_COL_WIDTH)}>
                公式
              </th>
              <th style={fixedHeaderStyle(colLeft(si, 'scope'), SCOPE_COL_WIDTH)}>
                作用区间
              </th>
              <th style={fixedHeaderStyle(colLeft(si, 'summary'), SUMMARY_COL_WIDTH)}>
                合计
              </th>

              {columns.map((col, idx) => (
                <th
                  key={col.index}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: col.period === 'construction' ? theme.bgConstructionHeader : theme.bgPrimary,
                    borderBottom: `2px solid ${theme.borderPrimary}`,
                    borderRight: `1px solid ${theme.borderSecondary}`,
                    padding: '6px 4px',
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: 'center',
                    width: colWidths[idx],
                    minWidth: colWidths[idx],
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <div style={{ position: 'relative', height: '100%' }}>
                    {col.label}
                    <div
                      onMouseDown={(e) => handleDragStart(e, idx)}
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: 4,
                        cursor: 'col-resize',
                        background: 'transparent',
                      }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayCells.map((cell) => (
              <tr key={cell.id}>
                <td style={fixedCellStyle(colLeft(si, 'code'), CODE_COL_WIDTH)}>
                  {hasChildren(cell.id) ? (
                    <span
                      onClick={() => toggleCollapse(cell.code!)}
                      style={{ cursor: 'pointer', marginRight: 4, userSelect: 'none' }}
                    >
                      {isCollapsed(cell.code!) ? '▶' : '▼'}
                    </span>
                  ) : (
                    <span style={{ marginRight: 4, display: 'inline-block', width: 12 }} />
                  )}
                  {cell.code || '-'}
                </td>

                {si && (
                  <td style={{
                    ...fixedCellStyle(colLeft(si, 'id'), ID_COL_WIDTH),
                    fontSize: 10,
                    color: theme.textTertiary,
                    fontFamily: 'monospace',
                  }}>
                    {cell.id}
                  </td>
                )}

                <td
                  style={{
                    ...fixedCellStyle(colLeft(si, 'name'), NAME_COL_WIDTH),
                    paddingLeft: `${8 + (codeDepth(cell.code) - 1) * 16}px`,
                  }}
                >
                  <input
                    value={cell.name}
                    onChange={(e) => updateCell(cell.id, { name: e.target.value })}
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

                <td style={{ ...fixedCellStyle(colLeft(si, 'action'), ACTION_COL_WIDTH), display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                  <button
                    onClick={() => indentCell(cell.id)}
                    title="缩进 (设为子级)"
                    style={{ width: 18, height: 20, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                  >
                    →
                  </button>
                  <button
                    onClick={() => outdentCell(cell.id)}
                    title="反缩进 (提升)"
                    style={{ width: 18, height: 20, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                  >
                    ←
                  </button>
                  <button
                    onClick={() => moveUpCell(cell.id)}
                    title="上移"
                    style={{ width: 18, height: 20, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveDownCell(cell.id)}
                    title="下移"
                    style={{ width: 18, height: 20, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => insertCellAt(cell.id)}
                    title="下方插入"
                    style={{ width: 18, height: 20, color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                  >
                    +
                  </button>
                  <button
                    onClick={cell.computeMode === ComputeMode.Title ? undefined : (e) => setFloatingToolbar({ cellId: cell.id, x: e.clientX, y: e.clientY })}
                    title={`精度: ${cell.precision ?? 2} 位`}
                    disabled={cell.computeMode === ComputeMode.Title}
                    style={{ width: 24, height: 20, color: cell.computeMode === ComputeMode.Title ? theme.textTertiary : theme.textSecondary, background: 'none', border: 'none', cursor: cell.computeMode === ComputeMode.Title ? 'default' : 'pointer', fontSize: 10, fontFamily: 'monospace', padding: 0 }}
                  >
                    {cell.precision ?? 2}d
                  </button>
                  <button
                    onClick={() => removeCell(cell.id)}
                    title="删除"
                    style={{ width: 18, height: 20, color: theme.error, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}
                  >
                    ×
                  </button>
                </td>

                <td style={fixedCellStyle(colLeft(si, 'type'), TYPE_COL_WIDTH)}>
                  <select
                    value={cell.computeMode}
                    onChange={(e) => updateCell(cell.id, { computeMode: e.target.value as ComputeMode })}
                    style={{ border: 'none', background: 'transparent', fontSize: 12, padding: 0, color: theme.textPrimary }}
                  >
                    {[ComputeMode.Title, ComputeMode.Input, ComputeMode.Formula].map((t) => (
                      <option key={t} value={t}>
                        {computeModeLabel(t)}
                      </option>
                    ))}
                  </select>
                </td>

                <td style={fixedCellStyle(colLeft(si, 'unit'), UNIT_COL_WIDTH)}>
                  <input
                    value={cell.unit || ''}
                    onChange={(e) => updateCell(cell.id, { unit: e.target.value })}
                    readOnly={cell.computeMode === ComputeMode.Title}
                    style={{
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      fontSize: 12,
                      padding: 0,
                      color: cell.computeMode === ComputeMode.Title ? theme.textTertiary : theme.textPrimary,
                    }}
                  />
                </td>

                <td style={fixedCellStyle(colLeft(si, 'formula'), FORMULA_COL_WIDTH)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    {cell.computeMode === ComputeMode.Formula ? (
                      <FormulaEditor
                        value={cell.formula}
                        onChange={(v) => updateCell(cell.id, { formula: v })}
                        model={model}
                        currentCellId={cell.id}
                        mode="compact"
                        onFocus={() => setEditingFormulaCellId(cell.id)}
                      />
                    ) : (
                      <span style={{ color: theme.textPlaceholder }}>−</span>
                    )}
                  </div>
                </td>

                {editingFormulaCellId && (() => {
                  const editingCell = model.cells.find(c => c.id === editingFormulaCellId);
                  if (!editingCell) return null;
                  return (
                    <FormulaEditModal
                      cellName={editingCell.name}
                      cellCode={editingCell.code || ''}
                      cellId={editingCell.id}
                      initialFormula={editingCell.formula}
                      model={model}
                      onSave={(formula) => updateCell(editingCell.id, { formula })}
                      onClose={() => setEditingFormulaCellId(null)}
                    />
                  );
                })()}

                <td style={fixedCellStyle(colLeft(si, 'scope'), SCOPE_COL_WIDTH)}>
                  {cell.computeMode === ComputeMode.Formula ? (
                    <select
                      value={cell.scope ?? 'both'}
                      onChange={(e) => updateCell(cell.id, { scope: e.target.value as CellDefinition['scope'] })}
                      style={{ border: 'none', background: 'transparent', fontSize: 11, padding: 0, width: '100%', color: theme.textPrimary }}
                    >
                      <option value="both">全部</option>
                      <option value="construction">建设</option>
                      <option value="operation">运营</option>
                    </select>
                  ) : (
                    <span style={{ color: theme.textPlaceholder }}>-</span>
                  )}
                </td>

                <td style={{
                  ...fixedCellStyle(colLeft(si, 'summary'), SUMMARY_COL_WIDTH),
                  textAlign: 'right',
                  fontWeight: 600,
                  color: theme.accent,
                }}>
                  {(() => {
                    const sum = computeRowSummary(cell, columns, resultMap, refErrorMap);
                    return sum !== null ? formatNumber(sum, cell.precision, cell.valueType, cell.useGrouping) : '';
                  })()}
                </td>

                {columns.map((col, idx) => {
                  const isEditing =
                    editingCell?.cellId === cell.id && editingCell?.colIndex === col.index;
                  const displayValue = getCellDisplayValue(cell, col, 'timeline');
                  const canEdit = isCellEditable(cell, col);
                  const isError = refErrorMap.has(`${cell.id}:${col.index}`);

                  return (
                    <td
                      key={col.index}
                      style={{
                        background: col.period === 'construction' ? theme.bgConstruction : theme.bgPrimary,
                        borderBottom: `1px solid ${theme.borderSecondary}`,
                        borderRight: `1px solid ${theme.borderSecondary}`,
                        padding: '4px',
                        fontSize: 12,
                        textAlign: 'right',
                        width: colWidths[idx],
                        minWidth: colWidths[idx],
                        overflow: 'hidden',
                      }}
                      onClick={() => {
                        if (canEdit) {
                          setEditingCell({
                            cellId: cell.id,
                            colIndex: col.index,
                            value: displayValue,
                          });
                        }
                      }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editingCell.value}
                          onChange={(e) =>
                            setEditingCell({ ...editingCell, value: e.target.value })
                          }
                          onBlur={() => {
                            handleCellEdit(cell, col, editingCell.value);
                            setEditingCell(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleCellEdit(cell, col, editingCell.value);
                              setEditingCell(null);
                            }
                            if (e.key === 'Escape') {
                              setEditingCell(null);
                            }
                          }}
                          style={{
                            width: '100%',
                            border: `1px solid ${theme.inputFocusBorder}`,
                            padding: '2px 4px',
                            fontSize: 12,
                            textAlign: 'right',
                            outline: 'none',
                            background: theme.bgPrimary,
                            color: theme.textPrimary,
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            color: isError
                              ? theme.errorDeep
                              : cell.computeMode === ComputeMode.Formula
                                ? theme.textSecondary
                                : theme.textPrimary,
                            fontWeight: isError || cell.computeMode === ComputeMode.Formula ? 600 : 'normal',
                            cursor: canEdit ? 'text' : 'default',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={isError ? '引用了已删除的指标' : displayValue}
                        >
                          {displayValue}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {displayCells.length === 0 && (
              <tr>
                <td
                  colSpan={fixedColsCount(si) + columns.length}
                  style={{
                    padding: 32,
                    textAlign: 'center',
                    color: theme.textPlaceholder,
                    fontSize: 14,
                  }}
                >
                  当前表暂无指标，点击行内"+"按钮或新建表开始编辑
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {floatingToolbar && (() => {
        const cell = cellsWithCodes.find((c) => c.id === floatingToolbar.cellId);
        if (!cell) return null;
        return (
          <FloatingToolbar
            x={floatingToolbar.x}
            y={floatingToolbar.y}
            currentPrecision={cell.precision ?? 2}
            currentValueType={(cell.valueType as 'number' | 'percentage') ?? 'number'}
            currentUseGrouping={cell.useGrouping}
            onSelect={(p) => updateCell(floatingToolbar.cellId, { precision: p === 2 ? undefined : p })}
            onValueTypeChange={(t) => updateCell(floatingToolbar.cellId, { valueType: t })}
            onUseGroupingChange={(v) => updateCell(floatingToolbar.cellId, { useGrouping: v })}
            onClose={() => setFloatingToolbar(null)}
          />
        );
      })()}
    </div>
  );
};

function compareCode(a: string, b: string): number {
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  const minLen = Math.min(ap.length, bp.length);
  for (let i = 0; i < minLen; i++) {
    if (ap[i] !== bp[i]) return ap[i] - bp[i];
  }
  return ap.length - bp.length;
}

function computeRowSummary(
  cell: CellDefinition,
  columns: TimelineColumn[],
  resultMap: Map<string, number | null>,
  refErrorMap: Set<string>,
): number | null {
  if (cell.computeMode === ComputeMode.Title) return null;
  let sum = 0;
  let hasValue = false;
  for (const col of columns) {
    if (cell.computeMode === ComputeMode.Formula) {
      if (refErrorMap.has(`${cell.id}:${col.index}`)) continue;
      const v = resultMap.get(`${cell.id}:${col.index}`);
      if (v !== undefined && v !== null) {
        sum += v;
        hasValue = true;
      }
    } else {
      const arr = Array.isArray(cell.defaultValue) ? cell.defaultValue : [];
      const v = arr[col.index];
      if (v !== undefined && v !== null && v !== '') {
        const num = Number(v);
        if (!isNaN(num)) {
          sum += num;
          hasValue = true;
        }
      }
    }
  }
  return hasValue ? sum : null;
}

function computeModeLabel(m: ComputeMode): string {
  return { [ComputeMode.Title]: '−', [ComputeMode.Input]: '输入', [ComputeMode.Formula]: '公式' }[m] ?? m;
}


