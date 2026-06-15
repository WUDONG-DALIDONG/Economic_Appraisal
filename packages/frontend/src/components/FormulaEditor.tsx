import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ModelDefinition,
  CellDefinition,
  formulaCodeToDisplay,
  formulaDisplayToCode,
} from '@economic/core';

interface FormulaEditorProps {
  value: string;
  onChange: (value: string) => void;
  model: ModelDefinition;
  currentCellId: string;
  mode?: 'compact' | 'expanded';
  onFocus?: () => void;
  onBlur?: () => void;
}

export const FormulaEditor: React.FC<FormulaEditorProps> = ({
  value,
  onChange,
  model,
  currentCellId,
  mode = 'expanded',
  onFocus,
  onBlur,
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const clickTimerRef = useRef(0);

  // Convert stored code-based formula → human display text
  useEffect(() => {
    try {
      setDisplayValue(formulaCodeToDisplay(value, model));
    } catch {
      setDisplayValue(value);
    }
  }, [value, model]);

  const pathMaps = useMemo(() => buildPathMaps(model), [model]);

  const suggestions = useMemo(
    () => getSuggestions(displayValue, model, currentCellId, pathMaps),
    [displayValue, model, currentCellId, pathMaps]
  );

  useEffect(() => {
    setHighlightIndex(-1);
  }, [suggestions]);

  const commit = useCallback(() => {
    try {
      const code = formulaDisplayToCode(displayValue, model);
      if (code !== value) onChange(code);
    } catch {
      /* keep local text */
    }
  }, [displayValue, model, onChange, value]);

  /**
   * Insert a suggestion.
   * mode: 'expand' → append '.' and keep dropdown open for deeper navigation
   * mode: 'select' → insert [t-1] and finish
   */
  const insertSuggestion = (insertPath: string, mode: 'expand' | 'select') => {
    const info = getLastTablePrefix(displayValue);
    const suffix = mode === 'expand' ? '.' : '[t-1]';
    if (info) {
      const before = displayValue.slice(0, info.start);
      const after = displayValue.slice(info.end);
      setDisplayValue(before + insertPath + suffix + after);
    } else {
      setDisplayValue(displayValue + insertPath + suffix);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setHighlightIndex((p) => (p >= suggestions.length - 1 ? 0 : p + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length === 0) return;
      setHighlightIndex((p) => (p <= 0 ? suggestions.length - 1 : p - 1));
    } else if (e.key === 'Enter') {
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        e.preventDefault();
        const s = suggestions[highlightIndex];
        insertSuggestion(s.displayInsert, s.isLeaf ? 'select' : 'expand');
      } else {
        commit();
        setExpanded(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setExpanded(false);
    }
  };

  // Compact mode: show badge with tooltip, expand on click
  if (mode === 'compact') {
    return (
      <div style={{ position: 'relative' }}>
        <div
          onClick={() => onFocus?.()}
          title={displayValue || value}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            userSelect: 'none',
            background: value ? '#e3f2fd' : '#f5f5f5',
            color: value ? '#1976d2' : '#999',
            border: '1px solid',
            borderColor: value ? '#bbdefb' : '#e0e0e0',
            minWidth: 32,
          }}
        >
          {value ? 'ƒ =' : '−'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        autoFocus
        value={displayValue}
        onChange={(e) => setDisplayValue(e.target.value)}
        onFocus={() => setExpanded(true)}
        onBlur={() => {
          setTimeout(() => {
            setExpanded(false);
            commit();
            onBlur?.();
          }, 150);
        }}
        onKeyDown={handleKeyDown}
        placeholder="=..."
        style={{ width: '100%', padding: '4px', fontFamily: 'monospace', fontSize: 12 }}
      />
      {expanded && suggestions.length > 0 && (
        <div
          style={{
            position: 'relative',
            zIndex: 100,
            width: '100%',
            minWidth: 200,
            marginTop: 2,
            border: '1px solid #ddd',
            borderRadius: 4,
            background: '#fff',
            maxHeight: 180,
            overflowY: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          {suggestions.map((s, idx) => {
            const isHl = idx === highlightIndex;
            return (
              <div
                key={idx}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e: any) => {
                  e.preventDefault();
                  if (e.detail === 1) {
                    // first click – start delayed expand
                    clickTimerRef.current = window.setTimeout(() => {
                      clickTimerRef.current = 0;
                      insertSuggestion(
                        s.displayInsert,
                        s.isLeaf ? 'select' : 'expand'
                      );
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }, 280);
                  } else if (e.detail === 2) {
                    // double-click → always select (finish)
                    if (clickTimerRef.current) {
                      clearTimeout(clickTimerRef.current);
                      clickTimerRef.current = 0;
                    }
                    insertSuggestion(s.displayInsert, 'select');
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
                style={{
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  borderBottom: '1px solid #f0f0f0',
                  background: isHl ? '#e3f2fd' : '#fff',
                }}
              >
                <span style={{ fontWeight: 500 }}>{s.label}</span>
                <span style={{ color: '#888', fontSize: 11, whiteSpace: 'nowrap' }}>
                  {s.detail}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ---------- Helpers ---------- */

interface Suggestion {
  label: string;
  detail: string;
  displayInsert: string;
  isLeaf: boolean;
}

interface PathMaps {
  nameToCodes: Map<string, string[]>;
  codeToPath: Map<string, string>;
  pathToCode: Map<string, string>;
}

function buildPathMaps(model: ModelDefinition): PathMaps {
  const nameToCodes = new Map<string, string[]>();
  const codeToTableName = new Map<string, string>();
  const codeToParentId = new Map<string, string | null>();

  for (const c of model.cells) {
    codeToTableName.set(
      c.code,
      model.tables.find((t) => t.id === c.tableId)?.name ?? c.tableId
    );
    codeToParentId.set(c.code, c.parentId ?? null);
    const arr = nameToCodes.get(c.name) ?? [];
    if (!arr.includes(c.code)) arr.push(c.code);
    nameToCodes.set(c.name, arr);
  }

  const codeToPath = new Map<string, string>();
  for (const c of model.cells) {
    const tblName = codeToTableName.get(c.code) ?? '';
    const parts: string[] = [];
    let curId: string | null = c.id;
    while (curId) {
      const cc = model.cells.find((x) => x.id === curId);
      if (!cc) break;
      parts.unshift(cc.name);
      curId = codeToParentId.get(cc.code) ?? null;
    }
    codeToPath.set(c.code, `${tblName}.${parts.join('.')}`);
  }

  const pathToCode = new Map<string, string>();
  for (const [code, path] of codeToPath.entries()) {
    pathToCode.set(path, code);
  }

  return { nameToCodes, codeToPath, pathToCode };
}

function cellToSuggestion(
  cell: CellDefinition,
  tableName: string,
  codeToPath: Map<string, string>,
  model: ModelDefinition
): Suggestion {
  const fullPath = codeToPath.get(cell.code) ?? `${tableName}.${cell.name}`;
  const hasChildren = model.cells.some((child) => child.parentId === cell.id);
  return {
    label: fullPath,
    detail: `${cell.code ?? ''}${hasChildren ? ' ▶' : ''}`.trim(),
    displayInsert: fullPath,
    isLeaf: !hasChildren,
  };
}

function getSuggestions(
  text: string,
  model: ModelDefinition,
  currentCellId: string,
  pathMaps: PathMaps
): Suggestion[] {
  const trimmed = (text || '').trimEnd();
  if (!trimmed) return [];

  const prefix = getLastTablePrefix(trimmed);
  if (!prefix) {
    const lastChar = trimmed.slice(-1);
    if (lastChar === '=' || lastChar === '' || /[+\-*/(),\s]/.test(lastChar)) {
      return [
        ...model.tables.map((t) => ({
          label: t.name,
          detail: '表 ▶',
          displayInsert: t.name + '.',
          isLeaf: false,
        })),
        { label: '参数', detail: '全局参数 ▶', displayInsert: '参数.', isLeaf: false },
      ];
    }
    return [];
  }

  const path = prefix.path;

  // 参数 namespace
  if (path === '参数') {
    // User just typed "参数." → show top-level params
    const topLevel = model.parameters.filter((p) => !p.parentId);
    return topLevel.map((p) => ({
      label: p.name,
      detail: p.code ?? '参数',
      displayInsert: '参数.' + p.name,
      isLeaf: !model.parameters.some((pp) => pp.parentId === p.id),
    }));
  }

  const paramPrefix = '参数.';
  if (path.startsWith(paramPrefix)) {
    // e.g. "参数.总投资" or "参数.总投资.建设投资"
    const segments = path.slice(paramPrefix.length).split('.');
    // Try to find the parameter matching the last segment (or cumulative match)
    // Strategy: walk from root. Find param whose code or name matches segments.
    let matchedParam: ParameterDefinition | undefined;
    let currentCandidates = model.parameters.filter((p) => !p.parentId);
    for (const seg of segments) {
      matchedParam = currentCandidates.find((p) =>
        p.code === seg || p.name === seg
      );
      if (!matchedParam) break;
      currentCandidates = model.parameters.filter((p) => p.parentId === matchedParam!.id);
    }

    if (matchedParam) {
      const children = model.parameters.filter((p) => p.parentId === matchedParam!.id);
      return children.map((p) => ({
        label: p.name,
        detail: p.code ?? '',
        displayInsert: paramPrefix + segments.slice(0, segments.length - 1).join('.') + (segments.length > 1 ? '.' : '') + p.name,
        isLeaf: !model.parameters.some((pp) => pp.parentId === p.id),
      }));
    }

    // Partial match: suggest all top-level params whose name starts with last segment
    if (segments.length > 0) {
      const lastSeg = segments[segments.length - 1];
      const candidates = model.parameters.filter(
        (p) => !p.parentId && p.name.startsWith(lastSeg)
      );
      if (candidates.length > 0) {
        return candidates.map((p) => ({
          label: p.name,
          detail: p.code ?? '',
          displayInsert: paramPrefix + p.name,
          isLeaf: !model.parameters.some((pp) => pp.parentId === p.id),
        }));
      }
    }
    return [];
  }

  const parts = path.split('.');
  const tableName = parts[0];
  const table = model.tables.find((t) => t.name === tableName);
  if (!table) return [];

  const { codeToPath, pathToCode } = pathMaps;

  // Table root → show top-level cells only (parentId === null)
  if (parts.length === 1) {
    return model.cells
      .filter((c) => c.tableId === table.id && c.parentId === null)
      .map((cell) => cellToSuggestion(cell, tableName, codeToPath, model));
  }

  // Deeper path → find exact cell and list its children
  const code = pathToCode.get(path);
  if (code) {
    const parentCell = model.cells.find(
      (c) => c.code === code && c.tableId === table.id
    );
    if (parentCell) {
      const children = model.cells.filter(
        (c) => c.tableId === table.id && c.parentId === parentCell.id
      );
      return children.map((cell) => cellToSuggestion(cell, tableName, codeToPath, model));
    }
  }

  // No exact match → suggest cells whose display path starts with this prefix
  const prefixWithDot = path + '.';
  const candidates = model.cells.filter(
    (c) =>
      c.tableId === table.id &&
      (codeToPath.get(c.code) ?? '').startsWith(prefixWithDot)
  );
  if (candidates.length > 0) {
    return candidates.map((cell) => cellToSuggestion(cell, tableName, codeToPath, model));
  }

  return [];
}

function getLastTablePrefix(text: string): { path: string; start: number; end: number } | null {
  let i = text.length - 1;
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (i < 0 || text[i] !== '.') return null;

  const end = i + 1;
  i--;
  let start = i;

  while (start >= 0 && /[\w\u4e00-\u9fff.]/.test(text[start])) {
    start--;
  }

  const path = text.slice(start + 1, end - 1);
  if (!path) return null;

  if (start >= 0 && !/[+\-*/(),\s=]/.test(text[start])) {
    return null;
  }
  return { path, start: start + 1, end };
}
