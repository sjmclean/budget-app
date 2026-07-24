import { createAccountService, readAccounts } from "../accounts/accountService";
import { createAccountRegisterService } from "../accounts/accountRegisterService";
import { createPayeeService, findPayeeIdByName } from "../accounts/payeeService";
import { createScheduledTransactionService } from "../accounts/scheduledTransactionService";
import { createBudgetScopedStorage } from "../budget/budgetDataScope";
import { createBudgetViewService } from "../budget/budgetViewService";
import { createBrowserLocalStorageBudgetActivityPersistence } from "./browserLocalStorageBudgetActivityPersistence";
import type {
  BudgetPersistenceProvider,
  PersistenceProviderCapabilities,
  PersistenceProviderMetadata,
} from "./budgetPersistenceProvider";
import type { CheckpointPort } from "./checkpoint";
import type { ConflictResolutionPort } from "./conflictResolution";
import type { KeyValueStoragePort } from "./keyValueStoragePort";
import type { OperationJournalPort } from "./operationJournal";
import type { ReplicationLocalStorePort } from "./replication";
import { exportBudgetPersistenceSnapshot } from "./persistenceSnapshot";

export interface CreateKeyValueBudgetPersistenceProviderOptions {
  readonly storage: KeyValueStoragePort;
  readonly metadata: PersistenceProviderMetadata;
  readonly capabilities: PersistenceProviderCapabilities;
  readonly initialize?: () => Promise<void>;
  readonly flush?: () => Promise<void>;
  readonly operationJournal?: OperationJournalPort;
  readonly checkpoints?: CheckpointPort;
  readonly replicationStore?: ReplicationLocalStorePort;
  readonly conflicts?: ConflictResolutionPort;
}

/**
 * Canonical composition root for the current key/value-shaped Budget App
 * domain services. Concrete storage providers supply only storage and lifecycle
 * behaviour; feature wiring remains identical across browser and local database
 * modes.
 */
export function createKeyValueBudgetPersistenceProvider(
  options: CreateKeyValueBudgetPersistenceProviderOptions,
): BudgetPersistenceProvider {
  const budgetScopedStorage = createBudgetScopedStorage(options.storage);

  const accountService = createAccountService({ storage: budgetScopedStorage });
  const payeeService = createPayeeService({ storage: budgetScopedStorage });

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
    budgetActivity: createBrowserLocalStorageBudgetActivityPersistence(
      budgetScopedStorage,
    ),
    storage: options.storage,
  });

  return {
    metadata: options.metadata,
    capabilities: options.capabilities,
    accounts: accountService,
    accountRegisters: accountRegisterService,
    budgetView: budgetViewService,
    categories: budgetViewService,
    payees: payeeService,
    scheduledTransactions: scheduledTransactionService,
    keyValueStorage: options.storage,
    operationJournal: options.operationJournal,
    checkpoints: options.checkpoints,
    replicationStore: options.replicationStore,
    conflicts: options.conflicts,
    initialize: options.initialize,
    flush: options.flush ?? options.storage.flush,
    exportSnapshot: () => exportBudgetPersistenceSnapshot(options.storage),
  };
}
