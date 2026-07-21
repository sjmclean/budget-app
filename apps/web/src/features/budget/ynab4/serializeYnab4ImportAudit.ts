import type { Ynab4LauncherImportPlan } from "../ynab4LauncherImport";
import type { Ynab4LauncherImportAccuracyAuditResult } from "../ynab4LauncherImportAccuracyAudit";

export interface Ynab4ImportAuditSnapshot {
  schemaVersion: 1;
  audit: Ynab4LauncherImportAccuracyAuditResult;
  planDetails?: {
    warnings: string[];
    scheduledTransactions: Array<Record<string, unknown>>;
    transferLegs: Array<Record<string, unknown>>;
  };
}

/**
 * Serialise the existing YNAB4 accuracy audit without re-calculating financial
 * values. Optional plan details include only schedule definitions and transfer
 * identities that are not exposed by the audit result itself.
 */
export function buildYnab4ImportAuditSnapshot(
  audit: Ynab4LauncherImportAccuracyAuditResult,
  plan?: Ynab4LauncherImportPlan,
): Ynab4ImportAuditSnapshot {
  return canonicalise({
    schemaVersion: 1,
    audit,
    ...(plan
      ? {
          planDetails: {
            warnings: [...plan.warnings].sort(),
            scheduledTransactions: plan.scheduledTransactions.map((schedule) => ({
              id: schedule.id,
              accountId: schedule.accountId,
              nextDueDate: schedule.nextDueDate,
              frequency: schedule.frequency,
              recurrenceInterval: schedule.recurrenceInterval,
              recurrenceUnit: schedule.recurrenceUnit,
              recurrenceAnchorDate: schedule.recurrenceAnchorDate,
              endCondition: schedule.endCondition,
              endDate: schedule.endDate,
              occurrenceCount: schedule.occurrenceCount,
              occurrencesCompleted: schedule.occurrencesCompleted,
              weekendPolicy: schedule.weekendPolicy,
              payee: schedule.payee,
              payeeId: schedule.payeeId,
              category: schedule.category,
              categoryId: schedule.categoryId,
              memo: schedule.memo,
              outflow: schedule.outflow,
              inflow: schedule.inflow,
              splitLines: schedule.splitLines,
            })),
            transferLegs: collectTransferLegs(plan),
          },
        }
      : {}),
  }) as Ynab4ImportAuditSnapshot;
}

export function serializeYnab4ImportAuditSnapshot(
  audit: Ynab4LauncherImportAccuracyAuditResult,
  plan?: Ynab4LauncherImportPlan,
): string {
  return `${JSON.stringify(buildYnab4ImportAuditSnapshot(audit, plan), null, 2)}\n`;
}

function collectTransferLegs(plan: Ynab4LauncherImportPlan): Array<Record<string, unknown>> {
  const legs: Array<Record<string, unknown>> = [];
  for (const register of Object.values(plan.registers)) {
    for (const transaction of register.transactions) {
      if (transaction.transferId || transaction.transferTransactionId) {
        legs.push({
          source: "transaction",
          id: transaction.id,
          accountId: register.accountId,
          date: transaction.date,
          amount: transaction.inflow - transaction.outflow,
          transferId: transaction.transferId,
          transferAccountId: transaction.transferAccountId,
          transferTransactionId: transaction.transferTransactionId,
        });
      }
      for (const split of transaction.splitLines ?? []) {
        if (!split.transferId && !split.transferTransactionId) continue;
        legs.push({
          source: "split",
          id: split.id,
          parentTransactionId: transaction.id,
          accountId: register.accountId,
          date: transaction.date,
          amount: split.inflow - split.outflow,
          transferId: split.transferId,
          transferAccountId: split.transferAccountId,
          transferTransactionId: split.transferTransactionId,
        });
      }
    }
  }
  return legs;
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalise)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalise(entry)]),
    );
  }
  return value;
}
