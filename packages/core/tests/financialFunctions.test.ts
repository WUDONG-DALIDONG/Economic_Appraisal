import { describe, it, expect } from 'vitest';
import {
  PMT,
  SLN,
  NPV,
  IRR,
  PAYBACK,
  POWER,
  IF,
  financialFunctions,
} from '../src/formula/financialFunctions';

describe('Financial Functions - PMT', () => {
  it('calculates PMT for simple loan', () => {
    // Loan 10000, rate 5% per year, 5 years
    const result = PMT(0.05, 5, 10000);
    // Expected: ~-2309.75 (negative means payment outgoing)
    expect(typeof result).toBe('number');
    expect(Math.abs((result as number) + 2309.75)).toBeLessThan(1);
  });

  it('handles zero interest rate', () => {
    const result = PMT(0, 5, 10000);
    expect(result).toBe(-2000); // Simple division
  });

  it('handles fv parameter', () => {
    const result = PMT(0.05, 5, 10000, -5000);
    expect(typeof result).toBe('number');
  });

  it('handles type parameter', () => {
    const result = PMT(0.05, 5, 10000, 0, 1);
    expect(typeof result).toBe('number');
  });
});

describe('Financial Functions - SLN', () => {
  it('calculates straight-line depreciation', () => {
    // Cost 10000, salvage 2000, life 5 years
    const result = SLN(10000, 2000, 5);
    expect(result).toBe(1600);
  });

  it('returns 0 when life is 0', () => {
    const result = SLN(10000, 2000, 0);
    expect(result).toBe(0);
  });
});

describe('Financial Functions - NPV', () => {
  it('calculates NPV with single value', () => {
    const result = NPV(0.1, [100]);
    expect(result).toBeCloseTo(90.909, 2);
  });

  it('calculates NPV with multiple values', () => {
    const result = NPV(0.1, [-1000, 300, 400, 400, 300]);
    expect(typeof result).toBe('number');
    expect(result as number).toBeCloseTo(98.86, 1);
  });

  it('calculates NPV for investment project', () => {
    const result = NPV(0.1, [-10000, 3000, 4000, 4000, 3000]);
    expect(typeof result).toBe('number');
    expect(result as number).toBeGreaterThan(0); // Positive NPV
  });
});

describe('Financial Functions - IRR', () => {
  it('calculates IRR for simple investment', () => {
    const result = IRR([-1000, 300, 400, 400, 300]);
    expect(typeof result).toBe('number');
    // Correct IRR ≈ 14.9%, verify NPV at this rate ≈ 0
    expect(result as number).toBeGreaterThan(0.1);
    expect(result as number).toBeLessThan(0.2);
    const npv = NPV(result as number, [-1000, 300, 400, 400, 300]);
    expect(Math.abs(npv as number)).toBeLessThan(0.01);
  });

  it('calculates IRR for another example', () => {
    const result = IRR([-100, 20, 30, 40, 50]);
    expect(typeof result).toBe('number');
  });

  it('returns null for no sign change', () => {
    const result = IRR([100, 200, 300]);
    expect(result).toBeNull();
  });

  it('handles single value', () => {
    const result = IRR([-100]);
    expect(result).toBeNull(); // Can't calculate IRR with single value
  });
});

describe('Financial Functions - PAYBACK', () => {
  it('calculates payback period', () => {
    const result = PAYBACK([-1000, 300, 400, 400, 300, 200]);
    // cumulative at end of period 2: -300
    // need 300/400 of period 3
    expect(result).toBe(2.75);
  });

  it('returns null if never pays back', () => {
    const result = PAYBACK([-1000, 100, 100, 100]);
    expect(result).toBeNull();
  });

  it('handles empty array', () => {
    const result = PAYBACK([]);
    expect(result).toBeNull();
  });
});

describe('Financial Functions - POWER', () => {
  it('calculates power', () => {
    expect(POWER(2, 3)).toBe(8);
  });

  it('handles fractional exponent', () => {
    expect(POWER(4, 0.5)).toBe(2);
  });
});

describe('Financial Functions - IF', () => {
  it('returns true branch', () => {
    expect(IF(true, 1, 0)).toBe(1);
  });

  it('returns false branch', () => {
    expect(IF(false, 1, 0)).toBe(0);
  });
});

describe('Financial Functions - registry', () => {
  it('exports all functions in registry', () => {
    expect(Object.keys(financialFunctions)).toContain('PMT');
    expect(Object.keys(financialFunctions)).toContain('SLN');
    expect(Object.keys(financialFunctions)).toContain('NPV');
    expect(Object.keys(financialFunctions)).toContain('IRR');
    expect(Object.keys(financialFunctions)).toContain('POWER');
    expect(Object.keys(financialFunctions)).toContain('IF');
    expect(Object.keys(financialFunctions)).toContain('PAYBACK');
  });
});

describe('Financial Functions - IRR with Chinese Excel test case', () => {
  it('calculates IRR for multi-year project', () => {
    const cashFlows = [-100000, 30000, 35000, 35000, 25000, 20000];
    const result = IRR(cashFlows);
    expect(typeof result).toBe('number');
    // Verify it produces a valid positive rate
    expect(result as number).toBeGreaterThan(0);
    // NPV at this rate should be close to 0
    const npvAtIRR = NPV(result as number, cashFlows);
    expect(Math.abs(npvAtIRR as number)).toBeLessThan(100);
  });
});
