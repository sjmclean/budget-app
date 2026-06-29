import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { getAppPersistenceGateway } from "../features/persistence";
import type {
  PayeeImportRuleView,
  PayeeRuleMatchType,
  PayeeView,
} from "../features/accounts/payeeService";
import type { BudgetCategoryOption } from "../features/budget/budgetViewTypes";
import { confirmDialog } from "../features/ui/appDialogService";
import { resolveActiveBudgetId } from "../features/budget/activeBudget";
import { getCurrentBudgetMonth } from "../features/budget/budgetMonthNavigation";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore } from "../stores/uiStore";

const ruleTypeLabels: Record<PayeeRuleMatchType, string> = {
  equals: "Equals",
  contains: "Contains",
  startsWith: "Starts with",
  endsWith: "Ends with",
};

function formatDate(value: string): string {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function createDraftRule(payeeName = ""): PayeeImportRuleView {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    matchType: "contains",
    text: payeeName,
  };
}


function scoreMergeDestinationCandidate(payee: PayeeView): number {
  const name = payee.name.trim();
  const hasDigits = /\d/.test(name);
  const isAllCaps = name === name.toLocaleUpperCase() && /[A-Z]/.test(name);
  const wordCount = name.split(/\s+/).filter(Boolean).length;

  return (
    payee.useCount * 4 +
    (hasDigits ? -60 : 0) +
    (isAllCaps ? -30 : 0) +
    (wordCount <= 2 ? 24 : 0) +
    Math.max(0, 30 - name.length)
  );
}

function suggestMergeDestination(
  selectedPayees: PayeeView[],
  availablePayees: PayeeView[],
): string {
  if (selectedPayees.length === 0) {
    return "";
  }

  const selectedIds = new Set(selectedPayees.map((payee) => payee.id));
  const candidates = [...selectedPayees, ...availablePayees.filter((payee) => !selectedIds.has(payee.id))];

  return candidates
    .map((payee) => ({ payee, score: scoreMergeDestinationCandidate(payee) }))
    .sort((left, right) => right.score - left.score)[0]?.payee.id ?? "";
}


export function PayeeManagementPage() {
  const persistenceGateway = getAppPersistenceGateway();
  const payeesPersistence = persistenceGateway.payees;
  const budgetViewPersistence = persistenceGateway.budgetView;
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const [payees, setPayees] = useState<PayeeView[]>([]);
  const [archivedPayees, setArchivedPayees] = useState<PayeeView[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<BudgetCategoryOption[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPayeeId, setSelectedPayeeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftDefaultCategoryId, setDraftDefaultCategoryId] = useState("");
  const [draftRules, setDraftRules] = useState<PayeeImportRuleView[]>([]);
  const [statusMessage, setStatusMessage] = useState("Select a payee to edit it.");
  const [mergeTargetPayeeId, setMergeTargetPayeeId] = useState("");
  const [selectedBulkMergePayeeIds, setSelectedBulkMergePayeeIds] = useState<string[]>([]);
  const [bulkMergeTargetPayeeId, setBulkMergeTargetPayeeId] = useState("");
  const [isMergeMode, setIsMergeMode] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([
      payeesPersistence.listPayees(),
      payeesPersistence.listArchivedPayees(),
      (() => {
        const activeBudgetId = resolveActiveBudgetId(budgets, selectedBudgetId);

        if (!activeBudgetId) {
          return Promise.resolve([]);
        }

        return budgetViewPersistence.getCategoryOptions({
          budgetId: activeBudgetId,
          month: getCurrentBudgetMonth(),
        });
      })(),
    ]).then(([loadedPayees, loadedArchivedPayees, loadedCategoryOptions]) => {
      if (!active) {
        return;
      }

      setPayees(loadedPayees);
      setArchivedPayees(loadedArchivedPayees);
      setCategoryOptions(loadedCategoryOptions);
      setSelectedPayeeId((currentPayeeId) =>
        currentPayeeId ?? loadedPayees[0]?.id ?? null,
      );
    });

    return () => {
      active = false;
    };
  }, [budgetViewPersistence, budgets, payeesPersistence, selectedBudgetId]);

  const visiblePayees = showArchived ? archivedPayees : payees;

  const filteredPayees = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    if (!query) {
      return visiblePayees;
    }

    return visiblePayees.filter((payee) =>
      payee.name.toLocaleLowerCase().includes(query),
    );
  }, [visiblePayees, search]);

  const selectedPayee =
    visiblePayees.find((payee) => payee.id === selectedPayeeId) ??
    filteredPayees[0] ??
    null;

  useEffect(() => {
    setDraftName(selectedPayee?.name ?? "");
    setDraftNote(selectedPayee?.note ?? "");
    setDraftDefaultCategoryId(selectedPayee?.defaultCategoryId ?? "");
    setDraftRules(selectedPayee?.importRules ?? []);
    setMergeTargetPayeeId("");
  }, [
    selectedPayee?.id,
    selectedPayee?.name,
    selectedPayee?.note,
    selectedPayee?.defaultCategoryId,
    selectedPayee?.importRules,
  ]);

  const selectedCategory = categoryOptions.find(
    (category) => category.id === draftDefaultCategoryId,
  );

  const mergeTargetOptions = payees.filter((payee) => payee.id !== selectedPayee?.id);
  const mergeTargetPayee = mergeTargetOptions.find(
    (payee) => payee.id === mergeTargetPayeeId,
  );
  const bulkMergeSelectedPayees = payees.filter((payee) =>
    selectedBulkMergePayeeIds.includes(payee.id),
  );
  const bulkMergeTargetOptions = payees.filter(
    (payee) => !selectedBulkMergePayeeIds.includes(payee.id),
  );
  const bulkMergeTargetPayee = bulkMergeTargetOptions.find(
    (payee) => payee.id === bulkMergeTargetPayeeId,
  );
  const bulkMergeTransactionCount = bulkMergeSelectedPayees.reduce(
    (total, payee) => total + payee.useCount,
    0,
  );
  const bulkMergeRuleCount = bulkMergeSelectedPayees.reduce(
    (total, payee) => total + (payee.importRules?.length ?? 0),
    0,
  );
  const bulkMergeNoteCount = bulkMergeSelectedPayees.filter((payee) =>
    payee.note?.trim(),
  ).length;

  const hasUnsavedChanges =
    Boolean(selectedPayee) &&
    (draftName.trim() !== selectedPayee?.name ||
      draftNote.trim() !== (selectedPayee?.note ?? "") ||
      draftDefaultCategoryId !== (selectedPayee?.defaultCategoryId ?? "") ||
      JSON.stringify(normaliseRulesForComparison(draftRules)) !==
        JSON.stringify(normaliseRulesForComparison(selectedPayee?.importRules ?? [])));

  async function saveSelectedPayee() {
    if (!selectedPayee) {
      return;
    }

    const nextName = draftName.trim();

    if (!nextName) {
      setStatusMessage("Payee name is required.");
      return;
    }

    const nextRules = draftRules
      .map((rule) => ({ ...rule, text: rule.text.trim() }))
      .filter((rule) => rule.text.length > 0);

    const nextPayees = await payeesPersistence.updatePayee({
      id: selectedPayee.id,
      name: nextName,
      note: draftNote,
      defaultCategoryId: selectedCategory?.id ?? "",
      defaultCategoryName: selectedCategory
        ? `${selectedCategory.groupName}: ${selectedCategory.name}`
        : "",
      importRules: nextRules,
    });

    setPayees(nextPayees);
    setStatusMessage(`Saved ${nextName}.`);

    const updatedPayee = nextPayees.find((payee) => payee.name === nextName);
    setSelectedPayeeId(updatedPayee?.id ?? selectedPayee.id);
  }

  async function archiveSelectedPayee() {
    if (!selectedPayee) {
      return;
    }

    const shouldArchive = confirmDialog({
      title: `Archive "${selectedPayee.name}"?`,
      message:
        "Archived payees are hidden from the active payee list but can be restored later.",
    });

    if (!shouldArchive) {
      return;
    }

    const nextPayees = await payeesPersistence.archivePayee(selectedPayee.id);
    const nextArchivedPayees = await payeesPersistence.listArchivedPayees();

    setPayees(nextPayees);
    setArchivedPayees(nextArchivedPayees);
    setSelectedPayeeId(nextPayees[0]?.id ?? null);
    setStatusMessage(`Archived ${selectedPayee.name}.`);
  }

  async function restoreSelectedPayee() {
    if (!selectedPayee) {
      return;
    }

    const nextPayees = await payeesPersistence.restorePayee(selectedPayee.id);
    const nextArchivedPayees = await payeesPersistence.listArchivedPayees();

    setPayees(nextPayees);
    setArchivedPayees(nextArchivedPayees);
    setShowArchived(false);
    setSelectedPayeeId(selectedPayee.id);
    setStatusMessage(`Restored ${selectedPayee.name}.`);
  }

  async function mergeSelectedPayee() {
    if (!selectedPayee || !mergeTargetPayee) {
      setStatusMessage("Choose a payee to merge into.");
      return;
    }

    const shouldMerge = confirmDialog({
      title: `Merge "${selectedPayee.name}" into "${mergeTargetPayee.name}"?`,
      message:
        `${selectedPayee.useCount} transactions will be added to "${mergeTargetPayee.name}". ` +
        `"${selectedPayee.name}" will be archived and can be restored later if needed.`,
    });

    if (!shouldMerge) {
      return;
    }

    const nextPayees = await payeesPersistence.mergePayees({
      sourcePayeeId: selectedPayee.id,
      targetPayeeId: mergeTargetPayee.id,
    });
    const nextArchivedPayees = await payeesPersistence.listArchivedPayees();

    setPayees(nextPayees);
    setArchivedPayees(nextArchivedPayees);
    setSelectedPayeeId(mergeTargetPayee.id);
    setMergeTargetPayeeId("");
    setStatusMessage(`Merged ${selectedPayee.name} into ${mergeTargetPayee.name}.`);
  }

  function toggleBulkMergePayee(payeeId: string) {
    setSelectedBulkMergePayeeIds((payeeIds) => {
      const nextPayeeIds = payeeIds.includes(payeeId)
        ? payeeIds.filter((id) => id !== payeeId)
        : [...payeeIds, payeeId];
      const nextSelectedPayees = payees.filter((payee) => nextPayeeIds.includes(payee.id));

      if (!bulkMergeTargetPayeeId || nextPayeeIds.includes(bulkMergeTargetPayeeId)) {
        setBulkMergeTargetPayeeId(suggestMergeDestination(nextSelectedPayees, payees));
      }

      return nextPayeeIds;
    });
  }

  function enterMergeMode() {
    setIsMergeMode(true);
    setSelectedBulkMergePayeeIds([]);
    setBulkMergeTargetPayeeId("");
    setIsMergeMode(false);
    setStatusMessage("Merge mode enabled. Search and select related payees to merge.");
  }

  function exitMergeMode() {
    setIsMergeMode(false);
    setSelectedBulkMergePayeeIds([]);
    setBulkMergeTargetPayeeId("");
    setStatusMessage("Merge mode closed.");
  }

  function selectVisiblePayeesForMerge() {
    const nextPayeeIds = filteredPayees.map((payee) => payee.id);
    const nextSelectedPayees = payees.filter((payee) => nextPayeeIds.includes(payee.id));

    setSelectedBulkMergePayeeIds(nextPayeeIds);
    setBulkMergeTargetPayeeId(suggestMergeDestination(nextSelectedPayees, payees));
  }

  async function mergeSelectedBulkPayees() {
    if (!bulkMergeTargetPayee || bulkMergeSelectedPayees.length === 0) {
      setStatusMessage("Choose source payees and a destination payee.");
      return;
    }

    const shouldMerge = confirmDialog({
      title: `Merge ${bulkMergeSelectedPayees.length} payees into "${bulkMergeTargetPayee.name}"?`,
      message:
        `${bulkMergeTransactionCount} transactions, ${bulkMergeRuleCount} import rules, and ` +
        `${bulkMergeNoteCount} notes will be folded into "${bulkMergeTargetPayee.name}". ` +
        "The selected source payees will be archived and can be restored later if needed.",
    });

    if (!shouldMerge) {
      return;
    }

    let nextPayees = payees;

    for (const sourcePayee of bulkMergeSelectedPayees) {
      nextPayees = await payeesPersistence.mergePayees({
        sourcePayeeId: sourcePayee.id,
        targetPayeeId: bulkMergeTargetPayee.id,
      });
    }

    const nextArchivedPayees = await payeesPersistence.listArchivedPayees();

    setPayees(nextPayees);
    setArchivedPayees(nextArchivedPayees);
    setSelectedPayeeId(bulkMergeTargetPayee.id);
    setSelectedBulkMergePayeeIds([]);
    setBulkMergeTargetPayeeId("");
    setStatusMessage(
      `Merged ${bulkMergeSelectedPayees.length} payees into ${bulkMergeTargetPayee.name}.`,
    );
  }

  function selectPayee(payee: PayeeView) {
    setSelectedPayeeId(payee.id);
    setStatusMessage(`Editing ${payee.name}.`);
  }

  function updateRule(ruleId: string, updates: Partial<PayeeImportRuleView>) {
    setDraftRules((rules) =>
      rules.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule)),
    );
  }

  function removeRule(ruleId: string) {
    setDraftRules((rules) => rules.filter((rule) => rule.id !== ruleId));
  }

  function resetDrafts() {
    if (!selectedPayee) {
      return;
    }

    setDraftName(selectedPayee.name);
    setDraftNote(selectedPayee.note ?? "");
    setDraftDefaultCategoryId(selectedPayee.defaultCategoryId ?? "");
    setDraftRules(selectedPayee.importRules ?? []);
    setStatusMessage("Changes reverted.");
  }

  return (
    <div className="page-stack payee-management-page">
      <div className="workspace-header">
        <div>
          <h1>Payee Management</h1>
          <p className="muted">
            Clean up payees created by manual entry and imports. Rename, add
            notes, set default categories, and prepare import rules.
          </p>
        </div>

        <div className="payee-management-header-actions">
          {isMergeMode ? (
            <button className="button button-secondary" type="button" onClick={exitMergeMode}>
              Exit Merge Mode
            </button>
          ) : (
            <button
              className="button button-primary"
              type="button"
              disabled={showArchived}
              onClick={enterMergeMode}
            >
              Merge Payees
            </button>
          )}
        </div>
      </div>

      <Card className="payee-management-workspace">
        <aside className="payee-management-list-panel">
          <div className="payee-management-list-toolbar">
            <label className="field-label" htmlFor="payee-management-search">
              Search payees
            </label>

            <div className="payee-management-list-toolbar-actions">
              {isMergeMode ? (
                <>
                  <button className="button button-secondary" type="button" onClick={selectVisiblePayeesForMerge}>
                    Select visible
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setSelectedBulkMergePayeeIds([]);
                      setBulkMergeTargetPayeeId("");
                    }}
                  >
                    Clear
                  </button>
                </>
              ) : null}

              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setShowArchived((value) => !value);
                  setSelectedPayeeId(null);
                  setSelectedBulkMergePayeeIds([]);
                  setBulkMergeTargetPayeeId("");
                  setIsMergeMode(false);
                }}
              >
                {showArchived ? "Show active" : "Show archived"}
              </button>
            </div>
          </div>

          <input
            id="payee-management-search"
            className="payee-management-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search payees..."
          />

          <div className="payee-management-list" role="listbox">
            {filteredPayees.length > 0 ? (
              filteredPayees.map((payee) => (
                <div
                  key={payee.id}
                  className={[
                    "payee-management-list-item-shell",
                    selectedPayee?.id === payee.id
                      ? "payee-management-list-item-shell-selected"
                      : "",
                    selectedBulkMergePayeeIds.includes(payee.id)
                      ? "payee-management-list-item-shell-checked"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {isMergeMode && !showArchived ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${payee.name} for merge`}
                      checked={selectedBulkMergePayeeIds.includes(payee.id)}
                      onChange={() => toggleBulkMergePayee(payee.id)}
                    />
                  ) : null}

                  <button
                    className="payee-management-list-item"
                    type="button"
                    role="option"
                    aria-selected={selectedPayee?.id === payee.id}
                    onClick={() => selectPayee(payee)}
                  >
                    <strong>{payee.name}</strong>
                    <span>{payee.useCount} transactions</span>
                    {payee.defaultCategoryName ? (
                      <small title={payee.defaultCategoryName}>
                        {payee.defaultCategoryName}
                      </small>
                    ) : payee.note?.trim() ? (
                      <small title={payee.note}>Has note</small>
                    ) : null}
                  </button>
                </div>
              ))
            ) : (
              <p className="payee-management-empty">No payees found.</p>
            )}
          </div>

          {isMergeMode && !showArchived && selectedBulkMergePayeeIds.length > 0 ? (
            <div className="payee-bulk-merge-bar">
              <div>
                <strong>{selectedBulkMergePayeeIds.length} selected</strong>
                <span>
                  {bulkMergeTransactionCount} transactions · {bulkMergeRuleCount} rules ·{" "}
                  {bulkMergeNoteCount} notes
                </span>
              </div>

              <select
                value={bulkMergeTargetPayeeId}
                onChange={(event) => setBulkMergeTargetPayeeId(event.target.value)}
              >
                <option value="">Merge into...</option>
                {bulkMergeTargetOptions.map((payee) => (
                  <option key={payee.id} value={payee.id}>
                    {payee.name} ({payee.useCount} transactions)
                  </option>
                ))}
              </select>

              <div className="payee-bulk-merge-actions">
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={exitMergeMode}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!bulkMergeTargetPayeeId}
                  onClick={mergeSelectedBulkPayees}
                >
                  Merge
                </button>
              </div>
            </div>
          ) : null}
        </aside>

        <section className="payee-management-detail-panel">
          {isMergeMode ? (
            <div className="payee-merge-mode-panel">
              <h2>Merge Payees</h2>
              <p className="muted">
                Search for related payees, select the duplicates, then choose the
                destination payee to keep. The selected source payees will be
                archived after merging.
              </p>

              <div className="payee-merge-mode-summary">
                <div>
                  <span>Selected</span>
                  <strong>{selectedBulkMergePayeeIds.length}</strong>
                </div>
                <div>
                  <span>Transactions</span>
                  <strong>{bulkMergeTransactionCount}</strong>
                </div>
                <div>
                  <span>Rules</span>
                  <strong>{bulkMergeRuleCount}</strong>
                </div>
                <div>
                  <span>Notes</span>
                  <strong>{bulkMergeNoteCount}</strong>
                </div>
              </div>

              <p className="muted">
                Tip: search for a merchant name such as “wool”, then use Select
                visible to select all matching payees at once.
              </p>
            </div>
          ) : selectedPayee ? (
            <>
              <div className="payee-management-detail-header">
                <div>
                  <h2>{selectedPayee.name}</h2>
                  <p className="muted">
                    Edit the selected payee. Merge actions will be added in a
                    follow-up release.
                  </p>
                </div>
              </div>

              <div className="payee-management-editor">
                <label>
                  <span className="field-label">Name</span>
                  <input
                    className="payee-management-field"
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                  />
                </label>

                <label>
                  <span className="field-label">Default Category</span>
                  <select
                    className="payee-management-field"
                    value={draftDefaultCategoryId}
                    onChange={(event) => setDraftDefaultCategoryId(event.target.value)}
                  >
                    <option value="">No default category</option>
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.groupName}: {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span className="field-label">Notes</span>
                  <textarea
                    className="payee-management-textarea"
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    rows={4}
                    placeholder="Add internal notes about this payee..."
                  />
                </label>
              </div>

              <section className="payee-rules-panel">
                <div className="payee-rules-header">
                  <div>
                    <h3>Import Rules</h3>
                    <p className="muted">
                      Match imported payee text and rename it to this payee.
                    </p>
                  </div>

                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() =>
                      setDraftRules((rules) => [
                        ...rules,
                        createDraftRule(draftName || selectedPayee.name),
                      ])
                    }
                  >
                    + Add rule
                  </button>
                </div>

                {draftRules.length > 0 ? (
                  <div className="payee-rule-list">
                    {draftRules.map((rule) => (
                      <div className="payee-rule-row" key={rule.id}>
                        <select
                          value={rule.matchType}
                          onChange={(event) =>
                            updateRule(rule.id, {
                              matchType: event.target.value as PayeeRuleMatchType,
                            })
                          }
                        >
                          {Object.entries(ruleTypeLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>

                        <input
                          value={rule.text}
                          onChange={(event) =>
                            updateRule(rule.id, { text: event.target.value })
                          }
                          placeholder="Imported payee text"
                        />

                        <button
                          className="button button-ghost"
                          type="button"
                          onClick={() => removeRule(rule.id)}
                          aria-label="Remove import rule"
                          title="Remove import rule"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="payee-rule-empty">
                    No import rules yet. Add a rule to automatically recognise
                    imported versions of this payee.
                  </p>
                )}
              </section>

              <div className="payee-management-stats">
                <div>
                  <span>Transactions</span>
                  <strong>{selectedPayee.useCount}</strong>
                </div>
                <div>
                  <span>First used</span>
                  <strong>{formatDate(selectedPayee.createdAt)}</strong>
                </div>
                <div>
                  <span>Last used</span>
                  <strong>{formatDate(selectedPayee.lastUsedAt)}</strong>
                </div>
              </div>


              <div className="payee-management-actions">
                <p className="muted">{statusMessage}</p>

                <div>
                  {showArchived ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={restoreSelectedPayee}
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={archiveSelectedPayee}
                    >
                      Archive
                    </button>
                  )}

                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={!hasUnsavedChanges}
                    onClick={resetDrafts}
                  >
                    Revert
                  </button>

                  <button
                    className="button button-primary"
                    type="button"
                    disabled={!hasUnsavedChanges}
                    onClick={saveSelectedPayee}
                  >
                    Save
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="payee-management-empty-detail">
              <h2>No payee selected</h2>
              <p className="muted">Select a payee to view details.</p>
            </div>
          )}
        </section>
      </Card>
    </div>
  );
}

function normaliseRulesForComparison(rules: PayeeImportRuleView[]) {
  return rules
    .map((rule) => ({
      matchType: rule.matchType,
      text: rule.text.trim(),
    }))
    .filter((rule) => rule.text.length > 0);
}
