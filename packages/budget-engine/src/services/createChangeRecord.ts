import { createHash, randomUUID } from "crypto";
import { ChangeOperation } from "../../../types/src/ChangeOperation.js";
import { ChangeRecord } from "../../../types/src/ChangeRecord.js";

export interface CreateChangeRecordInput {
  budgetId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: ChangeOperation;
  eventId?: string | null;
}

export function createChangeRecord(input: CreateChangeRecordInput): ChangeRecord {
  const changedAt = new Date();
  const hashInput = `${input.budgetId}:${input.deviceId}:${input.entityType}:${input.entityId}:${input.operation}:${input.eventId ?? ""}:${changedAt.toISOString()}`;

  return {
    id: randomUUID(),
    budgetId: input.budgetId,
    deviceId: input.deviceId,
    entityType: input.entityType,
    entityId: input.entityId,
    operation: input.operation,
    eventId: input.eventId ?? null,
    changedAt,
    changeHash: createHash("sha256").update(hashInput).digest("hex")
  };
}
