import { useEffect, useState } from "react";
import "../../styles/budgetCoverOverspending.css";
import { FloatingMenu, FloatingMenuHeading, type FloatingPosition } from "../floatingUi";
import { BudgetCoverOverspendingContent } from "./BudgetCoverOverspendingMenu";
import type {
  BudgetCategoryGroupView,
  BudgetCategoryView,
  OverspendingHandling,
} from "./budgetViewTypes";
import type { OverspendingCoverOption } from "./budgetWorkspaceSelectors";
import { isCreditCardPaymentCategory } from "./creditCardPaymentCategories";
import {
  canCategoryUseCoverOverspending,
  resolveBudgetCategoryWindowTab,
  type BudgetCategoryWindowTab,
} from "./budgetCategoryWindowState";

interface BudgetCategoryWindowProps {
  isOpen: boolean;
  position: Pick<FloatingPosition, "top" | "left"> | null;
  category: BudgetCategoryView | null;
  group: BudgetCategoryGroupView | null;
  activeTab: BudgetCategoryWindowTab;
  coverOptions: OverspendingCoverOption[];
  currencyCode: string;
  onTabChange: (tab: BudgetCategoryWindowTab) => void;
  onClose: () => void;
  onCoverOverspending: (input: {
    overspentCategoryId: string;
    sources: { categoryId: string; amount: number }[];
  }) => void;
  onRenameCategory: (categoryId: string, name: string) => void;
  onSetCategoryArchived: (categoryId: string, isArchived: boolean) => void;
  onUpdateCategoryNote: (categoryId: string, note: string) => void;
  onSetOverspendingHandling: (
    categoryId: string,
    overspendingHandling: OverspendingHandling,
  ) => void;
}

function CategorySettingsContent({
  category,
  onRenameCategory,
  onSetCategoryArchived,
  onUpdateCategoryNote,
  onSetOverspendingHandling,
}: Pick<
  BudgetCategoryWindowProps,
  | "onRenameCategory"
  | "onSetCategoryArchived"
  | "onUpdateCategoryNote"
  | "onSetOverspendingHandling"
> & { category: BudgetCategoryView }) {
  const [draftName, setDraftName] = useState(category.name);
  const [draftCategoryNote, setDraftCategoryNote] = useState(category.note ?? "");

  useEffect(() => {
    setDraftName(category.name);
    setDraftCategoryNote(category.note ?? "");
  }, [category.id, category.name, category.note]);

  function saveRename() {
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setDraftName(category.name);
    } else if (trimmedName !== category.name) {
      onRenameCategory(category.id, trimmedName);
    }
  }

  function saveCategoryNote() {
    if (draftCategoryNote !== (category.note ?? "")) {
      onUpdateCategoryNote(category.id, draftCategoryNote);
    }
  }

  return (
    <div className="category-management-sections category-management-sections-compact">
      <section className="category-management-section">
        <h3>Category details</h3>
        <label className="category-management-field">
          <span>Category name</span>
          <input
            className="category-rename-input"
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={saveRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveRename();
              if (event.key === "Escape") setDraftName(category.name);
            }}
            aria-label="Category name"
          />
        </label>
        <label className="category-management-field">
          <span>Category note</span>
          <textarea
            className="category-note-textarea"
            value={draftCategoryNote}
            onChange={(event) => setDraftCategoryNote(event.target.value)}
            onBlur={saveCategoryNote}
            placeholder="Add reminders, rules, renewal dates, or category-specific instructions…"
            rows={5}
          />
        </label>
      </section>

      <section className="category-management-section">
        <h3>Overspending</h3>
        <fieldset className="category-settings-overspending">
          <legend>If this category is still overspent when the month ends:</legend>
          <label className="category-settings-overspending-option">
            <input
              type="radio"
              name={`overspending-handling-${category.id}`}
              value="reduce-next-month"
              checked={(category.overspendingHandling ?? "reduce-next-month") === "reduce-next-month"}
              onChange={() => onSetOverspendingHandling(category.id, "reduce-next-month")}
            />
            <span>
              <strong>Reduce next month&apos;s Ready to Assign</strong>
              <small>The remaining overspent amount will reduce next month&apos;s Ready to Assign.</small>
            </span>
          </label>
          <label className="category-settings-overspending-option">
            <input
              type="radio"
              name={`overspending-handling-${category.id}`}
              value="carry-category"
              checked={category.overspendingHandling === "carry-category"}
              onChange={() => onSetOverspendingHandling(category.id, "carry-category")}
            />
            <span>
              <strong>Carry the overspending in this category</strong>
              <small>The negative category balance will continue into the next month.</small>
            </span>
          </label>
        </fieldset>
        <p className="category-settings-overspending-help">
          This setting only controls what happens to remaining overspending at month end.
          You can cover overspending manually at any time.
        </p>
      </section>

      <section className="category-management-section category-management-actions-section">
        <h3>Actions</h3>
        <button
          className="button button-secondary category-archive-button"
          type="button"
          onClick={() => onSetCategoryArchived(category.id, !category.isArchived)}
        >
          {category.isArchived ? "Restore category" : "Archive category"}
        </button>
      </section>
    </div>
  );
}

export function BudgetCategoryWindow(props: BudgetCategoryWindowProps) {
  const { category, group } = props;
  if (!category || !group || isCreditCardPaymentCategory(category.id)) return null;

  const canCover = canCategoryUseCoverOverspending(category);
  const activeTab = resolveBudgetCategoryWindowTab(category, props.activeTab);
  const coverTabId = `category-window-cover-${category.id}`;
  const settingsTabId = `category-window-settings-${category.id}`;

  return (
    <FloatingMenu
      isOpen={props.isOpen}
      label={`${category.name} category actions`}
      layerClassName="budget-cover-menu-layer floating-menu-layer"
      panelClassName="budget-cover-menu budget-cover-menu-multi budget-category-window floating-menu-panel"
      position={props.position}
      onClose={props.onClose}
      autoFocusFirstItem={false}
    >
      <FloatingMenuHeading
        className="budget-cover-menu-heading floating-menu-heading"
        title={category.name}
        subtitle={`${group.name}${category.isArchived ? " · Archived" : ""}`}
      />
      <div className="budget-category-window-tabs" role="tablist" aria-label="Category actions">
        {canCover ? (
          <button
            id={coverTabId}
            type="button"
            role="tab"
            aria-selected={activeTab === "cover-overspending"}
            aria-controls={`${coverTabId}-panel`}
            className={activeTab === "cover-overspending" ? "is-active" : ""}
            onClick={() => props.onTabChange("cover-overspending")}
          >
            Cover Overspending
          </button>
        ) : null}
        <button
          id={settingsTabId}
          type="button"
          role="tab"
          aria-selected={activeTab === "settings"}
          aria-controls={`${settingsTabId}-panel`}
          className={activeTab === "settings" ? "is-active" : ""}
          onClick={() => props.onTabChange("settings")}
        >
          Category Settings
        </button>
      </div>

      {activeTab === "cover-overspending" && canCover ? (
        <div id={`${coverTabId}-panel`} role="tabpanel" aria-labelledby={coverTabId}>
          <BudgetCoverOverspendingContent
            overspentCategory={category}
            coverOptions={props.coverOptions}
            currencyCode={props.currencyCode}
            onClose={props.onClose}
            onCoverOverspending={props.onCoverOverspending}
          />
        </div>
      ) : (
        <div
          id={`${settingsTabId}-panel`}
          className="budget-category-settings-panel"
          role="tabpanel"
          aria-labelledby={settingsTabId}
        >
          <CategorySettingsContent
            category={category}
            onRenameCategory={props.onRenameCategory}
            onSetCategoryArchived={props.onSetCategoryArchived}
            onUpdateCategoryNote={props.onUpdateCategoryNote}
            onSetOverspendingHandling={props.onSetOverspendingHandling}
          />
        </div>
      )}
    </FloatingMenu>
  );
}
