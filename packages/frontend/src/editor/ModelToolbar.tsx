import React from 'react';

interface ModelToolbarProps {
  onSaveCompute: () => void;
  onExport: () => void;
  onValidate: () => void;
  isLoading: boolean;
}

export const ModelToolbar: React.FC<ModelToolbarProps> = ({ onSaveCompute, onExport, onValidate, isLoading }) => {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <button
        onClick={onSaveCompute}
        disabled={isLoading}
        style={{ padding: '8px 20px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
      >
        {isLoading ? '计算中...' : '保存并计算'}
      </button>
      <button
        onClick={onExport}
        style={{ padding: '8px 20px', background: '#fff', border: '1px solid #1976d2', color: '#1976d2', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
      >
        导出 Excel
      </button>
      <button
        onClick={onValidate}
        style={{ padding: '8px 20px', background: '#fff', border: '1px solid #666', color: '#666', borderRadius: 4, cursor: 'pointer', fontSize: 14 }}
      >
        验证
      </button>
    </div>
  );
};
