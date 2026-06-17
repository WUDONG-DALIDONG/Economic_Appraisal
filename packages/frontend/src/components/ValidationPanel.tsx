import React from 'react';
import { ModelDefinition, ComputeMode } from '@economic/core';
import { useTheme } from '../ThemeContext.js';

export function validateModel(model: ModelDefinition): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  if (!model.name.trim()) errors.push({ field: 'name', message: '模型名称不能为空' });
  if (model.tables.length === 0) errors.push({ field: 'tables', message: '至少需要一张表' });
  for (const cell of model.cells) {
    if (!cell.name.trim()) errors.push({ field: `cell.${cell.id}`, message: '单元格名称不能为空' });
    if (cell.computeMode === ComputeMode.Formula && !cell.formula.startsWith('=')) {
      errors.push({ field: `cell.${cell.id}.formula`, message: `公式 ${cell.name} 必须以 = 开头` });
    }
  }
  return errors;
}

interface ValidationPanelProps {
  model: ModelDefinition;
  visible: boolean;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({ model, visible }) => {
  const { theme } = useTheme();
  if (!visible) return null;
  const errors = validateModel(model);

  if (errors.length === 0) {
    return (
      <div style={{ padding: 12, background: theme.bgSuccess, borderRadius: 4, marginTop: 16 }}>
        所有校验通过
      </div>
    );
  }

  return (
    <div style={{ padding: 12, background: theme.bgError, borderRadius: 4, marginTop: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: theme.error }}>发现 {errors.length} 个问题：</div>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
        {errors.map((e, i) => (
          <li key={i}>{e.field}: {e.message}</li>
        ))}
      </ul>
    </div>
  );
};
