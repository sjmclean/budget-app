/**
 * Import rollback service.
 *
 * YNAB4 imports can create thousands of records. The important rule is that imported
 * records must be traceable back to an import run through import_maps so the user can
 * undo a bad import without manually cleaning every account, category, payee, and
 * transaction. This service is still conservative: it removes mapped records and leaves
 * richer repair decisions to future import review tooling.
 */
import { and, eq } from "drizzle-orm";
import { accounts, categories, importMaps, importRuns, payees, splitTransactionLines, transactionFlags, transactionNotes, transactions } from "../../database/src/schema.js";
import { ImportMap } from "../../types/src/ImportMap.js";
import { ImportRun } from "../../types/src/ImportRun.js";

export interface ImportRollbackResult {
  importRunId: string;
  deleted: Record<string, number>;
  status: "rolled_back";
}

const orderedEntityTypes = [
  "splitTransactionLine",
  "split",
  "transactionFlag",
  "flag",
  "transactionNote",
  "note",
  "transaction",
  "account",
  "category",
  "payee"
];

export class ImportRollbackApplicationService {
  constructor(private db: any) {}

  async undoImportRun(importRunId: string): Promise<ImportRollbackResult> {
    const runs: ImportRun[] = await this.db.select().from(importRuns).where(eq(importRuns.id, importRunId));
    const run = runs[0];
    if (!run) throw new Error(`Import run not found: ${importRunId}`);
    if (run.status === "rolled_back") return { importRunId, deleted: {}, status: "rolled_back" };

    const maps: ImportMap[] = await this.db.select().from(importMaps).where(eq(importMaps.importRunId, importRunId));
    const deleted: Record<string, number> = {};

    for (const entityType of orderedEntityTypes) {
      const ids = maps.filter((map) => map.targetEntityType === entityType).map((map) => map.targetEntityId);
      if (ids.length === 0) continue;
      for (const id of ids) {
        const count = await this.deleteTarget(entityType, id, run.budgetId);
        deleted[entityType] = (deleted[entityType] ?? 0) + count;
      }
    }

    await this.db.update(importRuns).set({ ...run, status: "rolled_back", completedAt: new Date(), summaryJson: JSON.stringify({ ...this.safeSummary(run), rolledBackAt: new Date().toISOString(), deleted }) }).where(eq(importRuns.id, importRunId));
    return { importRunId, deleted, status: "rolled_back" };
  }

  private safeSummary(run: ImportRun): Record<string, unknown> {
    try { return JSON.parse(run.summaryJson || "{}"); } catch { return {}; }
  }

  private async deleteTarget(entityType: string, id: string, budgetId: string): Promise<number> {
    switch (entityType) {
      case "split":
      case "splitTransactionLine":
        await this.db.delete(splitTransactionLines).where(eq(splitTransactionLines.id, id));
        return 1;
      case "flag":
      case "transactionFlag":
        await this.db.delete(transactionFlags).where(eq(transactionFlags.id, id));
        return 1;
      case "note":
      case "transactionNote":
        await this.db.delete(transactionNotes).where(eq(transactionNotes.id, id));
        return 1;
      case "transaction":
        await this.db.delete(splitTransactionLines).where(eq(splitTransactionLines.transactionId, id));
        await this.db.delete(transactionFlags).where(eq(transactionFlags.transactionId, id));
        await this.db.delete(transactionNotes).where(eq(transactionNotes.transactionId, id));
        await this.db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.budgetId, budgetId)));
        return 1;
      case "account":
        await this.db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.budgetId, budgetId)));
        return 1;
      case "category":
        await this.db.delete(categories).where(eq(categories.id, id));
        return 1;
      case "payee":
        await this.db.delete(payees).where(and(eq(payees.id, id), eq(payees.budgetId, budgetId)));
        return 1;
      default:
        return 0;
    }
  }
}
