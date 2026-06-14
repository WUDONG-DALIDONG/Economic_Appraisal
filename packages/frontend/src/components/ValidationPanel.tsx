import React from 'react';
import { ModelDefinition, CellType } from '@economic/core';

export function validateModel(model: ModelDefinition): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  if (!model.name.trim()) errors.push({ field: 'name', message: '模型名称不能为空' });
  if (model.tables.length === 0) errors.push({ field: 'tables', message: '至少需要一张表' });
  for (const cell of model.cells) {
    if (!cell.name.trim()) errors.push({ field: `cell.${cell.id}`, message: '单元格名称不能为空' });
    if (cell.type === CellType.Formula && !cell.formula.startsWith('=')) {
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
  if (!visible) return null;
  const errors = validateModel(model);

  if (errors.length === 0) {
    return (
      <div style={{ padding: 12, background: '#e8f5e9', borderRadius: 4, marginTop: 16 }}>
        所有校验通过
      </div>
    );
  }

  return (
    <div style={{ padding: 12, background: '#ffebee', borderRadius: 4, marginTop: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#c62828' }}>发现 {errors.length} 个问题：</div>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
        {errors.map((e, i) => (
          <li key={i}>{e.field}: {e.message}</li>
        ))}
      </ul>
    </div>
  );
};
