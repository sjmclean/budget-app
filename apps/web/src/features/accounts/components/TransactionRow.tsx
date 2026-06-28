import { ChevronDown, ChevronRight, CornerDownRight, Paperclip } from "lucide-react";
import { memo, useState, type CSSProperties } from "react";
import type { RegisterLayoutMode } from "../registerLayoutMode";
import type {
  RegisterTransactionView,
  TransactionFlag,
} from "../accountRegisterTypes";
import { formatDateForDisplay } from "../../settings/dateFormatting";
import { useDateFormatPreference } from "../../settings/useDateFormatPreference";

export type RegisterColumnId =
  | "select"
  | "date"
  | "flag"
  | "attachments"
  | "payee"
  | "category"
  | "memo"
  | "checkNumber"
  | "outflow"
  | "inflow"
  | "runningBalance"
  | "status"
  | "actions";

const REGISTER_FLAG_OPTIONS: Array<Exclude<TransactionFlag, null>> = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
];

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

function FlagDot({ flag }: { flag: TransactionFlag }) {
  if (!flag) {
    return <span className="transaction-flag transaction-flag-empty" />;
  }

  return <span className={`transaction-flag transaction-flag-${flag}`} />;
}

export function InlineFlagPicker({
  value,
  onChange,
}: {
  value: TransactionFlag;
  onChange: (flag: TransactionFlag) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  function chooseFlag(flag: TransactionFlag) {
    onChange(flag);
    setIsOpen(false);
  }

  return (
    <div className="flag-colour-picker" title="Flag">
      <button
        className="flag-colour-picker-button"
        type="button"
        aria-label={value ? `${value} flag` : "No flag"}
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
      >
        <FlagDot flag={value} />
      </button>

      {isOpen ? (
        <div
          className="flag-colour-picker-menu"
          role="listbox"
          aria-label="Choose flag colour"
        >
          <button
            className="flag-colour-picker-option"
            type="button"
            role="option"
            aria-selected={value === null}
            title="No flag"
            onClick={(event) => {
              event.stopPropagation();
              chooseFlag(null);
            }}
          >
            <span
              className="transaction-flag transaction-flag-empty"
              aria-hidden="true"
            />
          </button>

          {REGISTER_FLAG_OPTIONS.map((flag) => (
            <button
              className="flag-colour-picker-option"
              type="button"
              role="option"
              aria-selected={value === flag}
              title={`${flag[0].toUpperCase()}${flag.slice(1)} flag`}
              key={flag}
              onClick={(event) => {
                event.stopPropagation();
                chooseFlag(flag);
              }}
            >
              <span
                className={`transaction-flag transaction-flag-${flag}`}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
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
  onSelectTransaction: (transactionId: string) => void;
  onEditTransaction: (transactionId: string) => void;
  onToggleClearedTransaction: (transactionId: string) => void;
  onManageTransactionAttachments: (transactionId: string) => void;
  onUpdateTransactionFlag: (
    transaction: RegisterTransactionView,
    flag: TransactionFlag,
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
  onEditTransaction,
  onToggleClearedTransaction,
  onManageTransactionAttachments,
  onUpdateTransactionFlag,
  visibleColumns,
  rowStyle,
}: TransactionRowRendererProps) {
  const [isSplitExpanded, setIsSplitExpanded] = useState(false);
  const splitLines = transaction.splitLines ?? [];
  const hasSplitLines = splitLines.length > 0;

  return (
    <>
      <button
        type="button"
        className={
          isSelected ? "register-row register-row-selected" : "register-row"
        }
        onClick={() => onSelectTransaction(transaction.id)}
        onDoubleClick={() => onEditTransaction(transaction.id)}
        style={rowStyle}
      >
        <span className="register-checkbox" aria-hidden="true" />
        <span>{formatDateForDisplay(transaction.date, dateFormat)}</span>
        {isRegisterColumnVisible("flag", visibleColumns) ? (
          <InlineFlagPicker
            value={transaction.flag}
            onChange={(flag) => onUpdateTransactionFlag(transaction, flag)}
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
        </div>

        <span className={hasSplitLines ? "register-split-category-cell" : undefined}>
          {hasSplitLines ? (
            <button
              className="register-split-toggle"
              type="button"
              aria-label={isSplitExpanded ? "Collapse split transaction" : "Expand split transaction"}
              aria-expanded={isSplitExpanded}
              onClick={(event) => {
                event.stopPropagation();
                setIsSplitExpanded((expanded) => !expanded);
              }}
            >
              {isSplitExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
          {hasSplitLines ? `Split (${splitLines.length})` : transaction.category}
        </span>
        {isRegisterColumnVisible("memo", visibleColumns) ? (
          <span className="register-memo-cell">{transaction.memo ?? ""}</span>
        ) : null}
        {isRegisterColumnVisible("checkNumber", visibleColumns) ? (
          <span className="register-check-number-cell">
            {transaction.checkNumber ?? ""}
          </span>
        ) : null}

        <span className="register-money register-outflow">
          {transaction.outflow
            ? formatMoney(transaction.outflow, currencyCode)
            : ""}
        </span>

        <span className="register-money register-inflow">
          {transaction.inflow
            ? formatMoney(transaction.inflow, currencyCode)
            : ""}
        </span>

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
      </button>

      {hasSplitLines && isSplitExpanded
        ? splitLines.map((line) => (
            <button
              className="register-row register-split-readonly-row"
              type="button"
              key={line.id}
              style={rowStyle}
              onClick={() => onSelectTransaction(transaction.id)}
              onDoubleClick={() => onEditTransaction(transaction.id)}
            >
              <span className="register-split-readonly-spacer" aria-hidden="true" />
              <span />
              {isRegisterColumnVisible("flag", visibleColumns) ? <span /> : null}
              {isRegisterColumnVisible("attachments", visibleColumns) ? <span /> : null}
              <span className="register-split-readonly-payee" aria-hidden="true" />
              <span className="register-split-readonly-category">
                <CornerDownRight size={13} aria-hidden="true" />
                {line.category}
              </span>
              {isRegisterColumnVisible("memo", visibleColumns) ? (
                <span className="register-memo-cell">{line.memo ?? ""}</span>
              ) : null}
              {isRegisterColumnVisible("checkNumber", visibleColumns) ? <span /> : null}
              <span className="register-money register-outflow">
                {line.outflow ? formatMoney(line.outflow, currencyCode) : ""}
              </span>
              <span className="register-money register-inflow">
                {line.inflow ? formatMoney(line.inflow, currencyCode) : ""}
              </span>
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
  onEditTransaction,
  onToggleClearedTransaction,
  onManageTransactionAttachments,
  onUpdateTransactionFlag,
  visibleColumns,
}: TransactionRowRendererProps) {
  const [isSplitExpanded, setIsSplitExpanded] = useState(false);
  const splitLines = transaction.splitLines ?? [];
  const hasSplitLines = splitLines.length > 0;
  const formattedDate = formatDateForDisplay(transaction.date, dateFormat);
  const hasMemo = Boolean(transaction.memo?.trim());
  const amountLabel = transaction.outflow
    ? formatMoney(transaction.outflow, currencyCode)
    : transaction.inflow
      ? formatMoney(transaction.inflow, currencyCode)
      : "";
  const amountClassName = transaction.inflow
    ? "register-money register-inflow"
    : "register-money register-outflow";

  return (
    <>
      <button
        type="button"
        className={[
          "register-row-compact",
          isSelected ? "register-row-selected" : "",
          hasSplitLines && isSplitExpanded ? "register-row-compact-expanded" : "",
        ].filter(Boolean).join(" ")}
        onClick={() => onSelectTransaction(transaction.id)}
        onDoubleClick={() => onEditTransaction(transaction.id)}
      >
        <span className="register-compact-select" aria-hidden="true">
          <span className="register-checkbox" />
        </span>

        <span className="register-compact-date">{formattedDate}</span>

        {isRegisterColumnVisible("flag", visibleColumns) ? (
          <InlineFlagPicker
            value={transaction.flag}
            onChange={(flag) => onUpdateTransactionFlag(transaction, flag)}
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
          <strong title={transaction.payee}>{transaction.payee}</strong>
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
            <span title={hasSplitLines ? `Split (${splitLines.length})` : transaction.category}>
              {hasSplitLines ? `Split (${splitLines.length})` : transaction.category}
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
      </button>

      {hasSplitLines && isSplitExpanded
        ? splitLines.map((line) => {
            const hasSplitMemo = Boolean(line.memo?.trim());
            const splitAmountLabel = line.outflow
              ? formatMoney(line.outflow, currencyCode)
              : line.inflow
                ? formatMoney(line.inflow, currencyCode)
                : "";
            const splitAmountClassName = line.inflow
              ? "register-money register-inflow"
              : "register-money register-outflow";

            return (
              <button
                className="register-row-compact register-row-compact-split"
                type="button"
                key={line.id}
                onClick={() => onSelectTransaction(transaction.id)}
                onDoubleClick={() => onEditTransaction(transaction.id)}
              >
                <span className="register-compact-select" aria-hidden="true" />
                <span className="register-compact-date" aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />

                <div className="register-compact-main register-compact-split-main">
                  <strong title={line.category}>
                    <CornerDownRight size={13} aria-hidden="true" />
                    {line.category}
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

function TabletTransactionRow(props: TransactionRowRendererProps) {
  return <DesktopTransactionRow {...props} />;
}

function MobileTransactionRow(props: TransactionRowRendererProps) {
  return <DesktopTransactionRow {...props} />;
}

export const TransactionRow = memo(function TransactionRow({
  layoutMode,
  ...props
}: TransactionRowProps) {
  if (layoutMode === "compact") {
    return <CompactTransactionRow {...props} />;
  }

  if (layoutMode === "tablet") {
    return <TabletTransactionRow {...props} />;
  }

  if (layoutMode === "mobile") {
    return <MobileTransactionRow {...props} />;
  }

  return <DesktopTransactionRow {...props} />;
});
