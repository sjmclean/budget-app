import type { NewRegisterTransactionInput } from "./accountRegisterTypes";
import type {
  ScheduledEndCondition,
  ScheduledFrequency,
  ScheduledRecurrenceUnit,
  ScheduledTransactionView,
  ScheduledWeekendPolicy,
  UpsertScheduledTransactionInput,
} from "./scheduledTransactionService";

export type {
  ScheduledEndCondition,
  ScheduledFrequency,
  ScheduledRecurrenceUnit,
  ScheduledTransactionView,
  ScheduledWeekendPolicy,
  UpsertScheduledTransactionInput,
} from "./scheduledTransactionService";

/**
 * Browser-safe scheduled transaction persistence boundary for the web UI.
 *
 * UI code should depend on this port via AppPersistenceGateway instead of
 * importing the concrete browser localStorage scheduled transaction service
 * directly. This keeps current behaviour in place while a future SQLite/Tauri
 * adapter implements the same contract.
 */
export interface ScheduledTransactionPersistencePort {
  listByAccount(accountId: string): Promise<ScheduledTransactionView[]>;
  dueCountByAccount(accountId: string): Promise<number>;
  create(input: UpsertScheduledTransactionInput): Promise<ScheduledTransactionView[]>;
  update(input: UpsertScheduledTransactionInput & { id: string }): Promise<ScheduledTransactionView[]>;
  delete(accountId: string, scheduledTransactionId: string): Promise<ScheduledTransactionView[]>;
  advanceAfterEnter(accountId: string, scheduledTransactionId: string): Promise<ScheduledTransactionView[]>;
  toRegisterInput(transaction: ScheduledTransactionView): NewRegisterTransactionInput;
  renamePayeeReferences(input: {
    payeeId: string;
    previousName: string;
    nextName: string;
  }): Promise<void>;

  reassignPayeeReferences(input: {
    sourcePayeeId: string;
    sourceName: string;
    targetPayeeId: string;
    targetName: string;
  }): Promise<void>;
}
