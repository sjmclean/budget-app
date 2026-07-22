import type { AccountPersistencePort } from "../accounts/accountPersistencePort";
import type { AccountRegisterPersistencePort } from "../accounts/accountRegisterPersistencePort";
import type { PayeePersistencePort } from "../accounts/payeePersistencePort";
import type { ScheduledTransactionPersistencePort } from "../accounts/scheduledTransactionPersistencePort";
import type { CategoryPersistencePort } from "../budget/categoryPersistencePort";
import type { BudgetViewService } from "../budget/budgetViewTypes";

export type PersistenceBackendKind =
  | "browser-local-storage"
  | "sqlite-adapter"
  | "shared-server";

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

export type PersistenceChangeListener = () => void;

/**
 * Runtime persistence contract consumed by the application.
 *
 * Feature code depends on the domain ports exposed here and remains unaware of
 * whether those ports are backed by browser storage, a shared host, or a future
 * cloud provider. Lifecycle hooks are optional so existing synchronous browser
 * composition can remain unchanged while network-backed providers are added.
 */
export interface BudgetPersistenceProvider {
  readonly metadata: PersistenceProviderMetadata;
  readonly capabilities: PersistenceProviderCapabilities;
  readonly accounts: AccountPersistencePort;
  readonly accountRegisters: AccountRegisterPersistencePort;
  readonly budgetView: BudgetViewService;
  readonly categories: CategoryPersistencePort;
  readonly payees: PayeePersistencePort;
  readonly scheduledTransactions: ScheduledTransactionPersistencePort;
  initialize?(): Promise<void>;
  flush?(): Promise<void>;
  watch?(listener: PersistenceChangeListener): () => void;
}
