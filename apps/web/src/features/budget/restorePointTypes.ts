import type { BudgetDomainCounts } from "../persistence/localFirst/contracts";

export const RESTORE_POINT_REASONS = [
  "timed", "initial-import", "before-import", "before-switch",
  "before-reset", "before-restore", "manual",
] as const;
export type RestorePointReason = typeof RESTORE_POINT_REASONS[number];

export interface RestorePointMetadata {
  readonly schema: "sqlite-restore-point.v2";
  readonly id: string;
  readonly budgetId: string;
  readonly budgetName: string;
  readonly createdAt: string;
  readonly reason: RestorePointReason;
  readonly syncEpoch: string;
  readonly localRevision: number;
  readonly mutationCount: number;
  readonly totalBytes: number;
  readonly databaseHash: string;
  readonly chunks: readonly RestorePointChunkReference[];
  /** Unique chunk bytes added at capture, excluding manifests and temporary files. */
  readonly newBytesStored: number;
  readonly newChunkCount: number;
  readonly counts: BudgetDomainCounts;
}

export interface CaptureRestorePointInput {
  readonly budgetName: string;
  readonly reason: RestorePointReason;
  readonly mutationCount: number;
}

export interface RestorePointChunkReference {
  readonly hash: string;
  readonly length: number;
}

export type RestorePointCaptureMetadata = Omit<RestorePointMetadata,
  "schema" | "id" | "databaseHash" | "totalBytes" | "chunks" | "newBytesStored" | "newChunkCount">;

export const RESTORE_POINT_LABELS: Record<RestorePointReason, string> = {
  timed: "Automatic checkpoint",
  "initial-import": "Initial imported budget",
  "before-import": "Before import",
  "before-switch": "Before switching budgets",
  "before-reset": "Before reset",
  "before-restore": "Before restore",
  manual: "Manual restore point",
};
