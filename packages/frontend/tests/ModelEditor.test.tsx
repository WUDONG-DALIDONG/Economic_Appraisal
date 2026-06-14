import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ModelEditor } from '../src/editor/ModelEditor';
import { ModelDefinition } from '@economic/core';

describe('ModelEditor', () => {
  const fakeModel: ModelDefinition = {
    id: 'test-model',
    name: 'Test Model',
    version: '1.0.0',
    description: 'A test financial model',
    tables: [],
    cells: [],
    parameters: [],
    timeline: { constructionYears: 1, operationYears: 20, startYear: 2024 },
    metadata: { author: 'test', createdAt: 'now', updatedAt: 'now' },
  };

  it('renders model name and version', () => {
    render(<ModelEditor model={fakeModel} />);
    expect(screen.getByText('Test Model')).toBeDefined();
    expect(screen.getByText(/v1\.0\.0/)).toBeDefined();
  });

  it('renders description', () => {
    render(<ModelEditor model={fakeModel} />);
    expect(screen.getByText('A test financial model')).toBeDefined();
  });

  it('renders timeline summary', () => {
    render(<ModelEditor model={fakeModel} />);
    expect(screen.getByText(/建设期/i)).toBeDefined();
    expect(screen.getByText(/运营期/i)).toBeDefined();
  });
});
