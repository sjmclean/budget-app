import { isMoneyNegative, isMoneyZero, normaliseMoney } from "./moneyMath";

export function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(normaliseMoney(value));
}

export function getAvailableClass(value: number, isOverassignedSource: boolean) {
  if (isMoneyNegative(value)) {
    return "available-pill available-pill-negative";
  }

  if (isMoneyZero(value)) {
    return "available-pill available-pill-zero";
  }

  if (isOverassignedSource) {
    return "available-pill available-pill-warning";
  }

  return "available-pill available-pill-positive";
}
