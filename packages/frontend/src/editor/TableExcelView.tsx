import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ModelDefinition, CellDefinition, CellType, recomputeCodes, getCodeDepth, formulaIdToDisplay } from '@economic/core';
import { generateTimelineColumns, TimelineColumn } from '../utils/timelineColumns.js';
import { FormulaEditor } from '../components/FormulaEditor.js';
import { FormulaEditModal } from '../components/FormulaEditModal.js';
import { formatNumber } from '../utils/formatNumber.js';

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
const ACTION_COL_WIDTH = 120;
const TYPE_COL_WIDTH = 80;
const UNIT_COL_WIDTH = 60;
const FORMULA_COL_WIDTH = 80;
const SCOPE_COL_WIDTH = 80;

function colLeft(showId: boolean, col: 'code' | 'id' | 'name' | 'action' | 'type' | 'unit' | 'formula' | 'scope'): number {
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
  }
}

function fixedColsCount(showId: boolean): number {
  return showId ? 8 : 7;
}

export const TableExcelView: React.FC<TableExcelViewProps> = ({
  model,
  activeTableId,
  computeResult,
  onCellsChange,
}) => {
  const tableCells = model.cells.filter((c) => c.tableId === activeTableId);
  const columns = generateTimelineColumns(model.timeline);

  const [collapsedCodes, setCollapsedCodes] = useState<Set<string>>(new Set());
  const [editingFormulaCellId, setEditingFormulaCellId] = useState<string | null>(null);
  const [showIdColumn, setShowIdColumn] = useState(false);
  const [precisionCellId, setPrecisionCellId] = useState<string | null>(null);

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
    updatedTableCells.sort((a, b) => compareCode(a.code || '', b.code || ''));
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
    const idx = tableRows.findIndex((c) => c.id === cellId);
    if (idx <= 0) return;

    const prev = tableRows[idx - 1];
    const target = tableRows[idx];
    const targetSiblings = tableRows.filter((c) => c.parentId === target.parentId);
    const prevIndexInSiblings = targetSiblings.findIndex((c) => c.id === prev.id);
    if (prevIndexInSiblings === -1) return;

    const prevOriginalSo = prev.sortOrder ?? 0;
    const targetOriginalSo = target.sortOrder ?? 0;
    const newSo = prevOriginalSo;
    const newSoPrev = targetOriginalSo;

    const prevDesc = getDescendants(buildFamilies(), prev.id);
    const targetDesc = getDescendants(buildFamilies(), target.id);

    const updatedRows = tableRows.map((c) => {
      if (c.id === target.id || targetDesc.includes(c.id)) {
        return { ...c, sortOrder: newSo + (c.sortOrder ?? 0) - targetOriginalSo };
      }
      if (c.id === prev.id || prevDesc.includes(c.id)) {
        return { ...c, sortOrder: newSoPrev + (c.sortOrder ?? 0) - prevOriginalSo };
      }
      return c;
    });

    onCellsChange([...otherRows, ...updatedRows]);
  };

  const moveDownCell = (cellId: string) => {
    const tableRows = [...cellsWithCodes.filter((c) => c.tableId === activeTableId)];
    const otherRows = cellsWithCodes.filter((c) => c.tableId !== activeTableId);
    const idx = tableRows.findIndex((c) => c.id === cellId);
    if (idx < 0 || idx >= tableRows.length - 1) return;

    const next = tableRows[idx + 1];
    const target = tableRows[idx];
    const targetSiblings = tableRows.filter((c) => c.parentId === target.parentId);
    const nextIndexInSiblings = targetSiblings.findIndex((c) => c.id === next.id);
    if (nextIndexInSiblings === -1) return;

    const nextOriginalSo = next.sortOrder ?? 0;
    const targetOriginalSo = target.sortOrder ?? 0;
    const newSo = nextOriginalSo;
    const newSoNext = targetOriginalSo;

    const nextDesc = getDescendants(buildFamilies(), next.id);
    const targetDesc = getDescendants(buildFamilies(), target.id);

    const updatedRows = tableRows.map((c) => {
      if (c.id === target.id || targetDesc.includes(c.id)) {
        return { ...c, sortOrder: newSo + (c.sortOrder ?? 0) - targetOriginalSo };
      }
      if (c.id === next.id || nextDesc.includes(c.id)) {
        return { ...c, sortOrder: newSoNext + (c.sortOrder ?? 0) - nextOriginalSo };
      }
      return c;
    });

    onCellsChange([...otherRows, ...updatedRows]);
  };

  const insertCellAt = (cellId: string) => {
    const tableRows = [...cellsWithCodes.filter((c) => c.tableId === activeTableId)];
    const otherRows = cellsWithCodes.filter((c) => c.tableId !== activeTableId);

    const target = tableRows.find((c) => c.id === cellId);
    if (!target) return;
    const parentId = target.parentId;
    const siblings = tableRows.filter((c) => c.parentId === parentId);
    const targetIdx = siblings.findIndex((c) => c.id === cellId);

    const targetSo = target.sortOrder ?? 0;
    const newSo = targetIdx < siblings.length - 1
      ? (targetSo + (siblings[targetIdx + 1].sortOrder ?? targetSo + 1)) / 2
      : targetSo + 1;

    const targetDesc = getDescendants(buildFamilies(), target.id);
    const refSo = targetDesc.length > 0
      ? Math.max(...targetDesc.map((id) => (tableRows.find((c) => c.id === id)?.sortOrder ?? -Infinity)))
      : targetSo;

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
      type: CellType.Input,
      isArray: true,
      unit: '',
      sortOrder: newSo,
      parentId,
    };

    const updatedRows = [...tableRows];
    const insertIdx = updatedRows.findIndex((c) => c.id === cellId) + targetDesc.length + 1;
    updatedRows.splice(insertIdx, 0, newCell);

    onCellsChange([...otherRows, ...updatedRows]);
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
    onCellsChange([...otherRows, ...updatedRows]);
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
    onCellsChange([...otherRows, ...updatedRows]);
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
    if (cell.scope && cell.scope !== 'both') {
      if (cell.scope === 'construction' && col.period === 'operation') return '';
      if (cell.scope === 'operation' && col.period === 'construction') return '';
    }

    if (cell.type === CellType.Formula || cell.type === CellType.Script) {
      if (colContext === 'formula-column') {
        return formulaIdToDisplay(cell.formula, model);
      }
      if (colContext === 'timeline') {
        if (refErrorMap.has(`${cell.id}:${col.index}`)) return '#REF!';
        const resultVal = resultMap.get(`${cell.id}:${col.index}`);
        if (resultVal !== undefined && resultVal !== null) {
          return formatNumber(resultVal, cell.precision);
        }
        return '';
      }
    }

    if (cell.type === CellType.Input) {
      const arr = Array.isArray(cell.defaultValue) ? cell.defaultValue : [];
      const val = arr[col.index] ?? '';
      if (val !== undefined && val !== null && val !== '') {
        const numVal = Number(val);
        if (!isNaN(numVal) && val !== '') {
          return formatNumber(numVal, cell.precision);
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
    if (cell.type === CellType.Formula || cell.type === CellType.Script) return false;
    return true;
  };

  const handleCellEdit = (cell: CellDefinition, col: TimelineColumn, rawValue: string) => {
    if (cell.scope && cell.scope !== 'both') {
      if (cell.scope === 'construction' && col.period === 'operation') return;
      if (cell.scope === 'operation' && col.period === 'construction') return;
    }
    if (cell.type === CellType.Formula || cell.type === CellType.Script) return;
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
    background: '#fafafa',
    borderBottom: '2px solid #ddd',
    borderRight: '1px solid #ddd',
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
    background: '#fff',
    borderBottom: '1px solid #eee',
    borderRight: '1px solid #ddd',
    padding: '4px 8px',
    fontSize: 12,
  });

  const si = showIdColumn;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#666' }}>
          共 {tableCells.length} 个指标，{columns.length} 个时间列
          {hasResults ? ' · 已计算' : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={() => setShowIdColumn(!showIdColumn)}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              border: '1px solid #ddd',
              background: showIdColumn ? '#1976d2' : '#fff',
              color: showIdColumn ? '#fff' : '#666',
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
          border: '1px solid #ddd',
          borderRadius: 4,
          position: 'relative',
        }}
      >
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {/* 1. Code */}
              <th style={fixedHeaderStyle(colLeft(si, 'code'), CODE_COL_WIDTH)}>
                编码
              </th>
              {/* 2. ID (conditional) */}
              {si && (
                <th style={fixedHeaderStyle(colLeft(si, 'id'), ID_COL_WIDTH)}>
                  ID
                </th>
              )}
              {/* 3. Name */}
              <th style={fixedHeaderStyle(colLeft(si, 'name'), NAME_COL_WIDTH)}>
                名称
              </th>
              {/* 4. Actions */}
              <th style={fixedHeaderStyle(colLeft(si, 'action'), ACTION_COL_WIDTH)}>
                操作
              </th>
              {/* 5. Type */}
              <th style={fixedHeaderStyle(colLeft(si, 'type'), TYPE_COL_WIDTH)}>
                类型
              </th>
              {/* 6. Unit */}
              <th style={fixedHeaderStyle(colLeft(si, 'unit'), UNIT_COL_WIDTH)}>
                单位
              </th>
              {/* 7. Formula */}
              <th style={fixedHeaderStyle(colLeft(si, 'formula'), FORMULA_COL_WIDTH)}>
                公式
              </th>
              {/* 8. Scope */}
              <th style={fixedHeaderStyle(colLeft(si, 'scope'), SCOPE_COL_WIDTH)}>
                作用区间
              </th>

              {/* Timeline columns */}
              {columns.map((col, idx) => (
                <th
                  key={col.index}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: col.period === 'construction' ? '#e3f2fd' : '#fff',
                    borderBottom: '2px solid #ddd',
                    borderRight: '1px solid #eee',
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
                {/* 1. Code */}
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

                {/* 2. ID (conditional) */}
                {si && (
                  <td style={{
                    ...fixedCellStyle(colLeft(si, 'id'), ID_COL_WIDTH),
                    fontSize: 10,
                    color: '#888',
                    fontFamily: 'monospace',
                  }}>
                    {cell.id}
                  </td>
                )}

                {/* 3. Name with indent */}
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
                    }}
                  />
                </td>

                {/* 4. Actions */}
                <td style={fixedCellStyle(colLeft(si, 'action'), ACTION_COL_WIDTH)}>
                  <button
                    onClick={() => indentCell(cell.id)}
                    title="缩进 (设为子级)"
                    style={{
                      color: '#1976d2',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      marginRight: 2,
                    }}
                  >
                    →
                  </button>
                  <button
                    onClick={() => outdentCell(cell.id)}
                    title="反缩进 (提升)"
                    style={{
                      color: '#1976d2',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      marginRight: 2,
                    }}
                  >
                    ←
                  </button>
                  <button
                    onClick={() => insertCellAt(cell.id)}
                    title="插入同行"
                    style={{
                      color: '#1976d2',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      marginRight: 2,
                    }}
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeCell(cell.id)}
                    title="删除"
                    style={{
                      color: '#c62828',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    ×
                  </button>
                </td>

                {/* 5. Type */}
                <td style={fixedCellStyle(colLeft(si, 'type'), TYPE_COL_WIDTH)}>
                  <select
                    value={cell.type}
                    onChange={(e) => updateCell(cell.id, { type: e.target.value as CellType })}
                    style={{ border: 'none', background: 'transparent', fontSize: 12, padding: 0 }}
                  >
                    {Object.values(CellType).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>

                {/* 6. Unit */}
                <td style={fixedCellStyle(colLeft(si, 'unit'), UNIT_COL_WIDTH)}>
                  <input
                    value={cell.unit || ''}
                    onChange={(e) => updateCell(cell.id, { unit: e.target.value })}
                    style={{
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      fontSize: 12,
                      padding: 0,
                    }}
                  />
                </td>

                {/* 7. Formula */}
                <td style={fixedCellStyle(colLeft(si, 'formula'), FORMULA_COL_WIDTH)}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    {cell.type === CellType.Formula || cell.type === CellType.Script ? (
                      <FormulaEditor
                        value={cell.formula}
                        onChange={(v) => updateCell(cell.id, { formula: v })}
                        model={model}
                        currentCellId={cell.id}
                        mode="compact"
                        onFocus={() => setEditingFormulaCellId(cell.id)}
                      />
                    ) : (
                      <span style={{ color: '#999' }}>−</span>
                    )}
                  </div>
                </td>

                {/* Modal for editing formulas */}
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

                {/* 8. Scope */}
                <td style={fixedCellStyle(colLeft(si, 'scope'), SCOPE_COL_WIDTH)}>
                  {cell.type === CellType.Formula || cell.type === CellType.Script ? (
                    <select
                      value={cell.scope ?? 'both'}
                      onChange={(e) => updateCell(cell.id, { scope: e.target.value as CellDefinition['scope'] })}
                      style={{ border: 'none', background: 'transparent', fontSize: 11, padding: 0, width: '100%' }}
                    >
                      <option value="both">全部</option>
                      <option value="construction">建设</option>
                      <option value="operation">运营</option>
                    </select>
                  ) : (
                    <span style={{ color: '#999' }}>-</span>
                  )}
                </td>

                {/* Timeline cells */}
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
                        background: col.period === 'construction' ? '#f5f9ff' : '#fff',
                        borderBottom: '1px solid #eee',
                        borderRight: '1px solid #eee',
                        padding: '4px',
                        fontSize: 12,
                        textAlign: 'right',
                        width: colWidths[idx],
                        minWidth: colWidths[idx],
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
                            border: '1px solid #1976d2',
                            padding: '2px 4px',
                            fontSize: 12,
                            textAlign: 'right',
                            outline: 'none',
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            color: isError
                              ? '#d32f2f'
                              : cell.type === CellType.Formula || cell.type === CellType.Script
                                ? '#666'
                                : '#333',
                            fontStyle: isError
                              ? 'normal'
                              : cell.type === CellType.Formula || cell.type === CellType.Script
                                ? 'italic'
                                : 'normal',
                            fontWeight: isError ? 600 : 'normal',
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
                    color: '#999',
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
