import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { MoneyInput } from "../money/MoneyInput";
import { roundMoney } from "../money/moneyExpression";
import { formatMoney } from "./budgetMoneyDisplay";
import type { BudgetCategoryGroupView } from "./budgetViewTypes";
import {
  isCreditCardPaymentCategory,
  isCreditCardPaymentGroup,
} from "./creditCardPaymentCategories";
import "../../styles/budgetMoveMoney.css";

interface MoveMoneyCategoryOption {
  readonly id: string;
  readonly name: string;
  readonly groupId: string;
  readonly groupName: string;
  readonly available: number;
}

function moveMoneyOptions(
  groups: readonly BudgetCategoryGroupView[],
): MoveMoneyCategoryOption[] {
  return groups
    .filter((group) => !isCreditCardPaymentGroup(group.id))
    .flatMap((group) =>
      group.categories
        .filter(
          (category) =>
            !category.isArchived &&
            !isCreditCardPaymentCategory(category.id),
        )
        .map((category) => ({
          id: category.id,
          name: category.name,
          groupId: group.id,
          groupName: group.name,
          available: category.available,
        })),
    );
}

function amountValue(value: string): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function BudgetMoveMoneyDialog({
  groups,
  initialDestinationCategoryId,
  currencyCode,
  onClose,
  onMoveMoney,
}: {
  groups: readonly BudgetCategoryGroupView[];
  initialDestinationCategoryId: string;
  currencyCode: string;
  onClose: () => void;
  onMoveMoney: (input: {
    destinationCategoryId: string;
    sources: { categoryId: string; amount: number }[];
  }) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const options = useMemo(() => moveMoneyOptions(groups), [groups]);
  const [destinationCategoryId, setDestinationCategoryId] = useState(
    initialDestinationCategoryId,
  );
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [sourceToAdd, setSourceToAdd] = useState("");

  useEffect(() => {
    setDestinationCategoryId(initialDestinationCategoryId);
    setSelectedSourceIds([]);
    setAmounts({});
    setSourceToAdd("");
  }, [initialDestinationCategoryId]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const destination = options.find(
    (option) => option.id === destinationCategoryId,
  ) ?? null;
  const selectedSources = selectedSourceIds
    .map((categoryId) => options.find((option) => option.id === categoryId))
    .filter((option): option is MoveMoneyCategoryOption => Boolean(option));
  const addableSources = options.filter(
    (option) =>
      option.id !== destinationCategoryId &&
      option.available > 0 &&
      !selectedSourceIds.includes(option.id),
  );
  const selectedTotal = roundMoney(
    selectedSources.reduce(
      (total, source) => total + amountValue(amounts[source.id] ?? ""),
      0,
    ),
  );
  const sourceHasError = selectedSources.some((source) => {
    const amount = amountValue(amounts[source.id] ?? "");
    return amount < 0 || amount > source.available + 0.000001;
  });
  const selectedSourceAmounts = selectedSources
    .map((source) => ({
      categoryId: source.id,
      amount: roundMoney(amountValue(amounts[source.id] ?? "")),
    }))
    .filter((source) => source.amount > 0);
  const canMove =
    Boolean(destination) &&
    selectedSourceAmounts.length > 0 &&
    selectedTotal > 0 &&
    !sourceHasError;

  function removeSource(categoryId: string) {
    setSelectedSourceIds((current) =>
      current.filter((id) => id !== categoryId),
    );
    setAmounts((current) => {
      const next = { ...current };
      delete next[categoryId];
      return next;
    });
  }

  return (
    <div
      className="app-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="app-dialog budget-move-money-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-move-money-title"
        tabIndex={-1}
      >
        <header className="budget-move-money-header">
          <div>
            <h2 id="budget-move-money-title">Move Money</h2>
            <p>Move available money from one or more categories.</p>
          </div>
          <button
            className="budget-move-money-close"
            type="button"
            onClick={onClose}
            aria-label="Close Move Money"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="budget-move-money-body">
          <label className="budget-move-money-field">
            <span>To</span>
            <select
              value={destinationCategoryId}
              aria-label="Destination category"
              onChange={(event) => {
                const nextDestination = event.currentTarget.value;
                setDestinationCategoryId(nextDestination);
                if (selectedSourceIds.includes(nextDestination)) {
                  removeSource(nextDestination);
                }
              }}
            >
              {groups
                .filter((group) => !isCreditCardPaymentGroup(group.id))
                .map((group) => {
                  const groupOptions = options.filter(
                    (option) => option.groupId === group.id,
                  );
                  if (groupOptions.length === 0) return null;
                  return (
                    <optgroup label={group.name} key={group.id}>
                      {groupOptions.map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
            </select>
          </label>

          <section className="budget-move-money-sources">
            <div className="budget-move-money-section-heading">
              <div>
                <strong>From</strong>
                <span>Choose one or more categories and how much to move.</span>
              </div>
              <strong>{formatMoney(selectedTotal, currencyCode)}</strong>
            </div>

            {selectedSources.length > 0 ? (
              <div className="budget-move-money-source-list">
                {selectedSources.map((source) => {
                  const amount = amountValue(amounts[source.id] ?? "");
                  const exceedsAvailable =
                    amount > source.available + 0.000001;

                  return (
                    <div className="budget-move-money-source-row" key={source.id}>
                      <div className="budget-move-money-source-copy">
                        <strong>{source.name}</strong>
                        <small>
                          {source.groupName} ·{" "}
                          {formatMoney(source.available, currencyCode)} available
                        </small>
                      </div>
                      <MoneyInput
                        className={
                          exceedsAvailable
                            ? "budget-move-money-amount budget-move-money-amount-error"
                            : "budget-move-money-amount"
                        }
                        value={amount}
                        placeholder="0.00"
                        aria-label={`Amount from ${source.name}`}
                        onCommit={(nextValue) => {
                          setAmounts((current) => ({
                            ...current,
                            [source.id]:
                              nextValue === 0 ? "" : nextValue.toFixed(2),
                          }));
                        }}
                        validate={(nextValue) =>
                          nextValue >= 0 &&
                          nextValue <= source.available + 0.000001
                        }
                        emptyWhenZero
                      />
                      <button
                        className="budget-move-money-remove"
                        type="button"
                        aria-label={`Remove ${source.name}`}
                        title={`Remove ${source.name}`}
                        onClick={() => removeSource(source.id)}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="budget-move-money-empty">
                Add a category with available money to begin.
              </p>
            )}

            {sourceHasError ? (
              <p className="budget-move-money-validation" role="alert">
                A source cannot contribute more than its available amount.
              </p>
            ) : null}

            <label className="budget-move-money-add-source">
              <span>Add source category</span>
              <select
                value={sourceToAdd}
                aria-label="Add source category"
                disabled={addableSources.length === 0}
                onChange={(event) => {
                  const categoryId = event.currentTarget.value;
                  setSourceToAdd("");
                  if (!categoryId) return;
                  setSelectedSourceIds((current) => [...current, categoryId]);
                }}
              >
                <option value="">
                  {addableSources.length > 0
                    ? "Choose category…"
                    : "No other category has available money"}
                </option>
                {groups
                  .filter((group) => !isCreditCardPaymentGroup(group.id))
                  .map((group) => {
                    const groupOptions = addableSources.filter(
                      (option) => option.groupId === group.id,
                    );
                    if (groupOptions.length === 0) return null;
                    return (
                      <optgroup label={group.name} key={group.id}>
                        {groupOptions.map((option) => (
                          <option value={option.id} key={option.id}>
                            {option.name} ·{" "}
                            {formatMoney(option.available, currencyCode)} available
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
              </select>
            </label>
          </section>
        </div>

        <footer className="budget-move-money-footer">
          <button className="button button-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={!canMove}
            onClick={() => {
              if (!destination) return;
              onMoveMoney({
                destinationCategoryId: destination.id,
                sources: selectedSourceAmounts,
              });
            }}
          >
            Move {formatMoney(selectedTotal, currencyCode)}
          </button>
        </footer>
      </section>
    </div>
  );
}
