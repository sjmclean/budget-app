import {
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  ChartSpline,
  ChevronDown,
  CreditCard,
  Folder,
  House,
  Landmark,
  Gauge,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Users,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AddAccountModal } from "../components/accounts/AddAccountModal";
import { isUncategorisedRegisterTransaction } from "../features/accounts/registerUncategorised";
import type { AccountRegisterView } from "../features/accounts/accountRegisterTypes";
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

interface AccountNavigationSummary {
  currencyCode: string;
  workingBalance: number;
  hasUncategorisedTransactions: boolean;
}

interface SidebarProps {
  mode: AdaptiveNavigationMode;
  collapsed: boolean;
  drawerOpen: boolean;
  onToggleExpanded: () => void;
  onCloseDrawer: () => void;
}

const ACCOUNT_NAVIGATION_UPDATED_EVENT = "budget-app:account-navigation-updated";

const navigationIcons: Record<NavigationIcon, typeof WalletCards> = {
  budget: WalletCards,
  dashboard: Gauge,
  reports: ChartSpline,
  settings: Settings2,
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
  const [accountSummaries, setAccountSummaries] = useState<Record<string, AccountNavigationSummary>>({});
  const [accountNavigationRevision, setAccountNavigationRevision] = useState(0);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);

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
    const drawer = drawerRef.current;
    const focusableSelector =
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseDrawer();
        return;
      }

      if (event.key !== "Tab" || !drawer) {
        return;
      }

      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      drawer?.querySelector<HTMLElement>(".navigation-drawer-close")?.focus();
    });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen, mode, onCloseDrawer]);

  useEffect(() => {
    const refreshAccountNavigation = () => {
      setAccountNavigationRevision((revision) => revision + 1);
    };

    window.addEventListener(ACCOUNT_NAVIGATION_UPDATED_EVENT, refreshAccountNavigation);
    return () => {
      window.removeEventListener(ACCOUNT_NAVIGATION_UPDATED_EVENT, refreshAccountNavigation);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadAccountNavigation() {
      const loadedAccounts = await accountsPersistence.listAccounts();
      const summaryEntries = await Promise.all(
        loadedAccounts.map(async (account) => {
          try {
            const register = await getAppPersistenceGateway().accountRegisters.getAccountRegisterView({
              accountId: account.id,
            });
            return [account.id, buildAccountNavigationSummary(register)] as const;
          } catch {
            return [
              account.id,
              {
                currencyCode: "AUD",
                workingBalance: account.startingBalance,
                hasUncategorisedTransactions: false,
              },
            ] as const;
          }
        }),
      );

      if (active) {
        setAccounts(loadedAccounts);
        setAccountSummaries(Object.fromEntries(summaryEntries));
      }
    }

    void loadAccountNavigation();

    return () => {
      active = false;
    };
  }, [accountsPersistence, location.pathname, accountNavigationRevision]);

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
    const summary = accountSummaries[account.id];
    const balance = summary?.workingBalance ?? account.startingBalance;
    const formattedBalance = formatAccountBalance(
      balance,
      summary?.currencyCode ?? "AUD",
    );

    return (
      <div className="account-row" key={account.id}>
        <NavLink to={`/accounts/${account.id}`} className="account-link">
          <span className="account-row-bullet" aria-hidden="true" />
          <span className="account-link-name">{account.name}</span>
          <span className="account-financial-status">
            {summary?.hasUncategorisedTransactions ? (
              <span
                className="account-warning"
                role="img"
                aria-label="Contains uncategorised transactions"
                title="Contains uncategorised transactions"
              >
                <AlertTriangle size={15} strokeWidth={2.2} />
              </span>
            ) : null}
            <span
              className={["account-balance", balance < 0 ? "account-balance-negative" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              {formattedBalance}
            </span>
          </span>
        </NavLink>

        <button
          className="account-menu-button"
          type="button"
          aria-label={`Manage ${account.name}`}
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
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
    const isBudgetDestination = destination.icon === "budget";

    return (
      <NavLink
        key={destination.path}
        to={destination.path}
        className="sidebar-link"
        title={collapsed ? destination.label : undefined}
      >
        {isBudgetDestination ? (
          <img
            className="sidebar-budget-icon"
            src="/budget-navigation-icon.png"
            alt=""
            aria-hidden="true"
          />
        ) : (
          <Icon size={19} />
        )}
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
        ref={drawerRef}
        className={[
          "sidebar",
          collapsed ? "sidebar-collapsed" : "",
          mode === "drawer" ? "sidebar-drawer" : "",
          drawerOpen ? "sidebar-drawer-open" : "",
        ].filter(Boolean).join(" ")}
        aria-label="Primary navigation"
        aria-hidden={mode === "drawer" && !drawerOpen}
        aria-modal={mode === "drawer" && drawerOpen ? true : undefined}
        role={mode === "drawer" ? "dialog" : undefined}
        tabIndex={mode === "drawer" ? -1 : undefined}
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
                className={[
                  "accounts-header",
                  location.pathname.startsWith("/accounts/") ? "accounts-header-active" : "",
                ].filter(Boolean).join(" ")}
                type="button"
                aria-expanded={accountsOpen}
                aria-controls="primary-navigation-accounts"
                onClick={() => setAccountsOpen(!accountsOpen)}
              >
                <Landmark size={19} />
                <span>Accounts</span>
                <ChevronDown
                  size={15}
                  className={accountsOpen ? "chevron-open" : "chevron-closed"}
                />
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
                {budgetAccounts.length > 0 ? (
                  <>
                    <div className="account-section">
                      <Folder size={15} />
                      <span>Budget Accounts</span>
                    </div>
                    {budgetAccounts.map(renderAccount)}
                  </>
                ) : null}

                {creditCards.length > 0 ? (
                  <>
                    <div className="account-section">
                      <CreditCard size={15} />
                      <span>Credit Cards</span>
                    </div>
                    {creditCards.map(renderAccount)}
                  </>
                ) : null}

                {trackingAccounts.length > 0 ? (
                  <>
                    <div className="account-section">
                      <House size={15} />
                      <span>Tracking</span>
                    </div>
                    {trackingAccounts.map(renderAccount)}
                  </>
                ) : null}

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
                      <Archive size={15} />
                      <span>Closed accounts ({closedAccounts.length})</span>
                      <ChevronDown
                        size={14}
                        className={closedAccountsOpen ? "chevron-open" : "chevron-closed"}
                      />
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
              <Settings2 size={18} />
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

function buildAccountNavigationSummary(
  register: AccountRegisterView,
): AccountNavigationSummary {
  return {
    currencyCode: register.currencyCode,
    workingBalance: register.workingBalance,
    hasUncategorisedTransactions:
      register.accountType !== "Tracking" &&
      register.transactions.some((transaction) =>
        isUncategorisedRegisterTransaction(transaction, register.accountType),
      ),
  };
}

function formatAccountBalance(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
