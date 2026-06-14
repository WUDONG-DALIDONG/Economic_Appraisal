import { ModelDefinition } from '@economic/core';

export interface TimelineColumn {
  index: number;          // 0-based column index in the grid
  year: number;           // absolute year number (e.g. 2024)
  label: string;          // display label for header
  period: 'construction' | 'operation';
  yearIndex: number;      // 1-based index within period type
  isPartial: boolean;     // true if this is the last construction year and it has fractional months
  partialMonths?: number; // number of months for partial year (if isPartial)
}

/**
 * Generate timeline columns based on model timeline configuration.
 *
 * Rules:
 *   - constructionYears > 0: generate Math.ceil(constructionYears) columns
 *     - full years get label "YYYY(建设)"
 *     - if fractional part exists, last column gets label "YYYY(建设, 仅X个月)"
 *   - operationYears: generate operationYears columns
 *     - label "YYYY(运营第N年)"
 */
export function generateTimelineColumns(timeline: ModelDefinition['timeline']): TimelineColumn[] {
  const { constructionYears, operationYears, startYear } = timeline;
  const columns: TimelineColumn[] = [];

  const fullConstructionYears = Math.floor(constructionYears);
  const hasFraction = constructionYears > fullConstructionYears;
  const constructionCols = hasFraction ? fullConstructionYears + 1 : fullConstructionYears;

  let currentYear = startYear;

  // Construction columns
  for (let i = 0; i < constructionCols; i++) {
    const isLast = i === constructionCols - 1;
    const isPartial = isLast && hasFraction;
    const partialMonths = isPartial
      ? Math.round((constructionYears - fullConstructionYears) * 12)
      : undefined;

    const label = isPartial
      ? `${currentYear}(建设, 仅${partialMonths}个月)`
      : `${currentYear}(建设)`;

    columns.push({
      index: columns.length,
      year: currentYear,
      label,
      period: 'construction',
      yearIndex: i + 1,
      isPartial: !!isPartial,
      partialMonths,
    });

    currentYear++;
  }

  // Operation columns
  for (let i = 0; i < operationYears; i++) {
    columns.push({
      index: columns.length,
      year: currentYear,
      label: `${currentYear}(运营第${i + 1}年)`,
      period: 'operation',
      yearIndex: i + 1,
      isPartial: false,
    });

    currentYear++;
  }

  return columns;
}
