import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ModelDefinition,
  CellDefinition,
  ParameterDefinition,
  formulaIdToDisplay,
  formulaDisplayToId,
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

  useEffect(() => {
    try {
      setDisplayValue(formulaIdToDisplay(value, model));
    } catch {
      setDisplayValue(value);
    }
  }, [value, model]);

  const idMaps = useMemo(() => buildIdMaps(model), [model]);

  const suggestions = useMemo(
    () => getSuggestions(displayValue, model, currentCellId, idMaps),
    [displayValue, model, currentCellId, idMaps]
  );

  useEffect(() => {
    setHighlightIndex(-1);
  }, [suggestions]);

  const commit = useCallback(() => {
    try {
      const idFormula = formulaDisplayToId(displayValue, model);
      if (idFormula !== value) onChange(idFormula);
    } catch {
      /* keep local text */
    }
  }, [displayValue, model, onChange, value]);

  const insertSuggestion = (s: Suggestion, mode: 'expand' | 'select') => {
    const info = getLastTablePrefix(displayValue);
    let suffix: string;
    if (mode === 'expand') {
      suffix = '.';
    } else if (s.isParameter) {
      suffix = '';
    } else if (s.refId === currentCellId) {
      suffix = '[t-1]';
    } else {
      suffix = '';
    }
    if (info) {
      const before = displayValue.slice(0, info.start);
      const after = displayValue.slice(info.end);
      setDisplayValue(before + s.displayInsert + suffix + after);
    } else {
      setDisplayValue(displayValue + s.displayInsert + suffix);
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
        insertSuggestion(s, s.isLeaf ? 'select' : 'expand');
      } else {
        commit();
        setExpanded(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setExpanded(false);
    }
  };

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
                    clickTimerRef.current = window.setTimeout(() => {
                      clickTimerRef.current = 0;
                      insertSuggestion(s, s.isLeaf ? 'select' : 'expand');
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }, 280);
                  } else if (e.detail === 2) {
                    if (clickTimerRef.current) {
                      clearTimeout(clickTimerRef.current);
                      clickTimerRef.current = 0;
                    }
                    insertSuggestion(s, 'select');
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
  refId?: string;
  isParameter?: boolean;
}

interface IdMaps {
  cellIdToPath: Map<string, string>;
  cellPathToId: Map<string, string>;
  paramIdToPath: Map<string, string>;
  paramPathToId: Map<string, string>;
}

function buildIdMaps(model: ModelDefinition): IdMaps {
  const idToCell = new Map(model.cells.map(c => [c.id, c]));
  const idToTableName = new Map<string, string>();
  for (const c of model.cells) {
    idToTableName.set(c.id, model.tables.find(t => t.id === c.tableId)?.name ?? c.tableId);
  }

  const cellIdToPath = new Map<string, string>();
  for (const c of model.cells) {
    const tblName = idToTableName.get(c.id) ?? '';
    const parts: string[] = [];
    let curId: string | null = c.id;
    while (curId) {
      const cc = idToCell.get(curId);
      if (!cc) break;
      parts.unshift(cc.name);
      curId = cc.parentId ?? null;
    }
    cellIdToPath.set(c.id, `${tblName}.${parts.join('.')}`);
  }

  const cellPathToId = new Map<string, string>();
  for (const [id, path] of cellIdToPath.entries()) {
    cellPathToId.set(path, id);
  }

  const idToParam = new Map(model.parameters.map(p => [p.id, p]));
  const paramIdToPath = new Map<string, string>();
  for (const p of model.parameters) {
    const parts: string[] = [];
    let curId: string | null = p.id;
    while (curId) {
      const pp = idToParam.get(curId);
      if (!pp) break;
      parts.unshift(pp.name);
      curId = pp.parentId ?? null;
    }
    paramIdToPath.set(p.id, `参数.${parts.join('.')}`);
  }

  const paramPathToId = new Map<string, string>();
  for (const [id, path] of paramIdToPath.entries()) {
    paramPathToId.set(path, id);
  }

  return { cellIdToPath, cellPathToId, paramIdToPath, paramPathToId };
}

function cellToSuggestion(
  cell: CellDefinition,
  idMaps: IdMaps,
  model: ModelDefinition
): Suggestion {
  const fullPath = idMaps.cellIdToPath.get(cell.id) ?? cell.name;
  const hasChildren = model.cells.some((child) => child.parentId === cell.id);
  return {
    label: fullPath,
    detail: hasChildren ? '▶' : '',
    displayInsert: fullPath,
    isLeaf: !hasChildren,
    refId: cell.id,
  };
}

function paramToSuggestion(
  param: ParameterDefinition,
  displayPath: string,
  model: ModelDefinition
): Suggestion {
  const hasChildren = model.parameters.some((p) => p.parentId === param.id);
  return {
    label: param.name,
    detail: hasChildren ? '▶' : '',
    displayInsert: displayPath,
    isLeaf: !hasChildren,
    isParameter: true,
    refId: param.id,
  };
}

function getSuggestions(
  text: string,
  model: ModelDefinition,
  _currentCellId: string,
  idMaps: IdMaps
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

  if (path === '参数') {
    const topLevel = model.parameters.filter((p) => !p.parentId);
    return topLevel.map((p) =>
      paramToSuggestion(p, '参数.' + p.name, model)
    );
  }

  const paramPrefix = '参数.';
  if (path.startsWith(paramPrefix)) {
    const segments = path.slice(paramPrefix.length).split('.');
    let matchedParam: ParameterDefinition | undefined;
    let currentCandidates = model.parameters.filter((p) => !p.parentId);
    for (const seg of segments) {
      matchedParam = currentCandidates.find((p) => p.name === seg);
      if (!matchedParam) break;
      currentCandidates = model.parameters.filter((p) => p.parentId === matchedParam!.id);
    }

    if (matchedParam) {
      const children = model.parameters.filter((p) => p.parentId === matchedParam!.id);
      const parentPath = '参数.' + segments.join('.');
      return children.map((p) =>
        paramToSuggestion(p, parentPath + '.' + p.name, model)
      );
    }

    if (segments.length > 0) {
      const lastSeg = segments[segments.length - 1];
      const candidates = model.parameters.filter(
        (p) => !p.parentId && p.name.startsWith(lastSeg)
      );
      if (candidates.length > 0) {
        return candidates.map((p) =>
          paramToSuggestion(p, paramPrefix + p.name, model)
        );
      }
    }
    return [];
  }

  const parts = path.split('.');
  const tableName = parts[0];
  const table = model.tables.find((t) => t.name === tableName);
  if (!table) return [];

  const { cellIdToPath, cellPathToId } = idMaps;

  if (parts.length === 1) {
    return model.cells
      .filter((c) => c.tableId === table.id && c.parentId === null)
      .map((cell) => cellToSuggestion(cell, idMaps, model));
  }

  const cellId = cellPathToId.get(path);
  if (cellId) {
    const parentCell = model.cells.find(
      (c) => c.id === cellId && c.tableId === table.id
    );
    if (parentCell) {
      const children = model.cells.filter(
        (c) => c.tableId === table.id && c.parentId === parentCell.id
      );
      return children.map((cell) => cellToSuggestion(cell, idMaps, model));
    }
  }

  const prefixWithDot = path + '.';
  const candidates = model.cells.filter(
    (c) =>
      c.tableId === table.id &&
      (cellIdToPath.get(c.id) ?? '').startsWith(prefixWithDot)
  );
  if (candidates.length > 0) {
    return candidates.map((cell) => cellToSuggestion(cell, idMaps, model));
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
