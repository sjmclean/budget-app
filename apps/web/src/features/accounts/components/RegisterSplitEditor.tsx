import type {
  CSSProperties,
  KeyboardEvent,
  ReactNode,
} from "react";

import {
  RegisterCategoryInput,
  type RegisterInlineCategoryCreateInput,
} from "./RegisterCategoryInput";
import type { RegisterColumnId } from "./TransactionRow";
import type { RegisterLayoutMode } from "../registerLayoutMode";
import type { BudgetCategoryOption } from "../../budget/budgetViewTypes";
import {
  createSplitLineDraft,
  getSplitBalanceStatus,
  parseRegisterMoney,
  totalsFromSplitDrafts,
  type SplitLineDraft,
} from "../registerSplitDrafts";
import { findCategoryOption } from "../registerCategoryMatching";
import { MoneyInput } from "../../money/MoneyInput";

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

export function RegisterSplitEditor({
  splitLines,
  setSplitLines,
  categoryOptions,
  parentOutflow,
  parentInflow,
  currencyCode,
  visibleColumnIds,
  rowStyle,
  layoutMode,
  onCreateCategory,
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
  onCreateCategory?: (
    input: RegisterInlineCategoryCreateInput,
  ) => Promise<BudgetCategoryOption>;
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
      parseRegisterMoney(line.outflow) > 0 ||
      parseRegisterMoney(line.inflow) > 0;

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
        <RegisterCategoryInput
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
          onCreateCategory={onCreateCategory}
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
        <MoneyInput
          className="register-money-input"
          key={columnId}
          value={parseRegisterMoney(line.outflow)}
          onCommit={(value) =>
            setSplitLines((current) =>
              current.map((item) =>
                item.id === line.id
                  ? { ...item, outflow: value === 0 ? "" : value.toFixed(2), inflow: value > 0 ? "" : item.inflow }
                  : item,
              ),
            )
          }
          validate={(value) => value >= 0}
          emptyWhenZero
          placeholder="Outflow"
          onMoneyKeyDown={(event) => addSplitOnTab(event, line)}
        />,
      );
    }

    if (columnId === "inflow") {
      return renderWithOptionalRemove(
        columnId,
        line,
        <MoneyInput
          className="register-money-input"
          key={columnId}
          value={parseRegisterMoney(line.inflow)}
          onCommit={(value) =>
            setSplitLines((current) =>
              current.map((item) =>
                item.id === line.id
                  ? { ...item, inflow: value === 0 ? "" : value.toFixed(2), outflow: value > 0 ? "" : item.outflow }
                  : item,
              ),
            )
          }
          validate={(value) => value >= 0}
          emptyWhenZero
          placeholder="Inflow"
          onMoneyKeyDown={(event) => addSplitOnTab(event, line)}
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
              <RegisterCategoryInput
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
              <MoneyInput
                className="register-money-input"
                value={parseRegisterMoney(line.outflow)}
                onCommit={(value) =>
                  setSplitLines((current) =>
                    current.map((item) =>
                      item.id === line.id
                        ? { ...item, outflow: value === 0 ? "" : value.toFixed(2), inflow: value > 0 ? "" : item.inflow }
                        : item,
                    ),
                  )
                }
                validate={(value) => value >= 0}
                emptyWhenZero
                placeholder="Outflow"
                onMoneyKeyDown={(event) => addSplitOnTab(event, line)}
              />

              <MoneyInput
                className="register-money-input"
                value={parseRegisterMoney(line.inflow)}
                onCommit={(value) =>
                  setSplitLines((current) =>
                    current.map((item) =>
                      item.id === line.id
                        ? { ...item, inflow: value === 0 ? "" : value.toFixed(2), outflow: value > 0 ? "" : item.outflow }
                        : item,
                    ),
                  )
                }
                validate={(value) => value >= 0}
                emptyWhenZero
                placeholder="Inflow"
                onMoneyKeyDown={(event) => addSplitOnTab(event, line)}
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
            <RegisterCategoryInput
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

          <MoneyInput
            className="register-money-input register-split-allocation-amount register-split-allocation-outflow"
            value={parseRegisterMoney(line.outflow)}
            onCommit={(value) =>
              setSplitLines((current) =>
                current.map((item) =>
                  item.id === line.id
                    ? { ...item, outflow: value === 0 ? "" : value.toFixed(2), inflow: value > 0 ? "" : item.inflow }
                    : item,
                ),
              )
            }
            validate={(value) => value >= 0}
            emptyWhenZero
            placeholder="Outflow"
            onMoneyKeyDown={(event) => addSplitOnTab(event, line)}
          />

          <MoneyInput
            className="register-money-input register-split-allocation-amount register-split-allocation-inflow"
            value={parseRegisterMoney(line.inflow)}
            onCommit={(value) =>
              setSplitLines((current) =>
                current.map((item) =>
                  item.id === line.id
                    ? { ...item, inflow: value === 0 ? "" : value.toFixed(2), outflow: value > 0 ? "" : item.outflow }
                    : item,
                ),
              )
            }
            validate={(value) => value >= 0}
            emptyWhenZero
            placeholder="Inflow"
            onMoneyKeyDown={(event) => addSplitOnTab(event, line)}
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
