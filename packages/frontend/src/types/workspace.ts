import { ModelDefinition } from '@economic/core';

export type NavPath =
  | { type: 'parameters' }
  | { type: 'table'; tableId: string };

export interface WorkspaceState {
  models: Array<{ id: string; name: string }>;
  currentModel: ModelDefinition | null;
  activeTableId: string | null;
  navigationPath: NavPath;
  isLoading: boolean;
  error: string | null;
  computeResult: { cellCount: number; durationMs: number; errors: any[]; results: Array<{ cellId: string; timeIndex: number; value: number | null }>; paramValues?: Array<{ paramId: string; value: unknown }> } | null;
  validationVisible: boolean;
}

export type WorkspaceAction =
  | { type: 'SET_MODELS'; models: Array<{ id: string; name: string }> }
  | { type: 'SELECT_MODEL'; model: ModelDefinition; activeTableId: string | null }
  | { type: 'UPDATE_MODEL'; model: ModelDefinition }
  | { type: 'SET_ACTIVE_TABLE'; tableId: string }
  | { type: 'SET_NAVIGATION_PATH'; path: NavPath }
  | { type: 'SET_LOADING'; isLoading: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'SET_COMPUTE_RESULT'; result: { cellCount: number; durationMs: number; errors: any[] } | null }
  | { type: 'CLEAR_ERROR' }
  | { type: 'TOGGLE_VALIDATION' }
  | { type: 'REMOVE_CURRENT_MODEL' };

export const initialState: WorkspaceState = {
  models: [],
  currentModel: null,
  activeTableId: null,
  navigationPath: { type: 'parameters' },
  isLoading: false,
  error: null,
  computeResult: null,
  validationVisible: false,
};

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_MODELS':
      return { ...state, models: action.models };
    case 'SELECT_MODEL':
      return {
        ...state,
        currentModel: action.model,
        activeTableId: action.activeTableId,
        navigationPath: { type: 'parameters' },
        error: null,
        computeResult: null,
      };
    case 'UPDATE_MODEL':
      return { ...state, currentModel: action.model };
    case 'SET_ACTIVE_TABLE':
      return { ...state, activeTableId: action.tableId };
    case 'SET_NAVIGATION_PATH':
      return { ...state, navigationPath: action.path };
    case 'SET_LOADING':
      return { ...state, isLoading: action.isLoading };
    case 'SET_ERROR':
      return { ...state, error: action.error, isLoading: false };
    case 'SET_COMPUTE_RESULT':
      return { ...state, computeResult: action.result, isLoading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'TOGGLE_VALIDATION':
      return { ...state, validationVisible: !state.validationVisible };
    case 'REMOVE_CURRENT_MODEL':
      return {
        ...state,
        currentModel: null,
        activeTableId: null,
        navigationPath: { type: 'parameters' },
        computeResult: null,
      };
    default:
      return state;
  }
}
