import { ChevronDown, ChevronRight, CornerDownRight, Paperclip, Plus, Tag } from "lucide-react";
import { memo, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { RegisterLayoutMode } from "../registerLayoutMode";
import type { RegisterTransactionView } from "../accountRegisterTypes";
import { formatDateForDisplay } from "../../settings/dateFormatting";
import { useDateFormatPreference } from "../../settings/useDateFormatPreference";
import { isUncategorisedRegisterTransaction } from "../registerUncategorised";
import { CategoryLabel } from "../../icons/CategoryIcon";
import type { TransactionTagDefinition } from "../../tags/transactionTagTypes";

const EMPTY_TRANSACTION_TAG_IDS: readonly string[] = Object.freeze([]);

export type RegisterColumnId =
  | "select"
  | "date"
  | "tags"
  | "attachments"
  | "payee"
  | "category"
  | "memo"
  | "checkNumber"
  | "amount"
  | "outflow"
  | "inflow"
  | "runningBalance"
  | "status"
  | "actions";

function isRegisterColumnVisible(
  column: RegisterColumnId,
  visibleColumns: Set<RegisterColumnId>,
) {
  return visibleColumns.has(column);
}

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}


function getSignedTransactionAmount(transaction: RegisterTransactionView): number {
  if (transaction.inflow > 0) {
    return transaction.inflow;
  }

  if (transaction.outflow > 0) {
    return -transaction.outflow;
  }

  return 0;
}

function formatSignedMoney(value: number, currencyCode: string) {
  if (value === 0) {
    return "";
  }

  const formatted = formatMoney(Math.abs(value), currencyCode);
  return value > 0 ? `+${formatted}` : `-${formatted}`;
}

function getSignedAmountClassName(value: number, prefix = "register-money") {
  if (value > 0) {
    return `${prefix} register-inflow`;
  }

  if (value < 0) {
    return `${prefix} register-outflow`;
  }

  return `${prefix} register-amount-neutral`;
}


function TransactionSelectionCheckbox({
  transactionId,
  isSelected,
  onToggleTransactionSelection,
}: {
  transactionId: string;
  isSelected: boolean;
  onToggleTransactionSelection: (transactionId: string) => void;
}) {
  return (
    <input
      className="register-checkbox register-checkbox-input"
      type="checkbox"
      checked={isSelected}
      aria-label={isSelected ? "Deselect transaction" : "Select transaction"}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation();
        onToggleTransactionSelection(transactionId);
      }}
    />
  );
}

function TransactionTagPicker({
  transaction,
  tags,
  onChange,
  onCreateTag,
}: {
  transaction: RegisterTransactionView;
  tags: readonly TransactionTagDefinition[];
  onChange: (tagIds: string[]) => void;
  onCreateTag: (name: string) => TransactionTagDefinition;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draftTagIds, setDraftTagIds] = useState<string[]>(
    transaction.tagIds ?? [],
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const assignedTagIds = transaction.tagIds ?? EMPTY_TRANSACTION_TAG_IDS;
  const assignedTags = tags.filter((tag) => assignedTagIds.includes(tag.id));
  const primaryTag = assignedTags[0];
  const title =
    assignedTags.length > 0
      ? assignedTags.map((tag) => tag.name).join(", ")
      : "No tags";
  const normalisedQuery = query.trim();
  const exactMatch = tags.find(
    (tag) => tag.name.localeCompare(normalisedQuery, undefined, { sensitivity: "accent" }) === 0,
  );
  const filteredTags = normalisedQuery
    ? tags.filter((tag) =>
        tag.name.toLocaleLowerCase().includes(normalisedQuery.toLocaleLowerCase()),
      )
    : tags;
  const canCreateTag = normalisedQuery.length > 0 && !exactMatch;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchInputRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, transaction.id]);

  function openPicker() {
    setDraftTagIds([...assignedTagIds]);
    setQuery("");
    setErrorMessage(null);
    setIsOpen(true);
  }

  function toggleTag(tagId: string) {
    setDraftTagIds((currentTagIds) =>
      currentTagIds.includes(tagId)
        ? currentTagIds.filter((candidate) => candidate !== tagId)
        : [...currentTagIds, tagId],
    );
  }

  function createAndSelectTag() {
    if (!canCreateTag) return;

    try {
      const createdTag = onCreateTag(normalisedQuery);
      setDraftTagIds((currentTagIds) =>
        currentTagIds.includes(createdTag.id)
          ? currentTagIds
          : [...currentTagIds, createdTag.id],
      );
      setQuery("");
      setErrorMessage(null);
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create this tag.",
      );
    }
  }

  function saveTags() {
    onChange(draftTagIds);
    setIsOpen(false);
  }

  return (
    <div
      className="transaction-tag-picker"
      ref={containerRef}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className={
          primaryTag
            ? "transaction-tag-indicator transaction-tag-indicator-assigned"
            : "transaction-tag-indicator"
        }
        style={primaryTag ? { color: `var(--tag-${primaryTag.colour})` } : undefined}
        type="button"
        title={title}
        aria-label={assignedTags.length > 0 ? `Edit tags: ${title}` : "Add tags"}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
          } else {
            openPicker();
          }
        }}
      >
        <Tag size={15} fill={primaryTag ? "currentColor" : "none"} />
        {assignedTags.length > 1 ? (
          <span className="transaction-tag-count">{assignedTags.length}</span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          className="transaction-tag-picker-menu"
          role="dialog"
          aria-label="Edit transaction tags"
        >
          <input
            ref={searchInputRef}
            className="transaction-tag-picker-search"
            type="text"
            value={query}
            placeholder="Search or create tag…"
            aria-label="Search or create tag"
            onChange={(event) => {
              setQuery(event.target.value);
              setErrorMessage(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canCreateTag) {
                event.preventDefault();
                createAndSelectTag();
              }
            }}
          />

          <div className="transaction-tag-picker-results">
            {filteredTags.map((tag) => (
              <label className="transaction-tag-picker-option" key={tag.id}>
                <input
                  type="checkbox"
                  checked={draftTagIds.includes(tag.id)}
                  onChange={() => toggleTag(tag.id)}
                />
                <Tag
                  className="transaction-tag-picker-icon"
                  size={18}
                  style={{ color: `var(--tag-${tag.colour})` }}
                  aria-hidden="true"
                />
                <span>{tag.name}</span>
              </label>
            ))}

            {canCreateTag ? (
              <button
                className="transaction-tag-picker-create"
                type="button"
                onClick={createAndSelectTag}
              >
                <Plus size={16} aria-hidden="true" />
                <span>Create “{normalisedQuery}”</span>
              </button>
            ) : null}

            {filteredTags.length === 0 && !canCreateTag ? (
              <p className="transaction-tag-picker-empty">No matching tags.</p>
            ) : null}
          </div>

          {errorMessage ? (
            <p className="transaction-tag-picker-error" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="transaction-tag-picker-footer">
            <button
              className="button button-primary transaction-tag-picker-save"
              type="button"
              onClick={saveTags}
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function ScheduledTransactionBadge({
  transaction,
}: {
  transaction: RegisterTransactionView;
}) {
  if (!transaction.generatedFromSchedule) {
    return null;
  }

  return (
    <span
      className="register-scheduled-badge"
      title={
        transaction.scheduledOccurrenceDate
          ? `Generated from scheduled transaction due ${transaction.scheduledOccurrenceDate}`
          : "Generated from scheduled transaction"
      }
    >
      <span aria-hidden="true">⏰</span>
      Scheduled
    </span>
  );
}

export function AttachmentIndicator({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  const hasAttachments = count > 0;

  return (
    <button
      className={
        hasAttachments
          ? "attachment-indicator attachment-indicator-present"
          : "attachment-indicator attachment-indicator-empty"
      }
      type="button"
      title={hasAttachments ? "View attachments" : "Add attachment"}
      aria-label={hasAttachments ? "View attachments" : "Add attachment"}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      {hasAttachments ? <Paperclip size={13} /> : null}
    </button>
  );
}

function CategoryDisplay({
  transaction,
  hasSplitLines,
  splitLineCount,
  isSplitExpanded,
  onToggleSplitExpanded,
  onEditCategory,
}: {
  transaction: RegisterTransactionView;
  hasSplitLines: boolean;
  splitLineCount: number;
  isSplitExpanded: boolean;
  onToggleSplitExpanded: (event: MouseEvent<HTMLButtonElement>) => void;
  onEditCategory: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  if (hasSplitLines) {
    return (
      <span className="register-split-category-cell">
        <button
          className="register-split-toggle"
          type="button"
          aria-label={isSplitExpanded ? "Collapse split transaction" : "Expand split transaction"}
          aria-expanded={isSplitExpanded}
          onClick={onToggleSplitExpanded}
        >
          {isSplitExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {`Split (${splitLineCount})`}
      </span>
    );
  }

  if (isUncategorisedRegisterTransaction(transaction)) {
    return (
      <button
        className="register-category-uncategorised-chip"
        type="button"
        title="Choose a category"
        aria-label="Choose a category for this uncategorised transaction"
        onClick={onEditCategory}
      >
        <span aria-hidden="true">⚠</span>
        Uncategorised
      </button>
    );
  }

  return <CategoryLabel categoryName={transaction.category} />;
}

function TransactionStatus({
  transaction,
  onToggleCleared,
}: {
  transaction: RegisterTransactionView;
  onToggleCleared: () => void;
}) {
  if (transaction.reconciled) {
    return (
      <button
        className="register-status register-status-reconciled"
        type="button"
        title="Reconciled"
      >
        R
      </button>
    );
  }

  if (transaction.cleared) {
    return (
      <button
        className="register-status register-status-cleared"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleCleared();
        }}
        title="Cleared"
      >
        C
      </button>
    );
  }

  return (
    <button
      className="register-status register-status-empty"
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggleCleared();
      }}
      title="Mark cleared"
    />
  );
}

interface TransactionRowRendererProps {
  transaction: RegisterTransactionView;
  currencyCode: string;
  dateFormat: ReturnType<typeof useDateFormatPreference>;
  isSelected: boolean;
  onSelectTransaction: (transactionId: string, event: MouseEvent<HTMLElement>) => void;
  onToggleTransactionSelection: (transactionId: string) => void;
  onEditTransaction: (transactionId: string) => void;
  onEditTransactionCategory: (transactionId: string) => void;
  onToggleClearedTransaction: (transactionId: string) => void;
  onManageTransactionAttachments: (transactionId: string) => void;
  tags: readonly TransactionTagDefinition[];
  onUpdateTransactionTags: (
    transaction: RegisterTransactionView,
    tagIds: string[],
  ) => void;
  onCreateTransactionTag: (name: string) => TransactionTagDefinition;
  onOpenContextMenu: (
    transactionId: string,
    event: MouseEvent<HTMLElement>,
  ) => void;
  visibleColumns: Set<RegisterColumnId>;
  rowStyle: CSSProperties;
}

interface TransactionRowProps extends TransactionRowRendererProps {
  layoutMode: RegisterLayoutMode;
}

const DesktopTransactionRow = memo(function DesktopTransactionRow({
  transaction,
  currencyCode,
  dateFormat,
  isSelected,
  onSelectTransaction,
  onToggleTransactionSelection,
  onEditTransaction,
  onEditTransactionCategory,
  onToggleClearedTransaction,
  onManageTransactionAttachments,
  tags,
  onUpdateTransactionTags,
  onCreateTransactionTag,
  onOpenContextMenu,
  visibleColumns,
  rowStyle,
}: TransactionRowRendererProps) {
  const [isSplitExpanded, setIsSplitExpanded] = useState(false);
  const splitLines = transaction.splitLines ?? [];
  const hasSplitLines = splitLines.length > 0;
  const signedAmount = getSignedTransactionAmount(transaction);
  const isUncategorised = isUncategorisedRegisterTransaction(transaction);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={[
          "register-row",
          isSelected ? "register-row-selected" : "",
          isUncategorised ? "register-row-uncategorised" : "",
        ].filter(Boolean).join(" ")}
        onClick={(event) => onSelectTransaction(transaction.id, event)}
        onDoubleClick={() => onEditTransaction(transaction.id)}
        onContextMenu={(event) => onOpenContextMenu(transaction.id, event)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onEditTransaction(transaction.id);
          }
        }}
        style={rowStyle}
      >
        <TransactionSelectionCheckbox
          transactionId={transaction.id}
          isSelected={isSelected}
          onToggleTransactionSelection={onToggleTransactionSelection}
        />
        <span>{formatDateForDisplay(transaction.date, dateFormat)}</span>
        {isRegisterColumnVisible("tags", visibleColumns) ? (
          <TransactionTagPicker
            transaction={transaction}
            tags={tags}
            onChange={(tagIds) => onUpdateTransactionTags(transaction, tagIds)}
            onCreateTag={onCreateTransactionTag}
          />
        ) : null}
        {isRegisterColumnVisible("attachments", visibleColumns) ? (
          <AttachmentIndicator
            count={transaction.attachmentCount}
            onClick={() => onManageTransactionAttachments(transaction.id)}
          />
        ) : null}

        <div className="register-payee-cell">
          <strong>{transaction.payee}</strong>
          <ScheduledTransactionBadge transaction={transaction} />
        </div>

        <CategoryDisplay
          transaction={transaction}
          hasSplitLines={hasSplitLines}
          splitLineCount={splitLines.length}
          isSplitExpanded={isSplitExpanded}
          onToggleSplitExpanded={(event) => {
            event.stopPropagation();
            setIsSplitExpanded((expanded) => !expanded);
          }}
          onEditCategory={(event) => {
            event.stopPropagation();
            onEditTransactionCategory(transaction.id);
          }}
        />
        {isRegisterColumnVisible("memo", visibleColumns) ? (
          <span className="register-memo-cell">{transaction.memo ?? ""}</span>
        ) : null}
        {isRegisterColumnVisible("checkNumber", visibleColumns) ? (
          <span className="register-check-number-cell">
            {transaction.checkNumber ?? ""}
          </span>
        ) : null}

        {isRegisterColumnVisible("amount", visibleColumns) ? (
          <span className={getSignedAmountClassName(signedAmount)}>
            {formatSignedMoney(signedAmount, currencyCode)}
          </span>
        ) : null}

        {isRegisterColumnVisible("runningBalance", visibleColumns) ? (
          <strong className="register-balance">
            {formatMoney(transaction.runningBalance, currencyCode)}
          </strong>
        ) : null}

        {isRegisterColumnVisible("status", visibleColumns) ? (
          <TransactionStatus
            transaction={transaction}
            onToggleCleared={() => onToggleClearedTransaction(transaction.id)}
          />
        ) : null}
      </div>

      {hasSplitLines && isSplitExpanded
        ? splitLines.map((line) => (
            <button
              className="register-row register-split-readonly-row"
              type="button"
              key={line.id}
              style={rowStyle}
              onClick={(event) => onSelectTransaction(transaction.id, event)}
              onDoubleClick={() => onEditTransaction(transaction.id)}
            >
              <span className="register-split-readonly-spacer" aria-hidden="true" />
              <span />
              {isRegisterColumnVisible("tags", visibleColumns) ? <span /> : null}
              {isRegisterColumnVisible("attachments", visibleColumns) ? <span /> : null}
              <span className="register-split-readonly-payee" aria-hidden="true" />
              <span className="register-split-readonly-category">
                <CornerDownRight size={13} aria-hidden="true" />
                <CategoryLabel categoryName={line.category} />
              </span>
              {isRegisterColumnVisible("memo", visibleColumns) ? (
                <span className="register-memo-cell">{line.memo ?? ""}</span>
              ) : null}
              {isRegisterColumnVisible("checkNumber", visibleColumns) ? <span /> : null}
              {isRegisterColumnVisible("amount", visibleColumns) ? (
                <span
                  className={getSignedAmountClassName(
                    line.inflow ? line.inflow : line.outflow ? -line.outflow : 0,
                  )}
                >
                  {formatSignedMoney(
                    line.inflow ? line.inflow : line.outflow ? -line.outflow : 0,
                    currencyCode,
                  )}
                </span>
              ) : null}
              {isRegisterColumnVisible("runningBalance", visibleColumns) ? <span className="register-balance">-</span> : null}
              {isRegisterColumnVisible("status", visibleColumns) ? <span /> : null}
            </button>
          ))
        : null}
    </>
  );
});

const CompactTransactionRow = memo(function CompactTransactionRow({
  transaction,
  currencyCode,
  dateFormat,
  isSelected,
  onSelectTransaction,
  onToggleTransactionSelection,
  onEditTransaction,
  onEditTransactionCategory,
  onToggleClearedTransaction,
  onManageTransactionAttachments,
  tags,
  onUpdateTransactionTags,
  onCreateTransactionTag,
  onOpenContextMenu,
  visibleColumns,
}: TransactionRowRendererProps) {
  const [isSplitExpanded, setIsSplitExpanded] = useState(false);
  const splitLines = transaction.splitLines ?? [];
  const hasSplitLines = splitLines.length > 0;
  const formattedDate = formatDateForDisplay(transaction.date, dateFormat);
  const hasMemo = Boolean(transaction.memo?.trim());
  const signedAmount = getSignedTransactionAmount(transaction);
  const amountLabel = formatSignedMoney(signedAmount, currencyCode);
  const amountClassName = getSignedAmountClassName(signedAmount);
  const isUncategorised = isUncategorisedRegisterTransaction(transaction);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={[
          "register-row-compact",
          isSelected ? "register-row-selected" : "",
          hasSplitLines && isSplitExpanded ? "register-row-compact-expanded" : "",
          isUncategorised ? "register-row-uncategorised" : "",
        ].filter(Boolean).join(" ")}
        onClick={(event) => onSelectTransaction(transaction.id, event)}
        onDoubleClick={() => onEditTransaction(transaction.id)}
        onContextMenu={(event) => onOpenContextMenu(transaction.id, event)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onEditTransaction(transaction.id);
          }
        }}
      >
        <span className="register-compact-select">
          <TransactionSelectionCheckbox
            transactionId={transaction.id}
            isSelected={isSelected}
            onToggleTransactionSelection={onToggleTransactionSelection}
          />
        </span>

        <span className="register-compact-date">{formattedDate}</span>


        {isRegisterColumnVisible("tags", visibleColumns) ? (
          <TransactionTagPicker
            transaction={transaction}
            tags={tags}
            onChange={(tagIds) => onUpdateTransactionTags(transaction, tagIds)}
            onCreateTag={onCreateTransactionTag}
          />
        ) : (
          <span aria-hidden="true" />
        )}

        {isRegisterColumnVisible("attachments", visibleColumns) ? (
          <AttachmentIndicator
            count={transaction.attachmentCount}
            onClick={() => onManageTransactionAttachments(transaction.id)}
          />
        ) : (
          <span aria-hidden="true" />
        )}

        <div className="register-compact-main">
          <span className="register-compact-payee-line">
            <strong title={transaction.payee}>{transaction.payee}</strong>
            <ScheduledTransactionBadge transaction={transaction} />
          </span>
          <span className="register-compact-secondary">
            {hasSplitLines ? (
              <button
                className="register-split-toggle"
                type="button"
                aria-label={
                  isSplitExpanded
                    ? "Collapse split transaction"
                    : "Expand split transaction"
                }
                aria-expanded={isSplitExpanded}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsSplitExpanded((expanded) => !expanded);
                }}
              >
                {isSplitExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </button>
            ) : null}
            <span title={hasSplitLines ? `Split (${splitLines.length})` : isUncategorised ? "Uncategorised" : transaction.category}>
              {hasSplitLines ? (
                `Split (${splitLines.length})`
              ) : isUncategorised ? (
                <button
                  className="register-category-uncategorised-chip"
                  type="button"
                  title="Choose a category"
                  aria-label="Choose a category for this uncategorised transaction"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditTransactionCategory(transaction.id);
                  }}
                >
                  <span aria-hidden="true">⚠</span>
                  Uncategorised
                </button>
              ) : (
                <CategoryLabel categoryName={transaction.category} />
              )}
            </span>
            {hasMemo ? <span className="register-compact-dot">•</span> : null}
            {hasMemo ? <span title={transaction.memo}>{transaction.memo}</span> : null}
          </span>
        </div>

        <div className="register-compact-money-stack">
          <span className={amountClassName}>{amountLabel}</span>
          {isRegisterColumnVisible("runningBalance", visibleColumns) ? (
            <strong className="register-balance">
              {formatMoney(transaction.runningBalance, currencyCode)}
            </strong>
          ) : null}
        </div>

        {isRegisterColumnVisible("status", visibleColumns) ? (
          <TransactionStatus
            transaction={transaction}
            onToggleCleared={() => onToggleClearedTransaction(transaction.id)}
          />
        ) : null}
      </div>

      {hasSplitLines && isSplitExpanded
        ? splitLines.map((line) => {
            const hasSplitMemo = Boolean(line.memo?.trim());
            const splitSignedAmount = line.inflow
              ? line.inflow
              : line.outflow
                ? -line.outflow
                : 0;
            const splitAmountLabel = formatSignedMoney(splitSignedAmount, currencyCode);
            const splitAmountClassName = getSignedAmountClassName(splitSignedAmount);

            return (
              <button
                className="register-row-compact register-row-compact-split"
                type="button"
                key={line.id}
                onClick={(event) => onSelectTransaction(transaction.id, event)}
                onDoubleClick={() => onEditTransaction(transaction.id)}
              >
                <span className="register-compact-select" aria-hidden="true" />
                <span className="register-compact-date" aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />

                <div className="register-compact-main register-compact-split-main">
                  <strong title={line.category}>
                    <CornerDownRight size={13} aria-hidden="true" />
                    <CategoryLabel categoryName={line.category} />
                  </strong>
                  {hasSplitMemo ? (
                    <span className="register-compact-secondary" title={line.memo}>{line.memo}</span>
                  ) : null}
                </div>

                <div className="register-compact-money-stack">
                  <span className={splitAmountClassName}>{splitAmountLabel}</span>
                </div>

                <span aria-hidden="true" />
              </button>
            );
          })
        : null}
    </>
  );
});

const TabletTransactionRow = memo(function TabletTransactionRow({
  transaction,
  currencyCode,
  dateFormat,
  isSelected,
  onSelectTransaction,
  onToggleTransactionSelection,
  onEditTransaction,
  onEditTransactionCategory,
  onToggleClearedTransaction,
  onManageTransactionAttachments,
  tags,
  onUpdateTransactionTags,
  onCreateTransactionTag,
  onOpenContextMenu,
  visibleColumns,
}: TransactionRowRendererProps) {
  const [isSplitExpanded, setIsSplitExpanded] = useState(false);
  const splitLines = transaction.splitLines ?? [];
  const hasSplitLines = splitLines.length > 0;
  const formattedDate = formatDateForDisplay(transaction.date, dateFormat);
  const hasMemo = Boolean(transaction.memo?.trim());
  const hasCheckNumber = Boolean(transaction.checkNumber?.trim());
  const signedAmount = getSignedTransactionAmount(transaction);
  const amountLabel = formatSignedMoney(signedAmount, currencyCode);
  const amountClassName = getSignedAmountClassName(
    signedAmount,
    "register-tablet-amount register-money",
  );
  const isUncategorised = isUncategorisedRegisterTransaction(transaction);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={[
          "register-row-tablet",
          isSelected ? "register-row-selected" : "",
          hasSplitLines && isSplitExpanded ? "register-row-tablet-expanded" : "",
          isUncategorised ? "register-row-uncategorised" : "",
        ].filter(Boolean).join(" ")}
        onClick={(event) => onSelectTransaction(transaction.id, event)}
        onDoubleClick={() => onEditTransaction(transaction.id)}
        onContextMenu={(event) => onOpenContextMenu(transaction.id, event)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onEditTransaction(transaction.id);
          }
        }}
      >
        <span className="register-tablet-select">
          <TransactionSelectionCheckbox
            transactionId={transaction.id}
            isSelected={isSelected}
            onToggleTransactionSelection={onToggleTransactionSelection}
          />
        </span>

        <div className="register-tablet-main">
          <div className="register-tablet-primary-line">
            <span className="register-tablet-payee-line">
              <strong className="register-tablet-payee" title={transaction.payee}>
                {transaction.payee}
              </strong>
              <ScheduledTransactionBadge transaction={transaction} />
            </span>
            <span className={amountClassName}>{amountLabel}</span>
          </div>

          <div className="register-tablet-secondary-line">
            <span className="register-tablet-category" title={hasSplitLines ? `Split (${splitLines.length})` : isUncategorised ? "Uncategorised" : transaction.category}>
              {hasSplitLines ? (
                <button
                  className="register-split-toggle"
                  type="button"
                  aria-label={
                    isSplitExpanded
                      ? "Collapse split transaction"
                      : "Expand split transaction"
                  }
                  aria-expanded={isSplitExpanded}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsSplitExpanded((expanded) => !expanded);
                  }}
                >
                  {isSplitExpanded ? (
                    <ChevronDown size={15} />
                  ) : (
                    <ChevronRight size={15} />
                  )}
                </button>
              ) : null}
              <span>
                {hasSplitLines ? (
                  `Split (${splitLines.length})`
                ) : isUncategorised ? (
                  <button
                  className="register-category-uncategorised-chip"
                  type="button"
                  title="Choose a category"
                  aria-label="Choose a category for this uncategorised transaction"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditTransactionCategory(transaction.id);
                  }}
                >
                  <span aria-hidden="true">⚠</span>
                  Uncategorised
                </button>
                ) : (
                  <CategoryLabel categoryName={transaction.category} />
                )}
              </span>
            </span>

            {isRegisterColumnVisible("memo", visibleColumns) && hasMemo ? (
              <span className="register-tablet-memo" title={transaction.memo}>
                {transaction.memo}
              </span>
            ) : null}
          </div>

          <div className="register-tablet-meta-line">
            <span>{formattedDate}</span>

            {isRegisterColumnVisible("checkNumber", visibleColumns) && hasCheckNumber ? (
              <span>#{transaction.checkNumber}</span>
            ) : null}

            {isRegisterColumnVisible("runningBalance", visibleColumns) ? (
              <span>Balance {formatMoney(transaction.runningBalance, currencyCode)}</span>
            ) : null}
          </div>
        </div>

        <div className="register-tablet-actions">
          {isRegisterColumnVisible("tags", visibleColumns) ? (
            <TransactionTagPicker
            transaction={transaction}
            tags={tags}
            onChange={(tagIds) => onUpdateTransactionTags(transaction, tagIds)}
            onCreateTag={onCreateTransactionTag}
          />
          ) : null}

          {isRegisterColumnVisible("attachments", visibleColumns) ? (
            <AttachmentIndicator
              count={transaction.attachmentCount}
              onClick={() => onManageTransactionAttachments(transaction.id)}
            />
          ) : null}

          {isRegisterColumnVisible("status", visibleColumns) ? (
            <TransactionStatus
              transaction={transaction}
              onToggleCleared={() => onToggleClearedTransaction(transaction.id)}
            />
          ) : null}
        </div>
      </div>

      {hasSplitLines && isSplitExpanded
        ? splitLines.map((line) => {
            const hasSplitMemo = Boolean(line.memo?.trim());
            const splitSignedAmount = line.inflow
              ? line.inflow
              : line.outflow
                ? -line.outflow
                : 0;
            const splitAmountLabel = formatSignedMoney(splitSignedAmount, currencyCode);
            const splitAmountClassName = getSignedAmountClassName(
              splitSignedAmount,
              "register-tablet-split-amount register-money",
            );

            return (
              <button
                className="register-row-tablet-split"
                type="button"
                key={line.id}
                onClick={(event) => onSelectTransaction(transaction.id, event)}
                onDoubleClick={() => onEditTransaction(transaction.id)}
              >
                <span className="register-tablet-split-icon" aria-hidden="true">
                  <CornerDownRight size={14} />
                </span>
                <span className="register-tablet-split-main">
                  <strong title={line.category}><CategoryLabel categoryName={line.category} /></strong>
                  {hasSplitMemo ? <span title={line.memo}>{line.memo}</span> : null}
                </span>
                <span className={splitAmountClassName}>{splitAmountLabel}</span>
              </button>
            );
          })
        : null}
    </>
  );
});

function MobileTransactionRow(props: TransactionRowRendererProps) {
  return <DesktopTransactionRow {...props} />;
}

export const TransactionRow = memo(function TransactionRow({
  layoutMode,
  ...props
}: TransactionRowProps) {
  switch (layoutMode) {
    case "compact":
      return <CompactTransactionRow {...props} />;
    case "tablet":
      return <TabletTransactionRow {...props} />;
    case "mobile":
      return <MobileTransactionRow {...props} />;
    case "desktop":
    default:
      return <DesktopTransactionRow {...props} />;
  }
});
