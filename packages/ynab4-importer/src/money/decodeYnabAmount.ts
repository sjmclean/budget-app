export interface YnabAmountFields {
  amount?: unknown;
  amountMilliUnits?: unknown;
  inflow?: unknown;
  outflow?: unknown;
}

/**
 * Decode a signed YNAB transaction amount in display units.
 *
 * Precedence mirrors the source model:
 * 1. explicit signed display-unit amount
 * 2. explicit signed milliunit amount
 * 3. inflow as a positive display-unit amount
 * 4. outflow as a negative display-unit amount
 */
export function decodeYnabAmount(fields: YnabAmountFields): number | null {
  const explicitAmount = parseYnabDisplayAmount(fields.amount);
  if (explicitAmount !== null) return explicitAmount;

  const milliunitAmount = parseYnabMilliunitAmount(fields.amountMilliUnits);
  if (milliunitAmount !== null) return milliunitAmount;

  const inflow = parseYnabDisplayAmount(fields.inflow);
  if (inflow !== null) return Math.abs(inflow);

  const outflow = parseYnabDisplayAmount(fields.outflow);
  if (outflow !== null) return -Math.abs(outflow);

  return null;
}

/** Return the first parseable display-unit value without applying a sign. */
export function firstYnabDisplayAmount(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseYnabDisplayAmount(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function parseYnabDisplayAmount(value: unknown): number | null {
  const parsed = parseNumericValue(value);
  return parsed === null ? null : roundYnabMoney(parsed);
}

export function parseYnabMilliunitAmount(value: unknown): number | null {
  const parsed = parseNumericValue(value);

  if (parsed === null) {
    return null;
  }

  // Convert exact milliunits to cents using sign-symmetric rounding.
  // This avoids floating-point tie errors such as 1005 -> 1.005 -> 1.00.
  const cents = Math.sign(parsed) * Math.round(Math.abs(parsed) / 10);

  return cents / 100;
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;

  const parsed = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundYnabMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
