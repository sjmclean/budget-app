import { Account } from "../../types/src/Account.js";
import { AccountSettings } from "../../types/src/AccountSettings.js";
import { AccountRepository } from "../../repository/src/AccountRepository.js";
import { AccountSettingsRepository } from "../../repository/src/AccountSettingsRepository.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";

export class AccountManagementApplicationService {
  constructor(
    private accountRepo: AccountRepository,
    private accountSettingsRepo: AccountSettingsRepository,
    private transactionRepo: TransactionRepository,
  ) {}

  private async requireAccount(accountId: string): Promise<Account> {
    const account = await this.accountRepo.getById(accountId);
    if (!account) throw new Error(`Account not found: ${accountId}`);
    return account;
  }

  private async getOrFailSettings(accountId: string): Promise<AccountSettings> {
    const settings = await this.accountSettingsRepo.findByAccountId(accountId);
    if (!settings[0])
      throw new Error(`Account settings not found: ${accountId}`);
    return settings[0];
  }

  async renameAccount(accountId: string, name: string): Promise<Account> {
    const clean = name.trim();
    if (!clean) throw new Error("Account name cannot be empty");
    const account = await this.requireAccount(accountId);
    const updated = { ...account, name: clean };
    await this.accountRepo.update(updated);
    return updated;
  }

  async setHidden(
    accountId: string,
    hidden: boolean,
  ): Promise<AccountSettings> {
    await this.requireAccount(accountId);
    const settings = await this.getOrFailSettings(accountId);
    const updated = { ...settings, hidden, updatedAt: new Date() };
    await this.accountSettingsRepo.update?.(updated);
    return updated;
  }

  async closeAccount(accountId: string): Promise<AccountSettings> {
    await this.requireAccount(accountId);
    const settings = await this.getOrFailSettings(accountId);
    const updated = { ...settings, closed: true, updatedAt: new Date() };
    await this.accountSettingsRepo.update?.(updated);
    return updated;
  }

  async reopenAccount(accountId: string): Promise<AccountSettings> {
    await this.requireAccount(accountId);
    const settings = await this.getOrFailSettings(accountId);
    const updated = { ...settings, closed: false, updatedAt: new Date() };
    await this.accountSettingsRepo.update?.(updated);
    return updated;
  }

  async assertCanDelete(accountId: string): Promise<void> {
    const transactions = await this.transactionRepo.findByAccount(accountId);
    if (transactions.length > 0)
      throw new Error("Account cannot be deleted while transactions exist");
  }
}
