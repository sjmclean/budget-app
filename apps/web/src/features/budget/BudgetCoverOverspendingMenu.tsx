import { useEffect, useMemo, useState } from "react";
import "../../styles/budgetCoverOverspending.css";
import {
  FloatingMenu,
  FloatingMenuHeading,
  type FloatingPosition,
} from "../floatingUi";
import { formatMoney } from "./budgetMoneyDisplay";
import type {
  BudgetCategoryView,
  OverspendingHandling,
} from "./budgetViewTypes";
import type { OverspendingCoverOption } from "./budgetWorkspaceSelectors";
import { MoneyInput } from "../money/MoneyInput";
import { roundMoney } from "../money/moneyExpression";

interface BudgetCoverOverspendingMenuProps {
  isOpen: boolean;
  position: Pick<FloatingPosition, "top" | "left"> | null;
  overspentCategory: BudgetCategoryView | null;
  coverOptions: OverspendingCoverOption[];
  currencyCode: string;
  onClose: () => void;
  onCoverOverspending: (input: {
    overspentCategoryId: string;
    sources: {
      categoryId: string;
      amount: number;
    }[];
  }) => void;
  onSetOverspendingHandling: (
    categoryId: string,
    overspendingHandling: OverspendingHandling,
  ) => void;
}

interface OverspendingCoverOptionGroup {
  groupName: string;
  options: OverspendingCoverOption[];
}

function getOverspentAmount(category: BudgetCategoryView | null) {
  return category ? Math.abs(Math.min(0, category.available)) : 0;
}

function groupCoverOptions(
  options: OverspendingCoverOption[],
): OverspendingCoverOptionGroup[] {
  const groups: OverspendingCoverOptionGroup[] = [];
  const groupByName = new Map<string, OverspendingCoverOptionGroup>();

  for (const option of options) {
    let group = groupByName.get(option.groupName);

    if (!group) {
      group = {
        groupName: option.groupName,
        options: [],
      };

      groupByName.set(option.groupName, group);
      groups.push(group);
    }

    group.options.push(option);
  }

  return groups;
}

function amountValue(value: string): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function BudgetCoverOverspendingMenu({
  isOpen,
  position,
  overspentCategory,
  coverOptions,
  currencyCode,
  onClose,
  onCoverOverspending,
  onSetOverspendingHandling,
}: BudgetCoverOverspendingMenuProps) {
  const overspentAmount = getOverspentAmount(overspentCategory);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  useEffect(() => {
    setAmounts({});
    setSelectedCategoryIds([]);
    setIsAddingCategory(false);
    setCategorySearch("");
  }, [isOpen, overspentCategory?.id]);

  const availableCoverOptions = useMemo(
    () =>
      coverOptions.filter(
        (option) =>
          overspentCategory !== null &&
          option.id !== overspentCategory.id &&
          option.available > 0,
      ),
    [coverOptions, overspentCategory],
  );

  const optionById = useMemo(
    () =>
      new Map(
        availableCoverOptions.map((option) => [option.id, option] as const),
      ),
    [availableCoverOptions],
  );

  const selectedOptions = selectedCategoryIds.flatMap((categoryId) => {
    const option = optionById.get(categoryId);
    return option ? [option] : [];
  });

  const selectedSources = selectedOptions.flatMap((option) => {
    const amount = roundMoney(amountValue(amounts[option.id] ?? ""));

    return amount > 0
      ? [
          {
            categoryId: option.id,
            amount,
          },
        ]
      : [];
  });

  const selectedTotal = roundMoney(
    selectedSources.reduce((total, source) => total + source.amount, 0),
  );

  const remaining = roundMoney(
    Math.max(0, overspentAmount - selectedTotal),
  );

  const overSelected = selectedTotal > overspentAmount + 0.000001;

  const sourceHasError = selectedOptions.some((option) => {
    const amount = amountValue(amounts[option.id] ?? "");
    return amount > option.available + 0.000001;
  });

  const canCover =
    selectedSources.length > 0 &&
    !overSelected &&
    !sourceHasError;

  const searchTerm = categorySearch.trim().toLocaleLowerCase();

  const addableOptions = availableCoverOptions.filter((option) => {
    if (selectedCategoryIds.includes(option.id)) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    return (
      option.name.toLocaleLowerCase().includes(searchTerm) ||
      option.groupName.toLocaleLowerCase().includes(searchTerm)
    );
  });

  const groupedAddableOptions = groupCoverOptions(addableOptions);

  if (!overspentCategory || overspentAmount <= 0) {
    return null;
  }

  const handling =
    overspentCategory.overspendingHandling ?? "reduce-next-month";

  function addCategory(option: OverspendingCoverOption) {
    const amount = roundMoney(
      Math.min(remaining, option.available),
    );

    setSelectedCategoryIds((current) =>
      current.includes(option.id)
        ? current
        : [...current, option.id],
    );

    setAmounts((current) => ({
      ...current,
      [option.id]: amount > 0 ? amount.toFixed(2) : "",
    }));

    setCategorySearch("");
    setIsAddingCategory(false);
  }

  function removeCategory(categoryId: string) {
    setSelectedCategoryIds((current) =>
      current.filter((id) => id !== categoryId),
    );

    setAmounts((current) => {
      const next = { ...current };
      delete next[categoryId];
      return next;
    });
  }

  return (
    <FloatingMenu
      isOpen={isOpen}
      label="Cover category overspending"
      layerClassName="budget-cover-menu-layer floating-menu-layer"
      panelClassName="budget-cover-menu budget-cover-menu-multi floating-menu-panel"
      position={position}
      onClose={onClose}
      autoFocusFirstItem={false}
    >
      <FloatingMenuHeading
        className="budget-cover-menu-heading floating-menu-heading"
        title="Category overspent"
        subtitle={`${overspentCategory.name} is overspent by ${formatMoney(
          overspentAmount,
          currencyCode,
        )}`}
      />

      <div className="budget-cover-menu-body">
        <fieldset className="budget-overspending-handling">
          <legend>
            If this category is still overspent when the month ends
          </legend>

          <label className="budget-overspending-option">
            <input
              type="radio"
              name={`overspending-handling-${overspentCategory.id}`}
              checked={handling === "reduce-next-month"}
              onChange={() =>
                onSetOverspendingHandling(
                  overspentCategory.id,
                  "reduce-next-month",
                )
              }
            />

            <span>
              <strong>Reduce next month&apos;s Ready to Assign</strong>
              <small>
                The overspent amount will be deducted next month.
              </small>
            </span>
          </label>

          <label className="budget-overspending-option">
            <input
              type="radio"
              name={`overspending-handling-${overspentCategory.id}`}
              checked={handling === "carry-category"}
              onChange={() =>
                onSetOverspendingHandling(
                  overspentCategory.id,
                  "carry-category",
                )
              }
            />

            <span>
              <strong>Carry the negative balance into this category</strong>
              <small>
                The category will remain negative next month.
              </small>
            </span>
          </label>
        </fieldset>

        <section
          className="budget-cover-section"
          aria-labelledby="cover-overspending-heading"
        >
          <div
            className="budget-cover-section-heading"
            id="cover-overspending-heading"
          >
            Cover overspending
          </div>

          <p className="budget-cover-section-copy">
            Move available money from one or more categories.
          </p>

          <div className="budget-cover-summary">
            <div>
              <span>Needed</span>
              <strong>
                {formatMoney(overspentAmount, currencyCode)}
              </strong>
            </div>

            <div>
              <span>Selected</span>
              <strong>
                {formatMoney(selectedTotal, currencyCode)}
              </strong>
            </div>

            <div>
              <span>Remaining</span>
              <strong>
                {formatMoney(remaining, currencyCode)}
              </strong>
            </div>
          </div>

          {!isAddingCategory ? (
            <>
              {selectedOptions.length > 0 ? (
                <div className="budget-cover-selected-list">
                  {selectedOptions.map((option) => {
                    const value = amounts[option.id] ?? "";
                    const amount = amountValue(value);

                    const exceedsAvailable =
                      amount > option.available + 0.000001;

                    return (
                      <div
                        className="budget-cover-selected-row"
                        key={option.id}
                      >
                        <div className="budget-cover-selected-copy">
                          <strong>{option.name}</strong>

                          <small>
                            {option.groupName}
                            {" · "}
                            {formatMoney(
                              option.available,
                              currencyCode,
                            )}{" "}
                            available
                          </small>
                        </div>

                        <MoneyInput
                          className={
                            exceedsAvailable
                              ? "budget-cover-amount budget-cover-amount-error"
                              : "budget-cover-amount"
                          }
                          value={amount}
                          placeholder="0.00"
                          aria-label={`Amount from ${option.name}`}
                          onCommit={(nextValue) => {
                            setAmounts((current) => ({
                              ...current,
                              [option.id]: nextValue === 0 ? "" : nextValue.toFixed(2),
                            }));
                          }}
                          validate={(nextValue) => nextValue >= 0 && nextValue <= option.available + 0.000001}
                          emptyWhenZero
                        />

                        <button
                          className="budget-cover-remove-source"
                          type="button"
                          aria-label={`Remove ${option.name}`}
                          title={`Remove ${option.name}`}
                          onClick={() => removeCategory(option.id)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="budget-cover-no-sources">
                  No funding categories selected yet.
                </p>
              )}

              {sourceHasError ? (
                <p className="budget-cover-validation" role="alert">
                  A category cannot contribute more than its available
                  amount.
                </p>
              ) : overSelected ? (
                <p className="budget-cover-validation" role="alert">
                  Selected amounts cannot exceed the overspending being
                  covered.
                </p>
              ) : null}

              {remaining > 0 &&
              selectedCategoryIds.length < availableCoverOptions.length ? (
                <button
                  className="budget-cover-add-category"
                  type="button"
                  onClick={() => setIsAddingCategory(true)}
                >
                  <span aria-hidden="true">＋</span>
                  Add category
                </button>
              ) : null}

              {availableCoverOptions.length === 0 ? (
                <p className="budget-cover-menu-empty">
                  No other category currently has available money to cover
                  this overspending.
                </p>
              ) : null}
            </>
          ) : (
            <div className="budget-cover-category-picker">
              <div className="budget-cover-picker-heading">
                <div>
                  <strong>Add category</strong>
                  <small>
                    Choose a category that has available money.
                  </small>
                </div>

                <button
                  className="budget-cover-picker-close"
                  type="button"
                  aria-label="Close category picker"
                  onClick={() => {
                    setIsAddingCategory(false);
                    setCategorySearch("");
                  }}
                >
                  ×
                </button>
              </div>

              <input
                className="budget-cover-category-search"
                type="search"
                value={categorySearch}
                placeholder="Search categories"
                aria-label="Search categories"
                autoFocus
                onChange={(event) =>
                  setCategorySearch(event.target.value)
                }
              />

              <div className="budget-cover-picker-list">
                {groupedAddableOptions.length > 0 ? (
                  groupedAddableOptions.map((group) => (
                    <div
                      className="budget-cover-picker-group"
                      key={group.groupName}
                    >
                      <div className="budget-cover-picker-group-heading">
                        {group.groupName}
                      </div>

                      {group.options.map((option) => (
                        <button
                          className="budget-cover-picker-option"
                          type="button"
                          key={option.id}
                          onClick={() => addCategory(option)}
                        >
                          <span>{option.name}</span>

                          <strong>
                            {formatMoney(
                              option.available,
                              currencyCode,
                            )}{" "}
                            available
                          </strong>
                        </button>
                      ))}
                    </div>
                  ))
                ) : (
                  <p className="budget-cover-picker-empty">
                    No matching categories with available money.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="budget-cover-menu-footer">
        <button
          className="button secondary"
          type="button"
          onClick={onClose}
        >
          Cancel
        </button>

        <button
          className="button button-primary"
          type="button"
          disabled={!canCover}
          onClick={() => {
            onCoverOverspending({
              overspentCategoryId: overspentCategory.id,
              sources: selectedSources,
            });
          }}
        >
          Cover {formatMoney(selectedTotal, currencyCode)}
        </button>
      </div>
    </FloatingMenu>
  );
}
