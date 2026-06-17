import React, { useState, useEffect } from 'react';
import { ModelDefinition } from '@economic/core';
import { useTheme } from '../ThemeContext.js';

interface TimelineEditorProps {
  timeline: ModelDefinition['timeline'];
  onChange: (timeline: ModelDefinition['timeline']) => void;
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({ timeline, onChange }) => {
  const { theme } = useTheme();

  const constructionYears = timeline.constructionYears ?? 0;
  const yearPart = Math.floor(constructionYears);
  const monthPart = Math.round((constructionYears - yearPart) * 12);

  const [yearInput, setYearInput] = useState(String(yearPart));
  const [monthInput, setMonthInput] = useState(String(monthPart));

  useEffect(() => {
    setYearInput(String(yearPart));
    setMonthInput(String(monthPart));
  }, [constructionYears]);

  const commitConstruction = (y: string, m: string) => {
    const yVal = Math.max(0, parseInt(y) || 0);
    const mVal = Math.min(11, Math.max(0, parseInt(m) || 0));
    onChange({ ...timeline, constructionYears: yVal + mVal / 12 });
  };

  const inputStyle: React.CSSProperties = { width: 60, padding: '4px 8px', background: theme.bgTertiary, border: '1px solid transparent', textAlign: 'center' };

  return (
    <section style={{ marginBottom: 24, padding: 12, border: `1px solid ${theme.borderSecondary}`, borderRadius: 4, background: theme.bgPrimary }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>时间线配置</h3>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          建设期
          <input
            type="number"
            min={0}
            value={yearInput}
            onChange={e => setYearInput(e.target.value)}
            onBlur={() => commitConstruction(yearInput, monthInput)}
            style={inputStyle}
          />
          年
          <input
            type="number"
            min={0}
            max={11}
            value={monthInput}
            onChange={e => setMonthInput(e.target.value)}
            onBlur={() => commitConstruction(yearInput, monthInput)}
            style={inputStyle}
          />
          月
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          运营期
          <input
            type="number"
            min={0}
            value={timeline.operationYears}
            onChange={e => onChange({ ...timeline, operationYears: Number(e.target.value) })}
            style={{ ...inputStyle, width: 80 }}
          />
          年
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          起始年份
          <input
            type="number"
            value={timeline.startYear}
            onChange={e => onChange({ ...timeline, startYear: Number(e.target.value) })}
            style={{ ...inputStyle, width: 100 }}
          />
        </label>
      </div>
    </section>
  );
};
