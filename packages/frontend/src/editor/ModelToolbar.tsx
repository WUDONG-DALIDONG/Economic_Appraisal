import React from 'react';
import { useTheme } from '../ThemeContext.js';

interface ModelToolbarProps {
  onSaveCompute: () => void;
  onExport: () => void;
  onValidate: () => void;
  isLoading: boolean;
}

export const ModelToolbar: React.FC<ModelToolbarProps> = ({ onSaveCompute, onExport, onValidate, isLoading }) => {
  const { theme, mode, toggle } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <button
        onClick={onSaveCompute}
        disabled={isLoading}
        style={{ padding: '8px 20px', background: theme.btnPrimaryBg, color: theme.btnPrimaryText, border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
      >
        {isLoading ? '计算中...' : '保存并计算'}
      </button>
      <button
        onClick={onExport}
        style={{ padding: '8px 20px', background: theme.btnOutlineBg, border: `1px solid ${theme.btnOutlineBorder}`, color: theme.btnOutlineText, borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
      >
        导出 Excel
      </button>
      <button
        onClick={onValidate}
        style={{ padding: '8px 20px', background: theme.btnOutlineBg, border: `1px solid ${theme.textSecondary}`, color: theme.textSecondary, borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
      >
        验证
      </button>
      <button
        onClick={toggle}
        title={mode === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        style={{
          padding: '6px 10px',
          background: theme.bgTertiary,
          border: `1px solid ${theme.borderPrimary}`,
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        {mode === 'dark' ? '☀' : '☾'}
      </button>
    </div>
  );
};
