import {
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  ExternalLink,
  Landmark,
  Pencil,
  Plus,
  Search,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AddAccountModal } from "../components/accounts/AddAccountModal";
import { Card } from "../components/ui/Card";
import type { SidebarAccount, SidebarAccountType } from "../features/accounts/accountService";
import {
  type AccountSummaryView,
  type AccountTypeSummary,
  useAccountsWorkspace,
} from "../features/accounts/useAccountsWorkspace";
import { resolveActiveBudget } from "../features/budget/activeBudget";
import type { CreditCardBehaviour } from "../features/budget/budgetPreferences";
import { alertDialog, confirmDialog } from "../features/ui/appDialogService";
import { formatCurrency } from "./reports/services/reportFormatting";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";
import "../styles/accounts.css";

type AccountFilter = "open" | "closed" | "all";

const TYPE_META: Record<SidebarAccountType, {
  label: string;
  icon: typeof Landmark;
}> = {
  "on-budget": { label: "On budget", icon: Landmark },
  "credit-card": { label: "Credit card", icon: CreditCard },
  tracking: { label: "Tracking", icon: CircleDollarSign },
};

export function AccountsPage() {
  const navigate = useNavigate();
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const updateBudget = useBudgetRegistryStore((state) => state.updateBudget);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const activeBudget = resolveActiveBudget(budgets, selectedBudgetId);
  const currencyCode = activeBudget?.currency ?? "AUD";
  const workspace = useAccountsWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AccountFilter>("open");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SidebarAccount | null>(null);
  const [closedExpanded, setClosedExpanded] = useState(false);

  const activeCreditCards = workspace.accounts.filter(
    (account) => account.type === "credit-card" && !account.closedAt,
  );
  const shouldAskCreditCardBehaviour =
    activeCreditCards.length === 0 && activeBudget?.preferences?.creditCardBehaviour === undefined;

  const filteredSummaries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return workspace.summaries.filter((summary) => {
      const isClosed = Boolean(summary.account.closedAt);
      const matchesFilter =
        filter === "all" || (filter === "closed" ? isClosed : !isClosed);
      const matchesQuery =
        !normalizedQuery || summary.account.name.toLocaleLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, workspace.summaries]);

  const openSummaries = filteredSummaries.filter((summary) => !summary.account.closedAt);
  const closedSummaries = filteredSummaries.filter((summary) => summary.account.closedAt);
  const selectedSummary = workspace.summaries.find(
    (summary) => summary.account.id === selectedAccountId,
  ) ?? openSummaries[0] ?? closedSummaries[0] ?? null;

  function formatMoney(amount: number) {
    return formatCurrency(amount, currencyCode);
  }

  function chooseCreditCardBehaviour(behaviour: CreditCardBehaviour) {
    if (!activeBudget) {
      return;
    }
    updateBudget(activeBudget.id, {
      preferences: { creditCardBehaviour: behaviour },
    });
  }

  async function closeAccount(account: SidebarAccount) {
    const confirmed = await confirmDialog({
      title: `Close “${account.name}”?`,
      message: "Its transactions will be preserved and you can reopen the account later.",
      confirmLabel: "Close account",
    });
    if (confirmed) {
      await workspace.closeAccount(account.id);
      setSelectedAccountId(null);
    }
  }

  async function deleteAccount(account: SidebarAccount) {
    const confirmed = await confirmDialog({
      title: `Delete “${account.name}”?`,
      message: "Only empty accounts can be deleted permanently. This action cannot be undone.",
      confirmLabel: "Delete account",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    const result = await workspace.deleteAccount(account.id);
    if (!result.deleted) {
      await alertDialog({
        title: "Account not deleted",
        message: result.reason ?? "This account cannot be deleted.",
        tone: "danger",
      });
      return;
    }
    setSelectedAccountId(null);
  }

  if (!activeBudget) {
    return (
      <div className="accounts-workspace">
        <Card className="accounts-state-card">
          <WalletCards size={30} />
          <h1>Accounts</h1>
          <p className="muted">Open or create a budget before managing accounts.</p>
          <button className="button button-primary" type="button" onClick={() => navigate("/budgets")}>Open Budget Manager</button>
        </Card>
      </div>
    );
  }

  return (
    <div className="accounts-workspace">
      <section className="accounts-workspace-header workspace-header">
        <div className="workspace-header-content">
          <div className="workspace-header-main">
            <div className="workspace-header-heading">
              <p className="eyebrow">Account workspace</p>
              <h1>Accounts</h1>
              <p className="muted">Review balances and manage the accounts in {activeBudget.name}.</p>
            </div>
          </div>
          <div className="workspace-header-controls">
            <div className="workspace-header-primary-actions">
              <button className="button button-primary" type="button" onClick={() => setIsAddAccountOpen(true)}>
                <Plus size={17} />
                Add account
              </button>
            </div>
          </div>
        </div>
      </section>

      {workspace.error ? (
        <Card className="accounts-state-card accounts-state-error">
          <h2>Accounts unavailable</h2>
          <p className="muted">{workspace.error}</p>
          <button className="button button-secondary" type="button" onClick={() => void workspace.reload()}>Try again</button>
        </Card>
      ) : null}

      <section className="accounts-summary-grid" aria-label="Account type summaries">
        {workspace.typeSummaries.map((summary) => (
          <AccountSummaryCard key={summary.type} summary={summary} formatMoney={formatMoney} />
        ))}
      </section>

      <section className="accounts-toolbar" aria-label="Account list controls">
        <label className="accounts-search-field">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search accounts…"
            aria-label="Search accounts"
          />
          {query ? (
            <button type="button" aria-label="Clear account search" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          ) : null}
        </label>
        <label className="accounts-filter-field">
          <span className="sr-only">Account visibility</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as AccountFilter)}>
            <option value="open">Open accounts</option>
            <option value="closed">Closed accounts</option>
            <option value="all">All accounts</option>
          </select>
        </label>
      </section>

      {workspace.isLoading ? (
        <Card className="accounts-state-card">
          <h2>Loading accounts…</h2>
          <p className="muted">Preparing balances and account activity.</p>
        </Card>
      ) : workspace.accounts.length === 0 ? (
        <Card className="accounts-state-card accounts-empty-card">
          <WalletCards size={34} />
          <h2>No accounts yet</h2>
          <p className="muted">Add your first account to begin recording income, spending and balances.</p>
          <button className="button button-primary" type="button" onClick={() => setIsAddAccountOpen(true)}>
            <Plus size={17} /> Add account
          </button>
        </Card>
      ) : (
        <div className="accounts-content-grid">
          <Card className="accounts-list-panel">
            <div className="accounts-list-heading accounts-desktop-heading" aria-hidden="true">
              <span>Account</span>
              <span>Cleared</span>
              <span>Uncleared</span>
              <span>Working balance</span>
            </div>

            {openSummaries.length > 0 ? (
              <div className="accounts-list" aria-label="Open accounts">
                {openSummaries.map((summary) => (
                  <AccountRow
                    key={summary.account.id}
                    summary={summary}
                    selected={selectedSummary?.account.id === summary.account.id}
                    formatMoney={formatMoney}
                    onSelect={() => setSelectedAccountId(summary.account.id)}
                    onOpen={() => navigate(`/accounts/${summary.account.id}`)}
                  />
                ))}
              </div>
            ) : filter !== "closed" ? (
              <div className="accounts-inline-empty">No open accounts match this search.</div>
            ) : null}

            {closedSummaries.length > 0 ? (
              <section className="closed-accounts-section">
                <button
                  type="button"
                  className="closed-accounts-toggle"
                  aria-expanded={closedExpanded || filter === "closed"}
                  onClick={() => setClosedExpanded((expanded) => !expanded)}
                >
                  <ChevronDown size={16} />
                  Closed accounts ({closedSummaries.length})
                </button>
                {closedExpanded || filter === "closed" ? (
                  <div className="accounts-list">
                    {closedSummaries.map((summary) => (
                      <AccountRow
                        key={summary.account.id}
                        summary={summary}
                        selected={selectedSummary?.account.id === summary.account.id}
                        formatMoney={formatMoney}
                        onSelect={() => setSelectedAccountId(summary.account.id)}
                        onOpen={() => navigate(`/accounts/${summary.account.id}`)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </Card>

          <AccountContextPanel
            summary={selectedSummary}
            formatMoney={formatMoney}
            onOpen={() => selectedSummary && navigate(`/accounts/${selectedSummary.account.id}`)}
            onEdit={() => selectedSummary && setEditingAccount(selectedSummary.account)}
            onClose={() => selectedSummary && void closeAccount(selectedSummary.account)}
            onReopen={() => selectedSummary && void workspace.reopenAccount(selectedSummary.account.id)}
            onDelete={() => selectedSummary && void deleteAccount(selectedSummary.account)}
          />
        </div>
      )}

      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onCreate={(input) => void workspace.createAccount(input)}
        shouldAskCreditCardBehaviour={shouldAskCreditCardBehaviour}
        onCreditCardBehaviourSelected={chooseCreditCardBehaviour}
      />
      <AddAccountModal
        isOpen={Boolean(editingAccount)}
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
        onCreate={(input) => void workspace.createAccount(input)}
        onUpdate={(input) => void workspace.updateAccount(input)}
      />
    </div>
  );
}

function AccountSummaryCard({
  summary,
  formatMoney,
}: {
  summary: AccountTypeSummary;
  formatMoney: (amount: number) => string;
}) {
  const Icon = TYPE_META[summary.type].icon;
  return (
    <Card className={`accounts-summary-card account-tone-${summary.type}`}>
      <div className="accounts-summary-icon"><Icon size={22} /></div>
      <div>
        <span>{summary.label}</span>
        <strong>{formatMoney(summary.balance)}</strong>
        <small>{summary.accountCount} open{summary.closedCount ? ` · ${summary.closedCount} closed` : ""}</small>
      </div>
    </Card>
  );
}

function AccountRow({
  summary,
  selected,
  formatMoney,
  onSelect,
  onOpen,
}: {
  summary: AccountSummaryView;
  selected: boolean;
  formatMoney: (amount: number) => string;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const Icon = TYPE_META[summary.account.type].icon;
  return (
    <div
      className={`account-row account-tone-${summary.account.type}${selected ? " is-selected" : ""}${summary.account.closedAt ? " is-closed" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
        if (event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="account-row-primary">
        <div className="account-row-icon"><Icon size={19} /></div>
        <div>
          <strong>{summary.account.name}</strong>
          <span>{TYPE_META[summary.account.type].label}{summary.account.closedAt ? " · Closed" : ""}</span>
          <small>{summary.unclearedTransactionCount > 0 ? `${summary.unclearedTransactionCount} uncleared transactions` : `${summary.transactionCount} transactions`}</small>
        </div>
      </div>
      <div className="account-row-balance account-row-cleared">
        <span>Cleared</span>
        <strong>{formatMoney(summary.register.clearedBalance)}</strong>
      </div>
      <div className="account-row-balance account-row-uncleared">
        <span>Uncleared</span>
        <strong>{formatMoney(summary.register.unclearedBalance)}</strong>
      </div>
      <div className="account-row-balance account-row-working">
        <span>Working</span>
        <strong className={summary.register.workingBalance < 0 ? "amount-negative" : ""}>
          {formatMoney(summary.register.workingBalance)}
        </strong>
      </div>
      <button
        className="account-row-open"
        type="button"
        aria-label={`Open ${summary.account.name} register`}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <ChevronRight size={19} />
      </button>
    </div>
  );
}

function AccountContextPanel({
  summary,
  formatMoney,
  onOpen,
  onEdit,
  onClose,
  onReopen,
  onDelete,
}: {
  summary: AccountSummaryView | null;
  formatMoney: (amount: number) => string;
  onOpen: () => void;
  onEdit: () => void;
  onClose: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  if (!summary) {
    return (
      <Card className="account-context-panel">
        <div className="accounts-context-empty">
          <WalletCards size={28} />
          <h2>Account details</h2>
          <p className="muted">Select an account to review its balances and actions.</p>
        </div>
      </Card>
    );
  }

  const Icon = TYPE_META[summary.account.type].icon;
  return (
    <Card className={`account-context-panel account-tone-${summary.account.type}`}>
      <div className="account-context-header">
        <div className="account-row-icon"><Icon size={20} /></div>
        <div>
          <h2>{summary.account.name}</h2>
          <p>{TYPE_META[summary.account.type].label}{summary.account.closedAt ? " · Closed" : ""}</p>
        </div>
      </div>

      <div className="account-context-hero">
        <span>Working balance</span>
        <strong className={summary.register.workingBalance < 0 ? "amount-negative" : ""}>
          {formatMoney(summary.register.workingBalance)}
        </strong>
      </div>

      <dl className="account-context-breakdown">
        <div><dt>Cleared balance</dt><dd>{formatMoney(summary.register.clearedBalance)}</dd></div>
        <div><dt>Uncleared balance</dt><dd>{formatMoney(summary.register.unclearedBalance)}</dd></div>
        <div><dt>Uncleared transactions</dt><dd>{summary.unclearedTransactionCount}</dd></div>
        <div><dt>Last transaction</dt><dd>{formatAccountDate(summary.lastTransactionDate)}</dd></div>
      </dl>

      <div className="account-context-actions">
        <button className="button button-primary" type="button" onClick={onOpen}>
          <ExternalLink size={16} /> Open register
        </button>
        <button className="button button-secondary" type="button" onClick={onEdit}>
          <Pencil size={16} /> Edit account
        </button>
        {summary.account.closedAt ? (
          <button className="button button-secondary" type="button" onClick={onReopen}>
            <ArchiveRestore size={16} /> Reopen account
          </button>
        ) : (
          <button className="button button-secondary account-close-action" type="button" onClick={onClose}>
            Close account
          </button>
        )}
        <button className="button button-danger account-delete-action" type="button" onClick={onDelete}>
          <Trash2 size={16} /> Delete account
        </button>
      </div>
    </Card>
  );
}

function formatAccountDate(date: string | null): string {
  if (!date) return "No transactions";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}
