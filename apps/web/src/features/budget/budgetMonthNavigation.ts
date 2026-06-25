const budgetMonthPattern = /^(\d{4})-(\d{2})$/;

export function normaliseBudgetMonth(month: string): string {
  const match = budgetMonthPattern.exec(month);

  if (!match) {
    throw new Error(`Invalid budget month: ${month}`);
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid budget month: ${month}`);
  }

  return `${year.toString().padStart(4, "0")}-${monthNumber
    .toString()
    .padStart(2, "0")}`;
}

export function addMonthsToBudgetMonth(month: string, delta: number): string {
  const normalisedMonth = normaliseBudgetMonth(month);
  const [yearPart, monthPart] = normalisedMonth.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const absoluteMonth = year * 12 + monthIndex + delta;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonthIndex = absoluteMonth - nextYear * 12;

  return `${nextYear.toString().padStart(4, "0")}-${(nextMonthIndex + 1)
    .toString()
    .padStart(2, "0")}`;
}

export function getPreviousBudgetMonth(month: string): string {
  return addMonthsToBudgetMonth(month, -1);
}

export function getNextBudgetMonth(month: string): string {
  return addMonthsToBudgetMonth(month, 1);
}

export function getCurrentBudgetMonth(now = new Date()): string {
  return `${now.getFullYear().toString().padStart(4, "0")}-${(
    now.getMonth() + 1
  )
    .toString()
    .padStart(2, "0")}`;
}
