import { useMemo, useState } from "react";
import { confirmDialog } from "../ui/appDialogService";
import { Button } from "../../components/ui/Button";
import type { TransactionTagService } from "./transactionTagService";
import type {
  TransactionTagColour,
  TransactionTagDefinition,
} from "./transactionTagTypes";
import type { TransactionTagIcon } from "./transactionTagIconTypes";
import { TransactionTagAppearancePicker } from "./TransactionTagAppearancePicker";
import "./transactionTagManager.css";

interface TransactionTagManagerProps {
  service: TransactionTagService;
}

interface NewTagDraft {
  name: string;
  colour: TransactionTagColour;
  icon?: TransactionTagIcon;
  autoTagImportedTransactions: boolean;
}

const emptyDraft: NewTagDraft = {
  name: "",
  colour: "gray",
  autoTagImportedTransactions: false,
};

export function TransactionTagManager({
  service,
}: TransactionTagManagerProps) {
  const [tags, setTags] = useState<TransactionTagDefinition[]>(() =>
    service.listTags(),
  );
  const [search, setSearch] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<NewTagDraft>(emptyDraft);
  const [draggedTagId, setDraggedTagId] = useState<string | null>(null);
  const [dragOverTagId, setDragOverTagId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    "Create and organise reusable labels for your transactions.",
  );

  const visibleTags = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? tags.filter((tag) => tag.name.toLocaleLowerCase().includes(query))
      : tags;
  }, [search, tags]);

  const canReorder = search.trim().length === 0;

  function refreshTags() {
    setTags(service.listTags());
  }

  function reorderTag(draggedId: string, targetId: string) {
    if (draggedId === targetId) {
      return;
    }

    const sourceIndex = tags.findIndex((tag) => tag.id === draggedId);
    const targetIndex = tags.findIndex((tag) => tag.id === targetId);

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextTags = [...tags];
    const [draggedTag] = nextTags.splice(sourceIndex, 1);
    nextTags.splice(targetIndex, 0, draggedTag);

    try {
      setTags(service.reorderTags(nextTags.map((tag) => tag.id)));
      setStatusMessage("Tag order saved.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Could not reorder tags.",
      );
      refreshTags();
    }
  }

  function createTag() {
    try {
      const created = service.createTag({
        name: draft.name,
        colour: draft.colour,
        icon: draft.icon,
        autoTagImportedTransactions: draft.autoTagImportedTransactions,
      });
      setStatusMessage(`${created.name} created.`);
      setDraft(emptyDraft);
      setIsAdding(false);
      refreshTags();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Could not create the tag.",
      );
    }
  }

  function updateTag(
    tag: TransactionTagDefinition,
    changes: Partial<
      Pick<
        TransactionTagDefinition,
        "name" | "colour" | "autoTagImportedTransactions"
      >
    > & { icon?: TransactionTagIcon | null },
  ) {
    try {
      const updated = service.updateTag({
        id: tag.id,
        name: changes.name ?? tag.name,
        description: tag.description,
        colour: changes.colour ?? tag.colour,
        icon: changes.icon === undefined ? tag.icon : changes.icon,
        autoTagImportedTransactions:
          changes.autoTagImportedTransactions ??
          tag.autoTagImportedTransactions,
      });
      setStatusMessage(`${updated.name} saved.`);
      refreshTags();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Could not update the tag.",
      );
      refreshTags();
    }
  }

  async function deleteTag(tag: TransactionTagDefinition) {
    const usage = service.getUsage(tag.id);

    if (
      usage.transactionCount > 0 &&
      !(await confirmDialog({
        title: "Delete tag",
        message: `Delete "${tag.name}"? This will remove it from ${usage.transactionCount} transaction${
          usage.transactionCount === 1 ? "" : "s"
        }.`,
        confirmLabel: "Delete tag",
        tone: "danger",
      }))
    ) {
      return;
    }

    try {
      service.deleteTag(tag.id);
      setStatusMessage(`${tag.name} deleted.`);
      refreshTags();
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Could not delete the tag.",
      );
    }
  }

  return (
    <div className="transaction-tag-manager transaction-tag-manager-simple">
      <div className="transaction-tag-manager-heading">
        <div>
          <h2>Tags</h2>
          <p className="muted">{statusMessage}</p>
        </div>
      </div>

      <div className="transaction-tag-manager-toolbar">
        <Button
          type="button"
          onClick={() => {
            setDraft(emptyDraft);
            setIsAdding(true);
          }}
        >
          + Add tag
        </Button>
        <input
          className="transaction-tag-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search tags…"
          aria-label="Search tags"
        />
      </div>

      <div className="transaction-tag-list" aria-label="Transaction tags">
        {isAdding ? (
          <div className="transaction-tag-row transaction-tag-row-editing">
            <span className="transaction-tag-grip" aria-hidden="true">⠿</span>
            <TransactionTagAppearancePicker
              colour={draft.colour}
              icon={draft.icon}
              label={draft.name || "new tag"}
              onChange={(appearance) =>
                setDraft((current) => ({
                  ...current,
                  colour: appearance.colour,
                  icon: appearance.icon ?? undefined,
                }))
              }
            />
            <input
              className="transaction-tag-name-input"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") createTag();
                if (event.key === "Escape") setIsAdding(false);
              }}
              placeholder="Tag name"
              autoFocus
            />
            <label className="transaction-tag-auto-control">
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
              <span>Auto</span>
            </label>
            <div className="transaction-tag-row-actions">
              <Button type="button" onClick={createTag}>Add</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsAdding(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {visibleTags.length === 0 && !isAdding ? (
          <div className="transaction-tag-empty">
            {search.trim()
              ? "No tags match your search."
              : "No tags yet. Add one when you need a reusable transaction label."}
          </div>
        ) : null}

        {visibleTags.map((tag) => {
          const usage = service.getUsage(tag.id);
          return (
            <div
              className={`transaction-tag-row${
                draggedTagId === tag.id ? " transaction-tag-row-dragging" : ""
              }${
                dragOverTagId === tag.id ? " transaction-tag-row-drop-target" : ""
              }`}
              key={tag.id}
              onDragOver={(event) => {
                if (!canReorder || draggedTagId === tag.id) {
                  return;
                }

                event.preventDefault();
                setDragOverTagId(tag.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId =
                  draggedTagId || event.dataTransfer.getData("text/plain");

                if (canReorder && sourceId) {
                  reorderTag(sourceId, tag.id);
                }

                setDraggedTagId(null);
                setDragOverTagId(null);
              }}
            >
              <span
                className="transaction-tag-grip"
                draggable={canReorder}
                aria-label={`Drag ${tag.name} to reorder`}
                title={
                  canReorder
                    ? "Drag to reorder"
                    : "Clear search to reorder tags"
                }
                onDragStart={(event) => {
                  if (!canReorder) {
                    event.preventDefault();
                    return;
                  }

                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", tag.id);
                  setDraggedTagId(tag.id);
                }}
                onDragEnd={() => {
                  setDraggedTagId(null);
                  setDragOverTagId(null);
                }}
              >
                ⠿
              </span>
              <TransactionTagAppearancePicker
                colour={tag.colour}
                icon={tag.icon}
                label={tag.name}
                onChange={(appearance) => updateTag(tag, appearance)}
              />
              <input
                className="transaction-tag-name-input"
                defaultValue={tag.name}
                aria-label={`Tag name for ${tag.name}`}
                onBlur={(event) => {
                  if (event.target.value.trim() !== tag.name) {
                    updateTag(tag, { name: event.target.value });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    event.currentTarget.value = tag.name;
                    event.currentTarget.blur();
                  }
                }}
              />
              <span className="transaction-tag-usage">
                {usage.transactionCount}
              </span>
              <label className="transaction-tag-auto-control">
                <input
                  type="checkbox"
                  checked={tag.autoTagImportedTransactions}
                  onChange={(event) =>
                    updateTag(tag, {
                      autoTagImportedTransactions: event.target.checked,
                    })
                  }
                />
                <span>Auto</span>
              </label>
              <button
                className="transaction-tag-delete"
                type="button"
                onClick={() => void deleteTag(tag)}
                aria-label={`Delete ${tag.name}`}
                title={
                  usage.transactionCount > 0
                    ? `Delete tag and remove it from ${usage.transactionCount} transaction${
                        usage.transactionCount === 1 ? "" : "s"
                      }`
                    : "Delete tag"
                }
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <p className="transaction-tag-manager-tip">
        Auto-tags are automatically applied to imported transactions for review
        or approval.
      </p>
    </div>
  );
}

