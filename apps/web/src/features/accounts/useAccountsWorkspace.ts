import { useCallback, useEffect, useMemo, useState } from "react";
import type { AccountRegisterView } from "./accountRegisterTypes";
import type {
  CreateAccountInput,
  SidebarAccount,
  SidebarAccountType,
  UpdateAccountInput,
} from "./accountService";
import { getAppPersistenceGateway } from "../persistence";

export interface AccountSummaryView {
  account: SidebarAccount;
  register: AccountRegisterView;
  transactionCount: number;
  unclearedTransactionCount: number;
  lastTransactionDate: string | null;
}

export interface AccountTypeSummary {
  type: SidebarAccountType;
  label: string;
  accountCount: number;
  closedCount: number;
  balance: number;
}

export const ACCOUNTS_CHANGED_EVENT = "budget-app:accounts-changed";

export function useAccountsWorkspace() {
  const gateway = getAppPersistenceGateway();
  const [accounts, setAccounts] = useState<SidebarAccount[]>([]);
  const [summaries, setSummaries] = useState<AccountSummaryView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextAccounts = await gateway.accounts.listAccounts();
      const registers = await Promise.all(
        nextAccounts.map((account) =>
          gateway.accountRegisters.getAccountRegisterView({ accountId: account.id }),
        ),
      );

      setAccounts(nextAccounts);
      setSummaries(
        nextAccounts.map((account, index) => {
          const register = registers[index];
          const lastTransactionDate = register.transactions.reduce<string | null>((latest, transaction) => {
            if (!latest || transaction.date > latest) {
              return transaction.date;
            }
            return latest;
          }, null);

          return {
            account,
            register,
            transactionCount: register.transactions.length,
            unclearedTransactionCount: register.transactions.filter(
              (transaction) => !transaction.cleared && !transaction.reconciled,
            ).length,
            lastTransactionDate,
          };
        }),
      );
    } catch (loadError) {
      setAccounts([]);
      setSummaries([]);
      setError(loadError instanceof Error ? loadError.message : "Unable to load accounts.");
    } finally {
      setIsLoading(false);
    }
  }, [gateway]);

  useEffect(() => {
    void load();
  }, [load]);

  const notifyAccountsChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent(ACCOUNTS_CHANGED_EVENT));
  }, []);

  const createAccount = useCallback(
    async (input: CreateAccountInput) => {
      await gateway.accounts.createAccount(input);
      notifyAccountsChanged();
      await load();
    },
    [gateway, load, notifyAccountsChanged],
  );

  const updateAccount = useCallback(
    async (input: UpdateAccountInput) => {
      await gateway.accounts.updateAccount(input);
      notifyAccountsChanged();
      await load();
    },
    [gateway, load, notifyAccountsChanged],
  );

  const closeAccount = useCallback(
    async (accountId: string) => {
      await gateway.accounts.closeAccount(accountId);
      notifyAccountsChanged();
      await load();
    },
    [gateway, load, notifyAccountsChanged],
  );

  const reopenAccount = useCallback(
    async (accountId: string) => {
      await gateway.accounts.reopenAccount(accountId);
      notifyAccountsChanged();
      await load();
    },
    [gateway, load, notifyAccountsChanged],
  );

  const deleteAccount = useCallback(
    async (accountId: string) => {
      const result = await gateway.accounts.deleteAccount(accountId);
      if (result.deleted) {
        notifyAccountsChanged();
        await load();
      }
      return result;
    },
    [gateway, load, notifyAccountsChanged],
  );

  const typeSummaries = useMemo<AccountTypeSummary[]>(() => {
    const definitions: Array<{ type: SidebarAccountType; label: string }> = [
      { type: "on-budget", label: "Budget accounts" },
      { type: "credit-card", label: "Credit cards" },
      { type: "tracking", label: "Tracking" },
    ];

    return definitions.map(({ type, label }) => {
      const matching = summaries.filter((summary) => summary.account.type === type);
      const open = matching.filter((summary) => !summary.account.closedAt);
      return {
        type,
        label,
        accountCount: open.length,
        closedCount: matching.length - open.length,
        balance: open.reduce((total, summary) => total + summary.register.workingBalance, 0),
      };
    });
  }, [summaries]);

  return {
    accounts,
    summaries,
    typeSummaries,
    isLoading,
    error,
    reload: load,
    createAccount,
    updateAccount,
    closeAccount,
    reopenAccount,
    deleteAccount,
  };
}
