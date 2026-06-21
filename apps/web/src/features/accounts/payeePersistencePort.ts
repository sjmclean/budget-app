import type { PayeeView, RenamePayeeInput } from "./payeeService";

/**
 * Browser-safe payee persistence boundary for the web UI.
 *
 * UI code should depend on this port via AppPersistenceGateway instead of
 * importing the concrete browser localStorage payee service directly. This lets
 * the current localStorage implementation stay in place while a future
 * SQLite/Tauri adapter implements the same contract.
 */
export interface PayeePersistencePort {
  listPayees(): Promise<PayeeView[]>;
  recordPayee(name: string): Promise<PayeeView[]>;
  recordPayees(names: string[]): Promise<PayeeView[]>;
  renamePayee(input: RenamePayeeInput): Promise<PayeeView[]>;
  deletePayee(payeeId: string): Promise<PayeeView[]>;
}
