import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import "../../../styles/registerToolbar.css";
import { WorkspaceActions, WorkspaceHeader } from "../../../components/workspace";
import { DropdownMenu } from "../../ui/DropdownMenu";
import type { TableColumnDefinition } from "../../tableLayout/tableLayout";
import type { RegisterColumnId } from "./TransactionRow";
import { RegisterUndoToast } from "./RegisterUndoToast";
import type {
  RegisterSearchCommit,
  RegisterSearchSuggestion,
} from "../registerSearch";

type RegisterView = "register" | "scheduled";

interface RegisterSearchDropdownProps {
  query: string;
  suggestions: readonly RegisterSearchSuggestion[];
  activeIndex: number | null;
  onCommit: (suggestion: RegisterSearchSuggestion) => void;
  onHighlight: (index: number) => void;
}

function RegisterSearchDropdown({
  query,
  suggestions,
  activeIndex,
  onCommit,
  onHighlight,
}: RegisterSearchDropdownProps) {
  if (!query.trim() || suggestions.length === 0) return null;

  const groups: Array<{ key: RegisterSearchSuggestion["group"]; label: string; icon: string }> = [
    { key: "search", label: "Search", icon: "🔎" },
    { key: "payees", label: "Payees", icon: "👤" },
    { key: "categories", label: "Categories", icon: "🏷" },
    { key: "memos", label: "Memos", icon: "📝" },
  ];
  let renderedIndex = -1;

  return (
    <div className="register-search-dropdown" role="listbox">
      {groups.map((group) => {
        const items = suggestions.filter((suggestion) => suggestion.group === group.key);
        if (items.length === 0) return null;
        return (
          <section className="register-search-group" key={group.key}>
            <div className="register-search-group-title">{group.label}</div>
            {items.map((suggestion) => {
              renderedIndex += 1;
              const suggestionIndex = renderedIndex;
              const isActive = suggestionIndex === activeIndex;
              return (
                <button
                  className={`register-search-suggestion${isActive ? " register-search-suggestion-active" : ""}`}
                  key={suggestion.id}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => onHighlight(suggestionIndex)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onCommit(suggestion);
                  }}
                >
                  <span className="register-search-suggestion-icon" aria-hidden="true">{group.icon}</span>
                  <span className="register-search-suggestion-main">
                    <strong>{suggestion.label}</strong>
                    {suggestion.detail ? <small>{suggestion.detail}</small> : null}
                  </span>
                  <span className="register-search-suggestion-count">{suggestion.count}</span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

interface CustomizeRegisterPanelProps {
  columns: readonly TableColumnDefinition<RegisterColumnId>[];
  visibleColumnSet: Set<RegisterColumnId>;
  onToggleColumn: (columnId: RegisterColumnId) => void;
  onResetColumns: () => void;
  onClose: () => void;
}

function CustomizeRegisterPanel({
  columns,
  visibleColumnSet,
  onToggleColumn,
  onResetColumns,
  onClose,
}: CustomizeRegisterPanelProps) {
  const hideableColumns = columns.filter((column) => column.canHide === true);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="register-customize-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="register-customize-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-customize-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="register-customize-header">
          <div>
            <h2 id="register-customize-title">Customize register</h2>
            <p>Choose which columns are visible in this register.</p>
          </div>
          <button className="register-customize-close" type="button" onClick={onClose} aria-label="Close customize register">×</button>
        </header>

        <div className="register-customize-body">
          <h3>Columns</h3>
          <div className="register-customize-columns">
            {hideableColumns.map((column) => (
              <label className="register-customize-column-toggle" key={column.id}>
                <input
                  type="checkbox"
                  checked={visibleColumnSet.has(column.id)}
                  onChange={() => onToggleColumn(column.id)}
                />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
        </div>

        <footer className="register-customize-footer">
          <button className="button button-secondary" type="button" onClick={onResetColumns}>Reset layout</button>
          <button className="button button-primary" type="button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}

interface RegisterToolbarProps {
  accountName: string;
  workingBalance: number;
  clearedBalance: number;
  unclearedBalance: number;
  currencyCode: string;
  formatMoney: (value: number, currencyCode: string) => string;
  activeView: RegisterView;
  onViewChange: (view: RegisterView) => void;
  onToggleEntryRow: () => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchDraft: string;
  committedSearch: RegisterSearchCommit | null;
  isSearchOpen: boolean;
  searchSuggestions: readonly RegisterSearchSuggestion[];
  activeSearchSuggestionIndex: number | null;
  onSearchDraftChange: (value: string) => void;
  onSearchOpenChange: (isOpen: boolean) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCommitSearch: (suggestion: RegisterSearchSuggestion) => void;
  onHighlightSearchSuggestion: (index: number) => void;
  onClearSearch: () => void;
  columns: readonly TableColumnDefinition<RegisterColumnId>[];
  visibleColumnSet: Set<RegisterColumnId>;
  onToggleColumn: (columnId: RegisterColumnId) => void;
  onResetColumns: () => void;
  onOpenImport: () => void;
  onOpenTagManager: () => void;
  scheduledDueCount: number;
  categoryFilter: "all" | "uncategorised";
  categoriesEnabled: boolean;
  onCategoryFilterChange: (filter: "all" | "uncategorised") => void;
  canUndo: boolean;
  canRedo: boolean;
  isHistoryBusy: boolean;
  undoTitle: string;
  redoTitle: string;
  onUndo: () => void;
  onRedo: () => void;
}

export function RegisterToolbar(props: RegisterToolbarProps) {
  const {
    accountName, workingBalance, clearedBalance, unclearedBalance, currencyCode, formatMoney, activeView, onViewChange,
    onToggleEntryRow, searchInputRef, searchDraft, committedSearch, isSearchOpen,
    searchSuggestions, activeSearchSuggestionIndex, onSearchDraftChange, onSearchOpenChange,
    onSearchKeyDown, onCommitSearch, onHighlightSearchSuggestion, onClearSearch,
    columns, visibleColumnSet, onToggleColumn, onResetColumns, onOpenImport,
    onOpenTagManager, scheduledDueCount, categoryFilter, categoriesEnabled, onCategoryFilterChange,
    canUndo, canRedo, isHistoryBusy, undoTitle, redoTitle, onUndo, onRedo,
  } = props;
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  function renderRegisterOptions(
    closeMenu: (options?: { restoreFocus?: boolean }) => void,
  ) {
    return (
      <>
        <button
          className="register-history-menu-item"
          type="button"
          role="menuitem"
          disabled={!canUndo || isHistoryBusy}
          title={undoTitle}
          onClick={() => { onUndo(); closeMenu({ restoreFocus: true }); }}
        >
          <span>Undo</span>
          <span className="register-menu-shortcut" aria-hidden="true">Ctrl/Cmd+Z</span>
        </button>
        <button
          className="register-history-menu-item"
          type="button"
          role="menuitem"
          disabled={!canRedo || isHistoryBusy}
          title={redoTitle}
          onClick={() => { onRedo(); closeMenu({ restoreFocus: true }); }}
        >
          <span>Redo</span>
          <span className="register-menu-shortcut" aria-hidden="true">Ctrl/Cmd+Shift+Z</span>
        </button>
        <div className="register-options-divider" role="separator" />
        <button type="button" role="menuitem" onClick={() => { onOpenImport(); closeMenu({ restoreFocus: true }); }}>Import transactions</button>
        <button type="button" role="menuitem" onClick={() => { onOpenTagManager(); closeMenu({ restoreFocus: true }); }}>Manage tags</button>
        <button type="button" role="menuitem" disabled>Reconcile</button>
        <div className="register-options-divider" role="separator" />
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            closeMenu();
            setIsCustomizeOpen(true);
          }}
        >
          Customize register…
        </button>
      </>
    );
  }

  return (
    <>
      <WorkspaceHeader
        className="register-clean-header"
        title={accountName}
        secondaryActions={
          <div
            className={`register-main-balance ${
              workingBalance < 0
                ? "register-main-balance-negative"
                : workingBalance > 0
                  ? "register-main-balance-positive"
                  : "register-main-balance-neutral"
            }`}
            aria-label={`Current balance ${formatMoney(workingBalance, currencyCode)}. Cleared ${formatMoney(clearedBalance, currencyCode)}. Uncleared ${formatMoney(unclearedBalance, currencyCode)}.`}
          >
            <span className="register-main-balance-label">Current balance</span>
            <strong>{formatMoney(workingBalance, currencyCode)}</strong>
            <div className="register-balance-breakdown" aria-hidden="true">
              <span>Cleared <b>{formatMoney(clearedBalance, currencyCode)}</b></span>
              <span>Uncleared <b>{formatMoney(unclearedBalance, currencyCode)}</b></span>
            </div>
          </div>
        }
      />

      <nav className="register-view-tabs" aria-label="Account register views">
        <button className={activeView === "register" ? "active" : ""} type="button" aria-current={activeView === "register" ? "page" : undefined} onClick={() => onViewChange("register")}>Register</button>
        <button className={activeView === "scheduled" ? "active" : ""} type="button" aria-current={activeView === "scheduled" ? "page" : undefined} onClick={() => onViewChange("scheduled")}>
          Scheduled{scheduledDueCount > 0 ? <span className="register-tab-count">{scheduledDueCount}</span> : null}
        </button>
      </nav>

      {activeView === "register" ? (
        <div className="register-toolbar register-toolbar-clean">
          <WorkspaceActions className="register-toolbar-actions" tabletOverflow="scroll" aria-label="Register actions">
            <div className="register-toolbar-left">
              <div className="register-search-shell">
                <input ref={searchInputRef} className="register-search" placeholder="Search transactions…" aria-label="Search transactions" value={searchDraft}
                  onChange={(event) => { onSearchDraftChange(event.target.value); onSearchOpenChange(true); }}
                  onFocus={() => onSearchOpenChange(true)} onKeyDown={onSearchKeyDown} />
                {committedSearch ? <button className="register-search-clear" type="button" onClick={onClearSearch}>Clear</button> : null}
                {isSearchOpen ? <RegisterSearchDropdown query={searchDraft} suggestions={searchSuggestions} activeIndex={activeSearchSuggestionIndex} onCommit={onCommitSearch} onHighlight={onHighlightSearchSuggestion} /> : null}
              </div>
              {categoriesEnabled ? <div className="register-category-filter" aria-label="Category filter">
                <button className={categoryFilter === "all" ? "register-filter-chip active" : "register-filter-chip"} type="button" onClick={() => onCategoryFilterChange("all")}>All</button>
                <button className={categoryFilter === "uncategorised" ? "register-filter-chip active" : "register-filter-chip"} type="button" onClick={() => onCategoryFilterChange("uncategorised")}>Uncategorised</button>
              </div> : null}
            </div>

            <div className="register-toolbar-right register-desktop-actions">
              <DropdownMenu label="⋯" triggerAriaLabel="Register options" ariaLabel="Register options" className="register-options-menu" buttonClassName="button button-secondary register-options-trigger" panelClassName="register-more-menu-panel">
                {({ closeMenu }) => renderRegisterOptions(closeMenu)}
              </DropdownMenu>
              <button className="button button-primary" type="button" onClick={onToggleEntryRow}>Add transaction</button>
            </div>

            <div className="register-mobile-actions">
              <button className="button button-primary" type="button" onClick={onToggleEntryRow}>Add transaction</button>
              <DropdownMenu label="⋯" triggerAriaLabel="Register options" ariaLabel="Register options" className="register-mobile-more" buttonClassName="button button-secondary register-options-trigger" panelClassName="register-more-menu-panel">
                {({ closeMenu }) => renderRegisterOptions(closeMenu)}
              </DropdownMenu>
            </div>
          </WorkspaceActions>
        </div>
      ) : null}

      {isCustomizeOpen ? (
        <CustomizeRegisterPanel
          columns={columns}
          visibleColumnSet={visibleColumnSet}
          onToggleColumn={onToggleColumn}
          onResetColumns={onResetColumns}
          onClose={() => setIsCustomizeOpen(false)}
        />
      ) : null}

      <RegisterUndoToast
        canUndo={canUndo}
        isHistoryBusy={isHistoryBusy}
        onUndo={onUndo}
      />
    </>
  );
}
