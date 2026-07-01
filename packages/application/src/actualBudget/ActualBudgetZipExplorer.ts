import type { BankImportIssue, BudgetImportProviderInput, FullBudgetImportPreview } from "../../../types/src/index.js";
import { inspectActualSQLiteDatabase, type ActualSQLiteRepositoryInspection } from "./ActualSQLiteRepository.js";

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

interface ActualSQLiteHeaderInspection {
  isValidSQLite: boolean;
  pageSize: number | null;
  pageCount: number | null;
  schemaFormat: number | null;
  textEncoding: string | null;
  userVersion: number | null;
  applicationId: number | null;
  databaseBytes: number;
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

  let sqliteHeader: ActualSQLiteHeaderInspection | null = null;
  let sqliteInspection: ActualSQLiteRepositoryInspection | null = null;

  if (!sqliteEntry) {
    issues.push({
      rowNumber: null,
      severity: "error",
      code: "ActualZipMissingDatabase",
      message: "Actual Budget export package does not contain db.sqlite.",
    });
  } else {
    try {
      const sqliteBytes = await extractZipEntry(bytes, sqliteEntry);
      sqliteHeader = inspectActualSQLiteHeader(sqliteBytes);
      if (!sqliteHeader.isValidSQLite) {
        issues.push({
          rowNumber: null,
          severity: "error",
          code: "ActualSQLiteInvalidHeader",
          message: "db.sqlite was found, but it does not have a valid SQLite database header.",
        });
      } else {
        sqliteInspection = inspectActualSQLiteDatabase(sqliteBytes);
        for (const issue of sqliteInspection.issues) {
          issues.push({
            rowNumber: null,
            severity: "warning",
            code: "ActualSQLiteRepositoryInspectionWarning",
            message: issue,
          });
        }
        if (sqliteInspection.tables.length === 0) {
          issues.push({
            rowNumber: null,
            severity: "warning",
            code: "ActualSQLiteNoTablesFound",
            message: "db.sqlite is valid, but no Actual data tables were discovered during SQLite inspection.",
          });
        }
      }
    } catch (error) {
      issues.push({
        rowNumber: null,
        severity: "error",
        code: "ActualSQLiteReadFailed",
        message: error instanceof Error ? error.message : "Unable to read db.sqlite from the Actual Budget export.",
      });
    }
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
      { label: "db.sqlite", count: sqliteEntry ? 1 : 0, supported: Boolean(sqliteHeader?.isValidSQLite), note: sqliteHeader?.isValidSQLite ? `${formatBytes(sqliteHeader.databaseBytes)} valid SQLite database` : sqliteEntry ? "SQLite header validation failed" : "Required database missing" },
      { label: "SQLite pages", count: sqliteHeader?.pageCount ?? 0, supported: Boolean(sqliteHeader?.isValidSQLite), note: sqliteHeader?.pageSize ? `${sqliteHeader.pageSize} byte pages` : "SQLite header read pending" },
      { label: "SQLite tables", count: sqliteInspection?.tables.length ?? 0, supported: Boolean(sqliteInspection), note: sqliteInspection ? "Schema discovered from sqlite_master" : "SQLite table read pending" },
      { label: "Accounts", count: readActualTableCount(sqliteInspection, "accounts"), supported: Boolean(sqliteInspection), note: readActualTableCount(sqliteInspection, "accounts") > 0 ? "Read from Actual accounts table" : "Actual accounts table not found or empty" },
      { label: "Transactions", count: readActualTableCount(sqliteInspection, "transactions"), supported: Boolean(sqliteInspection), note: readActualTableCount(sqliteInspection, "transactions") > 0 ? "Read from Actual transactions table" : "Actual transactions table not found or empty" },
      { label: "Payees", count: readActualTableCount(sqliteInspection, "payees"), supported: Boolean(sqliteInspection), note: readActualTableCount(sqliteInspection, "payees") > 0 ? "Read from Actual payees table" : "Actual payees table not found or empty" },
      { label: "Category groups", count: readActualTableCount(sqliteInspection, "category_groups"), supported: Boolean(sqliteInspection), note: readActualTableCount(sqliteInspection, "category_groups") > 0 ? "Read from Actual category_groups table" : "Actual category_groups table not found or empty" },
      { label: "Categories", count: readActualTableCount(sqliteInspection, "categories"), supported: Boolean(sqliteInspection), note: readActualTableCount(sqliteInspection, "categories") > 0 ? "Read from Actual categories table" : "Actual categories table not found or empty" },
      { label: "Rules", count: readActualTableCount(sqliteInspection, "rules"), supported: false, note: "Detected for future import support" },
      { label: "Schedules", count: readActualTableCount(sqliteInspection, "schedules"), supported: false, note: "Detected for future import support" },
      { label: "Notes", count: readActualTableCount(sqliteInspection, "notes"), supported: false, note: "Detected for future import support" },
    ],
    issues,
    metadata: {
      fileName: input.fileName,
      packageType: "zip",
      budgetName: metadata.budgetName,
      lastUploaded: metadata.lastUploaded,
      zipEntryCount: entries.length,
      sqliteBytes: sqliteHeader?.databaseBytes ?? sqliteEntry?.uncompressedSize ?? null,
      sqliteValid: sqliteHeader?.isValidSQLite ?? false,
      sqlitePageSize: sqliteHeader?.pageSize ?? null,
      sqlitePageCount: sqliteHeader?.pageCount ?? null,
      sqliteSchemaFormat: sqliteHeader?.schemaFormat ?? null,
      sqliteTextEncoding: sqliteHeader?.textEncoding ?? null,
      sqliteUserVersion: sqliteHeader?.userVersion ?? null,
      sqliteApplicationId: sqliteHeader?.applicationId ?? null,
      sqliteTableCount: sqliteInspection?.tables.length ?? null,
      actualAccountCount: readActualTableCount(sqliteInspection, "accounts"),
      actualTransactionCount: readActualTableCount(sqliteInspection, "transactions"),
      actualPayeeCount: readActualTableCount(sqliteInspection, "payees"),
      actualCategoryGroupCount: readActualTableCount(sqliteInspection, "category_groups"),
      actualCategoryCount: readActualTableCount(sqliteInspection, "categories"),
      actualRuleCount: readActualTableCount(sqliteInspection, "rules"),
      actualScheduleCount: readActualTableCount(sqliteInspection, "schedules"),
      actualNoteCount: readActualTableCount(sqliteInspection, "notes"),
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

function readActualTableCount(inspection: ActualSQLiteRepositoryInspection | null, tableName: string): number {
  return inspection?.knownCounts[tableName] ?? 0;
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

function inspectActualSQLiteHeader(bytes: Uint8Array): ActualSQLiteHeaderInspection {
  const headerText = textDecoder.decode(bytes.slice(0, 16));
  const isValidSQLite = headerText === "SQLite format 3\0";
  if (!isValidSQLite || bytes.length < 100) {
    return {
      isValidSQLite,
      pageSize: null,
      pageCount: null,
      schemaFormat: null,
      textEncoding: null,
      userVersion: null,
      applicationId: null,
      databaseBytes: bytes.length,
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawPageSize = view.getUint16(16, false);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  const pageCount = view.getUint32(28, false);
  const schemaFormat = view.getUint32(44, false);
  const textEncodingCode = view.getUint32(56, false);

  return {
    isValidSQLite,
    pageSize,
    pageCount,
    schemaFormat,
    textEncoding: describeSQLiteTextEncoding(textEncodingCode),
    userVersion: view.getUint32(60, false),
    applicationId: view.getUint32(68, false),
    databaseBytes: bytes.length,
  };
}

function describeSQLiteTextEncoding(code: number): string | null {
  if (code === 1) return "UTF-8";
  if (code === 2) return "UTF-16le";
  if (code === 3) return "UTF-16be";
  return code === 0 ? null : `Unknown (${code})`;
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
