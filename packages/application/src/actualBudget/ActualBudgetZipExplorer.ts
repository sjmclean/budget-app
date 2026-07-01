import type { BankImportIssue, BudgetImportProviderInput, FullBudgetImportPreview } from "../../../types/src/index.js";

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

interface ActualZipMetadata {
  budgetName: string | null;
  lastUploaded: string | null;
  raw: Record<string, string | number | boolean | null>;
}

const textDecoder = new TextDecoder();

export async function inspectActualBudgetZipPackage(input: BudgetImportProviderInput): Promise<FullBudgetImportPreview> {
  const issues: BankImportIssue[] = [];
  const bytes = input.binary;

  if (!bytes || bytes.length === 0) {
    return actualZipPreviewFailure(input, "Actual Budget ZIP inspection needs the original binary file payload.");
  }

  let entries: ZipEntry[] = [];
  try {
    entries = readZipEntries(bytes);
  } catch (error) {
    return actualZipPreviewFailure(
      input,
      error instanceof Error ? error.message : "Unable to inspect the Actual Budget ZIP package.",
    );
  }

  const metadataEntry = findEntry(entries, "metadata.json");
  const sqliteEntry = findEntry(entries, "db.sqlite");
  let metadata: ActualZipMetadata = { budgetName: null, lastUploaded: null, raw: {} };

  if (!metadataEntry) {
    issues.push({
      rowNumber: null,
      severity: "error",
      code: "ActualZipMissingMetadata",
      message: "Actual Budget export package does not contain metadata.json.",
    });
  } else {
    try {
      const metadataBytes = await extractZipEntry(bytes, metadataEntry);
      metadata = parseActualMetadataJson(textDecoder.decode(metadataBytes));
    } catch (error) {
      issues.push({
        rowNumber: null,
        severity: "error",
        code: "ActualZipMetadataReadFailed",
        message: error instanceof Error ? error.message : "Unable to read metadata.json from the Actual Budget export.",
      });
    }
  }

  if (!sqliteEntry) {
    issues.push({
      rowNumber: null,
      severity: "error",
      code: "ActualZipMissingDatabase",
      message: "Actual Budget export package does not contain db.sqlite.",
    });
  } else {
    issues.push({
      rowNumber: null,
      severity: "warning",
      code: "ActualSQLiteTableInspectionPending",
      message: "db.sqlite was found. Table-level account/category/payee/transaction inspection is the next Actual importer step.",
    });
  }

  const canPreview = Boolean(metadataEntry && sqliteEntry && issues.every((issue) => issue.severity !== "error"));

  return {
    format: "actual-budget",
    providerId: "actual-budget",
    providerLabel: "Actual Budget",
    sourceBudgetName: metadata.budgetName,
    entityCounts: [
      { label: "Actual export package", count: 1, supported: true, note: "ZIP structure recognised" },
      { label: "Package entries", count: entries.length, supported: true, note: "metadata.json and db.sqlite expected" },
      { label: "metadata.json", count: metadataEntry ? 1 : 0, supported: Boolean(metadataEntry), note: metadata.lastUploaded ? `Last uploaded ${metadata.lastUploaded}` : "Budget metadata" },
      { label: "db.sqlite", count: sqliteEntry ? 1 : 0, supported: Boolean(sqliteEntry), note: sqliteEntry ? `${formatBytes(sqliteEntry.uncompressedSize)} SQLite database detected` : "Required database missing" },
      { label: "Accounts", count: 0, supported: false, note: "SQLite table read pending" },
      { label: "Transactions", count: 0, supported: false, note: "SQLite table read pending" },
      { label: "Payees", count: 0, supported: false, note: "SQLite table read pending" },
      { label: "Categories", count: 0, supported: false, note: "SQLite table read pending" },
    ],
    issues,
    metadata: {
      fileName: input.fileName,
      packageType: "zip",
      budgetName: metadata.budgetName,
      lastUploaded: metadata.lastUploaded,
      zipEntryCount: entries.length,
      sqliteBytes: sqliteEntry?.uncompressedSize ?? null,
      ...metadata.raw,
    },
    accounts: [],
    categoryGroups: [],
    categories: [],
    payees: [],
    transactions: [],
    transferCount: 0,
    canCommit: false,
  };
}

function actualZipPreviewFailure(input: BudgetImportProviderInput, message: string): FullBudgetImportPreview {
  return {
    format: "actual-budget",
    providerId: "actual-budget",
    providerLabel: "Actual Budget",
    sourceBudgetName: null,
    entityCounts: [{ label: "Actual export package", count: 0, supported: false, note: "ZIP inspection failed" }],
    issues: [{ rowNumber: null, severity: "error", code: "ActualZipInspectionFailed", message }],
    metadata: { fileName: input.fileName, packageType: "zip" },
    accounts: [],
    categoryGroups: [],
    categories: [],
    payees: [],
    transactions: [],
    transferCount: 0,
    canCommit: false,
  };
}

function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Invalid ZIP central directory entry.");
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength);
    entries.push({
      name: textDecoder.decode(nameBytes),
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(0, view.byteLength - 0xffff - 22);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("Could not find ZIP end-of-central-directory record.");
}

async function extractZipEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) throw new Error(`Invalid local ZIP header for ${entry.name}.`);
  const fileNameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataOffset = offset + 30 + fileNameLength + extraLength;
  const compressed = bytes.slice(dataOffset, dataOffset + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return inflateRaw(compressed);
  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod} for ${entry.name}.`);
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This runtime cannot decompress ZIP deflate entries.");
  }

  const compressedPayload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([compressedPayload]).stream().pipeThrough(new DecompressionStream("deflate-raw" as any));
  const response = new Response(stream);
  return new Uint8Array(await response.arrayBuffer());
}

function findEntry(entries: ZipEntry[], expectedName: string): ZipEntry | null {
  const normalizedExpectedName = expectedName.toLowerCase();
  return entries.find((entry) => entry.name.replace(/^\/+/, "").toLowerCase() === normalizedExpectedName) ?? null;
}

function parseActualMetadataJson(text: string): ActualZipMetadata {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) throw new Error("Actual metadata.json is not an object.");
  const budgetName = readOptionalString(parsed, "budgetName") ?? readOptionalString(parsed, "name");
  const lastUploaded = readOptionalString(parsed, "lastUploaded");
  const raw: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) raw[key] = value;
  }
  return { budgetName, lastUploaded, raw };
}

function readOptionalString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} bytes`;
}
