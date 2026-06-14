import { TimeContext } from './types';

export interface TimelineConfig {
  constructionYears: number;
  operationYears: number;
  startYear: number;
}

export interface Timeline {
  constructionYears: number;
  constructionMonths: number;
  operationYears: number;
  totalYears: number;
  startYear: number;
  operationPeriods: TimeContext[];
  getOperationPeriod(relativeYear: number): TimeContext | undefined;
}

export function createTimeline(config: TimelineConfig): Timeline {
  const constructionMonths = Math.round(config.constructionYears * 12);
  const totalYears = config.operationYears + config.constructionYears;

  const operationPeriods: TimeContext[] = [];
  for (let t = 1; t <= config.operationYears; t++) {
    operationPeriods.push({
      absoluteYear: config.startYear + t - 1,
      relativeYear: t,
      isConstruction: false,
      isOperation: true,
      constructionYears: config.constructionYears,
      operationYears: config.operationYears,
      totalYears,
    });
  }

  return {
    constructionYears: config.constructionYears,
    constructionMonths,
    operationYears: config.operationYears,
    totalYears,
    startYear: config.startYear,
    operationPeriods,
    getOperationPeriod(relativeYear: number): TimeContext | undefined {
      return operationPeriods[relativeYear - 1];
    },
  };
}
