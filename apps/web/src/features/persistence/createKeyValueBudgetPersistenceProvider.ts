import { createAccountService, readAccounts } from "../accounts/accountService";
import { createAccountRegisterService } from "../accounts/accountRegisterService";
import { createPayeeService, findPayeeIdByName } from "../accounts/payeeService";
import { createScheduledTransactionService } from "../accounts/scheduledTransactionService";
import { createBudgetScopedStorage } from "../budget/budgetDataScope";
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
import type { AccountRegisterQueryClient } from "./accountRegisterQueryContracts";
import { createRoutedScheduledTransactionPersistence } from "./routedScheduledTransactionPersistence";
import { createSqliteBudgetViewService } from "./createSqliteBudgetViewService";

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
  readonly accountRegisterQueries?: AccountRegisterQueryClient;
}

/**
 * Composes the browser persistence runtime. Budget and category reads/writes
 * are deliberately SQLite-only; key/value storage remains for the other
 * domains while their local-first migrations are completed.
 */
export function createKeyValueBudgetPersistenceProvider(
  options: CreateKeyValueBudgetPersistenceProviderOptions,
): BudgetPersistenceProvider {
  const budgetScopedStorage = createBudgetScopedStorage(options.storage);
  const accountService = createAccountService({ storage: budgetScopedStorage });
  const payeeService = createPayeeService({ storage: budgetScopedStorage });
  const accountRegisterService = createAccountRegisterService({
    storage: budgetScopedStorage,
    recordPayee: async (payeeName) => {
      await payeeService.recordPayee(payeeName);
    },
    recordPayees: async (payeeNames) => {
      await payeeService.recordPayees(payeeNames);
    },
    findPayeeIdByName: (payeeName) => findPayeeIdByName(budgetScopedStorage, payeeName),
    readAccounts: () => readAccounts(budgetScopedStorage),
    getAccountById: (accountId) => accountService.getAccountById(accountId) ?? undefined,
  });
  const scheduledFallback = createScheduledTransactionService({
    storage: budgetScopedStorage,
    recordPayee: async (payeeName) => {
      await payeeService.recordPayee(payeeName);
    },
    findPayeeIdByName: (payeeName) => findPayeeIdByName(budgetScopedStorage, payeeName),
  });
  const scheduledTransactions = options.accountRegisterQueries
    ? createRoutedScheduledTransactionPersistence({
        storage: options.storage,
        queryClient: options.accountRegisterQueries,
        fallback: scheduledFallback,
      })
    : scheduledFallback;
  const sqliteBudgetView = createSqliteBudgetViewService(options.accountRegisterQueries);

  return {
    metadata: options.metadata,
    capabilities: options.capabilities,
    accounts: accountService,
    accountRegisters: accountRegisterService,
    accountRegisterQueries: options.accountRegisterQueries,
    budgetView: sqliteBudgetView,
    categories: sqliteBudgetView,
    payees: payeeService,
    scheduledTransactions,
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
