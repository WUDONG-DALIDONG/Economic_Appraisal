import Database from 'better-sqlite3';
import { CellValue } from '@economic/core';

export interface ResultRow {
  id: number;
  cellId: string;
  modelId: string;
  timeIndex: number;
  value: CellValue;
  computedAt: string;
}

/**
 * ResultRepository stores computed cell values per time index.
 *
 * Design:
 *  - One row per (cell_id, time_index).
 *  - Subsequent saves overwrite existing rows (upsert).
 *  - Values are JSON-serialised so arrays / null are preserved.
 */
export class ResultRepository {
  constructor(private db: Database.Database) {}

  /** Save a single computed result. */
  save(cellId: string, modelId: string, timeIndex: number, value: CellValue): void {
    const json = JSON.stringify(value);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO results (cell_id, model_id, time_index, value, computed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(cell_id, model_id, time_index) DO UPDATE SET
           value = excluded.value,
           computed_at = excluded.computed_at`
      )
      .run(cellId, modelId, timeIndex, json, now);
  }

  /** Batch save many results in a single transaction. */
  saveBatch(
    cellId: string,
    modelId: string,
    entries: Array<{ timeIndex: number; value: CellValue }>
  ): void {
    const insert = this.db.prepare(
      `INSERT INTO results (cell_id, model_id, time_index, value, computed_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cell_id, model_id, time_index) DO UPDATE SET
         value = excluded.value,
         computed_at = excluded.computed_at`
    );

    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const { timeIndex, value } of entries) {
        insert.run(cellId, modelId, timeIndex, JSON.stringify(value), now);
      }
    })();
  }

  /** Retrieve all time-indexed results for a cell. */
  findByCell(cellId: string): ResultRow[] {
    const rows = this.db
      .prepare(
        'SELECT id, cell_id AS cellId, model_id AS modelId, time_index AS timeIndex, value, computed_at AS computedAt FROM results WHERE cell_id = ? ORDER BY time_index'
      )
      .all(cellId) as Array<{
        id: number;
        cellId: string;
        modelId: string;
        timeIndex: number;
        value: string;
        computedAt: string;
      }>;

    return rows.map(r => ({
      id: r.id,
      cellId: r.cellId,
      modelId: r.modelId,
      timeIndex: r.timeIndex,
      value: JSON.parse(r.value) as CellValue,
      computedAt: r.computedAt,
    }));
  }

  /** Retrieve all results for a specific model. */
  findByModel(modelId: string): ResultRow[] {
    const rows = this.db
      .prepare(
        'SELECT id, cell_id AS cellId, model_id AS modelId, time_index AS timeIndex, value, computed_at AS computedAt FROM results WHERE model_id = ? ORDER BY cell_id, time_index'
      )
      .all(modelId) as Array<{
        id: number;
        cellId: string;
        modelId: string;
        timeIndex: number;
        value: string;
        computedAt: string;
      }>;

    return rows.map(r => ({
      id: r.id,
      cellId: r.cellId,
      modelId: r.modelId,
      timeIndex: r.timeIndex,
      value: JSON.parse(r.value) as CellValue,
      computedAt: r.computedAt,
    }));
  }

  /** Delete all results for a model. */
  deleteByModel(modelId: string): void {
    this.db.prepare('DELETE FROM results WHERE model_id = ?').run(modelId);
  }
}
