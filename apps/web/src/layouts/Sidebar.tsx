import {
  BarChart3,
  ChevronDown,
  CreditCard,
  FolderOpen,
  Gauge,
  PiggyBank,
  Plus,
  Settings,
  WalletCards,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { AddAccountModal } from "../components/accounts/AddAccountModal";
import {
  accountService,
  type CreateAccountInput,
  type SidebarAccount,
} from "../features/accounts/accountService";

export function Sidebar() {
  const [accountsOpen, setAccountsOpen] = useState(true);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
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

  const budgetAccounts = accounts.filter((account) => account.type === "on-budget");
  const creditCards = accounts.filter((account) => account.type === "credit-card");
  const trackingAccounts = accounts.filter((account) => account.type === "tracking");

  async function addAccount(input: CreateAccountInput) {
    const nextAccounts = await accountService.createAccount(input);
    setAccounts(nextAccounts);
  }

  function renderAccount(account: SidebarAccount) {
    return (
      <NavLink
        key={account.id}
        to={`/accounts/${account.id}`}
        className="account-link"
      >
        {account.name}
      </NavLink>
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
    </>
  );
}
