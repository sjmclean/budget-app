import type {
  CreateAccountInput,
  DeleteAccountResult,
  SidebarAccount,
  UpdateAccountInput,
} from "./accountService";

/**
 * UI-facing account persistence port.
 *
 * The React app should depend on this interface rather than importing the
 * concrete browser localStorage account service directly. SQLite/Tauri account
 * persistence can then be introduced behind this port without changing account
 * screens again.
 */
export interface AccountPersistencePort {
  listAccounts(): Promise<SidebarAccount[]>;
  createAccount(input: CreateAccountInput): Promise<SidebarAccount[]>;
  updateAccount(input: UpdateAccountInput): Promise<SidebarAccount[]>;
  closeAccount(accountId: string): Promise<SidebarAccount[]>;
  reopenAccount(accountId: string): Promise<SidebarAccount[]>;
  deleteAccount(accountId: string): Promise<DeleteAccountResult>;
  getAccountById(accountId: string): SidebarAccount | null;
}
