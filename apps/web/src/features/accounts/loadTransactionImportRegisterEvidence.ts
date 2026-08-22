import type {
  AccountTransactionCursor,
  AccountTransactionPage,
  AccountTransactionRow,
} from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";
import type { TransactionImportEvidenceDateRange } from "./transactionImportEvidence";

export async function loadTransactionImportRegisterEvidence(input: {
  readonly budgetId: string;
  readonly accountId: string;
  readonly dateRange: TransactionImportEvidenceDateRange;
  readonly queryPage: (input: {
    readonly budgetId: string;
    readonly accountId: string;
    readonly limit: number;
    readonly dateRange: TransactionImportEvidenceDateRange;
    readonly before?: AccountTransactionCursor;
  }) => Promise<AccountTransactionPage>;
}): Promise<readonly AccountTransactionRow[]> {
  const rows: AccountTransactionRow[] = [];
  let before: AccountTransactionCursor | undefined;

  while (true) {
    const page = await input.queryPage({
      budgetId: input.budgetId,
      accountId: input.accountId,
      limit: 250,
      dateRange: input.dateRange,
      ...(before ? { before } : {}),
    });

    rows.push(...page.rows);

    if (!page.hasMore) {
      return rows;
    }

    if (!page.nextCursor) {
      throw new Error(
        "Import evidence pagination reported more transactions without a continuation cursor.",
      );
    }

    if (
      before &&
      before.date === page.nextCursor.date &&
      before.id === page.nextCursor.id
    ) {
      throw new Error("Import evidence pagination did not advance.");
    }

    before = page.nextCursor;
  }
}
