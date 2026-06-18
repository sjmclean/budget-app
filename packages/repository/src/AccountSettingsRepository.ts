import { AccountSettings } from "../../types/src/AccountSettings.js";

export interface AccountSettingsRepository {
  create(item: AccountSettings): Promise<void>;
  update?(item: AccountSettings): Promise<void>;
  findByAccountId(accountId: string): Promise<AccountSettings[]>;
}
