import { Reconciliation } from "../../types/src/Reconciliation.js";
import { ClearedStatus } from "../../types/src/ClearedStatus.js";
import { Transaction } from "../../types/src/Transaction.js";
import { NotFoundError } from "../../types/src/AppError.js";
import { createReconciliation } from "../../budget-engine/src/services/createReconciliation.js";
import { createTransaction } from "../../budget-engine/src/services/createTransaction.js";
import { AccountRepository } from "../../repository/src/AccountRepository.js";
import { ReconciliationRepository } from "../../repository/src/ReconciliationRepository.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";

export interface CompleteReconciliationResult {
  reconciliation: Reconciliation;
  adjustmentTransaction: Transaction | null;
}

export class ReconciliationApplicationService {
  constructor(
    private accountRepo: AccountRepository,
    private reconciliationRepo: ReconciliationRepository,
    private transactionRepo: TransactionRepository,
  ) {}

  async complete(input: {
    budgetId: string;
    accountId: string;
    statementDate: string;
    statementBalance: number;
    createAdjustment?: boolean;
  }): Promise<CompleteReconciliationResult> {
    const account = await this.accountRepo.getById(input.accountId);
    if (!account)
      throw new NotFoundError(`Account not found: ${input.accountId}`);

    const transactions = await this.transactionRepo.findByAccount(
      input.accountId,
    );
    const clearedTransactions = transactions.filter(
      (item) =>
        item.clearedStatus === ClearedStatus.Cleared ||
        item.clearedStatus === ClearedStatus.Reconciled,
    );
    const reconciliation = createReconciliation(
      input.budgetId,
      account,
      clearedTransactions,
      input.statementDate,
      input.statementBalance,
    );

    await this.reconciliationRepo.create(reconciliation);

    let adjustmentTransaction: Transaction | null = null;
    if (reconciliation.difference !== 0 && input.createAdjustment) {
      adjustmentTransaction = createTransaction({
        budgetId: input.budgetId,
        accountId: input.accountId,
        categoryId: null,
        date: input.statementDate,
        amount: reconciliation.difference,
        memo: "Reconciliation adjustment",
        clearedStatus: ClearedStatus.Reconciled,
      });
      await this.transactionRepo.create(adjustmentTransaction);
    }

    return { reconciliation, adjustmentTransaction };
  }
}
