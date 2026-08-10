import {
  discoverYnab4PackageLocation,
  normaliseYnab4PackagePath,
  type Ynab4PackageLocation,
} from "./discoverPackage.js";
import { selectLatestCompleteDeviceGuid } from "./selectLatestDevice.js";

export type Ynab4PackageEntry = {
  path: string;
  /** Small metadata files may be materialised eagerly. Large budget files stay lazy. */
  text?: string;
  file?: Blob;
  lastModified?: number;
  parsedData?: Record<string, unknown>;
  selectedBudgetData?: boolean;
};

export type Ynab4BudgetDataFormat = "yfull" | "json";

export type Ynab4BudgetReadResult = Ynab4PackageLocation & {
  data: Record<string, unknown> | null;
  budgetDataPath: string | null;
  budgetDataFormat: Ynab4BudgetDataFormat | null;
};

export function readYnab4BudgetData(
  entries: Ynab4PackageEntry[],
  selectedBudgetDataPath?: string | null,
): Ynab4BudgetReadResult {
  const normalisedEntries = entries.map((entry) => {
    entry.path = normaliseYnab4PackagePath(entry.path);
    return entry;
  });

  if (selectedBudgetDataPath) {
    const selectedPath = normaliseYnab4PackagePath(selectedBudgetDataPath);
    const selected = normalisedEntries.find(
      (entry) => entry.path === selectedPath,
    );
    if (!selected) {
      return {
        ...discoverYnab4PackageLocation(normalisedEntries),
        data: null,
        budgetDataPath: selectedPath,
        budgetDataFormat: inferYnab4BudgetDataFormat(selectedPath),
        warnings: [`Selected YNAB4 budget data file was not found: ${selectedPath}.`],
      };
    }
    return parseBudgetEntry(
      selected,
      discoverYnab4PackageLocation(normalisedEntries),
    );
  }

  const location = discoverYnab4PackageLocation(normalisedEntries);
  if (!location.activeDataFolderPath) {
    return {
      ...location,
      data: null,
      budgetDataPath: null,
      budgetDataFormat: null,
    };
  }

  const budgetEntry = findActiveBudgetDataEntry(
    normalisedEntries,
    location.activeDataFolderPath,
  );
  if (!budgetEntry) {
    return {
      ...location,
      data: null,
      budgetDataPath: null,
      budgetDataFormat: null,
      warnings: [
        ...location.warnings,
        `No Budget.yfull or Budget.json file was found under ${location.activeDataFolderPath}.`,
      ],
    };
  }

  return parseBudgetEntry(budgetEntry, location);
}

export function findActiveBudgetDataEntry(
  entries: Ynab4PackageEntry[],
  activeDataFolderPath: string,
): Ynab4PackageEntry | undefined {
  const activePrefix = `${normaliseYnab4PackagePath(activeDataFolderPath)}/`;
  const activeEntries = entries.filter((entry) =>
    normaliseYnab4PackagePath(entry.path).startsWith(activePrefix),
  );
  const explicitlySelected = activeEntries.find((entry) => entry.selectedBudgetData);
  if (explicitlySelected) return explicitlySelected;

  const yfullEntries = activeEntries.filter((entry) =>
    normaliseYnab4PackagePath(entry.path).endsWith("/Budget.yfull"),
  );

  const latestDeviceGuid = selectLatestCompleteDeviceGuid(activeEntries);
  if (latestDeviceGuid) {
    const expectedPath = `${normaliseYnab4PackagePath(activeDataFolderPath)}/${latestDeviceGuid}/Budget.yfull`;
    const selected = yfullEntries.find(
      (entry) => normaliseYnab4PackagePath(entry.path) === expectedPath,
    );
    if (selected) return selected;
  }

  if (yfullEntries.length === 1) return yfullEntries[0];
  if (yfullEntries.length > 1) return undefined;

  const jsonEntries = activeEntries.filter((entry) =>
    normaliseYnab4PackagePath(entry.path).endsWith("/Budget.json"),
  );
  return jsonEntries.length === 1 ? jsonEntries[0] : undefined;
}

export function inferYnab4BudgetDataFormat(
  path: string,
): Ynab4BudgetDataFormat | null {
  if (path.endsWith("Budget.yfull")) return "yfull";
  if (path.endsWith("Budget.json")) return "json";
  return null;
}

function parseBudgetEntry(
  entry: Ynab4PackageEntry,
  location: Ynab4PackageLocation,
): Ynab4BudgetReadResult {
  const budgetDataPath = normaliseYnab4PackagePath(entry.path);
  try {
    const parsed = entry.parsedData ?? JSON.parse(entry.text ?? "");
    if (!entry.parsedData && isRecord(parsed)) {
      entry.parsedData = parsed;
      // Release the large UTF-16 source string immediately after parsing.
      entry.text = undefined;
    }
    if (!isRecord(parsed)) {
      return {
        ...location,
        data: null,
        budgetDataPath,
        budgetDataFormat: inferYnab4BudgetDataFormat(budgetDataPath),
        warnings: [
          ...location.warnings,
          "The active YNAB4 budget data root is not an object.",
        ],
      };
    }
    return {
      ...location,
      data: parsed,
      budgetDataPath,
      budgetDataFormat: inferYnab4BudgetDataFormat(budgetDataPath),
      warnings: [...location.warnings],
    };
  } catch {
    return {
      ...location,
      data: null,
      budgetDataPath,
      budgetDataFormat: inferYnab4BudgetDataFormat(budgetDataPath),
      warnings: [
        ...location.warnings,
        "The active YNAB4 budget data file is not valid JSON.",
      ],
    };
  }
}

export async function prepareYnab4PackageEntries(
  entries: Ynab4PackageEntry[],
  selectedBudgetDataPath?: string | null,
): Promise<Ynab4PackageEntry[]> {
  for (const entry of entries) {
    const path = normaliseYnab4PackagePath(entry.path);
    if ((path.endsWith("/Budget.ymeta") || path === "Budget.ymeta") && entry.text === undefined && entry.file) {
      entry.text = await entry.file.text();
    }
  }

  const location = discoverYnab4PackageLocation(entries);
  let selected = selectedBudgetDataPath
    ? entries.find((entry) => normaliseYnab4PackagePath(entry.path) === normaliseYnab4PackagePath(selectedBudgetDataPath))
    : location.activeDataFolderPath
      ? findActiveBudgetDataEntry(entries, location.activeDataFolderPath)
      : undefined;

  if (!selected && location.activeDataFolderPath) {
    const prefix = `${normaliseYnab4PackagePath(location.activeDataFolderPath)}/`;
    selected = entries
      .filter((entry) => {
        const path = normaliseYnab4PackagePath(entry.path);
        return path.startsWith(prefix) && (path.endsWith("/Budget.yfull") || path.endsWith("/Budget.json"));
      })
      .sort((left, right) => (right.lastModified ?? 0) - (left.lastModified ?? 0))[0];
  }

  if (selected) selected.selectedBudgetData = true;

  if (selected && selected.text === undefined && !selected.parsedData && selected.file) {
    selected.text = await selected.file.text();
  }
  return entries;
}

/**
 * Streaming-import preparation. Reads only Budget.ymeta and marks the active
 * Budget.yfull/Budget.json entry; the selected large Blob remains lazy.
 */
export async function prepareYnab4PackageEntriesForStreaming(
  entries: Ynab4PackageEntry[],
  selectedBudgetDataPath?: string | null,
): Promise<Ynab4PackageEntry[]> {
  for (const entry of entries) {
    const path = normaliseYnab4PackagePath(entry.path);
    if (
      (path.endsWith("/Budget.ymeta") || path === "Budget.ymeta") &&
      entry.text === undefined &&
      entry.file
    ) {
      entry.text = await entry.file.text();
    }
  }
  const location = discoverYnab4PackageLocation(entries);
  const selected = selectedBudgetDataPath
    ? entries.find(
        (entry) =>
          normaliseYnab4PackagePath(entry.path) ===
          normaliseYnab4PackagePath(selectedBudgetDataPath),
      )
    : location.activeDataFolderPath
      ? findActiveBudgetDataEntry(entries, location.activeDataFolderPath)
      : undefined;
  if (selected) selected.selectedBudgetData = true;
  return entries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
