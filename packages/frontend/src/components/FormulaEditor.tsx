import React, { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import { ModelDefinition, formulaIdToDisplay, formulaDisplayToId, normalizeFullwidth } from '@economic/core';
import { useTheme } from '../ThemeContext.js';

interface FormulaEditorProps {
  value: string;
  onChange: (value: string) => void;
  model: ModelDefinition;
  currentCellId: string;
  mode?: 'compact' | 'expanded';
  scope?: 'all' | 'parameters-only';
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface FormulaEditorRef {
  commit: () => void;
}

export const FormulaEditor = forwardRef<FormulaEditorRef, FormulaEditorProps>(({
  value,
  onChange,
  model,
  currentCellId,
  mode = 'expanded',
  scope = 'all',
  onFocus,
  onBlur,
}, ref) => {
  const { theme } = useTheme();
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
    () => getSuggestions(displayValue, model, currentCellId, idMaps, scope),
    [displayValue, model, currentCellId, idMaps, scope]
  );

  useEffect(() => {
    setHighlightIndex(-1);
  }, [suggestions]);

  const commit = useCallback(() => {
    try {
      const idFormula = formulaDisplayToId(displayValue, model);
      if (idFormula !== value) onChange(idFormula);
    } catch (e: any) {
      console.warn('[FormulaEditor] formulaDisplayToId failed:', e.message, '| display=', displayValue);
    }
  }, [displayValue, model, onChange, value]);

  useImperativeHandle(ref, () => ({ commit }), [commit]);

  const insertSuggestion = (s: Suggestion, mode: 'expand' | 'select') => {
    const info = getLastTablePrefix(displayValue);
    let suffix: string;
    if (mode === 'expand') {
      suffix = s.displayInsert.endsWith('.') ? '' : '.';
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
            background: theme.bgPrimaryLight,
            color: theme.accent,
            border: '1px solid',
            borderColor: theme.badgeBorder,
            minWidth: 32,
          }}
        >
          ƒ =
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
        onChange={(e) => setDisplayValue(normalizeFullwidth(e.target.value))}
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
            border: `1px solid ${theme.borderPrimary}`,
            borderRadius: 4,
            background: theme.dropdownBg,
            maxHeight: 180,
            overflowY: 'auto',
            boxShadow: theme.shadowDropdown,
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
                  borderBottom: `1px solid ${theme.bgQuaternary}`,
                  background: isHl ? theme.bgPrimaryLight : theme.dropdownBg,
                }}
              >
                <span style={{ fontWeight: 500 }}>{s.label}</span>
                <span style={{ color: theme.textTertiary, fontSize: 11, whiteSpace: 'nowrap' }}>
                  {s.detail}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

/* ---------- 辅助函数 ---------- */

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
    paramIdToPath.set(p.id, `全局参数.${parts.join('.')}`);
  }

  const paramPathToId = new Map<string, string>();
  for (const [id, path] of paramIdToPath.entries()) {
    paramPathToId.set(path, id);
  }

  return { cellIdToPath, cellPathToId, paramIdToPath, paramPathToId };
}

function cellToSuggestion(
  cell: any,
  idMaps: IdMaps,
  model: ModelDefinition
): Suggestion {
  const fullPath = idMaps.cellIdToPath.get(cell.id) ?? cell.name;
  const hasChildren = model.cells.some((child: any) => child.parentId === cell.id);
  return {
    label: (cell.code ? cell.code + ' ' : '') + fullPath,
    detail: hasChildren ? '▶' : '',
    displayInsert: fullPath,
    isLeaf: !hasChildren,
    refId: cell.id,
  };
}

function paramToSuggestion(
  param: any,
  displayPath: string,
  model: ModelDefinition
): Suggestion {
  const hasChildren = model.parameters.some((p: any) => p.parentId === param.id);
  return {
    label: (param.code ? param.code + ' ' : '') + param.name,
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
  idMaps: IdMaps,
  scope: 'all' | 'parameters-only' = 'all'
): Suggestion[] {
  const trimmed = (text || '').trimEnd();
  if (!trimmed) return [];

  // 构建有效的参数ID集合，用于校验 parentId 有效性
  const validParamIds = new Set<string>(model.parameters.map((p: any) => p.id));

  // 辅助函数：判断是否为顶层参数（无 parentId 或 parentId 指向不存在的参数）
  const isTopLevelParam = (p: any) => !p.parentId || !validParamIds.has(p.parentId);

  const prefix = getLastTablePrefix(trimmed);
  if (!prefix) {
    const lastChar = trimmed.slice(-1);
    if (lastChar === '=' || lastChar === '' || /[+\-*/(),\s]/.test(lastChar)) {
      if (scope === 'parameters-only') {
        // 全局参数模式：直接展示一级参数，跳过"全局参数 ▶"中间步骤
        return model.parameters
          .filter((p: any) => isTopLevelParam(p))
          .map((p: any) => paramToSuggestion(p, '全局参数.' + p.name, model));
      }
      const result: Suggestion[] = [];
      result.push(...model.tables.map((t) => ({
        label: t.name,
        detail: '表 ▶',
        displayInsert: t.name + '.',
        isLeaf: false,
      })));
      result.push({ label: '全局参数', detail: '全局参数 ▶', displayInsert: '全局参数.', isLeaf: false });
      return result;
    }
    return [];
  }

  const path = prefix.path;

  if (path === '全局参数') {
    const topLevel = model.parameters.filter((p: any) => isTopLevelParam(p));
    return topLevel.map((p: any) =>
      paramToSuggestion(p, '全局参数.' + p.name, model)
    );
  }

  const paramPrefix = '全局参数.';
  if (path.startsWith(paramPrefix)) {
    const segments = path.slice(paramPrefix.length).split('.');
    let matchedParam: any;
    let currentCandidates = model.parameters.filter((p: any) => isTopLevelParam(p));
    for (const seg of segments) {
      matchedParam = currentCandidates.find((p: any) => p.name === seg);
      if (!matchedParam) break;
      currentCandidates = model.parameters.filter((p: any) => p.parentId === matchedParam!.id);
    }

    if (matchedParam) {
      const children = model.parameters.filter((p: any) => p.parentId === matchedParam!.id);
      const parentPath = '全局参数.' + segments.join('.');
      return children.map((p: any) =>
        paramToSuggestion(p, parentPath + '.' + p.name, model)
      );
    }

    if (segments.length > 0) {
      const lastSeg = segments[segments.length - 1];
      const candidates = model.parameters.filter(
        (p: any) => isTopLevelParam(p) && p.name.startsWith(lastSeg)
      );
      if (candidates.length > 0) {
        return candidates.map((p: any) =>
          paramToSuggestion(p, paramPrefix + p.name, model)
        );
      }
    }
    return [];
  }

  const parts = path.split('.');
  const tableName = parts[0];
  if (scope === 'parameters-only' && tableName !== '全局参数') return [];

  const table = model.tables.find((t) => t.name === tableName);
  if (!table) return [];

  const { cellIdToPath, cellPathToId } = idMaps;

  if (parts.length === 1) {
    return model.cells
      .filter((c: any) => c.tableId === table.id && c.parentId === null)
      .map((cell: any) => cellToSuggestion(cell, idMaps, model));
  }

  const cellId = cellPathToId.get(path);
  if (cellId) {
    const parentCell = model.cells.find(
      (c: any) => c.id === cellId && c.tableId === table.id
    );
    if (parentCell) {
      const children = model.cells.filter(
        (c: any) => c.tableId === table.id && c.parentId === parentCell.id
      );
      return children.map((cell: any) => cellToSuggestion(cell, idMaps, model));
    }
  }

  const prefixWithDot = path + '.';
  const candidates = model.cells.filter(
    (c: any) =>
      c.tableId === table.id &&
      (cellIdToPath.get(c.id) ?? '').startsWith(prefixWithDot)
  );
  if (candidates.length > 0) {
    return candidates.map((cell: any) => cellToSuggestion(cell, idMaps, model));
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

  while (start >= 0 && /[\w\u4e00-\u9fff.()（）：: ]/.test(text[start])) {
    start--;
  }

  const path = text.slice(start + 1, end - 1);
  if (!path) return null;

  if (start >= 0 && !/[+\-*/(),\s=]/.test(text[start])) {
    return null;
  }
  return { path, start: start + 1, end };
}
