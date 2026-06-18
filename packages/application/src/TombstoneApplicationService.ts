import { DeletedItem } from "../../types/src/DeletedItem.js";
import { createDeletedItem } from "../../budget-engine/src/services/createDeletedItem.js";

export class TombstoneApplicationService {
  create(input: {
    budgetId: string;
    entityType: string;
    entityId: string;
    deletedByUserId?: string | null;
    reason?: string | null;
  }): DeletedItem {
    return createDeletedItem(input);
  }
}
