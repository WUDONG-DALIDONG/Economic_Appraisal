import React from 'react';
import { ModelDefinition } from '@economic/core';

interface TimelineEditorProps {
  timeline: ModelDefinition['timeline'];
  onChange: (timeline: ModelDefinition['timeline']) => void;
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({ timeline, onChange }) => {
  const update = (key: keyof ModelDefinition['timeline'], value: number) => {
    onChange({ ...timeline, [key]: value });
  };

  return (
    <section style={{ marginBottom: 24, padding: 12, border: '1px solid #eee', borderRadius: 4, background: '#fff' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>时间线配置</h3>
      <div style={{ display: 'flex', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          建设期（年）
          <input
            type="number"
            step={0.5}
            value={timeline.constructionYears}
            onChange={e => update('constructionYears', Number(e.target.value))}
            style={{ width: 80, padding: '4px 8px' }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          运营期（年）
          <input
            type="number"
            value={timeline.operationYears}
            onChange={e => update('operationYears', Number(e.target.value))}
            style={{ width: 80, padding: '4px 8px' }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          起始年份
          <input
            type="number"
            value={timeline.startYear}
            onChange={e => update('startYear', Number(e.target.value))}
            style={{ width: 100, padding: '4px 8px' }}
          />
        </label>
      </div>
    </section>
  );
};
