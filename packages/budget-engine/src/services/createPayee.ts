import { randomUUID } from "crypto";
import { Payee } from "../../../types/src/Payee.js";

export function createPayee(budgetId: string, name: string): Payee {
  return { id: randomUUID(), budgetId, name };
}
