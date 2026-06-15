import Database from 'better-sqlite3';
import { ModelDefinition, TableDefinition, CellDefinition, ParameterDefinition } from '@economic/core';

/**
 * ModelRepository provides CRUD operations for model definitions.
 *
 * Strategy:
 *  - The full ModelDefinition is stored as JSON in the `models` row for
 *    fast round-trip save/load.
 *  - Individual components (tables, cells, parameters) are also written
 *    to their respective relational tables for future querying.
 */
export class ModelRepository {
  constructor(private db: Database.Database) {}

  /** Insert a complete model definition. */
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

    // Tables
    for (const table of model.tables) {
      this.db
        .prepare(
          `INSERT INTO tables (id, model_id, name, display_order, description)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(table.id, model.id, table.name, table.order, table.description ?? null);
    }

    // Cells
    for (const cell of model.cells) {
      this.db
        .prepare(
          `INSERT INTO cells (id, table_id, model_id, name, code, parent_id, sort_order, formula, cell_type, unit, description, default_value, is_array, scope)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          cell.type,
          cell.unit ?? null,
          cell.description ?? null,
          cell.defaultValue !== undefined ? JSON.stringify(cell.defaultValue) : null,
          1, // Force isArray = true — all cells are timeline arrays
          cell.scope ?? 'both'
        );
    }

    // Parameters
    for (const param of model.parameters) {
      this.db
        .prepare(
          `INSERT INTO parameters (id, model_id, name, code, parent_id, sort_order, param_type, default_value, formula, min_value, max_value, unit, description, options_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          param.id,
          model.id,
          param.name,
          param.code ?? null,
          param.parentId ?? null,
          param.sortOrder ?? 0,
          param.type,
          JSON.stringify(param.defaultValue),
          param.formula ?? null,
          param.min ?? null,
          param.max ?? null,
          param.unit ?? null,
          param.description ?? null,
          param.options ? JSON.stringify(param.options) : null
        );
    }
  }

  /** Retrieve a full model by ID, including all tables, cells, and parameters. */
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

  /** List all models (lightweight: no cells/tables). */
  findAll(): Array<{ id: string; name: string; version: string; description: string | null }> {
    return this.db
      .prepare('SELECT id, name, version, description FROM models ORDER BY created_at DESC')
      .all() as Array<{ id: string; name: string; version: string; description: string | null }>;
  }

  /** Partial update of model metadata. */
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

  /** Full replace: delete old tables/cells/params then insert new ones in a transaction. */
  updateFull(model: ModelDefinition): void {
    this.db.transaction(() => {
      // Delete existing components
      this.db.prepare('DELETE FROM tables WHERE model_id = ?').run(model.id);
      this.db.prepare('DELETE FROM cells WHERE model_id = ?').run(model.id);
      this.db.prepare('DELETE FROM parameters WHERE model_id = ?').run(model.id);

      // Re-insert tables
      const insertTable = this.db.prepare(
        `INSERT INTO tables (id, model_id, name, display_order, description) VALUES (?, ?, ?, ?, ?)`
      );
      for (const table of model.tables) {
        insertTable.run(table.id, model.id, table.name, table.order, table.description ?? null);
      }

      // Re-insert cells
      const insertCell = this.db.prepare(
        `INSERT INTO cells (id, table_id, model_id, name, code, parent_id, sort_order, formula, cell_type, unit, description, default_value, is_array, scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const cell of model.cells) {
        insertCell.run(
          cell.id,
          cell.tableId,
          model.id,
          cell.name,
          cell.code ?? null,
          cell.parentId ?? null,
          cell.sortOrder ?? 0,
          cell.formula,
          cell.type,
          cell.unit ?? null,
          cell.description ?? null,
          cell.defaultValue !== undefined ? JSON.stringify(cell.defaultValue) : null,
          1, // Force isArray = true — all cells are timeline arrays
          cell.scope ?? 'both'
        );
      }

      // Re-insert parameters
      const insertParam = this.db.prepare(
        `INSERT INTO parameters (id, model_id, name, code, parent_id, sort_order, param_type, default_value, formula, min_value, max_value, unit, description, options_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const param of model.parameters) {
        insertParam.run(
          param.id,
          model.id,
          param.name,
          param.code ?? null,
          param.parentId ?? null,
          param.sortOrder ?? 0,
          param.type,
          JSON.stringify(param.defaultValue),
          param.formula ?? null,
          param.min ?? null,
          param.max ?? null,
          param.unit ?? null,
          param.description ?? null,
          param.options ? JSON.stringify(param.options) : null
        );
      }
    })();

    // Update root model row
    this.update(model.id, { 
      name: model.name, 
      version: model.version, 
      description: model.description 
    });
    // Also update timeline and metadata JSON which are NOT handled by this.update()
    this.db.prepare(
      'UPDATE models SET timeline_json = ?, metadata_json = ?, updated_at = ? WHERE id = ?'
    ).run(
      JSON.stringify(model.timeline),
      JSON.stringify(model.metadata),
      new Date().toISOString(),
      model.id
    );
  }

  /** Delete a model and all its components. */
  delete(id: string): void {
    this.db.prepare('DELETE FROM models WHERE id = ?').run(id);
    // Cascade deletes handle the rest
  }

  /** Get table definitions for a model. */
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

  /** Get cell definitions for a model. */
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
      type: r.cell_type as CellDefinition['type'],
      unit: r.unit ?? undefined,
      description: r.description ?? undefined,
      defaultValue: r.default_value ? JSON.parse(r.default_value) : undefined,
      isArray: !!r.is_array,
      scope: (r.scope as CellDefinition['scope']) ?? 'both',
    }));
  }

  /** Get parameter definitions for a model. */
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
      type: r.param_type as ParameterDefinition['type'],
      defaultValue: r.default_value ? JSON.parse(r.default_value) : undefined,
      formula: r.formula ?? undefined,
      unit: r.unit ?? undefined,
      description: r.description ?? undefined,
      min: r.min_value ?? undefined,
      max: r.max_value ?? undefined,
      options: r.options_json ? JSON.parse(r.options_json) : undefined,
    }));
  }
}

// ---------------------------------------------------------------------------
// Row types
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
  unit: string | null;
  description: string | null;
  default_value: string | null;
  is_array: number;
}

interface ParameterRow {
  id: string;
  model_id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  sort_order: number;
  param_type: string;
  default_value: string | null;
  formula: string | null;
  min_value: number | null;
  max_value: number | null;
  unit: string | null;
  description: string | null;
  options_json: string | null;
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
