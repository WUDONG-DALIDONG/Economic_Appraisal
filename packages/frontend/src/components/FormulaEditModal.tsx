import React, { useState, useRef } from 'react';
import { ModelDefinition } from '@economic/core';
import { FormulaEditor, FormulaEditorRef } from './FormulaEditor.js';
import { useTheme } from '../ThemeContext.js';

interface FormulaEditModalProps {
  cellName?: string;
  cellCode?: string;
  cellId?: string;
  initialFormula?: string;
  title?: string;
  formula?: string;
  model: ModelDefinition;
  currentCellId?: string;
  scope?: 'all' | 'parameters-only';
  onSave: (formula: string) => void;
  onClose: () => void;
}

export const FormulaEditModal: React.FC<FormulaEditModalProps> = ({
  cellName,
  cellCode,
  cellId,
  initialFormula,
  title,
  formula: formulaProp,
  model,
  currentCellId,
  scope = 'all',
  onSave,
  onClose,
}) => {
  const { theme } = useTheme();
  const resolvedCellName = title || cellName || '';
  const resolvedCellCode = cellCode || '';
  const resolvedCellId = cellId || currentCellId || '';
  const resolvedInitialFormula = formulaProp || initialFormula || '';
  const [formula, setFormula] = useState(resolvedInitialFormula);
  const formulaRef = useRef(resolvedInitialFormula);
  const editorRef = useRef<FormulaEditorRef>(null);

  const handleChange = (code: string) => {
    formulaRef.current = code;
    setFormula(code);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const handleSave = () => {
    editorRef.current?.commit();
    onSave(formulaRef.current);
    onClose();
  };

  const handleSaveMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.bgOverlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      tabIndex={0}
    >
      <div
        style={{
          background: theme.bgPrimary,
          borderRadius: 8,
          boxShadow: theme.shadowModal,
          width: 640,
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${theme.borderTertiary}`,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary }}>
              编辑公式
            </div>
            <div style={{ fontSize: 13, color: theme.textSecondary, marginTop: 4 }}>
              {resolvedCellName}
              {resolvedCellCode ? ` (${resolvedCellCode})` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 20,
              cursor: 'pointer',
              color: theme.textPlaceholder,
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px' }}>
          <FormulaEditor
            ref={editorRef}
            value={formula}
            onChange={handleChange}
            model={model}
            currentCellId={resolvedCellId}
            mode="expanded"
            scope={scope}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '12px 20px 20px',
          }}
        >
          <button
            onMouseDown={handleSaveMouseDown}
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 4,
              border: `1px solid ${theme.inputBorder}`,
              background: theme.btnOutlineBg,
              color: theme.textPrimary,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            取消
          </button>
          <button
            onMouseDown={handleSaveMouseDown}
            onClick={handleSave}
            style={{
              padding: '8px 20px',
              borderRadius: 4,
              border: 'none',
              background: theme.btnPrimaryBg,
              color: theme.btnPrimaryText,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
};
