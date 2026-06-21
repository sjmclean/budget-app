import { accountService, readAccounts } from "../accounts/accountService";
import { createAccountRegisterService } from "../accounts/accountRegisterService";
import { findPayeeIdByName, payeeService } from "../accounts/payeeService";
import { createScheduledTransactionService } from "../accounts/scheduledTransactionService";
import { createBudgetViewService } from "../budget/budgetViewService";
import { browserLocalStorageBudgetActivityPersistence } from "./browserLocalStorageBudgetActivityPersistence";
import { browserLocalStorageKeyValueStorage } from "./keyValueStoragePort";
import type { AppPersistenceGateway } from "./appPersistenceGateway";

const accountRegisterService = createAccountRegisterService({
  storage: browserLocalStorageKeyValueStorage,
  recordPayee: async (payeeName: string) => {
    await payeeService.recordPayee(payeeName);
  },
  findPayeeIdByName,
  readAccounts,
  getAccountById: (accountId: string) => accountService.getAccountById(accountId) ?? undefined,
});

const scheduledTransactionService = createScheduledTransactionService({
  storage: browserLocalStorageKeyValueStorage,
  recordPayee: async (payeeName: string) => {
    await payeeService.recordPayee(payeeName);
  },
  findPayeeIdByName,
});

const budgetViewService = createBudgetViewService({
  budgetActivity: browserLocalStorageBudgetActivityPersistence,
  storage: browserLocalStorageKeyValueStorage,
});

export const browserLocalStoragePersistenceGateway: AppPersistenceGateway = {
  metadata: {
    kind: "browser-local-storage",
    label: "Browser localStorage",
    description:
      "The web UI is currently using browser localStorage-backed feature services. This gateway preserves existing behaviour while SQLite-backed adapters are introduced incrementally.",
    isProductionPersistence: false,
  },
  accounts: accountService,
  accountRegisters: accountRegisterService,
  budgetView: budgetViewService,
  categories: budgetViewService,
  payees: payeeService,
  scheduledTransactions: scheduledTransactionService,
};