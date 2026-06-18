import { ValidationError } from "../../../types/src/AppError.js";

export function validateFutureMonth(month: string, currentMonth: string, maxFutureMonths: number): void {
  const target = new Date(`${month}-01T00:00:00.000Z`);
  const current = new Date(`${currentMonth}-01T00:00:00.000Z`);

  if (Number.isNaN(target.getTime()) || Number.isNaN(current.getTime())) {
    throw new ValidationError("Month values must use YYYY-MM format");
  }

  const diff = (target.getUTCFullYear() - current.getUTCFullYear()) * 12 + (target.getUTCMonth() - current.getUTCMonth());
  if (diff > maxFutureMonths) {
    throw new ValidationError("Budget month exceeds configured future month limit", { month, currentMonth, maxFutureMonths });
  }
}
