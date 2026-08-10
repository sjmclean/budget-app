import type { Ynab4PackageEntry } from "./readBudget.js";

export type Ynab4PackageLocation = {
  packageRoot: string | null;
  metadataPath: string | null;
  relativeDataFolderName: string | null;
  activeDataFolderPath: string | null;
  warnings: string[];
};

export function discoverYnab4PackageLocation(
  entries: Ynab4PackageEntry[],
): Ynab4PackageLocation {
  const normalisedEntries = entries.map((entry) => ({
    path: normaliseYnab4PackagePath(entry.path),
    text: entry.text ?? "",
  }));
  const metadataEntry = normalisedEntries.find(
    (entry) =>
      entry.path.endsWith("/Budget.ymeta") || entry.path === "Budget.ymeta",
  );

  if (!metadataEntry) {
    return emptyLocation(["Budget.ymeta was not found."]);
  }

  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(metadataEntry.text) as Record<string, unknown>;
  } catch {
    return {
      ...emptyLocation(["Budget.ymeta is not valid JSON."]),
      packageRoot: inferYnab4PackageRoot(metadataEntry.path),
      metadataPath: metadataEntry.path,
    };
  }

  const relativeDataFolderName =
    typeof metadata.relativeDataFolderName === "string" &&
    metadata.relativeDataFolderName.trim()
      ? metadata.relativeDataFolderName.trim()
      : null;
  const packageRoot = inferYnab4PackageRoot(metadataEntry.path);

  if (!relativeDataFolderName) {
    return {
      packageRoot,
      metadataPath: metadataEntry.path,
      relativeDataFolderName: null,
      activeDataFolderPath: null,
      warnings: [
        "Budget.ymeta does not contain a relativeDataFolderName value.",
      ],
    };
  }

  return {
    packageRoot,
    metadataPath: metadataEntry.path,
    relativeDataFolderName,
    activeDataFolderPath: packageRoot
      ? `${packageRoot}/${relativeDataFolderName}`
      : relativeDataFolderName,
    warnings: [],
  };
}

export function normaliseYnab4PackagePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

export function inferYnab4PackageRoot(path: string): string | null {
  const parts = normaliseYnab4PackagePath(path).split("/");
  return parts.length <= 1 ? null : parts[0] || null;
}

function emptyLocation(warnings: string[]): Ynab4PackageLocation {
  return {
    packageRoot: null,
    metadataPath: null,
    relativeDataFolderName: null,
    activeDataFolderPath: null,
    warnings,
  };
}
