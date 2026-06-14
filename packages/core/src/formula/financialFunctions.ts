/**
 * Financial functions used in economic project evaluation
 * Compatible with Excel financial formulas
 */
import { CellValue } from '../types';

/**
 * PMT - Payment for a loan
 * rate: interest rate per period
 * nper: total number of payment periods
 * pv: present value (loan amount)
 * fv: future value (default 0)
 * type: 0 = end of period, 1 = beginning of period
 */
export function PMT(
  rate: CellValue,
  nper: CellValue,
  pv: CellValue,
  fv: CellValue = 0,
  type: CellValue = 0
): CellValue {
  if (typeof rate !== 'number' || typeof nper !== 'number' || typeof pv !== 'number') return null;
  const fvNum = typeof fv === 'number' ? fv : 0;
  const typeNum = type === 1 ? 1 : 0;

  if (rate === 0) {
    return -(pv + fvNum) / nper;
  }

  const pmt =
    -(pv * Math.pow(1 + rate, nper) + fvNum) /
    ((1 + rate * typeNum) * ((Math.pow(1 + rate, nper) - 1) / rate));
  return pmt;
}

/**
 * SLN - Straight-line depreciation
 * cost: initial cost
 * salvage: salvage value at end of life
 * life: useful life in periods
 */
export function SLN(cost: CellValue, salvage: CellValue, life: CellValue): CellValue {
  if (typeof cost !== 'number' || typeof salvage !== 'number' || typeof life !== 'number') return null;
  if (life <= 0) return 0;
  return (cost - salvage) / life;
}

/**
 * NPV - Net Present Value
 * rate: discount rate
 * values: array of cash flows (first value is at end of period 1)
 * Note: Unlike Excel, this includes the initial investment as the first element
 * to match the common Chinese financial model pattern
 */
export function NPV(rate: CellValue, values: CellValue): CellValue {
  if (typeof rate !== 'number' || !Array.isArray(values)) return null;
  let npv = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number') continue;
    npv += v / Math.pow(1 + rate, i + 1);
  }
  return npv;
}

/**
 * IRR - Internal Rate of Return
 * values: array of cash flows
 * Uses Newton-Raphson method
 */
export function IRR(values: CellValue, guess: CellValue = 0.1): CellValue {
  if (!Array.isArray(values) || values.length < 2) return null;
  const cashFlows = values.map(v => (typeof v === 'number' ? v : 0));

  // Check for sign change (required for IRR)
  const hasPositive = cashFlows.some(v => v > 0);
  const hasNegative = cashFlows.some(v => v < 0);
  if (!hasPositive || !hasNegative) return null;

  let rate = typeof guess === 'number' ? guess : 0.1;
  const maxIterations = 100;
  const tolerance = 1e-7;

  for (let i = 0; i < maxIterations; i++) {
    const npv = calculateNPV(rate, cashFlows);
    const derivative = calculateNPVDerivative(rate, cashFlows);

    if (Math.abs(npv) < tolerance) {
      return rate;
    }

    if (Math.abs(derivative) < tolerance) {
      return null; // Derivative too small
    }

    rate = rate - npv / derivative;

    if (rate <= -1) {
      rate = -0.99; // Keep rate > -1
    }
  }

  return null; // Did not converge
}

function calculateNPV(rate: number, cashFlows: number[]): number {
  let npv = 0;
  for (let i = 0; i < cashFlows.length; i++) {
    npv += cashFlows[i] / Math.pow(1 + rate, i);
  }
  return npv;
}

function calculateNPVDerivative(rate: number, cashFlows: number[]): number {
  let derivative = 0;
  for (let i = 0; i < cashFlows.length; i++) {
    if (i === 0) continue;
    derivative -= i * cashFlows[i] / Math.pow(1 + rate, i + 1);
  }
  return derivative;
}

/**
 * PAYBACK - Payback period
 * values: array of cash flows (first element is initial investment, typically negative)
 * Returns the period when cumulative cash flow turns positive, with fractional part
 */
export function PAYBACK(values: CellValue): CellValue {
  if (!Array.isArray(values) || values.length === 0) return null;

  const cashFlows = values.map(v => (typeof v === 'number' ? v : 0));
  
  let cumulative = 0;
  for (let i = 0; i < cashFlows.length; i++) {
    cumulative += cashFlows[i];
    if (cumulative >= 0) {
      const prevCumulative = cumulative - cashFlows[i];
      if (cashFlows[i] !== 0 && i > 0) {
        const fraction = Math.abs(prevCumulative) / Math.abs(cashFlows[i]);
        return (i - 1) + fraction; // years of full periods + fraction
      }
      return i === 0 ? 0 : i - 1;
    }
  }

  return null; // Never pays back
}

/**
 * POWER - Power function
 */
export function POWER(base: CellValue, exponent: CellValue): CellValue {
  if (typeof base !== 'number' || typeof exponent !== 'number') return null;
  return Math.pow(base, exponent);
}

/**
 * IF - Conditional function
 */
export function IF(condition: CellValue, trueValue: CellValue, falseValue: CellValue): CellValue {
  return condition ? trueValue : falseValue;
}

/**
 * Registry of all financial functions for the interpreter
 */
export const financialFunctions: Record<string, (...args: CellValue[]) => CellValue> = {
  PMT,
  SLN,
  NPV,
  IRR,
  PAYBACK,
  POWER,
  IF,
};
