import type { AccountPersistencePort } from "../accounts/accountPersistencePort";
import type { AccountRegisterPersistencePort } from "../accounts/accountRegisterPersistencePort";
import type { PayeePersistencePort } from "../accounts/payeePersistencePort";
import type { ScheduledTransactionPersistencePort } from "../accounts/scheduledTransactionPersistencePort";
import type { CategoryPersistencePort } from "../budget/categoryPersistencePort";
import type { BudgetViewService } from "../budget/budgetViewTypes";
import type { BudgetPersistenceSnapshot } from "./persistenceSnapshot";
import type { CheckpointPort } from "./checkpoint";
import type { ConflictResolutionPort } from "./conflictResolution";
import type { KeyValueStoragePort } from "./keyValueStoragePort";
import type { OperationJournalPort } from "./operationJournal";
import type { ReplicationLocalStorePort } from "./replication";
import type { AccountRegisterQueryClient } from "./accountRegisterQueryContracts";
import type { CategoryGoalPersistencePort } from "../goals/categoryGoalPersistencePort";

export type PersistenceBackendKind = "local-database";

export interface PersistenceProviderMetadata {
  readonly kind: PersistenceBackendKind;
  readonly label: string;
  readonly description: string;
  readonly isProductionPersistence: boolean;
}

export interface PersistenceProviderCapabilities {
  readonly sharedAcrossDevices: boolean;
  readonly liveUpdates: boolean;
  readonly offlineWrites: boolean;
  readonly backups: boolean;
}


/**
 * Runtime persistence contract consumed by the application.
 *
 * Feature code depends on the domain ports exposed here and remains unaware of
 * whether those ports are backed by the local-first browser database or a
 * host-provided implementation. Lifecycle hooks remain optional for host
 * integrations.
 */
export interface BudgetPersistenceProvider {
  /** Selects exactly one sync protocol. Local-first budgets must never also run key replication. */
  readonly syncArchitecture?: "local-first-relay" | "legacy-key-replication";
  readonly metadata: PersistenceProviderMetadata;
  readonly capabilities: PersistenceProviderCapabilities;
  readonly accounts: AccountPersistencePort;
  readonly accountRegisters: AccountRegisterPersistencePort;
  /** Bounded SQLite read path. Present only when a host transport is configured. */
  readonly accountRegisterQueries?: AccountRegisterQueryClient;
  readonly budgetView: BudgetViewService;
  readonly categories: CategoryPersistencePort;
  readonly categoryGoals: CategoryGoalPersistencePort;
  readonly payees: PayeePersistencePort;
  readonly scheduledTransactions: ScheduledTransactionPersistencePort;
  readonly keyValueStorage?: KeyValueStoragePort;
  readonly operationJournal?: OperationJournalPort;
  readonly checkpoints?: CheckpointPort;
  readonly replicationStore?: ReplicationLocalStorePort;
  readonly conflicts?: ConflictResolutionPort;
  initialize?(): Promise<void>;
  flush?(): Promise<void>;
  exportSnapshot?(): BudgetPersistenceSnapshot | Promise<BudgetPersistenceSnapshot>;
}
