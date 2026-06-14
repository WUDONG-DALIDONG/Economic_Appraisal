import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TableEditor, CellList } from '../src/components/TableEditor';
import { CellType } from '@economic/core';

describe('CellList', () => {
  it('renders empty state', () => {
    render(<CellList cells={[]} />);
    expect(screen.getByText('无单元格')).toBeDefined();
  });

  it('renders cells with formula and type', () => {
    const cells = [
      { id: 'c1', name: '收入', tableId: 't1', formula: '=100', type: CellType.Formula, unit: '万元', isArray: false },
      { id: 'c2', name: '成本', tableId: 't1', formula: '=50', type: CellType.Formula, unit: '万元', isArray: false },
    ];
    render(<CellList cells={cells} />);
    expect(screen.getByText('收入')).toBeDefined();
    expect(screen.getByText('成本')).toBeDefined();
    expect(screen.getByText('=100')).toBeDefined();
    expect(screen.getByText('=50')).toBeDefined();
  });
});

describe('TableEditor', () => {
  it('renders table name and cells', () => {
    const table = { id: 't1', name: '利润表', order: 0 };
    const cells = [
      { id: 'c1', name: '营业收入', tableId: 't1', formula: '=表1.单价[t]*表1.数量[t]', type: CellType.Formula, unit: '万元', isArray: false },
    ];
    render(<TableEditor table={table} cells={cells} />);
    expect(screen.getByText('利润表')).toBeDefined();
    expect(screen.getByText('营业收入')).toBeDefined();
    expect(screen.getByText(/=表1\.单价/)).toBeDefined();
  });
});
