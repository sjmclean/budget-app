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
  Trash2,
  WalletCards,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { AddAccountModal } from "../components/accounts/AddAccountModal";
import {
  accountService,
  type CreateAccountInput,
  type SidebarAccount,

  type UpdateAccountInput

} from "../features/accounts/accountService";

export function Sidebar() {
  const [accountsOpen, setAccountsOpen] = useState(true);
  const [closedAccountsOpen, setClosedAccountsOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SidebarAccount | null>(null);
  const [openMenuAccountId, setOpenMenuAccountId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<SidebarAccount[]>([]);

  useEffect(() => {
    let active = true;

    accountService.listAccounts().then((loadedAccounts) => {
      if (active) {
        setAccounts(loadedAccounts);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const activeAccounts = accounts.filter((account) => !account.closedAt);
  const closedAccounts = accounts.filter((account) => account.closedAt);
  const budgetAccounts = activeAccounts.filter((account) => account.type === "on-budget");
  const creditCards = activeAccounts.filter((account) => account.type === "credit-card");
  const trackingAccounts = activeAccounts.filter((account) => account.type === "tracking");

  async function addAccount(input: CreateAccountInput) {
    const nextAccounts = await accountService.createAccount(input);
    setAccounts(nextAccounts);
  }

  async function updateAccount(input: UpdateAccountInput) {
    const nextAccounts = await accountService.updateAccount(input);
    setAccounts(nextAccounts);
    setEditingAccount(null);
    setOpenMenuAccountId(null);
  }

  async function closeAccount(account: SidebarAccount) {
    const shouldClose = window.confirm(
      `Close "${account.name}"?\n\nClosed accounts are hidden from the main account list, but their transactions are preserved and the account can be reopened later.`,
    );

    if (!shouldClose) {
      return;
    }

    const nextAccounts = await accountService.closeAccount(account.id);
    setAccounts(nextAccounts);
    setOpenMenuAccountId(null);
  }

  async function reopenAccount(account: SidebarAccount) {
    const nextAccounts = await accountService.reopenAccount(account.id);
    setAccounts(nextAccounts);
    setOpenMenuAccountId(null);
  }

  async function deleteAccount(account: SidebarAccount) {
    const shouldDelete = window.confirm(
      `Delete "${account.name}"?\n\nOnly empty accounts can be permanently deleted. This cannot be undone.`,
    );

    if (!shouldDelete) {
      return;
    }

    const result = await accountService.deleteAccount(account.id);

    if (!result.deleted) {
      window.alert(result.reason ?? "This account cannot be deleted.");
    }

    setAccounts(result.accounts);
    setOpenMenuAccountId(null);
  }
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
        <div className="sidebar-brand">
          <div>
            <h2>Budget App</h2>
            <p className="sidebar-subtitle">Local file</p>
          </div>
        </div>

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
          <NavLink to="/settings" className="settings-button">
            <Settings size={18} />
            <span>Settings</span>
          </NavLink>
        </div>
      </aside>

      <AddAccountModal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        onCreate={addAccount}
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
