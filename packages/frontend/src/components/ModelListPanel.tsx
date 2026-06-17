import React from 'react';
import { useTheme } from '../ThemeContext.js';

interface ModelListPanelProps {
  models: Array<{ id: string; name: string }>;
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export const ModelListPanel: React.FC<ModelListPanelProps> = ({
  models, currentId, onSelect, onNew, onDelete,
}) => {
  const { theme } = useTheme();
  return (
    <aside style={{ width: 240, borderRight: `1px solid ${theme.borderPrimary}`, padding: 16, background: theme.bgSecondary, overflowY: 'auto', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>模型列表</h2>
        <button onClick={onNew} style={{ padding: '4px 8px', fontSize: 12 }}>+ 新建</button>
      </div>
      <nav>
        {models.map(m => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              marginBottom: 4,
              borderRadius: 4,
              background: currentId === m.id ? theme.accent : 'transparent',
              color: currentId === m.id ? theme.btnPrimaryText : theme.textPrimary,
              cursor: 'pointer',
            }}
            onClick={() => onSelect(m.id)}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(m.id); }}
              style={{ marginLeft: 8, fontSize: 11, color: currentId === m.id ? theme.btnPrimaryText : theme.textPlaceholder, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        ))}
      </nav>
    </aside>
  );
};
