import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { useBudgetRegistryStore, type BudgetSummary } from "../../stores/budgetRegistryStore";

const SQLITE_HEADER = "SQLite format 3\u0000";

export function hasSqliteBackupHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < SQLITE_HEADER.length) return false;
  for (let index = 0; index < SQLITE_HEADER.length; index += 1) {
    if (bytes[index] !== SQLITE_HEADER.charCodeAt(index)) return false;
  }
  return true;
}

async function validateBackupFile(file: File): Promise<string | null> {
  if (file.size < SQLITE_HEADER.length) {
    return "This file is too small to be a SQLite budget backup.";
  }

  const header = new Uint8Array(
    await file.slice(0, SQLITE_HEADER.length).arrayBuffer(),
  );
  return hasSqliteBackupHeader(header)
    ? null
    : "This file is not a SQLite budget backup.";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function normaliseBackupName(fileName: string): string {
  return fileName
    .replace(/\.(?:budget-sqlite|sqlite3?|db)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestRestoredBudgetName(
  fileName: string,
  budgets: readonly Pick<BudgetSummary, "name">[],
): string {
  const base = normaliseBackupName(fileName) || "Restored Budget";
  const existing = new Set(
    budgets.map((budget) => budget.name.trim().toLocaleLowerCase()),
  );

  if (!existing.has(base.toLocaleLowerCase())) return base;

  const firstRestored = `${base} (Restored)`;
  if (!existing.has(firstRestored.toLocaleLowerCase())) return firstRestored;

  let suffix = 2;
  while (existing.has(`${base} (Restored ${suffix})`.toLocaleLowerCase())) {
    suffix += 1;
  }
  return `${base} (Restored ${suffix})`;
}

export function BudgetBackupRestoreDialog({
  budgets,
  onCancel,
  onRestored,
}: {
  budgets: readonly BudgetSummary[];
  onCancel: () => void;
  onRestored: (budgetId: string) => void;
}) {
  const restoreBackupAsNewBudget = useBudgetRegistryStore(
    (state) => state.restoreBackupAsNewBudget,
  );
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [budgetName, setBudgetName] = useState("");
  const [nameWasEdited, setNameWasEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function selectBackupFile(file: File | null) {
    setBackupFile(null);
    setError(null);
    if (!file) return;

    try {
      const validationError = await validateBackupFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setBackupFile(file);
      if (!nameWasEdited || !budgetName.trim()) {
        setBudgetName(suggestRestoredBudgetName(file.name, budgets));
        setNameWasEdited(false);
      }
    } catch {
      setError("Budget App could not read the selected backup file.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!backupFile) {
      setError("Choose a valid SQLite budget backup.");
      return;
    }

    const nextName = budgetName.trim();
    if (!nextName) {
      setError("Enter a name for the restored budget.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const budget = await restoreBackupAsNewBudget({
        name: nextName,
        file: backupFile,
      });
      onRestored(budget.id);
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "The budget backup could not be restored as a new budget.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-dialog-backdrop" role="presentation">
      <section
        className="app-dialog budget-backup-restore-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="budget-backup-restore-title"
      >
        <form onSubmit={(event) => void submit(event)}>
          <h2 id="budget-backup-restore-title" className="app-dialog-title">
            Restore Backup
          </h2>
          <p className="app-dialog-message">
            Create a new independent budget from a SQLite backup created by Budget App.
            Existing budgets will not be changed or replaced.
          </p>

          <label className="form-field">
            <span className="field-label">Backup file</span>
            <input
              type="file"
              accept=".budget-sqlite,application/vnd.sqlite3,application/x-sqlite3,application/octet-stream"
              disabled={busy}
              onChange={(event) =>
                void selectBackupFile(event.currentTarget.files?.[0] ?? null)
              }
            />
          </label>

          {backupFile ? (
            <p className="muted">
              Selected: {backupFile.name} · {formatFileSize(backupFile.size)}
            </p>
          ) : null}

          <label className="form-field">
            <span className="field-label">Budget name</span>
            <input
              className="text-input"
              type="text"
              value={budgetName}
              disabled={busy}
              placeholder="Restored Budget"
              onChange={(event) => {
                setBudgetName(event.target.value);
                setNameWasEdited(true);
                setError(null);
              }}
            />
          </label>

          <p className="muted">
            The restored copy receives a new budget identity and sync history, so it can safely coexist with the original budget.
          </p>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <div className="app-dialog-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !backupFile || !budgetName.trim()}
            >
              {busy ? "Restoring…" : "Restore as New Budget"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
