import React, { useState, useMemo, useRef } from 'react';
import type { ModelDefinition, ParameterDefinition } from '@economic/core';
import { ParameterType, recomputeCodes, getCodeDepth } from '@economic/core';
import { FormulaEditor } from '../components/FormulaEditor.js';
import { FormulaEditModal } from '../components/FormulaEditModal.js';
import { formatNumber } from '../utils/formatNumber.js';

interface ParameterTreeEditorProps {
  model: ModelDefinition;
  parameters: ParameterDefinition[];
  onChange: (params: ParameterDefinition[]) => void;
  onRename?: (oldName: string, newName: string, paramId: string) => void;
}

const CODE_COL_WIDTH = 70;
const ID_COL_WIDTH = 140;
const ACTION_COL_WIDTH = 110;
const NAME_COL_WIDTH = 160;
const TYPE_COL_WIDTH = 90;
const UNIT_COL_WIDTH = 60;
const VALUE_COL_WIDTH = 100;
const FORMULA_COL_WIDTH = 80;

export const ParameterTreeEditor: React.FC<ParameterTreeEditorProps> = ({
  model,
  parameters,
  onChange,
  onRename,
}) => {
  const [collapsedCodes, setCollapsedCodes] = useState<Set<string>>(new Set());
  const [editingFormulaParamId, setEditingFormulaParamId] = useState<string | null>(null);
  const [showIdColumn, setShowIdColumn] = useState(false);
  const [precisionParamId, setPrecisionParamId] = useState<string | null>(null);
  const [editingParamId, setEditingParamId] = useState<string | null>(null);

  const si = showIdColumn;
  const idW = si ? ID_COL_WIDTH : 0;
  const nameLeft = CODE_COL_WIDTH + idW;

  // Store old names for rename-on-blur (race-condition fix)
  const renameRef = useRef<{ id: string; oldName: string } | null>(null);

  // Recompute hierarchical codes for parameters and sort depth-first
  const paramsWithCodes = useMemo(() => {
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
    // Sort depth-first by code (numeric comparison at each level)
    withCodes.sort((a, b) => compareCode(a.code || '', b.code || ''));
    return withCodes;
  }, [parameters]);

  // Visible parameters: filter out children of collapsed parents
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
    onChange(
      paramsWithCodes
        .filter((p) => !removeSet.has(p.id))
        .map((p) => (removeSet.has(p.parentId ?? '') ? { ...p, parentId: newParentId } : p))
    );
  };

  const indentParam = (id: string) => {
    const idx = paramsWithCodes.findIndex((p) => p.id === id);
    if (idx <= 0) return;
    const target = paramsWithCodes[idx];
    const prev = paramsWithCodes[idx - 1];
    if (target.parentId === prev.id) return;
    if (prev.code && target.code && prev.code.startsWith(target.code + '.')) return;
    onChange(
      paramsWithCodes.map((p) => (p.id === id ? { ...p, parentId: prev.id } : p))
    );
  };

  const outdentParam = (id: string) => {
    const target = paramsWithCodes.find((p) => p.id === id);
    if (!target || !target.parentId) return;
    const parent = paramsWithCodes.find((p) => p.id === target.parentId);
    onChange(
      paramsWithCodes.map((p) =>
        p.id === id ? { ...p, parentId: parent?.parentId ?? null } : p
      )
    );
  };

  const insertParamAt = (id: string) => {
    const target = paramsWithCodes.find((p) => p.id === id);
    if (!target) return;
    const targetIdx = paramsWithCodes.findIndex((p) => p.id === id);
    const siblings = paramsWithCodes.filter((p) => p.parentId === target.parentId);
    const siblingIdx = siblings.findIndex((p) => p.id === id);
    const targetSo = target.sortOrder ?? 0;
    const newSo =
      siblingIdx < siblings.length - 1
        ? (targetSo + (siblings[siblingIdx + 1].sortOrder ?? targetSo + 1)) / 2
        : targetSo + 1;
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
      type: ParameterType.Number,
      defaultValue: 0,
      sortOrder: newSo,
      parentId: target.parentId,
    };
    // 插入到目标参数之后（保持同级兄弟的顺序）
    const updated = [...paramsWithCodes];
    updated.splice(targetIdx + 1, 0, newParam);
    onChange(updated);
  };

  const toggleCollapse = (code: string) => {
    setCollapsedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

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

  // Header row
  const headerRow = (
    <div style={{ display: 'flex', borderBottom: '1px solid #ddd', background: '#f5f5f5', fontSize: 12, fontWeight: 600, minWidth: 670 }}>
      <div style={{ width: CODE_COL_WIDTH, padding: '6px 8px', position: 'sticky', left: 0, background: '#f5f5f5', zIndex: 2 }}>编码</div>
      {si && (
        <div style={{ width: ID_COL_WIDTH, padding: '6px 8px', position: 'sticky', left: CODE_COL_WIDTH, background: '#f5f5f5', zIndex: 2 }}>ID</div>
      )}
      <div style={{ width: NAME_COL_WIDTH, padding: '6px 8px', position: 'sticky', left: nameLeft, background: '#f5f5f5', zIndex: 2 }}>名称</div>
      <div style={{ width: ACTION_COL_WIDTH, padding: '6px 8px', textAlign: 'center' }}>操作</div>
      <div style={{ width: TYPE_COL_WIDTH, padding: '6px 8px' }}>类型</div>
      <div style={{ width: UNIT_COL_WIDTH, padding: '6px 8px' }}>单位</div>
      <div style={{ width: VALUE_COL_WIDTH, padding: '6px 8px' }}>默认值</div>
      <div style={{ width: FORMULA_COL_WIDTH, padding: '6px 8px' }}>公式</div>
      <div style={{ marginLeft: 'auto', padding: '0 8px' }}>
        <button
          onClick={() => setShowIdColumn(!showIdColumn)}
          style={{
            padding: '2px 8px',
            fontSize: 11,
            border: '1px solid #ddd',
            background: showIdColumn ? '#1976d2' : '#fff',
            color: showIdColumn ? '#fff' : '#666',
            borderRadius: 3,
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          ID
        </button>
      </div>
    </div>
  );

  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>全局参数</h3>
      <div style={{ border: '1px solid #ddd', borderRadius: 4, overflowX: 'auto', position: 'relative', maxHeight: 500 }}>
        {headerRow}
        {displayParams.map((param) => {
          const isLeaf = !hasChildren(param.id);
          const isCollapsed = param.code ? collapsedCodes.has(param.code) : false;
          const depth = getCodeDepth(param.code || '');
          return (
            <div key={param.id} style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f0f0', minWidth: 670, height: 36 }}>
              {/* 编码列 */}
              <div style={{ width: CODE_COL_WIDTH, padding: '6px 8px', position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontSize: 12, color: '#666' }}>
                {param.code}
              </div>
              {/* ID列 */}
              {si && (
                <div style={{ width: ID_COL_WIDTH, padding: '6px 8px', position: 'sticky', left: CODE_COL_WIDTH, background: '#fff', zIndex: 1, fontSize: 10, color: '#888', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {param.id}
                </div>
              )}
              {/* 名称列 */}
              <div style={{ width: NAME_COL_WIDTH, padding: '6px 8px', position: 'sticky', left: nameLeft, background: '#fff', zIndex: 1, display: 'flex', alignItems: 'center' }}>
                {depth > 1 && (
                  <span style={{ width: (depth - 1) * 16, display: 'inline-block' }} />
                )}
                {!isLeaf && (
                  <button
                    onClick={() => toggleCollapse(param.code!)}
                    style={{ width: 20, height: 20, border: 'none', background: 'none', cursor: 'pointer', fontSize: 10, padding: 0, marginRight: 2 }}
                  >
                    {isCollapsed ? '▶' : '▼'}
                  </button>
                )}
                {isLeaf && <span style={{ width: 20, display: 'inline-block' }} />}
                <input
                  value={param.name}
                  onChange={(e) => updateParam(param.id, { name: e.target.value })}
                  onFocus={() => { renameRef.current = { id: param.id, oldName: param.name }; }}
                  onBlur={() => handleNameBlur(param.id)}
                  style={{ flex: 1, padding: '2px 4px', fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #eee', background: 'transparent' }}
                />
              </div>
              {/* 操作列 */}
              <div style={{ width: ACTION_COL_WIDTH, padding: '6px 4px', display: 'flex', gap: 2, justifyContent: 'center' }}>
                <button onClick={() => indentParam(param.id)} style={actionBtnStyle}>→</button>
                <button onClick={() => outdentParam(param.id)} style={actionBtnStyle}>←</button>
                <button onClick={() => insertParamAt(param.id)} style={actionBtnStyle}>+</button>
                <span style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    onClick={() => setPrecisionParamId(precisionParamId === param.id ? null : param.id)}
                    title={`精度: ${param.precision ?? 2} 位`}
                    style={{ ...actionBtnStyle, color: '#666', fontSize: 10, fontFamily: 'monospace', width: 24 }}
                  >
                    {param.precision ?? 2}d
                  </button>
                  {precisionParamId === param.id && (
                    <div style={{
                      position: 'absolute', top: 22, left: -10, zIndex: 10,
                      background: '#fff', border: '1px solid #ddd', borderRadius: 4,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)', padding: 4,
                    }}>
                      {[0, 1, 2, 3, 4, 5, 6].map(p => (
                        <button
                          key={p}
                          onClick={() => { updateParam(param.id, { precision: p === 2 ? undefined : p }); setPrecisionParamId(null); }}
                          style={{
                            display: 'block', width: '100%', padding: '3px 12px',
                            border: 'none', background: (param.precision ?? 2) === p ? '#e3f2fd' : '#fff',
                            cursor: 'pointer', fontSize: 12, textAlign: 'left',
                          }}
                        >
                          {p} 位{p === 2 ? ' (默认)' : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
                <button onClick={() => removeParam(param.id)} style={{ ...actionBtnStyle, color: '#c62828' }}>×</button>
              </div>
              {/* 类型列 */}
              <div style={{ width: TYPE_COL_WIDTH, padding: '6px 4px' }}>
                <select
                  value={param.type}
                  onChange={(e) => updateParam(param.id, { type: e.target.value as ParameterType })}
                  style={{ width: '100%', padding: '2px 4px', fontSize: 12 }}
                >
                  {Object.values(ParameterType).map((t) => (
                    <option key={t} value={t}>{paramTypeLabel(t)}</option>
                  ))}
                </select>
              </div>
              {/* 单位列 */}
              <div style={{ width: UNIT_COL_WIDTH, padding: '6px 4px' }}>
                <input
                  value={param.unit || ''}
                  onChange={(e) => updateParam(param.id, { unit: e.target.value })}
                  style={{ width: '100%', padding: '2px 4px', fontSize: 12, border: '1px solid #ddd', borderRadius: 3 }}
                />
              </div>
              {/* 默认值列 */}
              <div style={{ width: VALUE_COL_WIDTH, padding: '6px 4px' }}>
                <input
                  type="text"
                  value={
                    (param.type === ParameterType.Number || param.type === ParameterType.Percentage) && editingParamId !== param.id && typeof param.defaultValue === 'number'
                      ? formatNumber(param.defaultValue, param.precision)
                      : String(param.defaultValue ?? '')
                  }
                  onFocus={() => setEditingParamId(param.id)}
                  onBlur={() => setEditingParamId(null)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/,/g, '');
                    if (param.type === ParameterType.Number || param.type === ParameterType.Percentage) {
                      const num = raw === '' ? 0 : Number(raw);
                      if (!isNaN(num)) updateParam(param.id, { defaultValue: num });
                    } else {
                      updateParam(param.id, { defaultValue: e.target.value });
                    }
                  }}
                  style={{ width: '100%', padding: '2px 4px', fontSize: 12, textAlign: 'right' }}
                />
              </div>
              {/* 公式列 */}
              <div style={{ width: FORMULA_COL_WIDTH, padding: '6px 4px', textAlign: 'center' }}>
                <FormulaEditor
                  value={param.formula || ''}
                  onChange={(val) => updateParam(param.id, { formula: val })}
                  model={model}
                  currentCellId={param.id}
                  mode="compact"
                  onFocus={() => setEditingFormulaParamId(param.id)}
                />
                {editingFormulaParamId === param.id && (
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
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const actionBtnStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  border: '1px solid #ddd',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 11,
  borderRadius: 3,
  padding: 0,
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

function paramTypeLabel(t: ParameterType): string {
  const map: Record<string, string> = {
    [ParameterType.Number]: '数值',
    [ParameterType.Percentage]: '百分比',
    [ParameterType.Enum]: '选项',
    [ParameterType.String]: '文本',
    [ParameterType.Boolean]: '布尔',
    [ParameterType.Date]: '日期',
  };
  return map[t] || t;
}
