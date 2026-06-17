import React from 'react';
import { useTheme } from '../ThemeContext.js';

interface ComputePreviewProps {
  result: { cellCount: number; durationMs: number; errors: Array<{ cellId: string; timeIndex?: number; error: string }> } | null;
}

export const ComputePreview: React.FC<ComputePreviewProps> = ({ result }) => {
  const { theme } = useTheme();
  if (!result) return null;

  return (
    <div style={{ padding: 12, background: result.errors.length > 0 ? theme.bgWarning : theme.bgSuccess, borderRadius: 4, marginTop: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {result.errors.length > 0 ? '计算完成（含错误）' : '计算成功'}
      </div>
      <div style={{ fontSize: 13, color: theme.textSecondary }}>
        计算单元格: {result.cellCount} · 耗时: {result.durationMs}ms
      </div>
      {result.errors.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12, color: theme.warning }}>
          {result.errors.map((e, i) => (
            <li key={i}>{e.cellId}: {e.error}</li>
          ))}
        </ul>
      )}
    </div>
  );
};
