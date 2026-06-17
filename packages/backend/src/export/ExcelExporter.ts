import * as XLSX from 'xlsx';
import { ModelDefinition, TableDefinition, CellDefinition, CellValue, ParameterDefinition } from '@economic/core';
import { ResultRow } from '../repository/ResultRepository';

export interface ExportOptions {
  /** Include formula column (true by default) */
  includeFormulas?: boolean;
  /** Include metadata sheet (true by default) */
  includeMetadata?: boolean;
}

/**
 * ExcelExporter generates .xlsx workbooks from computed model results.
 *
 * Sheet layout (per table):
 *   Row 1: headers (指标, 类型, 单位, 公式, 建设期, 第1年, 第2年, ...)
 *   Row 2+: one row per cell with values per time period
 *
 * Additional sheets:
 *   - "参数输入": user-editable parameters
 *   - "说明": model metadata
 */
export class ExcelExporter {
  export(
    model: ModelDefinition,
    results: ResultRow[],
    options: ExportOptions = {}
  ): Buffer {
    const opts = { includeFormulas: true, includeMetadata: true, ...options };
    const wb = XLSX.utils.book_new();

    const resultsByCell = this.groupByCell(results);
    const { maxTimeIndex } = this.findTimeRange(results);

    // One sheet per table
    for (const table of model.tables) {
      const tableCells = model.cells.filter(c => c.tableId === table.id);
      if (tableCells.length === 0) continue;

      const ws = this.createTableSheet(table, tableCells, resultsByCell, maxTimeIndex, opts);
      XLSX.utils.book_append_sheet(wb, ws, this.sanitizeSheetName(table.name));
    }

    // Parameters sheet
    if (model.parameters.length > 0) {
      const ws = this.createParametersSheet(model.parameters);
      XLSX.utils.book_append_sheet(wb, ws, this.sanitizeSheetName('模型参数'));
    }

    // Metadata sheet
    if (opts.includeMetadata) {
      const ws = this.createMetadataSheet(model);
      XLSX.utils.book_append_sheet(wb, ws, this.sanitizeSheetName('模型说明'));
    }

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private groupByCell(results: ResultRow[]): Map<string, ResultRow[]> {
    const map = new Map<string, ResultRow[]>();
    for (const r of results) {
      if (!map.has(r.cellId)) map.set(r.cellId, []);
      map.get(r.cellId)!.push(r);
    }
    for (const rows of map.values()) {
      rows.sort((a, b) => a.timeIndex - b.timeIndex);
    }
    return map;
  }

  private findTimeRange(results: ResultRow[]): { maxTimeIndex: number } {
    let max = 0;
    for (const r of results) max = Math.max(max, r.timeIndex);
    return { maxTimeIndex: max };
  }

  private createTableSheet(
    _table: TableDefinition,
    cells: CellDefinition[],
    resultsByCell: Map<string, ResultRow[]>,
    maxTimeIndex: number,
    options: Required<ExportOptions>
  ): XLSX.WorkSheet {
    const data: (string | number | null)[][] = [];

    // Header row
    const header = ['指标', '计算方式', '值类型', '单位'];
    if (options.includeFormulas) header.push('公式');
    for (let t = 0; t <= maxTimeIndex; t++) {
      header.push(t === 0 ? '建设期' : `第${t}年`);
    }
    data.push(header);

    for (const cell of cells) {
      const rows = resultsByCell.get(cell.id) || [];
      const row: (string | number | null)[] = [
        cell.name,
        cell.computeMode,
        cell.valueType ?? 'number',
        cell.unit ?? '',
      ];
      if (options.includeFormulas) row.push(cell.formula ?? '');

      const valueByTime = new Map<number, CellValue>();
      for (const r of rows) valueByTime.set(r.timeIndex, r.value);

      for (let t = 0; t <= maxTimeIndex; t++) {
        row.push(this.formatValue(valueByTime.get(t) ?? null));
      }
      data.push(row);
    }

    return XLSX.utils.aoa_to_sheet(data);
  }

  private createParametersSheet(params: ParameterDefinition[]): XLSX.WorkSheet {
    const data: (string | number | null)[][] = [
      ['参数名', '当前值', '值类型', '计算方式', '单位', '描述'],
    ];
    for (const p of params) {
      data.push([
        p.name,
        this.formatValue(p.defaultValue),
        p.valueType,
        p.computeMode ?? 'Input',
        p.unit ?? '',
        p.description ?? '',
      ]);
    }
    return XLSX.utils.aoa_to_sheet(data);
  }

  private createMetadataSheet(model: ModelDefinition): XLSX.WorkSheet {
    const data: (string | number | null)[][] = [
      ['属性', '值'],
      ['模型名称', model.name],
      ['版本', model.version],
      ['描述', model.description ?? ''],
      ['导出时间', new Date().toISOString()],
    ];
    return XLSX.utils.aoa_to_sheet(data);
  }

  private formatValue(val: CellValue): string | number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (Array.isArray(val)) return val.map(v => this.formatValue(v)).join(',');
    return String(val);
  }

  private sanitizeSheetName(name: string): string {
    // Excel sheet names: max 31 chars, no : \ / ? * [ ]
    return name.slice(0, 31).replace(/[:\\/?*[\]]/g, '_');
  }
}
