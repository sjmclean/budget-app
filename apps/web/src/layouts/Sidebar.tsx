import {
  Archive,
  BarChart3,
  ChevronDown,
  CreditCard,
  FolderOpen,
  Gauge,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  RotateCcw,
  Settings,
  Users,
  Trash2,
  WalletCards,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { AddAccountModal } from "../components/accounts/AddAccountModal";
import type {
  CreateAccountInput,
  SidebarAccount,
  UpdateAccountInput,
} from "../features/accounts/accountService";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import type { CreditCardBehaviour } from "../features/budget/budgetPreferences";
import { getAppPersistenceGateway } from "../features/persistence";
import { alertDialog, confirmDialog } from "../features/ui/appDialogService";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";

export function Sidebar() {
  const navigate = useNavigate();
  const accountsPersistence = getAppPersistenceGateway().accounts;
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const updateBudget = useBudgetRegistryStore((state) => state.updateBudget);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);
  const [accountsOpen, setAccountsOpen] = useState(true);
  const [closedAccountsOpen, setClosedAccountsOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SidebarAccount | null>(null);
  const [openMenuAccountId, setOpenMenuAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<SidebarAccount[]>([]);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    accountsPersistence.listAccounts().then((loadedAccounts) => {
      if (active) {
        setAccounts(loadedAccounts);
      }
    });

    return () => {
      active = false;
    };
  }, [accountsPersistence]);

  const activeAccounts = accounts.filter((account) => !account.closedAt);
  const closedAccounts = accounts.filter((account) => account.closedAt);
  const budgetAccounts = activeAccounts.filter((account) => account.type === "on-budget");
  const creditCards = activeAccounts.filter((account) => account.type === "credit-card");
  const trackingAccounts = activeAccounts.filter((account) => account.type === "tracking");

  function chooseCreditCardBehaviour(behaviour: CreditCardBehaviour) {
    if (!activeBudgetId) {
      return;
    }

    updateBudget(activeBudgetId, {
      preferences: {
        creditCardBehaviour: behaviour,
      },
    });
  }

  async function addAccount(input: CreateAccountInput) {
    const nextAccounts = await accountsPersistence.createAccount(input);
    setAccounts(nextAccounts);
  }

  async function updateAccount(input: UpdateAccountInput) {
    const nextAccounts = await accountsPersistence.updateAccount(input);
    setAccounts(nextAccounts);
    setEditingAccount(null);
    setOpenMenuAccountId(null);
  }

  async function closeAccount(account: SidebarAccount) {
    const shouldClose = await confirmDialog({
      title: `Close "${account.name}"?`,
      message:
        "Closed accounts are hidden from the main account list, but their transactions are preserved and the account can be reopened later.",
      confirmLabel: "Close account",
    });

    if (!shouldClose) {
      return;
    }

    const nextAccounts = await accountsPersistence.closeAccount(account.id);
    setAccounts(nextAccounts);
    setOpenMenuAccountId(null);
  }

  async function reopenAccount(account: SidebarAccount) {
    const nextAccounts = await accountsPersistence.reopenAccount(account.id);
    setAccounts(nextAccounts);
    setOpenMenuAccountId(null);
  }

  async function deleteAccount(account: SidebarAccount) {
    const shouldDelete = await confirmDialog({
      title: `Delete "${account.name}"?`,
      message: "Only empty accounts can be permanently deleted. This cannot be undone.",
      confirmLabel: "Delete account",
      tone: "danger",
    });

    if (!shouldDelete) {
      return;
    }

    const result = await accountsPersistence.deleteAccount(account.id);

    if (!result.deleted) {
      await alertDialog({ message: result.reason ?? "This account cannot be deleted." });
    }

    setAccounts(result.accounts);
    setOpenMenuAccountId(null);
  }

  function openSettingsDestination(path: string) {
    setIsSettingsMenuOpen(false);
    navigate(path);
  }

  function renderAccount(account: SidebarAccount) {
    const isMenuOpen = openMenuAccountId === account.id;

    return (
      <div className="account-row" key={account.id}>
        <NavLink to={`/accounts/${account.id}`} className="account-link">
          <span className="account-link-name">{account.name}</span>
        </NavLink>

        <button
          className="account-menu-button"
          type="button"
          aria-label={`Manage ${account.name}`}
          title={`Manage ${account.name}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpenMenuAccountId(isMenuOpen ? null : account.id);
          }}
        >
          <MoreHorizontal size={15} />
        </button>

        {isMenuOpen && (
          <div className="account-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setEditingAccount(account);
                setOpenMenuAccountId(null);
              }}
            >
              <Pencil size={14} />
              <span>Edit / rename</span>
            </button>

            {account.closedAt ? (
              <button type="button" role="menuitem" onClick={() => reopenAccount(account)}>
                <RotateCcw size={14} />
                <span>Reopen account</span>
              </button>
            ) : (
              <button type="button" role="menuitem" onClick={() => closeAccount(account)}>
                <Archive size={14} />
                <span>Close account</span>
              </button>
            )}

            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => deleteAccount(account)}
            >
              <Trash2 size={14} />
              <span>Delete account</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <aside className="sidebar">
        <NavLink to="/" className="sidebar-brand sidebar-brand-link">
          <div>
            <h2>Budget App</h2>
            <p className="sidebar-subtitle">Budgets</p>
          </div>
        </NavLink>

        <nav className="sidebar-nav">
          <NavLink to="/budget" className="sidebar-link">
            <WalletCards size={18} />
            <span>Budget</span>
          </NavLink>

          <div className="accounts-block">
            <button
              className="accounts-header"
              type="button"
              onClick={() => setAccountsOpen(!accountsOpen)}
            >
              <div>
                <ChevronDown
                  size={16}
                  className={accountsOpen ? "chevron-open" : "chevron-closed"}
                />
                <span>Accounts</span>
              </div>

              <span
                role="button"
                tabIndex={0}
                className="account-add-button"
                title="Add account"
                aria-label="Add account"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsAddAccountOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    setIsAddAccountOpen(true);
                  }
                }}
              >
                <Plus size={15} />
              </span>
            </button>

            {accountsOpen && (
              <div className="account-tree">
                <div className="account-section">
                  <FolderOpen size={14} />
                  <span>Budget Accounts</span>
                </div>

                {budgetAccounts.map(renderAccount)}

                <div className="account-section">
                  <CreditCard size={14} />
                  <span>Credit Cards</span>
                </div>

                {creditCards.map(renderAccount)}

                <div className="account-section">
                  <PiggyBank size={14} />
                  <span>Tracking</span>
                </div>

                {trackingAccounts.map(renderAccount)}

                {closedAccounts.length > 0 && (
                  <>
                    <button
                      className="closed-accounts-toggle"
                      type="button"
                      onClick={() => setClosedAccountsOpen(!closedAccountsOpen)}
                    >
                      <ChevronDown
                        size={14}
                        className={closedAccountsOpen ? "chevron-open" : "chevron-closed"}
                      />
                      <span>Closed accounts ({closedAccounts.length})</span>
                    </button>

                    {closedAccountsOpen && (
                      <div className="closed-account-list">
                        {closedAccounts.map(renderAccount)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <NavLink to="/dashboard" className="sidebar-link">
            <Gauge size={18} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/reports" className="sidebar-link">
            <BarChart3 size={18} />
            <span>Reports</span>
          </NavLink>
        </nav>

        <div className="sidebar-settings">
          <div className="sidebar-settings-menu">
            {isSettingsMenuOpen ? (
              <div className="sidebar-settings-menu-panel" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openSettingsDestination("/settings")}
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openSettingsDestination("/restore-points")}
                >
                  <RotateCcw size={16} />
                  <span>Restore Points</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openSettingsDestination("/payees")}
                >
                  <Users size={16} />
                  <span>Payee Management</span>
                </button>
              </div>
            ) : null}

            <button
              className="settings-button"
              type="button"
              aria-expanded={isSettingsMenuOpen}
              aria-haspopup="menu"
              onClick={() => setIsSettingsMenuOpen((isOpen) => !isOpen)}
            >
              <Settings size={18} />
              <span>Settings</span>
              <ChevronDown
                size={15}
                className={isSettingsMenuOpen ? "chevron-open" : "chevron-closed"}
              />
            </button>
          </div>
        </div>
      </aside>

      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onCreate={addAccount}
        shouldAskCreditCardBehaviour={creditCards.length === 0}
        onCreditCardBehaviourSelected={chooseCreditCardBehaviour}
      />

      <AddAccountModal
        isOpen={Boolean(editingAccount)}
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
        onCreate={addAccount}
        onUpdate={updateAccount}
      />
    </>
  );
}
