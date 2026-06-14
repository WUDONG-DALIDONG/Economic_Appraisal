import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ModelDefinition, CellDefinition, CellType } from '@economic/core';
import { generateTimelineColumns, TimelineColumn } from '../utils/timelineColumns.js';
import { FormulaEditor } from '../components/FormulaEditor.js';

interface TableExcelViewProps {
  model: ModelDefinition;
  activeTableId: string;
  computeResult: { results: Array<{ cellId: string; timeIndex: number; value: number | null }> } | null;
  onCellsChange: (cells: CellDefinition[]) => void;
}

type ViewMode = 'formula' | 'value';

const DEFAULT_COL_WIDTH = 100;
const FIXED_COL_WIDTH = 120;

export const TableExcelView: React.FC<TableExcelViewProps> = ({
  model,
  activeTableId,
  computeResult,
  onCellsChange,
}) => {
  const cells = model.cells.filter((c) => c.tableId === activeTableId);
  const columns = generateTimelineColumns(model.timeline);

  const [viewMode, setViewMode] = useState<ViewMode>('formula');

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

  const updateCell = (cellId: string, updates: Partial<CellDefinition>) => {
    const next = model.cells.map((c) =>
      c.id === cellId ? { ...c, ...updates } : c
    );
    onCellsChange(next);
  };

  const addCell = () => {
    const newCell: CellDefinition = {
      id: `cell-${Date.now()}`,
      name: '新指标',
      tableId: activeTableId,
      formula: '',
      type: CellType.Input,
      isArray: true,
      unit: '',
    };
    onCellsChange([...model.cells, newCell]);
  };

  const removeCell = (cellId: string) => {
    onCellsChange(model.cells.filter((c) => c.id !== cellId));
  };

  const getCellDisplayValue = (cell: CellDefinition, col: TimelineColumn): string => {
    // Check scope: if cell.scope constrains the column period, show blank
    if (cell.scope && cell.scope !== 'both') {
      if (cell.scope === 'construction' && col.period === 'operation') return '';
      if (cell.scope === 'operation' && col.period === 'construction') return '';
    }

    // In value view, try to show computed result from API
    if (viewMode === 'value') {
      const resultVal = resultMap.get(`${cell.id}:${col.index}`);
      if (resultVal !== undefined) {
        return resultVal === null ? '' : String(resultVal);
      }
      // Fallback: Input type default values
      if (cell.type === CellType.Input) {
        const arr = Array.isArray(cell.defaultValue) ? cell.defaultValue : [];
        const val = arr[col.index] ?? '';
        return String(val);
      }
      return '';
    }

    // Formula view (default)
    if (cell.type === CellType.Formula || cell.type === CellType.Script) {
      return cell.formula || '';
    }
    // Input type: always treat as array across timeline columns
    const arr = Array.isArray(cell.defaultValue) ? cell.defaultValue : [];
    const val = arr[col.index] ?? '';
    return String(val);
  };

  const isCellEditable = (cell: CellDefinition, _col: TimelineColumn): boolean => {
    if (cell.type === CellType.Formula || cell.type === CellType.Script) return false;
    // Input type: all columns editable (auto-array across timeline)
    return true;
  };

  const handleCellEdit = (cell: CellDefinition, col: TimelineColumn, rawValue: string) => {
    if (cell.type === CellType.Formula || cell.type === CellType.Script) return;

    // For Input type: always save as array across timeline columns
    const arr = Array.isArray(cell.defaultValue) ? [...cell.defaultValue] : [];
    const numVal = rawValue === '' ? undefined : Number(rawValue);
    // Ensure array length
    while (arr.length <= col.index) arr.push(undefined as any);
    arr[col.index] = numVal as any;
    // Trim trailing undefineds
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={addCell} style={{ padding: '4px 12px', fontSize: 13 }}>
          + 添加指标
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>
          共 {cells.length} 个指标，{columns.length} 个时间列
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
              {/* Fixed columns header */}
              <th
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  background: '#fafafa',
                  borderBottom: '2px solid #ddd',
                  borderRight: '1px solid #ddd',
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  width: FIXED_COL_WIDTH,
                  minWidth: FIXED_COL_WIDTH,
                }}
              >
                名称
              </th>
              <th
                style={{
                  position: 'sticky',
                  left: FIXED_COL_WIDTH,
                  zIndex: 3,
                  background: '#fafafa',
                  borderBottom: '2px solid #ddd',
                  borderRight: '1px solid #ddd',
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  width: 80,
                  minWidth: 80,
                }}
              >
                类型
              </th>
              <th
                style={{
                  position: 'sticky',
                  left: FIXED_COL_WIDTH + 80,
                  zIndex: 3,
                  background: '#fafafa',
                  borderBottom: '2px solid #ddd',
                  borderRight: '1px solid #ddd',
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  width: 60,
                  minWidth: 60,
                }}
              >
                单位
              </th>
              <th
                style={{
                  position: 'sticky',
                  left: FIXED_COL_WIDTH + 140,
                  zIndex: 3,
                  background: '#fafafa',
                  borderBottom: '2px solid #ddd',
                  borderRight: '1px solid #ddd',
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  width: 200,
                  minWidth: 200,
                }}
              >
                公式
              </th>
              <th
                style={{
                  position: 'sticky',
                  left: FIXED_COL_WIDTH + 340,
                  zIndex: 3,
                  background: '#fafafa',
                  borderBottom: '2px solid #ddd',
                  borderRight: '1px solid #ddd',
                  padding: '6px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  width: 80,
                  minWidth: 80,
                }}
              >
                作用区间
              </th>

              {/* Timeline columns header */}
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
                    {/* Drag handle */}
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
            {cells.map((cell) => (
              <tr key={cell.id}>
                {/* Fixed: Name */}
                <td
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    background: '#fff',
                    borderBottom: '1px solid #eee',
                    borderRight: '1px solid #ddd',
                    padding: '4px 8px',
                    fontSize: 12,
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
                {/* Fixed: Type */}
                <td
                  style={{
                    position: 'sticky',
                    left: FIXED_COL_WIDTH,
                    zIndex: 1,
                    background: '#fff',
                    borderBottom: '1px solid #eee',
                    borderRight: '1px solid #ddd',
                    padding: '4px 8px',
                    fontSize: 12,
                  }}
                >
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
                {/* Fixed: Unit */}
                <td
                  style={{
                    position: 'sticky',
                    left: FIXED_COL_WIDTH + 80,
                    zIndex: 1,
                    background: '#fff',
                    borderBottom: '1px solid #eee',
                    borderRight: '1px solid #ddd',
                    padding: '4px 8px',
                    fontSize: 12,
                  }}
                >
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
                {/* Fixed: Formula */}
                <td
                  style={{
                    position: 'sticky',
                    left: FIXED_COL_WIDTH + 140,
                    zIndex: 1,
                    background: '#fff',
                    borderBottom: '1px solid #eee',
                    borderRight: '1px solid #ddd',
                    padding: '4px 8px',
                    fontSize: 12,
                    minWidth: 200,
                  }}
                >
                  {cell.type === CellType.Formula || cell.type === CellType.Script ? (
                    <FormulaEditor
                      value={cell.formula}
                      onChange={(v) => updateCell(cell.id, { formula: v })}
                      model={model}
                      currentCellId={cell.id}
                    />
                  ) : (
                    <span style={{ color: '#999' }}>-</span>
                  )}
                </td>
                {/* Fixed: Scope */}
                <td
                  style={{
                    position: 'sticky',
                    left: FIXED_COL_WIDTH + 340,
                    zIndex: 1,
                    background: '#fff',
                    borderBottom: '1px solid #eee',
                    borderRight: '1px solid #ddd',
                    padding: '4px 8px',
                    fontSize: 12,
                    width: 80,
                    minWidth: 80,
                  }}
                >
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

                {/* Timeline value cells */}
                {columns.map((col, idx) => {
                  const isEditing =
                    editingCell?.cellId === cell.id && editingCell?.colIndex === col.index;
                  const displayValue = getCellDisplayValue(cell, col);
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

                {/* Actions column */}
                <td
                  style={{
                    borderBottom: '1px solid #eee',
                    padding: '4px 8px',
                    fontSize: 12,
                    textAlign: 'center',
                  }}
                >
                  <button
                    onClick={() => removeCell(cell.id)}
                    style={{
                      color: '#c62828',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                    title="删除"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}

            {cells.length === 0 && (
              <tr>
                <td
                  colSpan={5 + columns.length + 1}
                  style={{
                    padding: 32,
                    textAlign: 'center',
                    color: '#999',
                    fontSize: 14,
                  }}
                >
                  当前表暂无指标，点击上方"+ 添加指标"开始编辑
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
