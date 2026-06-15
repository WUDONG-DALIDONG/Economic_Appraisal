import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ModelDefinition, CellDefinition, CellType, recomputeCodes, getCodeDepth, generateSummaryFormula } from '@economic/core';
import { generateTimelineColumns, TimelineColumn } from '../utils/timelineColumns.js';
import { FormulaEditor } from '../components/FormulaEditor.js';
import { FormulaEditModal } from '../components/FormulaEditModal.js';

interface TableExcelViewProps {
  model: ModelDefinition;
  activeTableId: string;
  computeResult: { results: Array<{ cellId: string; timeIndex: number; value: number | null }> } | null;
  onCellsChange: (cells: CellDefinition[]) => void;
}

type ViewMode = 'formula' | 'value';

const DEFAULT_COL_WIDTH = 100;

// Fixed column widths (left to right)
const CODE_COL_WIDTH = 80;
const NAME_COL_WIDTH = 120;
const ACTION_COL_WIDTH = 120;
const TYPE_COL_WIDTH = 80;
const UNIT_COL_WIDTH = 60;
const FORMULA_COL_WIDTH = 80;
const SCOPE_COL_WIDTH = 80;

// Sticky left positions
const CODE_LEFT = 0;
const NAME_LEFT = CODE_COL_WIDTH;
const ACTION_LEFT = NAME_LEFT + NAME_COL_WIDTH;
const TYPE_LEFT = ACTION_LEFT + ACTION_COL_WIDTH;
const UNIT_LEFT = TYPE_LEFT + TYPE_COL_WIDTH;
const FORMULA_LEFT = UNIT_LEFT + UNIT_COL_WIDTH;
const SCOPE_LEFT = FORMULA_LEFT + FORMULA_COL_WIDTH;

export const TableExcelView: React.FC<TableExcelViewProps> = ({
  model,
  activeTableId,
  computeResult,
  onCellsChange,
}) => {
  const tableCells = model.cells.filter((c) => c.tableId === activeTableId);
  const columns = generateTimelineColumns(model.timeline);

  const [viewMode, setViewMode] = useState<ViewMode>('formula');
  const [collapsedCodes, setCollapsedCodes] = useState<Set<string>>(new Set());
  const [editingFormulaCellId, setEditingFormulaCellId] = useState<string | null>(null);

  // Auto-switch to value view when a new compute result arrives
  useEffect(() => {
    if (computeResult && computeResult.results && computeResult.results.length > 0) {
      setViewMode('value');
    }
  }, [computeResult]);

  const resultMap = useMemo(() => {
    const map = new Map<string, number | null>();
    if (computeResult?.results) {
      for (const r of computeResult.results) {
        map.set(`${r.cellId}:${r.timeIndex}`, r.value);
      }
    }
    return map;
  }, [computeResult]);

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

  // Keep colWidths in sync when number of columns changes
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

  // Recompute codes for table cells and sort depth-first
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
    // Sort depth-first by code (numeric comparison at each level)
    updatedTableCells.sort((a, b) => compareCode(a.code || '', b.code || ''));
    return [...otherCells, ...updatedTableCells];
  }, [tableCells, activeTableId, model.cells]);

  // Visible cells: filter out children of collapsed parents
  const displayCells = useMemo(() => {
    const tableRows = cellsWithCodes.filter((c) => c.tableId === activeTableId);
    const visible: CellDefinition[] = [];
    for (const cell of tableRows) {
      if (!cell.code) {
        visible.push(cell);
        continue;
      }
      // Check if any ancestor is collapsed
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
    const next = cellsWithCodes.map((c) =>
      c.id === cellId ? { ...c, ...updates } : c
    );
    onCellsChange(next);
  };

  const removeCell = (cellId: string) => {
    const tableRows = cellsWithCodes.filter((c) => c.tableId === activeTableId);
    const otherRows = cellsWithCodes.filter((c) => c.tableId !== activeTableId);
    const fam = buildFamilies();
    const toRemove = getDescendants(fam, cellId);
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

    const newCell: CellDefinition = {
      id: `cell-${Date.now()}`,
      name: '新指标',
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

  const generateSummary = (cellId: string) => {
    const tableRows = cellsWithCodes.filter((c) => c.tableId === activeTableId);
    const target = tableRows.find((c) => c.id === cellId);
    if (!target || !target.code) return;

    const children = tableRows.filter(
      (c) => c.parentId === cellId && c.code && c.code.startsWith(target.code + '.')
    );
    if (children.length === 0) return;

    const childCodes = children.map((c) => c.code!);
    const formula = generateSummaryFormula(childCodes);
    updateCell(cellId, { formula, type: CellType.Formula });
  };

  // Build sibling family map
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

  // Get all descendants (recursive) of a cell
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

  /**
   * getCellDisplayValue: 获取单元格展示值
   * 关键修改: 公式只显示在公式列，时间列不重复显示公式文本
   */
  const getCellDisplayValue = (
    cell: CellDefinition,
    col: TimelineColumn,
    colContext: 'formula-column' | 'timeline'
  ): string => {
    // 作用区间过滤
    if (cell.scope && cell.scope !== 'both') {
      if (cell.scope === 'construction' && col.period === 'operation') return '';
      if (cell.scope === 'operation' && col.period === 'construction') return '';
    }

    // 如果是 Formula 类型，公式文本只在“公式”列显示，时间列永远空白
    if (cell.type === CellType.Formula || cell.type === CellType.Script) {
      if (colContext === 'formula-column') {
        return cell.formula || '';
      }
      // timeline 列: Formula 类型永远返回空（不重复显示公式文本）
      if (colContext === 'timeline') {
        // value 模式下尝试显示计算结果
        if (viewMode === 'value') {
          const resultVal = resultMap.get(`${cell.id}:${col.index}`);
          return resultVal !== undefined && resultVal !== null ? String(resultVal) : '';
        }
        return '';
      }
    }

    // Input 类型
    if (cell.type === CellType.Input) {
      const arr = Array.isArray(cell.defaultValue) ? cell.defaultValue : [];
      const val = arr[col.index] ?? '';
      return val !== undefined && val !== null ? String(val) : '';
    }

    return '';
  };

  const isCellEditable = (cell: CellDefinition, col: TimelineColumn): boolean => {
    // Scope check: non-scoped cells cannot be edited
    if (cell.scope && cell.scope !== 'both') {
      if (cell.scope === 'construction' && col.period === 'operation') return false;
      if (cell.scope === 'operation' && col.period === 'construction') return false;
    }
    if (cell.type === CellType.Formula || cell.type === CellType.Script) return false;
    return true;
  };

  const handleCellEdit = (cell: CellDefinition, col: TimelineColumn, rawValue: string) => {
    // Scope check: prevent editing outside the cell's scope
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

  // Drag handlers
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#666' }}>
          共 {tableCells.length} 个指标，{columns.length} 个时间列
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={() => setViewMode('formula')}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              border: '1px solid #ddd',
              background: viewMode === 'formula' ? '#1976d2' : '#fff',
              color: viewMode === 'formula' ? '#fff' : '#666',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            显示公式
          </button>
          <button
            onClick={() => setViewMode('value')}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              border: '1px solid #ddd',
              background: viewMode === 'value' ? '#1976d2' : '#fff',
              color: viewMode === 'value' ? '#fff' : '#666',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            显示计算值
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
              <th style={fixedHeaderStyle(CODE_LEFT, CODE_COL_WIDTH)}>
                编码
              </th>
              {/* 2. Name */}
              <th style={fixedHeaderStyle(NAME_LEFT, NAME_COL_WIDTH)}>
                名称
              </th>
              {/* 3. Actions (MOVED HERE) */}
              <th style={fixedHeaderStyle(ACTION_LEFT, ACTION_COL_WIDTH)}>
                操作
              </th>
              {/* 4. Type */}
              <th style={fixedHeaderStyle(TYPE_LEFT, TYPE_COL_WIDTH)}>
                类型
              </th>
              {/* 5. Unit */}
              <th style={fixedHeaderStyle(UNIT_LEFT, UNIT_COL_WIDTH)}>
                单位
              </th>
              {/* 6. Formula */}
              <th style={fixedHeaderStyle(FORMULA_LEFT, FORMULA_COL_WIDTH)}>
                公式
              </th>
              {/* 7. Scope */}
              <th style={fixedHeaderStyle(SCOPE_LEFT, SCOPE_COL_WIDTH)}>
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
                <td style={fixedCellStyle(CODE_LEFT, CODE_COL_WIDTH)}>
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

                {/* 2. Name with indent */}
                <td
                  style={{
                    ...fixedCellStyle(NAME_LEFT, NAME_COL_WIDTH),
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

                {/* 3. Actions */}
                <td style={fixedCellStyle(ACTION_LEFT, ACTION_COL_WIDTH)}>
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
                  {hasChildren(cell.id) && (
                    <button
                      onClick={() => generateSummary(cell.id)}
                      title="一键生成子级汇总公式"
                      style={{
                        color: '#2e7d32',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 13,
                        marginRight: 2,
                      }}
                    >
                      Σ
                    </button>
                  )}
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

                {/* 4. Type */}
                <td style={fixedCellStyle(TYPE_LEFT, TYPE_COL_WIDTH)}>
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

                {/* 5. Unit */}
                <td style={fixedCellStyle(UNIT_LEFT, UNIT_COL_WIDTH)}>
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

                {/* 6. Formula (compact badge + click to open modal) */}
                <td style={fixedCellStyle(FORMULA_LEFT, FORMULA_COL_WIDTH)}>
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

                {/* 7. Scope */}
                <td style={fixedCellStyle(SCOPE_LEFT, SCOPE_COL_WIDTH)}>
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

                {/* Timeline cells - Formula text NEVER shown here */}
                {columns.map((col, idx) => {
                  const isEditing =
                    editingCell?.cellId === cell.id && editingCell?.colIndex === col.index;
                  const displayValue = getCellDisplayValue(cell, col, 'timeline');
                  const canEdit = isCellEditable(cell, col);

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
                            color:
                              cell.type === CellType.Formula || cell.type === CellType.Script
                                ? '#666'
                                : '#333',
                            fontStyle:
                              cell.type === CellType.Formula || cell.type === CellType.Script
                                ? 'italic'
                                : 'normal',
                            cursor: canEdit ? 'text' : 'default',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={displayValue}
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
                  colSpan={7 + columns.length}
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
