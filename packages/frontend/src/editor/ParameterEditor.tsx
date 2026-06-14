import React from 'react';
import { ParameterDefinition, ParameterType } from '@economic/core';

interface ParameterEditorProps {
  parameters: ParameterDefinition[];
  onChange: (params: ParameterDefinition[]) => void;
  onRename?: (oldName: string, newName: string) => void;
}

export const ParameterEditor: React.FC<ParameterEditorProps> = ({ parameters, onChange, onRename }) => {
  const updateParam = (index: number, updates: Partial<ParameterDefinition>) => {
    const oldName = parameters[index]?.name ?? '';
    const next = [...parameters];
    next[index] = { ...next[index], ...updates };
    onChange(next); // update state first so rename handler sees new names
    if (updates.name !== undefined && updates.name !== oldName && onRename) {
      onRename(oldName, updates.name);
    }
  };

  const addParam = () => {
    onChange([
      ...parameters,
      {
        id: `p-${Date.now()}`,
        name: '新参数',
        type: ParameterType.Number,
        defaultValue: 0,
      },
    ]);
  };

  const removeParam = (index: number) => {
    const next = [...parameters];
    next.splice(index, 1);
    onChange(next);
  };

  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>模型参数</h3>
      <div style={{ display: 'grid', gap: 12 }}>
        {parameters.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12, border: '1px solid #eee', borderRadius: 4, background: '#fff' }}>
            <input
              value={p.name}
              onChange={e => updateParam(i, { name: e.target.value })}
              placeholder="参数名"
              style={{ flex: 1, padding: '4px 8px' }}
            />
            <select
              value={p.type}
              onChange={e => updateParam(i, { type: e.target.value as ParameterType })}
              style={{ padding: '4px 8px' }}
            >
              {Object.values(ParameterType).map(t => (
                <option key={t} value={t}>{typeLabel(t)}</option>
              ))}
            </select>
            <input
              type={p.type === ParameterType.Number || p.type === ParameterType.Percentage ? 'number' : 'text'}
              value={p.defaultValue as any}
              onChange={e => updateParam(i, { defaultValue: p.type === ParameterType.Number || p.type === ParameterType.Percentage ? Number(e.target.value) : e.target.value })}
              placeholder="默认值"
              style={{ width: 100, padding: '4px 8px' }}
            />
            <input
              value={p.unit || ''}
              onChange={e => updateParam(i, { unit: e.target.value })}
              placeholder="单位"
              style={{ width: 60, padding: '4px 8px' }}
            />
            <button onClick={() => removeParam(i)} style={{ color: '#c62828', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
          </div>
        ))}
      </div>
      <button onClick={addParam} style={{ marginTop: 8, padding: '6px 12px' }}>+ 添加参数</button>
    </section>
  );
};

function typeLabel(t: ParameterType): string {
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
