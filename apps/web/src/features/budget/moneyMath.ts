export const MONEY_EPSILON = 0.005;

export function isMoneyZero(value: number): boolean {
  return Math.abs(value) < MONEY_EPSILON;
}

export function isMoneyNegative(value: number): boolean {
  return value < -MONEY_EPSILON;
}

export function normaliseMoney(value: number): number {
  return isMoneyZero(value) ? 0 : value;
}
