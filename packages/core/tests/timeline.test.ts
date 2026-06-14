import { describe, it, expect } from 'vitest';
import { createTimeline, Timeline } from '../src/timeline';

describe('Timeline - 光储模型场景', () => {
  const timeline = createTimeline({
    constructionYears: 0.583, // 7个月
    operationYears: 25,
    startYear: 2024,
  });

  it('returns correct construction metadata', () => {
    expect(timeline.constructionYears).toBe(0.583);
    expect(timeline.constructionMonths).toBe(7);
    expect(timeline.operationYears).toBe(25);
    expect(timeline.totalYears).toBe(25.583);
  });

  it('returns 25 operation periods', () => {
    expect(timeline.operationPeriods).toHaveLength(25);
  });

  it('first operation year is 2024, t=1', () => {
    const first = timeline.operationPeriods[0];
    expect(first.absoluteYear).toBe(2024);
    expect(first.relativeYear).toBe(1);
    expect(first.isConstruction).toBe(false);
    expect(first.isOperation).toBe(true);
    expect(first.constructionYears).toBe(0.583);
    expect(first.operationYears).toBe(25);
    expect(first.totalYears).toBe(25.583);
  });

  it('last operation year is 2048, t=25', () => {
    const last = timeline.operationPeriods[24];
    expect(last.absoluteYear).toBe(2048);
    expect(last.relativeYear).toBe(25);
  });

  it('getOperationPeriod returns correct contexts', () => {
    expect(timeline.getOperationPeriod(1)?.absoluteYear).toBe(2024);
    expect(timeline.getOperationPeriod(25)?.absoluteYear).toBe(2048);
    expect(timeline.getOperationPeriod(0)).toBeUndefined();
    expect(timeline.getOperationPeriod(26)).toBeUndefined();
  });
});

describe('Timeline - 数据中心（整年建设期）', () => {
  const timeline = createTimeline({
    constructionYears: 1,
    operationYears: 25,
    startYear: 2024,
  });

  it('returns correct construction metadata', () => {
    expect(timeline.constructionYears).toBe(1);
    expect(timeline.constructionMonths).toBe(12);
    expect(timeline.totalYears).toBe(26);
  });

  it('absoluteYear starts at 2024', () => {
    expect(timeline.operationPeriods[0].absoluteYear).toBe(2024);
  });
});

describe('Timeline - 边界条件', () => {
  it('handles zero construction years', () => {
    const timeline = createTimeline({
      constructionYears: 0,
      operationYears: 20,
      startYear: 2025,
    });
    expect(timeline.constructionMonths).toBe(0);
    expect(timeline.totalYears).toBe(20);
    expect(timeline.operationPeriods[0].absoluteYear).toBe(2025);
  });

  it('handles zero operation years', () => {
    const timeline = createTimeline({
      constructionYears: 1,
      operationYears: 0,
      startYear: 2024,
    });
    expect(timeline.operationPeriods).toHaveLength(0);
    expect(timeline.totalYears).toBe(1);
  });

  it('handles fractional construction months rounding', () => {
    const timeline = createTimeline({
      constructionYears: 0.25, // 3个月
      operationYears: 10,
      startYear: 2024,
    });
    expect(timeline.constructionMonths).toBe(3);
  });

  it('handles 2.5 year construction', () => {
    const timeline = createTimeline({
      constructionYears: 2.5,
      operationYears: 20,
      startYear: 2024,
    });
    expect(timeline.constructionMonths).toBe(30);
    expect(timeline.operationPeriods[0].absoluteYear).toBe(2024);
  });
});
