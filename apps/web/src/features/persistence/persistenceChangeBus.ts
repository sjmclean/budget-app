import { useMemo, useSyncExternalStore } from "react";

export type PersistenceChangeSource =
  | "local"
  | "replication"
  | "restore";

export const PERSISTENCE_CHANGE_DOMAINS = ["accounts", "transactions", "budget", "categories", "payees", "goals", "scheduled-transactions", "attachments", "settings", "registry"] as const;
export type PersistenceChangeDomain = (typeof PERSISTENCE_CHANGE_DOMAINS)[number];
export interface PersistenceChangeScope { readonly budgetId: string; readonly domains: readonly PersistenceChangeDomain[]; readonly accountIds?: readonly string[]; readonly transactionIds?: readonly string[]; readonly categoryIds?: readonly string[]; readonly months?: readonly string[]; readonly broad?: boolean; }
export interface PersistenceChangeEvent { readonly source: PersistenceChangeSource; readonly scope: PersistenceChangeScope; readonly occurredAt: string; }
export interface PersistenceChangeInterest { readonly budgetId: string; readonly domains?: readonly PersistenceChangeDomain[]; readonly accountId?: string; readonly transactionId?: string; readonly categoryId?: string; readonly month?: string; }
type Listener = (event: PersistenceChangeEvent) => void;
const listeners = new Set<Listener>();
const interestListeners = new Set<{ interest: PersistenceChangeInterest; listener: (event: PersistenceChangeEvent, revision: number) => void }>();
let pending: PersistenceChangeEvent[] = [];
let pendingOriginals: { event: PersistenceChangeEvent; revision: number }[] = [];
let flushScheduled = false;
let persistenceChangeRevision = 0;
// One latest revision per distinct publication scope, not one retained event per
// publication. Repeated writes to a scope replace its entry. Keeping the
// original scope lets snapshot reads use the same matcher as notifications.
const revisionsByBudgetAndScope = new Map<string, Map<string, { event: PersistenceChangeEvent; revision: number }>>();
const uniqueSorted = (values: readonly string[] | undefined) => values?.length ? [...new Set(values)].sort() : undefined;

function scopeKey(scope: PersistenceChangeScope): string {
  return JSON.stringify([scope.domains, scope.accountIds, scope.transactionIds, scope.categoryIds, scope.months, scope.broad]);
}

export function getPersistenceRevisionForInterest(interest: PersistenceChangeInterest): number {
  let latest = 0;
  for (const { event, revision } of revisionsByBudgetAndScope.get(interest.budgetId)?.values() ?? []) {
    if (revision > latest && doesPersistenceChangeAffect(event, interest)) latest = revision;
  }
  return latest;
}

export function normalisePersistenceChange(input: Omit<PersistenceChangeEvent, "occurredAt"> & { readonly occurredAt?: string }): PersistenceChangeEvent {
  if (!input.scope.budgetId) throw new Error("A persistence change requires a budgetId.");
  const domains = uniqueSorted(input.scope.domains);
  if (!domains?.length && !input.scope.broad) throw new Error("A scoped persistence change requires at least one domain.");
  return { source: input.source, occurredAt: input.occurredAt ?? new Date().toISOString(), scope: { budgetId: input.scope.budgetId, domains: (domains ?? []) as PersistenceChangeDomain[], accountIds: uniqueSorted(input.scope.accountIds), transactionIds: uniqueSorted(input.scope.transactionIds), categoryIds: uniqueSorted(input.scope.categoryIds), months: uniqueSorted(input.scope.months), broad: input.scope.broad || undefined } };
}
function overlaps(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean { return !left || !right || left.some((value) => right.includes(value)); }
export function doesPersistenceChangeAffect(change: PersistenceChangeEvent, interest: PersistenceChangeInterest): boolean {
  if (change.scope.budgetId !== interest.budgetId) return false;
  if (change.scope.broad) return true;
  if (interest.domains && !overlaps(change.scope.domains, interest.domains)) return false;
  if (!overlaps(change.scope.accountIds, interest.accountId ? [interest.accountId] : undefined)) return false;
  if (!overlaps(change.scope.transactionIds, interest.transactionId ? [interest.transactionId] : undefined)) return false;
  if (!overlaps(change.scope.categoryIds, interest.categoryId ? [interest.categoryId] : undefined)) return false;
  if (!overlaps(change.scope.months, interest.month ? [interest.month] : undefined)) return false;
  return true;
}
const union = (a?: readonly string[], b?: readonly string[]) =>
  a === undefined || b === undefined ? undefined : uniqueSorted([...a, ...b]);
export function mergePersistenceChanges(left: PersistenceChangeEvent, right: PersistenceChangeEvent): PersistenceChangeEvent | null {
  if (left.source !== right.source || left.scope.budgetId !== right.scope.budgetId) return null;
  return normalisePersistenceChange({ source: left.source, occurredAt: left.occurredAt < right.occurredAt ? right.occurredAt : left.occurredAt, scope: { budgetId: left.scope.budgetId, domains: union(left.scope.domains, right.scope.domains) as PersistenceChangeDomain[], accountIds: union(left.scope.accountIds, right.scope.accountIds), transactionIds: union(left.scope.transactionIds, right.scope.transactionIds), categoryIds: union(left.scope.categoryIds, right.scope.categoryIds), months: union(left.scope.months, right.scope.months), broad: left.scope.broad || right.scope.broad } });
}

export function publishPersistenceChange(
  input: Omit<PersistenceChangeEvent, "occurredAt"> & { readonly occurredAt?: string },
): number {
  const event = normalisePersistenceChange(input);
  persistenceChangeRevision += 1;
  const revision = persistenceChangeRevision;
  let scopes = revisionsByBudgetAndScope.get(event.scope.budgetId);
  if (!scopes) {
    scopes = new Map();
    revisionsByBudgetAndScope.set(event.scope.budgetId, scopes);
  }
  scopes.set(scopeKey(event.scope), { event, revision });
  pendingOriginals.push({ event, revision });
  const index = pending.findIndex((candidate) => candidate.source === event.source && candidate.scope.budgetId === event.scope.budgetId);
  if (index < 0) pending.push(event); else pending[index] = mergePersistenceChanges(pending[index]!, event)!;
  if (!flushScheduled) { flushScheduled = true; queueMicrotask(flushPersistenceChanges); }
  return revision;
}

/** Counts publication calls, including calls later coalesced into one flush. */
export function getPersistenceChangeRevision(): number { return persistenceChangeRevision; }

export function flushPersistenceChanges(): void {
  flushScheduled = false;
  const events = pending;
  const originals = pendingOriginals;
  pending = [];
  pendingOriginals = [];
  for (const event of events) for (const listener of listeners) listener(event);
  for (const subscription of interestListeners) {
    const relevant = originals.filter(({ event }) => doesPersistenceChangeAffect(event, subscription.interest));
    if (relevant.length === 0) continue;
    const merged = relevant.reduce<PersistenceChangeEvent>((current, { event }) => mergePersistenceChanges(current, event) ?? event, relevant[0]!.event);
    subscription.listener(merged, relevant.at(-1)!.revision);
  }
}
export function publishBroadBudgetChange(input: { readonly budgetId: string; readonly source: PersistenceChangeSource }): void { publishPersistenceChange({ source: input.source, scope: { budgetId: input.budgetId, domains: [], broad: true } }); }
/**
 * Explicit correctness fallback for committed changes whose legacy mutation
 * representation cannot expose Budget App domain dependencies.
 */
export function publishConservativeBudgetChange(input: { readonly budgetId: string; readonly source: PersistenceChangeSource }): void {
  publishPersistenceChange({ source: input.source, scope: { budgetId: input.budgetId, domains: PERSISTENCE_CHANGE_DOMAINS } });
}
export function subscribePersistenceChanges(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function subscribeToPersistenceInterest(interest: PersistenceChangeInterest, listener: (event: PersistenceChangeEvent, revision: number) => void): () => void {
  const subscription = { interest, listener };
  interestListeners.add(subscription);
  return () => { interestListeners.delete(subscription); };
}
export function usePersistenceChange(interest: PersistenceChangeInterest): number {
  const domainKey = interest.domains?.join("|");
  const stable = useMemo(() => ({ ...interest, domains: interest.domains ? [...interest.domains].sort() : undefined }), [interest.accountId, interest.budgetId, interest.categoryId, interest.month, interest.transactionId, domainKey]);
  return useSyncExternalStore(
    (notify) => subscribeToPersistenceInterest(stable, notify),
    () => getPersistenceRevisionForInterest(stable),
    () => getPersistenceRevisionForInterest(stable),
  );
}
