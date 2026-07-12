import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import type { TransactionTagService } from "./transactionTagService";
import type {
  TransactionTagColour,
  TransactionTagDefinition,
} from "./transactionTagTypes";
import "./transactionTagManager.css";

export const transactionTagColourOptions: ReadonlyArray<{
  value: TransactionTagColour;
  label: string;
  swatch: string;
}> = [
  { value: "red", label: "Red", swatch: "#dc5548" },
  { value: "gray", label: "Gray", swatch: "#747b88" },
  { value: "orange", label: "Orange", swatch: "#ed7d2b" },
  { value: "yellow", label: "Yellow", swatch: "#e7b72d" },
  { value: "lime", label: "Lime", swatch: "#8bc735" },
  { value: "green", label: "Green", swatch: "#60bd67" },
  { value: "emerald", label: "Emerald", swatch: "#57b484" },
  { value: "teal", label: "Teal", swatch: "#55aca4" },
  { value: "cyan", label: "Cyan", swatch: "#56afd0" },
  { value: "blue", label: "Blue", swatch: "#4f7fe8" },
  { value: "indigo", label: "Indigo", swatch: "#5c63df" },
  { value: "purple", label: "Purple", swatch: "#a755d1" },
  { value: "pink", label: "Pink", swatch: "#df5795" },
  { value: "brown", label: "Brown", swatch: "#936646" },
  { value: "slate", label: "Slate", swatch: "#425166" },
  { value: "black", label: "Black", swatch: "#24272d" },
];

interface TransactionTagManagerProps {
  service: TransactionTagService;
}

interface NewTagDraft {
  name: string;
  colour: TransactionTagColour;
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
  const [statusMessage, setStatusMessage] = useState(
    "Create and organise reusable labels for your transactions.",
  );

  const visibleTags = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? tags.filter((tag) => tag.name.toLocaleLowerCase().includes(query))
      : tags;
  }, [search, tags]);

  function refreshTags() {
    setTags(service.listTags());
  }

  function createTag() {
    try {
      const created = service.createTag({
        name: draft.name,
        colour: draft.colour,
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
    >,
  ) {
    try {
      const updated = service.updateTag({
        id: tag.id,
        name: changes.name ?? tag.name,
        description: tag.description,
        colour: changes.colour ?? tag.colour,
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

  function deleteTag(tag: TransactionTagDefinition) {
    const usage = service.getUsage(tag.id);

    if (
      usage.transactionCount > 0 &&
      !window.confirm(
        `Delete "${tag.name}"? This will remove it from ${usage.transactionCount} transaction${
          usage.transactionCount === 1 ? "" : "s"
        }.`,
      )
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
            <TagColourSelect
              value={draft.colour}
              onChange={(colour) =>
                setDraft((current) => ({ ...current, colour }))
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
            <div className="transaction-tag-row" key={tag.id}>
              <span className="transaction-tag-grip" aria-hidden="true">⠿</span>
              <TagColourSelect
                value={tag.colour}
                onChange={(colour) => updateTag(tag, { colour })}
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
                onClick={() => deleteTag(tag)}
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

interface TagColourSelectProps {
  value: TransactionTagColour;
  onChange: (colour: TransactionTagColour) => void;
}

function TagColourSelect({ value, onChange }: TagColourSelectProps) {
  const selected =
    transactionTagColourOptions.find((option) => option.value === value) ??
    transactionTagColourOptions[0];

  return (
    <label className="transaction-tag-colour-control">
      <span
        className="transaction-tag-colour-swatch"
        style={{ backgroundColor: selected.swatch }}
        aria-hidden="true"
      />
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as TransactionTagColour)
        }
        aria-label="Tag colour"
      >
        {transactionTagColourOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
