import type {
  CsvImportColumnMapping,
  QifAmountFormat,
  QifDateFormat,
} from "./transactionImport";
import { createBudgetScopedStorage } from "../budget/budgetDataScope";
import { browserLocalStorageKeyValueStorage } from "../persistence/keyValueStoragePort";

const ACCOUNT_IMPORT_KNOWLEDGE_STORAGE_KEY =
  "budget-app.account-import-knowledge.v1";
const IMPORTED_FILE_FINGERPRINT_STORAGE_KEY =
  "budget-app.imported-file-fingerprints.v1";
const IMPORTED_TRANSACTION_FINGERPRINT_STORAGE_KEY =
  "budget-app.imported-transaction-fingerprints.v1";

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

export type ImportedTransactionFileType = "csv" | "qif" | "ofx" | "qfx";

export interface ImportedTransactionFingerprint {
  accountId: string;
  fileType: ImportedTransactionFileType;
  identity: string;
  occurrenceCount: number;
  firstImportedAt: string;
  lastImportedAt: string;
}

interface ImportIdentityCandidate {
  id: string;
  parsed: {
    readonly date: string;
    readonly payee: string;
    readonly memo?: string;
    readonly importedCategoryName?: string;
    readonly transferAccountName?: string;
    readonly outflow: number;
    readonly inflow: number;
    readonly raw: Readonly<Record<string, string>>;
  };
}

function getImportKnowledgeStorage() {
  return createBudgetScopedStorage(browserLocalStorageKeyValueStorage);
}

function readJsonArray<T>(storageKey: string): T[] {
  try {
    const raw = getImportKnowledgeStorage().getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(storageKey: string, values: T[]): void {
  try {
    getImportKnowledgeStorage().setItem(storageKey, JSON.stringify(values));
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

  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}-${contents.length}`;
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
    (entry) => entry.accountId === accountId && entry.fileHash === fileHash,
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

function normaliseIdentityValue(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function findExternalTransactionId(
  fileType: ImportedTransactionFileType,
  raw: Record<string, string>,
): string | undefined {
  if (fileType === "ofx" || fileType === "qfx") {
    const fitId = raw.fitId?.trim();
    if (fitId) return fitId;
  }

  const externalIdKeys = new Set([
    "fitid",
    "transactionid",
    "transaction id",
    "bank transaction id",
    "unique id",
  ]);

  for (const [key, value] of Object.entries(raw)) {
    if (externalIdKeys.has(normaliseIdentityValue(key)) && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function createImportedTransactionIdentity(
  fileType: ImportedTransactionFileType,
  candidate: ImportIdentityCandidate,
): string {
  const externalId = findExternalTransactionId(fileType, candidate.parsed.raw);
  if (externalId) {
    return `${fileType}:external:${createImportFileHash(normaliseIdentityValue(externalId))}`;
  }

  const raw = candidate.parsed.raw;
  const rawDate = raw.date ?? raw.postedDate ?? candidate.parsed.date;
  const rawAmount =
    raw.amount ??
    String(
      candidate.parsed.inflow > 0
        ? candidate.parsed.inflow
        : -candidate.parsed.outflow,
    );
  const rawPayee = raw.payee ?? raw.name ?? candidate.parsed.payee;
  const rawMemo = raw.memo ?? candidate.parsed.memo;
  const rawReference = raw.number ?? raw.reference ?? raw.ref ?? "";
  const rawCategory =
    raw.category ?? candidate.parsed.importedCategoryName ?? "";

  const canonical = [
    normaliseIdentityValue(rawDate),
    normaliseIdentityValue(rawAmount),
    normaliseIdentityValue(rawPayee),
    normaliseIdentityValue(rawMemo),
    normaliseIdentityValue(rawReference),
    normaliseIdentityValue(rawCategory),
    normaliseIdentityValue(candidate.parsed.transferAccountName),
  ].join("|");

  return `${fileType}:fallback:${createImportFileHash(canonical)}`;
}

export function partitionPreviouslyImportedCandidates<
  T extends ImportIdentityCandidate,
>({
  accountId,
  fileType,
  candidates,
}: {
  accountId: string;
  fileType: ImportedTransactionFileType;
  candidates: T[];
}): {
  activeCandidates: T[];
  previouslyImportedCandidates: T[];
  alreadyRepresentedCandidates: T[];
} {
  const importedCounts = new Map(
    readJsonArray<ImportedTransactionFingerprint>(
      IMPORTED_TRANSACTION_FINGERPRINT_STORAGE_KEY,
    )
      .filter(
        (entry) => entry.accountId === accountId && entry.fileType === fileType,
      )
      .map((entry) => [entry.identity, entry.occurrenceCount]),
  );
  const seenCounts = new Map<string, number>();
  const activeCandidates: T[] = [];
  const previouslyImportedCandidates: T[] = [];

  for (const candidate of candidates) {
    const identity = createImportedTransactionIdentity(fileType, candidate);
    const occurrence = (seenCounts.get(identity) ?? 0) + 1;
    seenCounts.set(identity, occurrence);

    if (occurrence <= (importedCounts.get(identity) ?? 0)) {
      previouslyImportedCandidates.push(candidate);
    } else {
      activeCandidates.push(candidate);
    }
  }

  const alreadyRepresentedCandidates: T[] = [];

  // A partially recognised overlapping statement is strong evidence that
  // remaining exact register matches came from the same earlier import. This
  // repairs incomplete legacy identity ledgers without hiding first-time
  // manual matches: recovery is enabled only when this file already contains
  // at least one proven previously imported row.
  if (previouslyImportedCandidates.length > 0) {
    for (let index = activeCandidates.length - 1; index >= 0; index -= 1) {
      const candidate = activeCandidates[index] as T & { status?: string };
      if (candidate.status !== "exact-match") continue;
      alreadyRepresentedCandidates.unshift(candidate);
      activeCandidates.splice(index, 1);
    }
  }

  return {
    activeCandidates,
    previouslyImportedCandidates,
    alreadyRepresentedCandidates,
  };
}

export function rememberImportedTransactionCandidates({
  accountId,
  fileType,
  candidates,
  importedAt = new Date().toISOString(),
}: {
  accountId: string;
  fileType: ImportedTransactionFileType;
  candidates: ImportIdentityCandidate[];
  importedAt?: string;
}): ImportedTransactionFingerprint[] {
  const entries = readJsonArray<ImportedTransactionFingerprint>(
    IMPORTED_TRANSACTION_FINGERPRINT_STORAGE_KEY,
  );
  const sessionCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const identity = createImportedTransactionIdentity(fileType, candidate);
    sessionCounts.set(identity, (sessionCounts.get(identity) ?? 0) + 1);
  }

  for (const [identity, occurrenceCount] of sessionCounts) {
    const existingIndex = entries.findIndex(
      (entry) =>
        entry.accountId === accountId &&
        entry.fileType === fileType &&
        entry.identity === identity,
    );
    const existing = existingIndex >= 0 ? entries[existingIndex] : undefined;
    const next: ImportedTransactionFingerprint = {
      accountId,
      fileType,
      identity,
      // Store how many real occurrences of this identity are represented, not
      // how many times the same import decision has been replayed. Re-importing
      // an overlapping statement must not inflate the ledger indefinitely.
      occurrenceCount: Math.max(
        existing?.occurrenceCount ?? 0,
        occurrenceCount,
      ),
      firstImportedAt: existing?.firstImportedAt ?? importedAt,
      lastImportedAt: importedAt,
    };
    if (existingIndex >= 0) entries[existingIndex] = next;
    else entries.push(next);
  }

  writeJsonArray(IMPORTED_TRANSACTION_FINGERPRINT_STORAGE_KEY, entries);
  return entries.filter(
    (entry) => entry.accountId === accountId && entry.fileType === fileType,
  );
}
