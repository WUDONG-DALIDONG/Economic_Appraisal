import React, { useState } from 'react';
import { ModelDefinition, CellDefinition } from '@economic/core';

interface FormulaEditorProps {
  value: string;
  onChange: (value: string) => void;
  model: ModelDefinition;
  currentCellId: string;
}

export const FormulaEditor: React.FC<FormulaEditorProps> = ({ value, onChange, model, currentCellId }) => {
  const [expanded, setExpanded] = useState(false);

  const suggestions = getSuggestions(value, model, currentCellId);

  return (
    <div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setExpanded(true)}
        onBlur={() => setTimeout(() => setExpanded(false), 150)}
        placeholder="=..."
        style={{ width: '100%', padding: '4px', fontFamily: 'monospace' }}
      />
      {expanded && suggestions.length > 0 && (
        <div style={{ marginTop: 2, border: '1px solid #ddd', borderRadius: 4, background: '#fff', maxHeight: 120, overflowY: 'auto' }}>
          {suggestions.map((s, idx) => (
            <div
              key={idx}
              onMouseDown={(e) => { e.preventDefault(); onChange(s.insertText); setExpanded(false); }}
              style={{ padding: '4px 8px', cursor: 'pointer', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              <span>{s.label}</span>
              <span style={{ color: '#888', fontSize: 11 }}>{s.detail}</span>
            </div>
          ))}
        </div>
      )}
      {!expanded && value && value.length > 20 && (
        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{value.slice(0, 50)}...</div>
      )}
    </div>
  );
};

function getSuggestions(
  value: string,
  model: ModelDefinition,
  currentCellId: string
): Array<{ label: string; detail: string; insertText: string }> {
  // Simple autocomplete: suggest table.fields when typing at the end
  const trimmed = value.trim();
  if (!trimmed) return [];

  // Find last token before cursor (simplified: just check if ends with a table name prefix)
  const parts = trimmed.split(/[+\-*/(),\s=]+/);
  const lastPart = parts[parts.length - 1];

  // If last part is empty or "=", suggest table names + 参数 namespace
  if (!lastPart || lastPart === '=') {
    const tableSuggestions = model.tables.map(t => ({
      label: t.name,
      detail: '表',
      insertText: trimmed + t.name + '.',
    }));
    tableSuggestions.push({
      label: '参数',
      detail: '全局参数',
      insertText: trimmed + '参数.',
    });
    return tableSuggestions;
  }

  // If ends with "参数.", suggest parameter names
  if (lastPart === '参数.') {
    return model.parameters.map(p => ({
      label: p.name,
      detail: `${p.type} ${p.unit || ''}`.trim(),
      insertText: trimmed.substring(0, trimmed.lastIndexOf(lastPart)) + '参数.' + p.name,
    }));
  }

  // If ends with "表名.", suggest cells in that table
  const match = lastPart.match(/^([^+\-*/(),\s=]+)\.$/);
  if (match) {
    const tableName = match[1];
    // Check if this is the special "参数" namespace
    if (tableName === '参数') {
      return model.parameters.map(p => ({
        label: p.name,
        detail: `${p.type} ${p.unit || ''}`.trim(),
        insertText: trimmed.substring(0, trimmed.lastIndexOf(lastPart)) + '参数.' + p.name,
      }));
    }
    const table = model.tables.find(t => t.name === tableName);
    if (table) {
      const cellSuggestions = model.cells
        .filter(c => c.tableId === table.id && c.id !== currentCellId)
        .map(cell => ({
          label: cell.name,
          detail: `${cell.type}`,
          insertText: trimmed.substring(0, trimmed.lastIndexOf(lastPart)) + tableName + '.' + cell.name,
        }));
      // Also append all parameters
      const paramSuggestions = model.parameters.map(p => ({
        label: '参数.' + p.name,
        detail: `${p.type} ${p.unit || ''}`.trim(),
        insertText: trimmed.substring(0, trimmed.lastIndexOf(lastPart)) + '参数.' + p.name,
      }));
      return [...cellSuggestions, ...paramSuggestions];
    }
  }

  return [];
}
