import type { RegisterTransactionView } from "../accounts/accountRegisterTypes";

type RecordMap = Record<string, unknown>;

export interface Ynab4ImportedPayeeProvenanceAudit {
  readonly sourceTransactionsWithImportedPayee: number;
  readonly preservedRawPayees: number;
  readonly mismatches: readonly string[];
}

/**
 * Audits source-description fidelity separately from financial totals. YNAB4's
 * importedPayee is retained bank text; entity IDs remain migration identity,
 * not bank external IDs.
 */
export function auditYnab4ImportedPayeeProvenance(
  sourceTransactions: readonly RecordMap[],
  importedTransactions: readonly RegisterTransactionView[],
): Ynab4ImportedPayeeProvenanceAudit {
  const importedById = new Map(importedTransactions.map(row => [row.id, row]));
  const mismatches: string[] = [];
  let sourceTransactionsWithImportedPayee = 0;
  let preservedRawPayees = 0;

  for (const source of sourceTransactions) {
    const id = firstString(source.entityId, source.id);
    const rawPayee = firstString(source.importedPayee);
    if (!id || !rawPayee) continue;
    sourceTransactionsWithImportedPayee += 1;
    const imported = importedById.get(id);
    if (imported?.rawPayee === rawPayee) {
      preservedRawPayees += 1;
    } else {
      mismatches.push(
        `Imported-payee provenance mismatch for ${id}: source=${JSON.stringify(rawPayee)}, imported=${JSON.stringify(imported?.rawPayee ?? null)}.`,
      );
    }
  }

  return {
    sourceTransactionsWithImportedPayee,
    preservedRawPayees,
    mismatches,
  };
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
