import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { getBudgetPersistenceProvider } from "../../features/persistence/budgetPersistenceProviderFactory";
import { confirmDialog } from "../../features/ui/appDialogService";
import type { BudgetSummary } from "../../stores/budgetRegistryStore";

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

export function BudgetBackupRestoreDialog({
  budgets,
  onCancel,
  onRestored,
}: {
  budgets: readonly BudgetSummary[];
  onCancel: () => void;
  onRestored: (budgetId: string) => void;
}) {
  const [budgetId, setBudgetId] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const targetBudget = budgets.find((budget) => budget.id === budgetId) ?? null;

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
    } catch {
      setError("Budget App could not read the selected backup file.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!targetBudget) {
      setError("Choose the existing budget this backup belongs to.");
      return;
    }
    if (!backupFile) {
      setError("Choose a valid SQLite budget backup.");
      return;
    }

    const confirmed = await confirmDialog({
      title: `Restore “${targetBudget.name}” from backup?`,
      message:
        "Budget App will verify that the backup belongs to this budget before replacing anything. If validation succeeds, the current budget data will be replaced atomically with the backup.",
      confirmLabel: "Restore budget",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;

    const queries = getBudgetPersistenceProvider().accountRegisterQueries;
    if (
      !queries?.restoreBudget ||
      !queries.activateLocalBudget ||
      !queries.releaseLocalDatabase
    ) {
      setError("SQLite budget restore is unavailable in this browser session.");
      return;
    }

    setBusy(true);
    setError(null);
    let activated = false;
    try {
      await queries.activateLocalBudget(targetBudget.id);
      activated = true;
      await queries.restoreBudget(targetBudget.id, backupFile);
      onRestored(targetBudget.id);
    } catch (restoreError) {
      if (activated) {
        try {
          await queries.releaseLocalDatabase();
        } catch (releaseError) {
          console.error(
            "Budget restore failed and the temporary launcher database could not be released.",
            releaseError,
          );
        }
      }
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "The budget backup could not be restored.",
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
            Restore an existing budget from a SQLite backup created by Budget App.
            Choose the budget first, then select its backup file. The backup identity
            and sync lineage are checked before any replacement is activated.
          </p>

          {budgets.length === 0 ? (
            <p className="form-error" role="alert">
              There are no existing budgets to restore. Backup restore currently
              requires the original budget to exist in Budget Manager.
            </p>
          ) : (
            <>
              <label className="form-field">
                <span className="field-label">Budget to restore</span>
                <select
                  className="text-input"
                  value={budgetId}
                  disabled={busy}
                  onChange={(event) => {
                    setBudgetId(event.target.value);
                    setError(null);
                  }}
                >
                  <option value="">Choose a budget…</option>
                  {budgets.map((budget) => (
                    <option key={budget.id} value={budget.id}>
                      {budget.name}
                    </option>
                  ))}
                </select>
              </label>

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
            </>
          )}

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
              disabled={busy || !targetBudget || !backupFile}
            >
              {busy ? "Restoring…" : "Restore Budget"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
