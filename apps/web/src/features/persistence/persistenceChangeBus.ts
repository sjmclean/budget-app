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
let pending: PersistenceChangeEvent[] = [];
let flushScheduled = false;
const uniqueSorted = (values: readonly string[] | undefined) => values?.length ? [...new Set(values)].sort() : undefined;

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
const union = (a?: readonly string[], b?: readonly string[]) => uniqueSorted([...(a ?? []), ...(b ?? [])]);
export function mergePersistenceChanges(left: PersistenceChangeEvent, right: PersistenceChangeEvent): PersistenceChangeEvent | null {
  if (left.source !== right.source || left.scope.budgetId !== right.scope.budgetId) return null;
  return normalisePersistenceChange({ source: left.source, occurredAt: left.occurredAt < right.occurredAt ? right.occurredAt : left.occurredAt, scope: { budgetId: left.scope.budgetId, domains: union(left.scope.domains, right.scope.domains) as PersistenceChangeDomain[], accountIds: union(left.scope.accountIds, right.scope.accountIds), transactionIds: union(left.scope.transactionIds, right.scope.transactionIds), categoryIds: union(left.scope.categoryIds, right.scope.categoryIds), months: union(left.scope.months, right.scope.months), broad: left.scope.broad || right.scope.broad } });
}

export function publishPersistenceChange(
  input: Omit<PersistenceChangeEvent, "occurredAt"> & { readonly occurredAt?: string },
): void {
  const event = normalisePersistenceChange(input);
  const index = pending.findIndex((candidate) => candidate.source === event.source && candidate.scope.budgetId === event.scope.budgetId);
  if (index < 0) pending.push(event); else pending[index] = mergePersistenceChanges(pending[index]!, event)!;
  if (!flushScheduled) { flushScheduled = true; queueMicrotask(flushPersistenceChanges); }
}

export function flushPersistenceChanges(): void { flushScheduled = false; const events = pending; pending = []; for (const event of events) for (const listener of listeners) listener(event); }
export function publishBroadBudgetChange(input: { readonly budgetId: string; readonly source: PersistenceChangeSource }): void { publishPersistenceChange({ source: input.source, scope: { budgetId: input.budgetId, domains: [], broad: true } }); }
/**
 * Explicit correctness fallback for committed changes whose legacy mutation
 * representation cannot expose Budget App domain dependencies.
 */
export function publishConservativeBudgetChange(input: { readonly budgetId: string; readonly source: PersistenceChangeSource }): void {
  publishPersistenceChange({ source: input.source, scope: { budgetId: input.budgetId, domains: PERSISTENCE_CHANGE_DOMAINS } });
}
export function subscribePersistenceChanges(listener: Listener): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function subscribeToPersistenceInterest(interest: PersistenceChangeInterest, listener: Listener): () => void { return subscribePersistenceChanges((event) => { if (doesPersistenceChangeAffect(event, interest)) listener(event); }); }
export function usePersistenceChange(interest: PersistenceChangeInterest): number {
  const domainKey = interest.domains?.join("|");
  const stable = useMemo(() => ({ ...interest, domains: interest.domains ? [...interest.domains].sort() : undefined }), [interest.accountId, interest.budgetId, interest.categoryId, interest.month, interest.transactionId, domainKey]);
  const state = useMemo(() => ({ revision: 0 }), [stable]);
  return useSyncExternalStore((notify) => subscribeToPersistenceInterest(stable, () => { state.revision += 1; notify(); }), () => state.revision, () => state.revision);
}
