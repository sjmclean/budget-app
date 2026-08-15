import type {
  CsvImportColumnMapping,
  QifAmountFormat,
  QifDateFormat,
} from "./transactionImport";
import { createBudgetScopedStorage } from "../budget/budgetDataScope";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage";
import {
  createImportedFileFingerprintRepository,
  createImportedTransactionFingerprintRepository,
  importedFileFingerprintEntityId,
  importedTransactionFingerprintEntityId,
  importFingerprintTimestamp,
  projectEntityFields,
  upsertImportedFileFingerprintEntity,
  upsertImportedTransactionFingerprintEntity,
} from "./entities/importFingerprintEntity";
import { accountImportKnowledgeEntityId, findAccountImportKnowledgeEntity, upsertAccountImportKnowledgeEntity } from "./entities/importKnowledgeEntity";

const ACCOUNT_IMPORT_KNOWLEDGE_STORAGE_KEY =
  "budget-app.account-import-knowledge.v1";

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
  return createBudgetScopedStorage(getActiveKeyValueStorage());
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
  return findAccountImportKnowledgeEntity(
    getImportKnowledgeStorage(),
    accountImportKnowledgeEntityId({ accountId, fileType, structureSignature }),
  );
}

export function rememberAccountImportKnowledge(
  input: Omit<AccountImportKnowledge, "successfulImportCount" | "firstUsedAt" | "lastUsedAt">,
): AccountImportKnowledge {
  const now = new Date().toISOString();
  const existing = findAccountImportKnowledge(input);
  return upsertAccountImportKnowledgeEntity(getImportKnowledgeStorage(), {
    ...existing,
    ...input,
    successfulImportCount: (existing?.successfulImportCount ?? 0) + 1,
    firstUsedAt: existing?.firstUsedAt ?? now,
    lastUsedAt: now,
  }, new Date(now));
}

export function findImportedFileFingerprint(
  accountId: string,
  fileHash: string,
): ImportedFileFingerprint | undefined {
  const entity = createImportedFileFingerprintRepository(
    getImportKnowledgeStorage(),
  ).get(importedFileFingerprintEntityId(accountId, fileHash));
  return entity ? projectEntityFields(entity) : undefined;
}

export function rememberImportedFileFingerprint(
  fingerprint: ImportedFileFingerprint,
): ImportedFileFingerprint {
  const entity = upsertImportedFileFingerprintEntity(
    getImportKnowledgeStorage(),
    fingerprint,
    importFingerprintTimestamp(new Date(fingerprint.importedAt)),
  );
  return projectEntityFields(entity);
}

function normaliseIdentityValue(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

const CSV_EXTERNAL_TRANSACTION_ID_KEYS = new Set([
  "fitid",
  "transactionid",
  "transaction id",
  "bank transaction id",
]);

export type ImportedTransactionIdentityKind = "external" | "fallback";

export interface ImportedTransactionIdentityEvidence {
  readonly identity: string;
  readonly fallbackIdentity: string;
  readonly kind: ImportedTransactionIdentityKind;
}

function findExternalTransactionId(
  fileType: ImportedTransactionFileType,
  raw: Readonly<Record<string, string>>,
): string | undefined {
  if (fileType === "ofx" || fileType === "qfx") {
    const fitId = raw.fitId?.trim();
    return fitId || undefined;
  }

  // QIF has no standard stable transaction identifier. CSV identifiers are
  // trusted only when the bank deliberately labels a column as such; generic
  // ID/row/sequence values are not source transaction identity.
  if (fileType !== "csv") {
    return undefined;
  }

  for (const [key, value] of Object.entries(raw)) {
    if (
      CSV_EXTERNAL_TRANSACTION_ID_KEYS.has(normaliseIdentityValue(key)) &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return undefined;
}

export function getImportedTransactionIdentityKind(
  identity: string,
): ImportedTransactionIdentityKind {
  return identity.split(":", 3)[1] === "external"
    ? "external"
    : "fallback";
}

function createImportedTransactionFallbackIdentity(
  fileType: ImportedTransactionFileType,
  candidate: ImportIdentityCandidate,
): string {
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

export function createImportedTransactionIdentityEvidence(
  fileType: ImportedTransactionFileType,
  candidate: ImportIdentityCandidate,
): ImportedTransactionIdentityEvidence {
  const fallbackIdentity = createImportedTransactionFallbackIdentity(
    fileType,
    candidate,
  );
  const externalId = findExternalTransactionId(fileType, candidate.parsed.raw);
  if (externalId) {
    return {
      identity: `${fileType}:external:${createImportFileHash(normaliseIdentityValue(externalId))}`,
      fallbackIdentity,
      kind: "external",
    };
  }

  return {
    identity: fallbackIdentity,
    fallbackIdentity,
    kind: "fallback",
  };
}

const EXTERNAL_FALLBACK_ASSOCIATION_KIND = "external-fallback";

function createExternalFallbackAssociationIdentity(
  evidence: ImportedTransactionIdentityEvidence,
): string | undefined {
  if (evidence.kind !== "external") {
    return undefined;
  }

  const externalDigest = evidence.identity.split(":", 3)[2];
  const fallbackDigest = evidence.fallbackIdentity.split(":", 3)[2];
  if (!externalDigest || !fallbackDigest) {
    return undefined;
  }

  const fileType = evidence.identity.split(":", 1)[0];
  return [
    fileType,
    EXTERNAL_FALLBACK_ASSOCIATION_KIND,
    externalDigest,
    fallbackDigest,
  ].join(":");
}

function readExternalFallbackAssociation(identity: string): {
  externalDigest: string;
  fallbackDigest: string;
} | undefined {
  const [, kind, externalDigest, fallbackDigest] = identity.split(":", 4);
  if (
    kind !== EXTERNAL_FALLBACK_ASSOCIATION_KIND ||
    !externalDigest ||
    !fallbackDigest
  ) {
    return undefined;
  }

  return { externalDigest, fallbackDigest };
}

export function allowRetainedSourceRecoveryForIdentity(input: {
  evidence: ImportedTransactionIdentityEvidence;
  importedFingerprints: ReadonlyArray<
    Pick<ImportedTransactionFingerprint, "identity" | "occurrenceCount">
  >;
}): boolean {
  if (input.evidence.kind === "fallback") {
    return true;
  }

  // A further occurrence of an already represented strong ID must not consume
  // the same retained register occurrence after partitioning suppressed the
  // represented occurrences.
  if (
    input.importedFingerprints.some(
      (entry) =>
        entry.identity === input.evidence.identity &&
        entry.occurrenceCount > 0,
    )
  ) {
    return false;
  }

  const incomingExternalDigest = input.evidence.identity.split(":", 3)[2];
  const incomingFallbackDigest =
    input.evidence.fallbackIdentity.split(":", 3)[2];

  return !input.importedFingerprints.some((entry) => {
    const association = readExternalFallbackAssociation(entry.identity);
    return (
      association?.fallbackDigest === incomingFallbackDigest &&
      association.externalDigest !== incomingExternalDigest
    );
  });
}

export function createImportedTransactionIdentity(
  fileType: ImportedTransactionFileType,
  candidate: ImportIdentityCandidate,
): string {
  return createImportedTransactionIdentityEvidence(fileType, candidate).identity;
}

export interface PreviouslyImportedSourceOccurrence {
  identity: string;
  occurrenceCount: number;
  kind?: ImportedTransactionIdentityKind;
  allowRetainedSourceRecovery?: boolean;
}

export function readPreviouslyImportedSourceOccurrences<
  T extends ImportIdentityCandidate & { id: string },
>({
  accountId,
  fileType,
  candidates,
}: {
  accountId: string;
  fileType: ImportedTransactionFileType;
  candidates: T[];
}): Record<string, PreviouslyImportedSourceOccurrence> {
  const importedEntries =
    createImportedTransactionFingerprintRepository(getImportKnowledgeStorage())
      .list()
      .map(projectEntityFields)
      .filter(
        (entry) => entry.accountId === accountId && entry.fileType === fileType,
      );
  const importedCounts = new Map(
    importedEntries.map((entry) => [entry.identity, entry.occurrenceCount]),
  );
  return Object.fromEntries(
    candidates.map((candidate) => {
      const evidence = createImportedTransactionIdentityEvidence(
        fileType,
        candidate,
      );
      return [
        candidate.id,
        {
          identity: evidence.identity,
          occurrenceCount: importedCounts.get(evidence.identity) ?? 0,
          kind: evidence.kind,
          // Only transaction-specific strong-ID evidence can block
          // retained-field recovery. Unrelated external IDs elsewhere in the
          // account are not evidence about this candidate.
          allowRetainedSourceRecovery:
            allowRetainedSourceRecoveryForIdentity({
              evidence,
              importedFingerprints: importedEntries,
            }),
        },
      ];
    }),
  );
}

export function partitionCandidatesByImportedIdentity<
  T extends ImportIdentityCandidate,
>({
  fileType,
  candidates,
  importedCounts,
}: {
  fileType: ImportedTransactionFileType;
  candidates: T[];
  importedCounts: ReadonlyMap<string, number>;
}): {
  activeCandidates: T[];
  previouslyImportedCandidates: T[];
  alreadyRepresentedCandidates: T[];
} {
  const seenCounts = new Map<string, number>();
  const activeCandidates: T[] = [];
  const previouslyImportedCandidates: T[] = [];

  for (const candidate of candidates) {
    const evidence = createImportedTransactionIdentityEvidence(
      fileType,
      candidate,
    );
    const occurrence = (seenCounts.get(evidence.identity) ?? 0) + 1;
    seenCounts.set(evidence.identity, occurrence);

    if (
      evidence.kind === "external" &&
      occurrence <= (importedCounts.get(evidence.identity) ?? 0)
    ) {
      previouslyImportedCandidates.push(candidate);
    } else {
      activeCandidates.push(candidate);
    }
  }

  return {
    activeCandidates,
    previouslyImportedCandidates,
    alreadyRepresentedCandidates: [],
  };
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
    createImportedTransactionFingerprintRepository(getImportKnowledgeStorage())
      .list()
      .map(projectEntityFields)
      .filter(
        (entry) => entry.accountId === accountId && entry.fileType === fileType,
      )
      .map((entry) => [entry.identity, entry.occurrenceCount]),
  );

  return partitionCandidatesByImportedIdentity({
    fileType,
    candidates,
    importedCounts,
  });
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
  const storage = getImportKnowledgeStorage();
  const repository = createImportedTransactionFingerprintRepository(storage);
  const sessionCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const evidence = createImportedTransactionIdentityEvidence(
      fileType,
      candidate,
    );
    sessionCounts.set(
      evidence.identity,
      (sessionCounts.get(evidence.identity) ?? 0) + 1,
    );

    const associationIdentity =
      createExternalFallbackAssociationIdentity(evidence);
    if (associationIdentity) {
      sessionCounts.set(
        associationIdentity,
        (sessionCounts.get(associationIdentity) ?? 0) + 1,
      );
    }
  }

  let counter = 0;
  for (const [identity, occurrenceCount] of sessionCounts) {
    const id = importedTransactionFingerprintEntityId(accountId, fileType, identity);
    const existingEntity = repository.get(id);
    const existing = existingEntity ? projectEntityFields(existingEntity) : undefined;
    upsertImportedTransactionFingerprintEntity(
      storage,
      {
        accountId,
        fileType,
        identity,
        occurrenceCount: Math.max(existing?.occurrenceCount ?? 0, occurrenceCount),
        firstImportedAt: existing?.firstImportedAt ?? importedAt,
        lastImportedAt: importedAt,
      },
      importFingerprintTimestamp(new Date(importedAt), counter++),
    );
  }

  return createImportedTransactionFingerprintRepository(storage)
    .list()
    .map(projectEntityFields)
    .filter(
      (entry) =>
        entry.accountId === accountId &&
        entry.fileType === fileType &&
        !readExternalFallbackAssociation(entry.identity),
    );
}
