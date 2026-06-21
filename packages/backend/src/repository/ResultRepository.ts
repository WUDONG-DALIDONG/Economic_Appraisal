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
 * ResultRepository 存储按时间索引的计算结果。
 *
 * 设计：
 *  - 每个 (cell_id, time_index) 一行。
 *  - 后续保存覆盖已有行（upsert）。
 *  - 值以 JSON 序列化，以保留数组/null。
 */
export class ResultRepository {
  constructor(private db: Database.Database) {}

  /** 保存单条计算结果。 */
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

  /** 在单个事务中批量保存多条结果。 */
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

  /** 在单个事务中批量保存多条结果（跨多 cell）。 */
  saveAllBatch(
    modelId: string,
    entries: Array<{ cellId: string; timeIndex: number; value: CellValue }>
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
      for (const { cellId, timeIndex, value } of entries) {
        insert.run(cellId, modelId, timeIndex, JSON.stringify(value), now);
      }
    })();
  }

  /** 获取单元格的所有时间索引结果。 */
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

  /** 获取指定模型的所有结果。 */
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

  /** 删除模型的所有结果。 */
  deleteByModel(modelId: string): void {
    this.db.prepare('DELETE FROM results WHERE model_id = ?').run(modelId);
  }
}
