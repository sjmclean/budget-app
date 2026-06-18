import { randomUUID } from "crypto";
import { DeletedItem } from "../../../types/src/DeletedItem.js";

export function createDeletedItem(input: {
  budgetId: string;
  entityType: string;
  entityId: string;
  deletedByUserId?: string | null;
  reason?: string | null;
}): DeletedItem {
  return {
    id: randomUUID(),
    budgetId: input.budgetId,
    entityType: input.entityType,
    entityId: input.entityId,
    deletedByUserId: input.deletedByUserId ?? null,
    deletedAt: new Date(),
    reason: input.reason ?? null,
  };
}
