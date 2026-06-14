import React from 'react';
import { TableDefinition, CellDefinition } from '@economic/core';

interface TableEditorProps {
  table: TableDefinition;
  cells: CellDefinition[];
}

/**
 * TableEditor - displays a single table and its cells.
 *
 * Renders a read-only table of cells with their formulas and types.
 * Future: editable cells, add/remove rows, formula validation.
 */
export const TableEditor: React.FC<TableEditorProps> = ({ table, cells }) => {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 4, marginBottom: 16, padding: 12 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{table.name}</h2>
      {table.description && (
        <p style={{ margin: '0 0 8px', color: '#666', fontSize: 13 }}>{table.description}</p>
      )}

      <CellList cells={cells} />
    </div>
  );
};

export const CellList: React.FC<{ cells: CellDefinition[] }> = ({ cells }) => {
  if (cells.length === 0) {
    return <p style={{ color: '#888', fontSize: 13, margin: 0 }}>无单元格</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
          <th style={{ padding: '6px 8px', borderBottom: '1px solid #ddd' }}>名称</th>
          <th style={{ padding: '6px 8px', borderBottom: '1px solid #ddd' }}>类型</th>
          <th style={{ padding: '6px 8px', borderBottom: '1px solid #ddd' }}>单位</th>
          <th style={{ padding: '6px 8px', borderBottom: '1px solid #ddd' }}>公式</th>
        </tr>
      </thead>
      <tbody>
        {cells.map(cell => (
          <tr key={cell.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '6px 8px' }}>{cell.name}</td>
            <td style={{ padding: '6px 8px' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  background: cell.type === 'Formula' ? '#e3f2fd' : '#e8f5e9',
                  color: cell.type === 'Formula' ? '#1565c0' : '#2e7d32',
                }}
              >
                {cell.type}
              </span>
            </td>
            <td style={{ padding: '6px 8px', color: '#666' }}>{cell.unit || '-'}</td>
            <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12, color: '#333' }}>
              {cell.formula}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
