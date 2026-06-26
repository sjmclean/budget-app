import type { RegisterTransactionView } from "./accountRegisterTypes";
import type { PayeeView } from "./payeeService";

export interface PayeeRegisterSummary {
  payee: PayeeView;
  registerTransactionCount: number;
  lastUsed: string;
}

function normalisePayeeKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

interface PayeeUsage {
  count: number;
  lastUsed?: string;
}

function recordUsage(usages: Map<string, PayeeUsage>, key: string | undefined, date: string): void {
  if (!key) {
    return;
  }

  const current = usages.get(key);

  if (!current) {
    usages.set(key, { count: 1, lastUsed: date });
    return;
  }

  current.count += 1;
  if (!current.lastUsed || date > current.lastUsed) {
    current.lastUsed = date;
  }
}

export function buildPayeeRegisterSummaries(
  payees: readonly PayeeView[],
  transactions: readonly RegisterTransactionView[],
): PayeeRegisterSummary[] {
  const usageByPayeeId = new Map<string, PayeeUsage>();
  const usageByPayeeName = new Map<string, PayeeUsage>();

  for (const transaction of transactions) {
    if (transaction.payeeId) {
      recordUsage(usageByPayeeId, transaction.payeeId, transaction.date);
    } else {
      recordUsage(usageByPayeeName, normalisePayeeKey(transaction.payee), transaction.date);
    }
  }

  return payees.map((payee) => {
    const usage = usageByPayeeId.get(payee.id) ?? usageByPayeeName.get(normalisePayeeKey(payee.name));

    return {
      payee,
      registerTransactionCount: usage?.count ?? 0,
      lastUsed: usage?.lastUsed ?? payee.lastUsedAt,
    };
  });
}
