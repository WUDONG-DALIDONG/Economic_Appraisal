import React, { useEffect, useRef } from 'react';
import { useTheme } from '../ThemeContext.js';

interface FloatingToolbarProps {
  x: number;
  y: number;
  currentPrecision: number;
  currentValueType?: 'number' | 'percentage';
  currentUseGrouping?: boolean;
  onSelect: (precision: number) => void;
  onValueTypeChange?: (type: 'number' | 'percentage') => void;
  onUseGroupingChange?: (v: boolean) => void;
  onClose: () => void;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  x,
  y,
  currentPrecision,
  currentValueType,
  currentUseGrouping,
  onSelect,
  onValueTypeChange,
  onUseGroupingChange,
  onClose,
}) => {
  const { theme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const PRECISIONS = [0, 1, 2, 3, 4, 5, 6];

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y - 36,
        display: 'flex',
        gap: 0,
        background: theme.bgTertiary,
        border: `1px solid ${theme.borderPrimary}`,
        borderRadius: 6,
        boxShadow: theme.shadowDropdown,
        padding: 2,
        zIndex: 999,
      }}
    >
      {PRECISIONS.map((p) => {
        const isActive = currentPrecision === p;
        return (
          <button
            key={p}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(p);
              onClose();
            }}
            style={{
              width: 28,
              height: 26,
              border: 'none',
              borderRadius: 4,
              background: isActive ? theme.accent : 'transparent',
              color: isActive ? theme.btnPrimaryText : theme.textSecondary,
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'monospace',
              fontWeight: isActive ? 600 : 400,
              padding: 0,
            }}
            title={`${p} 位小数${p === 2 ? ' (默认)' : ''}`}
          >
            {p}d
          </button>
        );
      })}
      {onUseGroupingChange && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUseGroupingChange(!(currentUseGrouping !== false));
            onClose();
          }}
          style={{
            width: 28,
            height: 26,
            border: 'none',
            borderRadius: 4,
            background: currentUseGrouping !== false ? theme.accent : 'transparent',
            color: currentUseGrouping !== false ? theme.btnPrimaryText : theme.textSecondary,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: currentUseGrouping !== false ? 600 : 400,
            padding: 0,
          }}
          title={currentUseGrouping !== false ? '关闭千分位' : '开启千分位'}
        >
          ,
        </button>
      )}
      {onValueTypeChange && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onValueTypeChange(currentValueType === 'percentage' ? 'number' : 'percentage');
            onClose();
          }}
          style={{
            width: 28,
            height: 26,
            border: 'none',
            borderRadius: 4,
            background: currentValueType === 'percentage' ? theme.accent : 'transparent',
            color: currentValueType === 'percentage' ? theme.btnPrimaryText : theme.textSecondary,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: currentValueType === 'percentage' ? 600 : 400,
            padding: 0,
          }}
          title={currentValueType === 'percentage' ? '切换为数值' : '切换为百分比'}
        >
          %
        </button>
      )}
    </div>
  );
};
