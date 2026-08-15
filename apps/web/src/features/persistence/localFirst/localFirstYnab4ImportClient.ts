import type {
  SqliteImportSession,
  SqliteImportAccount,
  SqliteImportBudgetMonth,
  SqliteImportCategory,
  SqliteImportPayee,
  SqliteImportScheduledTransaction,
  SqliteImportTransaction,
} from "../sqliteImportContracts";
import { emptyDomainCounts, type BudgetDomainCounts } from "./contracts";
import { LocalBudgetDatabaseClient } from "./localBudgetClient";
import type {
  LocalAccountRecord,
  LocalCategoryRecord,
  LocalPayeeRecord,
  LocalTransactionRecord,
} from "./registerSchema";

export interface LocalFirstYnab4ImportClientOptions {
  readonly database: LocalBudgetDatabaseClient;
  readonly syncEpoch: string;
  readonly deviceId: string;
}

/**
 * Import destination used by the YNAB4 streaming mapper. It intentionally
 * implements the same capability-shaped session as the hosted destination;
 * no YNAB4 source types leak into the local database layer.
 */
export function createLocalFirstYnab4ImportClient(
  options: LocalFirstYnab4ImportClientOptions,
) {
  return {
    async begin(input: {
      readonly budgetId: string;
      readonly budgetName: string;
      readonly currency: string;
      readonly signal?: AbortSignal;
    }): Promise<SqliteImportSession> {
      input.signal?.throwIfAborted();
      await options.database.beginStagedImport({
        budgetId: input.budgetId,
        syncEpoch: options.syncEpoch,
        deviceId: options.deviceId,
      });
      const ids = {
        accounts: new Set<string>(),
        transactions: new Set<string>(),
        payees: new Set<string>(),
        categories: new Set<string>(),
        budgetMonths: new Set<string>(),
        scheduledTransactions: new Set<string>(),
        transactionTags: new Set<string>(),
      };
      const expectedImportedPayees = new Map<
        string,
        { readonly accountId: string; readonly rawPayee: string }
      >();
      const payeeNames = new Map<string, string>();
      const categoryNames = new Map<string, string>();
      let closed = false;

      const assertOpen = () => {
        if (closed) throw new Error("The staged local import session is closed.");
      };
      const counts = (): BudgetDomainCounts => ({
        accounts: ids.accounts.size,
        transactions: ids.transactions.size,
        payees: ids.payees.size,
        categories: ids.categories.size,
        budgetMonths: ids.budgetMonths.size,
        scheduledTransactions: ids.scheduledTransactions.size,
        transactionTags: ids.transactionTags.size,
      });

      return {
        generationId: options.syncEpoch,
        async persistReferenceData(referenceData, requestOptions) {
          assertOpen();
          requestOptions?.signal?.throwIfAborted();
          const accounts = referenceData.accounts.map((row: SqliteImportAccount): LocalAccountRecord => ({
            id: row.id,
            budgetId: input.budgetId,
            name: row.name,
            type: row.type,
            participation: row.participation,
            openingBalance: row.openingBalance,
            currencyCode: input.currency,
            createdAt: new Date().toISOString(),
            closedAt: row.closedAt,
          }));
          const payees = referenceData.payees.map((row: SqliteImportPayee): LocalPayeeRecord => ({
            id: row.id,
            budgetId: input.budgetId,
            name: row.name,
            note: "",
            archived: row.archived === true,
            defaultCategoryId: row.defaultCategoryId,
            defaultCategoryName: row.defaultCategoryName,
            importRules: row.importRules,
          }));
          const categories = referenceData.categories.map((row: SqliteImportCategory): LocalCategoryRecord => ({
            id: row.id,
            budgetId: input.budgetId,
            name: row.name,
            groupId: row.groupId,
            groupName: row.groupName,
            archived: false,
          }));
          for (const row of accounts) ids.accounts.add(row.id);
          for (const row of payees) {
            ids.payees.add(row.id);
            payeeNames.set(row.id, row.name);
          }
          for (const row of categories) {
            ids.categories.add(row.id);
            categoryNames.set(row.id, row.name);
          }
          await options.database.importRegisterBatch({ accounts, payees, categories });
        },
        recordSourceTransactionDescriptions(rows) {
          assertOpen();
          for (const row of rows) {
            const rawPayee = row.rawPayeeName.trim();
            if (!rawPayee) continue;
            const existing = expectedImportedPayees.get(row.transactionId);
            expectedImportedPayees.set(row.transactionId, {
              accountId: existing?.accountId ?? "",
              rawPayee,
            });
          }
        },
        async persistTransactions(rows, requestOptions) {
          assertOpen();
          requestOptions?.signal?.throwIfAborted();
          const transactions: LocalTransactionRecord[] = rows.map((row: SqliteImportTransaction) => ({
            id: row.id,
            budgetId: input.budgetId,
            accountId: row.accountId,
            date: row.date,
            amount: row.amount,
            memo: row.memo,
            checkNumber: row.checkNumber,
            clearedStatus: row.clearedStatus,
            payeeId: row.payeeId,
            payeeName: row.payeeId ? payeeNames.get(row.payeeId) ?? null : null,
            rawPayeeName: row.rawPayeeName,
            categoryId: row.categoryId,
            categoryName: row.categoryName ??
              (row.categoryId ? categoryNames.get(row.categoryId) ?? null : null),
            transferAccountId: row.transferAccountId,
            transferTransactionId: row.transferTransactionId,
            splitLines: row.splitLines.map((split) => ({
              ...split,
              categoryName: split.categoryName ??
                (split.categoryId ? categoryNames.get(split.categoryId) ?? null : null),
            })),
            tagIds: row.tagIds ?? [],
            generatedFromSchedule: false,
            scheduledTransactionId: null,
            scheduledOccurrenceDate: null,
            updatedAt: new Date(row.updatedAt).toISOString(),
          }));
          for (const row of transactions) ids.transactions.add(row.id);
          for (const row of rows) {
            const expectedProvenance = expectedImportedPayees.get(row.id);
            if (expectedProvenance) {
              expectedImportedPayees.set(row.id, {
                ...expectedProvenance,
                accountId: row.accountId,
              });
            }
          }
          await options.database.importRegisterBatch({ transactions });
        },
        async persistScheduledTransactions(rows, requestOptions) {
          assertOpen();
          requestOptions?.signal?.throwIfAborted();
          for (let offset = 0; offset < rows.length; offset += 2_000) {
            const batch = rows.slice(offset, offset + 2_000);
            for (const row of batch) ids.scheduledTransactions.add(row.id);
            await options.database.importEntityBatch(batch.map((row: SqliteImportScheduledTransaction) => ({
              domain: "scheduledTransactions" as const,
              entityId: row.id,
              payload: row,
            })));
          }
        },
        async persistBudgetMonths(rows, requestOptions) {
          assertOpen();
          requestOptions?.signal?.throwIfAborted();
          for (let offset = 0; offset < rows.length; offset += 2_000) {
            const batch = rows.slice(offset, offset + 2_000);
            for (const row of batch) ids.budgetMonths.add(row.month);
            await options.database.importEntityBatch(batch.map((row: SqliteImportBudgetMonth) => ({
              domain: "budgetMonths" as const,
              entityId: row.month,
              payload: row.view,
            })));
          }
        },
        async persistTransactionTags(rows, requestOptions) {
          assertOpen();
          requestOptions?.signal?.throwIfAborted();
          for (let offset = 0; offset < rows.length; offset += 2_000) {
            const batch = rows.slice(offset, offset + 2_000);
            for (const row of batch) ids.transactionTags.add(row.id);
            await options.database.importEntityBatch(batch.map((row) => ({
              domain: "transactionTags" as const,
              entityId: row.id,
              payload: row.payload,
            })));
          }
        },
        async validate(requestOptions) {
          assertOpen();
          requestOptions?.signal?.throwIfAborted();
          const manifest = await options.database.getManifest();
          const expected = counts();
          for (const [domain, count] of Object.entries(expected)) {
            if (manifest.counts[domain as keyof BudgetDomainCounts] !== count) {
              throw new Error(`Staged local import count mismatch for ${domain}.`);
            }
          }
          const actualById = new Map<string, LocalTransactionRecord>();
          const provenanceMismatches: string[] = [];
          const idsByAccount = new Map<string, string[]>();
          for (const [transactionId, provenance] of expectedImportedPayees) {
            if (!provenance.accountId.trim()) {
              provenanceMismatches.push(
                `Imported-payee provenance unresolved expected destination/account assignment for ${transactionId}.`,
              );
              continue;
            }
            const accountIds = idsByAccount.get(provenance.accountId) ?? [];
            accountIds.push(transactionId);
            idsByAccount.set(provenance.accountId, accountIds);
          }
          for (const [accountId, transactionIds] of idsByAccount) {
            for (let offset = 0; offset < transactionIds.length; offset += 250) {
              const rows = await options.database.getTransactionsByIds(
                input.budgetId,
                accountId,
                transactionIds.slice(offset, offset + 250),
              );
              for (const row of rows) actualById.set(row.id, row);
            }
          }

          // Only misses take the diagnostic fallback path. Successful imports
          // remain bounded account-scoped reads without per-row queries.
          const missingIds = [...expectedImportedPayees]
            .filter(([transactionId, provenance]) =>
              provenance.accountId.trim() && !actualById.has(transactionId))
            .map(([transactionId]) => transactionId);
          for (const transactionId of missingIds) {
            const provenance = expectedImportedPayees.get(transactionId)!;
            const diagnostic = await options.database.getTransaction(
              input.budgetId,
              transactionId,
            );
            if (diagnostic) {
              provenanceMismatches.push(
                `Imported-payee provenance destination account mismatch for ${transactionId}: expected account ${provenance.accountId}, found account ${diagnostic.accountId}.`,
              );
            } else {
              provenanceMismatches.push(
                `Imported-payee provenance destination transaction not found for ${transactionId} in expected account ${provenance.accountId}.`,
              );
            }
          }

          let preservedRawPayees = 0;
          for (const [transactionId, provenance] of expectedImportedPayees) {
            if (!provenance.accountId.trim()) continue;
            const actual = actualById.get(transactionId);
            if (!actual) continue;
            if (actual.rawPayeeName === provenance.rawPayee) {
              preservedRawPayees += 1;
            } else if (actual.rawPayeeName === null) {
              provenanceMismatches.push(
                `Imported-payee provenance destination found but rawPayeeName is null for ${transactionId} in account ${actual.accountId}.`,
              );
            } else {
              provenanceMismatches.push(
                `Imported-payee provenance differs for ${transactionId} in account ${actual.accountId}.`,
              );
            }
          }
          return {
            valid: true,
            counts: {
              accounts: expected.accounts,
              transactions: expected.transactions,
              scheduledTransactions: expected.scheduledTransactions,
            },
            importedPayeeProvenance: {
              sourceTransactionsWithImportedPayee: expectedImportedPayees.size,
              preservedRawPayees,
              mismatches: provenanceMismatches,
            },
          };
        },
        async commit(requestOptions) {
          assertOpen();
          requestOptions?.signal?.throwIfAborted();
          await options.database.commitStagedImport(counts());
          closed = true;
          return {
            budgetId: input.budgetId,
            generationId: options.syncEpoch,
            state: "active",
          };
        },
        async cancel() {
          if (closed) return;
          closed = true;
          await options.database.rollbackStagedImport();
        },
      };
    },
  };
}
