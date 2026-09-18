import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { confirmDialog } from "../../ui/appDialogService";
import { formatDateForDisplay } from "../../settings/dateFormatting";
import { useDateFormatPreference } from "../../settings/useDateFormatPreference";
import { useDeveloperPerformanceMode } from "../../settings/useDeveloperPerformanceMode";
import type { BudgetCategoryOption } from "../../budget/budgetViewTypes";
import { PayeeInput } from "./PayeeInput";
import {
  RegisterCategoryInput,
  type RegisterInlineCategoryCreateInput,
} from "./RegisterCategoryInput";
import { RegisterSplitEditor } from "./RegisterSplitEditor";
import type { PayeeView } from "../payeeService";
import { createRuntimeUuid } from "../../ids/createRuntimeUuid";
import type { SidebarAccount } from "../accountService";
import {
  commitImportSession,
  ImportCommitExecutionError,
  type ImportPayeeResolution,
} from "../importCommitEngine";
import type {
  NewRegisterTransactionInput,
  RegisterTransactionView,
  ScheduledAttachmentTemplate,
} from "../accountRegisterTypes";
import type {
  RegisterTransactionImportPayeeCreation,
  RegisterTransactionImportProvenanceAssignment,
} from "../../persistence/accountRegisterQueryContracts";
import {
  analyseTransactionCsvImport,
  createTransactionImportPerformanceReport,
  createTransactionPayeeAlias,
  detectQifImportFormat,
  inspectTransactionOfxImport,
  QIF_DATE_FORMAT_OPTIONS,
  previewTransactionCsvImport,
  previewTransactionQifImport,
  previewTransactionOfxImport,
  parseTransactionCsv,
  parseTransactionQif,
  parseTransactionOfx,
  readTransactionPayeeAliases,
  formatImportDuration,
  getCsvImportSignature,
  suggestTransactionPayeeAliases,
  upsertTransactionPayeeAlias,
  writeTransactionPayeeAliases,
  type CsvImportAnalysis,
  type CsvImportColumnMapping,
  type CsvImportColumnRole,
  type TransactionImportCandidate,
  type TransactionImportPerformanceEntry,
  type TransactionImportPerformanceReport,
  type TransactionImportPreview,
  type TransactionPayeeAliasSuggestion,
  type QifAmountFormat,
  type QifDateFormat,
  type QifImportDetection,
  type OfxImportInspection,
} from "../transactionImport";
import {
  buildMerchantKnowledgeFromTransactions,
  readMerchantKnowledge,
  writeMerchantKnowledge,
  type MerchantKnowledgeStore,
} from "../merchantKnowledge";
import { acceptMerchantAlias } from "../merchantKnowledgeService";
import {
  getCandidateProposalTransaction,
  prepareTransactionImportPreview,
} from "../transactionImportPreviewPreparation";
import {
  buildTransactionImportMerchantProposal,
  resolveTransactionImportMerchant,
} from "../transactionImportMerchantProposal";
import {
  readTransactionImportPreferences,
  writeTransactionImportPreferences,
} from "../transactionImportPreferences";
import {
  deleteTransactionImportSession,
  readTransactionImportSession,
  writeTransactionImportSession,
} from "../transactionImportSession";
import {
  getAvailableRegisterMatchCandidates,
  getConflictingRegisterMatchOwner,
  getEligibleManualRegisterMatches,
  getRegisterMatchOwnership,
  MANUAL_IMPORT_MATCH_REASON,
  repairRestoredRegisterMatchOwnership,
  restoreOwnedRegisterMatch,
  selectOwnedRegisterMatch,
  selectManualOwnedRegisterMatch,
} from "../transactionImportReviewOwnership";
import { getTransactionImportReviewPresentation } from "../transactionImportReviewPresentation";
import { applySourceMemoPreferenceToCandidate } from "../transactionImportReviewMemo";
import {
  appendTransactionImportTrace,
  serialiseTransactionImportTrace,
} from "../transactionImportTrace";
import {
  createImportDiagnosticSessionRecord,
  recordImportDiagnosticSession,
  type ImportDiagnosticCandidateOutcome,
} from "../transactionImportDiagnostics";
import {
  createImportFileHash,
  createQifStructureSignature,
  findAccountImportKnowledge,
  findImportedFileFingerprint,
  rememberAccountImportKnowledge,
  partitionPreviouslyImportedCandidates,
  projectPreviouslyImportedSourceOccurrences,
  type ImportedTransactionFileType,
  type TransactionImportSourceIdentity,
} from "../transactionImportKnowledge";
import { calculateTransactionImportBalancePreview } from "../transactionImportBalancePreview";
import {
  loadTransactionImportEvidence,
  type TransactionImportEvidenceDateRange,
} from "../transactionImportEvidence";
import { resolvePayeeRecognition } from "../payeeRecognition";
import {
  findHistoricalRegisterPayeeMatches,
  getImportRawPayeeIdentity,
  isTransferTransaction,
  markImportReviewFieldEdited,
  propagateImportReviewField,
  type HistoricalRegisterPayeeUpdate,
  type ImportReviewManualEdits,
  type ImportReviewPropagationField,
} from "../transactionImportReviewPropagation";
import {
  capturePreparedTransactionImportCandidates,
  hasTransactionImportCandidateChanges,
  resetTransactionImportCandidate,
  type TransactionImportPreparedCandidates,
} from "../transactionImportReviewReset";
import {
  summariseTransactionImportOutcomes,
  verifyPersistedImportTransactions,
} from "../transactionImportVerification";
import { calculateAttachmentContentHash } from "../../attachments/attachmentContentStore";
import type { TransactionTagDefinition } from "../../tags/transactionTagTypes";
import {
  buildSplitLines,
  createSplitLineDraft,
  hasIncompleteSplitDrafts,
  isSplitBalanced,
  isSplitDraftBalanced,
  splitDraftsFromTransaction,
  type SplitLineDraft,
} from "../registerSplitDrafts";

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

function encodeImportAttachment(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

type TransactionImportStep = "upload" | "mapping" | "review" | "complete";
type TransactionImportFileType =
  "csv" | "qif" | "ofx" | "qfx" | "json" | "unknown";

type ProcessedImportAction = "imported" | "matched" | "skipped";

interface TransactionImportEditDraft {
  candidateId: string;
  payee: string;
  category: string;
  memo: string;
  tagIds: string[];
  attachments: ScheduledAttachmentTemplate[];
}

interface TransactionImportSplitEdit {
  candidateId: string;
  target: "proposal" | "matched";
  splitLines: SplitLineDraft[];
}

const IMPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const IMPORT_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const IMPORT_SPLIT_VISIBLE_COLUMN_IDS = [
  "category",
  "memo",
  "outflow",
  "inflow",
] as const;

interface ProcessedImportCandidate {
  candidate: TransactionImportCandidate;
  action: ProcessedImportAction;
  processedAt: number;
}

const CSV_IMPORT_ROLE_OPTIONS: { value: CsvImportColumnRole; label: string }[] =
  [
    { value: "ignore", label: "Ignore" },
    { value: "date", label: "Date" },
    { value: "payee", label: "Payee / Description" },
    { value: "payeeFallback", label: "Payee fallback" },
    { value: "memo", label: "Memo" },
    { value: "amount", label: "Amount (+/-)" },
    { value: "outflow", label: "Outflow / Debit" },
    { value: "inflow", label: "Inflow / Credit" },
    { value: "balance", label: "Balance" },
  ];

function detectImportFileType(fileName: string): TransactionImportFileType {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".csv")) return "csv";
  if (lowerName.endsWith(".qif")) return "qif";
  if (lowerName.endsWith(".ofx")) return "ofx";
  if (lowerName.endsWith(".qfx")) return "qfx";
  if (lowerName.endsWith(".json")) return "json";
  return "unknown";
}

function getFileTypeLabel(fileType: TransactionImportFileType) {
  switch (fileType) {
    case "csv":
      return "CSV";
    case "qif":
      return "QIF";
    case "ofx":
      return "OFX";
    case "qfx":
      return "QFX";
    case "json":
      return "JSON";
    default:
      return "Unknown";
  }
}

function hasRequiredCsvMapping(mapping: CsvImportColumnMapping) {
  const roles = Object.values(mapping);
  const hasAmount =
    roles.includes("amount") ||
    roles.includes("outflow") ||
    roles.includes("inflow");

  return roles.includes("date") && roles.includes("payee") && hasAmount;
}

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function measureImportStage<T>(
  entries: TransactionImportPerformanceEntry[],
  label: string,
  action: () => T,
): T {
  const startedAt = nowMs();

  try {
    return action();
  } finally {
    entries.push({ label, durationMs: nowMs() - startedAt });
  }
}

function sortImportCandidates(candidates: TransactionImportCandidate[]) {
  const priority: Record<TransactionImportCandidate["status"], number> = {
    "exact-match": 0,
    invalid: 1,
    new: 2,
  };

  return [...candidates].sort(
    (left, right) => priority[left.status] - priority[right.status],
  );
}


function canImportReviewedCandidate(
  candidate: TransactionImportCandidate,
  availableTransferAccountNames: string[],
) {
  const proposed = getCandidateProposalTransaction(candidate);
  const hasDate = Boolean(proposed.date);
  const hasPayee = Boolean(proposed.payee.trim());
  const hasAmount = proposed.inflow > 0 || proposed.outflow > 0;
  const transferAccountName = proposed.transferAccountName?.trim();
  const hasValidTransfer =
    !transferAccountName ||
    availableTransferAccountNames.includes(transferAccountName);
  const splitLines = candidate.lifecycle.proposal.splitLines ?? [];
  const declaresSplit =
    candidate.lifecycle.proposal.categoryName === "Split";
  const hasSplitLines = splitLines.length > 0;
  const hasValidSplit =
    !declaresSplit && !hasSplitLines
      ? true
      : declaresSplit &&
        hasSplitLines &&
        !transferAccountName &&
        splitLines.length >= 2 &&
      splitLines.every(
        (line) =>
          Boolean(line.id.trim()) &&
          Boolean(line.category.trim()) &&
          line.category !== "Split" &&
          Number.isFinite(line.inflow) &&
          Number.isFinite(line.outflow) &&
          line.inflow >= 0 &&
          line.outflow >= 0 &&
          ((line.inflow > 0 && line.outflow === 0) ||
            (line.outflow > 0 && line.inflow === 0)),
      ) &&
        isSplitBalanced(
          proposed.outflow,
          proposed.inflow,
          splitLines,
        );

  return (
    hasDate &&
    hasPayee &&
    hasAmount &&
    hasValidTransfer &&
    hasValidSplit
  );
}

async function measureAsyncImportStage<T>(
  entries: TransactionImportPerformanceEntry[],
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = nowMs();

  try {
    return await action();
  } finally {
    entries.push({ label, durationMs: nowMs() - startedAt });
  }
}

export function TransactionImportDialog({
  initialAccountId,
  accounts,
  currencyCode,
  onClose,
  loadAccountTransactions,
  loadTransactionsByIds,
  loadImportedTransactionSourceOccurrences,
  loadAccountWorkingBalance,
  onCommitRegisterChanges,
  onImportCommitComplete,
  payeeOptions,
  categoryOptions,
  transactionTags,
  transferAccounts,
  onCreateCategory,
  onLearnPayeeAliases,
}: {
  initialAccountId: string;
  accounts: { id: string; name: string }[];
  currencyCode: string;
  onClose: () => void;
  loadAccountTransactions: (
    accountId: string,
    dateRange?: TransactionImportEvidenceDateRange,
  ) => Promise<RegisterTransactionView[]>;
  loadTransactionsByIds: (
    accountId: string,
    transactionIds: readonly string[],
  ) => Promise<RegisterTransactionView[]>;
  loadImportedTransactionSourceOccurrences: (
    accountId: string,
    fileType: ImportedTransactionFileType,
  ) => Promise<Readonly<Record<string, number>>>;
  loadAccountWorkingBalance: (accountId: string) => Promise<number>;
  onCommitRegisterChanges: (
    accountId: string,
    additions: NewRegisterTransactionInput[],
    updates: RegisterTransactionView[],
    provenanceAssignments: readonly RegisterTransactionImportProvenanceAssignment[],
    payeeCreations: readonly RegisterTransactionImportPayeeCreation[],
  ) => Promise<void>;
  onImportCommitComplete?: (input: {
    accountId: string;
    importedTransactionIds: string[];
    matchedTransactionIds: string[];
  }) => void;
  payeeOptions: PayeeView[];
  categoryOptions: BudgetCategoryOption[];
  transactionTags: TransactionTagDefinition[];
  transferAccounts: SidebarAccount[];
  onCreateCategory?: (
    input: RegisterInlineCategoryCreateInput,
  ) => Promise<BudgetCategoryOption>;
  onLearnPayeeAliases: (
    learnings: readonly { payeeId: string; rawPayee: string }[],
  ) => Promise<number>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dateFormat = useDateFormatPreference();
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccountId);
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
  const accountName = selectedAccount?.name ?? "Selected account";
  const transferAccountNames = accounts
    .filter((account) => account.id !== selectedAccountId)
    .map((account) => account.name);
  const [transactions, setTransactions] = useState<RegisterTransactionView[]>(
    [],
  );
  const [startingWorkingBalance, setStartingWorkingBalance] = useState<number | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [duplicateFileMessage, setDuplicateFileMessage] = useState<
    string | null
  >(null);
  const [previouslyImportedCount, setPreviouslyImportedCount] = useState(0);
  const [alreadyRepresentedCount, setAlreadyRepresentedCount] = useState(0);
  const [step, setStep] = useState<TransactionImportStep>("upload");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [qifText, setQifText] = useState<string | null>(null);
  const [ofxText, setOfxText] = useState<string | null>(null);
  const [ofxInspection, setOfxInspection] =
    useState<OfxImportInspection | null>(null);
  const [qifDetection, setQifDetection] = useState<QifImportDetection | null>(
    null,
  );
  const [qifDateFormat, setQifDateFormat] = useState<QifDateFormat>("DD/MM/YY");
  const [qifAmountFormat, setQifAmountFormat] =
    useState<QifAmountFormat>("decimal-dot");
  const [qifDateInterpretationResolved, setQifDateInterpretationResolved] =
    useState(true);
  const [qifAmountInterpretationResolved, setQifAmountInterpretationResolved] =
    useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] =
    useState<TransactionImportFileType>("unknown");
  const [analysis, setAnalysis] = useState<CsvImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<CsvImportColumnMapping>({});
  const [payeeAliases, setPayeeAliases] = useState(() =>
    readTransactionPayeeAliases(),
  );
  const [preview, setPreview] = useState<TransactionImportPreview | null>(null);
  const [candidates, setCandidates] = useState<TransactionImportCandidate[]>(
    [],
  );
  const [preparedCandidates, setPreparedCandidates] =
    useState<TransactionImportPreparedCandidates>({});
  const [bankCandidateDetails, setBankCandidateDetails] = useState<
    Record<string, TransactionImportCandidate["parsed"]>
  >({});
  const [sourceIdentities, setSourceIdentities] = useState<
    Record<string, TransactionImportSourceIdentity>
  >({});
  const [processedCandidates, setProcessedCandidates] = useState<
    ProcessedImportCandidate[]
  >([]);
  const [manualCandidateEdits, setManualCandidateEdits] =
    useState<ImportReviewManualEdits>({});
  const [historicalRegisterPayeeUpdates, setHistoricalRegisterPayeeUpdates] =
    useState<HistoricalRegisterPayeeUpdate[]>([]);
  const [matchEditorOrigins, setMatchEditorOrigins] = useState<
    Record<string, TransactionImportCandidate>
  >({});
  const [matchedTransactionOrigins, setMatchedTransactionOrigins] = useState<
    Record<string, RegisterTransactionView>
  >({});
  const [transactionEditDraft, setTransactionEditDraft] =
    useState<TransactionImportEditDraft | null>(null);
  const [transactionEditAttachmentBusy, setTransactionEditAttachmentBusy] =
    useState(false);
  const [transactionEditError, setTransactionEditError] =
    useState<string | null>(null);
  const [splitEdit, setSplitEdit] =
    useState<TransactionImportSplitEdit | null>(null);
  const [weakMatchReviewCandidateId, setWeakMatchReviewCandidateId] =
    useState<string | null>(null);
  const [manualMatchTransactions, setManualMatchTransactions] = useState<
    RegisterTransactionView[] | null
  >(null);
  const [manualMatchSearch, setManualMatchSearch] = useState("");
  const [manualMatchLoading, setManualMatchLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoredCandidateId, setRestoredCandidateId] = useState<string | null>(null);
  const [processingCandidate, setProcessingCandidate] = useState<{
    id: string;
    action: ProcessedImportAction;
  } | null>(null);
  const processingCandidateRef = useRef<string | null>(null);
  const historicalPayeeOfferRef = useRef<Set<string>>(new Set());
  const [historyPulse, setHistoryPulse] = useState(false);
  const [aliasSuggestions, setAliasSuggestions] = useState<
    TransactionPayeeAliasSuggestion[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisStageIndex, setAnalysisStageIndex] = useState(0);
  const [initialImportPreferences] = useState(readTransactionImportPreferences);
  const [excludeMemos, setExcludeMemos] = useState(
    initialImportPreferences.excludeMemos,
  );
  const [updateMatchedTransactionDates, setUpdateMatchedTransactionDates] =
    useState(initialImportPreferences.updateMatchedTransactionDates);
  const [performanceReport, setPerformanceReport] =
    useState<TransactionImportPerformanceReport | null>(null);
  const [merchantKnowledge, setMerchantKnowledge] = useState<MerchantKnowledgeStore>(() =>
    readMerchantKnowledge(),
  );
  const merchantKnowledgeRef = useRef(merchantKnowledge);
  const merchantKnowledgeBootstrapRef = useRef<Promise<MerchantKnowledgeStore>>(
    Promise.resolve(merchantKnowledge),
  );
  const developerPerformanceMode = useDeveloperPerformanceMode();
  const importSessionRestoreRef = useRef<string | null>(null);
  const importSessionSaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (importSessionRestoreRef.current === selectedAccountId) return;
    importSessionRestoreRef.current = selectedAccountId;
    const saved = readTransactionImportSession(selectedAccountId);
    if (!saved) return;
    const repairedReview = repairRestoredRegisterMatchOwnership(saved);

    setFileName(saved.fileName);
    setFileType(saved.fileType);
    setFileHash(saved.fileHash);
    setCsvText(saved.csvText);
    setQifText(saved.qifText);
    setOfxText(saved.ofxText);
    setOfxInspection(saved.ofxInspection);
    setQifDetection(saved.qifDetection);
    setQifDateFormat(saved.qifDateFormat);
    setQifAmountFormat(saved.qifAmountFormat);
    setAnalysis(saved.analysis);
    setMapping(saved.mapping);
    setPreview(saved.preview);
    setCandidates(repairedReview.candidates);
    setPreparedCandidates(
      saved.preparedCandidates ??
        capturePreparedTransactionImportCandidates(repairedReview.candidates),
    );
    setBankCandidateDetails(saved.bankCandidateDetails);
    setSourceIdentities(saved.sourceIdentities);
    setProcessedCandidates(repairedReview.processedCandidates);
    setManualCandidateEdits(saved.manualCandidateEdits ?? {});
    setHistoricalRegisterPayeeUpdates(
      saved.historicalRegisterPayeeUpdates ?? [],
    );
    setMatchEditorOrigins(saved.matchEditorOrigins);
    setMatchedTransactionOrigins(saved.matchedTransactionOrigins);
    setPreviouslyImportedCount(saved.previouslyImportedCount);
    setAlreadyRepresentedCount(saved.alreadyRepresentedCount);
    setExcludeMemos(saved.excludeMemos);
    setUpdateMatchedTransactionDates(saved.updateMatchedTransactionDates);
    setStep("review");
    setMessage(repairedReview.repairedConflictCount > 0
      ? "Restored the saved review. Conflicting saved matches were returned to review."
      : `Restored your saved review for ${saved.fileName ?? "this import"}.`);
  }, [selectedAccountId]);

  useEffect(() => {
    if (step !== "review" || !preview || !["csv", "qif", "ofx", "qfx"].includes(fileType)) {
      return;
    }
    if (importSessionSaveTimerRef.current !== null) {
      window.clearTimeout(importSessionSaveTimerRef.current);
    }
    importSessionSaveTimerRef.current = window.setTimeout(() => {
      writeTransactionImportSession({
        version: 2,
        accountId: selectedAccountId,
        savedAt: new Date().toISOString(),
        fileName,
        fileType: fileType as "csv" | "qif" | "ofx" | "qfx",
        fileHash,
        csvText,
        qifText,
        ofxText,
        ofxInspection,
        qifDetection,
        qifDateFormat,
        qifAmountFormat,
        analysis,
        mapping,
        preview,
        candidates,
        preparedCandidates,
        bankCandidateDetails,
        sourceIdentities,
        processedCandidates,
        matchEditorOrigins,
        matchedTransactionOrigins,
        previouslyImportedCount,
        alreadyRepresentedCount,
        excludeMemos,
        updateMatchedTransactionDates,
        manualCandidateEdits,
        historicalRegisterPayeeUpdates,
      });
    }, 250);
    return () => {
      if (importSessionSaveTimerRef.current !== null) {
        window.clearTimeout(importSessionSaveTimerRef.current);
        importSessionSaveTimerRef.current = null;
      }
    };
  }, [
    step, preview, fileType, selectedAccountId, fileName, fileHash, csvText,
    qifText, ofxText, ofxInspection, qifDetection, qifDateFormat,
    qifAmountFormat, analysis, mapping, candidates, preparedCandidates, bankCandidateDetails,
    sourceIdentities, processedCandidates, matchEditorOrigins,
    matchedTransactionOrigins,
    previouslyImportedCount, alreadyRepresentedCount, excludeMemos,
    updateMatchedTransactionDates, manualCandidateEdits,
    historicalRegisterPayeeUpdates,
  ]);

  useEffect(() => {
    let active = true;
    setStartingWorkingBalance(null);
    void Promise.all([
      loadAccountTransactions(selectedAccountId),
      loadAccountWorkingBalance(selectedAccountId),
    ]).then(([nextTransactions, workingBalance]) => {
      if (!active) return;
      setTransactions(nextTransactions);
      setStartingWorkingBalance(workingBalance);
    });
    return () => {
      active = false;
    };
  }, [loadAccountTransactions, loadAccountWorkingBalance, selectedAccountId]);

  useEffect(() => {
    let active = true;
    const bootstrap = Promise.all(
      accounts.map(async (account) => ({
        accountId: account.id,
        transactions: await loadAccountTransactions(account.id),
      })),
    ).then((accountRegisters) => {
      const rebuilt = buildMerchantKnowledgeFromTransactions({
        seedStore: readMerchantKnowledge(),
        observations: accountRegisters.flatMap(({ accountId, transactions }) =>
          transactions.map((transaction) => ({
            accountId,
            date: transaction.date,
            payee: transaction.payee,
            categoryId: transaction.categoryId,
            categoryName: transaction.category,
            transferAccountId: transaction.transferAccountId,
            transferAccountName: accounts.find(
              (account) => account.id === transaction.transferAccountId,
            )?.name,
          })),
        ),
      });
      if (active) {
        merchantKnowledgeRef.current = rebuilt;
        writeMerchantKnowledge(rebuilt);
        setMerchantKnowledge(rebuilt);
      }
      return rebuilt;
    });
    merchantKnowledgeBootstrapRef.current = bootstrap;
    return () => {
      active = false;
    };
  }, [accounts, loadAccountTransactions]);

  useEffect(() => {
    if (!restoredCandidateId) return;

    const frame = window.requestAnimationFrame(() => {
      const restoredCard = document.querySelector<HTMLElement>(
        `[data-import-candidate-id="${restoredCandidateId}"]`,
      );
      restoredCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      restoredCard?.focus({ preventScroll: true });
      setRestoredCandidateId(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [restoredCandidateId, candidates]);

  useEffect(() => {
    if (!isAnalysing) {
      setAnalysisStageIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setAnalysisStageIndex((current) => (current + 1) % 4);
    }, 650);
    return () => window.clearInterval(interval);
  }, [isAnalysing]);

  const uniqueProcessedCandidates = Array.from(
    new Map(
      processedCandidates.map((entry) => [entry.candidate.id, entry] as const),
    ).values(),
  );
  const importedCandidates = uniqueProcessedCandidates
    .filter((entry) => entry.action === "imported")
    .map((entry) => entry.candidate);
  const matchedCandidates = uniqueProcessedCandidates
    .filter((entry) => entry.action === "matched")
    .map((entry) => entry.candidate);
  const registerMatchOwnership = getRegisterMatchOwnership({
    candidates,
    processedCandidates: uniqueProcessedCandidates,
  });
  const selectedCount = importedCandidates.length;
  const processedCount = uniqueProcessedCandidates.length;
  const balancePreview = startingWorkingBalance === null
    ? null
    : calculateTransactionImportBalancePreview(startingWorkingBalance, uniqueProcessedCandidates);
  const acceptedBalanceChange = balancePreview?.acceptedChange ?? 0;
  const projectedWorkingBalance = balancePreview?.projectedWorkingBalance ?? null;

  function resetImportState() {
    deleteTransactionImportSession(selectedAccountId);
    setStep("upload");
    setError(null);
    setMessage(null);
    setPerformanceReport(null);
    setPreview(null);
    setCandidates([]);
    setPreparedCandidates({});
    setBankCandidateDetails({});
    setSourceIdentities({});
    setProcessedCandidates([]);
    setManualCandidateEdits({});
    setHistoricalRegisterPayeeUpdates([]);
    historicalPayeeOfferRef.current.clear();
    setMatchedTransactionOrigins({});
    setHistoryOpen(false);
    setProcessingCandidate(null);
    setHistoryPulse(false);
    setAliasSuggestions([]);
    setAnalysis(null);
    setMapping({});
    setFileHash(null);
    setDuplicateFileMessage(null);
    setPreviouslyImportedCount(0);
    setAlreadyRepresentedCount(0);
    setCsvText(null);
    setQifText(null);
    setOfxText(null);
    setOfxInspection(null);
    setQifDetection(null);
    setQifDateFormat("DD/MM/YY");
    setQifAmountFormat("decimal-dot");
    setQifDateInterpretationResolved(true);
    setQifAmountInterpretationResolved(true);
    setFileName(null);
    setFileType("unknown");
    setExcludeMemos(false);
    setIsAnalysing(false);
  }

  function resolveMerchantForMatching(rawPayee: string) {
    const recognition = resolvePayeeRecognition(rawPayee, payeeOptions);
    if (recognition.match) {
      const payee = recognition.match.payee;
      return {
        canonicalPayee: payee.name,
        canonicalPayeeId: payee.id,
        suggestedCategoryName:
          recognition.match.rule?.defaultCategoryName ?? payee.defaultCategoryName ?? null,
        transferAccountName: null,
        recognitionProvenance: recognition.match.source === "rule"
          ? "explicit-rule" as const
          : "exact-alias" as const,
        recognitionReason: recognition.match.source === "rule"
          ? `Explicit ${recognition.match.rule?.matchType ?? "payee"} recognition rule`
          : "Exact learned alias or canonical payee",
      };
    }
    // Ambiguous deterministic rules deliberately fall through to review rather
    // than silently selecting one canonical payee.
    return resolveTransactionImportMerchant(
      merchantKnowledgeRef.current,
      rawPayee,
    );
  }

  async function applyPreview(
    nextPreview: TransactionImportPreview,
    existingTransactions: RegisterTransactionView[],
    nextMessage: string,
    sourceFileType: ImportedTransactionFileType,
    accountId = selectedAccountId,
    sourceFileHash: string | null = fileHash,
  ) {
    const importedOccurrenceCounts =
      await loadImportedTransactionSourceOccurrences(
        accountId,
        sourceFileType,
      );

    const partition = partitionPreviouslyImportedCandidates({
      fileType: sourceFileType,
      candidates: nextPreview.candidates,
      importedOccurrenceCounts,
    });

    const previouslyImportedSourceOccurrences =
      projectPreviouslyImportedSourceOccurrences({
        candidates: partition.activeCandidates,
        sourceIdentities: partition.sourceIdentities,
        importedOccurrenceCounts,
      });
    const prepared = prepareTransactionImportPreview({
      partition,
      existingTransactions,
      previouslyImportedSourceOccurrences,
      isExactDuplicateFile: Boolean(
        sourceFileHash &&
          findImportedFileFingerprint(accountId, sourceFileHash),
      ),
      identityScope: sourceFileHash,
      includeSourceMemos: !excludeMemos,
    });

    setBankCandidateDetails(prepared.bankCandidateDetails);
    setSourceIdentities(prepared.sourceIdentities);
    setPreview(prepared.preview);
    const sortedCandidates = sortImportCandidates(prepared.reviewCandidates);
    setCandidates(sortedCandidates);
    setPreparedCandidates(
      capturePreparedTransactionImportCandidates(sortedCandidates),
    );
    setPreviouslyImportedCount(prepared.previouslyImportedCount);
    setAlreadyRepresentedCount(prepared.alreadyRepresentedCount);
    setProcessedCandidates([]);
    setManualCandidateEdits({});
    setHistoricalRegisterPayeeUpdates([]);
    historicalPayeeOfferRef.current.clear();
    setHistoryOpen(false);
    setAliasSuggestions(
      suggestTransactionPayeeAliases({
        candidates: prepared.reviewCandidates,
        existingTransactions,
        aliases: payeeAliases,
      }),
    );
    setError(null);
    setMessage(
      prepared.totalExistingCount > 0
        ? `${nextMessage} ${prepared.totalExistingCount} transaction${
            prepared.totalExistingCount === 1 ? " is" : "s are"
          } already in your budget. ${prepared.reviewCandidates.length} need${
            prepared.reviewCandidates.length === 1 ? "s" : ""
          } review.`
        : nextMessage,
    );
    setStep("review");
  }

  async function changeDestinationAccount(accountId: string) {
    const nextAccount =
      accounts.find((account) => account.id === accountId) ?? accounts[0];
    const nextAccountName = nextAccount?.name ?? "Selected account";
    const nextTransactions = await loadAccountTransactions(accountId);

    setSelectedAccountId(accountId);
    setTransactions(nextTransactions);
    setPreview(null);
    setCandidates([]);
    setPreparedCandidates({});
    setBankCandidateDetails({});
    setSourceIdentities({});
    setProcessedCandidates([]);
    setManualCandidateEdits({});
    setHistoricalRegisterPayeeUpdates([]);
    historicalPayeeOfferRef.current.clear();
    setHistoryOpen(false);
    setAliasSuggestions([]);
    setDuplicateFileMessage(
      fileHash
        ? (() => {
            const priorImport = findImportedFileFingerprint(
              accountId,
              fileHash,
            );
            return priorImport
              ? `This exact file was previously imported into ${nextAccountName} on ${new Date(priorImport.importedAt).toLocaleDateString()}.`
              : null;
          })()
        : null,
    );

    if (!fileName) return;

    if (fileType === "qif" && qifText && qifDetection) {
      const knowledge = findAccountImportKnowledge({
        accountId,
        fileType: "qif",
        structureSignature: createQifStructureSignature(qifText),
      });
      const nextDateFormat =
        (qifDetection.dateFormatNeedsConfirmation &&
          knowledge?.qifDateFormat) ||
        qifDetection.dateFormat;
      const nextAmountFormat =
        (qifDetection.amountFormatNeedsConfirmation &&
          knowledge?.qifAmountFormat) ||
        qifDetection.amountFormat;
      setQifDateFormat(nextDateFormat);
      setQifAmountFormat(nextAmountFormat);
      setQifDateInterpretationResolved(
        !qifDetection.dateFormatNeedsConfirmation ||
          Boolean(knowledge?.qifDateFormat),
      );
      setQifAmountInterpretationResolved(
        !qifDetection.amountFormatNeedsConfirmation ||
          Boolean(knowledge?.qifAmountFormat),
      );
      const parsedTransactions = parseTransactionQif(qifText, {
        dateFormat: nextDateFormat,
        amountFormat: nextAmountFormat,
      });
      const evidenceTransactions = await loadTransactionImportEvidence(
        accountId,
        parsedTransactions,
        loadAccountTransactions,
      );

      const nextPreview = previewTransactionQifImport(
        qifText,
        evidenceTransactions,
        {
          sourceAccountName: nextAccountName,
          availableTransferAccountNames: accounts
            .filter((account) => account.id !== accountId)
            .map((account) => account.name),
          dateFormat: nextDateFormat,
          amountFormat: nextAmountFormat,
        },
        resolveMerchantForMatching,
      );
      await applyPreview(
        nextPreview,
        evidenceTransactions,
        `${nextPreview.summary.totalRows} QIF transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
        "qif",
        accountId,
      );
      return;
    }

    if ((fileType === "ofx" || fileType === "qfx") && ofxText) {
      const parsedTransactions = parseTransactionOfx(ofxText);
      const evidenceTransactions = await loadTransactionImportEvidence(
        accountId,
        parsedTransactions,
        loadAccountTransactions,
      );

      const nextPreview = previewTransactionOfxImport(
        ofxText,
        evidenceTransactions,
        resolveMerchantForMatching,
      );
      await applyPreview(
        nextPreview,
        evidenceTransactions,
        `${nextPreview.summary.totalRows} ${getFileTypeLabel(fileType)} transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
        fileType,
        accountId,
      );
      return;
    }

    if (fileType === "csv" && csvText && analysis) {
      const knowledge = findAccountImportKnowledge({
        accountId,
        fileType: "csv",
        structureSignature: getCsvImportSignature(analysis),
      });
      const nextMapping = knowledge?.csvMapping ?? analysis.suggestedMapping;
      setMapping(nextMapping);
      if (hasRequiredCsvMapping(nextMapping)) {
        const parsedTransactions = parseTransactionCsv(
          csvText,
          nextMapping,
        );
        const evidenceTransactions = await loadTransactionImportEvidence(
          accountId,
          parsedTransactions,
          loadAccountTransactions,
        );

        const nextPreview = previewTransactionCsvImport(
          csvText,
          evidenceTransactions,
          nextMapping,
          resolveMerchantForMatching,
        );
        await applyPreview(
          nextPreview,
          evidenceTransactions,
          `${nextPreview.summary.totalRows} CSV transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
          "csv",
          accountId,
        );
      } else {
        setStep("mapping");
        setMessage(
          "Map the missing CSV columns before reviewing transactions.",
        );
      }
    }
  }

  async function readFile(file: File) {
    resetImportState();
    setIsAnalysing(true);
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
    const [bootstrappedKnowledge, currentTransactions] = await Promise.all([
      merchantKnowledgeBootstrapRef.current,
      loadAccountTransactions(selectedAccountId),
    ]);
    merchantKnowledgeRef.current = bootstrappedKnowledge;
    setTransactions(currentTransactions);
    const timings: TransactionImportPerformanceEntry[] = [];

    try {
      const detectedType = measureImportStage(timings, "Detect file type", () =>
        detectImportFileType(file.name),
      );
    setFileName(file.name);
    setFileType(detectedType);

    if (!["csv", "qif", "ofx", "qfx"].includes(detectedType)) {
      setError(
        detectedType === "unknown"
          ? "This file type could not be detected. Choose a CSV, QIF, OFX, or QFX transaction file."
          : `${getFileTypeLabel(detectedType)} import is not available in this transaction wizard.`,
      );
      setPerformanceReport(createTransactionImportPerformanceReport(timings));
      return;
    }

      const text = await measureAsyncImportStage(
        timings,
        "Read file text",
        () => file.text(),
    );
    const nextFileHash = createImportFileHash(text);
    setFileHash(nextFileHash);
    const priorImport = findImportedFileFingerprint(
      selectedAccountId,
      nextFileHash,
    );
    setDuplicateFileMessage(
      priorImport
        ? `This exact file was previously imported into ${accountName} on ${new Date(priorImport.importedAt).toLocaleDateString()}.`
        : null,
    );

    if (detectedType === "qif") {
      const detection = measureImportStage(timings, "Detect QIF format", () =>
        detectQifImportFormat(text, { preferredDateFormat: dateFormat }),
      );
      const qifSignature = createQifStructureSignature(text);
      const knowledge = findAccountImportKnowledge({
        accountId: selectedAccountId,
        fileType: "qif",
        structureSignature: qifSignature,
      });
      const useKnownDate =
        detection.dateFormatNeedsConfirmation && knowledge?.qifDateFormat;
      const useKnownAmount =
        detection.amountFormatNeedsConfirmation && knowledge?.qifAmountFormat;
      const nextDateFormat = useKnownDate || detection.dateFormat;
      const nextAmountFormat = useKnownAmount || detection.amountFormat;
      setQifText(text);
      setQifDetection(detection);
      setQifDateFormat(nextDateFormat);
      setQifAmountFormat(nextAmountFormat);
      setQifDateInterpretationResolved(
        !detection.dateFormatNeedsConfirmation || Boolean(useKnownDate),
      );
      setQifAmountInterpretationResolved(
        !detection.amountFormatNeedsConfirmation || Boolean(useKnownAmount),
      );
      setStep("mapping");
      setMessage(
        detection.dateFormatNeedsConfirmation || detection.amountFormatNeedsConfirmation
          ? "QIF detected. Review the detected date and amount formats before continuing."
          : "QIF detected. Date and amount formats were detected automatically; adjust them if needed.",
      );
      setPerformanceReport(createTransactionImportPerformanceReport(timings));
      return;
    }

    if (detectedType === "ofx" || detectedType === "qfx") {
      const inspection = measureImportStage(
        timings,
        "Inspect OFX/QFX file",
        () => inspectTransactionOfxImport(text, detectedType),
      );
      setOfxText(text);
      setOfxInspection(inspection);
      setStep("mapping");
      setMessage(`${getFileTypeLabel(detectedType)} statement detected. Review the statement details before continuing.`);
      setPerformanceReport(createTransactionImportPerformanceReport(timings));
      return;
    }

    const nextAnalysis = measureImportStage(
      timings,
      "Analyse CSV columns",
      () => analyseTransactionCsvImport(text),
    );

    if (nextAnalysis.columns.length === 0) {
      setError("The CSV file appears to be empty.");
      setPerformanceReport(createTransactionImportPerformanceReport(timings));
      return;
    }

    const structureSignature = getCsvImportSignature(nextAnalysis);
    const knowledge = measureImportStage(
      timings,
      "Read account import knowledge",
      () =>
        findAccountImportKnowledge({
          accountId: selectedAccountId,
          fileType: "csv",
          structureSignature,
        }),
    );
      const nextMapping =
        knowledge?.csvMapping ?? nextAnalysis.suggestedMapping;
    const hasRequiredMapping = measureImportStage(
      timings,
      "Validate mapping",
      () => hasRequiredCsvMapping(nextMapping),
    );

    setCsvText(text);
    setAnalysis(nextAnalysis);
    setMapping(nextMapping);
    setStep("mapping");

    if (knowledge) {
      setMessage(
        `CSV detected. Previous successful settings for ${accountName} were applied.`,
      );
    }

    setMessage(
      hasRequiredMapping
        ? "CSV columns were detected automatically. Review or change the mapping before continuing."
        : "CSV detected. Map the missing columns. These choices will be reused automatically for similar files imported into this account.",
    );
      setPerformanceReport(createTransactionImportPerformanceReport(timings));
    } finally {
      setIsAnalysing(false);
    }
  }

  async function updateQifInterpretation(
    nextDateFormat: QifDateFormat,
    nextAmountFormat: QifAmountFormat,
  ) {
    if (!qifText) return;

    setQifDateFormat(nextDateFormat);
    setQifAmountFormat(nextAmountFormat);

    const parsedTransactions = parseTransactionQif(qifText, {
      dateFormat: nextDateFormat,
      amountFormat: nextAmountFormat,
    });
    const existingTransactions = await loadTransactionImportEvidence(
      selectedAccountId,
      parsedTransactions,
      loadAccountTransactions,
    );

    const nextPreview = previewTransactionQifImport(
      qifText,
      existingTransactions,
      {
        sourceAccountName: accountName,
        availableTransferAccountNames: transferAccountNames,
        transferAccounts: accounts.filter(
          (account) => account.id !== selectedAccountId,
        ),
        dateFormat: nextDateFormat,
        amountFormat: nextAmountFormat,
      },
      resolveMerchantForMatching,
    );
    await applyPreview(
      nextPreview,
      existingTransactions,
      `${nextPreview.summary.totalRows} QIF transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
      "qif",
    );
  }

  function rememberQifInterpretation(
    nextDateFormat: QifDateFormat,
    nextAmountFormat: QifAmountFormat,
  ) {
    if (!qifText) return;
    rememberAccountImportKnowledge({
      accountId: selectedAccountId,
      fileType: "qif",
      structureSignature: createQifStructureSignature(qifText),
      qifDateFormat: nextDateFormat,
      qifAmountFormat: nextAmountFormat,
    });
  }

  function chooseQifDateInterpretation(nextDateFormat: QifDateFormat) {
    setQifDateInterpretationResolved(true);
    rememberQifInterpretation(nextDateFormat, qifAmountFormat);
    updateQifInterpretation(nextDateFormat, qifAmountFormat);
  }

  function chooseQifAmountInterpretation(nextAmountFormat: QifAmountFormat) {
    setQifAmountInterpretationResolved(true);
    rememberQifInterpretation(qifDateFormat, nextAmountFormat);
    updateQifInterpretation(qifDateFormat, nextAmountFormat);
  }

  async function buildQifPreview() {
    if (!qifText) {
      setError("Choose a QIF file first.");
      return;
    }
    const parsedTransactions = parseTransactionQif(qifText, {
      dateFormat: qifDateFormat,
      amountFormat: qifAmountFormat,
    });
    const existingTransactions = await loadTransactionImportEvidence(
      selectedAccountId,
      parsedTransactions,
      loadAccountTransactions,
    );

    const nextPreview = previewTransactionQifImport(
      qifText,
      existingTransactions,
      {
        sourceAccountName: accountName,
        availableTransferAccountNames: transferAccountNames,
        transferAccounts: accounts.filter(
          (account) => account.id !== selectedAccountId,
        ),
        dateFormat: qifDateFormat,
        amountFormat: qifAmountFormat,
      },
      resolveMerchantForMatching,
    );
    if (nextPreview.candidates.length === 0) {
      setError("The QIF file does not appear to contain any transactions.");
      return;
    }
    await applyPreview(
      nextPreview,
      existingTransactions,
      `${nextPreview.summary.totalRows} QIF transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
      "qif",
      selectedAccountId,
      fileHash,
    );
  }

  async function buildOfxPreview() {
    if (!ofxText || (fileType !== "ofx" && fileType !== "qfx")) {
      setError("Choose an OFX or QFX file first.");
      return;
    }
    const parsedTransactions = parseTransactionOfx(ofxText);
    const existingTransactions = await loadTransactionImportEvidence(
      selectedAccountId,
      parsedTransactions,
      loadAccountTransactions,
    );

    const nextPreview = previewTransactionOfxImport(
      ofxText,
      existingTransactions,
      resolveMerchantForMatching,
    );
    if (nextPreview.candidates.length === 0) {
      setError("The OFX/QFX file does not appear to contain any transactions.");
      return;
    }
    await applyPreview(
      nextPreview,
      existingTransactions,
      `${nextPreview.summary.totalRows} ${getFileTypeLabel(fileType)} transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
      fileType,
      selectedAccountId,
      fileHash,
    );
  }

  async function buildCsvPreview(
    nextCsvText = csvText,
    nextMapping: CsvImportColumnMapping = mapping,
    options: {
      preserveMessage?: boolean;
      timings?: TransactionImportPerformanceEntry[];
      existingTransactions?: RegisterTransactionView[];
      sourceFileHash?: string | null;
    } = {},
  ) {
    if (!nextCsvText) {
      setError("Choose a transaction file first.");
      return;
    }

    if (!hasRequiredCsvMapping(nextMapping)) {
      setError(
        "Map at least Date, Payee/Description, and an Amount or Inflow/Outflow column before continuing.",
      );
      setStep("mapping");
      return;
    }

    setError(null);
    if (!options.preserveMessage) {
      setMessage(null);
    }

    const timings = options.timings ?? [];
    const parsedTransactions = parseTransactionCsv(
      nextCsvText,
      nextMapping,
    );
    const existingTransactions =
      options.existingTransactions ??
      await loadTransactionImportEvidence(
        selectedAccountId,
        parsedTransactions,
        loadAccountTransactions,
      );
    const nextPreview = measureImportStage(
      timings,
      "Parse and preview CSV",
      () =>
        previewTransactionCsvImport(
          nextCsvText,
          existingTransactions,
          nextMapping,
          resolveMerchantForMatching,
        ),
    );
    await applyPreview(
      nextPreview,
      existingTransactions,
      `${nextPreview.summary.totalRows} CSV transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
      "csv",
      selectedAccountId,
      options.sourceFileHash ?? fileHash,
    );
    setPerformanceReport(createTransactionImportPerformanceReport(timings));
  }

  function updateColumnRole(columnIndex: number, role: CsvImportColumnRole) {
    setMapping((current) => {
      const next = { ...current };
      if (role !== "ignore") {
        Object.entries(next).forEach(([index, assignedRole]) => {
          if (Number(index) !== columnIndex && assignedRole === role) {
            next[Number(index)] = "ignore";
          }
        });
      }
      next[columnIndex] = role;
      return next;
    });
    setPreview(null);
    setCandidates([]);
    setPreparedCandidates({});
    setAliasSuggestions([]);
    setMessage(null);
  }

  function resetAutoMapping() {
    if (!analysis) {
      return;
    }

    setMapping(analysis.suggestedMapping);
    setPreview(null);
    setCandidates([]);
    setPreparedCandidates({});
    setAliasSuggestions([]);
    setMessage(null);
    setError(null);
  }

  function processCandidate(
    candidateId: string,
    action: ProcessedImportAction,
    resolvedCandidate?: TransactionImportCandidate,
  ) {
    if (processingCandidateRef.current) return;

    const candidate =
      resolvedCandidate ??
      candidates.find((entry) => entry.id === candidateId);
    if (!candidate) return;

    if (action === "matched") {
      const transactionId =
        candidate.matchedTransaction?.id ?? candidate.matchedTransactionId;
      if (!transactionId) {
        setError("Choose an available register transaction before using an existing match.");
        return;
      }
      if (
        getConflictingRegisterMatchOwner(
          registerMatchOwnership,
          candidate.id,
          transactionId,
        )
      ) {
        setError("That register transaction is already matched to another imported transaction.");
        return;
      }
    }

    processingCandidateRef.current = candidateId;
    setProcessingCandidate({ id: candidateId, action });
    setError(null);

    window.setTimeout(() => {
      const candidateAfterAction =
        action === "imported"
          ? {
              ...candidate,
              status: "new" as const,
              selected: true,
              reviewDecision: "import-as-new" as const,
              errors: [],
            }
          : candidate;
      const processedCandidate = appendTransactionImportTrace(
        candidateAfterAction,
        {
          stage: "review",
          output: { action },
          detail: `Reviewer chose ${action}.`,
        },
      );

      setCandidates((current) =>
        current.filter((entry) => entry.id !== candidateId),
      );
      setProcessedCandidates((processed) => [
        ...processed.filter((entry) => entry.candidate.id !== candidateId),
        {
          candidate: processedCandidate,
          action,
          processedAt: Date.now(),
        },
      ]);
      processingCandidateRef.current = null;
      setProcessingCandidate(null);
      setHistoryPulse(true);
      window.setTimeout(() => setHistoryPulse(false), 260);
    }, 190);
  }

  async function confirmDiscardSession(): Promise<boolean> {
    if (
      processedCandidates.length === 0 &&
      Object.keys(matchEditorOrigins).length === 0
    ) {
      return true;
    }

    return confirmDialog({
      title: "Discard import session",
      message:
        "Discard this import session? Processed decisions and staged transactions will be lost.",
      confirmLabel: "Discard session",
      tone: "danger",
    });
  }

  function requestClose() {
    if (isImporting) return;
    onClose();
  }

  async function discardImportSession() {
    if (!(await confirmDiscardSession())) return;
    resetImportState();
  }

  function handleCandidateKeyDown(
    event: KeyboardEvent<HTMLElement>,
    candidate: TransactionImportCandidate,
    isMatchConvertedToNew: boolean,
  ) {
    const target = event.target as HTMLElement;
    if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName)) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>("[data-import-candidate-card]"),
      );
      const index = cards.indexOf(event.currentTarget);
      const nextIndex = event.key === "ArrowDown" ? index + 1 : index - 1;
      cards[nextIndex]?.focus();
      return;
    }

    if (event.key === "Escape" && isMatchConvertedToNew) {
      event.preventDefault();
      returnToMatchOptions(candidate.id);
      return;
    }
  }

  function acceptMatchedCandidate(candidateId: string) {
    processCandidate(candidateId, "matched");
  }

  async function openRegisterMatchPicker(candidateId: string) {
    setWeakMatchReviewCandidateId(candidateId);
    setManualMatchSearch("");
    setManualMatchTransactions(null);
    setManualMatchLoading(true);
    try {
      setManualMatchTransactions(
        await loadAccountTransactions(selectedAccountId),
      );
    } catch {
      setError("Register transactions could not be loaded. Try again.");
      setWeakMatchReviewCandidateId(null);
    } finally {
      setManualMatchLoading(false);
    }
  }

  function importMatchedCandidateAsNew(candidateId: string) {
    setCandidates((current) =>
      current.map((candidate) => {
        if (
          candidate.id !== candidateId ||
          candidate.status !== "exact-match"
        ) {
          return candidate;
        }

        setMatchEditorOrigins((origins) => ({
          ...origins,
          [candidate.id]: origins[candidate.id] ?? candidate,
        }));

        return {
          ...candidate,
          status: "new",
          selected: true,
          reviewDecision: "import-as-new",
          reason: "Review the new transaction details before importing it.",
          errors: [],
        };
      }),
    );
    setError(null);
  }

  function updateCandidateDetails(
    candidateId: string,
    updates: Partial<TransactionImportCandidate["parsed"]>,
  ) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              lifecycle: {
                ...candidate.lifecycle,
                proposal: {
                  ...candidate.lifecycle.proposal,
                  ...("payee" in updates ? { payee: updates.payee ?? "" } : {}),
                  ...("transferAccountName" in updates
                    ? { transferAccountName: updates.transferAccountName ?? null }
                    : {}),
                  ...("importedCategoryName" in updates
                    ? { categoryName: updates.importedCategoryName ?? null }
                    : {}),
                },
              },
            }
          : candidate,
      ),
    );
    setError(null);
  }

  function updateCandidateProposal(
    candidateId: string,
    updates: Partial<TransactionImportCandidate["lifecycle"]["proposal"]>,
  ) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              lifecycle: {
                ...candidate.lifecycle,
                proposal: {
                  ...candidate.lifecycle.proposal,
                  ...updates,
                },
              },
            }
          : candidate,
      ),
    );
    setError(null);
  }

  function beginProposalSplitEdit(candidate: TransactionImportCandidate) {
    const existing = candidate.lifecycle.proposal.splitLines;

    setSplitEdit({
      candidateId: candidate.id,
      target: "proposal",
      splitLines: existing?.length
        ? existing.map((line) => ({
            id: line.id,
            category: line.category,
            categoryId: line.categoryId,
            transferAccountId: line.transferAccountId,
            transferAccountParticipation:
              line.transferAccountParticipation,
            transferTransactionId: line.transferTransactionId,
            memo: line.memo ?? "",
            outflow: line.outflow ? line.outflow.toFixed(2) : "",
            inflow: line.inflow ? line.inflow.toFixed(2) : "",
          }))
        : [createSplitLineDraft(), createSplitLineDraft()],
    });
  }

  function beginMatchedSplitEdit(candidate: TransactionImportCandidate) {
    if (!candidate.matchedTransaction) {
      return;
    }
    setSplitEdit({
      candidateId: candidate.id,
      target: "matched",
      splitLines: candidate.matchedTransaction.splitLines?.length
        ? splitDraftsFromTransaction(candidate.matchedTransaction)
        : [createSplitLineDraft(), createSplitLineDraft()],
    });
  }

  function updateSplitEditLines(
    updater: (current: SplitLineDraft[]) => SplitLineDraft[],
  ) {
    setSplitEdit((current) =>
      current
        ? {
            ...current,
            splitLines: updater(current.splitLines),
          }
        : current,
    );
  }

  function cancelSplitEdit() {
    setSplitEdit(null);
  }

  function applySplitEdit(candidate: TransactionImportCandidate) {
    if (!splitEdit || splitEdit.candidateId !== candidate.id) {
      return;
    }

    const parent =
      splitEdit.target === "matched"
        ? candidate.matchedTransaction
        : getCandidateProposalTransaction(candidate);

    if (!parent) {
      setError("The split transaction is no longer available.");
      return;
    }

    if (
      splitEdit.splitLines.length < 2 ||
      hasIncompleteSplitDrafts(splitEdit.splitLines) ||
      !isSplitDraftBalanced(
        parent.outflow,
        parent.inflow,
        splitEdit.splitLines,
      )
    ) {
      setError(
        "Complete at least two split categories and assign the full transaction amount before applying the split.",
      );
      return;
    }

    const splitLines = buildSplitLines(
      splitEdit.splitLines,
      categoryOptions,
    );

    if (splitLines.length < 2) {
      setError(
        "A split transaction requires at least two complete category lines.",
      );
      return;
    }

    if (splitEdit.target === "matched") {
      updateMatchedTransactionDetails(candidate.id, {
        category: "Split",
        categoryId: undefined,
        transferAccountId: undefined,
        transferTransactionId: undefined,
        splitLines,
      });
    } else {
      updateCandidateProposal(candidate.id, {
        categoryName: "Split",
        transferAccountName: null,
        splitLines,
      });
      setManualCandidateEdits((current) =>
        markImportReviewFieldEdited(current, candidate.id, "category"),
      );
    }

    setSplitEdit(null);
    setError(null);
  }

  function clearProposalSplit(candidateId: string, categoryName: string | null) {
    updateCandidateProposal(candidateId, {
      categoryName,
      transferAccountName: null,
      splitLines: undefined,
    });
  }

  function beginTransactionEdit(candidate: TransactionImportCandidate) {
    const matched =
      candidate.status === "exact-match" ? candidate.matchedTransaction : null;
    const proposal = candidate.lifecycle.proposal;
    setTransactionEditDraft({
      candidateId: candidate.id,
      payee: matched?.payee ?? proposal.payee,
      category:
        matched?.category ??
        proposal.transferAccountName ??
        proposal.categoryName ??
        "",
      memo: matched?.memo ?? proposal.memo ?? "",
      tagIds: [...(matched?.tagIds ?? proposal.tagIds ?? [])],
      attachments: [
        ...(matched?.scheduledAttachments ?? proposal.attachments ?? []),
      ].map((attachment) => ({ ...attachment })),
    });
    setTransactionEditError(null);
  }

  function closeTransactionEdit() {
    if (transactionEditAttachmentBusy) return;
    setTransactionEditDraft(null);
    setTransactionEditError(null);
  }

  async function addTransactionEditAttachments(files: FileList | null) {
    if (!files || files.length === 0 || !transactionEditDraft) return;
    setTransactionEditAttachmentBusy(true);
    setTransactionEditError(null);
    try {
      const additions: ScheduledAttachmentTemplate[] = [];
      for (const file of Array.from(files)) {
        if (!IMPORT_ATTACHMENT_MIME_TYPES.has(file.type)) {
          throw new Error(
            `${file.name} is not a supported attachment. Use PDF, JPEG, PNG, or WebP.`,
          );
        }
        if (file.size > IMPORT_ATTACHMENT_MAX_BYTES) {
          throw new Error(`${file.name} is larger than the 5 MB attachment limit.`);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const contentHash = await calculateAttachmentContentHash(bytes);
        additions.push({
          id: createRuntimeUuid(),
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          attachedAt: new Date().toISOString(),
          contentHash,
          contentBase64: encodeImportAttachment(bytes),
        });
      }
      setTransactionEditDraft((current) =>
        current
          ? { ...current, attachments: [...current.attachments, ...additions] }
          : current,
      );
    } catch (error) {
      setTransactionEditError(
        error instanceof Error ? error.message : "The attachment could not be added.",
      );
    } finally {
      setTransactionEditAttachmentBusy(false);
    }
  }

  function saveTransactionEdit(candidate: TransactionImportCandidate) {
    const draft = transactionEditDraft;
    if (!draft || draft.candidateId !== candidate.id) return;

    const payee = draft.payee.trim();
    if (!payee) {
      setTransactionEditError("Choose a payee before saving.");
      return;
    }

    const memo = draft.memo.trim() || undefined;
    const categoryName = draft.category.trim();

    if (candidate.status === "exact-match" && candidate.matchedTransaction) {
      const payeeOption = payeeOptions.find(
        (option) =>
          option.name.trim().toLocaleLowerCase() === payee.toLocaleLowerCase(),
      );
      const categoryOption = categoryOptions.find(
        (option) =>
          option.name.trim().toLocaleLowerCase() ===
          categoryName.toLocaleLowerCase(),
      );
      updateMatchedTransactionDetails(candidate.id, {
        payee,
        payeeId: payeeOption?.id,
        category:
          categoryName === "Split"
            ? candidate.matchedTransaction.category
            : categoryName || candidate.matchedTransaction.category,
        categoryId:
          categoryName === "Split"
            ? candidate.matchedTransaction.categoryId
            : categoryOption?.id ?? candidate.matchedTransaction.categoryId,
        transferAccountId:
          categoryName === "Split"
            ? candidate.matchedTransaction.transferAccountId
            : undefined,
        transferTransactionId:
          categoryName === "Split"
            ? candidate.matchedTransaction.transferTransactionId
            : undefined,
        splitLines:
          categoryName === "Split"
            ? candidate.matchedTransaction.splitLines
            : undefined,
        memo,
        tagIds: [...draft.tagIds],
        scheduledAttachments: draft.attachments.map((attachment) => ({
          ...attachment,
        })),
      });
      setManualCandidateEdits((current) => {
        let next = current;
        if (payee !== candidate.matchedTransaction?.payee) {
          next = markImportReviewFieldEdited(next, candidate.id, "payee");
        }
        if (categoryName !== candidate.matchedTransaction?.category) {
          next = markImportReviewFieldEdited(next, candidate.id, "category");
        }
        if (memo !== candidate.matchedTransaction?.memo) {
          next = markImportReviewFieldEdited(next, candidate.id, "memo");
        }
        return next;
      });
      setTransactionEditDraft(null);
      setTransactionEditError(null);
      if (categoryName === "Split") {
        beginMatchedSplitEdit(candidate);
      }
      return;
    }

    const built = buildTransactionImportMerchantProposal({
      store: merchantKnowledgeRef.current,
      rawPayee: payee,
      transaction: candidate.parsed,
      currentProposal: candidate.lifecycle.proposal,
    });
    const transferAccountName = built.proposal.transferAccountName ?? null;
    updateCandidateProposal(candidate.id, {
      payee: built.proposal.payee,
      transferAccountName,
      categoryName:
        categoryName === "Split"
          ? candidate.lifecycle.proposal.categoryName
          : transferAccountName
            ? built.proposal.categoryName
            : categoryName || null,
      memo,
      memoReviewed: true,
      tagIds: [...draft.tagIds],
      attachments: draft.attachments.map((attachment) => ({ ...attachment })),
      splitLines:
        categoryName === "Split"
          ? candidate.lifecycle.proposal.splitLines
          : undefined,
      ...(categoryName === "Split"
        ? { categoryName: "Split", transferAccountName: null }
        : {}),
    });
    setManualCandidateEdits((current) => {
      let next = current;
      if (built.proposal.payee !== candidate.lifecycle.proposal.payee) {
        next = markImportReviewFieldEdited(next, candidate.id, "payee");
      }
      if (categoryName !== (candidate.lifecycle.proposal.categoryName ?? "")) {
        next = markImportReviewFieldEdited(next, candidate.id, "category");
      }
      if (memo !== candidate.lifecycle.proposal.memo) {
        next = markImportReviewFieldEdited(next, candidate.id, "memo");
      }
      return next;
    });
    if (built.proposal.payee !== candidate.lifecycle.proposal.payee) {
      void offerHistoricalPayeeUpdate(
        candidate.id,
        candidate.lifecycle.source.rawPayee,
        built.proposal.payee,
      );
    }
    setTransactionEditDraft(null);
    setTransactionEditError(null);
    if (categoryName === "Split") {
      beginProposalSplitEdit(candidate);
    }
  }

  function removeHistoricalPayeeMapping(sourceRawPayee: string) {
    const sourceIdentity = getImportRawPayeeIdentity(sourceRawPayee);
    if (!sourceIdentity) return;
    setHistoricalRegisterPayeeUpdates((current) =>
      current.filter((entry) => {
        const source = entry.transaction.rawPayee?.trim();
        return (
          !source ||
          getImportRawPayeeIdentity(source) !== sourceIdentity
        );
      }),
    );
  }

  async function offerHistoricalPayeeUpdate(
    sourceCandidateId: string,
    sourceRawPayee: string,
    targetPayee: string,
  ) {
    const sourceIdentity = getImportRawPayeeIdentity(sourceRawPayee);
    const targetIdentity = getImportRawPayeeIdentity(targetPayee);
    if (!sourceIdentity || !targetIdentity) return;

    const offerKey = `${selectedAccountId}\u0000${sourceIdentity}\u0000${targetIdentity}`;
    if (historicalPayeeOfferRef.current.has(offerKey)) return;
    historicalPayeeOfferRef.current.add(offerKey);

    removeHistoricalPayeeMapping(sourceRawPayee);
    const protectedMatchedTransactionIds = new Set(
      [
        ...candidates.filter((candidate) => candidate.status === "exact-match"),
        ...matchedCandidates,
      ].flatMap((candidate) => {
        const transactionId =
          candidate.matchedTransaction?.id ??
          candidate.matchedTransactionId ??
          "";
        return transactionId ? [transactionId] : [];
      }),
    );
    const matches = findHistoricalRegisterPayeeMatches(
      transactions,
      sourceRawPayee,
      targetPayee,
      protectedMatchedTransactionIds,
    );
    if (matches.eligible.length === 0) {
      historicalPayeeOfferRef.current.delete(offerKey);
      return;
    }

    try {
      const confirmed = await confirmDialog({
        title: "Update existing payees?",
        message:
          `We found ${matches.eligible.length} existing transaction${
            matches.eligible.length === 1 ? "" : "s"
          } in ${accountName} recorded from “${sourceRawPayee.trim()}”. ` +
          `Change ${matches.eligible.length === 1 ? "its" : "their"} payee to “${targetPayee.trim()}” after this import succeeds? ` +
          "Categories will not be changed." +
          (matches.reconciledExcluded > 0
            ? ` ${matches.reconciledExcluded} reconciled transaction${
                matches.reconciledExcluded === 1 ? "" : "s"
              } will be left unchanged.`
            : ""),
        confirmLabel: `Update ${matches.eligible.length} payee${
          matches.eligible.length === 1 ? "" : "s"
        }`,
      });

      if (confirmed) {
        setHistoricalRegisterPayeeUpdates((current) => {
          const withoutPrevious = current.filter((entry) => {
            const source = entry.transaction.rawPayee?.trim();
            return (
              !source ||
              getImportRawPayeeIdentity(source) !== sourceIdentity
            );
          });
          return [
            ...withoutPrevious,
            ...matches.eligible.map((entry) => ({
              ...entry,
              sourceCandidateId,
            })),
          ];
        });
      }
    } finally {
      historicalPayeeOfferRef.current.delete(offerKey);
    }
  }

  function updateExcludeMemosPreference(enabled: boolean) {
    const updateCandidate = (candidate: TransactionImportCandidate) =>
      applySourceMemoPreferenceToCandidate({
        candidate,
        excludeMemos: enabled,
        manualEdits: manualCandidateEdits[candidate.id],
      });
    setCandidates((current) => current.map(updateCandidate));
    setProcessedCandidates((current) =>
      current.map((entry) => ({
        ...entry,
        candidate: updateCandidate(entry.candidate),
      })),
    );
    setExcludeMemos(enabled);
    writeTransactionImportPreferences({
      excludeMemos: enabled,
      updateMatchedTransactionDates,
    });
  }

  function resetCandidateChanges(candidateId: string) {
    const result = resetTransactionImportCandidate({
      candidates,
      candidateId,
      preparedCandidates,
      manualEdits: manualCandidateEdits,
      historicalUpdates: historicalRegisterPayeeUpdates,
      matchEditorOrigins,
      matchedTransactionOrigins,
      ownership: registerMatchOwnership,
    });
    if (!result) return;
    if (result.conflict) {
      setError(
        "This transaction’s original match is now used by another import row. Resolve that match before resetting changes.",
      );
      return;
    }

    setCandidates(result.candidates);
    setManualCandidateEdits(result.manualEdits);
    setHistoricalRegisterPayeeUpdates(result.historicalUpdates);
    setMatchEditorOrigins(result.matchEditorOrigins);
    setMatchedTransactionOrigins(result.matchedTransactionOrigins);
    if (splitEdit?.candidateId === candidateId) setSplitEdit(null);
    setError(null);
  }

  function updateMatchedTransactionDetails(
    candidateId: string,
    updates: Partial<RegisterTransactionView>,
  ) {
    setCandidates((current) =>
      current.map((candidate) => {
        if (candidate.id !== candidateId || !candidate.matchedTransaction) {
          return candidate;
        }
        setMatchedTransactionOrigins((origins) =>
          origins[candidateId]
            ? origins
            : { ...origins, [candidateId]: candidate.matchedTransaction! },
        );
        return {
          ...candidate,
          matchedTransaction: { ...candidate.matchedTransaction, ...updates },
        };
      }),
    );
    setError(null);
  }

  function selectMatchedRegisterTransaction(
    candidateId: string,
    transactionId: string,
  ): boolean {
    const candidate = candidates.find((entry) => entry.id === candidateId);
    if (!candidate) return false;
    if (
      getConflictingRegisterMatchOwner(
        registerMatchOwnership,
        candidateId,
        transactionId,
      )
    ) {
      setError("That register transaction is already matched to another imported transaction.");
      return false;
    }

    setCandidates((current) =>
      current.map((entry) =>
        entry.id === candidateId
          ? selectOwnedRegisterMatch(entry, transactionId, registerMatchOwnership)
          : entry,
      ),
    );
    setMatchedTransactionOrigins((origins) => {
      const next = { ...origins };
      delete next[candidateId];
      return next;
    });
    setError(null);
    return true;
  }

  function selectManualRegisterTransaction(
    candidateId: string,
    transaction: RegisterTransactionView,
  ): boolean {
    const candidate = candidates.find((entry) => entry.id === candidateId);
    if (!candidate) return false;
    const selected = selectManualOwnedRegisterMatch({
      candidate,
      transaction,
      ownership: registerMatchOwnership,
    });
    if (selected === candidate) {
      setError(
        "That register transaction is already matched to another import row or has a different amount.",
      );
      return false;
    }
    setMatchedTransactionOrigins((origins) => {
      const next = { ...origins };
      delete next[candidateId];
      return next;
    });
    setError(null);
    processCandidate(candidateId, "matched", selected);
    return true;
  }

  function cancelMatchedTransactionChanges(candidateId: string) {
    const original = matchedTransactionOrigins[candidateId];
    if (!original) return;
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId
          ? { ...candidate, matchedTransaction: original }
          : candidate,
      ),
    );
    setMatchedTransactionOrigins((origins) => {
      const next = { ...origins };
      delete next[candidateId];
      return next;
    });
    setManualCandidateEdits((current) => {
      const fields = current[candidateId];
      if (!fields?.memo) return current;
      const { memo: _memo, ...remainingFields } = fields;
      if (Object.keys(remainingFields).length > 0) {
        return { ...current, [candidateId]: remainingFields };
      }
      const next = { ...current };
      delete next[candidateId];
      return next;
    });
  }

  function returnToMatchOptions(candidateId: string) {
    const origin = matchEditorOrigins[candidateId];
    if (!origin) return;
    const candidate = candidates.find((entry) => entry.id === candidateId);
    if (!candidate) return;
    const restored = restoreOwnedRegisterMatch(
      candidate,
      origin,
      registerMatchOwnership,
    );
    if (restored === candidate) {
      setError("That register transaction is already matched to another imported transaction.");
      return;
    }

    setCandidates((current) =>
      current.map((entry) =>
        entry.id === candidateId ? restored : entry,
      ),
    );
    setMatchEditorOrigins((origins) => {
      const next = { ...origins };
      delete next[candidateId];
      return next;
    });
    setError(null);
  }

  function skipCandidate(candidateId: string) {
    processCandidate(candidateId, "skipped");
  }

  function importCandidate(candidateId: string) {
    const candidate = candidates.find((entry) => entry.id === candidateId);
    if (!candidate) return;

    if (!canImportReviewedCandidate(candidate, transferAccountNames)) {
      setError(
        "This transaction cannot be imported until it has a payee and valid source date and amount. Invalid source dates or amounts must be corrected in the file settings or skipped.",
      );
      return;
    }

    processCandidate(candidateId, "imported");
  }

  function restoreProcessedCandidate(candidateId: string) {
    setProcessedCandidates((current) => {
      const processed = current.find(
        (entry) => entry.candidate.id === candidateId,
      );
      if (!processed) return current;

      setCandidates((pending) =>
        sortImportCandidates([
          ...pending.filter((candidate) => candidate.id !== candidateId),
          {
            ...processed.candidate,
            selected: processed.candidate.status === "new",
            reviewDecision:
              processed.candidate.status === "new"
                ? processed.candidate.reviewDecision
                : undefined,
          },
        ]),
      );
      return current.filter((entry) => entry.candidate.id !== candidateId);
    });
    setHistoryOpen(false);
    setRestoredCandidateId(candidateId);
    setError(null);
  }

  async function acceptAliasSuggestion(suggestionId: string) {
    const suggestion = aliasSuggestions.find(
      (entry) => entry.id === suggestionId,
    );

    if (!suggestion) {
      return;
    }

    const nextAlias = createTransactionPayeeAlias({
      sourcePayee: suggestion.sourcePayee,
      targetPayee: suggestion.suggestedTargetPayee,
    });
    const nextAliases = upsertTransactionPayeeAlias(payeeAliases, nextAlias);
    setPayeeAliases(nextAliases);
    writeTransactionPayeeAliases(nextAliases);
    const nextMerchantKnowledge = acceptMerchantAlias({
      store: merchantKnowledgeRef.current,
      sourceValue: suggestion.sourcePayee,
      preferredName: suggestion.suggestedTargetPayee,
    });
    merchantKnowledgeRef.current = nextMerchantKnowledge;
    setMerchantKnowledge(nextMerchantKnowledge);

    const canonicalPayee = payeeOptions.find(
      (payee) =>
        getImportRawPayeeIdentity(payee.name) ===
        getImportRawPayeeIdentity(suggestion.suggestedTargetPayee),
    );
    if (canonicalPayee) {
      try {
        await onLearnPayeeAliases([
          { payeeId: canonicalPayee.id, rawPayee: suggestion.sourcePayee },
        ]);
      } catch (error) {
        console.warn("Could not mirror accepted import alias to Payee Management.", error);
      }
    }

    setAliasSuggestions((current) =>
      current.filter((entry) => entry.id !== suggestion.id),
    );
    setCandidates((current) =>
      current.map((entry) => {
        const sourcePayee = entry.lifecycle.source.rawPayee;

        if (sourcePayee !== suggestion.sourcePayee) {
          return entry;
        }

        return {
          ...entry,
          lifecycle: {
            ...entry.lifecycle,
            merchant: {
              ...entry.lifecycle.merchant,
              canonicalPayee: suggestion.suggestedTargetPayee,
              aliasId: nextAlias.id,
              aliasSourcePayee: sourcePayee,
            },
            proposal: {
              ...entry.lifecycle.proposal,
              payee: suggestion.suggestedTargetPayee,
            },
          },
        };
      }),
    );
    setMessage(
      `Payee alias saved: "${suggestion.sourcePayee}" will import as "${suggestion.suggestedTargetPayee}" next time.`,
    );
    setError(null);
  }

  function formatImportReviewDate(date: string | undefined) {
    return date ? formatDateForDisplay(date, dateFormat) : "—";
  }

  async function prepareHistoricalRegisterPayeeUpdates(): Promise<
    RegisterTransactionView[]
  > {
    if (historicalRegisterPayeeUpdates.length === 0) return [];

    const acceptedMatchedTransactionIds = new Set(
      matchedCandidates.flatMap((candidate) => {
        const transactionId =
          candidate.matchedTransaction?.id ??
          candidate.matchedTransactionId ??
          "";
        return transactionId ? [transactionId] : [];
      }),
    );
    const stagedByTransactionId = new Map(
      historicalRegisterPayeeUpdates
        .filter(
          (entry) =>
            !acceptedMatchedTransactionIds.has(entry.transaction.id),
        )
        .map((entry) => [
          entry.transaction.id,
          entry,
        ] as const),
    );
    if (stagedByTransactionId.size === 0) return [];

    const freshTransactions = await loadTransactionsByIds(
      selectedAccountId,
      [...stagedByTransactionId.keys()],
    );
    const updates: RegisterTransactionView[] = [];

    for (const transaction of freshTransactions) {
      const staged = stagedByTransactionId.get(transaction.id);
      if (!staged || transaction.reconciled || isTransferTransaction(transaction)) {
        continue;
      }
      const sourceRawPayee = staged.transaction.rawPayee?.trim();
      if (!sourceRawPayee) continue;
      const stillEligible = findHistoricalRegisterPayeeMatches(
        [transaction],
        sourceRawPayee,
        staged.payee,
        acceptedMatchedTransactionIds,
      );
      if (stillEligible.eligible.length === 0) continue;

      const targetPayee = staged.payee.replace(/\s+/g, " ").trim();
      if (!targetPayee) continue;

      updates.push({
        ...transaction,
        payee: targetPayee,
        payeeId: undefined,
      });
    }

    return updates;
  }

  function confirmedPayeeAliasLearnings(): Array<{
    rawPayee: string;
    targetPayee: string;
  }> {
    const learnings = [
      ...importedCandidates.flatMap((candidate) =>
        manualCandidateEdits[candidate.id]?.payee
          ? [{
              rawPayee: candidate.lifecycle.source.rawPayee,
              targetPayee: candidate.lifecycle.proposal.payee,
            }]
          : [],
      ),
      ...matchedCandidates.flatMap((candidate) => {
        const origin = matchedTransactionOrigins[candidate.id];
        const targetPayee = candidate.matchedTransaction?.payee ?? "";
        const manuallySelected = candidate.matchCandidates?.some(
          (option) =>
            option.transaction.id === candidate.matchedTransaction?.id &&
            option.reason === MANUAL_IMPORT_MATCH_REASON,
        );
        if (
          !targetPayee ||
          (!manuallySelected &&
            (!origin ||
              getImportRawPayeeIdentity(origin.payee) ===
                getImportRawPayeeIdentity(targetPayee)))
        ) {
          return [];
        }
        return [{
          rawPayee: candidate.lifecycle.source.rawPayee,
          targetPayee,
        }];
      }),
    ];

    return [...new Map(
      learnings
        .filter(({ rawPayee, targetPayee }) => {
          const rawIdentity = getImportRawPayeeIdentity(rawPayee);
          const targetIdentity = getImportRawPayeeIdentity(targetPayee);
          return Boolean(
            rawIdentity &&
            targetIdentity &&
            rawIdentity !== targetIdentity &&
            !targetPayee.trim().toLocaleLowerCase().startsWith("transfer:"),
          );
        })
        .map((learning) => [
          `${getImportRawPayeeIdentity(learning.rawPayee)}\u0000${getImportRawPayeeIdentity(learning.targetPayee)}`,
          learning,
        ] as const),
    ).values()];
  }

  async function importSelected() {
    if (!["csv", "qif", "ofx", "qfx"].includes(fileType)) {
      setError("The selected file type cannot be committed.");
      return;
    }

    const completedSourceCandidates = uniqueProcessedCandidates
      .filter(
        (entry) => entry.action === "imported" || entry.action === "matched",
      )
      .map((entry) => entry.candidate);

    setIsImporting(true);
    setError(null);
    setMessage(
      `Importing ${importedCandidates.length} transaction${importedCandidates.length === 1 ? "" : "s"}…`,
    );

    try {
      const payeeAliasLearnings = confirmedPayeeAliasLearnings();
      const historicalPayeeUpdates =
        await prepareHistoricalRegisterPayeeUpdates();

      const result = await commitImportSession(
        {
          accountId: selectedAccountId,
          accountName,
          importedCandidates,
          matchedCandidates,
          historicalPayeeUpdates,
          completedSourceCandidates,
          sourceIdentities,
          skippedCount: uniqueProcessedCandidates.filter(
            (entry) => entry.action === "skipped",
          ).length,
          previouslyImportedCount,
          alreadyRepresentedCount,
          editedMatchedCandidateIds: new Set(
            Object.keys(matchedTransactionOrigins),
          ),
          includeMemos: !excludeMemos,
          updateMatchedTransactionDates,
          categories: categoryOptions.map((category) => ({
            id: category.id,
            name: category.name,
          })),
          accounts: accounts.map((account) => ({
            id: account.id,
            name: account.name,
          })),
          merchantKnowledge: merchantKnowledgeRef.current,
          file: {
            fileType: fileType as ImportedTransactionFileType,
            fileName,
            fileHash,
            csvAnalysis: analysis,
            csvMapping: mapping,
            qifDetection,
            qifText,
            qifDateFormat,
            qifAmountFormat,
          },
        },
        {
          resolvePayee: async (
            name,
          ): Promise<ImportPayeeResolution> => {
            const normalisedName = name.replace(/\s+/g, " ").trim();
            if (!normalisedName) {
              throw new Error("Enter a payee name.");
            }
            if (
              normalisedName.toLocaleLowerCase().startsWith("transfer:")
            ) {
              throw new Error(
                "Transfer payees are created by choosing an account.",
              );
            }

            const existing = payeeOptions.find(
              (payee) =>
                payee.name
                  .replace(/\s+/g, " ")
                  .trim()
                  .toLocaleLowerCase() ===
                normalisedName.toLocaleLowerCase(),
            );

            if (existing) {
              return {
                kind: "existing",
                id: existing.id,
                name: existing.name,
              };
            }

            return {
              kind: "create",
              id: createRuntimeUuid(),
              name: normalisedName,
            };
          },
          commitTransactionBatch: onCommitRegisterChanges,
          verifyCommittedTransactions: async (accountId, additions) => {
            const ids = additions.map((transaction) => {
              if (!transaction.id) {
                throw new Error("A committed import transaction has no stable ID.");
              }
              return transaction.id;
            });
            try {
              const persisted = await loadTransactionsByIds(accountId, ids);
              verifyPersistedImportTransactions(additions, persisted);
            } catch (error) {
              console.warn(
                "Post-commit import projection verification differed from the committed SQLite records.",
                error,
              );
            }
          },
        },
      );

      const importedTransactionIds = result.additions.flatMap(
        (transaction) => transaction.id ? [transaction.id] : [],
      );
      const matchedTransactionIds = matchedCandidates.flatMap((candidate) => {
        const transactionId =
          candidate.matchedTransaction?.id ??
          candidate.matchedTransactionId ??
          "";
        return transactionId ? [transactionId] : [];
      });

      const historicalPayeesUpdated =
        result.historicalPayeeUpdates.length;

      const committedPayeeIdsByName = new Map<string, string>();
      for (const payee of payeeOptions) {
        committedPayeeIdsByName.set(getImportRawPayeeIdentity(payee.name), payee.id);
      }
      for (const transaction of [
        ...result.additions,
        ...result.matchedTransactionUpdates,
        ...result.historicalPayeeUpdates,
      ]) {
        if (transaction.payeeId) {
          committedPayeeIdsByName.set(
            getImportRawPayeeIdentity(transaction.payee),
            transaction.payeeId,
          );
        }
      }

      const canonicalAliasLearnings = payeeAliasLearnings.flatMap(
        (learning) => {
          const payeeId = committedPayeeIdsByName.get(
            getImportRawPayeeIdentity(learning.targetPayee),
          );
          return payeeId
            ? [{ payeeId, rawPayee: learning.rawPayee }]
            : [];
        },
      );

      onImportCommitComplete?.({
        accountId: selectedAccountId,
        importedTransactionIds,
        matchedTransactionIds,
      });

      merchantKnowledgeRef.current = result.merchantKnowledge;
      setMerchantKnowledge(result.merchantKnowledge);

      const skippedCount = uniqueProcessedCandidates.filter(
        (entry) => entry.action === "skipped",
      ).length;
      const importedCount = uniqueProcessedCandidates.filter(
        (entry) => entry.action === "imported",
      ).length;
      const matchedCount = uniqueProcessedCandidates.filter(
        (entry) => entry.action === "matched",
      ).length;
      const completion = summariseTransactionImportOutcomes({
        total:
          uniqueProcessedCandidates.length +
          previouslyImportedCount +
          alreadyRepresentedCount,
        imported: importedCount,
        matched: matchedCount,
        skipped: skippedCount,
        failed: 0,
        alreadyPresent: previouslyImportedCount + alreadyRepresentedCount,
      });
      setMessage(
        `${completion.imported} imported · ${completion.matched} matched · ` +
          `${completion.skipped} skipped · ${completion.alreadyPresent} already present · ` +
          `${completion.failed} failed in ${accountName}.` +
          (historicalPayeesUpdated > 0
            ? ` ${historicalPayeesUpdated} existing payee${historicalPayeesUpdated === 1 ? "" : "s"} updated.`
            : ""),
      );
      deleteTransactionImportSession(selectedAccountId);
      const completedDiagnostics = uniqueProcessedCandidates.map((entry) => ({
        ...entry,
        candidate: appendTransactionImportTrace(entry.candidate, {
          stage: "commit",
          output: {
            status: "completed",
            importedCount: result.additions.length,
            updatedMatchCount: result.matchedTransactionUpdates.length,
            auditSessionId: result.audit.sessionId,
          },
        }),
      }));
      setProcessedCandidates(completedDiagnostics);
      if (developerPerformanceMode) {
        recordImportDiagnosticSession(createImportDiagnosticSessionRecord({
          accountId: selectedAccountId,
          accountName,
          fileName,
          fileType,
          status: "completed",
          audit: result.audit,
          candidates: completedDiagnostics.map((entry) => ({
            candidate: entry.candidate,
            outcome: entry.action as ImportDiagnosticCandidateOutcome,
          })),
        }));
      }
      setStep("complete");
      setCandidates((current) =>
        current.map((candidate) => ({ ...candidate, selected: false })),
      );
      setPerformanceReport(
        createTransactionImportPerformanceReport(result.audit.stages),
      );

      if (canonicalAliasLearnings.length > 0) {
        void onLearnPayeeAliases(canonicalAliasLearnings).catch((error) => {
          console.warn(
            "Committed import payee aliases could not be mirrored to Payee Management.",
            error,
          );
        });
      }
    } catch (commitError) {
      const audit =
        commitError instanceof ImportCommitExecutionError
          ? commitError.audit
          : undefined;
      setPerformanceReport(
        audit
          ? createTransactionImportPerformanceReport(audit.stages)
          : null,
      );
      const failedDiagnostics = uniqueProcessedCandidates.map((entry) => ({
        ...entry,
        candidate: appendTransactionImportTrace(entry.candidate, {
          stage: "commit",
          output: {
            status: "failed",
            failedStage: audit?.failedStage ?? null,
            registerMutationStarted: audit?.registerMutationStarted ?? false,
            rollbackAttempted: audit?.registerRollbackAttempted ?? false,
            rollbackSucceeded: audit?.registerRollbackSucceeded ?? false,
          },
        }),
      }));
      setProcessedCandidates(failedDiagnostics);
      if (developerPerformanceMode) {
        recordImportDiagnosticSession(createImportDiagnosticSessionRecord({
          accountId: selectedAccountId,
          accountName,
          fileName,
          fileType,
          status: "failed",
          audit,
          candidates: failedDiagnostics.map((entry) => ({
            candidate: entry.candidate,
            outcome: entry.action as ImportDiagnosticCandidateOutcome,
          })),
        }));
      }
      const verificationFailed =
        audit?.failedStage === "Verify committed register changes";
      const baseError = verificationFailed
        ? "The transactions were written, but Budget App could not verify the completed import. Do not retry this import until the destination account has been reviewed. No import identity or merchant knowledge was recorded."
        : audit?.registerMutationStarted
        ? "The import did not finish after register changes began. No import identity or merchant knowledge was recorded. Review the destination account before retrying."
        : "The import could not be committed. No register or import-identity changes were made.";
      setError(
        developerPerformanceMode && audit?.errorMessage
          ? `${baseError} ${audit.failedStage ?? "Commit"}: ${audit.errorMessage}`
          : baseError,
      );
    } finally {
      setIsImporting(false);
    }
  }

  const transactionEditCandidate = transactionEditDraft
    ? candidates.find((candidate) => candidate.id === transactionEditDraft.candidateId) ?? null
    : null;
  const weakMatchReviewCandidate = weakMatchReviewCandidateId
    ? candidates.find(
        (candidate) => candidate.id === weakMatchReviewCandidateId,
      ) ?? null
    : null;
  const availableManualMatchTransactions = weakMatchReviewCandidate
    ? getEligibleManualRegisterMatches({
        candidate: weakMatchReviewCandidate,
        transactions:
          manualMatchTransactions ??
          getAvailableRegisterMatchCandidates(
            weakMatchReviewCandidate,
            registerMatchOwnership,
          ).map((option) => option.transaction),
        ownership: registerMatchOwnership,
      }).filter((transaction) => {
        const query = manualMatchSearch.trim().toLocaleLowerCase();
        return !query || [
          transaction.payee,
          transaction.memo,
          transaction.date,
          transaction.category,
        ].some((value) => value?.toLocaleLowerCase().includes(query));
      })
    : [];

  return (
    <div
      className="transaction-import-backdrop"
      role="presentation"
      onClick={requestClose}
    >
      <section
        className="transaction-import-dialog transaction-import-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="transaction-import-header">
          <h2 id="transaction-import-title">Import Transactions</h2>
          <button
            className="transaction-import-close-button"
            type="button"
            onClick={requestClose}
            disabled={isImporting}
            aria-label="Close import transactions"
          >
            ×
          </button>
        </div>

        <nav className="transaction-import-stepper" aria-label="Import progress">
          {[
            ["upload", "File"],
            ["mapping", "Setup"],
            ["review", "Review"],
            ["complete", "Complete"],
          ].map(([stepId, label], index) => {
            const stepOrder: TransactionImportStep[] = ["upload", "mapping", "review", "complete"];
            const currentIndex = stepOrder.indexOf(step);
            const itemIndex = stepOrder.indexOf(stepId as TransactionImportStep);
            return (
              <span
                key={stepId}
                className={`transaction-import-stepper-item${itemIndex === currentIndex ? " is-current" : ""}${itemIndex < currentIndex ? " is-complete" : ""}`}
                aria-current={itemIndex === currentIndex ? "step" : undefined}
              >
                <span>{index + 1}</span>{label}
              </span>
            );
          })}
        </nav>

        {error ? <p className="transaction-import-error">{error}</p> : null}
        {message ? (
          <p className="transaction-import-message">{message}</p>
        ) : null}
        {duplicateFileMessage ? (
          <div className="transaction-import-duplicate-warning" role="alert">
            <strong>This file has already been imported</strong>
            <span>{duplicateFileMessage}</span>
            <span>Continuing may create duplicates if previously processed rows are not recognised.</span>
          </div>
        ) : null}

        {isAnalysing ? (
          <div
            className="transaction-import-analysing"
            role="status"
            aria-live="polite"
          >
            <span className="transaction-import-spinner" aria-hidden="true" />
            <div>
              <strong>Analysing transactions…</strong>
              <span>{[
                "Reading the selected file…",
                "Checking previously imported transactions…",
                "Searching the register for matches…",
                "Building payee and category suggestions…",
              ][analysisStageIndex]}</span>
            </div>
          </div>
        ) : null}

        {step === "upload" && !isAnalysing ? (
          <div className="transaction-import-upload-step">
            <label className="transaction-import-upload-account">
              <span>Destination account</span>
              <select
                value={selectedAccountId}
                disabled={isImporting || isAnalysing}
                onChange={(event) =>
                  void changeDestinationAccount(event.target.value)
                }
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.qif,.ofx,.qfx,text/csv"
              className="attachment-file-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void readFile(file);
                }
                event.target.value = "";
              }}
            />
            <button
              className="transaction-import-dropzone"
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  void readFile(file);
                }
              }}
            >
              <span className="transaction-import-dropzone-icon">↑</span>
              <strong>Drop your transaction file here</strong>
              <span>or click to browse files</span>
              <small>Supports CSV, QIF, and OFX/QFX files</small>
            </button>
          </div>
        ) : null}

        {qifText && qifDetection && step === "mapping" ? (
          <div className="transaction-import-mapping">
            <div className="transaction-import-section-heading">
              <div>
                <h3>Review QIF file interpretation</h3>
                <p className="muted">
                  The importer detected these settings automatically. Change them only if the preview does not match the bank file.
                </p>
              </div>
            </div>
            <div className="transaction-import-setup-grid transaction-import-detected-settings">
              <label>
                <span>Date format</span>
                <select
                  value={qifDateFormat}
                  onChange={(event) => setQifDateFormat(event.target.value as QifDateFormat)}
                >
                  {QIF_DATE_FORMAT_OPTIONS.map((format) => (
                    <option key={format} value={format}>{format}</option>
                  ))}
                </select>
                <small>{qifDetection.dateFormatNeedsConfirmation ? "Check required" : "Detected automatically"}</small>
              </label>
              <label>
                <span>Amount format</span>
                <select
                  value={qifAmountFormat}
                  onChange={(event) => setQifAmountFormat(event.target.value as QifAmountFormat)}
                >
                  <option value="decimal-dot">1,234.56</option>
                  <option value="decimal-comma">1.234,56</option>
                </select>
                <small>{qifDetection.amountFormatNeedsConfirmation ? "Check required" : "Detected automatically"}</small>
              </label>
            </div>
            <div className="transaction-import-file-preview transaction-import-detected-preview">
              <strong>Detected examples</strong>
              <span>Dates: {qifDetection.sampleDates.slice(0, 3).join(" · ") || "—"}</span>
              <span>Amounts: {qifDetection.sampleAmounts.slice(0, 3).join(" · ") || "—"}</span>
            </div>
            <div className="transaction-import-step-actions">
              <button className="button button-secondary" type="button" onClick={resetImportState}>Back</button>
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  setQifDateInterpretationResolved(true);
                  setQifAmountInterpretationResolved(true);
                  rememberQifInterpretation(qifDateFormat, qifAmountFormat);
                  buildQifPreview();
                }}
              >
                Review Transactions
              </button>
            </div>
          </div>
        ) : null}

        {ofxText && ofxInspection && step === "mapping" ? (
          <div className="transaction-import-mapping">
            <div className="transaction-import-section-heading">
              <div>
                <h3>Confirm {getFileTypeLabel(fileType)} statement</h3>
                <p className="muted">
                  OFX/QFX provides its own transaction structure, so no column
                  mapping or date-format selection is required.
                </p>
              </div>
            </div>
            <div className="transaction-import-profile-card">
              <label>
                <span>Transactions</span>
                <input
                  type="text"
                  value={ofxInspection.statistics.recordCount}
                  disabled
                />
              </label>
              <label>
                <span>Statement currency</span>
                <input
                  type="text"
                  value={ofxInspection.details.currencyCode ?? "Not provided"}
                  disabled
                />
              </label>
              <label>
                <span>Source account ID</span>
                <input
                  type="text"
                  value={ofxInspection.details.accountId ?? "Not provided"}
                  disabled
                />
              </label>
              <label>
                <span>Statement period</span>
                <input
                  type="text"
                  value={
                    [
                      ofxInspection.details.statementStartDate,
                      ofxInspection.details.statementEndDate,
                    ]
                      .filter(Boolean)
                      .join(" to ") || "Not provided"
                  }
                  disabled
                />
              </label>
              <label>
                <span>Destination account</span>
                <input type="text" value={accountName} disabled />
              </label>
            </div>
            {ofxInspection.diagnostics.length > 0 ? (
              <div className="transaction-import-column-grid">
                {ofxInspection.diagnostics.map((diagnostic) => (
                  <div
                    className="transaction-import-column-row"
                    key={diagnostic.code}
                  >
                    <span>{diagnostic.severity}</span>
                    <span>{diagnostic.code}</span>
                    <span>{diagnostic.message}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="transaction-import-step-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={resetImportState}
              >
                Back
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={buildOfxPreview}
                disabled={ofxInspection.diagnostics.some(
                  (diagnostic) => diagnostic.severity === "error",
                )}
              >
                Review Transactions
              </button>
            </div>
          </div>
        ) : null}

        {analysis && step === "mapping" ? (
          <div className="transaction-import-mapping">
            <div className="transaction-import-section-heading">
              <div>
                <h3>Set up this CSV format</h3>
                <p className="muted">
                  {analysis.totalDataRows} data row
                  {analysis.totalDataRows === 1 ? "" : "s"} detected. Map the
                  columns the importer could not confidently identify.
                </p>
                <p className="muted transaction-import-help">
                  The importer will remember successful choices for this account
                  and reuse them automatically when a similar file appears
                  again.
                </p>
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={resetAutoMapping}
              >
                Reset Auto Mapping
              </button>
            </div>

            <div className="transaction-import-column-grid">
              <div className="transaction-import-column-row transaction-import-column-head">
                <span>CSV Column</span>
                <span>Import As</span>
                <span>Sample Values</span>
              </div>
              {analysis.columns.map((column) => (
                <div
                  className="transaction-import-column-row"
                  key={column.index}
                >
                  <span>
                    <strong>{column.header}</strong>
                    {column.suggestedRole !== "ignore" ? (
                      <small>Auto-detected: {column.suggestedRole}</small>
                    ) : null}
                  </span>
                  <span>
                    <select
                      value={mapping[column.index] ?? "ignore"}
                      onChange={(event) =>
                        updateColumnRole(
                          column.index,
                          event.target.value as CsvImportColumnRole,
                        )
                      }
                    >
                      {CSV_IMPORT_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span className="transaction-import-samples">
                    {column.sampleValues.length > 0
                      ? column.sampleValues.join(" · ")
                      : "—"}
                  </span>
                </div>
              ))}
            </div>

            <div className="transaction-import-step-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={resetImportState}
              >
                Back
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={isImporting}
                onClick={() => buildCsvPreview(csvText, mapping)}
              >
                Review Transactions
              </button>
            </div>
          </div>
        ) : null}

        {preview && step === "review" ? (
          <>
            <div className="transaction-import-section-heading">
              <div>
                <h3>Review remaining transactions</h3>
                <p className="muted">
                  Compare imported transactions with any possible register
                  matches, then choose what to do with each item.
                </p>
              </div>
              <div className="transaction-import-review-controls">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setStep("mapping")}
                >
                  File Settings
                </button>
                <label className="transaction-import-memo-option">
                  <input
                    type="checkbox"
                    checked={excludeMemos}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      updateExcludeMemosPreference(enabled);
                    }}
                  />
                  Don't import transaction memos
                </label>
                <label className="transaction-import-memo-option">
                  <input
                    type="checkbox"
                    checked={updateMatchedTransactionDates}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setUpdateMatchedTransactionDates(enabled);
                      writeTransactionImportPreferences({
                        excludeMemos,
                        updateMatchedTransactionDates: enabled,
                      });
                    }}
                  />
                  Update matched transaction dates from imported data
                </label>
              </div>
            </div>
            <div className="transaction-import-summary transaction-import-review-summary">
              <strong>
                {candidates.length} transaction
                {candidates.length === 1 ? "" : "s"} remaining
              </strong>
              {previouslyImportedCount > 0 ? (
                <span>
                  {previouslyImportedCount} previously imported transaction
                  {previouslyImportedCount === 1 ? "" : "s"} excluded
                </span>
              ) : null}
              {alreadyRepresentedCount > 0 ? (
                <span>
                  {alreadyRepresentedCount} additional exact register match
                  {alreadyRepresentedCount === 1 ? "" : "es"} excluded
                </span>
              ) : null}
            </div>
            <div className="transaction-import-balance-preview" aria-live="polite">
              <div>
                <span>Current account balance</span>
                <strong>{startingWorkingBalance === null ? "Loading…" : formatMoney(startingWorkingBalance, currencyCode)}</strong>
              </div>
              <div>
                <span>Accepted change</span>
                <strong className={acceptedBalanceChange < 0 ? "negative" : acceptedBalanceChange > 0 ? "positive" : ""}>
                  {formatMoney(acceptedBalanceChange, currencyCode)}
                </strong>
              </div>
              <div className="projected">
                <span>Balance after import</span>
                <strong>{projectedWorkingBalance === null ? "Loading…" : formatMoney(projectedWorkingBalance, currencyCode)}</strong>
              </div>
            </div>
            {historyOpen && processedCandidates.length > 0 ? (
              <div
                className="transaction-import-history"
                aria-label="Processed transaction history"
              >
                {[...processedCandidates].reverse().map((entry) => (
                  <div
                    className="transaction-import-history-row"
                    key={entry.candidate.id}
                  >
                    <span>
                      <strong>
                        {entry.candidate.lifecycle.proposal.payee || "Missing payee"}
                      </strong>
                      <small>
                        {entry.action === "imported"
                          ? "Imported"
                          : entry.action === "matched"
                            ? "Used existing transaction"
                            : "Skipped"}
                      </small>
                    </span>
                    <span>
                      {formatMoney(
                        entry.candidate.parsed.inflow -
                          entry.candidate.parsed.outflow,
                        currencyCode,
                      )}
                    </span>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() =>
                        restoreProcessedCandidate(entry.candidate.id)
                      }
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {candidates.length === 0 && step === "review" ? (
          <div className="transaction-import-complete-step">
            <div className="transaction-import-complete-icon">✓</div>
            <h3>Review complete</h3>
            <p>
              {selectedCount > 0
                ? `${selectedCount} transaction${selectedCount === 1 ? " is" : "s are"} ready to import.`
                : "No new transactions are ready to import. Matched and skipped items will remain unchanged."}
            </p>
            <div className="transaction-import-step-actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={processedCandidates.length === 0}
                onClick={() => setHistoryOpen((open) => !open)}
              >
                History ({processedCount})
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={isImporting}
                onClick={() => void importSelected()}
              >
                {selectedCount > 0
                  ? `Commit Import (${selectedCount})`
                  : "Finish Review"}
              </button>
            </div>
          </div>
        ) : null}

        {qifText &&
        qifDetection &&
        step === "review" &&
        (!qifDateInterpretationResolved || !qifAmountInterpretationResolved) ? (
          <div className="transaction-import-interpretation-prompt">
            <strong>Confirm how this file should be read</strong>
            <p className="muted">
              The complete file was inspected, but it does not contain enough
              evidence to determine every format. Your choices will apply to
              this file and be remembered for {accountName}.
            </p>
            {!qifDateInterpretationResolved ? (
              <fieldset>
                <legend>
                  Date shown as {qifDetection.sampleDates[0] ?? "—"}
                </legend>
                {QIF_DATE_FORMAT_OPTIONS.filter(
                  (format) =>
                  format.startsWith("DD/") || format.startsWith("MM/"),
                ).map((format) => (
                  <button
                    className="button button-secondary"
                    type="button"
                    key={format}
                    onClick={() => chooseQifDateInterpretation(format)}
                  >
                    Interpret as {format}
                  </button>
                ))}
              </fieldset>
            ) : null}
            {!qifAmountInterpretationResolved ? (
              <fieldset>
                <legend>
                  Amount shown as {qifDetection.sampleAmounts[0] ?? "—"}
                </legend>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => chooseQifAmountInterpretation("decimal-dot")}
                >
                  Interpret as 1,234.56
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => chooseQifAmountInterpretation("decimal-comma")}
                >
                  Interpret as 1.234,56
                </button>
              </fieldset>
            ) : null}
          </div>
        ) : null}

        {candidates.length > 0 &&
        step === "review" &&
        qifDateInterpretationResolved &&
        qifAmountInterpretationResolved ? (
          <div className="transaction-import-review-list">
            {candidates.map((candidate) => {
              const hasMatch = Boolean(candidate.matchedTransaction);
              const availableRegisterMatchCandidates =
                getAvailableRegisterMatchCandidates(
                  candidate,
                  registerMatchOwnership,
                );
              const reviewPresentation =
                getTransactionImportReviewPresentation(
                  candidate,
                  availableRegisterMatchCandidates.length,
                );
              const sourcePayee = candidate.lifecycle.source.rawPayee;
              const candidateAliasSuggestion = aliasSuggestions.find(
                (suggestion) => suggestion.sourcePayee === sourcePayee,
              );
              const bankParsed = bankCandidateDetails[candidate.id] ?? candidate.parsed;
              const amountLabel = bankParsed.outflow
                ? formatMoney(bankParsed.outflow, currencyCode)
                : formatMoney(bankParsed.inflow, currencyCode);
              const matchAmountLabel = candidate.matchedTransaction
                ? candidate.matchedTransaction.outflow
                  ? formatMoney(
                      candidate.matchedTransaction.outflow,
                      currencyCode,
                    )
                  : formatMoney(
                      candidate.matchedTransaction.inflow,
                      currencyCode,
                    )
                : "";
              const isMatchConvertedToNew =
                candidate.status === "new" &&
                candidate.reviewDecision === "import-as-new" &&
                Boolean(matchEditorOrigins[candidate.id]);
              const canResetChanges = hasTransactionImportCandidateChanges({
                candidate,
                preparedCandidate: preparedCandidates[candidate.id],
                manualEdits: manualCandidateEdits[candidate.id],
                hasMatchEditorOrigin: Boolean(matchEditorOrigins[candidate.id]),
                hasMatchedTransactionOrigin: Boolean(
                  matchedTransactionOrigins[candidate.id],
                ),
                historicalUpdates: historicalRegisterPayeeUpdates,
              });
              const manualEditsForCandidate =
                manualCandidateEdits[candidate.id];
              const hasManualProposalEdits = Boolean(
                manualEditsForCandidate?.payee ||
                  manualEditsForCandidate?.category ||
                  manualEditsForCandidate?.memo ||
                  candidate.lifecycle.proposal.tagIds?.length ||
                  candidate.lifecycle.proposal.attachments?.length,
              );
              const showUnmatchedComparison =
                !hasMatch &&
                candidate.status !== "invalid" &&
                (availableRegisterMatchCandidates.length > 0 ||
                  hasManualProposalEdits);
              const activeProcessingCandidate =
                processingCandidate?.id === candidate.id
                  ? processingCandidate
                  : null;
              return (
                <article
                  className={`transaction-import-review-card transaction-import-review-card-${candidate.status}${
                    activeProcessingCandidate
                      ? ` transaction-import-review-card-processing transaction-import-review-card-processing-${activeProcessingCandidate.action}`
                      : ""
                  }`}
                  key={candidate.id}
                  tabIndex={0}
                  data-import-candidate-card
                  data-import-candidate-id={candidate.id}
                  onKeyDown={(event) =>
                    handleCandidateKeyDown(
                      event,
                      candidate,
                      isMatchConvertedToNew,
                    )
                  }
                >
                  {activeProcessingCandidate ? (
                    <div
                      className="transaction-import-processing-feedback"
                      aria-live="polite"
                >
                      <span aria-hidden="true">✓</span>
                      {activeProcessingCandidate.action === "matched"
                        ? "Using existing"
                        : activeProcessingCandidate.action === "skipped"
                          ? "Skipped"
                          : "Import as new"}
                    </div>
                  ) : null}
                  <div className="transaction-import-review-kind">
                    <strong>{reviewPresentation.title}</strong>
                    <span>{reviewPresentation.subtext}</span>
                  </div>
                  <div className="transaction-import-match-stack">
                    <div className="transaction-import-match-entry">
                      <span className="transaction-import-match-caption">
                        {hasMatch ? <b>A</b> : null}
                        Bank transaction
                      </span>
                      <div className="transaction-import-match-row transaction-import-match-row-imported">
                        <span className="transaction-import-match-date">
                          {formatImportReviewDate(bankParsed.date)}
                        </span>
                        <strong className="transaction-import-match-payee">
                          {sourcePayee || "Missing payee"}
                          {!hasManualProposalEdits &&
                          candidate.lifecycle.proposal.payee !== sourcePayee ? (
                            <small className="transaction-import-payee-alias-note">
                              Imports as {candidate.lifecycle.proposal.payee}
                            </small>
                          ) : null}
                        </strong>
                        <span className="transaction-import-match-category">
                          {candidate.lifecycle.source.transferAccountName
                            ? `${accountName} → ${candidate.lifecycle.source.transferAccountName}`
                            : candidate.lifecycle.source.importedCategoryName ?? "—"}
                        </span>
                        <span className="transaction-import-match-memo">
                          {candidate.lifecycle.source.memo || "—"}
                        </span>
                        <strong className={`transaction-import-match-amount ${bankParsed.inflow > 0 && bankParsed.outflow === 0 ? "money-positive" : bankParsed.outflow > 0 ? "money-negative" : ""}`}>
                          {amountLabel}
                        </strong>
                      </div>
                    </div>

                    {showUnmatchedComparison ? (
                      <>
                        <div className="transaction-import-match-arrow" aria-hidden="true">↔</div>
                        <div className="transaction-import-match-entry">
                          <span className="transaction-import-match-caption">
                            <b>B</b>
                            {availableRegisterMatchCandidates.length
                              ? "Possible register match"
                              : "Proposed transaction"}
                          </span>
                          <div className="transaction-import-match-row transaction-import-match-row-existing">
                            <span className="transaction-import-match-date">
                              {formatImportReviewDate(
                                availableRegisterMatchCandidates[0]?.transaction.date ??
                                  bankParsed.date,
                              )}
                            </span>
                            <strong className="transaction-import-match-payee">
                              {availableRegisterMatchCandidates[0]?.transaction.payee ??
                                candidate.lifecycle.proposal.payee ??
                                "Choose payee"}
                            </strong>
                            <span className="transaction-import-match-category">
                              {availableRegisterMatchCandidates[0]?.transaction.category ??
                                candidate.lifecycle.proposal.transferAccountName ??
                                candidate.lifecycle.proposal.categoryName ??
                                "Choose category"}
                            </span>
                            <span className="transaction-import-match-memo">
                              {availableRegisterMatchCandidates[0]?.transaction.memo ??
                                candidate.lifecycle.proposal.memo ??
                                "—"}
                              {(availableRegisterMatchCandidates[0]?.transaction.tagIds?.length ??
                                candidate.lifecycle.proposal.tagIds?.length ??
                                0) > 0 ? (
                                <small>
                                  Tags: {(availableRegisterMatchCandidates[0]?.transaction.tagIds ??
                                    candidate.lifecycle.proposal.tagIds ??
                                    []).map((tagId) =>
                                      transactionTags.find((tag) => tag.id === tagId)?.name ?? tagId
                                    ).join(", ")}
                                </small>
                              ) : null}
                              {(availableRegisterMatchCandidates[0]?.transaction.attachmentCount ??
                                candidate.lifecycle.proposal.attachments?.length ??
                                0) > 0 ? (
                                <small>
                                  📎 {availableRegisterMatchCandidates[0]?.transaction.attachmentCount ??
                                    candidate.lifecycle.proposal.attachments?.length ??
                                    0}
                                </small>
                              ) : null}
                            </span>
                            <strong className={`transaction-import-match-amount ${bankParsed.inflow > 0 && bankParsed.outflow === 0 ? "money-positive" : bankParsed.outflow > 0 ? "money-negative" : ""}`}>
                              {amountLabel}
                            </strong>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {hasMatch ? (
                      <>
                        <div className="transaction-import-match-arrow" aria-hidden="true">↓</div>
                        <div className="transaction-import-match-entry">
                          <span className="transaction-import-match-caption">
                            <b>B</b>
                            Register
                          </span>
                          <div className="transaction-import-match-row transaction-import-match-row-existing">
                            <span className="transaction-import-match-date">
                              {formatImportReviewDate(candidate.matchedTransaction?.date)}
                            </span>
                            <strong className="transaction-import-match-payee">
                              {candidate.matchedTransaction?.payee || "—"}
                            </strong>
                            <span className="transaction-import-match-category">
                              {candidate.matchedTransaction?.splitLines?.length
                                ? `Split · ${candidate.matchedTransaction.splitLines.length} categories`
                                : candidate.matchedTransaction?.category || "—"}
                            </span>
                            <span className="transaction-import-match-memo">
                              {candidate.matchedTransaction?.memo || "—"}
                              {(candidate.matchedTransaction?.tagIds?.length ?? 0) > 0 ? (
                                <small>
                                  Tags: {(candidate.matchedTransaction?.tagIds ?? []).map((tagId) =>
                                    transactionTags.find((tag) => tag.id === tagId)?.name ?? tagId
                                  ).join(", ")}
                                </small>
                              ) : null}
                              {(candidate.matchedTransaction?.attachmentCount ??
                                candidate.matchedTransaction?.scheduledAttachments?.length ??
                                0) > 0 ? (
                                <small>
                                  📎 {candidate.matchedTransaction?.attachmentCount ??
                                    candidate.matchedTransaction?.scheduledAttachments?.length ??
                                    0}
                                </small>
                              ) : null}
                            </span>
                            <strong className={`transaction-import-match-amount ${candidate.matchedTransaction && candidate.matchedTransaction.inflow > 0 && candidate.matchedTransaction.outflow === 0 ? "money-positive" : candidate.matchedTransaction && candidate.matchedTransaction.outflow > 0 ? "money-negative" : ""}`}>
                              {matchAmountLabel}
                            </strong>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>

                  {candidateAliasSuggestion ? (
                    <div className="transaction-import-inline-alias">
                      <span>
                        Rename{" "}
                        <strong>{candidateAliasSuggestion.sourcePayee}</strong>{" "}
                        to{" "}
                        <strong>
                          {candidateAliasSuggestion.suggestedTargetPayee}
                        </strong>
                        ?
                      </span>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() =>
                          acceptAliasSuggestion(candidateAliasSuggestion.id)
                        }
                      >
                        Use Payee
                      </button>
                    </div>
                  ) : null}

                  {splitEdit?.candidateId === candidate.id ? (
                    <div className="transaction-import-split-editor">
                      <RegisterSplitEditor
                        splitLines={splitEdit.splitLines}
                        setSplitLines={updateSplitEditLines}
                        categoryOptions={categoryOptions}
                        parentOutflow={
                          splitEdit.target === "matched"
                            ? candidate.matchedTransaction?.outflow ?? 0
                            : getCandidateProposalTransaction(candidate).outflow
                        }
                        parentInflow={
                          splitEdit.target === "matched"
                            ? candidate.matchedTransaction?.inflow ?? 0
                            : getCandidateProposalTransaction(candidate).inflow
                        }
                        currencyCode={currencyCode}
                        visibleColumnIds={IMPORT_SPLIT_VISIBLE_COLUMN_IDS}
                        rowStyle={{}}
                        layoutMode="desktop"
                        onCreateCategory={onCreateCategory}
                      >
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={
                            splitEdit.splitLines.length < 2 ||
                            hasIncompleteSplitDrafts(splitEdit.splitLines) ||
                            !isSplitDraftBalanced(
                              splitEdit.target === "matched"
                                ? candidate.matchedTransaction?.outflow ?? 0
                                : getCandidateProposalTransaction(candidate).outflow,
                              splitEdit.target === "matched"
                                ? candidate.matchedTransaction?.inflow ?? 0
                                : getCandidateProposalTransaction(candidate).inflow,
                              splitEdit.splitLines,
                            )
                          }
                          onClick={() => applySplitEdit(candidate)}
                        >
                          Apply Split
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={cancelSplitEdit}
                        >
                          Cancel Split
                        </button>
                      </RegisterSplitEditor>
                    </div>
                  ) : null}

                  {candidate.status !== "invalid" ? (
                    <details className="transaction-import-more-actions">
                      <summary aria-label="More transaction actions">•••</summary>
                      <div>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={(event) => {
                            beginTransactionEdit(candidate);
                            event.currentTarget.closest("details")?.removeAttribute("open");
                          }}
                        >
                          Edit Transaction
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={Boolean(processingCandidate)}
                          onClick={(event) => {
                            void openRegisterMatchPicker(candidate.id);
                            event.currentTarget.closest("details")?.removeAttribute("open");
                          }}
                        >
                          Find Existing Transaction
                        </button>
                        {canResetChanges ? (
                          <button
                            className="button button-secondary"
                            type="button"
                            disabled={Boolean(processingCandidate)}
                            onClick={(event) => {
                              resetCandidateChanges(candidate.id);
                              event.currentTarget.closest("details")?.removeAttribute("open");
                            }}
                          >
                            Reset changes
                          </button>
                        ) : null}
                      </div>
                    </details>
                  ) : null}

                  {candidate.status === "exact-match" ? (
                    <>
                      <div className="transaction-import-match-actions">
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={
                          Boolean(processingCandidate) ||
                          splitEdit?.candidateId === candidate.id
                        }
                        onClick={() => acceptMatchedCandidate(candidate.id)}
                      >
                        {matchedTransactionOrigins[candidate.id]
                          ? "Update & Use Existing"
                          : "Use Existing"}
                      </button>
                      {matchedTransactionOrigins[candidate.id] ? (
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={Boolean(processingCandidate)}
                          onClick={() => cancelMatchedTransactionChanges(candidate.id)}
                        >
                          Cancel Changes
                        </button>
                      ) : null}
                      <button
                        className="button button-secondary"
                        type="button"
                        disabled={Boolean(processingCandidate)}
                        onClick={() =>
                          importMatchedCandidateAsNew(candidate.id)
                        }
                      >
                        Import as New
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        disabled={Boolean(processingCandidate)}
                        onClick={() => skipCandidate(candidate.id)}
                      >
                        Skip
                      </button>
                    </div>
                    </>
                  ) : null}

                  {candidate.status === "new" ||
                  candidate.status === "invalid" ? (
                    <div className="transaction-import-new-review">
                      {isMatchConvertedToNew ? (
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => returnToMatchOptions(candidate.id)}
                        >
                          Back to Match
                        </button>
                      ) : null}

                      {candidate.status === "invalid" ? (
                        <div className="transaction-import-invalid-detail">
                          <p className="transaction-import-error">
                            {candidate.reason ||
                              candidate.errors[0] ||
                              "This transaction contains invalid source data."}
                          </p>
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => setStep("mapping")}
                          >
                            Review File Settings
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {candidate.status === "new" ||
                  candidate.status === "invalid" ? (
                    <div className="transaction-import-match-actions">
                      {candidate.status === "new" && availableRegisterMatchCandidates.length ? (
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={Boolean(processingCandidate)}
                          onClick={() =>
                            selectManualRegisterTransaction(
                              candidate.id,
                              availableRegisterMatchCandidates[0]!.transaction,
                            )
                          }
                        >
                          Use This Match
                        </button>
                      ) : null}
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={
                          Boolean(processingCandidate) ||
                          splitEdit?.candidateId === candidate.id ||
                          !canImportReviewedCandidate(
                          candidate,
                          transferAccountNames,
                          )
                        }
                        onClick={() => importCandidate(candidate.id)}
                      >
                        {candidate.reconciliationKind === "transfer" ? "Import Transfer" : "Import"}
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        disabled={Boolean(processingCandidate)}
                        onClick={() => skipCandidate(candidate.id)}
                      >
                        Skip
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}

        {step === "complete" ? (
          <div className="transaction-import-complete-step">
            <div className="transaction-import-complete-icon">✓</div>
            <h3>Import complete</h3>
            <p>{message}</p>
            <button
              className="button button-primary"
              type="button"
              disabled={isImporting}
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : null}

        {developerPerformanceMode &&
        (candidates.length > 0 || processedCandidates.length > 0) ? (
          <details
            className="transaction-import-performance-panel"
            aria-label="Importer trace diagnostics"
          >
            <summary>Importer trace diagnostics</summary>
            <p className="muted">
              Developer-only structured traces. Normal import review does not
              expose reconciliation internals.
            </p>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                const traceText = serialiseTransactionImportTrace([
                  ...candidates,
                  ...processedCandidates.map((entry) => entry.candidate),
                ]);
                void navigator.clipboard?.writeText(traceText);
              }}
            >
              Copy trace JSON
            </button>
            <div className="transaction-import-performance-list">
              {[...candidates, ...processedCandidates.map((entry) => entry.candidate)].map(
                (candidate) => (
                  <details key={`trace-${candidate.id}`}>
                    <summary>
                      Row {candidate.parsed.rowNumber}: {candidate.parsed.payee}
                    </summary>
                    <pre>{JSON.stringify(candidate.trace ?? [], null, 2)}</pre>
                  </details>
                ),
              )}
            </div>
          </details>
        ) : null}

        {developerPerformanceMode && performanceReport ? (
          <div
            className="transaction-import-performance-panel"
            aria-label="Import performance diagnostics"
          >
            <div className="transaction-import-section-heading">
              <div>
                <h3>Import performance</h3>
                <p className="muted">
                  Total measured time:{" "}
                  {formatImportDuration(performanceReport.totalMs)}
                </p>
              </div>
            </div>
            <div className="transaction-import-performance-list">
              {performanceReport.entries.map((entry) => (
                <div
                  className="transaction-import-performance-row"
                  key={entry.label}
                >
                  <span>{entry.label}</span>
                  <strong>{formatImportDuration(entry.durationMs)}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {transactionEditDraft && transactionEditCandidate ? (
          <div
            className="transaction-import-transaction-editor-backdrop"
            role="presentation"
            onClick={closeTransactionEdit}
          >
            <section
              className="transaction-import-transaction-editor"
              role="dialog"
              aria-modal="true"
              aria-labelledby="transaction-import-edit-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <h3 id="transaction-import-edit-title">Edit transaction</h3>
                  <p>
                    Date and amount come from the bank file and cannot be changed here.
                  </p>
                </div>
                <button
                  className="transaction-import-close-button"
                  type="button"
                  aria-label="Close transaction editor"
                  onClick={closeTransactionEdit}
                >
                  ×
                </button>
              </header>

              <div className="transaction-import-transaction-editor-source">
                <span><strong>Date</strong>{formatImportReviewDate(transactionEditCandidate.parsed.date)}</span>
                <span><strong>Amount</strong>{formatMoney(
                  transactionEditCandidate.parsed.inflow - transactionEditCandidate.parsed.outflow,
                  currencyCode,
                )}</span>
              </div>

              <label>
                <span>Payee</span>
                <PayeeInput
                  value={transactionEditDraft.payee}
                  transferAccounts={transferAccounts.filter(
                    (account) => account.id !== selectedAccountId,
                  )}
                  payeeOptions={payeeOptions}
                  onChange={(value) =>
                    setTransactionEditDraft((current) =>
                      current ? { ...current, payee: value } : current,
                    )
                  }
                  onSelection={(value) =>
                    setTransactionEditDraft((current) =>
                      current ? { ...current, payee: value } : current,
                    )
                  }
                />
              </label>

              <label>
                <span>Category</span>
                <RegisterCategoryInput
                  value={transactionEditDraft.category}
                  categoryOptions={categoryOptions}
                  includeSplitOption
                  onCreateCategory={onCreateCategory}
                  onChange={(value) =>
                    setTransactionEditDraft((current) =>
                      current ? { ...current, category: value } : current,
                    )
                  }
                  onSelection={(value) =>
                    setTransactionEditDraft((current) =>
                      current ? { ...current, category: value } : current,
                    )
                  }
                />
              </label>

              <label>
                <span>Memo</span>
                <input
                  value={transactionEditDraft.memo}
                  onChange={(event) =>
                    setTransactionEditDraft((current) =>
                      current ? { ...current, memo: event.target.value } : current,
                    )
                  }
                />
                <small>
                  A memo saved here is kept even when “Don’t import transaction memos” is enabled.
                </small>
              </label>

              <fieldset className="transaction-import-transaction-editor-tags">
                <legend>Tags</legend>
                {transactionTags.length === 0 ? (
                  <span className="muted">No tags have been created yet.</span>
                ) : (
                  transactionTags.map((tag) => (
                    <label key={tag.id}>
                      <input
                        type="checkbox"
                        checked={transactionEditDraft.tagIds.includes(tag.id)}
                        onChange={(event) =>
                          setTransactionEditDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  tagIds: event.target.checked
                                    ? [...new Set([...current.tagIds, tag.id])]
                                    : current.tagIds.filter((tagId) => tagId !== tag.id),
                                }
                              : current,
                          )
                        }
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))
                )}
              </fieldset>

              <div className="transaction-import-transaction-editor-attachments">
                <div>
                  <strong>Attachments</strong>
                  {transactionEditCandidate.matchedTransaction?.attachmentCount ? (
                    <small>
                      {transactionEditCandidate.matchedTransaction.attachmentCount} existing attachment
                      {transactionEditCandidate.matchedTransaction.attachmentCount === 1 ? "" : "s"} will remain.
                    </small>
                  ) : null}
                </div>
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  disabled={transactionEditAttachmentBusy}
                  onChange={(event) => {
                    void addTransactionEditAttachments(event.target.files);
                    event.target.value = "";
                  }}
                />
                {transactionEditDraft.attachments.length > 0 ? (
                  <ul>
                    {transactionEditDraft.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <span>{attachment.fileName}</span>
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={transactionEditAttachmentBusy}
                          onClick={() =>
                            setTransactionEditDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    attachments: current.attachments.filter(
                                      (entry) => entry.id !== attachment.id,
                                    ),
                                  }
                                : current,
                            )
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {transactionEditError ? (
                <p className="transaction-import-error">{transactionEditError}</p>
              ) : null}

              <footer>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={transactionEditAttachmentBusy}
                  onClick={closeTransactionEdit}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={transactionEditAttachmentBusy}
                  onClick={() => saveTransactionEdit(transactionEditCandidate)}
                >
                  Save transaction
                </button>
              </footer>
            </section>
          </div>
        ) : null}

        {weakMatchReviewCandidate ? (
          <div
            className="transaction-import-possible-match-backdrop"
            role="presentation"
            onClick={() => setWeakMatchReviewCandidateId(null)}
          >
            <section
              className="transaction-import-possible-match-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="transaction-import-possible-match-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header>
                <div>
                  <h3 id="transaction-import-possible-match-title">
                    Find a register transaction
                  </h3>
                  <p>
                    Same-account transactions with the same signed amount are
                    eligible. Automatic matching rules are not changed.
                  </p>
                </div>
                <button
                  className="transaction-import-close-button"
                  type="button"
                  aria-label="Close possible matches"
                  onClick={() => setWeakMatchReviewCandidateId(null)}
                >
                  ×
                </button>
              </header>
              <label className="transaction-import-match-search">
                <span>Search matches</span>
                <input
                  type="search"
                  value={manualMatchSearch}
                  placeholder="Payee, memo, date or category"
                  onChange={(event) => setManualMatchSearch(event.target.value)}
                />
              </label>
              <div
                className="transaction-import-possible-match-list"
                role="listbox"
                aria-label="Possible register transactions"
              >
                {manualMatchLoading ? <p>Loading register transactions…</p> : null}
                {!manualMatchLoading && availableManualMatchTransactions.length === 0 ? (
                  <p>No eligible same-amount register transactions found.</p>
                ) : null}
                {availableManualMatchTransactions.map((transaction) => {
                  const signedAmount = transaction.inflow - transaction.outflow;
                  return (
                    <article
                      className="transaction-import-possible-match-card"
                      key={transaction.id}
                    >
                      <dl>
                        <div><dt>Date</dt><dd>{formatImportReviewDate(transaction.date)}</dd></div>
                        <div><dt>Payee</dt><dd>{transaction.payee || "—"}</dd></div>
                        <div><dt>Amount</dt><dd>{formatMoney(signedAmount, currencyCode)}</dd></div>
                        <div><dt>Category</dt><dd>{transaction.category || "—"}</dd></div>
                        <div><dt>Memo</dt><dd>{transaction.memo || "—"}</dd></div>
                        <div><dt>Cleared</dt><dd>{transaction.cleared ? "Cleared" : "Uncleared"}</dd></div>
                      </dl>
                      <button
                        className="button button-primary"
                        type="button"
                        role="option"
                        aria-selected="false"
                        onClick={() => {
                          const selected = selectManualRegisterTransaction(
                            weakMatchReviewCandidate.id,
                            transaction,
                          );
                          if (selected) setWeakMatchReviewCandidateId(null);
                        }}
                      >
                        Use this transaction
                      </button>
                    </article>
                  );
                })}
              </div>
              <footer>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setWeakMatchReviewCandidateId(null)}
                >
                  Cancel
                </button>
              </footer>
            </section>
          </div>
        ) : null}

        {step === "review" &&
        candidates.length > 0 &&
        qifDateInterpretationResolved &&
        qifAmountInterpretationResolved ? (
          <div className="transaction-import-footer">
            <div>
              <strong>{candidates.length} remaining</strong>
            </div>
            <div className="transaction-import-footer-actions">
              <button
                className={`button button-secondary${historyPulse ? " transaction-import-history-pulse" : ""}`}
                type="button"
                disabled={processedCandidates.length === 0}
                onClick={() => setHistoryOpen((open) => !open)}
              >
                History ({processedCount})
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void discardImportSession()}
              >
                Discard Import Session
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
