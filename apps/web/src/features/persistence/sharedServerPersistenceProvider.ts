import { createAccountService, readAccounts } from "../accounts/accountService";
import { createAccountRegisterService } from "../accounts/accountRegisterService";
import { createPayeeService, findPayeeIdByName } from "../accounts/payeeService";
import { createScheduledTransactionService } from "../accounts/scheduledTransactionService";
import { createBudgetScopedStorage } from "../budget/budgetDataScope";
import { createBudgetViewService } from "../budget/budgetViewService";
import { createBrowserLocalStorageBudgetActivityPersistence } from "./browserLocalStorageBudgetActivityPersistence";
import type { BudgetPersistenceProvider } from "./budgetPersistenceProvider";
import {
  createSharedServerKeyValueStorage,
  type SharedServerKeyValueStorage,
  type SharedServerKeyValueStorageOptions,
} from "./sharedServerKeyValueStorage";

export interface SharedServerPersistenceProviderOptions
  extends SharedServerKeyValueStorageOptions {
  storage?: SharedServerKeyValueStorage;
}

/**
 * Composes the existing domain persistence services over the shared-server
 * key-value mirror. Feature code therefore uses the same ports regardless of
 * whether the active provider is browser-local or hosted by the shared server.
 */
export function createSharedServerPersistenceProvider(
  options: SharedServerPersistenceProviderOptions = {},
): BudgetPersistenceProvider {
  const storage =
    options.storage ?? createSharedServerKeyValueStorage(options);
  const budgetScopedStorage = createBudgetScopedStorage(storage);

  const accountService = createAccountService({
    storage: budgetScopedStorage,
  });

  const payeeService = createPayeeService({
    storage: budgetScopedStorage,
  });

  const accountRegisterService = createAccountRegisterService({
    storage: budgetScopedStorage,
    recordPayee: async (payeeName: string) => {
      await payeeService.recordPayee(payeeName);
    },
    recordPayees: async (payeeNames: string[]) => {
      await payeeService.recordPayees(payeeNames);
    },
    findPayeeIdByName: (payeeName: string) =>
      findPayeeIdByName(budgetScopedStorage, payeeName),
    readAccounts: () => readAccounts(budgetScopedStorage),
    getAccountById: (accountId: string) =>
      accountService.getAccountById(accountId) ?? undefined,
  });

  const scheduledTransactionService = createScheduledTransactionService({
    storage: budgetScopedStorage,
    recordPayee: async (payeeName: string) => {
      await payeeService.recordPayee(payeeName);
    },
    findPayeeIdByName: (payeeName: string) =>
      findPayeeIdByName(budgetScopedStorage, payeeName),
  });

  const budgetViewService = createBudgetViewService({
    budgetActivity:
      createBrowserLocalStorageBudgetActivityPersistence(budgetScopedStorage),
    storage,
  });

  return {
    metadata: {
      kind: "shared-server",
      label: "Shared budget server",
      description:
        "The budget is stored by this Budget App installation and shared across connected devices.",
      isProductionPersistence: true,
    },
    capabilities: {
      sharedAcrossDevices: true,
      liveUpdates: true,
      offlineWrites: false,
      backups: true,
    },
    accounts: accountService,
    accountRegisters: accountRegisterService,
    budgetView: budgetViewService,
    categories: budgetViewService,
    payees: payeeService,
    scheduledTransactions: scheduledTransactionService,
    initialize: () => storage.initialize(),
    flush: () => storage.flush(),
    watch: (listener) => storage.watch(listener),
  };
}
