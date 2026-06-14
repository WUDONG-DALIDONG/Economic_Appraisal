import React, { useState, useRef, useEffect } from 'react';
import { TableDefinition } from '@economic/core';

interface TableNavigatorProps {
  tables: TableDefinition[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: (table: TableDefinition) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export const TableNavigator: React.FC<TableNavigatorProps> = ({
  tables, activeId, onSelect, onAdd, onRename, onDelete,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
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

  /** Compute next "新表N" name avoiding gaps caused by renames. */
  const nextTableName = (): string => {
    let max = 0;
    for (const t of tables) {
      const m = t.name.match(/^新表(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `新表${max + 1}`;
  };

  const handleAdd = () => {
    const id = `table-${Date.now()}`;
    const name = nextTableName();
    onAdd({ id, name, order: tables.length });
    // Auto-enter edit mode on next tick so the DOM input exists
    setTimeout(() => startEditing(id), 0);
  };

  return (
    <div
      style={{
        borderBottom: '1px solid #ddd',
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
            background: activeId === t.id ? '#1976d2' : '#f5f5f5',
            color: activeId === t.id ? '#fff' : '#333',
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
              onChange={(e) => onRename(t.id, e.target.value)}
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

          {/* 菜单触发器 */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(openMenuId === t.id ? null : t.id);
            }}
            style={{ fontSize: 11, marginLeft: 2, cursor: 'pointer', opacity: 0.7, userSelect: 'none' }}
          >
            ⋮
          </span>

          {/* 下拉菜单 */}
          {openMenuId === t.id && (
            <div
              ref={menuRef}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 4,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                zIndex: 10,
                minWidth: 100,
              }}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  startEditing(t.id);
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background = '#f5f5f5')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background = '#fff')
                }
              >
                重命名
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(null);
                  onDelete(t.id);
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: '#c62828',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background = '#f5f5f5')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLDivElement).style.background = '#fff')
                }
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
