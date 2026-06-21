import React, { useState, useRef, useEffect } from 'react';
import { ParameterDefinition, TableDefinition, ComputeMode, ValueType, normalizeFullwidth } from '@economic/core';
import { NavPath } from '../types/workspace.js';
import { useTheme } from '../ThemeContext.js';

interface ModelTreeNavProps {
  models: Array<{ id: string; name: string }>;
  currentModelId: string | null;
  currentNavPath: NavPath;
  parameters: ParameterDefinition[];
  tables: TableDefinition[];
  onSelectModel: (id: string) => void;
  onNewModel: () => void;
  onDeleteModel: (id: string) => void;
  onNavigate: (path: NavPath) => void;
  // 表操作
  onAddTable: (table: TableDefinition, defaultCell: { id: string; tableId: string; name: string; formula: string; computeMode: ComputeMode; valueType: ValueType; isArray: boolean; unit: string; sortOrder: number; parentId: null }) => void;
  onRenameTable: (id: string, newName: string) => void;
  onDeleteTable: (id: string) => void;
  onReorderTables: (tables: TableDefinition[]) => void;
}

export const ModelTreeNav: React.FC<ModelTreeNavProps> = ({
  models,
  currentModelId,
  currentNavPath,
  parameters,
  tables,
  onSelectModel,
  onNewModel,
  onDeleteModel,
  onNavigate,
  onAddTable,
  onRenameTable,
  onDeleteTable,
  onReorderTables,
}) => {
  const { theme } = useTheme();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(currentModelId ? [currentModelId] : [])
  );
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
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

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isModelSelected = (id: string) => currentModelId === id;
  const isParamNav = currentNavPath.type === 'parameters';
  const isTableNav = (tableId: string) =>
    currentNavPath.type === 'table' && currentNavPath.tableId === tableId;

  const nextTableName = (): string => {
    let max = 0;
    for (const t of tables) {
      const m = t.name.match(/^新表(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `新表${max + 1}`;
  };

  const handleAddTable = () => {
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
    onAddTable({ id: tableId, name, order: tables.length }, defaultCell);
    setTimeout(() => {
      setEditingTableId(tableId);
      setEditingValue(name);
    }, 0);
  };

  const handleSaveRename = (id: string) => {
    if (editingValue.trim()) {
      onRenameTable(id, editingValue.trim());
    }
    setEditingTableId(null);
    setEditingValue('');
  };

  const moveTableUp = (id: string) => {
    const idx = tables.findIndex((t) => t.id === id);
    if (idx <= 0) return;
    const updated = [...tables];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    onReorderTables(updated.map((t, i) => ({ ...t, order: i })));
  };

  const moveTableDown = (id: string) => {
    const idx = tables.findIndex((t) => t.id === id);
    if (idx < 0 || idx >= tables.length - 1) return;
    const updated = [...tables];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    onReorderTables(updated.map((t, i) => ({ ...t, order: i })));
  };

  const menuItemStyle = (isError?: boolean): React.CSSProperties => ({
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: isError ? theme.error : undefined,
  });

  return (
    <aside
      style={{
        width: 200,
        borderRight: `1px solid ${theme.borderPrimary}`,
        background: theme.bgSecondary,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* 树形内容区域 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {models.map((m) => {
          const selected = isModelSelected(m.id);
          const expanded = expandedIds.has(m.id);
          return (
            <div key={m.id}>
              {/* 模型节点 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  background: selected ? theme.accent : 'transparent',
                  color: selected ? theme.btnPrimaryText : theme.textPrimary,
                  userSelect: 'none',
                }}
                onClick={() => {
                  onSelectModel(m.id);
                  if (!expandedIds.has(m.id)) {
                    setExpandedIds((prev) => new Set([...prev, m.id]));
                  }
                }}
              >
                {/* 展开/折叠三角 */}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(m.id);
                  }}
                  style={{
                    display: 'inline-block',
                    width: 14,
                    fontSize: 10,
                    textAlign: 'center',
                    marginRight: 4,
                    cursor: 'pointer',
                    color: selected ? theme.btnPrimaryText : theme.textSecondary,
                  }}
                >
                  {selected && expanded ? '▼' : '▶'}
                </span>
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 13,
                    fontWeight: selected ? 600 : 400,
                  }}
                >
                  {m.name}
                </span>
                {selected && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteModel(m.id);
                    }}
                    style={{
                      marginLeft: 4,
                      fontSize: 11,
                      color: theme.btnPrimaryText,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0 2px',
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              {/* 展开的参数 + 表树 */}
              {selected && expanded && (
                <div>
                  {/* 全局参数文件夹 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px 12px 4px 28px',
                      cursor: 'pointer',
                      background:
                        isParamNav ? theme.bgPrimaryLight : 'transparent',
                      color: theme.textPrimary,
                      fontSize: 12,
                    }}
                    onClick={() => onNavigate({ type: 'parameters' })}
                  >
                    <span style={{ marginRight: 4 }}>📁</span>
                    <span
                      style={{
                        fontWeight: isParamNav ? 600 : 400,
                        color: isParamNav ? theme.accent : theme.textPrimary,
                      }}
                    >
                      全局参数
                    </span>
                  </div>

                  {/* 表文件夹 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px 12px 4px 28px',
                      fontSize: 12,
                      color: theme.textPrimary,
                      marginTop: 4,
                    }}
                  >
                    <span style={{ marginRight: 4 }}>📁</span>
                    <span style={{ flex: 1 }}>表</span>
                    <button
                      onClick={handleAddTable}
                      style={{
                        fontSize: 11,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: theme.textSecondary,
                        padding: '0 4px',
                      }}
                      title="新建表"
                    >
                      +
                    </button>
                  </div>

                  {/* 表列表 */}
                  {tables.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '3px 12px 3px 44px',
                        cursor: 'pointer',
                        fontSize: 12,
                        background: isTableNav(t.id)
                          ? theme.bgPrimaryLight
                          : 'transparent',
                        color: isTableNav(t.id)
                          ? theme.accent
                          : theme.textPrimary,
                      }}
                      onClick={() => {
                        onNavigate({ type: 'table', tableId: t.id });
                        setOpenMenuId(null);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingTableId(t.id);
                        setEditingValue(t.name);
                      }}
                    >
                      {editingTableId === t.id ? (
                        <input
                          autoFocus
                          value={editingValue}
                           onChange={(e) => setEditingValue(normalizeFullwidth(e.target.value))}
                          onBlur={() => handleSaveRename(t.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(t.id);
                            if (e.key === 'Escape') {
                              setEditingTableId(null);
                              setEditingValue('');
                            }
                          }}
                          style={{
                            fontSize: 12,
                            width: '100%',
                            padding: '2px 4px',
                            border: `1px solid ${theme.inputBorder}`,
                            borderRadius: 2,
                            background: theme.bgPrimary,
                            color: theme.textPrimary,
                            outline: 'none',
                          }}
                        />
                      ) : (
                        <>
                          <span
                            style={{
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontWeight: isTableNav(t.id) ? 600 : 400,
                            }}
                          >
                            {t.name}
                          </span>
                          {/* 菜单按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = (e.target as HTMLElement).getBoundingClientRect();
                              setMenuPos({ x: rect.left, y: rect.bottom + 4 });
                              setOpenMenuId(openMenuId === t.id ? null : t.id);
                            }}
                            style={{
                              marginLeft: 4,
                              fontSize: 11,
                              color: theme.textSecondary,
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0 2px',
                            }}
                          >
                            ⋮
                          </button>
                        </>
                      )}

                      {/* 下拉菜单 */}
                      {openMenuId === t.id && editingTableId !== t.id && (
                        <div
                          ref={menuRef}
                          style={{
                            position: 'fixed',
                            left: menuPos?.x ?? 0,
                            top: menuPos?.y ?? 0,
                            background: theme.dropdownBg,
                            border: `1px solid ${theme.borderPrimary}`,
                            borderRadius: 4,
                            boxShadow: theme.shadowDropdown,
                            zIndex: 1000,
                            minWidth: 120,
                          }}
                        >
                          <div
                            style={menuItemStyle()}
                            onClick={() => {
                              setEditingTableId(t.id);
                              setEditingValue(t.name);
                              setOpenMenuId(null);
                              setMenuPos(null);
                            }}
                          >
                            重命名
                          </div>
                          <div
                            style={menuItemStyle()}
                            onClick={() => {
                              moveTableUp(t.id);
                              setOpenMenuId(null);
                              setMenuPos(null);
                            }}
                          >
                            ↑ 上移
                          </div>
                          <div
                            style={menuItemStyle()}
                            onClick={() => {
                              moveTableDown(t.id);
                              setOpenMenuId(null);
                              setMenuPos(null);
                            }}
                          >
                            ↓ 下移
                          </div>
                          <div
                            style={menuItemStyle(true)}
                            onClick={() => {
                              onDeleteTable(t.id);
                              setOpenMenuId(null);
                              setMenuPos(null);
                            }}
                          >
                            删除
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部新建按钮 */}
      <div
        style={{
          padding: '12px 12px 16px',
          borderTop: `1px solid ${theme.borderPrimary}`,
        }}
      >
        <button
          onClick={onNewModel}
          style={{
            width: '100%',
            padding: '6px 12px',
            fontSize: 12,
            border: `1px solid ${theme.inputBorder}`,
            borderRadius: 4,
            background: theme.btnOutlineBg,
            color: theme.textPrimary,
            cursor: 'pointer',
          }}
        >
          + 新建模型
        </button>
      </div>
    </aside>
  );
};
