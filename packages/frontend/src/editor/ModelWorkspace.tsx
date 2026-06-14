import React, { useReducer, useEffect, useCallback } from 'react';
import { ModelDefinition, renameTableInFormula, renameParamInFormula, extractTableReferences } from '@economic/core';
import { workspaceReducer, initialState } from '../types/workspace.js';
import { api } from '../hooks/useApi.js';
import { ModelListPanel } from '../components/ModelListPanel.js';
import { ParameterEditor } from './ParameterEditor.js';
import { TimelineEditor } from './TimelineEditor.js';
import { TableNavigator } from '../components/TableNavigator.js';
import { TableExcelView } from './TableExcelView.js';
import { ModelToolbar } from './ModelToolbar.js';
import { ComputePreview } from '../components/ComputePreview.js';
import { ValidationPanel, validateModel } from '../components/ValidationPanel.js';

export const ModelWorkspace: React.FC = () => {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const models = await api.get<Array<{ id: string; name: string }>>('/api/models');
      dispatch({ type: 'SET_MODELS', models });
    } catch (e: any) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    }
  }, []);

  const handleSelect = async (id: string) => {
    try {
      const model = await api.get<ModelDefinition>(`/api/models/${encodeURIComponent(id)}`);
      dispatch({ type: 'SELECT_MODEL', model, activeTableId: model.tables[0]?.id ?? null });
    } catch (e: any) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    }
  };

  const handleNew = () => {
    const newModel: ModelDefinition = {
      id: `model-${Date.now()}`,
      name: '新模型',
      version: '0.1.0',
      description: '',
      tables: [],
      cells: [],
      parameters: [],
      timeline: { constructionYears: 1, operationYears: 10, startYear: 2024 },
      metadata: { author: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    };
    dispatch({ type: 'SELECT_MODEL', model: newModel, activeTableId: null });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此模型？')) return;
    try {
      await api.delete(`/api/models/${encodeURIComponent(id)}`);
      await loadModels();
      if (state.currentModel?.id === id) {
        dispatch({ type: 'REMOVE_CURRENT_MODEL' });
      }
    } catch (e: any) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    }
  };

  const handleSaveCompute = async () => {
    if (!state.currentModel) return;
    const errors = validateModel(state.currentModel);
    if (errors.length > 0) {
      dispatch({ type: 'SET_ERROR', error: `校验失败: ${errors[0].message}` });
      return;
    }
    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      // Force every cell to isArray: true before sending
      const modelToSave: ModelDefinition = {
        ...state.currentModel,
        cells: state.currentModel.cells.map((c) => ({ ...c, isArray: true })),
      };
      const existing = state.models.find((m) => m.id === modelToSave.id);
      if (existing) {
        await api.put(`/api/models/${encodeURIComponent(modelToSave.id)}`, modelToSave);
      } else {
        await api.post('/api/models', modelToSave);
        await loadModels();
      }
      const result = await api.post<{
        cellCount: number;
        durationMs: number;
        errors: any[];
      }>(`/api/models/${encodeURIComponent(modelToSave.id)}/compute`, {});
      dispatch({ type: 'SET_COMPUTE_RESULT', result });
    } catch (e: any) {
      dispatch({ type: 'SET_ERROR', error: e.message });
    } finally {
      dispatch({ type: 'SET_LOADING', isLoading: false });
    }
  };

  const handleExport = () => {
    if (!state.currentModel) return;
    const modelId = state.currentModel.id;
    fetch(`/api/models/${encodeURIComponent(modelId)}/export`)
      .then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `${res.status} ${res.statusText}`);
        }
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${modelId}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(e => dispatch({ type: 'SET_ERROR', error: e.message }));
  };

  const handleValidate = () => {
    dispatch({ type: 'TOGGLE_VALIDATION' });
  };

  const updateModel = (updater: (m: ModelDefinition) => ModelDefinition) => {
    if (!state.currentModel) return;
    dispatch({ type: 'UPDATE_MODEL', model: updater({ ...state.currentModel }) });
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <ModelListPanel
        models={state.models}
        currentId={state.currentModel?.id ?? null}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
      />
      <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {state.error && (
          <div style={{ padding: 12, background: '#ffebee', color: '#c62828', borderRadius: 4, marginBottom: 16 }}>
            {state.error}
            <button onClick={() => dispatch({ type: 'CLEAR_ERROR' })} style={{ marginLeft: 12, fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: '#c62828' }}>关闭</button>
          </div>
        )}
        {state.currentModel ? (
          <div>
            <header style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <input
                    value={state.currentModel.name}
                    onChange={e => updateModel(m => ({ ...m, name: e.target.value }))}
                    style={{ padding: '6px 8px', fontSize: 20, fontWeight: 600, border: '1px solid transparent', borderBottom: '1px solid #ddd', background: 'transparent', width: 300 }}
                  />
                </div>
                <ModelToolbar
                  onSaveCompute={handleSaveCompute}
                  onExport={handleExport}
                  onValidate={handleValidate}
                  isLoading={state.isLoading}
                />
              </div>
              <input
                value={state.currentModel.description}
                onChange={e => updateModel(m => ({ ...m, description: e.target.value }))}
                placeholder="模型描述"
                style={{ padding: '4px 8px', fontSize: 13, color: '#666', border: '1px solid transparent', borderBottom: '1px solid #eee', background: 'transparent', width: '100%' }}
              />
            </header>

            {/* Tab Navigation */}
            <div style={{ marginBottom: 16, borderBottom: '1px solid #ddd' }}>
              {(
                [
                  { key: 'basic' as const, label: '基本信息' },
                  { key: 'table' as const, label: '表设计' },
                  { key: 'result' as const, label: '校验结果' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', tab: tab.key })}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderBottom:
                      state.activeWorkspaceTab === tab.key
                        ? '2px solid #1976d2'
                        : '2px solid transparent',
                    background: 'transparent',
                    color: state.activeWorkspaceTab === tab.key ? '#1976d2' : '#666',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: state.activeWorkspaceTab === tab.key ? 600 : 400,
                    marginRight: 8,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {state.activeWorkspaceTab === 'basic' && (
              <>
                <ParameterEditor
                  parameters={state.currentModel.parameters}
                  onChange={(params) => updateModel((m) => ({ ...m, parameters: params }))}
                  onRename={(oldName, newName) => {
                    const m = state.currentModel!;
                    if (oldName === newName) return;
                    // Uniqueness check vs other parameters
                    if (m.parameters.some((p) => p.name === newName)) {
                      alert(`参数名 "${newName}" 已存在`);
                      return;
                    }
                    // Uniqueness check vs table names (namespace overlap)
                    if (m.tables.some((t) => t.name === newName)) {
                      alert(`名称 "${newName}" 已被表使用，不能与表同名`);
                      return;
                    }
                    // Sync all cell formulas referencing 参数.oldName
                    const cells = m.cells.map((c) => {
                      if (!c.formula || c.formula === '') return c;
                      const updated = renameParamInFormula(c.formula, oldName, newName);
                      return updated === c.formula ? c : { ...c, formula: updated };
                    });
                    // Sync parameter formulas referencing 参数.oldName
                    const parameters = m.parameters.map((p) => {
                      if (!p.formula || p.formula === '') return p;
                      const updated = renameParamInFormula(p.formula, oldName, newName);
                      return updated === p.formula ? p : { ...p, formula: updated };
                    });
                    dispatch({ type: 'UPDATE_MODEL', model: { ...m, cells, parameters } });
                  }}
                />
                <TimelineEditor
                  timeline={state.currentModel.timeline}
                  onChange={(tl) => updateModel((m) => ({ ...m, timeline: tl }))}
                />
              </>
            )}

            {state.activeWorkspaceTab === 'table' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)' }}>
                <TableNavigator
                  tables={state.currentModel.tables}
                  activeId={state.activeTableId}
                  onSelect={(id) => dispatch({ type: 'SET_ACTIVE_TABLE', tableId: id })}
                  onAdd={(table) => {
                    const tables = [...state.currentModel!.tables, table];
                    dispatch({ type: 'UPDATE_MODEL', model: { ...state.currentModel!, tables } });
                    dispatch({ type: 'SET_ACTIVE_TABLE', tableId: table.id });
                  }}
                  onRename={(id, newName) => {
                    const oldName = state.currentModel!.tables.find((t) => t.id === id)?.name ?? '';
                    if (oldName === newName) return;
                    // Uniqueness check
                    if (state.currentModel!.tables.some((t) => t.id !== id && t.name === newName)) {
                      alert(`表名 "${newName}" 已存在，请使用其他名称`);
                      return;
                    }
                    // Rename table
                    let tables = state.currentModel!.tables.map((t) =>
                      t.id === id ? { ...t, name: newName } : t
                    );
                    // Sync all cell formulas referencing this table name
                    let cells = state.currentModel!.cells.map((c) => {
                      if (!c.formula || c.formula === '') return c;
                      const updated = renameTableInFormula(c.formula, oldName, newName);
                      return updated === c.formula ? c : { ...c, formula: updated };
                    });
                    // Sync parameter formulas referencing this table name
                    let parameters = state.currentModel!.parameters.map((p) => {
                      if (!p.formula || p.formula === '') return p;
                      const updated = renameTableInFormula(p.formula, oldName, newName);
                      return updated === p.formula ? p : { ...p, formula: updated };
                    });
                    dispatch({ type: 'UPDATE_MODEL', model: { ...state.currentModel!, tables, cells, parameters } });
                  }}
                  onDelete={(id) => {
                    const tableName = state.currentModel!.tables.find((t) => t.id === id)?.name ?? '';
                    // Check for external references to this table
                    const externalRefs: string[] = [];
                    for (const cell of state.currentModel!.cells) {
                      if (cell.tableId === id) continue;
                      const refs = extractTableReferences(cell.formula ?? '');
                      if (refs.some((r) => r.table === tableName)) {
                        externalRefs.push(`${cell.name || cell.id}`);
                      }
                    }
                    for (const param of state.currentModel!.parameters) {
                      const refs = extractTableReferences(param.formula ?? '');
                      if (refs.some((r) => r.table === tableName)) {
                        externalRefs.push(`参数.${param.name || param.id}`);
                      }
                    }
                    if (externalRefs.length > 0) {
                      if (!confirm(`表 "${tableName}" 被以下项引用：\n${externalRefs.join('\n')}\n\n仍要删除？这将破坏公式引用。`)) return;
                    } else {
                      if (!confirm(`确定删除表 "${tableName}"？`)) return;
                    }
                    const tables = state.currentModel!.tables.filter((t) => t.id !== id);
                    const cells = state.currentModel!.cells.filter((c) => c.tableId !== id);
                    const nextActive = tables[0]?.id ?? null;
                    dispatch({ type: 'UPDATE_MODEL', model: { ...state.currentModel!, tables, cells } });
                    dispatch({ type: 'SET_ACTIVE_TABLE', tableId: nextActive });
                  }}
                />
                {state.activeTableId ? (
                  <TableExcelView
                    model={state.currentModel}
                    activeTableId={state.activeTableId}
                    computeResult={state.computeResult}
                    onCellsChange={(cells) => {
                      dispatch({
                        type: 'UPDATE_MODEL',
                        model: { ...state.currentModel!, cells },
                      });
                    }}
                  />
                ) : (
                  <div style={{ padding: 32, color: '#999', textAlign: 'center' }}>
                    请选择一个表或点击"+ 新建表"
                  </div>
                )}
              </div>
            )}

            {state.activeWorkspaceTab === 'result' && (
              <>
                <ComputePreview result={state.computeResult} />
                <ValidationPanel model={state.currentModel} visible={state.validationVisible} />
              </>
            )}
          </div>
        ) : (
          <p style={{ color: '#888' }}>请选择一个模型或点击"新建"</p>
        )}
      </main>
    </div>
  );
};
