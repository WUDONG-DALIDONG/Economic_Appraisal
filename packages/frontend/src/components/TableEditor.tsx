import React from 'react';
import { TableDefinition, CellDefinition } from '@economic/core';
import { useTheme } from '../ThemeContext.js';

interface TableEditorProps {
  table: TableDefinition;
  cells: CellDefinition[];
}

export const TableEditor: React.FC<TableEditorProps> = ({ table, cells }) => {
  const { theme } = useTheme();
  return (
    <div style={{ border: `1px solid ${theme.borderPrimary}`, borderRadius: 4, marginBottom: 16, padding: 12 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{table.name}</h2>
      {table.description && (
        <p style={{ margin: '0 0 8px', color: theme.textSecondary, fontSize: 13 }}>{table.description}</p>
      )}

      <CellList cells={cells} />
    </div>
  );
};

export const CellList: React.FC<{ cells: CellDefinition[] }> = ({ cells }) => {
  const { theme } = useTheme();
  if (cells.length === 0) {
    return <p style={{ color: theme.textTertiary, fontSize: 13, margin: 0 }}>无单元格</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: theme.bgTertiary, textAlign: 'left' }}>
          <th style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.borderPrimary}` }}>名称</th>
          <th style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.borderPrimary}` }}>类型</th>
          <th style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.borderPrimary}` }}>单位</th>
          <th style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.borderPrimary}` }}>公式</th>
        </tr>
      </thead>
      <tbody>
        {cells.map(cell => (
          <tr key={cell.id} style={{ borderBottom: `1px solid ${theme.borderSecondary}` }}>
            <td style={{ padding: '6px 8px' }}>{cell.name}</td>
            <td style={{ padding: '6px 8px' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: cell.type === 'Formula' ? theme.bgPrimaryLight : theme.bgSuccess,
                  color: cell.type === 'Formula' ? theme.formulaBlue : theme.success,
                }}
              >
                {cell.type}
              </span>
            </td>
            <td style={{ padding: '6px 8px', color: theme.textSecondary }}>{cell.unit || '-'}</td>
            <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12, color: theme.textPrimary }}>
              {cell.formula}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
