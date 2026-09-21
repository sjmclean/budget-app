import type { ScheduledTransactionView } from "./scheduledTransactionTypes";
import {
  getPersistenceRevisionForInterest,
  type PersistenceChangeInterest,
} from "../persistence/persistenceChangeBus";

const MAX_WARM_SCHEDULED_PREVIEWS = 16;

interface WarmScheduledPreview {
  readonly schedules: readonly ScheduledTransactionView[];
  readonly revision: number;
}

const warmScheduledPreviews = new Map<string, WarmScheduledPreview>();
const scheduledPreviewInFlight = new Map<string, Promise<void>>();

function interest(
  budgetId: string,
  accountId: string,
): PersistenceChangeInterest {
  return {
    budgetId,
    accountId,
    domains: ["scheduled-transactions"],
  };
}

function key(budgetId: string, accountId: string): string {
  return JSON.stringify([budgetId, accountId]);
}

function retain(
  budgetId: string,
  accountId: string,
  schedules: readonly ScheduledTransactionView[],
  revision: number,
): void {
  const cacheKey = key(budgetId, accountId);
  warmScheduledPreviews.delete(cacheKey);
  warmScheduledPreviews.set(cacheKey, {
    schedules: schedules.map((schedule) => ({ ...schedule })),
    revision,
  });

  while (warmScheduledPreviews.size > MAX_WARM_SCHEDULED_PREVIEWS) {
    const oldestKey = warmScheduledPreviews.keys().next().value;
    if (oldestKey === undefined) break;
    warmScheduledPreviews.delete(oldestKey);
  }
}

export function readWarmScheduledTransactionPreview(
  budgetId: string,
  accountId: string,
): readonly ScheduledTransactionView[] | null {
  const cacheKey = key(budgetId, accountId);
  const warm = warmScheduledPreviews.get(cacheKey);
  if (!warm) return null;

  const currentRevision =
    getPersistenceRevisionForInterest(interest(budgetId, accountId));
  if (warm.revision !== currentRevision) {
    warmScheduledPreviews.delete(cacheKey);
    return null;
  }

  return warm.schedules.map((schedule) => ({ ...schedule }));
}

export function retainScheduledTransactionPreview(
  budgetId: string,
  accountId: string,
  schedules: readonly ScheduledTransactionView[],
): void {
  retain(
    budgetId,
    accountId,
    schedules,
    getPersistenceRevisionForInterest(interest(budgetId, accountId)),
  );
}

export function prefetchScheduledTransactionPreview(input: {
  readonly budgetId: string;
  readonly accountId: string;
  readonly load: () => Promise<readonly ScheduledTransactionView[]>;
}): void {
  const cacheKey = key(input.budgetId, input.accountId);
  const currentRevision =
    getPersistenceRevisionForInterest(interest(input.budgetId, input.accountId));
  const warm = warmScheduledPreviews.get(cacheKey);

  if (warm?.revision === currentRevision || scheduledPreviewInFlight.has(cacheKey)) {
    return;
  }

  let promise!: Promise<void>;
  promise = (async () => {
    const schedules = await input.load();
    const completedRevision =
      getPersistenceRevisionForInterest(interest(input.budgetId, input.accountId));
    if (completedRevision !== currentRevision) return;
    retain(input.budgetId, input.accountId, schedules, completedRevision);
  })()
    .catch(() => undefined)
    .finally(() => {
      if (scheduledPreviewInFlight.get(cacheKey) === promise) {
        scheduledPreviewInFlight.delete(cacheKey);
      }
    });

  scheduledPreviewInFlight.set(cacheKey, promise);
}
