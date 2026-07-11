import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import type {
  TransactionTagService,
  UpdateTransactionTagInput,
} from "./transactionTagService";
import type {
  TransactionTagColour,
  TransactionTagDefinition,
} from "./transactionTagTypes";

export const transactionTagColourOptions: ReadonlyArray<{
  value: TransactionTagColour;
  label: string;
}> = [
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
];

interface TransactionTagManagerProps {
  service: TransactionTagService;
}

interface TransactionTagDraft {
  name: string;
  description: string;
  colour: TransactionTagColour;
  autoTagImportedTransactions: boolean;
}

const emptyDraft: TransactionTagDraft = {
  name: "",
  description: "",
  colour: "blue",
  autoTagImportedTransactions: false,
};

export function TransactionTagManager({
  service,
}: TransactionTagManagerProps) {
  const [tags, setTags] = useState<TransactionTagDefinition[]>(() =>
    service.listTags({ includeArchived: true }),
  );
  const [draft, setDraft] = useState<TransactionTagDraft>(emptyDraft);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Create tags that can be applied to transactions.",
  );

  const visibleTags = useMemo(
    () => tags.filter((tag) => showArchived || !tag.archived),
    [showArchived, tags],
  );

  function refreshTags() {
    setTags(service.listTags({ includeArchived: true }));
  }

  function beginCreate() {
    setEditingTagId(null);
    setDraft(emptyDraft);
    setStatusMessage("Enter the details for the new tag.");
  }

  function beginEdit(tag: TransactionTagDefinition) {
    setEditingTagId(tag.id);
    setDraft({
      name: tag.name,
      description: tag.description ?? "",
      colour: tag.colour,
      autoTagImportedTransactions: tag.autoTagImportedTransactions,
    });
    setStatusMessage(`Editing ${tag.name}.`);
  }

  function saveTag() {
    try {
      if (editingTagId) {
        const input: UpdateTransactionTagInput = {
          id: editingTagId,
          name: draft.name,
          description: draft.description,
          colour: draft.colour,
          autoTagImportedTransactions:
            draft.autoTagImportedTransactions,
        };
        const updated = service.updateTag(input);
        setStatusMessage(`${updated.name} updated.`);
      } else {
        const created = service.createTag({
          name: draft.name,
          description: draft.description,
          colour: draft.colour,
          autoTagImportedTransactions:
            draft.autoTagImportedTransactions,
        });
        setStatusMessage(`${created.name} created.`);
      }

      setEditingTagId(null);
      setDraft(emptyDraft);
      refreshTags();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Could not save the tag.",
      );
    }
  }

  function toggleArchived(tag: TransactionTagDefinition) {
    try {
      const updated = tag.archived
        ? service.restoreTag(tag.id)
        : service.archiveTag(tag.id);
      setStatusMessage(
        `${updated.name} ${updated.archived ? "archived" : "restored"}.`,
      );
      refreshTags();
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Could not update the tag.",
      );
    }
  }

  function deleteTag(tag: TransactionTagDefinition) {
    try {
      service.deleteTag(tag.id);
      setStatusMessage(`${tag.name} deleted.`);
      if (editingTagId === tag.id) {
        beginCreate();
      }
      refreshTags();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Could not delete the tag.",
      );
    }
  }

  return (
    <div className="transaction-tag-manager">
      <div className="settings-section-header">
        <div>
          <p className="eyebrow">Transactions</p>
          <h2>Transaction tags</h2>
          <p className="muted">{statusMessage}</p>
        </div>
        <Button type="button" variant="secondary" onClick={beginCreate}>
          New tag
        </Button>
      </div>

      <div className="settings-panel-grid">
        <label className="settings-field">
          <span>Label</span>
          <input
            className="settings-input"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            placeholder="Tax, Reimbursable, Household…"
          />
        </label>

        <label className="settings-field">
          <span>Colour</span>
          <select
            className="select"
            value={draft.colour}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                colour: event.target.value as TransactionTagColour,
              }))
            }
          >
            {transactionTagColourOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-field settings-field-wide">
          <span>Description</span>
          <input
            className="settings-input"
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder="Optional note describing how this tag is used"
          />
        </label>

        <label className="settings-field settings-field-wide settings-checkbox-field">
          <input
            type="checkbox"
            checked={draft.autoTagImportedTransactions}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                autoTagImportedTransactions: event.target.checked,
              }))
            }
          />
          <span>
            Auto-tag imported transactions
            <small>
              Apply this tag automatically to imported transactions for
              review or approval.
            </small>
          </span>
        </label>
      </div>

      <div className="settings-action-row">
        <Button type="button" onClick={saveTag}>
          {editingTagId ? "Save changes" : "Create tag"}
        </Button>
        {editingTagId ? (
          <Button type="button" variant="ghost" onClick={beginCreate}>
            Cancel
          </Button>
        ) : null}
        <label className="settings-checkbox-field">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          <span>Show archived tags</span>
        </label>
      </div>

      <div className="settings-list" aria-label="Transaction tags">
        {visibleTags.length === 0 ? (
          <p className="muted">No transaction tags have been created yet.</p>
        ) : (
          visibleTags.map((tag) => {
            const usage = service.getUsage(tag.id);

            return (
              <div className="settings-list-row" key={tag.id}>
                <TransactionTagIcon
                  colour={tag.colour}
                  filled={!tag.archived}
                />
                <div className="settings-list-row-content">
                  <strong>{tag.name}</strong>
                  <span className="muted">
                    {tag.description || "No description"}
                  </span>
                  <small>
                    {usage.transactionCount}{" "}
                    {usage.transactionCount === 1
                      ? "transaction"
                      : "transactions"}
                    {tag.autoTagImportedTransactions
                      ? " · Auto-tag imports"
                      : ""}
                    {tag.archived ? " · Archived" : ""}
                  </small>
                </div>
                <div className="settings-action-row">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => beginEdit(tag)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => toggleArchived(tag)}
                  >
                    {tag.archived ? "Restore" : "Archive"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => deleteTag(tag)}
                    disabled={usage.transactionCount > 0}
                    title={
                      usage.transactionCount > 0
                        ? "Archive tags that are already used by transactions."
                        : "Delete this unused tag."
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

interface TransactionTagIconProps {
  colour: TransactionTagColour;
  filled: boolean;
}

function TransactionTagIcon({
  colour,
  filled,
}: TransactionTagIconProps) {
  return (
    <svg
      className={`transaction-tag-icon transaction-tag-icon-${colour}`}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.6 13.6 13.7 20.5a2 2 0 0 1-2.8 0L3.5 13.1A2 2 0 0 1 3 11.7V5a2 2 0 0 1 2-2h6.7a2 2 0 0 1 1.4.6l7.5 7.2a2 2 0 0 1 0 2.8Z" />
      <circle cx="8" cy="8" r="1.2" fill={filled ? "white" : "none"} />
    </svg>
  );
}
