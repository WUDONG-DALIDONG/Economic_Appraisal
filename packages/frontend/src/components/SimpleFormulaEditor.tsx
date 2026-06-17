import React, { useState } from 'react';
import { ModelDefinition } from '@economic/core';
import { useTheme } from '../ThemeContext.js';

interface SimpleFormulaEditorProps {
  value: string;
  onChange: (value: string) => void;
  model: ModelDefinition;
  currentCellId: string;
}

export const SimpleFormulaEditor: React.FC<SimpleFormulaEditorProps> = ({
  value,
  onChange,
  model,
  currentCellId,
}) => {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const suggestions = getSuggestions(value, model, currentCellId);

  const insert = (text: string) => {
    const info = getLastToken(value);
    let next: string;
    if (info) {
      next = value.slice(0, info.start) + text + value.slice(info.end);
    } else {
      next = value + text;
    }
    onChange(next);
    setTimeout(() => setExpanded(false), 0);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setExpanded(true)}
        onBlur={() => {
          setTimeout(() => setExpanded(false), 150);
        }}
        placeholder="=..."
        style={{ width: '100%', padding: '4px', fontFamily: 'monospace', fontSize: 12 }}
      />
      {expanded && suggestions.length > 0 && (
        <div
          style={{
            position: 'relative',
            zIndex: 100,
            width: '100%',
            minWidth: 220,
            marginTop: 2,
            border: `1px solid ${theme.borderPrimary}`,
            borderRadius: 4,
            background: theme.dropdownBg,
            maxHeight: 180,
            overflowY: 'auto',
            boxShadow: theme.shadowDropdown,
          }}
        >
          {suggestions.map((s, idx) => (
            <div
              key={idx}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(s.insertText);
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = theme.dropdownHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = theme.dropdownBg;
              }}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: `1px solid ${theme.bgQuaternary}`,
              }}
            >
              <span style={{ fontWeight: 500 }}>{s.label}</span>
              <span style={{ color: theme.textTertiary, fontSize: 11 }}>{s.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function getSuggestions(
  value: string,
  model: ModelDefinition,
  currentCellId: string
): Array<{ label: string; detail: string; insertText: string }> {
  const trimmed = value.trimEnd();
  if (!trimmed) return [];

  const token = getLastToken(trimmed);
  if (!token) {
    if (trimmed.endsWith('=') || /[+\-*/(),\s]$/.test(trimmed)) {
      const out = model.tables.map((t) => ({
        label: t.name,
        detail: '表',
        insertText: t.name + '.',
      }));
      out.push({ label: '全局参数', detail: '全局参数', insertText: '全局参数.' });
      return out;
    }
    return [];
  }

  const path = token.token;

  if (path === '全局参数') {
    return model.parameters.map((p) => ({
      label: p.name,
      detail: (p.type ?? '') + ' ' + (p.unit ?? ''),
      insertText: '全局参数.' + p.name,
    }));
  }

  const parts = path.split('.');
  const tableName = parts[0];
  const table = model.tables.find((t) => t.name === tableName);
  if (!table) return [];

  if (parts.length === 1) {
    const cells = model.cells
      .filter((c) => c.tableId === table.id && c.id !== currentCellId)
      .map((c) => ({
        label: c.name,
        detail: c.type ?? '',
        insertText: tableName + '.' + c.name,
      }));
    return cells;
  }

  return [];
}

function getLastToken(text: string): { token: string; start: number; end: number } | null {
  let i = text.length - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (i < 0) return null;

  let start = i;
  while (start >= 0 && /[\w\u4e00-\u9fff.]/.test(text[start])) {
    start--;
  }

  const token = text.slice(start + 1, i + 1);
  if (!token) return null;

  if (start >= 0 && !/[+\-*/(),\s=]/.test(text[start])) {
    return null;
  }
  return { token, start: start + 1, end: i + 1 };
}
