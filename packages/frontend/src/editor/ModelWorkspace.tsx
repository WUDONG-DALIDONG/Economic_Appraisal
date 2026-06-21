import React, { useReducer, useEffect, useCallback } from 'react';
import { ModelDefinition, renameTableInFormula, renameParamInFormula, extractTableReferences, ValueType, ComputeMode, formulaDisplayToId, normalizeFullwidth } from '@economic/core';
import { workspaceReducer, initialState } from '../types/workspace.js';
import { api } from '../hooks/useApi.js';
import { ModelTreeNav } from '../components/ModelTreeNav.js';
import { ParameterTreeEditor } from './ParameterTreeEditor.js';
import { TimelineEditor } from './TimelineEditor.js';
import { TableExcelView } from './TableExcelView.js';
import { ModelToolbar } from './ModelToolbar.js';
import { ComputePreview } from '../components/ComputePreview.js';
import { ValidationPanel, validateModel } from '../components/ValidationPanel.js';
import { useTheme } from '../ThemeContext.js';

export const ModelWorkspace: React.FC = () => {
  const { theme } = useTheme();
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
      parameters: [
        {
          id: `p-${Date.now()}`,
          name: '新参数',
          valueType: ValueType.Number,
          computeMode: ComputeMode.Input,
          defaultValue: 0,
          sortOrder: 0,
          parentId: null,
          formula: '',
        },
      ],
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
    // 修复 FormulaEditor onBlur 竞态：先 blur 活跃输入框，等待其 commit(setTimeout 150ms) 完成
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    const errors = validateModel(state.currentModel);
    if (errors.length > 0) {
      dispatch({ type: 'SET_ERROR', error: `校验失败: ${errors[0].message}` });
      return;
    }
    dispatch({ type: 'SET_LOADING', isLoading: true });
    try {
      const cells = state.currentModel.cells.map((c) => {
        let formula = c.formula;
        if (formula) {
          try {
            formula = formulaDisplayToId(formula, state.currentModel!);
          } catch (e: any) {
            console.warn('[ModelWorkspace] formulaDisplayToId error for cell', c.id, ':', e.message);
          }
        }
        return { ...c, formula, isArray: true };
      });
      const parameters = state.currentModel.parameters.map((p) => {
        let formula = p.formula;
        if (formula) {
          try {
            formula = formulaDisplayToId(formula, state.currentModel!);
          } catch (e: any) {
            console.warn('[ModelWorkspace] formulaDisplayToId error for param', p.id, ':', e.message);
          }
        }
        return { ...p, formula };
      });
      const modelToSave: ModelDefinition = {
        ...state.currentModel,
        cells,
        parameters,
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
      <ModelTreeNav
        models={state.models}
        currentModelId={state.currentModel?.id ?? null}
        currentNavPath={state.navigationPath}
        parameters={state.currentModel?.parameters ?? []}
        tables={state.currentModel?.tables ?? []}
        onSelectModel={handleSelect}
        onNewModel={handleNew}
        onDeleteModel={handleDelete}
        onNavigate={(path) => dispatch({ type: 'SET_NAVIGATION_PATH', path })}
        onAddTable={(table, defaultCell) => {
          const tables = [...state.currentModel!.tables, table];
          const cells = [...state.currentModel!.cells, defaultCell];
          dispatch({ type: 'UPDATE_MODEL', model: { ...state.currentModel!, tables, cells } });
          dispatch({ type: 'SET_NAVIGATION_PATH', path: { type: 'table', tableId: table.id } });
        }}
        onRenameTable={(id, newName) => {
          const oldName = state.currentModel!.tables.find((t) => t.id === id)?.name ?? '';
          if (oldName === newName) return;
          if (state.currentModel!.tables.some((t) => t.id !== id && t.name === newName)) {
            alert(`表名 "${newName}" 已存在，请使用其他名称`);
            return;
          }
          let tables = state.currentModel!.tables.map((t) =>
            t.id === id ? { ...t, name: newName } : t
          );
          let cells = state.currentModel!.cells.map((c) => {
            if (!c.formula || c.formula === '') return c;
            const updated = renameTableInFormula(c.formula, oldName, newName);
            return updated === c.formula ? c : { ...c, formula: updated };
          });
          let parameters = state.currentModel!.parameters.map((p) => {
            if (!p.formula || p.formula === '') return p;
            const updated = renameTableInFormula(p.formula, oldName, newName);
            return updated === p.formula ? p : { ...p, formula: updated };
          });
          dispatch({ type: 'UPDATE_MODEL', model: { ...state.currentModel!, tables, cells, parameters } });
        }}
        onDeleteTable={(id) => {
          const tableName = state.currentModel!.tables.find((t) => t.id === id)?.name ?? '';
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
              externalRefs.push(`全局参数.${param.name || param.id}`);
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
          if (state.navigationPath.type === 'table' && state.navigationPath.tableId === id) {
            dispatch({ type: 'SET_NAVIGATION_PATH', path: nextActive ? { type: 'table', tableId: nextActive } : { type: 'parameters' } });
          }
        }}
        onReorderTables={(reordered) => {
          dispatch({ type: 'UPDATE_MODEL', model: { ...state.currentModel!, tables: reordered } });
        }}
      />
      <main style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {state.error && (
          <div style={{ padding: 12, background: theme.bgError, color: theme.error, borderRadius: 4, marginBottom: 16 }}>
            {state.error}
            <button onClick={() => dispatch({ type: 'CLEAR_ERROR' })} style={{ marginLeft: 12, fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: theme.error }}>关闭</button>
          </div>
        )}
        {state.currentModel ? (
          <div>
            <header style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <input
                    value={state.currentModel.name}
                    onChange={e => updateModel(m => ({ ...m, name: normalizeFullwidth(e.target.value) }))}
                    style={{ padding: '6px 8px', fontSize: 20, fontWeight: 600, border: '1px solid transparent', borderBottom: `1px solid ${theme.borderPrimary}`, background: 'transparent', width: 300, color: theme.textPrimary }}
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
                onChange={e => updateModel(m => ({ ...m, description: normalizeFullwidth(e.target.value) }))}
                placeholder="模型描述"
                style={{ padding: '4px 8px', fontSize: 13, color: theme.textSecondary, border: '1px solid transparent', borderBottom: `1px solid ${theme.borderSecondary}`, background: 'transparent', width: '100%' }}
              />
            </header>

            {state.navigationPath.type === 'parameters' && (
              <>
                <ParameterTreeEditor
                  model={state.currentModel}
                  parameters={state.currentModel.parameters}
                  onChange={(params) => updateModel((m) => ({ ...m, parameters: params }))}
                  computeResult={state.computeResult}
                  onRename={(oldName, newName, paramId) => {
                    const m = state.currentModel!;
                    if (oldName === newName) return;
                    const targetParentId = m.parameters.find((p) => p.id === paramId)?.parentId;
                    if (m.parameters.some((p) => p.name === newName && p.id !== paramId && p.parentId === targetParentId)) {
                      alert(`参数名 "${newName}" 已存在`);
                      // 清空输入框，等待用户输入新名字
                      dispatch({ type: 'UPDATE_MODEL', model: { ...m, parameters: m.parameters.map((p) => (p.id === paramId ? { ...p, name: '' } : p)) } });
                      return;
                    }
                    if (m.tables.some((t) => t.name === newName)) {
                      alert(`名称 "${newName}" 已被表使用，不能与表同名`);
                      // 清空输入框，等待用户输入新名字
                      dispatch({ type: 'UPDATE_MODEL', model: { ...m, parameters: m.parameters.map((p) => (p.id === paramId ? { ...p, name: '' } : p)) } });
                      return;
                    }
                    const cells = m.cells.map((c) => {
                      if (!c.formula || c.formula === '') return c;
                      const updated = renameParamInFormula(c.formula, oldName, newName);
                      return updated === c.formula ? c : { ...c, formula: updated };
                    });
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
              </>)}

            {state.navigationPath.type === 'table' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
                {state.navigationPath.tableId ? (
                  <TableExcelView
                    model={state.currentModel}
                    activeTableId={state.navigationPath.tableId}
                    computeResult={state.computeResult}
                    onCellsChange={(cells) => {
                      dispatch({
                        type: 'UPDATE_MODEL',
                        model: { ...state.currentModel!, cells },
                      });
                    }}
                  />
                ) : (
                  <div style={{ padding: 32, color: theme.textPlaceholder, textAlign: 'center' }}>
                    请选择一个表
                  </div>
                )}
              </div>
            )}
            <ValidationPanel
              model={state.currentModel}
              visible={state.validationVisible}
            />
            <ComputePreview result={state.computeResult} />
          </div>
        ) : (
          <p style={{ color: theme.textTertiary }}>请选择一个模型或点击"新建"</p>
        )}
      </main>
    </div>
  );
};
