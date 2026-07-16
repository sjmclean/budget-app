import type {
  CsvImportColumnMapping,
  QifAmountFormat,
  QifDateFormat,
} from "./transactionImport";

const ACCOUNT_IMPORT_KNOWLEDGE_STORAGE_KEY =
  "budget-app.account-import-knowledge.v1";
const IMPORTED_FILE_FINGERPRINT_STORAGE_KEY =
  "budget-app.imported-file-fingerprints.v1";

export type AccountImportKnowledgeFileType = "csv" | "qif";

export interface AccountImportKnowledge {
  accountId: string;
  fileType: AccountImportKnowledgeFileType;
  structureSignature: string;
  csvMapping?: CsvImportColumnMapping;
  qifDateFormat?: QifDateFormat;
  qifAmountFormat?: QifAmountFormat;
  successfulImportCount: number;
  firstUsedAt: string;
  lastUsedAt: string;
}

export interface ImportedFileFingerprint {
  accountId: string;
  fileHash: string;
  fileName: string;
  importedAt: string;
  transactionCount: number;
}

function canUseLocalStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readJsonArray<T>(storageKey: string): T[] {
  if (!canUseLocalStorage()) return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(storageKey: string, values: T[]): void {
  if (!canUseLocalStorage()) return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(values));
  } catch {
    // Importing must remain usable when browser storage is unavailable.
  }
}

export function createImportFileHash(contents: string): string {
  // Two independent 32-bit FNV-1a passes produce a compact deterministic
  // content fingerprint without requiring an asynchronous crypto API.
  let first = 0x811c9dc5;
  let second = 0x811c9dc5;

  for (let index = 0; index < contents.length; index += 1) {
    const code = contents.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);

    second ^= code + index;
    second = Math.imul(second, 0x01000193);
  }

  return `${(first >>> 0).toString(16).padStart(8, "0")}${
    (second >>> 0).toString(16).padStart(8, "0")
  }-${contents.length}`;
}

export function createQifStructureSignature(contents: string): string {
  const fieldCodes = new Set<string>();
  let accountType = "unknown";
  let splitFieldsPresent = false;
  let transferSyntaxPresent = false;

  for (const rawLine of contents.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("!Type:")) {
      accountType = line.slice("!Type:".length).trim().toLowerCase();
      continue;
    }

    const code = line[0];
    if (/^[A-Z$%]$/.test(code)) fieldCodes.add(code);
    if (code === "S" || code === "$" || code === "%") {
      splitFieldsPresent = true;
    }
    if (code === "L" && /^L\[[^\]]+\]$/.test(line)) {
      transferSyntaxPresent = true;
    }
  }

  return [
    `type:${accountType}`,
    `fields:${[...fieldCodes].sort().join("")}`,
    `splits:${splitFieldsPresent ? "yes" : "no"}`,
    `transfers:${transferSyntaxPresent ? "yes" : "no"}`,
  ].join("|");
}

export function findAccountImportKnowledge({
  accountId,
  fileType,
  structureSignature,
}: {
  accountId: string;
  fileType: AccountImportKnowledgeFileType;
  structureSignature: string;
}): AccountImportKnowledge | undefined {
  return readJsonArray<AccountImportKnowledge>(
    ACCOUNT_IMPORT_KNOWLEDGE_STORAGE_KEY,
  ).find(
    (entry) =>
      entry.accountId === accountId &&
      entry.fileType === fileType &&
      entry.structureSignature === structureSignature,
  );
}

export function rememberAccountImportKnowledge(
  input: Omit<
    AccountImportKnowledge,
    "successfulImportCount" | "firstUsedAt" | "lastUsedAt"
  >,
): AccountImportKnowledge {
  const entries = readJsonArray<AccountImportKnowledge>(
    ACCOUNT_IMPORT_KNOWLEDGE_STORAGE_KEY,
  );
  const now = new Date().toISOString();
  const existingIndex = entries.findIndex(
    (entry) =>
      entry.accountId === input.accountId &&
      entry.fileType === input.fileType &&
      entry.structureSignature === input.structureSignature,
  );

  const existing = existingIndex >= 0 ? entries[existingIndex] : undefined;
  const next: AccountImportKnowledge = {
    ...existing,
    ...input,
    successfulImportCount: (existing?.successfulImportCount ?? 0) + 1,
    firstUsedAt: existing?.firstUsedAt ?? now,
    lastUsedAt: now,
  };

  if (existingIndex >= 0) entries[existingIndex] = next;
  else entries.push(next);

  writeJsonArray(ACCOUNT_IMPORT_KNOWLEDGE_STORAGE_KEY, entries);
  return next;
}

export function findImportedFileFingerprint(
  accountId: string,
  fileHash: string,
): ImportedFileFingerprint | undefined {
  return readJsonArray<ImportedFileFingerprint>(
    IMPORTED_FILE_FINGERPRINT_STORAGE_KEY,
  ).find(
    (entry) =>
      entry.accountId === accountId && entry.fileHash === fileHash,
  );
}

export function rememberImportedFileFingerprint(
  fingerprint: ImportedFileFingerprint,
): ImportedFileFingerprint {
  const entries = readJsonArray<ImportedFileFingerprint>(
    IMPORTED_FILE_FINGERPRINT_STORAGE_KEY,
  );
  const existingIndex = entries.findIndex(
    (entry) =>
      entry.accountId === fingerprint.accountId &&
      entry.fileHash === fingerprint.fileHash,
  );

  if (existingIndex >= 0) entries[existingIndex] = fingerprint;
  else entries.push(fingerprint);

  writeJsonArray(IMPORTED_FILE_FINGERPRINT_STORAGE_KEY, entries);
  return fingerprint;
}
