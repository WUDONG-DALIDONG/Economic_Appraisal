import React from 'react';
import { ThemeProvider } from './ThemeContext.js';
import { ModelWorkspace } from './editor/ModelWorkspace';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ModelWorkspace />
    </ThemeProvider>
  );
};
