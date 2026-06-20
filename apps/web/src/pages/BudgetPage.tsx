import { useEffect, useState } from "react";
import { Card } from "../components/ui/Card";
import { evaluateAssignedInput } from "../features/budget/evaluateAssignedInput";
import { useBudgetWorkspace } from "../features/budget/useBudgetWorkspace";
import type {
  BudgetCategoryGroupView,
  BudgetCategoryView,
  CategoryMergePreview,
} from "../features/budget/budgetViewTypes";

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

function getAvailableClass(value: number, isOverassignedSource: boolean) {
  if (value < 0) {
    return "available-pill available-pill-negative";
  }

  if (value === 0) {
    return "available-pill available-pill-zero";
  }

  if (isOverassignedSource) {
    return "available-pill available-pill-warning";
  }

  return "available-pill available-pill-positive";
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
  currencyCode,
  isSelected,
  isOverassignedSource,
  onSelect,
  onAssignedChange,
}: {
  category: BudgetCategoryView;
  currencyCode: string;
  isSelected: boolean;
  isOverassignedSource: boolean;
  onSelect: () => void;
  onAssignedChange: (value: number) => void;
}) {
  return (
    <button
      type="button"
      className={[
        "budget-workspace-row interactive-budget-row",
        isSelected ? "budget-workspace-row-selected" : "",
      ].join(" ")}
      onClick={onSelect}
    >
      <div className="budget-category-cell">
        <span className="drag-handle" title="Reorder categories later">
          ⋮⋮
        </span>
        <strong className="budget-category-name">{category.name}</strong>
        {category.isArchived ? (
          <span className="category-archived-badge">Archived</span>
        ) : null}
      </div>

      <EditableAssignedCell
        category={category}
        currencyCode={currencyCode}
        isOverassignedSource={isOverassignedSource}
        onSave={onAssignedChange}
      />

      <span>{formatMoney(category.activity, currencyCode)}</span>

      <strong
        className={getAvailableClass(category.available, isOverassignedSource)}
      >
        {formatMoney(category.available, currencyCode)}
      </strong>
    </button>
  );
}

function BudgetGroup({
  group,
  currencyCode,
  selectedCategoryId,
  overassignedCategoryIds,
  onSelectCategory,
  onAssignedChange,
}: {
  group: BudgetCategoryGroupView;
  currencyCode: string;
  selectedCategoryId: string | null;
  overassignedCategoryIds: string[];
  onSelectCategory: (categoryId: string) => void;
  onAssignedChange: (categoryId: string, value: number) => void;
}) {
  const groupHasOverassignedCategory = group.categories.some((category) =>
    overassignedCategoryIds.includes(category.id),
  );

  return (
    <section className="budget-workspace-group">
      <div className="budget-workspace-group-header">
        <div className="budget-group-title">
          <span>⌄</span>
          <strong>{group.name}</strong>
        </div>

        <strong>{formatMoney(group.assigned, currencyCode)}</strong>
        <strong>{formatMoney(group.activity, currencyCode)}</strong>
        <strong
          className={getAvailableClass(
            group.available,
            groupHasOverassignedCategory,
          )}
        >
          {formatMoney(group.available, currencyCode)}
        </strong>
      </div>

      {group.categories.map((category) => {
        const isOverassignedSource = overassignedCategoryIds.includes(
          category.id,
        );

        return (
          <BudgetCategoryRow
            key={category.id}
            category={category}
            currencyCode={currencyCode}
            isSelected={selectedCategoryId === category.id}
            isOverassignedSource={isOverassignedSource}
            onSelect={() => onSelectCategory(category.id)}
            onAssignedChange={(value) => onAssignedChange(category.id, value)}
          />
        );
      })}
    </section>
  );
}

function CategoryInspector({
  category,
  group,
  currencyCode,
  isOverassignedSource,
  canMoveCategoryUp,
  canMoveCategoryDown,
  canMoveGroupUp,
  canMoveGroupDown,
  mergeTargetOptions,
  mergePreview,
  isMergePreviewLoading,
  onRenameCategory,
  onSetCategoryArchived,
  onMoveCategory,
  onMoveCategoryGroup,
  onPreviewCategoryMerge,
  onMergeCategory,
  onClearCategoryMergePreview,
}: {
  category: BudgetCategoryView | null;
  group: BudgetCategoryGroupView | null;
  currencyCode: string;
  isOverassignedSource: boolean;
  canMoveCategoryUp: boolean;
  canMoveCategoryDown: boolean;
  canMoveGroupUp: boolean;
  canMoveGroupDown: boolean;
  mergeTargetOptions: Array<{ id: string; name: string; groupName: string }>;
  mergePreview: CategoryMergePreview | null;
  isMergePreviewLoading: boolean;
  onRenameCategory: (categoryId: string, name: string) => void;
  onSetCategoryArchived: (categoryId: string, isArchived: boolean) => void;
  onMoveCategory: (categoryId: string, direction: "up" | "down") => void;
  onMoveCategoryGroup: (groupId: string, direction: "up" | "down") => void;
  onPreviewCategoryMerge: (
    sourceCategoryId: string,
    targetCategoryId: string,
  ) => void;
  onMergeCategory: (sourceCategoryId: string, targetCategoryId: string) => void;
  onClearCategoryMergePreview: () => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(category?.name ?? "");
  const [mergeTargetId, setMergeTargetId] = useState("");

  useEffect(() => {
    setDraftName(category?.name ?? "");
    setIsRenaming(false);
    setMergeTargetId("");
  }, [category?.id, category?.name]);

  function startRename() {
    if (!category) {
      return;
    }

    setDraftName(category.name);
    setIsRenaming(true);
  }

  function cancelRename() {
    setDraftName(category?.name ?? "");
    setIsRenaming(false);
  }

  function saveRename() {
    if (!category) {
      return;
    }

    const trimmedName = draftName.trim();

    if (!trimmedName) {
      setDraftName(category.name);
      setIsRenaming(false);
      return;
    }

    if (trimmedName !== category.name) {
      onRenameCategory(category.id, trimmedName);
    }

    setIsRenaming(false);
  }
  function previewMerge() {
    if (!category || !mergeTargetId) {
      return;
    }

    onPreviewCategoryMerge(category.id, mergeTargetId);
  }

  function mergeCategory() {
    if (!category || !activeMergePreview) {
      return;
    }

    const confirmed = window.confirm(
      `Merge ${activeMergePreview.sourceCategoryName} into ${activeMergePreview.targetCategoryName}? This will reassign matching register and scheduled transactions, move assigned money to the target category, and archive the source category.`,
    );

    if (!confirmed) {
      return;
    }

    onMergeCategory(
      activeMergePreview.sourceCategoryId,
      activeMergePreview.targetCategoryId,
    );
  }

  const activeMergePreview =
    mergePreview && category
      ? mergePreview.sourceCategoryId === category.id
        ? mergePreview
        : null
      : null;

  if (!category || !group) {
    return (
      <Card className="budget-inspector-card">
        <div className="panel-section-header">
          <h2>Inspector</h2>
          <p className="muted">Select a category to inspect it.</p>
        </div>

        <div className="inspector-empty">
          Click a budget category to see details here.
        </div>
      </Card>
    );
  }

  return (
    <Card className="budget-inspector-card">
      <div className="panel-section-header category-inspector-header">
        <div>
          {isRenaming ? (
            <input
              className="category-rename-input"
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={saveRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  saveRename();
                }

                if (event.key === "Escape") {
                  cancelRename();
                }
              }}
              aria-label="Category name"
            />
          ) : (
            <h2>{category.name}</h2>
          )}
          <p className="muted">
            {group.name}
            {category.isArchived ? " · Archived" : ""}
          </p>
        </div>

        <div className="category-inspector-actions">
          <button
            className="button button-secondary category-rename-button"
            type="button"
            onMouseDown={(event) => {
              if (isRenaming) {
                event.preventDefault();
              }
            }}
            onClick={isRenaming ? saveRename : startRename}
          >
            {isRenaming ? "Save" : "Rename"}
          </button>

          <button
            className="button button-secondary category-move-button"
            type="button"
            disabled={!canMoveCategoryUp}
            onClick={() => onMoveCategory(category.id, "up")}
            title="Move category up"
          >
            ↑
          </button>

          <button
            className="button button-secondary category-move-button"
            type="button"
            disabled={!canMoveCategoryDown}
            onClick={() => onMoveCategory(category.id, "down")}
            title="Move category down"
          >
            ↓
          </button>

          <button
            className="button button-secondary category-move-button"
            type="button"
            disabled={!canMoveGroupUp}
            onClick={() => onMoveCategoryGroup(group.id, "up")}
            title="Move category group up"
          >
            Group ↑
          </button>

          <button
            className="button button-secondary category-move-button"
            type="button"
            disabled={!canMoveGroupDown}
            onClick={() => onMoveCategoryGroup(group.id, "down")}
            title="Move category group down"
          >
            Group ↓
          </button>

          <button
            className="button button-secondary category-archive-button"
            type="button"
            onClick={() =>
              onSetCategoryArchived(category.id, !category.isArchived)
            }
          >
            {category.isArchived ? "Restore" : "Archive"}
          </button>
        </div>
      </div>

      <div className="inspector-breakdown">
        <div>
          <span>Assigned</span>
          <strong>{formatMoney(category.assigned, currencyCode)}</strong>
        </div>
        <div>
          <span>Activity</span>
          <strong>{formatMoney(category.activity, currencyCode)}</strong>
        </div>
        <div>
          <span>Available</span>
          <strong
            className={getAvailableClass(
              category.available,
              isOverassignedSource,
            )}
          >
            {formatMoney(category.available, currencyCode)}
          </strong>
        </div>
        <div>
          <span>Status</span>
          <strong>
            {category.available < 0
              ? "Overspent"
              : isOverassignedSource
                ? "Overbudgeted"
                : "Available"}
          </strong>
        </div>
      </div>

      <div className="inspector-note">
        <h3>Merge preview</h3>
        <p className="muted">
          Preview how many register and scheduled entries would be affected
          before we add the actual merge action. This does not change any data.
        </p>

        <div className="category-merge-preview-controls">
          <select
            className="category-rename-input"
            value={mergeTargetId}
            onChange={(event) => {
              setMergeTargetId(event.target.value);
              onClearCategoryMergePreview();
            }}
            aria-label="Merge target category"
          >
            <option value="">Merge into…</option>
            {mergeTargetOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {option.groupName}
              </option>
            ))}
          </select>

          <button
            className="button button-secondary"
            type="button"
            disabled={!mergeTargetId || isMergePreviewLoading}
            onClick={previewMerge}
          >
            {isMergePreviewLoading ? "Previewing…" : "Preview"}
          </button>
        </div>

        {activeMergePreview ? (
          <div className="category-merge-preview-summary">
            <p>
              <strong>{activeMergePreview.sourceCategoryName}</strong> would
              merge into{" "}
              <strong>{activeMergePreview.targetCategoryName}</strong>.
            </p>
            <p className="muted">
              Register transactions:{" "}
              {activeMergePreview.registerTransactionCount}
              {" · "}Split lines: {activeMergePreview.registerSplitLineCount}
              {" · "}Scheduled transactions:{" "}
              {activeMergePreview.scheduledTransactionCount}
            </p>
            <p className="muted">
              Assigned after merge:{" "}
              {formatMoney(activeMergePreview.combinedAssigned, currencyCode)}
              {" · "}Activity after merge:{" "}
              {formatMoney(activeMergePreview.combinedActivity, currencyCode)}
              {" · "}Available after merge:{" "}
              {formatMoney(activeMergePreview.combinedAvailable, currencyCode)}
            </p>
            <button
              className="button button-secondary"
              type="button"
              onClick={mergeCategory}
            >
              Merge now
            </button>
          </div>
        ) : null}
      </div>

      <div className="inspector-note">
        <h3>Notes</h3>
        <p className="muted">
          Category notes, goals, move money, and covering overspending can live
          here later if this panel proves useful.
        </p>
      </div>
    </Card>
  );
}

export function BudgetPage() {
  const [hideArchivedCategories, setHideArchivedCategories] = useState(false);

  const {
    data,
    isLoading,
    error,
    selectedCategory,
    selectedGroup,
    overassignedCategoryIds,
    selectCategory,
    updateAssigned,
    renameCategory,
    setCategoryArchived,
    moveCategory,
    moveCategoryGroup,
    categoryMergePreview,
    isCategoryMergePreviewLoading,
    previewCategoryMerge,
    mergeCategory,
    clearCategoryMergePreview,
  } = useBudgetWorkspace("household", "2026-06");

  if (isLoading) {
    return (
      <div className="page-stack">
        <section className="workspace-header">
          <div>
            <h1>Budget</h1>
            <p className="muted">Loading budget workspace…</p>
          </div>
        </section>

        <Card>Loading budget workspace.</Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-stack">
        <section className="workspace-header">
          <div>
            <h1>Budget</h1>
            <p className="muted">Unable to load budget workspace.</p>
          </div>
        </section>

        <Card>{error ?? "Unknown error."}</Card>
      </div>
    );
  }

  const visibleCategoryGroups = hideArchivedCategories
    ? data.categoryGroups
        .map((group) => ({
          ...group,
          categories: group.categories.filter(
            (category) => !category.isArchived,
          ),
        }))
        .filter((group) => group.categories.length > 0)
    : data.categoryGroups;

  const hiddenArchivedCount = data.categoryGroups.reduce(
    (count, group) =>
      count + group.categories.filter((category) => category.isArchived).length,
    0,
  );

  const selectedCategoryVisible =
    selectedCategory !== null &&
    !(hideArchivedCategories && selectedCategory.isArchived);
  const visibleSelectedCategory = selectedCategoryVisible
    ? selectedCategory
    : null;
  const visibleSelectedGroup = selectedCategoryVisible ? selectedGroup : null;

  const isBudgetOverassigned = data.readyToAssign < 0;
  const selectedCategoryIsOverassignedSource =
    visibleSelectedCategory !== null &&
    overassignedCategoryIds.includes(visibleSelectedCategory.id);

  const selectedCategoryIndex =
    visibleSelectedCategory && visibleSelectedGroup
      ? visibleSelectedGroup.categories.findIndex(
          (category) => category.id === visibleSelectedCategory.id,
        )
      : -1;
  const canMoveSelectedCategoryUp = selectedCategoryIndex > 0;
  const canMoveSelectedCategoryDown =
    visibleSelectedGroup !== null &&
    selectedCategoryIndex >= 0 &&
    selectedCategoryIndex < visibleSelectedGroup.categories.length - 1;

  const selectedGroupIndex =
    visibleSelectedGroup !== null
      ? data.categoryGroups.findIndex(
          (group) => group.id === visibleSelectedGroup.id,
        )
      : -1;
  const canMoveSelectedGroupUp = selectedGroupIndex > 0;
  const canMoveSelectedGroupDown =
    selectedGroupIndex >= 0 &&
    selectedGroupIndex < data.categoryGroups.length - 1;

  const mergeTargetOptions = data.categoryGroups.flatMap((group) =>
    group.categories
      .filter((category) => category.id !== visibleSelectedCategory?.id)
      .map((category) => ({
        id: category.id,
        name: category.name,
        groupName: group.name,
      })),
  );

  const overspentCount = data.categoryGroups.reduce(
    (count, group) =>
      count +
      group.categories.filter((category) => category.available < 0).length,
    0,
  );

  return (
    <div className="budget-workspace-screen">
      <section className="budget-workspace-topbar">
        <div className="month-switcher">
          <button className="button button-secondary" type="button">
            ‹
          </button>

          <div>
            <h1>{data.monthLabel}</h1>
            <p className="muted">Interactive budget workspace</p>
          </div>

          <button className="button button-secondary" type="button">
            ›
          </button>
          <button className="button button-secondary" type="button">
            Back to today
          </button>
        </div>

        <div
          className={
            isBudgetOverassigned
              ? "ready-to-assign-pill ready-to-assign-negative"
              : "ready-to-assign-pill"
          }
        >
          <span>Ready To Assign</span>
          <strong>{formatMoney(data.readyToAssign, data.currencyCode)}</strong>
        </div>
      </section>

      <div className="budget-workspace-layout budget-workspace-layout-interactive">
        <main className="budget-workspace-main">
          <section className="budget-filter-bar">
            <button
              className="budget-filter budget-filter-active"
              type="button"
            >
              All
            </button>
            <button className="budget-filter" type="button">
              Overspent
            </button>
            <button className="budget-filter" type="button">
              Money Available
            </button>
            <button className="budget-filter" type="button">
              Needs Money
            </button>
            <button
              className={
                hideArchivedCategories
                  ? "budget-filter budget-filter-active"
                  : "budget-filter"
              }
              type="button"
              onClick={() => setHideArchivedCategories((current) => !current)}
              title={
                hideArchivedCategories
                  ? "Show archived categories"
                  : "Hide archived categories"
              }
            >
              {hideArchivedCategories
                ? `Archived hidden (${hiddenArchivedCount})`
                : `Hide archived (${hiddenArchivedCount})`}
            </button>

            <div className="budget-filter-spacer" />

            <input
              className="budget-search"
              placeholder="Search categories…"
              aria-label="Search categories"
            />
          </section>

          <Card className="budget-workspace-table-card">
            <div className="budget-workspace-table-head">
              <span>Category Group</span>
              <span>Assigned</span>
              <span>Activity</span>
              <span>Available</span>
            </div>

            {visibleCategoryGroups.map((group) => (
              <BudgetGroup
                key={group.id}
                group={group}
                currencyCode={data.currencyCode}
                selectedCategoryId={visibleSelectedCategory?.id ?? null}
                overassignedCategoryIds={overassignedCategoryIds}
                onSelectCategory={selectCategory}
                onAssignedChange={updateAssigned}
              />
            ))}
          </Card>
        </main>

        <aside className="budget-month-panel">
          <Card className="month-overview-card">
            <div className="panel-section-header">
              <h2>Month Overview</h2>
              <p className="muted">{data.monthLabel}</p>
            </div>

            <div className="month-breakdown">
              <div>
                <span>Ready To Assign</span>
                <strong>
                  {formatMoney(data.readyToAssign, data.currencyCode)}
                </strong>
              </div>
              <div>
                <span>Assigned</span>
                <strong>
                  {formatMoney(data.totalAssigned, data.currencyCode)}
                </strong>
              </div>
              <div>
                <span>Activity</span>
                <strong>
                  {formatMoney(data.totalActivity, data.currencyCode)}
                </strong>
              </div>
              <div>
                <span>Available</span>
                <strong>
                  {formatMoney(data.totalAvailable, data.currencyCode)}
                </strong>
              </div>
            </div>
          </Card>

          <CategoryInspector
            category={visibleSelectedCategory}
            group={visibleSelectedGroup}
            currencyCode={data.currencyCode}
            isOverassignedSource={selectedCategoryIsOverassignedSource}
            canMoveCategoryUp={canMoveSelectedCategoryUp}
            canMoveCategoryDown={canMoveSelectedCategoryDown}
            canMoveGroupUp={canMoveSelectedGroupUp}
            canMoveGroupDown={canMoveSelectedGroupDown}
            mergeTargetOptions={mergeTargetOptions}
            mergePreview={categoryMergePreview}
            isMergePreviewLoading={isCategoryMergePreviewLoading}
            onRenameCategory={renameCategory}
            onSetCategoryArchived={setCategoryArchived}
            onMoveCategory={moveCategory}
            onMoveCategoryGroup={moveCategoryGroup}
            onPreviewCategoryMerge={previewCategoryMerge}
            onMergeCategory={mergeCategory}
            onClearCategoryMergePreview={clearCategoryMergePreview}
          />

          <Card className="budget-health-card">
            <div className="panel-section-header">
              <h2>Budget Health</h2>
              <p className="muted">Read-only summary</p>
            </div>

            <div className="health-row">
              <span>Overspent categories</span>
              <strong>{overspentCount}</strong>
            </div>

            <div className="health-row">
              <span>Future months</span>
              <strong>12 max</strong>
            </div>

            <div className="health-row">
              <span>Status</span>
              <strong>
                {isBudgetOverassigned
                  ? "Overassigned"
                  : overspentCount > 0
                    ? "Needs review"
                    : "Good"}
              </strong>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
