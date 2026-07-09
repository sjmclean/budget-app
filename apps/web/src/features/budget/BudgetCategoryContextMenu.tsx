import { Archive, ArrowRightLeft, BarChart3, Pencil, RotateCcw, Settings } from "lucide-react";
import {
  FloatingMenu,
  FloatingMenuDivider,
  FloatingMenuHeading,
  FloatingMenuItem,
  type FloatingPosition,
} from "../floatingUi";
import type { BudgetCategoryGroupView, BudgetCategoryView } from "./budgetViewTypes";
import { isCreditCardPaymentCategory } from "./creditCardPaymentCategories";
import { isMoneyNegative } from "./moneyMath";

interface BudgetCategoryContextMenuProps {
  isOpen: boolean;
  position: Pick<FloatingPosition, "top" | "left"> | null;
  category: BudgetCategoryView | null;
  group: BudgetCategoryGroupView | null;
  hasActivity: boolean;
  onClose: () => void;
  onOpenActivity: (categoryId: string) => void;
  onOpenCoverOverspending: (categoryId: string) => void;
  onOpenManageCategory: (categoryId: string) => void;
  onRenameCategory: (categoryId: string) => void;
  onSetCategoryArchived: (categoryId: string, isArchived: boolean) => void;
}

export function BudgetCategoryContextMenu({
  isOpen,
  position,
  category,
  group,
  hasActivity,
  onClose,
  onOpenActivity,
  onOpenCoverOverspending,
  onOpenManageCategory,
  onRenameCategory,
  onSetCategoryArchived,
}: BudgetCategoryContextMenuProps) {
  const isManagedCategory = category
    ? isCreditCardPaymentCategory(category.id)
    : false;
  const canCoverOverspending = category
    ? isMoneyNegative(category.available) && !isManagedCategory
    : false;

  if (!category || !group) {
    return null;
  }

  return (
    <FloatingMenu
      isOpen={isOpen}
      label="Budget category actions"
      layerClassName="budget-context-menu-layer floating-menu-layer"
      panelClassName="budget-context-menu floating-menu-panel"
      position={position}
      onClose={onClose}
    >
      <FloatingMenuHeading
        className="budget-context-menu-heading floating-menu-heading"
        title={category.name}
        subtitle={group.name}
      />

      <FloatingMenuItem
        icon={BarChart3}
        disabled={!hasActivity}
        title={hasActivity ? "View category activity" : "No activity this month"}
        onClick={() => {
          onClose();
          onOpenActivity(category.id);
        }}
      >
        View Activity
      </FloatingMenuItem>

      <FloatingMenuItem
        icon={ArrowRightLeft}
        disabled={!canCoverOverspending}
        title={canCoverOverspending ? "Cover overspending from another category" : "Only overspent editable categories can be covered"}
        onClick={() => {
          onClose();
          onOpenCoverOverspending(category.id);
        }}
      >
        Cover overspending from…
      </FloatingMenuItem>

      <FloatingMenuDivider />

      <FloatingMenuItem
        icon={Pencil}
        disabled={isManagedCategory}
        title={isManagedCategory ? "Managed categories cannot be renamed" : "Rename category"}
        onClick={() => {
          onClose();
          onRenameCategory(category.id);
        }}
      >
        Rename Category
      </FloatingMenuItem>

      <FloatingMenuItem
        icon={Settings}
        disabled={isManagedCategory}
        title={isManagedCategory ? "Managed categories cannot be edited" : "Manage category settings"}
        onClick={() => {
          onClose();
          onOpenManageCategory(category.id);
        }}
      >
        Manage Category…
      </FloatingMenuItem>

      <FloatingMenuItem
        icon={category.isArchived ? RotateCcw : Archive}
        variant={category.isArchived ? "success" : "danger"}
        disabled={isManagedCategory}
        title={isManagedCategory ? "Managed categories cannot be archived" : undefined}
        onClick={() => {
          onClose();
          onSetCategoryArchived(category.id, !category.isArchived);
        }}
      >
        {category.isArchived ? "Restore Category" : "Archive Category"}
      </FloatingMenuItem>
    </FloatingMenu>
  );
}
