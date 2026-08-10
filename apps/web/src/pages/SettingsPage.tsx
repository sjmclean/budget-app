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
import {
  createPortableBudgetPackage,
  createPortableBudgetPackageFilename,
  previewPortableBudgetPackage,
  restorePortableBudgetPackage,
  serialisePortableBudgetPackage,
  type PortableBudgetPackagePreview,
} from "../features/budget/portableBudgetPackage";
import { deleteCurrentBudget, resetCurrentBudget } from "../features/budget/budgetLifecycle";
import { resolveActiveBudget } from "../features/budget/activeBudget";
import {
  listVersionHistorySnapshots,
  restoreVersionHistorySnapshot,
  type VersionHistorySnapshotMetadata,
} from "../features/budget/versionHistory";
import {
  createVersionHistorySnapshotBeforeBudgetDelete,
  createVersionHistorySnapshotBeforeBudgetReset,
} from "../features/budget/versionHistoryLifecycle";
import { browserLocalStorageKeyValueStorage } from "../features/persistence/keyValueStoragePort";
import { getActiveKeyValueStorage } from "../features/persistence/activeKeyValueStorage";
import {
  assertBrowserBudgetFeatureAvailable,
  isHostedSqliteBudget,
} from "../features/persistence/hostedBudgetSafety";
import { getBudgetPersistenceProvider } from "../features/persistence";
import { getPersistenceModeSummary } from "../features/persistence/persistenceMode";
import { getReplicationBackgroundService } from "../features/persistence/replicationService";
import type { ReplicationConflict } from "../features/persistence/conflictResolution";
import { useReplicationStatus } from "../features/persistence/useReplicationStatus";
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
import { getCurrentBudgetMonth } from "../features/budget/budgetMonthNavigation";
import { useBudgetRegistryStore } from "../stores/budgetRegistryStore";
import { useUIStore, type ThemeMode } from "../stores/uiStore";

type SettingsSectionId = "general" | "budget" | "data" | "cloud" | "about";
type DataSettingsView = "overview" | "budget-history";

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

function formatHistoryDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatHistoryTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getHistoryGroupLabel(isoTimestamp: string, now = new Date()): string {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return "Earlier";
  }

  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const differenceInDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (differenceInDays === 0) {
    return "Today";
  }

  if (differenceInDays === 1) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function describeSnapshot(snapshot: VersionHistorySnapshotMetadata): string {
  if (snapshot.description) {
    return snapshot.description;
  }

  if (snapshot.source === "manual") {
    return "Created manually.";
  }

  return "Created automatically by Budget App.";
}

function formatSnapshotReason(snapshot: VersionHistorySnapshotMetadata): string {
  return snapshot.reason
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatSnapshotOrigin(snapshot: VersionHistorySnapshotMetadata): string {
  return snapshot.origin === "manual" ? "Manual" : "Automatic";
}

function formatSnapshotChangedAreas(snapshot: VersionHistorySnapshotMetadata): string {
  return snapshot.changedAreas.length ? snapshot.changedAreas.join(", ") : "Not specified";
}

function groupSnapshotsByDate(
  snapshots: VersionHistorySnapshotMetadata[],
): Array<{ label: string; snapshots: VersionHistorySnapshotMetadata[] }> {
  const groups: Array<{ label: string; snapshots: VersionHistorySnapshotMetadata[] }> = [];

  for (const snapshot of snapshots) {
    const label = getHistoryGroupLabel(snapshot.createdAt);
    const currentGroup = groups[groups.length - 1];

    if (currentGroup?.label === label) {
      currentGroup.snapshots.push(snapshot);
    } else {
      groups.push({ label, snapshots: [snapshot] });
    }
  }

  return groups;
}

interface SettingsPageProps {
  initialSection?: SettingsSectionId;
  initialDataView?: DataSettingsView;
}

export function SettingsPage({
  initialSection = "general",
  initialDataView = "overview",
}: SettingsPageProps = {}) {
  const navigate = useNavigate();
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const clearSelectedBudget = useUIStore((state) => state.clearSelectedBudget);
  const selectedBudgetId = useUIStore((state) => state.selectedBudgetId);
  const refreshBudgets = useBudgetRegistryStore((state) => state.refreshBudgets);
  const budgets = useBudgetRegistryStore((state) => state.budgets);
  const persistenceMode = getPersistenceModeSummary();
  const replicationStatus = useReplicationStatus();
  const [replicationBusy, setReplicationBusy] = useState(false);
  const [replicationConflicts, setReplicationConflicts] = useState<ReplicationConflict[]>([]);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const [dataView, setDataView] = useState<DataSettingsView>(initialDataView);
  const [settings, setSettings] = useState<SettingsPreferences>(() =>
    readSettingsPreferences(browserLocalStorageKeyValueStorage),
  );
  const [statusMessage, setStatusMessage] = useState("Settings saved locally.");
  const [dataStatusMessage, setDataStatusMessage] = useState("Export or back up the currently selected budget.");
  const [restorePreview, setRestorePreview] = useState<BudgetDataRestorePreview | null>(null);
  const [restorePackageRaw, setRestorePackageRaw] = useState<string | null>(null);
  const [hostedRestoreFile, setHostedRestoreFile] = useState<File | null>(null);
  const [portablePackagePreview, setPortablePackagePreview] = useState<PortableBudgetPackagePreview | null>(null);
  const [portablePackageRaw, setPortablePackageRaw] = useState<string | null>(null);
  const [portablePackageBusy, setPortablePackageBusy] = useState(false);
  const [historySnapshots, setHistorySnapshots] = useState<VersionHistorySnapshotMetadata[]>(() =>
    listVersionHistorySnapshots(getActiveKeyValueStorage()),
  );
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  useEffect(() => {
    if (!replicationStatus.supported) {
      setReplicationConflicts([]);
      return;
    }
    const backgroundService = getReplicationBackgroundService();
    if (!backgroundService) return;
    void backgroundService.listConflicts().then(setReplicationConflicts);
  }, [replicationStatus.supported, replicationStatus.unresolvedConflictCount, replicationStatus.lastSuccessfulSyncAt]);

  const currentSection = settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0];
  const activeBudget = resolveActiveBudget(budgets, selectedBudgetId);
  const accountRegisterQueries = getBudgetPersistenceProvider().accountRegisterQueries;
  const selectedSnapshot =
    historySnapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? historySnapshots[0] ?? null;
  const snapshotGroups = groupSnapshotsByDate(historySnapshots);

  useEffect(() => {
    setSettings((current) => ({
      ...current,
      general: {
        ...current.general,
        theme,
      },
    }));
  }, [theme]);

  useEffect(() => {
    const snapshots = listVersionHistorySnapshots(getActiveKeyValueStorage(), activeBudget?.id);
    setHistorySnapshots(snapshots);
    setSelectedSnapshotId((current) =>
      current && snapshots.some((snapshot) => snapshot.id === current)
        ? current
        : snapshots[0]?.id ?? null,
    );
  }, [activeBudget?.id]);



  const preview = useMemo(
    () => ({
      date: formatDatePreview(settings.general.dateFormat),
      money: formatMoneyPreview(settings),
    }),
    [settings],
  );

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

  async function ensureHostedDataOperationSupported(feature: string): Promise<boolean> {
    try {
      await assertBrowserBudgetFeatureAvailable(
        accountRegisterQueries,
        activeBudget?.id,
        feature,
      );
      return true;
    } catch (error) {
      setDataStatusMessage(error instanceof Error ? error.message : `${feature} is unavailable.`);
      return false;
    }
  }

  async function downloadBudgetData(kind: BudgetDataExportKind) {
    if (
      activeBudget?.id &&
      accountRegisterQueries &&
      await isHostedSqliteBudget(accountRegisterQueries, activeBudget.id)
    ) {
      const blob = accountRegisterQueries.exportBudget
        ? await accountRegisterQueries.exportBudget(activeBudget.id, kind)
        : null;
      const link = document.createElement("a");
      const localUrl = blob ? URL.createObjectURL(blob) : null;
      link.href = localUrl ?? accountRegisterQueries.getBudgetExportUrl(activeBudget.id, kind);
      link.download = blob
        ? `${activeBudget.name}-${kind}.budget-sqlite`
        : "";
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (localUrl) URL.revokeObjectURL(localUrl);
      setDataStatusMessage(
        `${kind === "backup" ? "Backup" : "Export"} download started from the local SQLite budget.`,
      );
      return;
    }
    try {
      const dataPackage = createBudgetDataExportPackage(getActiveKeyValueStorage(), kind);
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

  async function downloadPortablePackage() {
    if (!(await ensureHostedDataOperationSupported("Portable budget export"))) return;
    setPortablePackageBusy(true);
    try {
      const dataPackage = await createPortableBudgetPackage(getActiveKeyValueStorage());
      const blob = new Blob([serialisePortableBudgetPackage(dataPackage)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = createPortableBudgetPackageFilename(dataPackage);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const totalBytes = dataPackage.attachments.reduce((sum, item) => sum + item.size, 0);
      setDataStatusMessage(`Portable package created with ${dataPackage.attachments.length} attachments (${formatFileSize(totalBytes)}).`);
    } catch (error) {
      setDataStatusMessage(error instanceof Error ? error.message : "Could not create portable budget package.");
    } finally {
      setPortablePackageBusy(false);
    }
  }

  function previewPortablePackageFile(file: File | null) {
    if (!file) return;
    setPortablePackageBusy(true);
    void file.text().then(async (raw) => {
      const preview = await previewPortableBudgetPackage(raw);
      setPortablePackagePreview(preview);
      setPortablePackageRaw(preview.valid ? raw : null);
      setDataStatusMessage(preview.valid
        ? `Portable package verified for ${preview.budgetName ?? "budget"}. No data has been changed.`
        : "Portable package validation failed. No data has been changed.");
    }).catch(() => {
      setPortablePackagePreview(null);
      setPortablePackageRaw(null);
      setDataStatusMessage("Could not read portable package. No data has been changed.");
    }).finally(() => setPortablePackageBusy(false));
  }

  async function commitPortablePackageRestore() {
    if (!(await ensureHostedDataOperationSupported("Portable budget restore"))) return;
    if (!portablePackagePreview?.valid || !portablePackageRaw) return;
    const confirmed = await confirmDialog({
      title: "Restore portable budget package?",
      message: `This replaces the current budget with ${portablePackagePreview.budgetName ?? "the packaged budget"} and restores its embedded attachments. Other budgets remain unchanged.`,
      confirmLabel: "Restore package",
      tone: "danger",
    });
    if (!confirmed) return;
    setPortablePackageBusy(true);
    try {
      const result = await restorePortableBudgetPackage(getActiveKeyValueStorage(), portablePackageRaw);
      if (!result.restored) {
        setDataStatusMessage(result.errors[0] ?? "Portable package restore failed.");
        return;
      }
      setDataStatusMessage(`Portable package restored: ${result.writtenRecords} records and ${result.restoredAttachments} attachment files. Reload the app if open screens still show old data.`);
      setPortablePackagePreview(null);
      setPortablePackageRaw(null);
    } finally {
      setPortablePackageBusy(false);
    }
  }

  function previewRestoreFile(file: File | null) {
    if (!file) {
      return;
    }

    const isHostedBackup =
      file.type === "application/x-ndjson" ||
      file.name.toLocaleLowerCase().endsWith(".budget-ndjson");
    void isHostedSqliteBudget(accountRegisterQueries, activeBudget?.id).then((hosted) => {
      if (hosted || isHostedBackup) {
        setHostedRestoreFile(file);
        setRestorePreview(null);
        setRestorePackageRaw(null);
        setDataStatusMessage(
          `Hosted SQLite backup selected (${formatFileSize(file.size)}). ` +
          "The server will stream, validate, and stage it before activation.",
        );
        return;
      }
      setHostedRestoreFile(null);
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
    }).catch((error) => {
      setDataStatusMessage(error instanceof Error ? error.message : "Could not inspect the selected budget.");
    });
  }

  async function commitRestorePreview() {
    if (hostedRestoreFile && activeBudget?.id && accountRegisterQueries) {
      const confirmed = await confirmDialog({
        title: "Restore hosted SQLite budget?",
        message:
          "The backup will be streamed into a staged generation, validated, and activated only after its integrity checks pass.",
        confirmLabel: "Restore budget",
        tone: "danger",
      });
      if (!confirmed) {
        setDataStatusMessage("Restore cancelled. No data has been changed.");
        return;
      }
      setDataStatusMessage("Streaming and validating hosted SQLite backup...");
      try {
        const result = await accountRegisterQueries.restoreBudget(
          activeBudget.id,
          hostedRestoreFile,
        );
        setHostedRestoreFile(null);
        setDataStatusMessage(
          `Hosted restore complete: ${result.counts.accounts} accounts and ` +
          `${result.counts.transactions} transactions restored atomically.`,
        );
      } catch (error) {
        setDataStatusMessage(
          error instanceof Error ? error.message : "Hosted SQLite restore failed. No data was activated.",
        );
      }
      return;
    }
    if (!(await ensureHostedDataOperationSupported("Budget restore"))) return;
    if (!restorePreview?.valid || !restorePackageRaw) {
      setDataStatusMessage("Load a valid restore preview before restoring.");
      return;
    }

    const confirmed = await confirmDialog({
      title: "Restore current budget?",
      message:
        `This will replace the data in the currently selected budget with the backup for ${restorePreview.budgetName ?? "the selected package"}. Other budgets and global app preferences will not be restored.`,
      confirmLabel: "Restore budget",
      tone: "danger",
    });

    if (!confirmed) {
      setDataStatusMessage("Restore cancelled. No data has been changed.");
      return;
    }

    const result = restoreBudgetDataPackage(getActiveKeyValueStorage(), restorePackageRaw);

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

  function refreshVersionHistory() {
    const snapshots = listVersionHistorySnapshots(getActiveKeyValueStorage(), activeBudget?.id);
    setHistorySnapshots(snapshots);
    setSelectedSnapshotId((current) =>
      current && snapshots.some((snapshot) => snapshot.id === current)
        ? current
        : snapshots[0]?.id ?? null,
    );
  }

  async function restoreSelectedSnapshot() {
    if (!(await ensureHostedDataOperationSupported("Version-history restore"))) return;
    if (!selectedSnapshot) {
      setDataStatusMessage("Choose a restore point before restoring.");
      return;
    }

    const confirmed = await confirmDialog({
      title: "Restore budget from restore point?",
      message: `This will replace the current ${selectedSnapshot.budgetName} budget with the version from ${formatHistoryDateTime(selectedSnapshot.createdAt)}.`,
      confirmLabel: "Restore",
      tone: "danger",
    });

    if (!confirmed) {
      setDataStatusMessage("Restore cancelled. No data has been changed.");
      return;
    }

    const result = restoreVersionHistorySnapshot(getActiveKeyValueStorage(), selectedSnapshot.id);

    if (!result.restored) {
      setDataStatusMessage(result.errors[0] ?? "Restore point could not be restored.");
      return;
    }

    refreshVersionHistory();
    setDataStatusMessage(`Restored ${selectedSnapshot.budgetName} to ${formatHistoryDateTime(selectedSnapshot.createdAt)}.`);
  }

  async function handleResetCurrentBudget() {
    const hosted = await isHostedSqliteBudget(accountRegisterQueries, activeBudget?.id);
    const confirmed = await confirmDialog({
      title: "Reset current budget?",
      message:
        "This will permanently remove accounts, transactions, payees, scheduled transactions, attachments, and custom categories from the currently selected budget. Budget settings are preserved and starter categories will be recreated. Create a backup first if you need a recovery point.",
      confirmLabel: "Reset budget",
      tone: "danger",
    });

    if (!confirmed) {
      setDataStatusMessage("Reset cancelled. No data has been changed.");
      return;
    }

    if (hosted && activeBudget?.id && accountRegisterQueries) {
      try {
        await accountRegisterQueries.resetBudget(activeBudget.id, getCurrentBudgetMonth());
        resetCurrentBudget(getActiveKeyValueStorage());
        setRestorePreview(null);
        setRestorePackageRaw(null);
        setHostedRestoreFile(null);
        setDataStatusMessage(
          `Reset complete for ${activeBudget.name}. The previous SQLite generation was removed.`,
        );
      } catch (error) {
        setDataStatusMessage(error instanceof Error ? error.message : "Hosted SQLite reset failed.");
      }
      return;
    }

    createVersionHistorySnapshotBeforeBudgetReset(getActiveKeyValueStorage());
    const result = resetCurrentBudget(getActiveKeyValueStorage());
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

  async function handleDeleteCurrentBudget() {
    const hosted = await isHostedSqliteBudget(accountRegisterQueries, activeBudget?.id);
    const confirmed = await confirmDialog({
      title: "Delete current budget?",
      message:
        "This will permanently delete the currently selected budget and all data associated with it. Other budgets and global app preferences are preserved. Create a backup first if you need a recovery point. This action cannot be undone.",
      confirmLabel: "Delete budget",
      tone: "danger",
    });

    if (!confirmed) {
      setDataStatusMessage("Delete cancelled. No data has been changed.");
      return;
    }

    if (hosted && activeBudget?.id && accountRegisterQueries) {
      try {
        await accountRegisterQueries.deleteBudget(activeBudget.id);
      } catch (error) {
        setDataStatusMessage(error instanceof Error ? error.message : "Hosted SQLite deletion failed.");
        return;
      }
      const result = deleteCurrentBudget(getActiveKeyValueStorage());
      refreshBudgets();
      clearSelectedBudget();
      if (!result.completed) {
        setDataStatusMessage(result.errors[0] ?? "Hosted data was deleted, but the local budget entry could not be removed.");
        return;
      }
      setDataStatusMessage(`Deleted ${result.budgetName} and its hosted SQLite generation.`);
      navigate("/");
      return;
    }

    if (activeBudget?.id) {
      createVersionHistorySnapshotBeforeBudgetDelete(getActiveKeyValueStorage(), activeBudget.id);
    }

    const result = deleteCurrentBudget(getActiveKeyValueStorage());
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
                  <option value="blueprint">Blueprint</option>
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
                  <small>Show application performance diagnostics and large-data counters while profiling.</small>
                </span>
              </label>
              {settings.general.developerPerformanceMode ? (
                <div className="settings-field settings-field-wide">
                  <span>Importer diagnostics</span>
                  <small>Inspect persisted completed and failed import traces.</small>
                  <Button type="button" variant="secondary" onClick={() => navigate("/developer/import-diagnostics")}>Open importer diagnostics</Button>
                </div>
              ) : null}
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
            {dataView === "overview" ? (
              <>
                <div className="settings-section-header">
                  <div>
                    <p className="eyebrow">Data</p>
                    <h2>Data protection and portability</h2>
                    <p className="muted">{dataStatusMessage}</p>
                  </div>
                </div>

                <div className="settings-action-grid">
                  <button
                    type="button"
                    className="settings-action-card settings-action-button-card"
                    onClick={() => setDataView("budget-history")}
                  >
                    <h3>Restore Points</h3>
                    <p className="muted">Review and restore one of the rolling restore points for the active budget.</p>
                    <strong>{historySnapshots.length} of 30 restore points</strong>
                  </button>
                  <div className="settings-action-card">
                    <h3>External Backups</h3>
                    <p className="muted">Create portable files for migration, archiving, or disaster recovery.</p>
                    <div className="settings-action-row">
                      <Button type="button" variant="secondary" disabled={portablePackageBusy} onClick={() => void downloadPortablePackage()}>
                        {portablePackageBusy ? "Preparing..." : "Budget package"}
                      </Button>
                      <label className="button button-secondary settings-file-button">
                        Preview package restore
                        <input
                          type="file"
                          accept="application/json,.json,.budget-package.json"
                          onChange={(event) => previewPortablePackageFile(event.target.files?.[0] ?? null)}
                        />
                      </label>
                      <Button type="button" variant="secondary" onClick={() => void downloadBudgetData("backup")}>
                        Backup budget
                      </Button>
                      <label className="button button-secondary settings-file-button">
                        Select backup to restore
                        <input
                          type="file"
                          accept="application/x-ndjson,.budget-ndjson,application/json,.json"
                          onChange={(event) => previewRestoreFile(event.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="settings-action-card">
                    <h3>Export Budget</h3>
                    <p className="muted">Download a portable JSON export for the currently selected budget.</p>
                    <Button type="button" variant="secondary" onClick={() => void downloadBudgetData("export")}>
                      Export budget
                    </Button>
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

                {portablePackagePreview ? (
                  <div className={`settings-restore-preview${portablePackagePreview.valid ? " valid" : " invalid"}`}>
                    <div>
                      <p className="eyebrow">Portable package preview</p>
                      <h3>{portablePackagePreview.valid ? "Package integrity verified" : "Package needs attention"}</h3>
                      <p className="muted">
                        {portablePackagePreview.budgetName ?? "Unknown budget"}
                        {portablePackagePreview.createdAt ? ` · Created ${portablePackagePreview.createdAt.slice(0, 10)}` : ""}
                        {` · ${portablePackagePreview.attachmentCount} attachments (${formatFileSize(portablePackagePreview.attachmentBytes)})`}
                      </p>
                    </div>
                    {[...portablePackagePreview.errors, ...portablePackagePreview.warnings].length ? (
                      <ul className="settings-restore-messages">
                        {[...portablePackagePreview.errors, ...portablePackagePreview.warnings].map((message) => <li key={message}>{message}</li>)}
                      </ul>
                    ) : null}
                    {portablePackagePreview.valid ? (
                      <div className="settings-restore-actions">
                        <Button type="button" variant="secondary" disabled={portablePackageBusy} onClick={() => void commitPortablePackageRestore()}>
                          Restore budget package
                        </Button>
                        <p className="muted">The package is checked with SHA-256 before any records or attachments are restored.</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

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

                {hostedRestoreFile ? (
                  <div className="settings-restore-preview valid">
                    <div>
                      <p className="eyebrow">Hosted SQLite restore</p>
                      <h3>Backup ready for server validation</h3>
                      <p className="muted">
                        {hostedRestoreFile.name} · {formatFileSize(hostedRestoreFile.size)}
                      </p>
                    </div>
                    <div className="settings-restore-actions">
                      <Button type="button" variant="secondary" onClick={commitRestorePreview}>
                        Stream and restore budget
                      </Button>
                      <p className="muted">
                        The current generation remains active unless the complete backup passes its
                        schema, count, relationship, and SHA-256 integrity checks.
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="settings-section-header">
                  <div>
                    <p className="eyebrow">Data protection</p>
                    <h2>Restore Points</h2>
                    <p className="muted">
                      Budget App automatically keeps the last 30 restore points for {activeBudget?.name ?? "the active budget"}.
                      Choose a point in time and restore when you need to recover your budget. Version History is separate from
                      Undo/Redo and exported backup packages.
                    </p>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => setDataView("overview")}>
                    Back to Data
                  </Button>
                </div>


                <div className="settings-history-layout">
                  <div className="settings-history-list" aria-label="Budget history restore points">
                    {snapshotGroups.length ? (
                      snapshotGroups.map((group) => (
                        <section key={group.label} className="settings-history-group">
                          <h3>{group.label}</h3>
                          <div className="settings-history-rows">
                            {group.snapshots.map((snapshot, snapshotIndex) => (
                              <button
                                key={snapshot.id}
                                type="button"
                                className={`settings-history-row${selectedSnapshot?.id === snapshot.id ? " selected" : ""}`}
                                onClick={() => setSelectedSnapshotId(snapshot.id)}
                              >
                                <span className="settings-history-dot" aria-hidden="true" />
                                <span>
                                  <strong>{formatHistoryTime(snapshot.createdAt)}</strong>
                                  {snapshot.description ? <small>{snapshot.description}</small> : null}
                                </span>
                                {snapshotIndex === 0 && group.label === "Today" ? (
                                  <em>Current</em>
                                ) : null}
                                <span aria-hidden="true">›</span>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))
                    ) : (
                      <div className="settings-history-empty">
                        <h3>No restore points yet</h3>
                        <p className="muted">Budget App will create restore points at meaningful moments such as budget switches and imports.</p>
                      </div>
                    )}
                  </div>

                  <aside className="settings-history-detail" aria-label="Selected restore point details">
                    {selectedSnapshot ? (
                      <>
                        <div>
                          <p className="eyebrow">Restore point</p>
                          <h3>{getHistoryGroupLabel(selectedSnapshot.createdAt)}</h3>
                          <strong>{formatHistoryTime(selectedSnapshot.createdAt)}</strong>
                          {selectedSnapshot.description ? <p>{selectedSnapshot.description}</p> : null}
                        </div>

                        <dl>
                          <div>
                            <dt>Budget</dt>
                            <dd>{selectedSnapshot.budgetName}</dd>
                          </div>
                          <div>
                            <dt>Created</dt>
                            <dd>{formatHistoryDateTime(selectedSnapshot.createdAt)}</dd>
                          </div>
                          <div>
                            <dt>Description</dt>
                            <dd>{describeSnapshot(selectedSnapshot)}</dd>
                          </div>
                          <div>
                            <dt>Origin</dt>
                            <dd>{formatSnapshotOrigin(selectedSnapshot)}</dd>
                          </div>
                          <div>
                            <dt>Reason</dt>
                            <dd>{formatSnapshotReason(selectedSnapshot)}</dd>
                          </div>
                          <div>
                            <dt>Changed areas</dt>
                            <dd>{formatSnapshotChangedAreas(selectedSnapshot)}</dd>
                          </div>
                          <div>
                            <dt>Approximate changes</dt>
                            <dd>{selectedSnapshot.approximateChanges}</dd>
                          </div>
                        </dl>

                        <p className="settings-history-warning">
                          Restoring replaces your current budget with the selected version. Budget App creates safety restore points automatically before major changes.
                        </p>

                        <div className="settings-history-actions settings-history-actions--restore-only">
                          <Button type="button" variant="primary" onClick={restoreSelectedSnapshot}>
                            Restore
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="settings-history-empty">
                        <h3>Select a restore point</h3>
                        <p className="muted">Choose a point in time to see restore options.</p>
                      </div>
                    )}
                  </aside>
                </div>

                <p className="settings-history-summary">
                  Showing {historySnapshots.length} of 30 restore points. Older entries are thinned by time bucket automatically.
                </p>
              </>
            )}
          </Card>
        ) : null}

        {activeSection === "cloud" ? (
          <Card className="settings-section-card">
            <div className="settings-section-header">
              <div>
                <p className="eyebrow">Local-first synchronisation</p>
                <h2>Replication server</h2>
                <p className="muted">
                  This device writes to its local database first. Background replication
                  exchanges operations, checkpoints, and attachment blobs with the server.
                </p>
              </div>
            </div>

            <div className="settings-action-grid">
              <div className="settings-action-card">
                <h3>Current persistence</h3>
                <p className="muted">{persistenceMode.description}</p>
                <strong>{persistenceMode.label}</strong>
              </div>

              <div className="settings-action-card">
                <h3>Replication state</h3>
                <p className="muted">
                  {replicationStatus.supported
                    ? `${replicationStatus.status.replaceAll("-", " ")} · ${replicationStatus.pendingOperationCount} pending operations`
                    : "Replication is unavailable for the selected rollback provider."}
                </p>
                <strong>{replicationStatus.generationId ?? "No generation connected"}</strong>
              </div>

              <div className="settings-action-card">
                <h3>Offline operation</h3>
                <p className="muted">
                  Reads and writes continue against the local database while the server is
                  unavailable. Changes replicate automatically after connectivity returns.
                </p>
              </div>
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
              <div className="settings-sync-status-card">
                <span>Synchronisation</span>
                <strong>{formatReplicationStatus(replicationStatus.status)}</strong>
                <p className="settings-sync-scope-warning">
                  Local SQLite baseline and mutation relay status for the active budget.
                </p>
                <p className="muted">
                  {replicationStatus.lastSuccessfulSyncAt
                    ? `Last synced ${new Date(replicationStatus.lastSuccessfulSyncAt).toLocaleString()}`
                    : replicationStatus.supported
                      ? "Waiting for the first successful sync."
                      : "Not available for this persistence provider."}
                </p>
                {replicationStatus.lastError ? (
                  <p className="muted">{replicationStatus.lastError}</p>
                ) : null}
                {replicationStatus.supported ? (
                  <p className="muted">
                    Server: {formatServerOperationalStatus(replicationStatus.serverStatus)}
                    {replicationStatus.serverLatencyMs !== null ? ` · ${replicationStatus.serverLatencyMs} ms` : ""}
                    {replicationStatus.serverProtocolVersion !== null ? ` · protocol ${replicationStatus.serverProtocolVersion}` : ""}
                    {replicationStatus.serverHealthCheckedAt ? ` · checked ${new Date(replicationStatus.serverHealthCheckedAt).toLocaleTimeString()}` : ""}
                  </p>
                ) : null}
                {replicationStatus.serverHealthError ? (
                  <p className="muted">{replicationStatus.serverHealthError}</p>
                ) : null}
                {replicationStatus.lastSuccessfulSyncAt ? (
                  <p className="muted">
                    Last run: {replicationStatus.pushedOperationCount} operations uploaded, {" "}
                    {replicationStatus.pulledOperationCount} operations downloaded, {" "}
                    {replicationStatus.uploadedBlobCount} attachments uploaded, {" "}
                    {replicationStatus.downloadedBlobCount} attachments downloaded.
                  </p>
                ) : null}
                {replicationStatus.supported ? (
                  <p className="muted">
                    {replicationStatus.pendingOperationCount} pending · {replicationStatus.retainedJournalEntryCount} retained journal entries · {replicationStatus.checkpointCount} checkpoints · {replicationStatus.unresolvedConflictCount} conflicts
                    {replicationStatus.prunedJournalEntryCount > 0 ? ` · ${replicationStatus.prunedJournalEntryCount} entries pruned last checkpoint` : ""}
                  </p>
                ) : null}
                {replicationConflicts.length > 0 ? (
                  <div className="settings-conflict-list">
                    <p className="muted">
                      Concurrent changes were detected on another device. Server order was applied so every device converges; choose Keep mine to reapply this device's value.
                    </p>
                    {replicationConflicts.slice(0, 10).map((conflict) => (
                      <div key={conflict.conflictId} className="settings-conflict-item">
                        <div>
                          <strong>{formatConflictKey(conflict.key)}</strong>
                          <p className="muted">
                            Local change from this device conflicted with device {conflict.remoteDeviceId.slice(0, 8)} at remote cursor {conflict.remoteCursor}.
                          </p>
                        </div>
                        <div className="settings-inline-actions">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={replicationBusy}
                            onClick={() => {
                              const backgroundService = getReplicationBackgroundService();
                              if (!backgroundService) return;
                              setReplicationBusy(true);
                              void backgroundService.resolveConflict(conflict.conflictId, "accept-remote")
                                .then(() => setReplicationConflicts((items) => items.filter((item) => item.conflictId !== conflict.conflictId)))
                                .finally(() => setReplicationBusy(false));
                            }}
                          >
                            Accept remote
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={replicationBusy}
                            onClick={() => {
                              const backgroundService = getReplicationBackgroundService();
                              if (!backgroundService) return;
                              setReplicationBusy(true);
                              void backgroundService.resolveConflict(conflict.conflictId, "keep-local")
                                .then(() => setReplicationConflicts((items) => items.filter((item) => item.conflictId !== conflict.conflictId)))
                                .finally(() => setReplicationBusy(false));
                            }}
                          >
                            Keep mine
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="settings-inline-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!replicationStatus.supported || replicationBusy}
                    onClick={() => {
                      const backgroundService = getReplicationBackgroundService();
                      if (!backgroundService) return;
                      setReplicationBusy(true);
                      void backgroundService.syncNow().finally(() => setReplicationBusy(false));
                    }}
                  >
                    {replicationBusy ? "Synchronising..." : "Sync now"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!replicationStatus.supported || replicationBusy || replicationStatus.serverStatus === "checking"}
                    onClick={() => {
                      const backgroundService = getReplicationBackgroundService();
                      if (!backgroundService) return;
                      void backgroundService.checkServerHealth();
                    }}
                  >
                    {replicationStatus.serverStatus === "checking" ? "Checking server..." : "Check server"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!replicationStatus.supported || replicationBusy}
                    onClick={() => {
                      const backgroundService = getReplicationBackgroundService();
                      if (!backgroundService) return;
                      setReplicationBusy(true);
                      void backgroundService
                        .syncNow({ uploadCheckpoint: true })
                        .finally(() => setReplicationBusy(false));
                    }}
                  >
                    Create checkpoint
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      !replicationStatus.supported ||
                      replicationBusy ||
                      replicationStatus.checkpointCount > 0
                    }
                    onClick={() => {
                      const backgroundService = getReplicationBackgroundService();
                      if (!backgroundService) return;
                      void confirmDialog({
                        title: "Refresh the synchronisation baseline?",
                        message: "This creates a verified baseline from the complete local SQLite budget. Mutations included in that baseline can then be safely compacted, while devices that are too far behind will rebuild automatically.",
                        confirmLabel: "Refresh baseline",
                      }).then((confirmed) => {
                        if (!confirmed) return;
                        setReplicationBusy(true);
                        void backgroundService.publishLocalBaseline().finally(() => {
                          setReplicationBusy(false);
                        });
                      });
                    }}
                  >
                    Refresh sync baseline
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!replicationStatus.supported || replicationBusy}
                    onClick={() => {
                      const backgroundService = getReplicationBackgroundService();
                      if (!backgroundService) return;
                      void backgroundService.getDiagnostics().then((diagnostics) => {
                        if (!diagnostics) return;
                        const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), replication: diagnostics, status: replicationStatus }, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const anchor = document.createElement("a");
                        anchor.href = url;
                        anchor.download = `budget-app-replication-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
                        anchor.click();
                        URL.revokeObjectURL(url);
                      });
                    }}
                  >
                    Export diagnostics
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!replicationStatus.supported || replicationBusy}
                    onClick={() => {
                      const backgroundService = getReplicationBackgroundService();
                      if (!backgroundService) return;
                      void confirmDialog({
                        title: "Rebuild this device from server?",
                        message: "This replaces this device's canonical budget state with the latest remote checkpoint, then replays later operations. Local unsynchronised changes may be lost.",
                        confirmLabel: "Rebuild device",
                        tone: "danger",
                      }).then((confirmed) => {
                        if (!confirmed) return;
                        setReplicationBusy(true);
                        void backgroundService.recoverFromServer().finally(() => {
                          setReplicationBusy(false);
                          window.location.reload();
                        });
                      });
                    }}
                  >
                    Rebuild from server
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}
        </main>
      </section>
    </div>
  );
}


export function RestorePointsPage() {
  return <SettingsPage initialSection="data" initialDataView="budget-history" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatConflictKey(key: string): string {
  const parts = key.split(".");
  return parts.at(-1) || key;
}

function formatServerOperationalStatus(status: string): string {
  switch (status) {
    case "ready": return "Ready";
    case "checking": return "Checking";
    case "unavailable": return "Unavailable";
    default: return "Not checked";
  }
}

function formatReplicationStatus(status: string): string {
  switch (status) {
    case "up-to-date": return "Up to date";
    case "conflict": return "Conflict detected";
    case "synchronising": return "Synchronising";
    case "connecting": return "Connecting";
    case "retrying": return "Retrying";
    case "offline": return "Offline";
    case "error": return "Error";
    default: return "Disabled";
  }
}
