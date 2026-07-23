import { createAccountService, readAccounts } from "../accounts/accountService";
import { createAccountRegisterService } from "../accounts/accountRegisterService";
import { createPayeeService, findPayeeIdByName } from "../accounts/payeeService";
import { createScheduledTransactionService } from "../accounts/scheduledTransactionService";
import { createBudgetViewService } from "../budget/budgetViewService";
import { createBrowserLocalStorageBudgetActivityPersistence } from "./browserLocalStorageBudgetActivityPersistence";
import { createBudgetScopedStorage } from "../budget/budgetDataScope";
import {
  browserLocalStorageKeyValueStorage,
  flushBrowserStorageBackend,
  hydrateBrowserStorageBackend,
} from "./keyValueStoragePort";
import type { AppPersistenceGateway } from "./appPersistenceGateway";
import { exportBudgetPersistenceSnapshot } from "./persistenceSnapshot";

const budgetScopedStorage = createBudgetScopedStorage(browserLocalStorageKeyValueStorage);

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
  findPayeeIdByName: (payeeName: string) => findPayeeIdByName(budgetScopedStorage, payeeName),
  readAccounts: () => readAccounts(budgetScopedStorage),
  getAccountById: (accountId: string) => accountService.getAccountById(accountId) ?? undefined,
});

const scheduledTransactionService = createScheduledTransactionService({
  storage: budgetScopedStorage,
  recordPayee: async (payeeName: string) => {
    await payeeService.recordPayee(payeeName);
  },
  findPayeeIdByName: (payeeName: string) => findPayeeIdByName(budgetScopedStorage, payeeName),
});

const budgetViewService = createBudgetViewService({
  budgetActivity: createBrowserLocalStorageBudgetActivityPersistence(budgetScopedStorage),
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
  capabilities: {
    sharedAcrossDevices: false,
    liveUpdates: false,
    offlineWrites: true,
    backups: false,
  },
  accounts: accountService,
  accountRegisters: accountRegisterService,
  budgetView: budgetViewService,
  categories: budgetViewService,
  payees: payeeService,
  scheduledTransactions: scheduledTransactionService,
  keyValueStorage: browserLocalStorageKeyValueStorage,
  initialize: hydrateBrowserStorageBackend,
  flush: flushBrowserStorageBackend,
  exportSnapshot: () => exportBudgetPersistenceSnapshot(browserLocalStorageKeyValueStorage),
};