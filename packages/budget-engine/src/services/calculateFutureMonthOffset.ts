import { ValidationError } from "../../../types/src/AppError.js";

export function calculateFutureMonthOffset(
  month: string,
  currentMonth: string,
): number {
  const target = new Date(`${month}-01T00:00:00.000Z`);
  const current = new Date(`${currentMonth}-01T00:00:00.000Z`);

  if (Number.isNaN(target.getTime()) || Number.isNaN(current.getTime())) {
    throw new ValidationError("Month values must use YYYY-MM format");
  }

  return (
    (target.getUTCFullYear() - current.getUTCFullYear()) * 12 +
    (target.getUTCMonth() - current.getUTCMonth())
  );
}
