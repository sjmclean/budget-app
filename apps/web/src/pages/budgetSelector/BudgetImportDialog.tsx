import { useRef, useState } from "react";
import { BudgetImportProviderApplicationService } from "../../../../../packages/application/src/BudgetImportProviderApplicationService";
import type { FullBudgetImportPreview } from "../../../../../packages/types/src/index";
import {
  createYnab4PackageMigrationPreview,
  discoverYnab4Package,
  type Ynab4PackageDiscoveryResult,
  type Ynab4PackageEntry,
  type Ynab4PackageMigrationPreview,
} from "../../../../../packages/ynab4-importer/src/analyzeYnab4Package";
import type {
  CreateActualBudgetLauncherImportInput,
  ActualBudgetLauncherImportResult,
} from "../../features/budget/actualBudgetLauncherImport";
import type {
  CreateYnab4LauncherBudgetImportInput,
  Ynab4LauncherImportResult,
} from "../../features/budget/ynab4LauncherImport";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  BudgetImportProgressIndicator,
  type BudgetImportProgressPhase,
} from "./BudgetImportProgress";

const ynab4DirectoryInputProps = {
  webkitdirectory: "",
  directory: "",
} as Record<string, string>;

function attachDirectoryPickerAttributes(input: HTMLInputElement | null) {
  if (!input) return;

  input.setAttribute("webkitdirectory", "");
  input.setAttribute("directory", "");
}

const actualBudgetImportProviderService = new BudgetImportProviderApplicationService();

interface BrowserFileSystemEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  readonly fullPath?: string;
}

interface BrowserFileSystemFileEntry extends BrowserFileSystemEntry {
  readonly isFile: true;
  file(successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void): void;
}

interface BrowserFileSystemDirectoryEntry extends BrowserFileSystemEntry {
  readonly isDirectory: true;
  createReader(): {
    readEntries(
      successCallback: (entries: BrowserFileSystemEntry[]) => void,
      errorCallback?: (error: DOMException) => void,
    ): void;
  };
}

interface BrowserDataTransferItem {
  webkitGetAsEntry?: () => BrowserFileSystemEntry | null;
}

interface BrowserFileSystemFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
}

interface BrowserFileSystemDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterable<BrowserFileSystemFileHandle | BrowserFileSystemDirectoryHandle>;
}

interface WindowWithDirectoryPicker extends Window {
  showDirectoryPicker?: () => Promise<BrowserFileSystemDirectoryHandle>;
}

interface BudgetImportResultSummary {
  providerLabel: string;
  budgetId: string;
  budgetName: string;
  counts: Array<{ label: string; count: number }>;
  skipped: Array<{ label: string; count: number; reason?: string }>;
  warnings: string[];
}

interface BudgetImportDialogProps {
  importActualBudget: (input: CreateActualBudgetLauncherImportInput) => Promise<ActualBudgetLauncherImportResult>;
  importYnab4Budget: (input: CreateYnab4LauncherBudgetImportInput) => Promise<Ynab4LauncherImportResult>;
  onBack: () => void;
  onImportedBudgetSelected: (budgetId: string) => void;
  onOpenBudget: (budgetId: string) => void;
}

export function BudgetImportDialog({
  importActualBudget,
  importYnab4Budget,
  onBack,
  onImportedBudgetSelected,
  onOpenBudget,
}: BudgetImportDialogProps) {
  const [actualStatus, setActualStatus] = useState<string>(
    "Choose a supported budget file or YNAB4 package folder to import a full budget.",
  );
  const [actualError, setActualError] = useState<string | null>(null);
  const [ynabError, setYnabError] = useState<string | null>(null);
  const [isAnalysingActual, setIsAnalysingActual] = useState(false);
  const [isImportingActual, setIsImportingActual] = useState(false);
  const [budgetImportProgressPhase, setBudgetImportProgressPhase] =
    useState<BudgetImportProgressPhase>("idle");
  const [budgetImportResult, setBudgetImportResult] =
    useState<BudgetImportResultSummary | null>(null);
  const [isBudgetImportDragActive, setIsBudgetImportDragActive] = useState(false);
  const budgetFileInputRef = useRef<HTMLInputElement | null>(null);
  const ynab4FolderInputRef = useRef<HTMLInputElement | null>(null);

  async function importYnab4PackagePreview(input: {
    discovery: Ynab4PackageDiscoveryResult;
    preview: Ynab4PackageMigrationPreview;
    entries: Ynab4PackageEntry[];
  }) {
    setBudgetImportProgressPhase("importing-accounts");

    try {
      setBudgetImportProgressPhase("importing-transactions");
      const result = await importYnab4Budget(input);
      setBudgetImportProgressPhase("finalising");
      onImportedBudgetSelected(result.budget.id);
      setBudgetImportProgressPhase("complete");
      setBudgetImportResult({
        providerLabel: "YNAB4",
        budgetId: result.budget.id,
        budgetName: result.budget.name,
        counts: [
          { label: "Accounts", count: result.record.counts.accounts },
          { label: "Categories", count: result.record.counts.categories },
          { label: "Payees", count: result.record.counts.payees },
          { label: "Transactions", count: result.record.counts.transactions },
          { label: "Scheduled transactions", count: result.record.counts.scheduledTransactions },
        ],
        skipped: [],
        warnings: result.record.warnings,
      });
    } catch (error) {
      setYnabError(
        error instanceof Error
          ? error.message
          : "Unable to create the imported YNAB4 budget.",
      );
      setBudgetImportProgressPhase("failed");
    }
  }

  async function importDetectedActualBudget(preview: FullBudgetImportPreview, sourceFileName: string | null) {
    if (!preview.canCommit) {
      setActualError("The detected budget cannot be imported yet. Review the warning details and try a supported export.");
      setBudgetImportProgressPhase("failed");
      return;
    }

    setIsImportingActual(true);
    setBudgetImportProgressPhase("importing-accounts");
    setActualStatus(`Importing ${preview.providerLabel}…`);

    try {
      setBudgetImportProgressPhase("importing-categories");
      setBudgetImportProgressPhase("importing-payees");
      setBudgetImportProgressPhase("importing-transactions");
      const result = await importActualBudget({
        preview,
        sourceFileName,
      });
      setBudgetImportProgressPhase("finalising");
      onImportedBudgetSelected(result.budget.id);
      setBudgetImportProgressPhase("complete");
      setBudgetImportResult({
        providerLabel: preview.providerLabel,
        budgetId: result.budget.id,
        budgetName: result.budget.name,
        counts: [
          { label: "Accounts", count: result.record.counts.accounts },
          { label: "Category groups", count: result.record.counts.categoryGroups },
          { label: "Categories", count: result.record.counts.categories },
          { label: "Payees", count: result.record.counts.payees },
          { label: "Transactions", count: result.record.counts.transactions },
          { label: "Transfers", count: result.record.counts.transfers },
        ],
        skipped: result.record.skipped,
        warnings: result.record.warnings,
      });
      setActualStatus(`Imported ${result.budget.name}.`);
    } catch (error) {
      setActualError(
        error instanceof Error
          ? error.message
          : "Unable to create the imported budget.",
      );
      setBudgetImportProgressPhase("failed");
      setActualStatus("Budget import failed.");
    } finally {
      setIsImportingActual(false);
    }
  }

  function resetBudgetImportState() {
    setIsBudgetImportDragActive(false);
    setActualError(null);
    setYnabError(null);
    setBudgetImportResult(null);
  }

  async function handleActualBudgetFileSelection(file: File | null) {
    if (!file) {
      setActualStatus("Drop a supported budget file here, or browse to choose one.");
      return;
    }

    setIsAnalysingActual(true);
    setBudgetImportProgressPhase("reading");
    setActualStatus("Reading budget file…");

    try {
      const binary = new Uint8Array(await file.arrayBuffer());
      const text = file.name.toLowerCase().endsWith(".json")
        ? await file.text()
        : "";
      setBudgetImportProgressPhase("detecting");
      const preview = await actualBudgetImportProviderService.fullBudgetPreviewAsync({
        fileName: file.name,
        text,
        binary,
      });

      if (!preview) {
        setActualError(
          "This does not look like a supported budget import. Try an Actual Budget ZIP, Budget Backup JSON, or YNAB4 package.",
        );
        setBudgetImportProgressPhase("failed");
        setActualStatus("Budget import failed before import started.");
        return;
      }

      setBudgetImportProgressPhase("inspecting");
      setBudgetImportProgressPhase("preparing");
      setActualStatus(`${preview.providerLabel} detected. Importing into a new local budget…`);
      await importDetectedActualBudget(preview, file.name);
    } catch (error) {
      setActualError(
        error instanceof Error
          ? error.message
          : "Unable to analyse the selected budget import file.",
      );
      setActualStatus("Budget import failed before import started.");
      setBudgetImportProgressPhase("failed");
    } finally {
      setIsAnalysingActual(false);
    }
  }

  async function importSelectedBudgetFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0) {
      setActualStatus("Drop a supported budget file here, or browse to choose one.");
      return;
    }

    if (selectedFilesLookLikeYnab4Package(selectedFiles)) {
      await handleYnab4PackageSelection(selectedFiles);
      return;
    }

    await handleActualBudgetFileSelection(selectedFiles[0] ?? null);
  }

  async function handleBudgetImportSelection(files: FileList | null) {
    resetBudgetImportState();
    await importSelectedBudgetFiles(files ? Array.from(files) : []);
  }

  async function handleBudgetImportDrop(dataTransfer: DataTransfer) {
    resetBudgetImportState();

    try {
      const droppedDirectoryEntries = await readYnab4PackageEntriesFromDataTransfer(dataTransfer);
      if (droppedDirectoryEntries.length > 0) {
        await handleYnab4PackageEntries(droppedDirectoryEntries);
        return;
      }
    } catch (error) {
      setYnabError(
        error instanceof Error
          ? error.message
          : "Unable to read the dropped YNAB4 folder.",
      );
      setBudgetImportProgressPhase("failed");
      return;
    }

    await importSelectedBudgetFiles(Array.from(dataTransfer.files ?? []));
  }

  async function handleYnab4PackageSelection(files: FileList | File[] | null) {
    setYnabError(null);
    setActualError(null);
    setBudgetImportResult(null);

    const selectedFiles = files ? Array.from(files) : [];
    if (selectedFiles.length === 0) {
      return;
    }

    try {
      const entries = await readYnab4PackageEntries(selectedFiles);
      await handleYnab4PackageEntries(entries);
    } catch (error) {
      setYnabError(
        error instanceof Error
          ? error.message
          : "Unable to analyse the selected YNAB4 package.",
      );
      setBudgetImportProgressPhase("failed");
    }
  }

  async function handleYnab4PackageEntries(entries: Ynab4PackageEntry[]) {
    setYnabError(null);
    setActualError(null);
    setBudgetImportResult(null);
    setBudgetImportProgressPhase("reading");

    try {
      setBudgetImportProgressPhase("detecting");
      const discovery = discoverYnab4Package(entries);
      setBudgetImportProgressPhase("inspecting");
      const preview = createYnab4PackageMigrationPreview(
        discovery,
        "new-budget",
      );
      setBudgetImportProgressPhase(discovery.isYnab4Package ? "preparing" : "failed");

      if (!discovery.isYnab4Package) {
        setYnabError("The selected folder was not recognised as a YNAB4 package.");
        return;
      }

      if (!preview.canContinue) {
        setYnabError("The selected YNAB4 package has warnings that prevent import.");
        setBudgetImportProgressPhase("failed");
        return;
      }

      await importYnab4PackagePreview({ discovery, preview, entries });
    } catch (error) {
      setYnabError(
        error instanceof Error
          ? error.message
          : "Unable to analyse the selected YNAB4 package.",
      );
      setBudgetImportProgressPhase("failed");
    }
  }

  async function handleManualYnab4FolderBrowse() {
    setActualError(null);
    setYnabError(null);
    setBudgetImportResult(null);

    const directoryPicker = (window as WindowWithDirectoryPicker).showDirectoryPicker;

    if (directoryPicker) {
      try {
        const directory = await directoryPicker.call(window);
        const files = await readFilesFromDirectoryHandle(directory);
        await handleYnab4PackageSelection(files);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;

        setYnabError(
          error instanceof Error
            ? error.message
            : "Unable to read the selected YNAB4 folder.",
        );
        setBudgetImportProgressPhase("failed");
        return;
      }
    }

    ynab4FolderInputRef.current?.click();
  }

  return (
    <Card className="budget-launch-picker budget-create-card-glass budget-import-compact-card">
      <div className="budget-launch-nav">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
      </div>

      {budgetImportResult ? (
        <div className="budget-import-complete-report" aria-label="Budget import completion report">
          <div className="budget-import-complete-icon" aria-hidden="true">
            ✓
          </div>
          <div>
            <p className="eyebrow">Import complete</p>
            <h2>{budgetImportResult.budgetName}</h2>
            <p>{budgetImportResult.providerLabel} was imported into a new local budget.</p>
          </div>
          <div className="ynab4-summary-metrics">
            {budgetImportResult.counts.map((item) => (
              <div key={item.label} className="ynab4-summary-metric">
                <strong>{item.count.toLocaleString()}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          {budgetImportResult.skipped.length > 0 ? (
            <ul className="ynab4-warning-list">
              {budgetImportResult.skipped.map((item) => (
                <li key={item.label}>
                  {item.label}: {item.count.toLocaleString()} skipped{item.reason ? ` — ${item.reason}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {budgetImportResult.warnings.length > 0 ? (
            <ul className="ynab4-warning-list">
              {budgetImportResult.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
          <Button type="button" onClick={() => onOpenBudget(budgetImportResult.budgetId)}>
            Open imported budget
          </Button>
        </div>
      ) : budgetImportProgressPhase !== "idle" && budgetImportProgressPhase !== "failed" ? (
        <div className="budget-import-progress-state">
          <div className="budget-launch-choice-header">
            <p className="eyebrow">Import Budget</p>
            <h2>{isImportingActual || isAnalysingActual ? "Importing budget…" : "Preparing import…"}</h2>
            <p>{actualStatus}</p>
          </div>
          <BudgetImportProgressIndicator phase={budgetImportProgressPhase} />
        </div>
      ) : (
        <>
          <div className="budget-launch-choice-header budget-import-compact-header">
            <p className="eyebrow">Full-budget migration</p>
            <h2>Import Budget</h2>
            <p>Drop or choose a budget export. The app will detect the provider and create a new local budget with a completion report.</p>
          </div>

          <div
            className={
              isBudgetImportDragActive
                ? "budget-import-drop-zone budget-import-drop-zone-active"
                : "budget-import-drop-zone"
            }
            onDragOver={(event) => {
              event.preventDefault();
              setIsBudgetImportDragActive(true);
            }}
            onDragLeave={() => setIsBudgetImportDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              void handleBudgetImportDrop(event.dataTransfer);
            }}
          >
            <span className="budget-import-drop-icon" aria-hidden="true">
              ⇧
            </span>
            <span>
              <strong>Drop your budget here or click to browse</strong>
              <small>Actual Budget (.zip), Budget Backup (.json), or YNAB4 folder/package. YNAB Online Planned.</small>
              <small>Transaction import remains separate.</small>
            </span>
            <div className="budget-import-picker-actions">
              <button
                type="button"
                className="ynab4-file-button"
                onClick={() => budgetFileInputRef.current?.click()}
              >
                Choose file
              </button>
              <button
                type="button"
                className="ynab4-file-button"
                onClick={() => void handleManualYnab4FolderBrowse()}
              >
                Choose YNAB4 folder/package
              </button>
            </div>
          </div>
          <input
            ref={budgetFileInputRef}
            className="budget-import-picker-input"
            type="file"
            accept=".zip,.actual,.actualbudget,.json,application/zip,application/x-zip-compressed,application/json"
            onChange={(event) => {
              void handleBudgetImportSelection(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={(input) => {
              ynab4FolderInputRef.current = input;
              attachDirectoryPickerAttributes(input);
            }}
            className="budget-import-picker-input"
            type="file"
            multiple
            {...ynab4DirectoryInputProps}
            onChange={(event) => {
              void handleYnab4PackageSelection(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </>
      )}

      {actualError || ynabError ? (
        <p className="ynab4-status ynab4-status-error">{actualError ?? ynabError}</p>
      ) : null}
    </Card>
  );
}

async function readFilesFromDirectoryHandle(
  directory: BrowserFileSystemDirectoryHandle,
  parentPath = "",
): Promise<File[]> {
  const files: File[] = [];
  const directoryPath = `${parentPath}${directory.name}/`;

  for await (const handle of directory.values()) {
    if (handle.kind === "file") {
      const file = await handle.getFile();
      Object.defineProperty(file, "webkitRelativePath", {
        value: `${directoryPath}${handle.name}`,
        configurable: true,
      });
      files.push(file);
      continue;
    }

    files.push(...await readFilesFromDirectoryHandle(handle, directoryPath));
  }

  return files;
}

async function readYnab4PackageEntries(
  files: File[],
): Promise<Ynab4PackageEntry[]> {
  return readYnab4PackageEntriesFromFiles(files);
}

function selectedFilesLookLikeYnab4Package(files: File[]): boolean {
  return files.length > 1 || files.some((file) => {
    const relativePath = file.webkitRelativePath || "";
    return isYnab4BudgetFile(file) || Boolean(relativePath) || /\.ynab4(?:\/|$)/i.test(relativePath);
  });
}

async function readYnab4PackageEntriesFromFiles(
  files: File[],
): Promise<Ynab4PackageEntry[]> {
  const readableFiles = files.filter(isYnab4BudgetFile);

  if (readableFiles.length === 0) {
    throw new Error(
      "No Budget.ymeta, Budget.yfull, or Budget.json files were found in the selected folder.",
    );
  }

  return Promise.all(
    readableFiles.map(async (file) => ({
      path: file.webkitRelativePath || file.name,
      text: await file.text(),
    })),
  );
}

async function readYnab4PackageEntriesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<Ynab4PackageEntry[]> {
  const transferItems = Array.from(dataTransfer.items ?? []) as BrowserDataTransferItem[];
  const rootEntries = transferItems
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is BrowserFileSystemEntry => Boolean(entry));

  if (rootEntries.length === 0 || !rootEntries.some((entry) => entry.isDirectory)) {
    return [];
  }

  const files = await Promise.all(rootEntries.map((entry) => readFilesFromEntry(entry)));
  const readableFiles = files.flat().filter(({ file }) => isYnab4BudgetFile(file));

  if (readableFiles.length === 0) {
    throw new Error(
      "No Budget.ymeta, Budget.yfull, or Budget.json files were found in the dropped folder.",
    );
  }

  return Promise.all(
    readableFiles.map(async ({ file, path }) => ({
      path,
      text: await file.text(),
    })),
  );
}

async function readFilesFromEntry(
  entry: BrowserFileSystemEntry,
  parentPath = "",
): Promise<Array<{ file: File; path: string }>> {
  const entryPath = `${parentPath}${entry.name}`;

  if (entry.isFile) {
    const file = await readFileEntry(entry as BrowserFileSystemFileEntry);
    return [{ file, path: entryPath }];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const children = await readDirectoryEntries(entry as BrowserFileSystemDirectoryEntry);
  const childFiles = await Promise.all(
    children.map((child) => readFilesFromEntry(child, `${entryPath}/`)),
  );

  return childFiles.flat();
}

function readFileEntry(entry: BrowserFileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readDirectoryEntries(
  entry: BrowserFileSystemDirectoryEntry,
): Promise<BrowserFileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: BrowserFileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<BrowserFileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (batch.length === 0) break;
    entries.push(...batch);
  }

  return entries;
}

function isYnab4BudgetFile(file: File): boolean {
  return /(?:Budget\.ymeta|Budget\.yfull|Budget\.json)$/i.test(file.name);
}
