import Database from 'better-sqlite3';
import { ModelDefinition, TableDefinition, CellDefinition, ParameterDefinition, ComputeMode, ValueType } from '@economic/core';

/**
 * ModelRepository 提供模型定义的增删改查操作。
 *
 * 策略：
 *  - 完整的 ModelDefinition 以 JSON 存储在 `models` 行中，便于快速读写。
 *  - 各组件（表、单元格、参数）同时写入对应的关系表，以支持未来查询。
 */
export class ModelRepository {
  constructor(private db: Database.Database) {}

  /** 插入完整的模型定义。 */
  create(model: ModelDefinition): void {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO models (id, name, version, description, timeline_json, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        model.id,
        model.name,
        model.version,
        model.description ?? null,
        JSON.stringify(model.timeline),
        JSON.stringify(model.metadata),
        now,
        now
      );

    // 表
    for (const table of model.tables) {
      this.db
        .prepare(
          `INSERT INTO tables (id, model_id, name, display_order, description)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(table.id, model.id, table.name, table.order, table.description ?? null);
    }

    // 单元格
    for (const cell of model.cells) {
      this.db
        .prepare(
          `INSERT INTO cells (id, table_id, model_id, name, code, parent_id, sort_order, formula, cell_type, value_type, unit, description, default_value, is_array, scope, precision, use_grouping)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          cell.id,
          cell.tableId,
          model.id,
          cell.name,
          cell.code ?? null,
          cell.parentId ?? null,
          cell.sortOrder ?? 0,
          cell.formula,
          cell.computeMode ?? ComputeMode.Input,
          cell.valueType ?? ValueType.Number,
          cell.unit ?? null,
          cell.description ?? null,
          cell.defaultValue !== undefined ? JSON.stringify(cell.defaultValue) : null,
          1, // 强制 isArray = true — 所有单元格都是时间线数组
          cell.scope ?? 'both',
          cell.precision ?? null,
          cell.useGrouping === false ? 0 : null
        );
     }

     // 参数
    for (const param of model.parameters) {
      this.db
        .prepare(
          `INSERT INTO parameters (id, model_id, name, code, parent_id, sort_order, param_type, compute_mode, default_value, formula, min_value, max_value, unit, description, options_json, precision, use_grouping)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          param.id,
          model.id,
          param.name,
          param.code ?? null,
          param.parentId ?? null,
          param.sortOrder ?? 0,
          param.valueType ?? ValueType.Number,
          param.computeMode ?? (param.formula ? ComputeMode.Formula : ComputeMode.Input),
          JSON.stringify(param.defaultValue),
          param.formula ?? null,
          param.min ?? null,
          param.max ?? null,
          param.unit ?? null,
          param.description ?? null,
          param.options ? JSON.stringify(param.options) : null,
          param.precision ?? null,
          param.useGrouping === false ? 0 : null
        );
    }
  }

  /** 根据 ID 获取完整模型，包括所有表、单元格和参数。 */
  findById(id: string): ModelDefinition | null {
    const row = this.db
      .prepare('SELECT * FROM models WHERE id = ?')
      .get(id) as ModelRow | undefined;

    if (!row) return null;

    const tables = this.findTablesByModel(id);
    const cells = this.findCellsByModel(id);
    const parameters = this.findParametersByModel(id);

    return {
      ...rowToModel(row),
      tables,
      cells,
      parameters,
    };
  }

  /** 列出所有模型（轻量：不含单元格/表）。 */
  findAll(): Array<{ id: string; name: string; version: string; description: string | null }> {
    return this.db
      .prepare('SELECT id, name, version, description FROM models ORDER BY created_at DESC')
      .all() as Array<{ id: string; name: string; version: string; description: string | null }>;
  }

  /** 部分更新模型元数据。 */
  update(id: string, changes: Partial<Pick<ModelDefinition, 'name' | 'version' | 'description'>>): void {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (changes.name !== undefined) { sets.push('name = ?'); values.push(changes.name); }
    if (changes.version !== undefined) { sets.push('version = ?'); values.push(changes.version); }
    if (changes.description !== undefined) { sets.push('description = ?'); values.push(changes.description); }
    sets.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    this.db
      .prepare(`UPDATE models SET ${sets.join(', ')} WHERE id = ?`)
      .run(...values);
  }

  /** 全量替换：在事务中删除旧的表/单元格/参数后插入新的。 */
  updateFull(model: ModelDefinition): void {
    // 校验并修正孤儿 parentId：若子参数 parentId 指向不存在的参数，则提升为顶层
    const paramIds = new Set(model.parameters.map((p) => p.id));
    const correctedParams = model.parameters.map((p) => {
      if (p.parentId && !paramIds.has(p.parentId)) {
        return { ...p, parentId: null };
      }
      return p;
    });
    // 修正单元格 parentId（同逻辑）
    const cellIds = new Set(model.cells.map((c) => c.id));
    const correctedCells = model.cells.map((c) => {
      if (c.parentId && !cellIds.has(c.parentId)) {
        return { ...c, parentId: null };
      }
      return c;
    });

    this.db.transaction(() => {
      // 删除已有组件
      this.db.prepare('DELETE FROM tables WHERE model_id = ?').run(model.id);
      this.db.prepare('DELETE FROM cells WHERE model_id = ?').run(model.id);
      this.db.prepare('DELETE FROM parameters WHERE model_id = ?').run(model.id);

      // 重新插入表
      const insertTable = this.db.prepare(
        `INSERT INTO tables (id, model_id, name, display_order, description) VALUES (?, ?, ?, ?, ?)`
      );
      for (const table of model.tables) {
        insertTable.run(table.id, model.id, table.name, table.order, table.description ?? null);
      }

      // 重新插入单元格
      const insertCell = this.db.prepare(
        `INSERT INTO cells (id, table_id, model_id, name, code, parent_id, sort_order, formula, cell_type, value_type, unit, description, default_value, is_array, scope, precision, use_grouping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const cell of correctedCells) {
        insertCell.run(
          cell.id,
          cell.tableId,
          model.id,
          cell.name,
          cell.code ?? null,
          cell.parentId ?? null,
          cell.sortOrder ?? 0,
          cell.formula,
          cell.computeMode ?? ComputeMode.Input,
          cell.valueType ?? ValueType.Number,
          cell.unit ?? null,
          cell.description ?? null,
          cell.defaultValue !== undefined ? JSON.stringify(cell.defaultValue) : null,
          1, // 强制 isArray = true — 所有单元格都是时间线数组
          cell.scope ?? 'both',
          cell.precision ?? null,
          cell.useGrouping === false ? 0 : null
        );
      }

      // 重新插入参数
      const insertParam = this.db.prepare(
        `INSERT INTO parameters (id, model_id, name, code, parent_id, sort_order, param_type, compute_mode, default_value, formula, min_value, max_value, unit, description, options_json, precision, use_grouping) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const param of correctedParams) {
        insertParam.run(
          param.id,
          model.id,
          param.name,
          param.code ?? null,
          param.parentId ?? null,
          param.sortOrder ?? 0,
          param.valueType ?? ValueType.Number,
          param.computeMode ?? (param.formula ? ComputeMode.Formula : ComputeMode.Input),
          JSON.stringify(param.defaultValue),
          param.formula ?? null,
          param.min ?? null,
          param.max ?? null,
          param.unit ?? null,
          param.description ?? null,
          param.options ? JSON.stringify(param.options) : null,
          param.precision ?? null,
          param.useGrouping === false ? 0 : null
        );
      }
    })();

    // 更新根模型行
    this.update(model.id, { 
      name: model.name, 
      version: model.version, 
      description: model.description 
    });
    // 同时更新 timeline 和 metadata JSON，这些不由 this.update() 处理
    this.db.prepare(
      'UPDATE models SET timeline_json = ?, metadata_json = ?, updated_at = ? WHERE id = ?'
    ).run(
      JSON.stringify(model.timeline),
      JSON.stringify(model.metadata),
      new Date().toISOString(),
      model.id
    );
  }

  /** 删除模型及其所有组件。 */
  delete(id: string): void {
    this.db.prepare('DELETE FROM models WHERE id = ?').run(id);
    // 级联删除会处理其余部分
  }

  /** 获取模型的表定义。 */
  findTablesByModel(modelId: string): TableDefinition[] {
    const rows = this.db
      .prepare('SELECT * FROM tables WHERE model_id = ? ORDER BY display_order')
      .all(modelId) as TableRow[];

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      order: r.display_order,
      description: r.description ?? undefined,
    }));
  }

  /** 获取模型的单元格定义。 */
  findCellsByModel(modelId: string): CellDefinition[] {
    const rows = this.db
      .prepare('SELECT * FROM cells WHERE model_id = ? ORDER BY sort_order, id')
      .all(modelId) as CellRow[];

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      code: r.code ?? undefined,
      parentId: r.parent_id ?? null,
      sortOrder: r.sort_order ?? 0,
      tableId: r.table_id,
      formula: r.formula,
      computeMode: r.cell_type as CellDefinition['computeMode'],
      valueType: (r as any).value_type as CellDefinition['valueType'] ?? ValueType.Number,
      unit: r.unit ?? undefined,
      description: r.description ?? undefined,
      defaultValue: r.default_value ? JSON.parse(r.default_value) : undefined,
      isArray: !!r.is_array,
      scope: (r.scope as CellDefinition['scope']) ?? 'both',
      precision: r.precision ?? undefined,
      useGrouping: (r as any).use_grouping === 0 ? false : undefined,
    }));
  }

  /** 获取模型的参数定义。 */
  findParametersByModel(modelId: string): ParameterDefinition[] {
    const rows = this.db
      .prepare('SELECT * FROM parameters WHERE model_id = ? ORDER BY sort_order, id')
      .all(modelId) as ParameterRow[];

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      code: r.code ?? undefined,
      parentId: r.parent_id ?? null,
      sortOrder: r.sort_order ?? 0,
      valueType: r.param_type as ParameterDefinition['valueType'],
      computeMode: (r as any).compute_mode as ParameterDefinition['computeMode'] ?? (((r as any).formula ? ComputeMode.Formula : ComputeMode.Input) as ParameterDefinition['computeMode']),
      defaultValue: r.default_value ? JSON.parse(r.default_value) : undefined,
      formula: r.formula ?? undefined,
      unit: r.unit ?? undefined,
      description: r.description ?? undefined,
      min: r.min_value ?? undefined,
      max: r.max_value ?? undefined,
      options: r.options_json ? JSON.parse(r.options_json) : undefined,
      precision: r.precision ?? undefined,
      useGrouping: (r as any).use_grouping === 0 ? false : undefined,
    }));
  }
}

// ---------------------------------------------------------------------------
// 行类型
// ---------------------------------------------------------------------------

interface ModelRow {
  id: string;
  name: string;
  version: string;
  description: string | null;
  timeline_json: string;
  metadata_json: string;
}

interface TableRow {
  id: string;
  model_id: string;
  name: string;
  display_order: number;
  description: string | null;
}

interface CellRow {
  id: string;
  table_id: string;
  model_id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  sort_order: number;
  formula: string;
  cell_type: string;
  value_type: string;
  unit: string | null;
  description: string | null;
  default_value: string | null;
  is_array: number;
  precision: number | null;
}

interface ParameterRow {
  id: string;
  model_id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  sort_order: number;
  param_type: string;
  compute_mode: string;
  default_value: string | null;
  formula: string | null;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  description: string | null;
  options_json: string | null;
  precision: number | null;
}

function rowToModel(row: ModelRow): ModelDefinition {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description ?? '',
    tables: [],
    cells: [],
    parameters: [],
    timeline: JSON.parse(row.timeline_json),
    metadata: JSON.parse(row.metadata_json),
  };
}
