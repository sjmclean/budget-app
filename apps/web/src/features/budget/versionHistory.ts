import {
  createBudgetDataExportPackage,
  restoreBudgetDataPackage,
  type BudgetDataExportPackage,
  type BudgetDataRestoreResult,
} from "./budgetDataExport";
import { getBudgetScopedStorageKey, SELECTED_BUDGET_STORAGE_KEY } from "./budgetDataScope";
import { readBudgetRegistry, type BudgetSummary } from "./budgetRegistry";
import { resolveActiveBudget } from "./activeBudget";
import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";

export const VERSION_HISTORY_INDEX_SCHEMA = "budget-app.version-history-index.v1";
export const VERSION_HISTORY_SNAPSHOT_SCHEMA = "budget-app.version-history-snapshot.v1";
export const VERSION_HISTORY_RELEASE = "v2.33.0";
export const DEFAULT_VERSION_HISTORY_LIMIT = 30;

const VERSION_HISTORY_INDEX_LOGICAL_KEY = "budget-app.version-history-index.v1";
const VERSION_HISTORY_SNAPSHOT_LOGICAL_PREFIX = "budget-app.version-history-snapshot.v1";

export type VersionHistorySnapshotSource = "automatic" | "manual";

export interface VersionHistorySnapshotMetadata {
  id: string;
  budgetId: string;
  budgetName: string;
  createdAt: string;
  release: typeof VERSION_HISTORY_RELEASE;
  source: VersionHistorySnapshotSource;
  description?: string;
}

export interface VersionHistoryIndex {
  schema: typeof VERSION_HISTORY_INDEX_SCHEMA;
  budgetId: string;
  retentionLimit: number;
  snapshots: VersionHistorySnapshotMetadata[];
}

export interface VersionHistorySnapshotPackage {
  schema: typeof VERSION_HISTORY_SNAPSHOT_SCHEMA;
  metadata: VersionHistorySnapshotMetadata;
  budgetPackage: BudgetDataExportPackage;
}

export interface CreateVersionHistorySnapshotInput {
  description?: string;
  source?: VersionHistorySnapshotSource;
  now?: Date;
  retentionLimit?: number;
  snapshotId?: string;
}

export interface CreateVersionHistorySnapshotResult {
  created: boolean;
  snapshot?: VersionHistorySnapshotMetadata;
  retainedSnapshots: number;
  prunedSnapshots: VersionHistorySnapshotMetadata[];
  warnings: string[];
  errors: string[];
}

export interface RestoreVersionHistorySnapshotResult extends BudgetDataRestoreResult {
  snapshotId?: string;
  snapshotCreatedAt?: string;
  snapshotDescription?: string;
}

function listStorageKeys(storage: KeyValueStoragePort): string[] {
  return typeof storage.listKeys === "function" ? storage.listKeys() : [];
}

function resolveCurrentBudget(storage: KeyValueStoragePort): BudgetSummary | null {
  const budgets = readBudgetRegistry(storage);
  const selectedBudgetId = storage.getItem(SELECTED_BUDGET_STORAGE_KEY)?.trim() || null;
  return resolveActiveBudget(budgets, selectedBudgetId);
}

function getVersionHistoryIndexStorageKey(budgetId: string): string {
  return getBudgetScopedStorageKey(budgetId, VERSION_HISTORY_INDEX_LOGICAL_KEY);
}

function getVersionHistorySnapshotStorageKey(budgetId: string, snapshotId: string): string {
  return getBudgetScopedStorageKey(budgetId, `${VERSION_HISTORY_SNAPSHOT_LOGICAL_PREFIX}.${snapshotId}`);
}

function normaliseDescription(description?: string): string | undefined {
  const trimmed = description?.trim();
  return trimmed ? trimmed : undefined;
}

function createSnapshotId(now: Date): string {
  const timestamp = now.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 10);
  return `${timestamp}-${random}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normaliseSnapshotMetadata(value: unknown): VersionHistorySnapshotMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const budgetId = typeof value.budgetId === "string" ? value.budgetId.trim() : "";
  const budgetName = typeof value.budgetName === "string" ? value.budgetName.trim() : "";
  const createdAt = typeof value.createdAt === "string" ? value.createdAt.trim() : "";
  const source = value.source === "manual" ? "manual" : "automatic";
  const description = normaliseDescription(typeof value.description === "string" ? value.description : undefined);

  if (!id || !budgetId || !budgetName || !createdAt) {
    return null;
  }

  return {
    id,
    budgetId,
    budgetName,
    createdAt,
    release: VERSION_HISTORY_RELEASE,
    source,
    ...(description ? { description } : {}),
  };
}

function sortSnapshotsNewestFirst(snapshots: VersionHistorySnapshotMetadata[]): VersionHistorySnapshotMetadata[] {
  return [...snapshots].sort((left, right) => {
    const byDate = right.createdAt.localeCompare(left.createdAt);
    return byDate !== 0 ? byDate : right.id.localeCompare(left.id);
  });
}

function sortSnapshotsOldestFirst(snapshots: VersionHistorySnapshotMetadata[]): VersionHistorySnapshotMetadata[] {
  return [...snapshots].sort((left, right) => {
    const byDate = left.createdAt.localeCompare(right.createdAt);
    return byDate !== 0 ? byDate : left.id.localeCompare(right.id);
  });
}

function readVersionHistoryIndex(storage: KeyValueStoragePort, budgetId: string): VersionHistoryIndex {
  const raw = storage.getItem(getVersionHistoryIndexStorageKey(budgetId));

  if (!raw) {
    return {
      schema: VERSION_HISTORY_INDEX_SCHEMA,
      budgetId,
      retentionLimit: DEFAULT_VERSION_HISTORY_LIMIT,
      snapshots: [],
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const snapshots = isRecord(parsed) && Array.isArray(parsed.snapshots)
      ? parsed.snapshots.map(normaliseSnapshotMetadata).filter((snapshot): snapshot is VersionHistorySnapshotMetadata => Boolean(snapshot))
      : [];
    const retentionLimit = isRecord(parsed) && Number.isFinite(Number(parsed.retentionLimit))
      ? Math.max(1, Math.floor(Number(parsed.retentionLimit)))
      : DEFAULT_VERSION_HISTORY_LIMIT;

    return {
      schema: VERSION_HISTORY_INDEX_SCHEMA,
      budgetId,
      retentionLimit,
      snapshots: sortSnapshotsNewestFirst(snapshots),
    };
  } catch {
    return {
      schema: VERSION_HISTORY_INDEX_SCHEMA,
      budgetId,
      retentionLimit: DEFAULT_VERSION_HISTORY_LIMIT,
      snapshots: [],
    };
  }
}

function writeVersionHistoryIndex(storage: KeyValueStoragePort, index: VersionHistoryIndex): void {
  storage.setItem(getVersionHistoryIndexStorageKey(index.budgetId), JSON.stringify({
    schema: VERSION_HISTORY_INDEX_SCHEMA,
    budgetId: index.budgetId,
    retentionLimit: index.retentionLimit,
    snapshots: sortSnapshotsNewestFirst(index.snapshots),
  }));
}

function pruneSnapshotPayloads(storage: KeyValueStoragePort, budgetId: string, snapshots: VersionHistorySnapshotMetadata[]): void {
  for (const snapshot of snapshots) {
    storage.removeItem(getVersionHistorySnapshotStorageKey(budgetId, snapshot.id));
  }
}

export function listVersionHistorySnapshots(
  storage: KeyValueStoragePort,
  budgetId?: string,
): VersionHistorySnapshotMetadata[] {
  const resolvedBudgetId = budgetId ?? resolveCurrentBudget(storage)?.id;
  if (!resolvedBudgetId) {
    return [];
  }

  return readVersionHistoryIndex(storage, resolvedBudgetId).snapshots;
}

export function createVersionHistorySnapshot(
  storage: KeyValueStoragePort,
  input: CreateVersionHistorySnapshotInput = {},
): CreateVersionHistorySnapshotResult {
  const activeBudget = resolveCurrentBudget(storage);

  if (!activeBudget) {
    return {
      created: false,
      retainedSnapshots: 0,
      prunedSnapshots: [],
      warnings: [],
      errors: ["No active budget is available for version history."],
    };
  }

  const now = input.now ?? new Date();
  const createdAt = now.toISOString();
  const retentionLimit = Math.max(1, Math.floor(input.retentionLimit ?? DEFAULT_VERSION_HISTORY_LIMIT));
  const snapshotId = input.snapshotId?.trim() || createSnapshotId(now);
  const description = normaliseDescription(input.description);
  const metadata: VersionHistorySnapshotMetadata = {
    id: snapshotId,
    budgetId: activeBudget.id,
    budgetName: activeBudget.name,
    createdAt,
    release: VERSION_HISTORY_RELEASE,
    source: input.source ?? (description ? "manual" : "automatic"),
    ...(description ? { description } : {}),
  };

  const budgetPackage = createBudgetDataExportPackage(storage, "backup", now);
  const snapshotPackage: VersionHistorySnapshotPackage = {
    schema: VERSION_HISTORY_SNAPSHOT_SCHEMA,
    metadata,
    budgetPackage,
  };

  storage.setItem(getVersionHistorySnapshotStorageKey(activeBudget.id, snapshotId), JSON.stringify(snapshotPackage));

  const index = readVersionHistoryIndex(storage, activeBudget.id);
  const withoutDuplicate = index.snapshots.filter((snapshot) => snapshot.id !== snapshotId);
  const snapshots = sortSnapshotsNewestFirst([...withoutDuplicate, metadata]);
  const prunedSnapshots = sortSnapshotsOldestFirst(snapshots).slice(0, Math.max(0, snapshots.length - retentionLimit));
  const prunedIds = new Set(prunedSnapshots.map((snapshot) => snapshot.id));
  const retainedSnapshots = snapshots.filter((snapshot) => !prunedIds.has(snapshot.id));

  pruneSnapshotPayloads(storage, activeBudget.id, prunedSnapshots);
  writeVersionHistoryIndex(storage, {
    schema: VERSION_HISTORY_INDEX_SCHEMA,
    budgetId: activeBudget.id,
    retentionLimit,
    snapshots: retainedSnapshots,
  });

  return {
    created: true,
    snapshot: metadata,
    retainedSnapshots: retainedSnapshots.length,
    prunedSnapshots,
    warnings: prunedSnapshots.length > 0 ? [`Pruned ${prunedSnapshots.length} old version history snapshot(s).`] : [],
    errors: [],
  };
}

export function readVersionHistorySnapshotPackage(
  storage: KeyValueStoragePort,
  snapshotId: string,
  budgetId?: string,
): VersionHistorySnapshotPackage | null {
  const resolvedBudgetId = budgetId ?? resolveCurrentBudget(storage)?.id;
  if (!resolvedBudgetId || !snapshotId.trim()) {
    return null;
  }

  const raw = storage.getItem(getVersionHistorySnapshotStorageKey(resolvedBudgetId, snapshotId.trim()));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.schema !== VERSION_HISTORY_SNAPSHOT_SCHEMA) {
      return null;
    }

    const metadata = normaliseSnapshotMetadata(parsed.metadata);
    if (!metadata || !isRecord(parsed.budgetPackage)) {
      return null;
    }

    return {
      schema: VERSION_HISTORY_SNAPSHOT_SCHEMA,
      metadata,
      budgetPackage: parsed.budgetPackage as unknown as BudgetDataExportPackage,
    };
  } catch {
    return null;
  }
}

export function restoreVersionHistorySnapshot(
  storage: KeyValueStoragePort,
  snapshotId: string,
): RestoreVersionHistorySnapshotResult {
  const snapshotPackage = readVersionHistorySnapshotPackage(storage, snapshotId);

  if (!snapshotPackage) {
    return {
      restored: false,
      removedRecords: 0,
      writtenRecords: 0,
      skippedGlobalRecords: 0,
      warnings: [],
      errors: ["Version history snapshot could not be read."],
      snapshotId,
    };
  }

  const result = restoreBudgetDataPackage(storage, JSON.stringify(snapshotPackage.budgetPackage));

  return {
    ...result,
    snapshotId: snapshotPackage.metadata.id,
    snapshotCreatedAt: snapshotPackage.metadata.createdAt,
    snapshotDescription: snapshotPackage.metadata.description,
  };
}

export function deleteVersionHistorySnapshot(
  storage: KeyValueStoragePort,
  snapshotId: string,
  budgetId?: string,
): boolean {
  const resolvedBudgetId = budgetId ?? resolveCurrentBudget(storage)?.id;
  if (!resolvedBudgetId || !snapshotId.trim()) {
    return false;
  }

  const index = readVersionHistoryIndex(storage, resolvedBudgetId);
  const nextSnapshots = index.snapshots.filter((snapshot) => snapshot.id !== snapshotId.trim());

  if (nextSnapshots.length === index.snapshots.length) {
    return false;
  }

  storage.removeItem(getVersionHistorySnapshotStorageKey(resolvedBudgetId, snapshotId.trim()));
  writeVersionHistoryIndex(storage, {
    ...index,
    snapshots: nextSnapshots,
  });
  return true;
}

export function collectVersionHistoryStorageKeys(storage: KeyValueStoragePort, budgetId: string): string[] {
  const prefix = getBudgetScopedStorageKey(budgetId, VERSION_HISTORY_SNAPSHOT_LOGICAL_PREFIX);
  return listStorageKeys(storage)
    .filter((key) => key === getVersionHistoryIndexStorageKey(budgetId) || key.startsWith(prefix))
    .sort();
}
