export function parseYnabAmount(value: string | undefined | null): number {
  if (!value) return 0;
  const cleaned = value
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/\(/g, "-")
    .replace(/\)/g, "")
    .trim();
  const numeric = Number(cleaned);
  return Number.isNaN(numeric) ? 0 : Math.round(numeric * 100);
}
