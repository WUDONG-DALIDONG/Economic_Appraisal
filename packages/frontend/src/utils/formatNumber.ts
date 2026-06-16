const DEFAULT_PRECISION = 2;

export function formatNumber(
  value: number | null | undefined,
  precision?: number | null
): string {
  if (value === null || value === undefined) return '';
  if (!Number.isFinite(value)) return String(value);

  const p = precision ?? DEFAULT_PRECISION;
  const fixed = value.toFixed(p);

  const [intPart, decPart] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return decPart ? `${withCommas}.${decPart}` : withCommas;
}
