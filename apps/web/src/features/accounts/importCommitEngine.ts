import type { SidebarAccount } from "./accountService";
import { RegisterTransactionBatchCommitError } from "./accountRegisterPersistencePort";
import type {
  NewRegisterTransactionInput,
  RegisterTransactionView,
} from "./accountRegisterTypes";
import {
  buildRegisterTransactionsFromImport,
  getCsvImportSignature,
  type CsvImportAnalysis,
  type CsvImportColumnMapping,
  type QifAmountFormat,
  type QifDateFormat,
  type QifImportDetection,
  type TransactionImportCandidate,
  type TransactionImportPerformanceEntry,
} from "./transactionImport";
import {
  createEmptyMerchantKnowledgeStore,
  recordMerchantAccountEvidence,
  recordMerchantAliasEvidence,
  recordMerchantCategoryEvidence,
  recordMerchantTransferEvidence,
  type MerchantKnowledgeStore,
} from "./merchantKnowledge";
import { persistMerchantKnowledge } from "./merchantKnowledgeService";
import {
  createQifStructureSignature,
  rememberAccountImportKnowledge,
  rememberImportedFileFingerprint,
  type ImportedTransactionFileType,
  type TransactionImportSourceIdentity,
} from "./transactionImportKnowledge";
import { getActiveBudgetIdFromStorage } from "../budget/budgetDataScope";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage";
import { resolvePayeeForSubmission, type PayeeSubmissionResolver } from "./resolvePayeeForSubmission";
import {
  stableImportTransactionId,
  type PlannedImportRegisterTransactionInput,
} from "./transactionImportCommit";
import type {
  RegisterTransactionImportPayeeCreation,
  RegisterTransactionImportProvenanceAssignment,
} from "../persistence/accountRegisterQueryContracts";

export interface ImportCommitCategory {
  id: string;
  name: string;
}

export interface ImportCommitFileContext {
  fileType: ImportedTransactionFileType;
  fileName?: string | null;
  fileHash?: string | null;
  csvAnalysis?: CsvImportAnalysis | null;
  csvMapping?: CsvImportColumnMapping;
  qifDetection?: QifImportDetection | null;
  qifText?: string | null;
  qifDateFormat?: QifDateFormat;
  qifAmountFormat?: QifAmountFormat;
}

export interface ImportCommitSession {
  accountId: string;
  accountName: string;
  importedCandidates: TransactionImportCandidate[];
  matchedCandidates: TransactionImportCandidate[];
  completedSourceCandidates: TransactionImportCandidate[];
  sourceIdentities: Readonly<
    Record<string, TransactionImportSourceIdentity>
  >;
  skippedCount: number;
  previouslyImportedCount: number;
  alreadyRepresentedCount: number;
  editedMatchedCandidateIds: ReadonlySet<string>;
  includeMemos: boolean;
  updateMatchedTransactionDates: boolean;
  categories: ImportCommitCategory[];
  accounts: Pick<SidebarAccount, "id" | "name">[];
  merchantKnowledge: MerchantKnowledgeStore;
  file: ImportCommitFileContext;
}

export type ImportPayeeResolution =
  | {
      readonly kind: "existing";
      readonly id: string;
      readonly name: string;
    }
  | {
      readonly kind: "create";
      readonly id: string;
      readonly name: string;
    };

export type ImportPayeeResolver = (
  name: string,
) => Promise<ImportPayeeResolution>;

export interface ImportCommitAdapters {
  resolvePayee?: ImportPayeeResolver;
  commitTransactionBatch?: (
    accountId: string,
    additions: NewRegisterTransactionInput[],
    updates: RegisterTransactionView[],
    provenanceAssignments: readonly RegisterTransactionImportProvenanceAssignment[],
    payeeCreations: readonly RegisterTransactionImportPayeeCreation[],
  ) => Promise<void>;
  addTransactions: (
    accountId: string,
    transactions: NewRegisterTransactionInput[],
  ) => Promise<void>;
  updateTransactions: (
    accountId: string,
    transactions: RegisterTransactionView[],
  ) => Promise<void>;
  verifyCommittedTransactions?: (
    accountId: string,
    additions: readonly NewRegisterTransactionInput[],
  ) => Promise<void>;
}

export type ImportCommitAuditStatus = "completed" | "failed";

export interface ImportCommitAuditRecord {
  sessionId: string;
  budgetId: string;
  accountId: string;
  accountName: string;
  fileType: ImportedTransactionFileType;
  fileName: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  importedCount: number;
  matchedCount: number;
  updatedMatchCount: number;
  identityCount: number;
  skippedCount: number;
  previouslyImportedCount: number;
  alreadyRepresentedCount: number;
  status: ImportCommitAuditStatus;
  failedStage: string | null;
  errorMessage: string | null;
  registerMutationStarted: boolean;
  registerBatchUsed: boolean;
  registerRollbackAttempted: boolean;
  registerRollbackSucceeded: boolean;
  knowledgePersisted: boolean;
  knowledgePersistenceError: string | null;
  stages: TransactionImportPerformanceEntry[];
}

export interface ImportCommitPlan {
  additions: PlannedImportRegisterTransactionInput[];
  matchedTransactionUpdates: RegisterTransactionView[];
  provenanceAssignments: RegisterTransactionImportProvenanceAssignment[];
  payeeCreations: RegisterTransactionImportPayeeCreation[];
  merchantKnowledge: MerchantKnowledgeStore;
}


export type ImportCommitVerificationIssueCode =
  | "destination-account-missing"
  | "candidate-overlap"
  | "completed-candidate-mismatch"
  | "invalid-import-candidate"
  | "invalid-matched-candidate"
  | "duplicate-register-update"
  | "duplicate-register-match"
  | "invalid-transaction-amount"
  | "invalid-transfer"
  | "invalid-category-reference"
  | "invalid-import-identity"
  | "invalid-statistics";

export interface ImportCommitVerificationIssue {
  code: ImportCommitVerificationIssueCode;
  message: string;
  candidateId?: string;
  transactionId?: string;
}

export interface ImportCommitVerificationResult {
  valid: boolean;
  issues: ImportCommitVerificationIssue[];
}

export class ImportCommitValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Import commit validation failed: ${issues.join(" ")}`);
    this.name = "ImportCommitValidationError";
    this.issues = issues;
  }
}

export class ImportCommitExecutionError extends Error {
  readonly audit: ImportCommitAuditRecord;
  readonly causeValue: unknown;

  constructor(message: string, audit: ImportCommitAuditRecord, causeValue: unknown) {
    super(message);
    this.name = "ImportCommitExecutionError";
    this.audit = audit;
    this.causeValue = causeValue;
  }
}

export interface ImportCommitResult {
  additions: NewRegisterTransactionInput[];
  matchedTransactionUpdates: RegisterTransactionView[];
  merchantKnowledge: MerchantKnowledgeStore;
  audit: ImportCommitAuditRecord;
}

const recentImportCommitAudits: ImportCommitAuditRecord[] = [];

export function readRecentImportCommitAudits(): ImportCommitAuditRecord[] {
  return [...recentImportCommitAudits];
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function measureStage<T>(
  stages: TransactionImportPerformanceEntry[],
  label: string,
  action: () => T,
): T {
  const startedAt = nowMs();
  try {
    return action();
  } finally {
    stages.push({ label, durationMs: nowMs() - startedAt });
  }
}

async function measureAsyncStage<T>(
  stages: TransactionImportPerformanceEntry[],
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = nowMs();
  try {
    return await action();
  } finally {
    stages.push({ label, durationMs: nowMs() - startedAt });
  }
}

function proposalFor(candidate: TransactionImportCandidate) {
  return candidate.lifecycle.proposal;
}

function buildMatchedTransactionUpdates(
  session: ImportCommitSession,
): RegisterTransactionView[] {
  return session.matchedCandidates.flatMap((candidate) => {
    if (!candidate.matchedTransaction) return [];
    const wasEdited = session.editedMatchedCandidateIds.has(candidate.id);
    const shouldUpdateDate =
      session.updateMatchedTransactionDates &&
      Boolean(candidate.parsed.date) &&
      candidate.matchedTransaction.date !== candidate.parsed.date;
    const sourceRawPayee = candidate.lifecycle.source.rawPayee.trim();
    const shouldRetainRawPayee =
      Boolean(sourceRawPayee) &&
      !candidate.matchedTransaction.rawPayee?.trim();

    if (!wasEdited && !shouldUpdateDate && !shouldRetainRawPayee) return [];

    return [
      {
        ...candidate.matchedTransaction,
        date: shouldUpdateDate
          ? candidate.parsed.date
          : candidate.matchedTransaction.date,
        rawPayee: shouldRetainRawPayee
          ? sourceRawPayee
          : candidate.matchedTransaction.rawPayee,
      },
    ];
  });
}

function learnFromCommittedCandidates(
  session: ImportCommitSession,
): MerchantKnowledgeStore {
  let store = Array.isArray(session.merchantKnowledge?.merchants)
    ? session.merchantKnowledge
    : createEmptyMerchantKnowledgeStore();

  for (const candidate of session.importedCandidates) {
    const proposal = proposalFor(candidate);
    const payee = proposal.payee.trim();
    const sourcePayee = candidate.lifecycle.source.rawPayee.trim();
    if (!sourcePayee) continue;
    const observedAt = candidate.parsed.date
      ? `${candidate.parsed.date}T00:00:00.000Z`
      : undefined;
    const transferAccountName = proposal.transferAccountName?.trim();
    const merchantName = transferAccountName ? sourcePayee : payee;
    if (!merchantName) continue;

    store = recordMerchantAliasEvidence({
      store,
      sourceValue: sourcePayee,
      preferredName: merchantName,
      observedAt,
    });
    store = recordMerchantAccountEvidence({
      store,
      merchantName,
      accountId: session.accountId,
      observedAt,
    });

    if (transferAccountName) {
      const transferAccount = session.accounts.find(
        (account) => account.name === transferAccountName,
      );
      if (transferAccount) {
        store = recordMerchantTransferEvidence({
          store,
          merchantName,
          accountId: transferAccount.id,
          accountName: transferAccount.name,
          observedAt,
        });
      }
    } else if (proposal.categoryName) {
      store = recordMerchantCategoryEvidence({
        store,
        merchantName,
        categoryId: session.categories.find(
          (category) => category.name === proposal.categoryName,
        )?.id,
        categoryName: proposal.categoryName,
        observedAt,
      });
    }
  }

  for (const candidate of session.matchedCandidates) {
    if (
      !session.editedMatchedCandidateIds.has(candidate.id) ||
      !candidate.matchedTransaction
    ) {
      continue;
    }
    const payee = candidate.matchedTransaction.payee.trim();
    if (!payee || payee.toLowerCase().startsWith("transfer:")) continue;
    const sourcePayee = candidate.lifecycle.source.rawPayee.trim();
    if (!sourcePayee) continue;
    const observedAt = candidate.parsed.date
      ? `${candidate.parsed.date}T00:00:00.000Z`
      : undefined;

    store = recordMerchantAliasEvidence({
      store,
      sourceValue: sourcePayee,
      preferredName: payee,
      observedAt,
    });
    store = recordMerchantAccountEvidence({
      store,
      merchantName: payee,
      accountId: session.accountId,
      observedAt,
    });
    if (candidate.matchedTransaction.category) {
      store = recordMerchantCategoryEvidence({
        store,
        merchantName: payee,
        categoryId: candidate.matchedTransaction.categoryId,
        categoryName: candidate.matchedTransaction.category,
        observedAt,
      });
    }
  }

  return store;
}

function rememberCommitKnowledge(
  session: ImportCommitSession,
  additionsCount: number,
  merchantKnowledge: MerchantKnowledgeStore,
) {
  persistMerchantKnowledge(merchantKnowledge);
  if (session.file.fileType === "csv" && session.file.csvAnalysis) {
    rememberAccountImportKnowledge({
      accountId: session.accountId,
      fileType: "csv",
      structureSignature: getCsvImportSignature(session.file.csvAnalysis),
      csvMapping: session.file.csvMapping ?? {},
    });
  } else if (
    session.file.fileType === "qif" &&
    session.file.qifDetection &&
    session.file.qifDateFormat &&
    session.file.qifAmountFormat
  ) {
    rememberAccountImportKnowledge({
      accountId: session.accountId,
      fileType: "qif",
      structureSignature: createQifStructureSignature(session.file.qifText ?? ""),
      qifDateFormat: session.file.qifDateFormat,
      qifAmountFormat: session.file.qifAmountFormat,
    });
  }

  if (session.file.fileHash && session.file.fileName) {
    rememberImportedFileFingerprint({
      accountId: session.accountId,
      fileHash: session.file.fileHash,
      fileName: session.file.fileName,
      importedAt: new Date().toISOString(),
      transactionCount: additionsCount,
    });
  }
}

function createSessionId(now = new Date()): string {
  return `import-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function verifyImportCommitPlan(
  session: ImportCommitSession,
  plan: Pick<
    ImportCommitPlan,
    | "additions"
    | "matchedTransactionUpdates"
    | "provenanceAssignments"
    | "payeeCreations"
  >,
): ImportCommitVerificationResult {
  const issues: ImportCommitVerificationIssue[] = [];
  const addIssue = (issue: ImportCommitVerificationIssue) => issues.push(issue);
  const accountById = new Map(session.accounts.map((account) => [account.id, account]));
  const categoryById = new Map(session.categories.map((category) => [category.id, category]));
  const categoryByName = new Map(
    session.categories.map((category) => [category.name.trim().toLocaleLowerCase(), category]),
  );

  if (!session.accountId.trim() || !accountById.has(session.accountId)) {
    addIssue({
      code: "destination-account-missing",
      message: `Destination account ${session.accountId || "(missing)"} is not available.`,
    });
  }

  for (const [label, value] of [
    ["skipped", session.skippedCount],
    ["previously imported", session.previouslyImportedCount],
    ["already represented", session.alreadyRepresentedCount],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      addIssue({
        code: "invalid-statistics",
        message: `The ${label} count must be a non-negative integer.`,
      });
    }
  }

  const importedIds = new Set(session.importedCandidates.map((candidate) => candidate.id));
  const matchedIds = new Set(session.matchedCandidates.map((candidate) => candidate.id));
  for (const candidateId of importedIds) {
    if (matchedIds.has(candidateId)) {
      addIssue({
        code: "candidate-overlap",
        candidateId,
        message: `Candidate ${candidateId} is scheduled for both import and match.`,
      });
    }
  }

  const expectedCompletedIds = new Set([...importedIds, ...matchedIds]);
  const completedIds = new Set(session.completedSourceCandidates.map((candidate) => candidate.id));
  for (const candidateId of expectedCompletedIds) {
    if (!completedIds.has(candidateId)) {
      addIssue({
        code: "completed-candidate-mismatch",
        candidateId,
        message: `Candidate ${candidateId} is missing from completed import identities.`,
      });
    }
  }
  for (const candidateId of completedIds) {
    if (!expectedCompletedIds.has(candidateId)) {
      addIssue({
        code: "completed-candidate-mismatch",
        candidateId,
        message: `Candidate ${candidateId} is marked completed without an import or match decision.`,
      });
    }
  }

  for (const candidate of session.importedCandidates) {
    if (!candidate.selected || candidate.status !== "new" || candidate.errors.length > 0) {
      addIssue({
        code: "invalid-import-candidate",
        candidateId: candidate.id,
        message: `Candidate ${candidate.id} is not a valid selected new transaction.`,
      });
    }
  }

  const matchedRegisterIds = new Set<string>();
  for (const candidate of session.matchedCandidates) {
    const transactionId = candidate.matchedTransaction?.id;
    if (!transactionId) {
      addIssue({
        code: "invalid-matched-candidate",
        candidateId: candidate.id,
        message: `Matched candidate ${candidate.id} has no register transaction.`,
      });
      continue;
    }
    if (matchedRegisterIds.has(transactionId)) {
      addIssue({
        code: "duplicate-register-match",
        candidateId: candidate.id,
        transactionId,
        message: `Register transaction ${transactionId} is matched by more than one candidate.`,
      });
    }
    matchedRegisterIds.add(transactionId);
  }

  if (plan.additions.length !== session.importedCandidates.length) {
    addIssue({
      code: "invalid-import-candidate",
      message: `Prepared additions (${plan.additions.length}) do not match accepted candidates (${session.importedCandidates.length}).`,
    });
  }

  const additionIds = new Set<string>();
  for (const [index, addition] of plan.additions.entries()) {
    const transactionId = addition.id?.trim();

    if (!transactionId) {
      addIssue({
        code: "invalid-import-identity",
        message: `Prepared import addition ${index + 1} has no stable transaction ID.`,
      });
      continue;
    }

    if (additionIds.has(transactionId)) {
      addIssue({
        code: "invalid-import-identity",
        transactionId,
        message: `Prepared import transaction ID ${transactionId} appears more than once.`,
      });
    }

    additionIds.add(transactionId);
  }

  const identityScope = session.file.fileHash?.trim();
  if (identityScope) {
    for (const candidate of session.importedCandidates) {
      const expectedTransactionId = stableImportTransactionId(
        candidate,
        identityScope,
      );

      if (!additionIds.has(expectedTransactionId)) {
        addIssue({
          code: "invalid-import-identity",
          candidateId: candidate.id,
          transactionId: expectedTransactionId,
          message:
            `Imported candidate ${candidate.id} lost its planned transaction identity ${expectedTransactionId}.`,
        });
      }
    }
  }

  if (
    plan.provenanceAssignments.length !==
    session.completedSourceCandidates.length
  ) {
    addIssue({
      code: "invalid-import-identity",
      message:
        `Prepared provenance assignments (${plan.provenanceAssignments.length}) ` +
        `do not match completed import candidates (${session.completedSourceCandidates.length}).`,
    });
  }

  const validProvenanceTargets = new Set([
    ...additionIds,
    ...matchedRegisterIds,
  ]);

  for (const assignment of plan.provenanceAssignments) {
    if (!validProvenanceTargets.has(assignment.transactionId)) {
      addIssue({
        code: "invalid-import-identity",
        transactionId: assignment.transactionId,
        message:
          `Import provenance targets transaction ${assignment.transactionId}, ` +
          "which is neither a planned addition nor an accepted existing match.",
      });
    }
  }

  for (const transactionId of additionIds) {
    if (
      !plan.provenanceAssignments.some(
        (assignment) => assignment.transactionId === transactionId,
      )
    ) {
      addIssue({
        code: "invalid-import-identity",
        transactionId,
        message:
          `Prepared import transaction ${transactionId} has no provenance assignment.`,
      });
    }
  }

  const stagedPayeesById = new Map<
    string,
    RegisterTransactionImportPayeeCreation
  >();
  const stagedPayeeIdsByNormalisedName = new Map<string, string>();

  for (const creation of plan.payeeCreations) {
    const payeeId = creation.id.trim();
    const payeeName = creation.name.replace(/\s+/g, " ").trim();
    const normalisedName = payeeName.toLocaleLowerCase();

    if (!payeeId || !payeeName) {
      addIssue({
        code: "invalid-import-identity",
        message: "A staged import payee requires both an ID and a name.",
      });
      continue;
    }

    const existingById = stagedPayeesById.get(payeeId);
    if (existingById) {
      addIssue({
        code: "invalid-import-identity",
        transactionId: payeeId,
        message: `Staged import payee ID ${payeeId} appears more than once.`,
      });
      continue;
    }

    const existingNameId =
      stagedPayeeIdsByNormalisedName.get(normalisedName);
    if (existingNameId && existingNameId !== payeeId) {
      addIssue({
        code: "invalid-import-identity",
        message:
          `Staged import payee ${payeeName} is represented by more than one ID.`,
      });
    }

    stagedPayeesById.set(payeeId, {
      id: payeeId,
      name: payeeName,
    });
    stagedPayeeIdsByNormalisedName.set(normalisedName, payeeId);
  }

  const referencedStagedPayeeIds = new Set<string>();
  const payeeBearingTransactions = [
    ...plan.additions,
    ...plan.matchedTransactionUpdates,
  ];

  for (const transaction of payeeBearingTransactions) {
    const payeeId = transaction.payeeId?.trim();
    if (!payeeId) continue;

    const stagedPayee = stagedPayeesById.get(payeeId);
    if (!stagedPayee) continue;

    referencedStagedPayeeIds.add(payeeId);

    const transactionPayee = transaction.payee.replace(/\s+/g, " ").trim();
    if (transactionPayee !== stagedPayee.name) {
      addIssue({
        code: "invalid-import-identity",
        transactionId: transaction.id,
        message:
          `Transaction ${transaction.id ?? "(new)"} references staged payee ` +
          `${payeeId} but does not use its canonical name.`,
      });
    }
  }

  for (const stagedPayeeId of stagedPayeesById.keys()) {
    if (!referencedStagedPayeeIds.has(stagedPayeeId)) {
      addIssue({
        code: "invalid-import-identity",
        transactionId: stagedPayeeId,
        message:
          `Staged import payee ${stagedPayeeId} is not referenced by the commit plan.`,
      });
    }
  }

  const verifyMoney = (
    transaction: Pick<NewRegisterTransactionInput, "inflow" | "outflow">,
    label: string,
  ) => {
    const { inflow, outflow } = transaction;
    if (
      !Number.isFinite(inflow) ||
      !Number.isFinite(outflow) ||
      inflow < 0 ||
      outflow < 0 ||
      (inflow > 0 && outflow > 0) ||
      (inflow === 0 && outflow === 0)
    ) {
      addIssue({
        code: "invalid-transaction-amount",
        message: `${label} must contain exactly one positive inflow or outflow.`,
      });
    }
  };

  for (const [index, transaction] of plan.additions.entries()) {
    verifyMoney(transaction, `Addition ${index + 1}`);
    const isTransfer = transaction.payee.startsWith("Transfer: ");
    if (isTransfer) {
      const destinationName = transaction.payee.slice("Transfer: ".length).trim();
      const destination = session.accounts.find((account) => account.name === destinationName);
      if (
        transaction.category !== "Transfer" ||
        transaction.categoryId !== undefined ||
        !destination ||
        destination.id === session.accountId ||
        transaction.transferAccountId !== destination.id
      ) {
        addIssue({
          code: "invalid-transfer",
          message: `Addition ${index + 1} has an invalid transfer destination or category.`,
        });
      }
      continue;
    }

    if (transaction.category === "Ready to Assign") {
      if (
        transaction.categoryId !== "__ready_to_assign__" ||
        transaction.inflow <= 0 ||
        transaction.outflow !== 0
      ) {
        addIssue({
          code: "invalid-category-reference",
          message: `Addition ${index + 1} uses Ready to Assign incorrectly.`,
        });
      }
    } else if (transaction.category !== "Uncategorised") {
      const byName = categoryByName.get(transaction.category.trim().toLocaleLowerCase());
      const byId = transaction.categoryId ? categoryById.get(transaction.categoryId) : undefined;
      if (!byName || !byId || byName.id !== byId.id) {
        addIssue({
          code: "invalid-category-reference",
          message: `Addition ${index + 1} references an unavailable or inconsistent category.`,
        });
      }
    }
  }

  const updateIds = new Set<string>();
  for (const transaction of plan.matchedTransactionUpdates) {
    verifyMoney(transaction, `Register update ${transaction.id}`);
    if (updateIds.has(transaction.id)) {
      addIssue({
        code: "duplicate-register-update",
        transactionId: transaction.id,
        message: `Register transaction ${transaction.id} is scheduled for update more than once.`,
      });
    }
    updateIds.add(transaction.id);
    if (!matchedRegisterIds.has(transaction.id)) {
      addIssue({
        code: "invalid-matched-candidate",
        transactionId: transaction.id,
        message: `Register update ${transaction.id} has no accepted matched candidate.`,
      });
    }

    if (
      transaction.category !== "Transfer" &&
      transaction.category !== "Split" &&
      transaction.category !== "Uncategorised" &&
      transaction.category !== "Ready to Assign"
    ) {
      const byName = categoryByName.get(
        transaction.category.trim().toLocaleLowerCase(),
      );
      const byId = transaction.categoryId
        ? categoryById.get(transaction.categoryId)
        : undefined;

      if (!byName || !byId || byName.id !== byId.id) {
        addIssue({
          code: "invalid-category-reference",
          transactionId: transaction.id,
          message: `Register update ${transaction.id} references an unavailable or inconsistent category.`,
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

function validateImportCommitSession(
  session: ImportCommitSession,
  plan: Pick<
    ImportCommitPlan,
    | "additions"
    | "matchedTransactionUpdates"
    | "provenanceAssignments"
    | "payeeCreations"
  >,
): void {
  const verification = verifyImportCommitPlan(session, plan);
  if (!verification.valid) {
    throw new ImportCommitValidationError(
      verification.issues.map((issue) => issue.message),
    );
  }
}

function buildImportProvenanceAssignments(
  session: ImportCommitSession,
  importedAt: string,
): RegisterTransactionImportProvenanceAssignment[] {
  const identityScope = session.file.fileHash?.trim();
  const importedCandidateIds = new Set(
    session.importedCandidates.map((candidate) => candidate.id),
  );
  const matchedCandidateIds = new Set(
    session.matchedCandidates.map((candidate) => candidate.id),
  );

  return session.completedSourceCandidates.map((candidate) => {
    const sourceIdentity = session.sourceIdentities[candidate.id];
    if (!sourceIdentity) {
      throw new ImportCommitValidationError([
        `Completed import candidate ${candidate.id} has no prepared source identity.`,
      ]);
    }

    let transactionId: string;

    if (importedCandidateIds.has(candidate.id)) {
      if (!identityScope) {
        throw new ImportCommitValidationError([
          `Imported candidate ${candidate.id} requires a source file hash.`,
        ]);
      }
      transactionId = stableImportTransactionId(candidate, identityScope);
    } else if (matchedCandidateIds.has(candidate.id)) {
      transactionId =
        candidate.matchedTransaction?.id ??
        candidate.matchedTransactionId ??
        "";

      if (!transactionId) {
        throw new ImportCommitValidationError([
          `Matched candidate ${candidate.id} has no destination transaction.`,
        ]);
      }
    } else {
      throw new ImportCommitValidationError([
        `Completed candidate ${candidate.id} is neither imported nor matched.`,
      ]);
    }

    return {
      transactionId,
      fileType: session.file.fileType,
      identity: sourceIdentity.identity,
      occurrence: sourceIdentity.occurrence,
      importedAt,
    };
  });
}

export function prepareImportCommit(
  session: ImportCommitSession,
  stages: TransactionImportPerformanceEntry[] = [],
): ImportCommitPlan {
  const identityScope = session.file.fileHash?.trim();

  if (session.importedCandidates.length > 0 && !identityScope) {
    throw new ImportCommitValidationError([
      "Imported transactions require a source file hash. Re-open the source file before committing.",
    ]);
  }

  const additions = measureStage(stages, "Build import payload", () =>
    buildRegisterTransactionsFromImport(session.importedCandidates, {
      includeMemos: session.includeMemos,
      categories: session.categories,
      accounts: session.accounts,
      identityScope,
    }),
  );
  const matchedTransactionUpdates = measureStage(
    stages,
    "Build matched updates",
    () => buildMatchedTransactionUpdates(session),
  );
  const provenanceAssignments = measureStage(
    stages,
    "Build import provenance",
    () => buildImportProvenanceAssignments(session, new Date().toISOString()),
  );
  const merchantKnowledge = measureStage(stages, "Stage merchant knowledge", () =>
    learnFromCommittedCandidates(session),
  );

  const plan = {
    additions,
    matchedTransactionUpdates,
    provenanceAssignments,
    payeeCreations: [] as RegisterTransactionImportPayeeCreation[],
    merchantKnowledge,
  };
  measureStage(stages, "Validate commit plan", () =>
    validateImportCommitSession(session, plan),
  );
  return plan;
}

function rememberAudit(audit: ImportCommitAuditRecord): void {
  recentImportCommitAudits.unshift(audit);
  recentImportCommitAudits.splice(20);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function commitImportSession(
  session: ImportCommitSession,
  adapters: ImportCommitAdapters,
): Promise<ImportCommitResult> {
  const startedAtDate = new Date();
  const startedAtMs = nowMs();
  const stages: TransactionImportPerformanceEntry[] = [];
  const sessionId = createSessionId(startedAtDate);
  let failedStage: string | null = null;
  let registerMutationStarted = false;
  const registerBatchUsed = Boolean(adapters.commitTransactionBatch);
  let registerRollbackAttempted = false;
  let registerRollbackSucceeded = false;
  let knowledgePersisted = false;
  let knowledgePersistenceError: string | null = null;
  let plan: ImportCommitPlan | null = null;

  try {
    failedStage = "Prepare import commit";
    plan = prepareImportCommit(session, stages);

    if (adapters.resolvePayee) {
      failedStage = "Resolve payees";
      const payeeCache = new Map<
        string,
        Promise<ImportPayeeResolution>
      >();
      const stagedPayeesById = new Map<
        string,
        RegisterTransactionImportPayeeCreation
      >();

      const resolveImportPayee = async (
        name: string,
      ): Promise<ImportPayeeResolution> => {
        const key = name.replace(/\s+/g, " ").trim().toLocaleLowerCase();
        const cached = payeeCache.get(key);
        if (cached) {
          return cached;
        }

        const pending = adapters.resolvePayee!(name);
        payeeCache.set(key, pending);

        try {
          const resolved = await pending;

          if (resolved.kind === "create") {
            stagedPayeesById.set(resolved.id, {
              id: resolved.id,
              name: resolved.name,
            });
          }

          return resolved;
        } catch (error) {
          payeeCache.delete(key);
          throw error;
        }
      };

      const resolvePayee: PayeeSubmissionResolver = async (name) => {
        const resolved = await resolveImportPayee(name);
        return {
          id: resolved.id,
          name: resolved.name,
        };
      };

      plan = await measureAsyncStage(stages, failedStage, async () => {
        const additions = await Promise.all(
          plan!.additions.map((transaction) =>
            resolvePayeeForSubmission(transaction, resolvePayee),
          ),
        );
        const matchedTransactionUpdates = await Promise.all(
          plan!.matchedTransactionUpdates.map((transaction) =>
            resolvePayeeForSubmission(transaction, resolvePayee),
          ),
        );

        return {
          ...plan!,
          additions,
          matchedTransactionUpdates,
          payeeCreations: [...stagedPayeesById.values()],
        };
      });

      failedStage = "Validate resolved commit plan";
      measureStage(stages, failedStage, () =>
        validateImportCommitSession(session, plan!),
      );
    }

    const requiresAtomicImportBatch =
      plan.provenanceAssignments.length > 0 ||
      plan.payeeCreations.length > 0;

    if (requiresAtomicImportBatch && !adapters.commitTransactionBatch) {
      throw new Error(
        "Import provenance or staged payee creation requires atomic register batch persistence.",
      );
    }

    if (
      plan.additions.length > 0 ||
      plan.matchedTransactionUpdates.length > 0 ||
      plan.provenanceAssignments.length > 0 ||
      plan.payeeCreations.length > 0
    ) {
      failedStage = adapters.commitTransactionBatch
        ? "Commit register batch"
        : "Commit register changes";
      registerMutationStarted = true;
      await measureAsyncStage(stages, failedStage, async () => {
        if (adapters.commitTransactionBatch) {
          await adapters.commitTransactionBatch(
            session.accountId,
            plan!.additions,
            plan!.matchedTransactionUpdates,
            plan!.provenanceAssignments,
            plan!.payeeCreations,
          );
          return;
        }

        if (plan!.additions.length > 0) {
          await adapters.addTransactions(session.accountId, plan!.additions);
        }
        if (plan!.matchedTransactionUpdates.length > 0) {
          await adapters.updateTransactions(
            session.accountId,
            plan!.matchedTransactionUpdates,
          );
        }
      });
    }

    if (plan.additions.length > 0 && adapters.verifyCommittedTransactions) {
      failedStage = "Verify committed register changes";
      await measureAsyncStage(stages, failedStage, () =>
        adapters.verifyCommittedTransactions!(session.accountId, plan!.additions),
      );
    }

    failedStage = "Remember import knowledge";
    try {
      measureStage(stages, failedStage, () => {
        rememberCommitKnowledge(
          session,
          plan!.additions.length,
          plan!.merchantKnowledge,
        );
        knowledgePersisted = true;
      });
    } catch (error) {
      knowledgePersistenceError = errorMessage(error);
      console.warn(
        "Transaction import committed successfully, but optional import knowledge could not be persisted.",
        error,
      );
    }

    failedStage = null;

    const completedAt = new Date();
    const audit: ImportCommitAuditRecord = {
      sessionId,
      budgetId:
        getActiveBudgetIdFromStorage(getActiveKeyValueStorage()) ??
        "unscoped",
      accountId: session.accountId,
      accountName: session.accountName,
      fileType: session.file.fileType,
      fileName: session.file.fileName ?? null,
      startedAt: startedAtDate.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: nowMs() - startedAtMs,
      importedCount: plan.additions.length,
      matchedCount: session.matchedCandidates.length,
      updatedMatchCount: plan.matchedTransactionUpdates.length,
      identityCount: session.completedSourceCandidates.length,
      skippedCount: session.skippedCount,
      previouslyImportedCount: session.previouslyImportedCount,
      alreadyRepresentedCount: session.alreadyRepresentedCount,
      status: "completed",
      failedStage: null,
      errorMessage: null,
      registerMutationStarted,
      registerBatchUsed,
      registerRollbackAttempted,
      registerRollbackSucceeded,
      knowledgePersisted,
      knowledgePersistenceError,
      stages: [...stages],
    };
    rememberAudit(audit);

    return {
      additions: plan.additions,
      matchedTransactionUpdates: plan.matchedTransactionUpdates,
      merchantKnowledge: plan.merchantKnowledge,
      audit,
    };
  } catch (error) {
    if (error instanceof RegisterTransactionBatchCommitError) {
      registerRollbackAttempted = error.rollbackAttempted;
      registerRollbackSucceeded = error.rollbackSucceeded;
    }
    const completedAt = new Date();
    const audit: ImportCommitAuditRecord = {
      sessionId,
      budgetId:
        getActiveBudgetIdFromStorage(getActiveKeyValueStorage()) ??
        "unscoped",
      accountId: session.accountId,
      accountName: session.accountName,
      fileType: session.file.fileType,
      fileName: session.file.fileName ?? null,
      startedAt: startedAtDate.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: nowMs() - startedAtMs,
      importedCount: plan?.additions.length ?? 0,
      matchedCount: session.matchedCandidates.length,
      updatedMatchCount: plan?.matchedTransactionUpdates.length ?? 0,
      identityCount: 0,
      skippedCount: session.skippedCount,
      previouslyImportedCount: session.previouslyImportedCount,
      alreadyRepresentedCount: session.alreadyRepresentedCount,
      status: "failed",
      failedStage,
      errorMessage: errorMessage(error),
      registerMutationStarted,
      registerBatchUsed,
      registerRollbackAttempted,
      registerRollbackSucceeded,
      knowledgePersisted,
      knowledgePersistenceError,
      stages: [...stages],
    };
    rememberAudit(audit);
    throw new ImportCommitExecutionError(
      `Import commit failed during ${failedStage ?? "an unknown stage"}: ${audit.errorMessage}`,
      audit,
      error,
    );
  }
}
