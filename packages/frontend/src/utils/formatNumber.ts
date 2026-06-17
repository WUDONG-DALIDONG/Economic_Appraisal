const DEFAULT_PRECISION = 2;

export function formatNumber(
  value: number | null | undefined,
  precision?: number | null,
  valueType?: string | null,
  useGrouping?: boolean | null
): string {
  if (value === null || value === undefined) return '';
  if (!Number.isFinite(value)) return String(value);

  const p = precision ?? DEFAULT_PRECISION;
  const grouping = useGrouping !== false;

  if (valueType === 'percentage') {
    const pct = (value * 100).toFixed(p);
    const [intPart, decPart] = pct.split('.');
    const formatted = grouping ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : intPart;
    return `${decPart ? `${formatted}.${decPart}` : formatted}%`;
  }

  const fixed = value.toFixed(p);
  const [intPart, decPart] = fixed.split('.');
  const formatted = grouping ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : intPart;

  return decPart ? `${formatted}.${decPart}` : formatted;
}
