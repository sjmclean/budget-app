import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { getAppPersistenceGateway } from "../features/persistence";
import type { PayeeView } from "../features/accounts/payeeService";
import { confirmDialog } from "../features/ui/appDialogService";

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

export function PayeeManagementPage() {
  const payeesPersistence = getAppPersistenceGateway().payees;
  const [payees, setPayees] = useState<PayeeView[]>([]);
  const [archivedPayees, setArchivedPayees] = useState<PayeeView[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPayeeId, setSelectedPayeeId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [statusMessage, setStatusMessage] = useState("Select a payee to edit it.");

  async function refreshPayees(nextSelectedPayeeId?: string | null) {
    const [loadedPayees, loadedArchivedPayees] = await Promise.all([
      payeesPersistence.listPayees(),
      payeesPersistence.listArchivedPayees(),
    ]);

    setPayees(loadedPayees);
    setArchivedPayees(loadedArchivedPayees);

    const visiblePayees = showArchived ? loadedArchivedPayees : loadedPayees;
    const selected =
      nextSelectedPayeeId ??
      selectedPayeeId ??
      visiblePayees[0]?.id ??
      null;

    setSelectedPayeeId(selected);
  }

  useEffect(() => {
    let active = true;

    Promise.all([
      payeesPersistence.listPayees(),
      payeesPersistence.listArchivedPayees(),
    ]).then(([loadedPayees, loadedArchivedPayees]) => {
      if (!active) {
        return;
      }

      setPayees(loadedPayees);
      setArchivedPayees(loadedArchivedPayees);
      setSelectedPayeeId((currentPayeeId) =>
        currentPayeeId ?? loadedPayees[0]?.id ?? null,
      );
    });

    return () => {
      active = false;
    };
  }, [payeesPersistence]);

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
  }, [selectedPayee?.id, selectedPayee?.name, selectedPayee?.note]);

  const hasUnsavedChanges =
    Boolean(selectedPayee) &&
    (draftName.trim() !== selectedPayee?.name ||
      draftNote.trim() !== (selectedPayee?.note ?? ""));

  async function saveSelectedPayee() {
    if (!selectedPayee) {
      return;
    }

    const nextName = draftName.trim();

    if (!nextName) {
      setStatusMessage("Payee name is required.");
      return;
    }

    const nextPayees = await payeesPersistence.updatePayee({
      id: selectedPayee.id,
      name: nextName,
      note: draftNote,
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

  function selectPayee(payee: PayeeView) {
    setSelectedPayeeId(payee.id);
    setStatusMessage(`Editing ${payee.name}.`);
  }

  return (
    <div className="page-stack payee-management-page">
      <div className="workspace-header">
        <div>
          <h1>Payee Management</h1>
          <p className="muted">
            Clean up payees created by manual entry and imports. Rename, add
            notes, archive, restore, and prepare payees for import rules.
          </p>
        </div>
      </div>

      <Card className="payee-management-workspace">
        <aside className="payee-management-list-panel">
          <div className="payee-management-list-toolbar">
            <label className="field-label" htmlFor="payee-management-search">
              Search payees
            </label>

            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setShowArchived((value) => !value);
                setSelectedPayeeId(null);
              }}
            >
              {showArchived ? "Show active" : "Show archived"}
            </button>
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
                <button
                  key={payee.id}
                  className={[
                    "payee-management-list-item",
                    selectedPayee?.id === payee.id
                      ? "payee-management-list-item-selected"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  role="option"
                  aria-selected={selectedPayee?.id === payee.id}
                  onClick={() => selectPayee(payee)}
                >
                  <strong>{payee.name}</strong>
                  <span>{payee.useCount} transactions</span>
                  {payee.note?.trim() ? (
                    <small title={payee.note}>Has note</small>
                  ) : null}
                </button>
              ))
            ) : (
              <p className="payee-management-empty">No payees found.</p>
            )}
          </div>
        </aside>

        <section className="payee-management-detail-panel">
          {selectedPayee ? (
            <>
              <div className="payee-management-detail-header">
                <div>
                  <h2>{selectedPayee.name}</h2>
                  <p className="muted">
                    Edit the selected payee. Import rules and merge actions will
                    be added in follow-up releases.
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
                  <span className="field-label">Notes</span>
                  <textarea
                    className="payee-management-textarea"
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    rows={5}
                    placeholder="Add internal notes about this payee..."
                  />
                </label>
              </div>

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
                    onClick={() => {
                      setDraftName(selectedPayee.name);
                      setDraftNote(selectedPayee.note ?? "");
                      setStatusMessage("Changes reverted.");
                    }}
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
