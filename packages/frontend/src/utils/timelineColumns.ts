import { ModelDefinition } from '@economic/core';

export interface TimelineColumn {
  index: number;          // 网格中从 0 开始的列索引
  year: number;           // 绝对年份（如 2024）
  label: string;          // 表头显示标签
  period: 'construction' | 'operation';
  yearIndex: number;      // 该周期类型内从 1 开始的索引
  isPartial: boolean;     // 若为建设期最后一年且含小数月份则为 true
  partialMonths?: number; // 不完整年的月数（若 isPartial）
}

/**
 * 根据模型时间线配置生成时间线列。
 *
 * 规则：
 *   - constructionYears > 0：生成 Math.ceil(constructionYears) 列
 *     - 完整年份标签为 "YYYY(建设)"
 *     - 若存在小数部分，最后一列标签为 "YYYY(建设, 仅X个月)"
 *   - operationYears：生成 operationYears 列
 *     - 标签为 "YYYY(运营第N年)"
 */
export function generateTimelineColumns(timeline: ModelDefinition['timeline']): TimelineColumn[] {
  const { constructionYears, operationYears, startYear } = timeline;
  const columns: TimelineColumn[] = [];

  const fullConstructionYears = Math.floor(constructionYears);
  const hasFraction = constructionYears > fullConstructionYears;
  const constructionCols = hasFraction ? fullConstructionYears + 1 : fullConstructionYears;

  let currentYear = startYear;

  // 建设期列
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

  // 运营期列
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
