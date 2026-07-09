import { ArrowRightLeft } from "lucide-react";
import {
  FloatingMenu,
  FloatingMenuHeading,
  FloatingMenuItem,
  FloatingMenuList,
  type FloatingPosition,
} from "../floatingUi";
import { formatMoney } from "./budgetMoneyDisplay";
import type { BudgetCategoryView } from "./budgetViewTypes";
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
}

function getOverspentAmount(category: BudgetCategoryView | null) {
  if (!category) {
    return 0;
  }

  return Math.abs(Math.min(0, category.available));
}

export function BudgetCoverOverspendingMenu({
  isOpen,
  position,
  overspentCategory,
  coverOptions,
  currencyCode,
  onClose,
  onCoverOverspending,
}: BudgetCoverOverspendingMenuProps) {
  const overspentAmount = getOverspentAmount(overspentCategory);
  const availableCoverOptions = coverOptions.filter(
    (option) =>
      overspentCategory !== null &&
      option.id !== overspentCategory.id &&
      option.available > 0,
  );

  if (!overspentCategory || overspentAmount <= 0) {
    return null;
  }

  return (
    <FloatingMenu
      isOpen={isOpen}
      label="Cover overspending from category"
      layerClassName="budget-cover-menu-layer floating-menu-layer"
      panelClassName="budget-cover-menu floating-menu-panel"
      position={position}
      onClose={onClose}
    >
      <FloatingMenuHeading
        className="budget-cover-menu-heading floating-menu-heading"
        title="Cover overspending from…"
        subtitle={`${overspentCategory.name} is overspent by ${formatMoney(overspentAmount, currencyCode)}`}
      />

      {availableCoverOptions.length > 0 ? (
        <FloatingMenuList className="budget-cover-source-list floating-menu-list">
          {availableCoverOptions.map((option) => {
            const amount = Math.min(overspentAmount, option.available);

            return (
              <FloatingMenuItem
                key={option.id}
                className="budget-cover-source-item"
                icon={ArrowRightLeft}
                title={`Move ${formatMoney(amount, currencyCode)} from ${option.name}`}
                onClick={() => {
                  onClose();
                  onCoverOverspending({
                    overspentCategoryId: overspentCategory.id,
                    coveringCategoryId: option.id,
                    amount,
                  });
                }}
              >
                <span className="budget-cover-source-label">
                  <strong>{option.name}</strong>
                  <small>{option.groupName}</small>
                </span>
                <span className="budget-cover-source-amount">
                  {formatMoney(option.available, currencyCode)} available
                </span>
              </FloatingMenuItem>
            );
          })}
        </FloatingMenuList>
      ) : (
        <p className="budget-cover-menu-empty">
          No other category currently has available money to cover this overspending.
        </p>
      )}
    </FloatingMenu>
  );
}
