import "../../styles/budgetCoverOverspending.css";
import {
  FloatingMenu,
  FloatingMenuHeading,
  FloatingMenuItem,
  FloatingMenuList,
  type FloatingPosition,
} from "../floatingUi";
import { formatMoney } from "./budgetMoneyDisplay";
import type {
  BudgetCategoryView,
  OverspendingHandling,
} from "./budgetViewTypes";
import type { OverspendingCoverOption } from "./budgetWorkspaceSelectors";

interface BudgetCoverOverspendingMenuProps {
  isOpen: boolean;
  position: Pick<FloatingPosition, "top" | "left"> | null;
  overspentCategory: BudgetCategoryView | null;
  coverOptions: OverspendingCoverOption[];
  currencyCode: string;
  onClose: () => void;
  onCoverOverspending: (input: {
    overspentCategoryId: string;
    coveringCategoryId: string;
    amount: number;
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

function groupCoverOptions(options: OverspendingCoverOption[]) {
  const groups: OverspendingCoverOptionGroup[] = [];
  const groupByName = new Map<string, OverspendingCoverOptionGroup>();

  for (const option of options) {
    let group = groupByName.get(option.groupName);
    if (!group) {
      group = { groupName: option.groupName, options: [] };
      groupByName.set(option.groupName, group);
      groups.push(group);
    }
    group.options.push(option);
  }

  return groups;
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
  const availableCoverOptions = coverOptions.filter(
    (option) =>
      overspentCategory !== null &&
      option.id !== overspentCategory.id &&
      option.available > 0,
  );
  const groupedCoverOptions = groupCoverOptions(availableCoverOptions);

  if (!overspentCategory || overspentAmount <= 0) return null;

  const handling =
    overspentCategory.overspendingHandling ?? "reduce-next-month";

  return (
    <FloatingMenu
      isOpen={isOpen}
      label="Cover category overspending"
      layerClassName="budget-cover-menu-layer floating-menu-layer"
      panelClassName="budget-cover-menu floating-menu-panel"
      position={position}
      onClose={onClose}
    >
      <FloatingMenuHeading
        className="budget-cover-menu-heading floating-menu-heading"
        title="Category overspent"
        subtitle={`${overspentCategory.name} is overspent by ${formatMoney(overspentAmount, currencyCode)}`}
      />

      <section className="budget-cover-section" aria-labelledby="cover-overspending-heading">
        <div className="budget-cover-section-heading" id="cover-overspending-heading">
          Cover overspending
        </div>
        <p className="budget-cover-section-copy">
          Move available money from another category.
        </p>

        {groupedCoverOptions.length > 0 ? (
          <FloatingMenuList className="budget-cover-source-list floating-menu-list">
            {groupedCoverOptions.map((group, groupIndex) => {
              const headingId = `budget-cover-group-${groupIndex}`;
              return (
                <div
                  className="budget-cover-source-group"
                  key={group.groupName}
                  role="group"
                  aria-labelledby={headingId}
                >
                  <div className="budget-cover-source-group-heading" id={headingId}>
                    {group.groupName}
                  </div>
                  {group.options.map((option) => {
                    const amount = Math.min(overspentAmount, option.available);
                    return (
                      <FloatingMenuItem
                        key={option.id}
                        className="budget-cover-source-item"
                        title={`Move ${formatMoney(amount, currencyCode)} from ${option.name}`}
                        onClick={() => {
                          onCoverOverspending({
                            overspentCategoryId: overspentCategory.id,
                            coveringCategoryId: option.id,
                            amount,
                          });
                        }}
                      >
                        <span className="budget-cover-source-name">{option.name}</span>
                        <span className="budget-cover-source-amount">
                          {formatMoney(option.available, currencyCode)}
                        </span>
                      </FloatingMenuItem>
                    );
                  })}
                </div>
              );
            })}
          </FloatingMenuList>
        ) : (
          <p className="budget-cover-menu-empty">
            No other category currently has available money to cover this overspending.
          </p>
        )}
      </section>

      <fieldset className="budget-overspending-handling">
        <legend>If this category is still overspent when the month ends</legend>
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
            <small>The overspent amount will be deducted next month.</small>
          </span>
        </label>
        <label className="budget-overspending-option">
          <input
            type="radio"
            name={`overspending-handling-${overspentCategory.id}`}
            checked={handling === "carry-category"}
            onChange={() =>
              onSetOverspendingHandling(overspentCategory.id, "carry-category")
            }
          />
          <span>
            <strong>Carry the negative balance into this category</strong>
            <small>The category will remain negative next month.</small>
          </span>
        </label>
      </fieldset>

      <div className="budget-cover-menu-footer">
        <button className="button secondary" type="button" onClick={onClose}>
          Done
        </button>
      </div>
    </FloatingMenu>
  );
}
