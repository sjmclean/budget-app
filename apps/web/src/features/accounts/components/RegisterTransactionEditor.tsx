import {
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRegisterAutocompletePopupStyle } from "../useRegisterAutocompletePopupStyle";
import {
  AttachmentIndicator,
  InlineFlagPicker,
  type RegisterColumnId,
} from "./TransactionRow";
import { RegisterDateField } from "./RegisterDateField";
import {
  getAutocompleteCompletion,
  rankAutocompleteOptions,
  type AutocompleteOption,
  type RankedAutocompleteOption,
} from "../../ui/autocomplete/autocompleteEngine";
import {
  isRegisterColumnVisible,
  isRegisterEntryInputColumn,
} from "../registerColumns";
import type { RegisterLayoutMode } from "../registerLayoutMode";
import type { SidebarAccount } from "../accountService";
import type { PayeeView } from "../payeeService";
import {
  buildPayeeAutocompleteOptions,
  getPayeeSuggestionSection,
  getPayeeSuggestionText,
} from "../registerPayeeAutocomplete";
import type {
  NewRegisterTransactionInput,
  RegisterSplitLineView,
  RegisterTransactionView,
  TransactionFlag,
} from "../accountRegisterTypes";
import {
  createSplitLineDraft,
  getSplitBalanceStatus,
  isSplitBalanced,
  isSplitDraftBalanced,
  parseRegisterMoney,
  splitDraftsFromTransaction,
  totalsFromSplitDrafts,
  type SplitLineDraft,
} from "../registerSplitDrafts";
import {
  findCategoryOption,
  isSplitCategoryValue,
  normaliseCategoryName,
  SPLIT_CATEGORY_LABEL,
} from "../registerCategoryMatching";
import {
  buildNewRegisterTransactionInput,
  buildUpdateRegisterTransactionInput,
} from "../registerTransactionDrafts";
import type { BudgetCategoryOption } from "../../budget/budgetViewTypes";

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

function getCategorySuggestionSection(
  suggestion: RankedAutocompleteOption<{
    label: string;
    groupName?: string;
    type: "category" | "special";
  }>,
) {
  return suggestion.metadata?.type === "special"
    ? "Special"
    : (suggestion.metadata?.groupName ?? suggestion.label ?? "Categories");
}

function PayeeInput({
  value,
  onChange,
  onPayeeIdChange,
  transferAccounts,
  payeeOptions,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onPayeeIdChange?: (payeeId: string | undefined) => void;
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  autoFocus?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const autocompleteOptions = useMemo(
    () => buildPayeeAutocompleteOptions({ transferAccounts, payeeOptions }),
    [payeeOptions, transferAccounts],
  );

  const suggestions = useMemo(
    () =>
      rankAutocompleteOptions({
        inputValue: value,
        options: autocompleteOptions,
        maxResults: 8,
      }),
    [autocompleteOptions, value],
  );

  const highlightedSuggestion =
    suggestions[
      Math.min(highlightedIndex, Math.max(suggestions.length - 1, 0))
    ];
  const ghostCompletion = getAutocompleteCompletion(
    value,
    highlightedSuggestion?.value,
  );
  const shouldShowSuggestions = isOpen && suggestions.length > 0;
  const shouldShowGhost = shouldShowSuggestions && Boolean(ghostCompletion);
  const { anchorRef, popupStyle } = useRegisterAutocompletePopupStyle(
    shouldShowSuggestions,
  );

  function selectSuggestion(selectedValue: string, selectedPayeeId?: string) {
    onChange(selectedValue);
    onPayeeIdChange?.(selectedPayeeId);
    setIsOpen(false);
    setHighlightedIndex(0);
  }

  function acceptHighlightedSuggestion() {
    if (!highlightedSuggestion) {
      return false;
    }

    selectSuggestion(
      highlightedSuggestion.value,
      highlightedSuggestion.metadata?.payeeId,
    );
    return true;
  }

  return (
    <div className="register-payee-autocomplete">
      <input
        ref={anchorRef}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;

          onChange(nextValue);
          onPayeeIdChange?.(undefined);
          setIsOpen(nextValue.trim().length > 0);
          setHighlightedIndex(0);
        }}
        onFocus={() => setIsOpen(false)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "Tab" && !event.shiftKey && shouldShowGhost) {
            acceptHighlightedSuggestion();
            return;
          }

          if (event.key === "ArrowRight" && shouldShowGhost) {
            const input = event.currentTarget;
            const cursorAtEnd =
              input.selectionStart === value.length &&
              input.selectionEnd === value.length;

            if (cursorAtEnd) {
              event.preventDefault();
              acceptHighlightedSuggestion();
              return;
            }
          }

          if (event.key === "ArrowDown" && suggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((current) =>
              shouldShowSuggestions && current < suggestions.length - 1
                ? current + 1
                : 0,
            );
            return;
          }

          if (event.key === "ArrowUp" && suggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((current) =>
              shouldShowSuggestions && current > 0
                ? current - 1
                : suggestions.length - 1,
            );
            return;
          }

          if (!shouldShowSuggestions) {
            return;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            acceptHighlightedSuggestion();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
        placeholder="Payee"
        autoFocus={autoFocus}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shouldShowSuggestions}
      />

      {shouldShowGhost ? (
        <div className="register-payee-ghost" aria-hidden="true">
          <span className="register-payee-ghost-typed">{value}</span>
          <span>{ghostCompletion}</span>
        </div>
      ) : null}

      {shouldShowSuggestions ? (
        <div
          className="register-payee-suggestions register-autocomplete-popup"
          role="listbox"
          style={popupStyle}
        >
          {suggestions.map((suggestion, index) => {
            const section = getPayeeSuggestionSection(suggestion);
            const previousSection =
              index > 0
                ? getPayeeSuggestionSection(suggestions[index - 1])
                : null;
            const showSection = section !== previousSection;
            const isTransfer = suggestion.metadata?.type === "transfer";

            return (
              <div
                key={suggestion.id}
                className="register-autocomplete-suggestion-block"
              >
                {showSection ? (
                  <div className="register-autocomplete-section-heading">
                    {section}
                  </div>
                ) : null}

                <button
                  type="button"
                  className={
                    index === highlightedIndex
                      ? "register-payee-suggestion register-payee-suggestion-active"
                      : "register-payee-suggestion"
                  }
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectSuggestion(
                      suggestion.value,
                      suggestion.metadata?.payeeId,
                    );
                  }}
                  role="option"
                  aria-selected={index === highlightedIndex}
                >
                  <span className="register-autocomplete-primary">
                    {isTransfer ? (
                      <span className="register-autocomplete-icon">↔</span>
                    ) : null}
                    <span>{getPayeeSuggestionText(suggestion)}</span>
                  </span>
                  {isTransfer ? null : (
                    <small>
                      {suggestion.metadata?.label ?? suggestion.label}
                    </small>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CategoryInput({
  value,
  onChange,
  categoryOptions,
  includeSplitOption = true,
}: {
  value: string;
  onChange: (value: string) => void;
  categoryOptions: BudgetCategoryOption[];
  includeSplitOption?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const autocompleteOptions = useMemo((): Array<
    AutocompleteOption<{
      label: string;
      groupName?: string;
      type: "category" | "special";
    }>
  > => {
    const categorySuggestions = categoryOptions.map((category) => ({
      id: category.id,
      value: category.name,
      label: category.groupName,
      metadata: {
        label: category.groupName,
        groupName: category.groupName,
        type: "category" as const,
      },
    }));

    const splitSuggestion = includeSplitOption
      ? [
          {
            id: "__split",
            value: SPLIT_CATEGORY_LABEL,
            label: "Special",
            metadata: { label: "Special", type: "special" as const },
            ranking: { priority: 0 },
          },
        ]
      : [];

    return [...splitSuggestion, ...categorySuggestions];
  }, [categoryOptions, includeSplitOption]);

  const suggestions = useMemo(
    () =>
      rankAutocompleteOptions({
        inputValue: value,
        options: autocompleteOptions,
        maxResults: 8,
        normalise: normaliseCategoryName,
      }),
    [autocompleteOptions, value],
  );

  const highlightedSuggestion =
    suggestions[
      Math.min(highlightedIndex, Math.max(suggestions.length - 1, 0))
    ];
  const ghostCompletion = getAutocompleteCompletion(
    value,
    highlightedSuggestion?.value,
  );
  const shouldShowSuggestions = isOpen && suggestions.length > 0;
  const shouldShowGhost = shouldShowSuggestions && Boolean(ghostCompletion);
  const { anchorRef, popupStyle } = useRegisterAutocompletePopupStyle(
    shouldShowSuggestions,
  );

  function selectSuggestion(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
    setHighlightedIndex(0);
  }

  function acceptHighlightedSuggestion() {
    if (!highlightedSuggestion) {
      return false;
    }

    selectSuggestion(highlightedSuggestion.value);
    return true;
  }

  return (
    <div className="register-payee-autocomplete">
      <input
        ref={anchorRef}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;

          onChange(nextValue);
          setIsOpen(nextValue.trim().length > 0);
          setHighlightedIndex(0);
        }}
        onFocus={() => setIsOpen(false)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Tab" && !event.shiftKey && shouldShowGhost) {
            acceptHighlightedSuggestion();
            return;
          }

          if (event.key === "ArrowRight" && shouldShowGhost) {
            const input = event.currentTarget;
            const cursorAtEnd =
              input.selectionStart === value.length &&
              input.selectionEnd === value.length;

            if (cursorAtEnd) {
              event.preventDefault();
              acceptHighlightedSuggestion();
              return;
            }
          }

          if (event.key === "ArrowDown" && suggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex(
              (current) => (current + 1) % suggestions.length,
            );
            return;
          }

          if (event.key === "ArrowUp" && suggestions.length > 0) {
            event.preventDefault();
            setIsOpen(true);
            setHighlightedIndex((current) =>
              current === 0 ? suggestions.length - 1 : current - 1,
            );
            return;
          }

          if (event.key === "Enter" && shouldShowSuggestions) {
            event.preventDefault();
            acceptHighlightedSuggestion();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
          }
        }}
        placeholder="Category"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shouldShowSuggestions}
      />

      {shouldShowGhost ? (
        <div className="register-payee-ghost" aria-hidden="true">
          <span className="register-payee-ghost-typed">{value}</span>
          <span>{ghostCompletion}</span>
        </div>
      ) : null}

      {shouldShowSuggestions ? (
        <div
          className="register-payee-suggestions register-autocomplete-popup register-category-suggestions"
          role="listbox"
          style={popupStyle}
        >
          {suggestions.map((suggestion, index) => {
            const section = getCategorySuggestionSection(suggestion);
            const previousSection =
              index > 0
                ? getCategorySuggestionSection(suggestions[index - 1])
                : null;
            const showSection = section !== previousSection;

            return (
              <div
                key={suggestion.id}
                className="register-autocomplete-suggestion-block"
              >
                {showSection ? (
                  <div className="register-autocomplete-section-heading">
                    {section}
                  </div>
                ) : null}

                <button
                  type="button"
                  className={
                    index === highlightedIndex
                      ? "register-payee-suggestion register-payee-suggestion-active"
                      : "register-payee-suggestion"
                  }
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectSuggestion(suggestion.value);
                  }}
                  role="option"
                  aria-selected={index === highlightedIndex}
                >
                  <span className="register-autocomplete-primary">
                    {suggestion.value}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SplitEditor({
  splitLines,
  setSplitLines,
  categoryOptions,
  parentOutflow,
  parentInflow,
  currencyCode,
  visibleColumnIds,
  rowStyle,
  layoutMode,
  children,
}: {
  splitLines: SplitLineDraft[];
  setSplitLines: (
    updater: (current: SplitLineDraft[]) => SplitLineDraft[],
  ) => void;
  categoryOptions: BudgetCategoryOption[];
  parentOutflow: number;
  parentInflow: number;
  currencyCode: string;
  visibleColumnIds: readonly RegisterColumnId[];
  rowStyle: CSSProperties;
  layoutMode: RegisterLayoutMode;
  children?: ReactNode;
}) {
  if (splitLines.length === 0) {
    return null;
  }

  const totals = totalsFromSplitDrafts(splitLines);
  const balanceStatus = getSplitBalanceStatus({
    parentOutflow,
    parentInflow,
    splitOutflow: totals.outflow,
    splitInflow: totals.inflow,
  });
  const visibleSplitInputColumns = visibleColumnIds.filter((columnId) =>
    ["category", "memo", "outflow", "inflow"].includes(columnId),
  );
  const splitRemoveColumn = visibleSplitInputColumns[0] ?? "category";
  const balanceLabelColumn: RegisterColumnId = visibleColumnIds.includes(
    "checkNumber",
  )
    ? "checkNumber"
    : visibleColumnIds.includes("memo")
      ? "memo"
      : visibleColumnIds.includes("category")
        ? "category"
        : visibleColumnIds.includes("outflow")
          ? "outflow"
          : "inflow";

  function renderSplitRemoveButton(line: SplitLineDraft) {
    return (
      <button
        className="register-split-remove-button"
        type="button"
        aria-label="Remove split line"
        title="Remove split line"
        onClick={() =>
          setSplitLines((current) =>
            current.filter((item) => item.id !== line.id),
          )
        }
      >
        ×
      </button>
    );
  }

  function renderWithOptionalRemove(
    columnId: RegisterColumnId,
    line: SplitLineDraft,
    child: ReactNode,
  ) {
    if (columnId !== splitRemoveColumn) {
      return child;
    }

    return (
      <div className="register-split-cell-with-remove" key={columnId}>
        {renderSplitRemoveButton(line)}
        {child}
      </div>
    );
  }

  function addSplitOnTab(
    event: KeyboardEvent<HTMLInputElement>,
    line: SplitLineDraft,
  ) {
    if (
      event.key !== "Tab" ||
      event.shiftKey ||
      line.id !== splitLines[splitLines.length - 1]?.id
    ) {
      return;
    }

    const hasAmount =
      parseRegisterMoney(line.outflow) > 0 || parseRegisterMoney(line.inflow) > 0;

    if (!hasAmount) {
      return;
    }

    setSplitLines((current) => [...current, createSplitLineDraft()]);
  }

  function renderSplitCell(columnId: RegisterColumnId, line: SplitLineDraft) {
    if (columnId === "category") {
      return renderWithOptionalRemove(
        columnId,
        line,
        <CategoryInput
          value={line.category}
          onChange={(value) =>
            setSplitLines((current) =>
              current.map((item) =>
                item.id === line.id
                  ? {
                      ...item,
                      category: value,
                      categoryId: findCategoryOption(value, categoryOptions)
                        ?.id,
                    }
                  : item,
              ),
            )
          }
          categoryOptions={categoryOptions}
          includeSplitOption={false}
        />,
      );
    }

    if (columnId === "memo") {
      return renderWithOptionalRemove(
        columnId,
        line,
        <input
          key={columnId}
          value={line.memo}
          onChange={(event) =>
            setSplitLines((current) =>
              current.map((item) =>
                item.id === line.id
                  ? { ...item, memo: event.target.value }
                  : item,
              ),
            )
          }
          placeholder="Split memo"
        />,
      );
    }

    if (columnId === "outflow") {
      return renderWithOptionalRemove(
        columnId,
        line,
        <input
          className="register-money-input"
          key={columnId}
          value={line.outflow}
          onChange={(event) =>
            setSplitLines((current) =>
              current.map((item) =>
                item.id === line.id
                  ? { ...item, outflow: event.target.value }
                  : item,
              ),
            )
          }
          placeholder="Outflow"
          inputMode="decimal"
          onKeyDown={(event) => addSplitOnTab(event, line)}
        />,
      );
    }

    if (columnId === "inflow") {
      return renderWithOptionalRemove(
        columnId,
        line,
        <input
          className="register-money-input"
          key={columnId}
          value={line.inflow}
          onChange={(event) =>
            setSplitLines((current) =>
              current.map((item) =>
                item.id === line.id
                  ? { ...item, inflow: event.target.value }
                  : item,
              ),
            )
          }
          placeholder="Inflow"
          inputMode="decimal"
          onKeyDown={(event) => addSplitOnTab(event, line)}
        />,
      );
    }

    return (
      <span
        aria-hidden="true"
        className="register-split-placeholder-cell"
        key={columnId}
      />
    );
  }

  function renderSplitFooterCell(columnId: RegisterColumnId) {
    if (columnId === splitRemoveColumn) {
      return (
        <button
          className="button button-secondary register-split-add-button"
          key={columnId}
          type="button"
          onClick={() =>
            setSplitLines((current) => [...current, createSplitLineDraft()])
          }
        >
          + Add another split
        </button>
      );
    }

    if (columnId === balanceLabelColumn) {
      return (
        <span className="register-split-footer-status" key={columnId}>
          {balanceStatus.isBalanced ? "✓ Balanced" : ""}
        </span>
      );
    }

    return (
      <span
        aria-hidden="true"
        className="register-split-placeholder-cell"
        key={columnId}
      />
    );
  }

  function renderAssignCell(columnId: RegisterColumnId) {
    if (columnId === balanceLabelColumn) {
      return (
        <span className="register-split-balance-label" key={columnId}>
          Amount to assign
        </span>
      );
    }

    if (columnId === "outflow") {
      return (
        <strong
          className="register-split-assign-amount register-split-assign-outflow"
          key={columnId}
        >
          {balanceStatus.activeSide === "outflow"
            ? formatMoney(
                balanceStatus.isBalanced
                  ? 0
                  : -Math.abs(balanceStatus.remaining),
                currencyCode,
              )
            : ""}
        </strong>
      );
    }

    if (columnId === "inflow") {
      return (
        <strong
          className={[
            "register-split-assign-amount register-split-assign-inflow",
            balanceStatus.isOverAssigned ? "register-split-assign-over" : "",
          ].join(" ")}
          key={columnId}
        >
          {balanceStatus.activeSide === "inflow"
            ? formatMoney(
                balanceStatus.isBalanced ? 0 : balanceStatus.remaining,
                currencyCode,
              )
            : ""}
        </strong>
      );
    }

    return (
      <span
        aria-hidden="true"
        className="register-split-placeholder-cell"
        key={columnId}
      />
    );
  }

  function renderActionCell(columnId: RegisterColumnId) {
    if (columnId === "outflow") {
      return children ? (
        <div className="register-split-commit-actions" key={columnId}>
          {children}
        </div>
      ) : (
        <span
          aria-hidden="true"
          className="register-split-placeholder-cell"
          key={columnId}
        />
      );
    }

    if (columnId === "inflow") {
      return null;
    }

    return (
      <span
        aria-hidden="true"
        className="register-split-placeholder-cell"
        key={columnId}
      />
    );
  }

  if (layoutMode === "compact") {
    return (
      <div
        className={[
          "register-split-editor register-split-editor-compact",
          balanceStatus.isBalanced
            ? "register-split-editor-balanced"
            : balanceStatus.isOverAssigned
              ? "register-split-editor-over"
              : "register-split-editor-unbalanced",
        ].join(" ")}
      >
        <div className="register-split-compact-header">
          <strong>Split transaction</strong>
          <span>{splitLines.length} lines</span>
        </div>

        {splitLines.map((line) => (
          <div className="register-split-compact-line" key={line.id}>
            {renderSplitRemoveButton(line)}

            <div className="register-split-compact-main">
              <CategoryInput
                value={line.category}
                onChange={(value) =>
                  setSplitLines((current) =>
                    current.map((item) =>
                      item.id === line.id
                        ? {
                            ...item,
                            category: value,
                            categoryId: findCategoryOption(
                              value,
                              categoryOptions,
                            )?.id,
                          }
                        : item,
                    ),
                  )
                }
                categoryOptions={categoryOptions}
                includeSplitOption={false}
              />

              <input
                value={line.memo}
                onChange={(event) =>
                  setSplitLines((current) =>
                    current.map((item) =>
                      item.id === line.id
                        ? { ...item, memo: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Split memo"
              />
            </div>

            <div className="register-split-compact-money">
              <input
                className="register-money-input"
                value={line.outflow}
                onChange={(event) =>
                  setSplitLines((current) =>
                    current.map((item) =>
                      item.id === line.id
                        ? { ...item, outflow: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Outflow"
                inputMode="decimal"
                onKeyDown={(event) => addSplitOnTab(event, line)}
              />

              <input
                className="register-money-input"
                value={line.inflow}
                onChange={(event) =>
                  setSplitLines((current) =>
                    current.map((item) =>
                      item.id === line.id
                        ? { ...item, inflow: event.target.value }
                        : item,
                    ),
                  )
                }
                placeholder="Inflow"
                inputMode="decimal"
                onKeyDown={(event) => addSplitOnTab(event, line)}
              />
            </div>
          </div>
        ))}

        <div className="register-split-compact-footer">
          <div className="register-split-compact-footer-top">
            <button
              className="button button-secondary register-split-add-button"
              type="button"
              onClick={() =>
                setSplitLines((current) => [...current, createSplitLineDraft()])
              }
            >
              + Add another split
            </button>

            <span className="register-split-footer-status">
              {balanceStatus.isBalanced ? "✓ Balanced" : ""}
            </span>
          </div>

          <div className="register-split-compact-assign" aria-live="polite">
            <span className="register-split-balance-label">
              Amount to assign
            </span>
            <strong className="register-split-assign-amount register-split-assign-outflow">
              {balanceStatus.activeSide === "outflow"
                ? formatMoney(
                    balanceStatus.isBalanced
                      ? 0
                      : -Math.abs(balanceStatus.remaining),
                    currencyCode,
                  )
                : ""}
            </strong>
            <strong
              className={[
                "register-split-assign-amount register-split-assign-inflow",
                balanceStatus.isOverAssigned
                  ? "register-split-assign-over"
                  : "",
              ].join(" ")}
            >
              {balanceStatus.activeSide === "inflow"
                ? formatMoney(
                    balanceStatus.isBalanced ? 0 : balanceStatus.remaining,
                    currencyCode,
                  )
                : ""}
            </strong>
          </div>

          {children ? (
            <div className="register-split-commit-actions register-split-compact-actions">
              {children}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "register-split-editor register-split-allocation-panel",
        balanceStatus.isBalanced
          ? "register-split-editor-balanced"
          : balanceStatus.isOverAssigned
            ? "register-split-editor-over"
            : "register-split-editor-unbalanced",
      ].join(" ")}
    >
      <div className="register-split-allocation-header">
        <strong>Split allocation</strong>
        <span className="register-split-footer-status">
          {balanceStatus.isBalanced ? "✓ Balanced" : ""}
        </span>
      </div>

      <div
        className="register-split-allocation-grid register-split-allocation-grid-heading"
        aria-hidden="true"
      >
        <span>Remove</span>
        <span>Category</span>
        <span>Memo</span>
        <span>Outflow</span>
        <span>Inflow</span>
      </div>

      {splitLines.map((line) => (
        <div
          className="register-split-allocation-grid register-split-allocation-line"
          key={line.id}
        >
          <div className="register-split-allocation-remove">
            {renderSplitRemoveButton(line)}
          </div>

          <div className="register-split-allocation-category">
            <CategoryInput
              value={line.category}
              onChange={(value) =>
                setSplitLines((current) =>
                  current.map((item) =>
                    item.id === line.id
                      ? {
                          ...item,
                          category: value,
                          categoryId: findCategoryOption(value, categoryOptions)
                            ?.id,
                        }
                      : item,
                  ),
                )
              }
              categoryOptions={categoryOptions}
              includeSplitOption={false}
            />
          </div>

          <input
            className="register-split-allocation-memo"
            value={line.memo}
            onChange={(event) =>
              setSplitLines((current) =>
                current.map((item) =>
                  item.id === line.id
                    ? { ...item, memo: event.target.value }
                    : item,
                ),
              )
            }
            placeholder="Split memo"
          />

          <input
            className="register-money-input register-split-allocation-amount register-split-allocation-outflow"
            value={line.outflow}
            onChange={(event) =>
              setSplitLines((current) =>
                current.map((item) =>
                  item.id === line.id
                    ? { ...item, outflow: event.target.value }
                    : item,
                ),
              )
            }
            placeholder="Outflow"
            inputMode="decimal"
            onKeyDown={(event) => addSplitOnTab(event, line)}
          />

          <input
            className="register-money-input register-split-allocation-amount register-split-allocation-inflow"
            value={line.inflow}
            onChange={(event) =>
              setSplitLines((current) =>
                current.map((item) =>
                  item.id === line.id
                    ? { ...item, inflow: event.target.value }
                    : item,
                ),
              )
            }
            placeholder="Inflow"
            inputMode="decimal"
            onKeyDown={(event) => addSplitOnTab(event, line)}
          />
        </div>
      ))}

      <div className="register-split-allocation-footer">
        <button
          className="button button-secondary register-split-add-button"
          type="button"
          onClick={() =>
            setSplitLines((current) => [...current, createSplitLineDraft()])
          }
        >
          + Add another split
        </button>

        <div className="register-split-allocation-balance" aria-live="polite">
          <span className="register-split-balance-label">Amount to assign</span>
          <strong className="register-split-assign-amount register-split-assign-outflow">
            {balanceStatus.activeSide === "outflow"
              ? formatMoney(
                  balanceStatus.isBalanced
                    ? 0
                    : -Math.abs(balanceStatus.remaining),
                  currencyCode,
                )
              : ""}
          </strong>
          <strong
            className={[
              "register-split-assign-amount register-split-assign-inflow",
              balanceStatus.isOverAssigned ? "register-split-assign-over" : "",
            ].join(" ")}
          >
            {balanceStatus.activeSide === "inflow"
              ? formatMoney(
                  balanceStatus.isBalanced ? 0 : balanceStatus.remaining,
                  currencyCode,
                )
              : ""}
          </strong>
        </div>
      </div>

      {children ? (
        <div className="register-split-commit-actions register-split-allocation-actions">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function TransactionEntryRow({
  initialDate,
  onSave,
  onSaveAndAddAnother,
  onCancel,
  categoryOptions,
  transferAccounts,
  payeeOptions,
  currencyCode,
  visibleColumns,
  visibleColumnIds,
  rowStyle,
  layoutMode,
}: {
  initialDate: string;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  currencyCode: string;
  visibleColumns: Set<RegisterColumnId>;
  visibleColumnIds: readonly RegisterColumnId[];
  rowStyle: CSSProperties;
  layoutMode: RegisterLayoutMode;
  onSave: (input: NewRegisterTransactionInput) => void;
  onSaveAndAddAnother: (input: NewRegisterTransactionInput) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [payee, setPayee] = useState("");
  const [payeeId, setPayeeId] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState("");
  const [memo, setMemo] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [outflow, setOutflow] = useState("");
  const [inflow, setInflow] = useState("");
  const [splitLines, setSplitLines] = useState<SplitLineDraft[]>([]);

  function buildInput(): NewRegisterTransactionInput | null {
    return buildNewRegisterTransactionInput({
      date,
      payee,
      payeeId,
      category,
      memo,
      checkNumber,
      outflow,
      inflow,
      splitLines,
      categoryOptions,
    });
  }

  function clearForNext() {
    setPayee("");
    setPayeeId(undefined);
    setCategory("");
    setMemo("");
    setCheckNumber("");
    setOutflow("");
    setInflow("");
    setSplitLines([]);
  }

  function handleCategoryChange(value: string) {
    if (isSplitCategoryValue(value)) {
      setCategory(SPLIT_CATEGORY_LABEL);
      setSplitLines((current) =>
        current.length > 0
          ? current
          : [createSplitLineDraft(), createSplitLineDraft()],
      );
      return;
    }

    setCategory(value);
  }

  function toggleSplitEditor() {
    setSplitLines((current) => {
      if (current.length > 0) {
        setCategory((currentCategory) =>
          isSplitCategoryValue(currentCategory) ? "" : currentCategory,
        );
        return [];
      }

      setCategory(SPLIT_CATEGORY_LABEL);
      return [createSplitLineDraft(), createSplitLineDraft()];
    });
  }

  function save() {
    const input = buildInput();

    if (!input) {
      return;
    }

    onSave(input);
  }

  function saveAndAddAnother() {
    const input = buildInput();

    if (!input) {
      return;
    }

    onSaveAndAddAnother(input);
    clearForNext();
  }

  return (
    <>
      <div
        className="register-entry-row-active register-entry-row-workflow"
        style={rowStyle}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onCancel();
          }
        }}
      >
        {visibleColumnIds.map((columnId) => {
          if (!isRegisterEntryInputColumn(columnId)) {
            return (
              <span
                aria-hidden="true"
                className="register-entry-placeholder-cell"
                key={columnId}
              />
            );
          }

          if (columnId === "date") {
            return (
              <RegisterDateField
                key={columnId}
                value={date}
                onChange={setDate}
              />
            );
          }

          if (columnId === "payee") {
            return (
              <PayeeInput
                key={columnId}
                value={payee}
                onChange={(value) => {
                  setPayee(value);
                  setPayeeId(undefined);
                }}
                onPayeeIdChange={setPayeeId}
                transferAccounts={transferAccounts}
                payeeOptions={payeeOptions}
                autoFocus
              />
            );
          }

          if (columnId === "category") {
            return (
              <CategoryInput
                key={columnId}
                value={category}
                onChange={handleCategoryChange}
                categoryOptions={categoryOptions}
              />
            );
          }

          if (columnId === "memo") {
            return (
              <input
                key={columnId}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="Memo"
              />
            );
          }

          if (columnId === "checkNumber") {
            return (
              <input
                key={columnId}
                value={checkNumber}
                onChange={(event) => setCheckNumber(event.target.value)}
                placeholder="Check #"
              />
            );
          }

          if (columnId === "outflow") {
            return (
              <input
                className="register-money-input"
                key={columnId}
                value={outflow}
                onChange={(event) => setOutflow(event.target.value)}
                placeholder="Outflow"
                inputMode="decimal"
              />
            );
          }

          if (columnId === "inflow") {
            return (
              <input
                className="register-money-input"
                key={columnId}
                value={inflow}
                onChange={(event) => setInflow(event.target.value)}
                placeholder="Inflow"
                inputMode="decimal"
              />
            );
          }

          return null;
        })}
      </div>

      {splitLines.length === 0 ? (
        <div className="register-entry-actions-panel">
          <button
            className="button button-secondary"
            type="button"
            onClick={toggleSplitEditor}
          >
            Split
          </button>
          <div className="register-entry-actions register-entry-commit-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={saveAndAddAnother}
            >
              Save & add another
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={save}
            >
              Save
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <SplitEditor
        splitLines={splitLines}
        setSplitLines={setSplitLines}
        categoryOptions={categoryOptions}
        parentOutflow={parseRegisterMoney(outflow)}
        parentInflow={parseRegisterMoney(inflow)}
        currencyCode={currencyCode}
        visibleColumnIds={visibleColumnIds}
        rowStyle={rowStyle}
        layoutMode={layoutMode}
      >
        <button
          className="button button-primary"
          type="button"
          onClick={saveAndAddAnother}
          disabled={
            !isSplitDraftBalanced(
              parseRegisterMoney(outflow),
              parseRegisterMoney(inflow),
              splitLines,
            )
          }
        >
          Save & add another
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={save}
          disabled={
            !isSplitDraftBalanced(
              parseRegisterMoney(outflow),
              parseRegisterMoney(inflow),
              splitLines,
            )
          }
        >
          Save
        </button>
        <button
          className="button button-secondary"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </SplitEditor>
    </>
  );
}

export function TransactionEditRow({
  transaction,
  onSave,
  onCancel,
  onManageTransactionAttachments,
  categoryOptions,
  transferAccounts,
  payeeOptions,
  currencyCode,
  visibleColumns,
  visibleColumnIds,
  rowStyle,
  layoutMode,
}: {
  transaction: RegisterTransactionView;
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
  currencyCode: string;
  onSave: (input: {
    id: string;
    date: string;
    flag?: TransactionFlag;
    payee: string;
    payeeId?: string;
    category: string;
    categoryId?: string;
    memo?: string;
    checkNumber?: string;
    inflow: number;
    outflow: number;
    splitLines?: RegisterSplitLineView[];
  }) => void;
  onCancel: () => void;
  onManageTransactionAttachments: (transactionId: string) => void;
  visibleColumns: Set<RegisterColumnId>;
  visibleColumnIds: readonly RegisterColumnId[];
  rowStyle: CSSProperties;
  layoutMode: RegisterLayoutMode;
}) {
  const [date, setDate] = useState(transaction.date);
  const [flag, setFlag] = useState<TransactionFlag>(transaction.flag);
  const [payee, setPayee] = useState(transaction.payee);
  const [payeeId, setPayeeId] = useState<string | undefined>(
    transaction.payeeId,
  );
  const [category, setCategory] = useState(transaction.category);
  const [memo, setMemo] = useState(transaction.memo ?? "");
  const [checkNumber, setCheckNumber] = useState(transaction.checkNumber ?? "");
  const [outflow, setOutflow] = useState(
    transaction.outflow ? transaction.outflow.toFixed(2) : "",
  );
  const [inflow, setInflow] = useState(
    transaction.inflow ? transaction.inflow.toFixed(2) : "",
  );
  const [splitLines, setSplitLines] = useState<SplitLineDraft[]>(
    splitDraftsFromTransaction(transaction),
  );

  function handleCategoryChange(value: string) {
    if (isSplitCategoryValue(value)) {
      setCategory(SPLIT_CATEGORY_LABEL);
      setSplitLines((current) =>
        current.length > 0
          ? current
          : [createSplitLineDraft(), createSplitLineDraft()],
      );
      return;
    }

    setCategory(value);
  }

  function toggleSplitEditor() {
    setSplitLines((current) => {
      if (current.length > 0) {
        setCategory((currentCategory) =>
          isSplitCategoryValue(currentCategory) ? "" : currentCategory,
        );
        return [];
      }

      setCategory(SPLIT_CATEGORY_LABEL);
      return [createSplitLineDraft(), createSplitLineDraft()];
    });
  }

  function save() {
    const input = buildUpdateRegisterTransactionInput({
      id: transaction.id,
      date,
      flag,
      payee,
      payeeId,
      category,
      memo,
      checkNumber,
      outflow,
      inflow,
      splitLines,
      categoryOptions,
    });

    if (!input) {
      return;
    }

    onSave(input);
  }

  const outflowColumnIndex = visibleColumnIds.indexOf("outflow");
  const inflowColumnIndex = visibleColumnIds.indexOf("inflow");
  const editActionGridColumn =
    outflowColumnIndex >= 0 && inflowColumnIndex >= outflowColumnIndex
      ? `${outflowColumnIndex + 1} / ${inflowColumnIndex + 2}`
      : "1 / -1";

  return (
    <>
      <div
        className="register-row register-row-editing"
        style={rowStyle}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !(event.target instanceof HTMLTextAreaElement)
          ) {
            save();
          }

          if (event.key === "Escape") {
            onCancel();
          }
        }}
      >
        <span className="register-checkbox" aria-hidden="true" />
        <RegisterDateField value={date} onChange={setDate} autoFocus />
        {isRegisterColumnVisible("flag", visibleColumns) ? (
          <InlineFlagPicker value={flag} onChange={setFlag} />
        ) : null}
        {isRegisterColumnVisible("attachments", visibleColumns) ? (
          <AttachmentIndicator
            count={transaction.attachmentCount}
            onClick={() => onManageTransactionAttachments(transaction.id)}
          />
        ) : null}
        <PayeeInput
          value={payee}
          onChange={(value) => {
            setPayee(value);
            setPayeeId(undefined);
          }}
          onPayeeIdChange={setPayeeId}
          transferAccounts={transferAccounts}
          payeeOptions={payeeOptions}
        />
        <CategoryInput
          value={category}
          onChange={handleCategoryChange}
          categoryOptions={categoryOptions}
        />
        {isRegisterColumnVisible("memo", visibleColumns) ? (
          <input
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="Memo"
          />
        ) : null}
        {isRegisterColumnVisible("checkNumber", visibleColumns) ? (
          <input
            value={checkNumber}
            onChange={(event) => setCheckNumber(event.target.value)}
            placeholder="Check #"
          />
        ) : null}
        <input
          className="register-money-input"
          value={outflow}
          onChange={(event) => setOutflow(event.target.value)}
          placeholder="Outflow"
          inputMode="decimal"
        />
        <input
          className="register-money-input"
          value={inflow}
          onChange={(event) => setInflow(event.target.value)}
          placeholder="Inflow"
          inputMode="decimal"
        />
      </div>
      {splitLines.length > 0 ? (
        <SplitEditor
          splitLines={splitLines}
          setSplitLines={setSplitLines}
          categoryOptions={categoryOptions}
          parentOutflow={parseRegisterMoney(outflow)}
          parentInflow={parseRegisterMoney(inflow)}
          currencyCode={currencyCode}
          visibleColumnIds={visibleColumnIds}
          rowStyle={rowStyle}
          layoutMode={layoutMode}
        >
          <button
            className="button button-primary"
            type="button"
            onClick={save}
            disabled={
              !isSplitDraftBalanced(
                parseRegisterMoney(outflow),
                parseRegisterMoney(inflow),
                splitLines,
              )
            }
          >
            Save
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
        </SplitEditor>
      ) : (
        <div className="register-edit-actions-panel" style={rowStyle}>
          <div
            className="register-edit-actions register-edit-commit-actions"
            style={{ gridColumn: editActionGridColumn }}
          >
            <button
              className="button button-primary"
              type="button"
              onClick={save}
            >
              Save
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

