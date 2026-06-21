import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { App } from '../src/App';

describe('App', () => {
  beforeAll(() => {
    global.fetch = vi.fn(async (url: string) => {
      if (url.endsWith('/api/models')) {
        return {
          ok: true,
          json: async () => [
            { id: 'demo-001', name: '光储项目财务模型' },
            { id: 'demo-002', name: '数据中心模型' },
          ],
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('renders model tree nav with model names', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('光储项目财务模型')).toBeDefined();
    });
    expect(screen.getByText('数据中心模型')).toBeDefined();
  });

  it('shows empty state when no model selected', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('请选择一个模型或点击"新建"')).toBeDefined();
    });
  });

  it('renders new model button', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('+ 新建模型')).toBeDefined();
    });
  });
});
