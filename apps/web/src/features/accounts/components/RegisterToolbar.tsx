import type { KeyboardEvent, RefObject } from "react";
import { DropdownMenu } from "../../ui/DropdownMenu";
import { ColumnVisibilityMenu } from "../../tableLayout/ColumnVisibilityMenu";
import type { TableColumnDefinition } from "../../tableLayout/tableLayout";
import type { RegisterColumnId } from "./TransactionRow";
import type {
  RegisterSearchCommit,
  RegisterSearchSuggestion,
} from "../registerSearch";

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
  if (!query.trim() || suggestions.length === 0) {
    return null;
  }

  const groups: Array<{
    key: RegisterSearchSuggestion["group"];
    label: string;
    icon: string;
  }> = [
    { key: "search", label: "Search", icon: "🔎" },
    { key: "payees", label: "Payees", icon: "👤" },
    { key: "categories", label: "Categories", icon: "🏷" },
    { key: "memos", label: "Memos", icon: "📝" },
  ];

  let renderedIndex = -1;

  return (
    <div className="register-search-dropdown" role="listbox">
      {groups.map((group) => {
        const items = suggestions.filter(
          (suggestion) => suggestion.group === group.key,
        );

        if (items.length === 0) {
          return null;
        }

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
                  <span
                    className="register-search-suggestion-icon"
                    aria-hidden="true"
                  >
                    {group.icon}
                  </span>
                  <span className="register-search-suggestion-main">
                    <strong>{suggestion.label}</strong>
                    {suggestion.detail ? (
                      <small>{suggestion.detail}</small>
                    ) : null}
                  </span>
                  <span className="register-search-suggestion-count">
                    {suggestion.count}
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

interface RegisterToolbarProps {
  accountName: string;
  workingBalance: number;
  currencyCode: string;
  formatMoney: (value: number, currencyCode: string) => string;
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
  onOpenPayeeManager: () => void;
  onToggleScheduled: () => void;
  scheduledDueCount: number;
}

export function RegisterToolbar({
  accountName,
  workingBalance,
  currencyCode,
  formatMoney,
  onToggleEntryRow,
  searchInputRef,
  searchDraft,
  committedSearch,
  isSearchOpen,
  searchSuggestions,
  activeSearchSuggestionIndex,
  onSearchDraftChange,
  onSearchOpenChange,
  onSearchKeyDown,
  onCommitSearch,
  onHighlightSearchSuggestion,
  onClearSearch,
  columns,
  visibleColumnSet,
  onToggleColumn,
  onResetColumns,
  onOpenImport,
  onOpenPayeeManager,
  onToggleScheduled,
  scheduledDueCount,
}: RegisterToolbarProps) {
  return (
    <>
      <section className="register-clean-header">
        <div>
          <h1>{accountName}</h1>
          <p className="muted">
            Keyboard-first date entry · Save & add another
          </p>
        </div>

        <div className="register-main-balance">
          <span>Balance</span>
          <strong>{formatMoney(workingBalance, currencyCode)}</strong>
        </div>
      </section>

      <div className="register-toolbar register-toolbar-clean">
        <div className="register-toolbar-actions register-toolbar-actions-left">
          <button
            className="button button-primary"
            type="button"
            onClick={onToggleEntryRow}
          >
            Add transaction
          </button>

          <div className="register-search-shell">
            <input
              ref={searchInputRef}
              className="register-search"
              placeholder="Search payees, categories, memos or amounts…"
              aria-label="Search transactions"
              value={searchDraft}
              onChange={(event) => {
                onSearchDraftChange(event.target.value);
                onSearchOpenChange(true);
              }}
              onFocus={() => onSearchOpenChange(true)}
              onKeyDown={onSearchKeyDown}
            />
            {committedSearch ? (
              <button
                className="register-search-clear"
                type="button"
                onClick={onClearSearch}
              >
                Clear
              </button>
            ) : null}
            {isSearchOpen ? (
              <RegisterSearchDropdown
                query={searchDraft}
                suggestions={searchSuggestions}
                activeIndex={activeSearchSuggestionIndex}
                onCommit={onCommitSearch}
                onHighlight={onHighlightSearchSuggestion}
              />
            ) : null}
          </div>

          <ColumnVisibilityMenu
            label="Columns ▾"
            columns={columns}
            visibleColumnSet={visibleColumnSet}
            onToggleColumn={onToggleColumn}
            onReset={onResetColumns}
          />

          <button
            className="button button-secondary"
            type="button"
            onClick={onOpenImport}
          >
            Import
          </button>

          <button className="button button-secondary" type="button" disabled>
            Reconcile
          </button>

          <DropdownMenu
            label="More ▾"
            ariaLabel="Register actions"
            className="register-more-menu"
            panelClassName="register-more-menu-panel"
          >
            {({ closeMenu }) => (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenPayeeManager();
                    closeMenu({ restoreFocus: true });
                  }}
                >
                  Manage Payees
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleScheduled();
                    closeMenu({ restoreFocus: true });
                  }}
                >
                  Scheduled Transactions
                  {scheduledDueCount > 0 ? ` (${scheduledDueCount})` : ""}
                </button>
              </>
            )}
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}
