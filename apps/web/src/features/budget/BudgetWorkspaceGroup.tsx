import { useState, type CSSProperties } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { evaluateAssignedInput } from "./evaluateAssignedInput";
import type { BudgetCategoryGroupView, BudgetCategoryView } from "./budgetViewTypes";
import { isCreditCardPaymentCategory } from "./creditCardPaymentCategories";
import { formatMoney, getAvailableClass } from "./budgetMoneyDisplay";
import { CategoryLabel } from "../icons/CategoryIcon";

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
  const [draft, setDraft] = useState(category.assigned.toFixed(2));
  const [hasError, setHasError] = useState(false);

  function save() {
    const value = evaluateAssignedInput(draft, category.assigned);

    if (value === null) {
      setHasError(true);
      return;
    }

    setHasError(false);
    onSave(value);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <input
        className={
          hasError ? "assigned-input assigned-input-error" : "assigned-input"
        }
        autoFocus
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setHasError(false);
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            save();
          }

          if (event.key === "Escape") {
            setDraft(category.assigned.toFixed(2));
            setHasError(false);
            setIsEditing(false);
          }
        }}
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
        setDraft(category.assigned.toFixed(2));
        setHasError(false);
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
  onAssignedChange,
  onActivityClick,
  isBudgetColumnVisible,
  rowStyle,
  isCreditCardPaymentCategory,
}: {
  category: BudgetCategoryView;
  groupId: string;
  currencyCode: string;
  isSelected: boolean;
  isOverassignedSource: boolean;
  onSelect: () => void;
  onOpenCategoryEditor: () => void;
  onAssignedChange: (value: number) => void;
  onActivityClick: () => void;
  isBudgetColumnVisible: (columnId: BudgetColumnId) => boolean;
  rowStyle: CSSProperties;
  isCreditCardPaymentCategory: boolean;
}) {
  const categoryNotePreview = category.note?.trim().split(/\r?\n/)[0] ?? "";
  const sortableId = getCategorySortableId(category.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    disabled: isCreditCardPaymentCategory,
    data: {
      type: "category",
      categoryId: category.id,
      groupId,
    },
  });
  const sortableStyle: CSSProperties = {
    ...rowStyle,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={[
        "budget-workspace-row interactive-budget-row",
        isSelected ? "budget-workspace-row-selected" : "",
        isDragging ? "budget-workspace-row-dragging budget-workspace-row-sortable-active" : "",
        isCreditCardPaymentCategory ? "budget-workspace-row-system" : "",
      ].filter(Boolean).join(" ")}
      onClick={onSelect}
      style={sortableStyle}
    >
      <div
        className={
          isCreditCardPaymentCategory
            ? "budget-category-cell budget-category-system-cell"
            : "budget-category-cell budget-category-drag-region"
        }
        title={
          isCreditCardPaymentCategory
            ? "Credit card payment categories are managed by the budget"
            : "Drag category name to reorder"
        }
        onClick={(event) => event.stopPropagation()}
        {...(isCreditCardPaymentCategory ? {} : attributes)}
        {...(isCreditCardPaymentCategory ? {} : listeners)}
      >
        {isCreditCardPaymentCategory ? (
          <span
            className="budget-category-system-icon"
            aria-hidden="true"
            title="Managed credit card payment category"
          >
            •
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
        <strong
          className={getAvailableClass(category.available, isOverassignedSource)}
        >
          {formatMoney(category.available, currencyCode)}
        </strong>
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
  onAssignedChange,
  onActivityClick,
  isBudgetColumnVisible,
  rowStyle,
  isCreditCardPaymentGroup,
}: {
  group: BudgetCategoryGroupView;
  currencyCode: string;
  selectedCategoryId: string | null;
  overassignedCategoryIds: string[];
  onSelectCategory: (categoryId: string) => void;
  onOpenCategoryEditor: (categoryId: string) => void;
  onAssignedChange: (categoryId: string, value: number) => void;
  onActivityClick: (categoryId: string) => void;
  isBudgetColumnVisible: (columnId: BudgetColumnId) => boolean;
  rowStyle: CSSProperties;
  isCreditCardPaymentGroup: boolean;
}) {
  const groupHasOverassignedCategory = group.categories.some((category) =>
    overassignedCategoryIds.includes(category.id),
  );
  const sortableId = getGroupSortableId(group.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    disabled: isCreditCardPaymentGroup,
    data: {
      type: "group",
      groupId: group.id,
    },
  });
  const sectionStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <section
      ref={setNodeRef}
      className={[
        "budget-workspace-group",
        isCreditCardPaymentGroup ? "budget-workspace-group-system" : "",
      ].filter(Boolean).join(" ")}
      style={sectionStyle}
    >
      <div
        className={[
          "budget-workspace-group-header",
          isDragging ? "budget-workspace-group-header-dragging budget-workspace-row-sortable-active" : "",
          isCreditCardPaymentGroup ? "budget-workspace-group-header-system" : "",
        ].filter(Boolean).join(" ")}
        style={rowStyle}
      >
        <div
          className={
            isCreditCardPaymentGroup
              ? "budget-group-title budget-group-system-title"
              : "budget-group-title budget-group-name-drag-region"
          }
          title={
            isCreditCardPaymentGroup
              ? "Money reserved to pay your credit cards"
              : "Drag category group name to reorder groups"
          }
          {...(isCreditCardPaymentGroup ? {} : attributes)}
          {...(isCreditCardPaymentGroup ? {} : listeners)}
        >
          {isCreditCardPaymentGroup ? (
            <span
              className="budget-group-system-icon"
              aria-hidden="true"
            >
              •
            </span>
          ) : (
            <span
              className="drag-handle drag-handle-active budget-group-drag-handle"
              aria-hidden="true"
            >
              ⋮⋮
            </span>
          )}
          <span>⌄</span>
          <strong>
            {group.name}
          </strong>
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
          <strong>{formatMoney(group.assigned, currencyCode)}</strong>
        ) : null}
        {isBudgetColumnVisible("activity") ? (
          <strong>{formatMoney(group.activity, currencyCode)}</strong>
        ) : null}
        {isBudgetColumnVisible("available") ? (
          <strong
            className={getAvailableClass(
              group.available,
              groupHasOverassignedCategory,
            )}
          >
            {formatMoney(group.available, currencyCode)}
          </strong>
        ) : null}
      </div>

      <SortableContext
        items={group.categories.map((category) => getCategorySortableId(category.id))}
        strategy={verticalListSortingStrategy}
      >
        {group.categories.map((category) => {
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
              onAssignedChange={(value) => onAssignedChange(category.id, value)}
              onActivityClick={() => onActivityClick(category.id)}
              isBudgetColumnVisible={isBudgetColumnVisible}
              rowStyle={rowStyle}
              isCreditCardPaymentCategory={isCreditCardPaymentCategory(category.id)}
            />
          );
        })}
      </SortableContext>
    </section>
  );
}
