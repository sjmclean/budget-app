import type { BudgetDomainCounts } from "../persistence/localFirst/contracts";

export const RESTORE_POINT_REASONS = [
  "timed", "initial-import", "before-import", "before-switch",
  "before-reset", "before-restore", "before-delete", "manual",
] as const;
export type RestorePointReason = typeof RESTORE_POINT_REASONS[number];

export interface RestorePointMetadata {
  readonly schema: "sqlite-restore-point.v1";
  readonly id: string;
  readonly budgetId: string;
  readonly budgetName: string;
  readonly createdAt: string;
  readonly reason: RestorePointReason;
  readonly syncEpoch: string;
  readonly localRevision: number;
  readonly mutationCount: number;
  readonly totalBytes: number;
  readonly contentHash: string;
  readonly counts: BudgetDomainCounts;
}

export interface CaptureRestorePointInput {
  readonly budgetName: string;
  readonly reason: RestorePointReason;
  readonly mutationCount: number;
}

export const RESTORE_POINT_LABELS: Record<RestorePointReason, string> = {
  timed: "Automatic checkpoint",
  "initial-import": "Initial imported budget",
  "before-import": "Before import",
  "before-switch": "Before switching budgets",
  "before-reset": "Before reset",
  "before-restore": "Before restore",
  "before-delete": "Before deletion",
  manual: "Manual restore point",
};
