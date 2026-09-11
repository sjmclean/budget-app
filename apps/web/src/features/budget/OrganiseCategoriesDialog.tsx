import React, { useEffect, useRef, useState, type DragEvent } from "react";
import { ChevronDown, ChevronUp, GripVertical, X } from "lucide-react";
import type { BudgetCategoryGroupView } from "./budgetViewTypes";
import { isCreditCardPaymentCategory, isCreditCardPaymentGroup } from "./creditCardPaymentCategories";

type CategoryDrop = { categoryId: string; placement: "before" | "after" };
type GroupDrop = { groupId: string; placement: "before" | "after" };

export function getOrganisableCategoryGroups(groups: BudgetCategoryGroupView[]) {
  return groups
    .filter((group) => !isCreditCardPaymentGroup(group.id))
    .map((group) => ({
      ...group,
      categories: group.categories.filter(
        (category) => !category.isArchived && !isCreditCardPaymentCategory(category.id),
      ),
    }))
    .filter((group) => group.categories.length > 0);
}

export function OrganiseCategoriesDialog({
  groups,
  onClose,
  onMoveCategory,
  onPositionCategory,
  onMoveGroup,
  onPositionGroup,
}: {
  groups: BudgetCategoryGroupView[];
  onClose: () => void;
  onMoveCategory: (categoryId: string, direction: "up" | "down") => void;
  onPositionCategory: (categoryId: string, targetCategoryId: string, placement: "before" | "after") => void;
  onMoveGroup: (groupId: string, direction: "up" | "down") => void;
  onPositionGroup: (groupId: string, targetGroupId: string, placement: "before" | "after") => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [categoryDrop, setCategoryDrop] = useState<CategoryDrop | null>(null);
  const [groupDrop, setGroupDrop] = useState<GroupDrop | null>(null);
  const organisableGroups = getOrganisableCategoryGroups(groups);

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function placementFor(event: DragEvent<HTMLElement>): "before" | "after" {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  }

  function moveToGroup(categoryId: string, targetGroupId: string) {
    const sourceGroup = organisableGroups.find((group) =>
      group.categories.some((category) => category.id === categoryId),
    );
    if (!sourceGroup || sourceGroup.id === targetGroupId) return;
    const target = organisableGroups.find((group) => group.id === targetGroupId)?.categories.at(-1);
    if (target) onPositionCategory(categoryId, target.id, "after");
  }

  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        ref={dialogRef}
        className="app-dialog organise-categories-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="organise-categories-title"
        tabIndex={-1}
      >
        <header className="organise-categories-header">
          <div>
            <h2 id="organise-categories-title">Organise Categories</h2>
            <p>Reorder categories and move them between category groups.</p>
          </div>
          <button className="budget-activity-modal-close" type="button" onClick={onClose} aria-label="Close Organise Categories">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="organise-categories-list">
          {organisableGroups.map((group, groupIndex) => (
            <section
              className={`organise-category-group${groupDrop?.groupId === group.id ? ` organise-drop-${groupDrop.placement}` : ""}`}
              key={group.id}
              onDragOver={(event) => {
                if (!draggedGroupId || draggedGroupId === group.id) return;
                event.preventDefault();
                setGroupDrop({ groupId: group.id, placement: placementFor(event) });
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedGroupId && draggedGroupId !== group.id) {
                  onPositionGroup(draggedGroupId, group.id, groupDrop?.placement ?? "before");
                }
                setDraggedGroupId(null);
                setGroupDrop(null);
              }}
            >
              <header className="organise-category-group-header">
                <span draggable onDragStart={(event) => {
                  setDraggedGroupId(group.id);
                  event.dataTransfer.effectAllowed = "move";
                }} onDragEnd={() => { setDraggedGroupId(null); setGroupDrop(null); }} title={`Drag ${group.name} to reorder groups`}>
                  <GripVertical size={17} aria-hidden="true" />
                </span>
                <strong>{group.name}</strong>
                <span className="organise-category-actions">
                  <button type="button" disabled={groupIndex === 0} onClick={() => onMoveGroup(group.id, "up")} aria-label={`Move ${group.name} group up`}><ChevronUp size={16} /></button>
                  <button type="button" disabled={groupIndex === organisableGroups.length - 1} onClick={() => onMoveGroup(group.id, "down")} aria-label={`Move ${group.name} group down`}><ChevronDown size={16} /></button>
                </span>
              </header>
              <ul>
                {group.categories.map((category, categoryIndex) => (
                  <li
                    key={category.id}
                    className={categoryDrop?.categoryId === category.id ? `organise-drop-${categoryDrop.placement}` : undefined}
                    onDragOver={(event) => {
                      if (!draggedCategoryId || draggedCategoryId === category.id) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setCategoryDrop({ categoryId: category.id, placement: placementFor(event) });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (draggedCategoryId && draggedCategoryId !== category.id) {
                        onPositionCategory(draggedCategoryId, category.id, categoryDrop?.placement ?? "before");
                      }
                      setDraggedCategoryId(null);
                      setCategoryDrop(null);
                    }}
                  >
                    <span draggable onDragStart={(event) => {
                      setDraggedCategoryId(category.id);
                      event.dataTransfer.effectAllowed = "move";
                    }} onDragEnd={() => { setDraggedCategoryId(null); setCategoryDrop(null); }} title={`Drag ${category.name} to reorder`}>
                      <GripVertical size={16} aria-hidden="true" />
                    </span>
                    <span className="organise-category-name">{category.name}</span>
                    <span className="organise-category-actions">
                      <button type="button" disabled={categoryIndex === 0} onClick={() => onMoveCategory(category.id, "up")} aria-label={`Move ${category.name} up`}><ChevronUp size={15} /></button>
                      <button type="button" disabled={categoryIndex === group.categories.length - 1} onClick={() => onMoveCategory(category.id, "down")} aria-label={`Move ${category.name} down`}><ChevronDown size={15} /></button>
                      <label>
                        <span className="sr-only">Move {category.name} to group</span>
                        <select aria-label={`Move ${category.name} to group`} value={group.id} onChange={(event) => moveToGroup(category.id, event.target.value)}>
                          {organisableGroups.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                        </select>
                      </label>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer className="organise-categories-footer">
          <span>Changes are saved automatically and can be undone from the Budget toolbar.</span>
          <button className="button button-primary" type="button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  );
}
