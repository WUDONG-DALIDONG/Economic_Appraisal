import React from 'react';
import { ModelDefinition, TimelineConfig } from '@economic/core';
import { useTheme } from '../ThemeContext.js';

interface ModelEditorProps {
  model: ModelDefinition;
  onExport?: (modelId: string) => void;
}

export const ModelEditor: React.FC<ModelEditorProps> = ({ model, onExport }) => {
  const { theme } = useTheme();
  return (
    <div className="model-editor" style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <header style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>{model.name}</h1>
          <span style={{ color: theme.textSecondary }}>v{model.version}</span>
        </div>
        {onExport && (
          <button
            onClick={() => onExport(model.id)}
            style={{
              padding: '8px 16px',
              background: theme.btnPrimaryBg,
              color: theme.btnPrimaryText,
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            导出 Excel
          </button>
        )}
      </header>

      <section style={{ marginBottom: 12 }}>
        <p style={{ margin: 0, color: theme.textSecondary }}>{model.description}</p>
      </section>

      <section style={{ marginBottom: 12 }}>
        <h3 style={{ margin: '0 0 4px' }}>时间线</h3>
        <TimelineSummary timeline={model.timeline} />
      </section>

      <section>
        <h3 style={{ margin: '0 0 4px' }}>表格 ({model.tables.length})</h3>
        {model.tables.length === 0 ? (
          <p style={{ margin: 0, color: theme.textTertiary }}>暂无表格</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {model.tables.map(t => (
              <li key={t.id}>{t.name}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

function TimelineSummary({ timeline }: { timeline: TimelineConfig }) {
  const { theme } = useTheme();
  const total = timeline.constructionYears + timeline.operationYears;
  return (
    <div style={{ fontSize: 14, color: theme.textSecondary }}>
      建设期 <strong>{timeline.constructionYears}</strong> 年 &middot;{' '}
      运营期 <strong>{timeline.operationYears}</strong> 年 &middot;{' '}
      合计 <strong>{total}</strong> 年 &middot;{' '}
      起始于 <strong>{timeline.startYear}</strong>
    </div>
  );
}
