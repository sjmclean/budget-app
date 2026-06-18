import { randomUUID } from "crypto";
import { Budget } from "../../../types/src/Budget.js";

export function createBudget(name: string, currency = "AUD"): Budget {
  return { id: randomUUID(), name, currency, createdAt: new Date() };
}
