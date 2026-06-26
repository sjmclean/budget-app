import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  createBudgetDataExportPackage,
  createBudgetDataFilename,
  previewBudgetDataRestore,
  restoreBudgetDataPackage,
  serialiseBudgetDataPackage,
  type BudgetDataExportKind,
  type BudgetDataRestorePreview,
} from "../features/budget/budgetDataExport";
import { deleteCurrentBudget, resetCurrentBudget } from "../features/budget/budgetLifecycle";
import { browserLocalStorageKeyValueStorage } from "../features/persistence/keyValueStoragePort";
import { getPersistenceModeSummary } from "../features/persistence/persistenceMode";
import {
  currencyOptions,
  currencySymbolOptions,
  defaultSettingsPreferences,
  getCurrencySymbol,
  readSettingsPreferences,
  type DateFormatPreference,
  type FirstDayOfWeekPreference,
  type NumberFormatPreference,
  type SettingsPreferences,
  writeSettingsPreferences,
} from "../features/settings/settingsPreferences";
import { confirmDialog } from "../features/ui/appDialogService";
import { formatDateForDisplay, notifySettingsPreferencesChanged } from "../features/settings/dateFormatting";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore, type ThemeMode } from "../stores/uiStore";

type SettingsSectionId = "general" | "budget" | "data" | "cloud" | "about";

const settingsSections: Array<{
  id: SettingsSectionId;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    id: "general",
    label: "General",
    icon: "⚙",
    description: "Configure how the application looks and behaves.",
  },
  {
    id: "budget",
    label: "Budget",
    icon: "▣",
    description: "Manage your budget profile and default settings.",
  },
  {
    id: "data",
    label: "Data",
    icon: "◫",
    description: "Export, backup, and restore your budget data.",
  },
  {
    id: "cloud",
    label: "Cloud",
    icon: "☁",
    description: "Sync your budget with cloud storage.",
  },
  {
    id: "about",
    label: "About",
    icon: "ⓘ",
    description: "Application information and system details.",
  },
];

function getLocaleForNumberFormat(format: NumberFormatPreference): string {
  if (format === "1.234,56") {
    return "de-DE";
  }

  if (format === "1 234,56") {
    return "fr-FR";
  }

  return "en-AU";
}

function formatDatePreview(format: DateFormatPreference): string {
  return formatDateForDisplay(new Date(2026, 5, 22), format);
}

function formatMoneyPreview(settings: SettingsPreferences): string {
  const unsigned = new Intl.NumberFormat(getLocaleForNumberFormat(settings.general.numberFormat), {
    minimumFractionDigits: settings.budget.decimalPlaces,
    maximumFractionDigits: settings.budget.decimalPlaces,
  }).format(1234.56);

  const negative = new Intl.NumberFormat(getLocaleForNumberFormat(settings.general.numberFormat), {
    minimumFractionDigits: settings.budget.decimalPlaces,
    maximumFractionDigits: settings.budget.decimalPlaces,
  }).format(42.1);

  return `${settings.budget.currencySymbol}${unsigned} / -${settings.budget.currencySymbol}${negative}`;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const clearSelectedBudget = useUIStore((state) => state.clearSelectedBudget);
  const refreshBudgets = useBudgetRegistryStore((state) => state.refreshBudgets);
  const persistenceMode = getPersistenceModeSummary();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const [settings, setSettings] = useState<SettingsPreferences>(() =>
    readSettingsPreferences(browserLocalStorageKeyValueStorage),
  );
  const [statusMessage, setStatusMessage] = useState("Settings saved locally.");
  const [dataStatusMessage, setDataStatusMessage] = useState("Export or back up the currently selected budget.");
  const [restorePreview, setRestorePreview] = useState<BudgetDataRestorePreview | null>(null);
  const [restorePackageRaw, setRestorePackageRaw] = useState<string | null>(null);

  useEffect(() => {
    setSettings((current) => ({
      ...current,
      general: {
        ...current.general,
        theme,
      },
    }));
  }, [theme]);

  const preview = useMemo(
    () => ({
      date: formatDatePreview(settings.general.dateFormat),
      money: formatMoneyPreview(settings),
    }),
    [settings],
  );

  const currentSection = settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0];

  function persist(next: SettingsPreferences, message = "Settings saved locally.") {
    const saved = writeSettingsPreferences(browserLocalStorageKeyValueStorage, next);
    setSettings(saved);
    notifySettingsPreferencesChanged();
    setStatusMessage(message);
  }

  function updateGeneral<K extends keyof SettingsPreferences["general"]>(
    key: K,
    value: SettingsPreferences["general"][K],
  ) {
    const next = {
      ...settings,
      general: {
        ...settings.general,
        [key]: value,
      },
    };

    persist(next);

    if (key === "theme") {
      setTheme(value as ThemeMode);
    }
  }

  function updateBudget<K extends keyof SettingsPreferences["budget"]>(
    key: K,
    value: SettingsPreferences["budget"][K],
    message = "Budget settings saved locally.",
  ) {
    persist(
      {
        ...settings,
        budget: {
          ...settings.budget,
          [key]: value,
        },
      },
      message,
    );
  }

  function updateCurrency(currencyCode: string) {
    persist(
      {
        ...settings,
        budget: {
          ...settings.budget,
          currencyCode,
          currencySymbol: getCurrencySymbol(currencyCode),
        },
      },
      "Currency settings saved locally.",
    );
  }

  function downloadBudgetData(kind: BudgetDataExportKind) {
    try {
      const dataPackage = createBudgetDataExportPackage(browserLocalStorageKeyValueStorage, kind);
      const blob = new Blob([serialiseBudgetDataPackage(dataPackage)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = createBudgetDataFilename(dataPackage);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setDataStatusMessage(
        `${kind === "backup" ? "Backup" : "Export"} created for ${dataPackage.budget.name}: ${dataPackage.counts.accounts} accounts, ${dataPackage.counts.transactions} transactions.`,
      );
    } catch (error) {
      setDataStatusMessage(error instanceof Error ? error.message : "Could not create budget data package.");
    }
  }

  function previewRestoreFile(file: File | null) {
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === "string" ? reader.result : "";
      const preview = previewBudgetDataRestore(raw);
      setRestorePreview(preview);
      setRestorePackageRaw(preview.valid ? raw : null);
      setDataStatusMessage(
        preview.valid
          ? `Restore preview loaded for ${preview.budgetName ?? "budget package"}. No data has been changed.`
          : "Restore preview failed validation. No data has been changed.",
      );
    };
    reader.onerror = () => {
      setRestorePreview(null);
      setRestorePackageRaw(null);
      setDataStatusMessage("Could not read restore file. No data has been changed.");
    };
    reader.readAsText(file);
  }

  function commitRestorePreview() {
    if (!restorePreview?.valid || !restorePackageRaw) {
      setDataStatusMessage("Load a valid restore preview before restoring.");
      return;
    }

    const confirmed = confirmDialog({
      title: "Restore current budget?",
      message:
        `This will replace the data in the currently selected budget with the backup for ${restorePreview.budgetName ?? "the selected package"}. Other budgets and global app preferences will not be restored.`,
    });

    if (!confirmed) {
      setDataStatusMessage("Restore cancelled. No data has been changed.");
      return;
    }

    const result = restoreBudgetDataPackage(browserLocalStorageKeyValueStorage, restorePackageRaw);

    if (!result.restored) {
      setDataStatusMessage(result.errors[0] ?? "Restore failed. No data has been changed.");
      return;
    }

    setDataStatusMessage(
      `Restore complete for current budget: ${result.writtenRecords} records restored, ${result.skippedGlobalRecords} global snapshots skipped. Reload the app if open screens still show old data.`,
    );
    setRestorePreview(null);
    setRestorePackageRaw(null);
  }

  function handleResetCurrentBudget() {
    const confirmed = confirmDialog({
      title: "Reset current budget?",
      message:
        "This will permanently remove accounts, transactions, payees, scheduled transactions, attachments, and custom categories from the currently selected budget. Budget settings are preserved and starter categories will be recreated. Create a backup first if you need a recovery point.",
    });

    if (!confirmed) {
      setDataStatusMessage("Reset cancelled. No data has been changed.");
      return;
    }

    const result = resetCurrentBudget(browserLocalStorageKeyValueStorage);
    refreshBudgets();

    if (!result.completed) {
      setDataStatusMessage(result.errors[0] ?? "Reset failed. No data has been changed.");
      return;
    }

    setRestorePreview(null);
    setRestorePackageRaw(null);
    setDataStatusMessage(
      `Reset complete for ${result.budgetName}: ${result.removedRecords} budget records removed and starter categories reapplied. Reload open screens if they still show old data.`,
    );
  }

  function handleDeleteCurrentBudget() {
    const confirmed = confirmDialog({
      title: "Delete current budget?",
      message:
        "This will permanently delete the currently selected budget and all data associated with it. Other budgets and global app preferences are preserved. Create a backup first if you need a recovery point. This action cannot be undone.",
    });

    if (!confirmed) {
      setDataStatusMessage("Delete cancelled. No data has been changed.");
      return;
    }

    const result = deleteCurrentBudget(browserLocalStorageKeyValueStorage);
    refreshBudgets();
    clearSelectedBudget();

    if (!result.completed) {
      setDataStatusMessage(result.errors[0] ?? "Delete failed. No data has been changed.");
      return;
    }

    setDataStatusMessage(`Deleted ${result.budgetName}. Returning to the budget selector.`);
    navigate("/");
  }

  function closeSettings() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/budget");
  }

  function resetDisplaySettings() {
    persist(
      {
        ...settings,
        general: {
          ...defaultSettingsPreferences.general,
          theme,
        },
      },
      "Display preferences reset to defaults.",
    );
  }

  return (
    <div className="settings-modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <aside className="settings-sidebar" aria-label="Settings sections">
          <div className="settings-sidebar-header">
            <span className="settings-sidebar-icon">⚙</span>
            <div>
              <h1 id="settings-title">Settings</h1>
              <p className="muted">v1.51.0</p>
            </div>
          </div>

          <nav className="settings-nav">
            {settingsSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-nav-button${activeSection === section.id ? " active" : ""}`}
                onClick={() => setActiveSection(section.id)}
                aria-current={activeSection === section.id ? "page" : undefined}
              >
                <span aria-hidden="true">{section.icon}</span>
                {section.label}
              </button>
            ))}
          </nav>

          <div className="settings-sidebar-footer">
            <strong>v1.51.0</strong>
            <span>Budget Lifecycle</span>
          </div>
        </aside>

        <main className="settings-page">
          <section className="settings-page-header">
            <div className="settings-section-title-row">
              <span className="settings-section-icon" aria-hidden="true">{currentSection.icon}</span>
              <div>
                <p className="eyebrow">Settings</p>
                <h1>{currentSection.label}</h1>
                <p className="muted">{currentSection.description}</p>
              </div>
            </div>
            <div className="settings-page-header-actions">
              {activeSection === "budget" ? (
                <div className="settings-money-preview settings-money-preview-header" aria-label="Money preview">
                  <span>Money preview</span>
                  <strong>{preview.money}</strong>
                </div>
              ) : null}
              <Button type="button" variant="ghost" onClick={closeSettings} aria-label="Close settings">
                ✕
              </Button>
            </div>
          </section>

        {activeSection === "general" ? (
          <Card className="settings-section-card">
            <div className="settings-section-header">
              <div>
                <p className="eyebrow">General</p>
                <h2>Display preferences</h2>
              </div>
              <Button type="button" variant="ghost" onClick={resetDisplaySettings}>
                Reset display defaults
              </Button>
            </div>

            <div className="settings-panel-grid">
              <label className="settings-field">
                <span>Theme</span>
                <select
                  value={settings.general.theme}
                  onChange={(event) => updateGeneral("theme", event.target.value as ThemeMode)}
                  className="select"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>

              <label className="settings-field">
                <span>Number format</span>
                <select
                  value={settings.general.numberFormat}
                  onChange={(event) =>
                    updateGeneral("numberFormat", event.target.value as NumberFormatPreference)
                  }
                  className="select"
                >
                  <option value="1,234.56">1,234.56</option>
                  <option value="1.234,56">1.234,56</option>
                  <option value="1 234,56">1 234,56</option>
                </select>
              </label>

              <label className="settings-field">
                <span>Date format</span>
                <select
                  value={settings.general.dateFormat}
                  onChange={(event) =>
                    updateGeneral("dateFormat", event.target.value as DateFormatPreference)
                  }
                  className="select"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
                <small>Preview: {preview.date}</small>
              </label>

              <label className="settings-field">
                <span>Language</span>
                <select
                  value={settings.general.language}
                  onChange={(event) => updateGeneral("language", event.target.value)}
                  className="select"
                >
                  <option value="English">English</option>
                </select>
              </label>

              <label className="settings-field">
                <span>First day of week</span>
                <select
                  value={settings.general.firstDayOfWeek}
                  onChange={(event) =>
                    updateGeneral("firstDayOfWeek", event.target.value as FirstDayOfWeekPreference)
                  }
                  className="select"
                >
                  <option value="monday">Monday</option>
                  <option value="sunday">Sunday</option>
                  <option value="saturday">Saturday</option>
                </select>
              </label>

              <label className="settings-field settings-field-wide settings-checkbox-field">
                <input
                  type="checkbox"
                  checked={settings.general.developerPerformanceMode}
                  onChange={(event) =>
                    updateGeneral("developerPerformanceMode", event.target.checked)
                  }
                />
                <span>
                  Developer performance mode
                  <small>Show register timing diagnostics and large-data counters while profiling.</small>
                </span>
              </label>
            </div>
          </Card>
        ) : null}

        {activeSection === "budget" ? (
          <Card className="settings-section-card">
            <div className="settings-section-header settings-budget-header">
              <div>
                <p className="eyebrow">Budget</p>
                <h2>Budget profile and defaults</h2>
                <p className="muted">{statusMessage}</p>
              </div>
            </div>

            <div className="settings-panel-grid settings-budget-grid">
              <label className="settings-field settings-field-wide">
                <span>Budget name</span>
                <div className="settings-inline-control">
                  <input
                    className="settings-input"
                    value={settings.budget.budgetName}
                    onChange={(event) =>
                      updateBudget("budgetName", event.target.value, "Budget renamed locally.")
                    }
                  />
                  <Button type="button" variant="secondary" disabled>
                    Rename...
                  </Button>
                </div>
              </label>

              <div className="settings-divider" />

              <label className="settings-field">
                <span>Currency</span>
                <select
                  value={settings.budget.currencyCode}
                  onChange={(event) => updateCurrency(event.target.value)}
                  className="select"
                >
                  {currencyOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Currency symbol</span>
                <select
                  value={settings.budget.currencySymbol}
                  onChange={(event) => updateBudget("currencySymbol", event.target.value)}
                  className="select"
                >
                  {currencySymbolOptions.map((option) => (
                    <option key={option.symbol} value={option.symbol}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Decimal places</span>
                <select
                  value={settings.budget.decimalPlaces}
                  onChange={(event) => updateBudget("decimalPlaces", Number(event.target.value))}
                  className="select"
                >
                  <option value={0}>0</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </label>

              <label className="settings-field">
                <span>Future month budgeting limit</span>
                <select
                  value={settings.budget.futureMonthLimit}
                  onChange={(event) => updateBudget("futureMonthLimit", Number(event.target.value))}
                  className="select"
                >
                  <option value={1}>1 month</option>
                  <option value={2}>2 months</option>
                  <option value={3}>3 months</option>
                  <option value={6}>6 months</option>
                  <option value={12}>12 months</option>
                </select>
                <small>Limits how many months ahead you can budget.</small>
              </label>
            </div>
          </Card>
        ) : null}

        {activeSection === "data" ? (
          <Card className="settings-section-card">
            <div className="settings-section-header">
              <div>
                <p className="eyebrow">Data</p>
                <h2>Backup, export, and restore</h2>
                <p className="muted">{dataStatusMessage}</p>
              </div>
            </div>
            <div className="settings-action-grid">
              <div className="settings-action-card">
                <h3>Export Budget</h3>
                <p className="muted">Download a portable JSON export for the currently selected budget.</p>
                <Button type="button" variant="secondary" onClick={() => downloadBudgetData("export")}>
                  Export JSON
                </Button>
              </div>
              <div className="settings-action-card">
                <h3>Backup Budget</h3>
                <p className="muted">Create a restorable JSON backup package for the active budget.</p>
                <Button type="button" variant="secondary" onClick={() => downloadBudgetData("backup")}>
                  Backup JSON
                </Button>
              </div>
              <div className="settings-action-card">
                <h3>Restore Preview</h3>
                <p className="muted">Validate a previous export or backup without changing app data.</p>
                <label className="button button-secondary settings-file-button">
                  Preview restore
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) => previewRestoreFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>

            <div className="settings-action-grid settings-danger-grid">
              <div className="settings-action-card settings-danger-card">
                <h3>Reset Current Budget</h3>
                <p className="muted">
                  Remove budget data and recreate starter categories while preserving the budget entry and settings.
                </p>
                <Button type="button" variant="secondary" onClick={handleResetCurrentBudget}>
                  Reset Budget
                </Button>
              </div>
              <div className="settings-action-card settings-danger-card">
                <h3>Delete Current Budget</h3>
                <p className="muted">
                  Permanently delete the selected budget and return to the budget selector. Other budgets are preserved.
                </p>
                <Button type="button" variant="secondary" onClick={handleDeleteCurrentBudget}>
                  Delete Budget
                </Button>
              </div>
            </div>

            {restorePreview ? (
              <div className={`settings-restore-preview${restorePreview.valid ? " valid" : " invalid"}`}>
                <div>
                  <p className="eyebrow">Restore preview</p>
                  <h3>{restorePreview.valid ? "Package looks valid" : "Package needs attention"}</h3>
                  <p className="muted">
                    {restorePreview.budgetName ?? "Unknown budget"}
                    {restorePreview.exportedAt ? ` · Exported ${restorePreview.exportedAt.slice(0, 10)}` : ""}
                  </p>
                </div>

                {restorePreview.counts ? (
                  <div className="settings-restore-counts">
                    <span>{restorePreview.counts.accounts} accounts</span>
                    <span>{restorePreview.counts.transactions} transactions</span>
                    <span>{restorePreview.counts.payees} payees</span>
                    <span>{restorePreview.counts.scheduledTransactions} scheduled</span>
                    <span>{restorePreview.counts.budgetMonths} months</span>
                  </div>
                ) : null}

                {[...restorePreview.errors, ...restorePreview.warnings].length ? (
                  <ul className="settings-restore-messages">
                    {[...restorePreview.errors, ...restorePreview.warnings].map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}

                {restorePreview.valid ? (
                  <div className="settings-restore-actions">
                    <Button type="button" variant="secondary" onClick={commitRestorePreview}>
                      Restore current budget
                    </Button>
                    <p className="muted">
                      Restore replaces the currently selected budget only. Other budgets and global app preferences are left unchanged.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}

        {activeSection === "cloud" ? (
          <Card className="settings-section-card">
            <div className="settings-section-header">
              <div>
                <p className="eyebrow">Cloud</p>
                <h2>Cloud sync</h2>
                <p className="muted">
                  Cloud sync is not configured. Future setup will support file sync providers such as Dropbox, Google Drive, and iCloud.
                </p>
              </div>
              <Button type="button" variant="secondary" disabled>Configure...</Button>
            </div>
          </Card>
        ) : null}

        {activeSection === "about" ? (
          <Card className="settings-section-card">
            <div className="settings-section-header">
              <div>
                <p className="eyebrow">About</p>
                <h2>Application information</h2>
              </div>
            </div>
            <div className="settings-about-grid">
              <div>
                <span>Version</span>
                <strong>1.3.1</strong>
              </div>
              <div>
                <span>Release</span>
                <strong>v1.50</strong>
              </div>
              <div>
                <span>Persistence mode</span>
                <strong>{persistenceMode.label}</strong>
                <p className="muted">{persistenceMode.description}</p>
              </div>
            </div>
          </Card>
        ) : null}
        </main>
      </section>
    </div>
  );
}
