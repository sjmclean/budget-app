import { ValidationError } from "../../../types/src/AppError.js";

export function validateTransfer(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
): void {
  if (!fromAccountId) throw new ValidationError("Source account is required");
  if (!toAccountId)
    throw new ValidationError("Destination account is required");
  if (fromAccountId === toAccountId)
    throw new ValidationError("Transfer accounts must be different");
  if (!Number.isFinite(amount) || amount <= 0)
    throw new ValidationError("Transfer amount must be positive");
}
