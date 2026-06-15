import React, { useState, useRef } from 'react';
import { ModelDefinition } from '@economic/core';
import { FormulaEditor } from './FormulaEditor.js';

interface FormulaEditModalProps {
  cellName: string;
  cellCode: string;
  cellId: string;
  initialFormula: string;
  model: ModelDefinition;
  onSave: (formula: string) => void;
  onClose: () => void;
}

export const FormulaEditModal: React.FC<FormulaEditModalProps> = ({
  cellName,
  cellCode,
  cellId,
  initialFormula,
  model,
  onSave,
  onClose,
}) => {
  const [formula, setFormula] = useState(initialFormula);
  const formulaRef = useRef(initialFormula);

  const handleChange = (code: string) => {
    formulaRef.current = code;
    setFormula(code);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const handleSave = () => {
    onSave(formulaRef.current);
    onClose();
  };

  return (
    <div
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      tabIndex={0}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          width: 640,
          maxWidth: '90vw',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #e0e0e0',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#333' }}>
              编辑公式
            </div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
              {cellName}
              {cellCode ? ` (${cellCode})` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 20,
              cursor: 'pointer',
              color: '#999',
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <FormulaEditor
            value={formula}
            onChange={handleChange}
            model={model}
            currentCellId={cellId}
            mode="expanded"
          />
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            padding: '12px 20px 20px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 4,
              border: '1px solid #d9d9d9',
              background: '#fff',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 20px',
              borderRadius: 4,
              border: 'none',
              background: '#1976d2',
              color: '#fff',
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
