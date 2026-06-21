import React, { useState, useRef, useEffect } from 'react';
import { TableDefinition, ComputeMode, ValueType, normalizeFullwidth } from '@economic/core';
import { useTheme } from '../ThemeContext.js';

interface TableNavigatorProps {
  tables: TableDefinition[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: (table: TableDefinition, defaultCell: { id: string; tableId: string; name: string; formula: string; computeMode: ComputeMode; valueType: ValueType; isArray: boolean; unit: string; sortOrder: number; parentId: null }) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onReorder: (tables: TableDefinition[]) => void;
}

export const TableNavigator: React.FC<TableNavigatorProps> = ({
  tables, activeId, onSelect, onAdd, onRename, onDelete, onReorder,
}) => {
  const { theme } = useTheme();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const startEditing = (id: string) => {
    setEditingId(id);
    setOpenMenuId(null);
  };

  const nextTableName = (): string => {
    let max = 0;
    for (const t of tables) {
      const m = t.name.match(/^新表(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `新表${max + 1}`;
  };

  const handleAdd = () => {
    const tableId = `table-${Date.now()}`;
    const name = nextTableName();
    const defaultCell = {
      id: `cell-${Date.now()}`,
      tableId,
      name: '新指标',
      formula: '',
      computeMode: ComputeMode.Input,
      valueType: ValueType.Number,
      isArray: true,
      unit: '',
      sortOrder: 0,
      parentId: null as null,
    };
    onAdd({ id: tableId, name, order: tables.length }, defaultCell);
    setTimeout(() => startEditing(tableId), 0);
  };

  const moveTableLeft = (id: string) => {
    const idx = tables.findIndex((t) => t.id === id);
    if (idx <= 0) return;
    const updated = [...tables];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    onReorder(updated.map((t, i) => ({ ...t, order: i })));
  };

  const moveTableRight = (id: string) => {
    const idx = tables.findIndex((t) => t.id === id);
    if (idx < 0 || idx >= tables.length - 1) return;
    const updated = [...tables];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    onReorder(updated.map((t, i) => ({ ...t, order: i })));
  };

  const menuItemStyle = (isError?: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: isError ? theme.error : undefined,
  });

  return (
    <div
      style={{
        borderBottom: `1px solid ${theme.borderPrimary}`,
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        paddingBottom: 8,
        position: 'relative',
      }}
    >
      {tables.map((t) => (
        <div
          key={t.id}
          onClick={() => onSelect(t.id)}
          style={{
            padding: '6px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            background: activeId === t.id ? theme.accent : theme.bgTertiary,
            color: activeId === t.id ? theme.btnPrimaryText : theme.textPrimary,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            position: 'relative',
            fontSize: 13,
          }}
        >
          {editingId === t.id ? (
            <input
              autoFocus
              value={t.name}
              onChange={(e) => onRename(t.id, normalizeFullwidth(e.target.value))}
              onBlur={() => setEditingId(null)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingId(null)}
              style={{ width: 100, padding: '2px 4px', fontSize: 12 }}
            />
          ) : (
            <span
              onDoubleClick={() => startEditing(t.id)}
              title="双击重命名"
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {t.name}
              <span style={{ fontSize: 10, opacity: 0.5 }}>✏️</span>
            </span>
          )}

          <span
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(openMenuId === t.id ? null : t.id);
            }}
            style={{ fontSize: 11, marginLeft: 2, cursor: 'pointer', opacity: 0.7, userSelect: 'none' }}
          >
            ⋮
          </span>

          {openMenuId === t.id && (
            <div
              ref={menuRef}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: theme.dropdownBg,
                border: `1px solid ${theme.borderPrimary}`,
                borderRadius: 4,
                boxShadow: theme.shadowDropdown,
                zIndex: 10,
                minWidth: 100,
              }}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing(t.id);
                }}
                style={menuItemStyle()}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = theme.dropdownHover)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = theme.dropdownBg)}
              >
                重命名
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(null);
                  moveTableLeft(t.id);
                }}
                style={menuItemStyle()}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = theme.dropdownHover)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = theme.dropdownBg)}
              >
                ← 左移
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(null);
                  moveTableRight(t.id);
                }}
                style={menuItemStyle()}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = theme.dropdownHover)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = theme.dropdownBg)}
              >
                → 右移
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(null);
                  onDelete(t.id);
                }}
                style={menuItemStyle(true)}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = theme.dropdownHover)}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = theme.dropdownBg)}
              >
                删除
              </div>
            </div>
          )}
        </div>
      ))}
      <button onClick={handleAdd} style={{ padding: '4px 10px', fontSize: 13 }}>
        + 新建表
      </button>
    </div>
  );
};
