import {
  Archive,
  ArrowLeftRight,
  BarChart3,
  ChevronDown,
  CreditCard,
  FolderOpen,
  Gauge,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Pencil,
  PiggyBank,
  Plus,
  RotateCcw,
  Settings,
  Users,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
import { navigationModel, type NavigationIcon } from "./navigationModel";
import type { AdaptiveNavigationMode } from "./useAdaptiveNavigation";

interface SidebarProps {
  mode: AdaptiveNavigationMode;
  collapsed: boolean;
  drawerOpen: boolean;
  onToggleExpanded: () => void;
  onCloseDrawer: () => void;
}

const navigationIcons: Record<NavigationIcon, typeof WalletCards> = {
  budget: WalletCards,
  dashboard: Gauge,
  reports: BarChart3,
  settings: Settings,
  restore: RotateCcw,
  payees: Users,
  switch: ArrowLeftRight,
};

export function Sidebar({
  mode,
  collapsed,
  drawerOpen,
  onToggleExpanded,
  onCloseDrawer,
}: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
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
    if (mode === "drawer") {
      onCloseDrawer();
    }
  }, [location.pathname, mode, onCloseDrawer]);

  useEffect(() => {
    if (mode !== "drawer" || !drawerOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseDrawer();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [drawerOpen, mode, onCloseDrawer]);

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
  const activeBudget = budgets.find((budget) => budget.id === activeBudgetId);
  const shouldAskCreditCardBehaviour =
    creditCards.length === 0 && activeBudget?.preferences?.creditCardBehaviour === undefined;

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

  function renderNavigationDestination(path: string) {
    const destination = navigationModel.primary.find(
      (item) => item.kind === "destination" && item.path === path,
    );

    if (!destination || destination.kind !== "destination") {
      return null;
    }

    const Icon = navigationIcons[destination.icon];

    return (
      <NavLink
        key={destination.path}
        to={destination.path}
        className="sidebar-link"
        title={collapsed ? destination.label : undefined}
      >
        <Icon size={18} />
        <span>{destination.label}</span>
      </NavLink>
    );
  }

  return (
    <>
      {mode === "drawer" && drawerOpen ? (
        <button
          className="navigation-drawer-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={onCloseDrawer}
        />
      ) : null}

      <aside
        className={[
          "sidebar",
          collapsed ? "sidebar-collapsed" : "",
          mode === "drawer" ? "sidebar-drawer" : "",
          drawerOpen ? "sidebar-drawer-open" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Primary navigation"
        aria-hidden={mode === "drawer" && !drawerOpen}
        inert={mode === "drawer" && !drawerOpen}
      >
        <div className="sidebar-brand">
          <WalletCards className="sidebar-brand-icon" size={20} />
          <div>
            <h2>Budget App</h2>
            <p className="sidebar-subtitle">
              {mode === "drawer" ? "Navigation" : "Budgets"}
            </p>
          </div>
        </div>

        {mode === "drawer" ? (
          <button
            className="navigation-mode-button navigation-drawer-close"
            type="button"
            aria-label="Close navigation"
            onClick={onCloseDrawer}
          >
            <X size={18} />
          </button>
        ) : (
          <button
            className="navigation-mode-button"
            type="button"
            aria-label={
              collapsed
                ? mode === "desktop"
                  ? "Pin expanded navigation"
                  : "Expand navigation"
                : "Collapse navigation"
            }
            title={
              collapsed
                ? mode === "desktop"
                  ? "Pin expanded navigation"
                  : "Expand navigation"
                : "Collapse navigation"
            }
            onClick={onToggleExpanded}
          >
            {collapsed ? (
              mode === "desktop" ? <Pin size={17} /> : <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        )}

        <nav className="sidebar-nav">
          {renderNavigationDestination("/budget")}

          <div className="accounts-block">
            <div className="accounts-header-row">
              <button
                className="accounts-header"
                type="button"
                aria-expanded={accountsOpen}
                aria-controls="primary-navigation-accounts"
                onClick={() => setAccountsOpen(!accountsOpen)}
              >
                <ChevronDown
                  size={16}
                  className={accountsOpen ? "chevron-open" : "chevron-closed"}
                />
                <span>Accounts</span>
              </button>

              <button
                type="button"
                className="account-add-button"
                title="Add account"
                aria-label="Add account"
                onClick={() => setIsAddAccountOpen(true)}
              >
                <Plus size={15} />
              </button>
            </div>

            {accountsOpen && (
              <div className="account-tree" id="primary-navigation-accounts">
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

                {activeAccounts.length === 0 && closedAccounts.length === 0 ? (
                  <div className="account-tree-empty">
                    <span>No accounts yet</span>
                    <button type="button" onClick={() => setIsAddAccountOpen(true)}>
                      <Plus size={14} />
                      <span>Add your first account</span>
                    </button>
                  </div>
                ) : null}

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

          {renderNavigationDestination("/dashboard")}
          {renderNavigationDestination("/reports")}
        </nav>

        <div className="sidebar-settings">
          <div className="sidebar-settings-menu">
            {isSettingsMenuOpen ? (
              <div className="sidebar-settings-menu-panel" role="menu">
                {navigationModel.settings.map((destination) => {
                  const Icon = navigationIcons[destination.icon];

                  return (
                    <button
                      key={destination.path}
                      type="button"
                      role="menuitem"
                      onClick={() => openSettingsDestination(destination.path)}
                    >
                      <Icon size={16} />
                      <span>{destination.label}</span>
                    </button>
                  );
                })}
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
        shouldAskCreditCardBehaviour={shouldAskCreditCardBehaviour}
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
