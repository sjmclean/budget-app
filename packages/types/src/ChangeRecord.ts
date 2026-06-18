import { ChangeOperation } from "./ChangeOperation.js";

export interface ChangeRecord {
  id: string;
  budgetId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: ChangeOperation;
  eventId: string | null;
  changedAt: Date;
  changeHash: string;
}
