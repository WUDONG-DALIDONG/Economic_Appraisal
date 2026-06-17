import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Theme, lightTheme, darkTheme } from './theme.js';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  mode: 'light',
  toggle: () => {},
});

export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = 'economic-appraisal-theme';

function getInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyCSSVars(theme: Theme) {
  const root = document.documentElement;
  root.style.setProperty('--bg-primary', theme.bgPrimary);
  root.style.setProperty('--bg-secondary', theme.bgSecondary);
  root.style.setProperty('--bg-tertiary', theme.bgTertiary);
  root.style.setProperty('--bg-quaternary', theme.bgQuaternary);
  root.style.setProperty('--bg-construction', theme.bgConstruction);
  root.style.setProperty('--bg-construction-header', theme.bgConstructionHeader);
  root.style.setProperty('--bg-error', theme.bgError);
  root.style.setProperty('--bg-success', theme.bgSuccess);
  root.style.setProperty('--bg-warning', theme.bgWarning);
  root.style.setProperty('--bg-primary-light', theme.bgPrimaryLight);
  root.style.setProperty('--bg-overlay', theme.bgOverlay);
  root.style.setProperty('--border-primary', theme.borderPrimary);
  root.style.setProperty('--border-secondary', theme.borderSecondary);
  root.style.setProperty('--border-tertiary', theme.borderTertiary);
  root.style.setProperty('--text-primary', theme.textPrimary);
  root.style.setProperty('--text-secondary', theme.textSecondary);
  root.style.setProperty('--text-tertiary', theme.textTertiary);
  root.style.setProperty('--text-placeholder', theme.textPlaceholder);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-light', theme.accentLight);
  root.style.setProperty('--accent-hover', theme.accentHover);
  root.style.setProperty('--error', theme.error);
  root.style.setProperty('--error-deep', theme.errorDeep);
  root.style.setProperty('--success', theme.success);
  root.style.setProperty('--success-deep', theme.successDeep);
  root.style.setProperty('--warning', theme.warning);
  root.style.setProperty('--formula-blue', theme.formulaBlue);
  root.style.setProperty('--select-bg', theme.selectBg);
  root.style.setProperty('--input-border', theme.inputBorder);
  root.style.setProperty('--dropdown-bg', theme.dropdownBg);
  root.style.setProperty('--dropdown-hover', theme.dropdownHover);
  root.style.setProperty('--btn-primary-bg', theme.btnPrimaryBg);
  root.style.setProperty('--btn-primary-text', theme.btnPrimaryText);
  root.style.setProperty('--btn-outline-bg', theme.btnOutlineBg);
  root.style.setProperty('--btn-outline-border', theme.btnOutlineBorder);
  root.style.setProperty('--btn-outline-text', theme.btnOutlineText);
  root.style.setProperty('--tab-active-border', theme.tabActiveBorder);
  root.style.setProperty('--shadow-dropdown', theme.shadowDropdown);
  root.style.setProperty('--shadow-modal', theme.shadowModal);
  root.style.setProperty('--badge-border', theme.badgeBorder);
  root.style.setProperty('--badge-no-value-border', theme.badgeNoValueBorder);
  root.style.setProperty('--badge-no-value-bg', theme.badgeNoValueBg);
  root.style.setProperty('--badge-no-value-text', theme.badgeNoValueText);
  root.style.setProperty('--input-focus-border', theme.inputFocusBorder);
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode);
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    applyCSSVars(theme);
    document.documentElement.setAttribute('data-theme', mode);
  }, [theme, mode]);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, mode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
};
