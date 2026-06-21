import React, { useEffect, useRef } from 'react';
import { useTheme } from '../ThemeContext.js';

interface ContextMenuItem {
  label: string;
  onClick: () => void;
  icon?: string;
  disabled?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const { theme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // 按 Esc 关闭菜单
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 确保菜单不超出视口右边界
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 1000,
    background: theme.dropdownBg,
    border: `1px solid ${theme.borderSecondary}`,
    borderRadius: 6,
    boxShadow: theme.shadowDropdown,
    minWidth: 160,
    padding: '4px 0',
    fontSize: 13,
  };

  return (
    <div ref={menuRef} style={menuStyle} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, idx) =>
        item.divider ? (
          <div
            key={`divider-${idx}`}
            style={{
              height: 1,
              background: theme.borderSecondary,
              margin: '4px 0',
            }}
          />
        ) : (
          <button
            key={item.label}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              background: 'transparent',
              color: item.disabled ? theme.textTertiary : theme.textPrimary,
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              fontSize: 13,
              textAlign: 'left',
              whiteSpace: 'nowrap',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.currentTarget as HTMLButtonElement).style.background = theme.dropdownHover;
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            {item.icon && <span style={{ fontSize: 14 }}>{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      )}
    </div>
  );
};
