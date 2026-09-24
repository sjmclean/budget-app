export interface IncomeBudgetMonthOption {
  readonly value: string;
  readonly label: string;
}

export function addBudgetMonths(month: string, offset: number): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error("Budget month must use YYYY-MM.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatBudgetMonth(month: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return month;
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

export function latestAllowedIncomeBudgetMonth(
  currentBudgetMonth: string,
  futureMonthLimit: number,
): string {
  return addBudgetMonths(
    currentBudgetMonth,
    Math.max(0, Math.min(12, Math.floor(futureMonthLimit))),
  );
}

export function incomeBudgetMonthOptions(
  transactionDate: string,
  latestAllowedMonth: string,
): readonly IncomeBudgetMonthOption[] {
  const transactionMonth = transactionDate.slice(0, 7);
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(transactionMonth) ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(latestAllowedMonth)
  ) {
    return [];
  }

  const throughMonth =
    transactionMonth > latestAllowedMonth ? transactionMonth : latestAllowedMonth;
  const options: IncomeBudgetMonthOption[] = [];
  let month = transactionMonth;
  while (month <= throughMonth) {
    options.push({ value: month, label: formatBudgetMonth(month) });
    month = addBudgetMonths(month, 1);
  }
  return options;
}

export function validIncomeBudgetMonth(
  value: string,
  transactionDate: string,
  latestAllowedMonth?: string,
): boolean {
  const transactionMonth = transactionDate.slice(0, 7);
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(transactionMonth) &&
    value >= transactionMonth &&
    (!latestAllowedMonth || value <= latestAllowedMonth || value === transactionMonth)
  );
}
