import React, { useState, type CSSProperties, type MouseEvent } from "react";
import { ArrowRight } from "lucide-react";
import type { CategoryGoalProjection } from "../../../../../packages/types/src/CategoryGoalProjection";
import { MoneyInput } from "../money/MoneyInput";
import type { BudgetCategoryGroupView, BudgetCategoryView } from "./budgetViewTypes";
import { isCreditCardPaymentCategory } from "./creditCardPaymentCategories";
import { formatMoney, getAvailableClass } from "./budgetMoneyDisplay";
import { CategoryLabel } from "../icons/CategoryIcon";
import { isMoneyNegative } from "./moneyMath";

export type BudgetColumnId = "category" | "assigned" | "activity" | "available";
type BudgetSortableKind = "category" | "group";

export function getCategorySortableId(categoryId: string) {
  return `category:${categoryId}`;
}

export function getGroupSortableId(groupId: string) {
  return `group:${groupId}`;
}

export function getSortableKind(id: string): BudgetSortableKind | null {
  if (id.startsWith("category:")) {
    return "category";
  }

  if (id.startsWith("group:")) {
    return "group";
  }

  return null;
}

export function getSortableEntityId(id: string) {
  return id.split(":").slice(1).join(":");
}

function formatGoalTargetMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthLabels = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${monthLabels[monthNumber! - 1]} ${year}`;
}

export function formatCategoryGoalRowStatus(
  projection: CategoryGoalProjection,
  currencyCode: string,
): { copy: string; percentComplete: number; tone: "normal" | "funded" | "overdue" } {
  const progress = `${formatMoney(projection.progressAmount, currencyCode)} / ${formatMoney(projection.goal.targetAmount, currencyCode)}`;
  const targetMonth = projection.goal.type === "target-balance-by-date"
    ? ` · ${formatGoalTargetMonth(projection.goal.targetMonth!)}`
    : "";
  const status = projection.status === "funded"
    ? " ✓"
    : projection.status === "overdue"
      ? " · Overdue"
      : "";
  return {
    copy: `${progress}${targetMonth}${status}`,
    percentComplete: Math.min(100, Math.max(0, projection.percentComplete)),
    tone: projection.status === "funded"
      ? "funded"
      : projection.status === "overdue"
        ? "overdue"
        : "normal",
  };
}

export function CategoryGoalRowStatus({
  category,
  currencyCode,
  managed = false,
  onSelect,
}: {
  category: BudgetCategoryView;
  currencyCode: string;
  managed?: boolean;
  onSelect?: () => void;
}) {
  if (managed || !category.goal) return null;
  const status = formatCategoryGoalRowStatus(category.goal, currencyCode);
  return (
    <span
      className={`budget-category-goal-status budget-category-goal-status-${status.tone}`}
      onClick={onSelect ? (event) => {
        event.stopPropagation();
        onSelect();
      } : undefined}
    >
      <span className="budget-category-goal-status-text">{status.copy}</span>
      <span
        className="budget-category-goal-progress"
        role="progressbar"
        aria-label={`${category.name} Goal progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.percentComplete}
      >
        <span style={{ width: `${status.percentComplete}%` }} />
      </span>
    </span>
  );
}

function EditableAssignedCell({
  category,
  currencyCode,
  isOverassignedSource,
  onSave,
}: {
  category: BudgetCategoryView;
  currencyCode: string;
  isOverassignedSource: boolean;
  onSave: (value: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <MoneyInput
        className="assigned-input"
        errorClassName="assigned-input-error"
        autoFocus
        value={category.assigned}
        onFocus={(event) => event.currentTarget.select()}
        onCommit={(value) => {
          onSave(value);
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
        title="Try 150, +50, -25, 100+50, or 200/2"
      />
    );
  }

  return (
    <button
      className={
        isOverassignedSource
          ? "assigned-button assigned-button-warning"
          : "assigned-button"
      }
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setIsEditing(true);
      }}
      title="Click to edit. Supports +50, -25, or 100+50."
    >
      {formatMoney(category.assigned, currencyCode)}
    </button>
  );
}

function BudgetCategoryRow({
  category,
  groupId,
  currencyCode,
  isSelected,
  isOverassignedSource,
  onSelect,
  onOpenCategoryEditor,
  onOpenCategoryContextMenu,
  onOpenCoverOverspending,
  onAssignedChange,
  onActivityClick,
  isBudgetColumnVisible,
  rowStyle,
  isCreditCardPaymentCategory,
  isArchivedCollection,
  originalGroupName,
}: {
  category: BudgetCategoryView;
  groupId: string;
  currencyCode: string;
  isSelected: boolean;
  isOverassignedSource: boolean;
  onSelect: () => void;
  onOpenCategoryEditor: () => void;
  onOpenCategoryContextMenu?: (event: MouseEvent<HTMLElement>) => void;
  onOpenCoverOverspending?: (event: MouseEvent<HTMLElement>) => void;
  onAssignedChange: (value: number) => void;
  onActivityClick: () => void;
  isBudgetColumnVisible: (columnId: BudgetColumnId) => boolean;
  rowStyle: CSSProperties;
  isCreditCardPaymentCategory: boolean;
  isArchivedCollection: boolean;
  originalGroupName?: string;
}) {
  const categoryNotePreview = category.note?.trim().split(/\r?\n/)[0] ?? "";
  const canCoverOverspending =
    isMoneyNegative(category.available) &&
    !isCreditCardPaymentCategory &&
    Boolean(onOpenCoverOverspending);

  return (
    <button
      type="button"
      className={[
        "budget-workspace-row interactive-budget-row",
        isSelected ? "budget-workspace-row-selected" : "",
        isCreditCardPaymentCategory ? "budget-workspace-row-system" : "",
      ].filter(Boolean).join(" ")}
      onClick={onSelect}
      onContextMenu={(event) => {
        if (!onOpenCategoryContextMenu) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onSelect();
        onOpenCategoryContextMenu(event);
      }}
      style={rowStyle}
    >
      <div
        className={
          isCreditCardPaymentCategory
            ? "budget-category-cell budget-category-system-cell"
            : isArchivedCollection
              ? "budget-category-cell budget-category-archived-collection-cell"
              : "budget-category-cell budget-category-drag-region"
        }
        title={
          isCreditCardPaymentCategory
            ? "Credit card payment categories are managed by the budget"
            : isArchivedCollection
              ? `Archived category${originalGroupName ? ` from ${originalGroupName}` : ""}`
              : "Drag category name to reorder"
        }
        onClick={(event) => event.stopPropagation()}
      >
        {isCreditCardPaymentCategory ? (
          <span
            className="budget-category-system-icon"
            aria-hidden="true"
            title="Managed credit card payment category"
          >
            •
          </span>
        ) : isArchivedCollection ? (
          <span className="budget-category-archived-icon" aria-hidden="true">
            ↳
          </span>
        ) : (
          <span
            className="drag-handle drag-handle-active"
            aria-hidden="true"
          >
            ⋮⋮
          </span>
        )}

        <div className="budget-category-label-stack">
          <span className="budget-category-name-line">
            <span
              className="budget-category-name-button"
              role="button"
              tabIndex={0}
              title={
                isCreditCardPaymentCategory
                  ? "Managed by credit card payment funding"
                  : "Edit category name, note, or archive status"
              }
              aria-disabled={isCreditCardPaymentCategory}
              onClick={(event) => {
                event.stopPropagation();

                if (!isCreditCardPaymentCategory) {
                  onOpenCategoryEditor();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();

                  if (!isCreditCardPaymentCategory) {
                    onOpenCategoryEditor();
                  }
                }
              }}
            >
              <strong className="budget-category-name"><CategoryLabel categoryName={category.name} /></strong>
            </span>
            {category.isArchived ? (
              <span className="category-archived-badge">Archived</span>
            ) : null}
            {isCreditCardPaymentCategory ? (
              <span className="category-system-badge">Managed</span>
            ) : null}
            {categoryNotePreview ? (
              <span
                className="category-note-indicator"
                title={category.note?.trim()}
                aria-label="Category has a note"
              >
                ✎
              </span>
            ) : null}
          </span>
          {isArchivedCollection && originalGroupName ? (
            <span className="budget-category-original-group">
              Originally in {originalGroupName}
            </span>
          ) : null}
          <CategoryGoalRowStatus
            category={category}
            currencyCode={currencyCode}
            managed={isCreditCardPaymentCategory}
            onSelect={onSelect}
          />

        </div>
      </div>

      {isBudgetColumnVisible("assigned") ? (
        <EditableAssignedCell
          category={category}
          currencyCode={currencyCode}
          isOverassignedSource={isOverassignedSource}
          onSave={onAssignedChange}
        />
      ) : null}

      {isBudgetColumnVisible("activity") ? (
        <button
          className="activity-drilldown-button"
          type="button"
          disabled={category.activity === 0}
          onClick={(event) => {
            event.stopPropagation();
            onActivityClick();
          }}
          title={
            category.activity === 0
              ? "No activity for this category"
              : "Show activity transactions"
          }
        >
          {formatMoney(category.activity, currencyCode)}
        </button>
      ) : null}

      {isBudgetColumnVisible("available") ? (
        <span className="budget-available-action-cell">
          {canCoverOverspending ? (
            <button
              className={`${getAvailableClass(
                category.available,
                isOverassignedSource,
              )} budget-available-cover-button`}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelect();
                onOpenCoverOverspending?.(event);
              }}
              title={`Cover overspending for ${category.name}`}
              aria-label={`Cover overspending for ${category.name}`}
            >
              {formatMoney(category.available, currencyCode)}
              {category.overspendingHandling === "carry-category" ? (
                <ArrowRight
                  className="budget-confined-overspending-icon"
                  aria-label="Negative balance will carry into this category next month"
                />
              ) : null}
            </button>
          ) : (
            <strong
              className={getAvailableClass(
                category.available,
                isOverassignedSource,
              )}
            >
              {formatMoney(category.available, currencyCode)}
            </strong>
          )}
        </span>
      ) : null}
    </button>
  );
}

export function BudgetGroup({
  group,
  currencyCode,
  selectedCategoryId,
  overassignedCategoryIds,
  onSelectCategory,
  onOpenCategoryEditor,
  onOpenCategoryContextMenu,
  onOpenCoverOverspending,
  onAssignedChange,
  onActivityClick,
  isBudgetColumnVisible,
  rowStyle,
  isCreditCardPaymentGroup,
  isArchivedCategoriesGroup,
  originalGroupByCategoryId,
  isCollapsed,
  onToggleCollapsed,
}: {
  group: BudgetCategoryGroupView;
  currencyCode: string;
  selectedCategoryId: string | null;
  overassignedCategoryIds: string[];
  onSelectCategory: (categoryId: string) => void;
  onOpenCategoryEditor: (categoryId: string) => void;
  onOpenCategoryContextMenu?: (input: {
    event: MouseEvent<HTMLElement>;
    category: BudgetCategoryView;
    group: BudgetCategoryGroupView;
  }) => void;
  onOpenCoverOverspending?: (input: {
    event: MouseEvent<HTMLElement>;
    category: BudgetCategoryView;
  }) => void;
  onAssignedChange: (categoryId: string, value: number) => void;
  onActivityClick: (categoryId: string) => void;
  isBudgetColumnVisible: (columnId: BudgetColumnId) => boolean;
  rowStyle: CSSProperties;
  isCreditCardPaymentGroup: boolean;
  isArchivedCategoriesGroup: boolean;
  originalGroupByCategoryId: ReadonlyMap<string, BudgetCategoryGroupView>;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const groupHasOverassignedCategory = group.categories.some((category) =>
    overassignedCategoryIds.includes(category.id),
  );
  return (
    <section
      className={[
        "budget-workspace-group",
        isCreditCardPaymentGroup ? "budget-workspace-group-system" : "",
        isArchivedCategoriesGroup ? "budget-workspace-group-archived" : "",
      ].filter(Boolean).join(" ")}
    >
      <div
        className={[
          "budget-workspace-group-header",
          isCreditCardPaymentGroup ? "budget-workspace-group-header-system" : "",
          isArchivedCategoriesGroup ? "budget-workspace-group-header-archived" : "",
        ].filter(Boolean).join(" ")}
        style={rowStyle}
      >
        <div
          className={
            isCreditCardPaymentGroup
              ? "budget-group-title budget-group-system-title"
              : isArchivedCategoriesGroup
                ? "budget-group-title budget-group-archived-title"
                : "budget-group-title budget-group-name-drag-region"
          }
          title={
            isCreditCardPaymentGroup
              ? "Money reserved to pay your credit cards"
              : isArchivedCategoriesGroup
                ? "Archived categories from all category groups"
                : "Drag category group name to reorder groups"
          }
        >
          {isCreditCardPaymentGroup ? (
            <span
              className="budget-group-system-icon"
              aria-hidden="true"
            >
              •
            </span>
          ) : isArchivedCategoriesGroup ? (
            <span className="budget-group-archived-icon" aria-hidden="true">
              ◫
            </span>
          ) : (
            <span
              className="drag-handle drag-handle-active budget-group-drag-handle"
              aria-hidden="true"
            >
              ⋮⋮
            </span>
          )}
          <button
            className="budget-group-collapse-button"
            type="button"
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${group.name}`}
            title={`${isCollapsed ? "Expand" : "Collapse"} ${group.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleCollapsed();
            }}
          >
            <span
              className={
                isCollapsed
                  ? "budget-group-collapse-chevron budget-group-collapse-chevron-collapsed"
                  : "budget-group-collapse-chevron"
              }
              aria-hidden="true"
            >
              ▾
            </span>
          </button>
          <strong>{group.name}</strong>
          {group.note?.trim() ? (
            <span
              className="category-note-indicator"
              title={group.note.trim()}
              aria-label="Category group has a note"
            >
              ✎
            </span>
          ) : null}
          {isCreditCardPaymentGroup ? (
            <span
              className="budget-group-info-pill"
              title="Money reserved to pay your credit cards"
              aria-label="Money reserved to pay your credit cards"
            >
              Money reserved for card payments
            </span>
          ) : null}
        </div>

        {isBudgetColumnVisible("assigned") ? (
          <strong className="budget-assigned-cell">
            {formatMoney(group.assigned, currencyCode)}
          </strong>
        ) : null}
        {isBudgetColumnVisible("activity") ? (
          <strong className="budget-activity-cell">
            {formatMoney(group.activity, currencyCode)}
          </strong>
        ) : null}
        {isBudgetColumnVisible("available") ? (
          <strong
            className={`${getAvailableClass(
              group.available,
              groupHasOverassignedCategory,
            )} budget-available-cell`}
          >
            {formatMoney(group.available, currencyCode)}
          </strong>
        ) : null}
      </div>

      {!isCollapsed
        ? group.categories.map((category) => {
          const isOverassignedSource = overassignedCategoryIds.includes(
            category.id,
          );

          return (
            <BudgetCategoryRow
              key={category.id}
              category={category}
              groupId={group.id}
              currencyCode={currencyCode}
              isSelected={selectedCategoryId === category.id}
              isOverassignedSource={isOverassignedSource}
              onSelect={() => onSelectCategory(category.id)}
              onOpenCategoryEditor={() => onOpenCategoryEditor(category.id)}
              onOpenCategoryContextMenu={
                onOpenCategoryContextMenu
                  ? (event) =>
                      onOpenCategoryContextMenu({
                        event,
                        category,
                        group: originalGroupByCategoryId.get(category.id) ?? group,
                      })
                  : undefined
              }
              onOpenCoverOverspending={
                onOpenCoverOverspending
                  ? (event) =>
                      onOpenCoverOverspending({
                        event,
                        category,
                      })
                  : undefined
              }
              onAssignedChange={(value) => onAssignedChange(category.id, value)}
              onActivityClick={() => onActivityClick(category.id)}
              isBudgetColumnVisible={isBudgetColumnVisible}
              rowStyle={rowStyle}
              isCreditCardPaymentCategory={isCreditCardPaymentCategory(category.id)}
              isArchivedCollection={isArchivedCategoriesGroup}
              originalGroupName={originalGroupByCategoryId.get(category.id)?.name}
            />
          );
          })
        : null}
    </section>
  );
}
