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
import type { PayeeView } from "../payeeService";
import type { SidebarAccount } from "../accountService";
import {
  commitImportSession,
  ImportCommitExecutionError,
} from "../importCommitEngine";
import type {
  NewRegisterTransactionInput,
  RegisterTransactionView,
} from "../accountRegisterTypes";
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
  readPreviouslyImportedSourceOccurrences,
  type ImportedTransactionFileType,
} from "../transactionImportKnowledge";
import { calculateTransactionImportBalancePreview } from "../transactionImportBalancePreview";
import { resolvePayeeRecognition } from "../payeeRecognition";
import {
  summariseTransactionImportOutcomes,
  verifyPersistedImportTransactions,
} from "../transactionImportVerification";

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

type TransactionImportStep = "upload" | "mapping" | "review" | "complete";
type TransactionImportFileType =
  "csv" | "qif" | "ofx" | "qfx" | "json" | "unknown";

type ProcessedImportAction = "imported" | "matched" | "skipped";

type ProposedTransactionEditField = "payee" | "category";

interface ProposedTransactionEdit {
  candidateId: string;
  field: ProposedTransactionEditField;
  draftValue: string;
}

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

  return hasDate && hasPayee && hasAmount && hasValidTransfer;
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
  loadAccountWorkingBalance,
  onImportTransactions,
  onUpdateMatchedTransactionDates,
  onCommitRegisterChanges,
  payeeOptions,
  categoryOptions,
  transferAccounts,
  onCreatePayee,
  onCreateCategory,
}: {
  initialAccountId: string;
  accounts: { id: string; name: string }[];
  currencyCode: string;
  onClose: () => void;
  loadAccountTransactions: (
    accountId: string,
    range?: { readonly fromDate: string; readonly toDate: string },
  ) => Promise<RegisterTransactionView[]>;
  loadTransactionsByIds: (
    accountId: string,
    transactionIds: readonly string[],
  ) => Promise<RegisterTransactionView[]>;
  loadAccountWorkingBalance: (accountId: string) => Promise<number>;
  onImportTransactions: (
    accountId: string,
    transactions: NewRegisterTransactionInput[],
  ) => Promise<void>;
  onUpdateMatchedTransactionDates: (
    accountId: string,
    transactions: RegisterTransactionView[],
  ) => Promise<void>;
  onCommitRegisterChanges?: (
    accountId: string,
    additions: NewRegisterTransactionInput[],
    updates: RegisterTransactionView[],
  ) => Promise<void>;
  payeeOptions: PayeeView[];
  categoryOptions: BudgetCategoryOption[];
  transferAccounts: SidebarAccount[];
  onCreatePayee?: (name: string) => Promise<PayeeView>;
  onCreateCategory?: (
    input: RegisterInlineCategoryCreateInput,
  ) => Promise<BudgetCategoryOption>;
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
  const [bankCandidateDetails, setBankCandidateDetails] = useState<
    Record<string, TransactionImportCandidate["parsed"]>
  >({});
  const [processedCandidates, setProcessedCandidates] = useState<
    ProcessedImportCandidate[]
  >([]);
  const [matchEditorOrigins, setMatchEditorOrigins] = useState<
    Record<string, TransactionImportCandidate>
  >({});
  const [matchedTransactionOrigins, setMatchedTransactionOrigins] = useState<
    Record<string, RegisterTransactionView>
  >({});
  const [proposedTransactionEdit, setProposedTransactionEdit] =
    useState<ProposedTransactionEdit | null>(null);
  const [weakMatchReviewCandidateId, setWeakMatchReviewCandidateId] =
    useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoredCandidateId, setRestoredCandidateId] = useState<string | null>(null);
  const [processingCandidate, setProcessingCandidate] = useState<{
    id: string;
    action: ProcessedImportAction;
  } | null>(null);
  const processingCandidateRef = useRef<string | null>(null);
  const [historyPulse, setHistoryPulse] = useState(false);
  const [aliasSuggestions, setAliasSuggestions] = useState<
    TransactionPayeeAliasSuggestion[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisStageIndex, setAnalysisStageIndex] = useState(0);
  const [excludeMemos, setExcludeMemos] = useState(false);
  const [updateMatchedTransactionDates, setUpdateMatchedTransactionDates] =
    useState(
      () => readTransactionImportPreferences().updateMatchedTransactionDates,
    );
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
    setCandidates(saved.candidates);
    setBankCandidateDetails(saved.bankCandidateDetails);
    setProcessedCandidates(saved.processedCandidates);
    setMatchEditorOrigins(saved.matchEditorOrigins);
    setMatchedTransactionOrigins(saved.matchedTransactionOrigins);
    setPreviouslyImportedCount(saved.previouslyImportedCount);
    setAlreadyRepresentedCount(saved.alreadyRepresentedCount);
    setExcludeMemos(saved.excludeMemos);
    setUpdateMatchedTransactionDates(saved.updateMatchedTransactionDates);
    setStep("review");
    setMessage(
      `Restored your saved review for ${saved.fileName ?? "this import"}.`,
    );
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
        version: 1,
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
        bankCandidateDetails,
        processedCandidates,
        matchEditorOrigins,
        matchedTransactionOrigins,
        previouslyImportedCount,
        alreadyRepresentedCount,
        excludeMemos,
        updateMatchedTransactionDates,
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
    qifAmountFormat, analysis, mapping, candidates, bankCandidateDetails,
    processedCandidates, matchEditorOrigins, matchedTransactionOrigins,
    previouslyImportedCount, alreadyRepresentedCount, excludeMemos,
    updateMatchedTransactionDates,
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
    setBankCandidateDetails({});
    setProcessedCandidates([]);
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

  function applyPreview(
    nextPreview: TransactionImportPreview,
    existingTransactions: RegisterTransactionView[],
    nextMessage: string,
    sourceFileType: ImportedTransactionFileType,
    accountId = selectedAccountId,
    sourceFileHash: string | null = fileHash,
  ) {
    const partition = partitionPreviouslyImportedCandidates({
      accountId,
      fileType: sourceFileType,
      candidates: nextPreview.candidates,
    });
    const previouslyImportedSourceOccurrences =
      readPreviouslyImportedSourceOccurrences({
        accountId,
        fileType: sourceFileType,
        candidates: partition.activeCandidates,
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
    });

    setBankCandidateDetails(prepared.bankCandidateDetails);
    setPreview(prepared.preview);
    setCandidates(sortImportCandidates(prepared.reviewCandidates));
    setPreviouslyImportedCount(prepared.previouslyImportedCount);
    setAlreadyRepresentedCount(prepared.alreadyRepresentedCount);
    setProcessedCandidates([]);
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
    setBankCandidateDetails({});
    setProcessedCandidates([]);
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
      const nextPreview = previewTransactionQifImport(
        qifText,
        nextTransactions,
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
      applyPreview(
        nextPreview,
        nextTransactions,
        `${nextPreview.summary.totalRows} QIF transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
        "qif",
        accountId,
      );
      return;
    }

    if ((fileType === "ofx" || fileType === "qfx") && ofxText) {
      const nextPreview = previewTransactionOfxImport(
        ofxText,
        nextTransactions,
        resolveMerchantForMatching,
      );
      applyPreview(
        nextPreview,
        nextTransactions,
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
        const nextPreview = previewTransactionCsvImport(
          csvText,
          nextTransactions,
          nextMapping,
          resolveMerchantForMatching,
        );
        applyPreview(
          nextPreview,
          nextTransactions,
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

  function updateQifInterpretation(
    nextDateFormat: QifDateFormat,
    nextAmountFormat: QifAmountFormat,
  ) {
    if (!qifText) return;

    setQifDateFormat(nextDateFormat);
    setQifAmountFormat(nextAmountFormat);
    const nextPreview = previewTransactionQifImport(
      qifText,
      transactions,
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
    applyPreview(
      nextPreview,
      transactions,
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

  function buildQifPreview() {
    if (!qifText) {
      setError("Choose a QIF file first.");
      return;
    }
    const nextPreview = previewTransactionQifImport(
      qifText,
      transactions,
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
    applyPreview(
      nextPreview,
      transactions,
      `${nextPreview.summary.totalRows} QIF transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
      "qif",
      selectedAccountId,
      fileHash,
    );
  }

  function buildOfxPreview() {
    if (!ofxText || (fileType !== "ofx" && fileType !== "qfx")) {
      setError("Choose an OFX or QFX file first.");
      return;
    }
    const nextPreview = previewTransactionOfxImport(
      ofxText,
      transactions,
      resolveMerchantForMatching,
    );
    if (nextPreview.candidates.length === 0) {
      setError("The OFX/QFX file does not appear to contain any transactions.");
      return;
    }
    applyPreview(
      nextPreview,
      transactions,
      `${nextPreview.summary.totalRows} ${getFileTypeLabel(fileType)} transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
      fileType,
      selectedAccountId,
      fileHash,
    );
  }

  function buildCsvPreview(
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
    const existingTransactions = options.existingTransactions ?? transactions;
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
    applyPreview(
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
    setAliasSuggestions([]);
    setMessage(null);
    setError(null);
  }

  function processCandidate(
    candidateId: string,
    action: ProcessedImportAction,
  ) {
    if (processingCandidateRef.current) return;

    const candidate = candidates.find((entry) => entry.id === candidateId);
    if (!candidate) return;

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
          [candidate.id]: candidate,
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

  function beginProposedTransactionEdit(
    candidateId: string,
    field: ProposedTransactionEditField,
    _value: string,
  ) {
    setProposedTransactionEdit({ candidateId, field, draftValue: "" });
  }

  function updateProposedTransactionDraft(value: string) {
    setProposedTransactionEdit((current) =>
      current ? { ...current, draftValue: value } : current,
    );
  }

  function cancelProposedTransactionEdit() {
    setProposedTransactionEdit(null);
  }

  function commitProposedTransactionEdit(
    candidateId: string,
    field: ProposedTransactionEditField,
    value: string,
  ) {
    if (field === "payee") {
      const currentCandidate = candidates.find(
        (candidate) => candidate.id === candidateId,
      );
      const built = buildTransactionImportMerchantProposal({
        store: merchantKnowledgeRef.current,
        rawPayee: value,
        transaction: currentCandidate?.parsed ?? { inflow: 0, outflow: 0 },
        currentProposal: currentCandidate?.lifecycle.proposal,
      });
      updateCandidateDetails(candidateId, {
        payee: built.proposal.payee,
        transferAccountName:
          built.proposal.transferAccountName ?? undefined,
        importedCategoryName: built.proposal.categoryName ?? undefined,
      });
    } else {
      updateCandidateDetails(candidateId, {
        importedCategoryName: value || undefined,
        transferAccountName: undefined,
      });
    }
    setProposedTransactionEdit(null);
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
  ) {
    setCandidates((current) =>
      current.map((candidate) => {
        if (candidate.id !== candidateId) return candidate;
        const selected = candidate.matchCandidates?.find(
          (option) => option.transaction.id === transactionId,
        );
        if (!selected) return candidate;
        return {
          ...candidate,
          status: "exact-match" as const,
          recommendation: "match" as const,
          matchedTransactionId: selected.transaction.id,
          matchedTransaction: selected.transaction,
          evidence: selected.evidence,
          reason: selected.reason,
        };
      }),
    );
    setMatchedTransactionOrigins((origins) => {
      const next = { ...origins };
      delete next[candidateId];
      return next;
    });
    setProposedTransactionEdit(null);
    setError(null);
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
    setProposedTransactionEdit(null);
  }

  function returnToMatchOptions(candidateId: string) {
    const origin = matchEditorOrigins[candidateId];
    if (!origin) return;

    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId ? origin : candidate,
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

  function acceptAliasSuggestion(suggestionId: string) {
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
      const result = await commitImportSession(
        {
          accountId: selectedAccountId,
          accountName,
          importedCandidates,
          matchedCandidates,
          completedSourceCandidates,
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
          ...(onCommitRegisterChanges
            ? { commitTransactionBatch: onCommitRegisterChanges }
            : {}),
          verifyCommittedTransactions: async (accountId, additions) => {
            const ids = additions.map((transaction) => {
              if (!transaction.id) {
                throw new Error("A committed import transaction has no stable ID.");
              }
              return transaction.id;
            });
            const persisted = await loadTransactionsByIds(accountId, ids);
            verifyPersistedImportTransactions(additions, persisted);
          },
          addTransactions: onImportTransactions,
          updateTransactions: onUpdateMatchedTransactionDates,
        },
      );

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
          `${completion.failed} failed in ${accountName}.`,
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

  const weakMatchReviewCandidate = weakMatchReviewCandidateId
    ? candidates.find(
        (candidate) => candidate.id === weakMatchReviewCandidateId,
      ) ?? null
    : null;

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
                    onChange={(event) => setExcludeMemos(event.target.checked)}
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
              const activeProcessingCandidate =
                processingCandidate?.id === candidate.id
                  ? processingCandidate
                  : null;
              const activeProposedTransactionEdit =
                proposedTransactionEdit?.candidateId === candidate.id
                  ? proposedTransactionEdit
                  : null;
              const matchedIdsUsedByOtherRows = new Set(
                candidates
                  .filter((entry) => entry.id !== candidate.id)
                  .map((entry) => entry.matchedTransactionId)
                  .filter((id): id is string => Boolean(id)),
              );

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
                    {candidate.status === "exact-match"
                      ? "Using existing transaction"
                      : candidate.status === "invalid"
                        ? "Invalid data"
                        : candidate.reconciliationKind === "transfer"
                          ? "New transfer"
                          : "New transaction"}
                  </div>
                  <div className="transaction-import-match-stack">
                    <div className="transaction-import-match-row transaction-import-match-row-imported">
                      <span className="transaction-import-match-label">
                        {hasMatch ? <b>A</b> : null}
                        <span>{hasMatch ? "Bank" : candidate.status === "invalid" ? "Bank" : "Bank file"}</span>
                      </span>
                      <span className="transaction-import-match-date">
                        {formatImportReviewDate(bankParsed.date)}
                      </span>
                      <strong className="transaction-import-match-payee">
                        {hasMatch
                          ? bankParsed.payee || "Missing payee"
                          : candidate.lifecycle.proposal.payee || bankParsed.payee || "Choose payee"}
                        {!hasMatch && candidate.lifecycle.proposal.payee !== bankParsed.payee ? (
                          <small className="transaction-import-payee-alias-note">
                            Bank: {bankParsed.payee || "Missing payee"}
                          </small>
                        ) : candidate.lifecycle.merchant.aliasSourcePayee ? (
                          <small className="transaction-import-payee-alias-note">
                            Imports as {candidate.lifecycle.proposal.payee}
                          </small>
                        ) : null}
                        {candidate.lifecycle.merchant.canonicalPayee !== sourcePayee ? (
                          <small className="transaction-import-payee-alias-note">
                            Source: {sourcePayee} · Recognised as {candidate.lifecycle.merchant.canonicalPayee}
                            {candidate.lifecycle.merchant.recognitionReason
                              ? ` · ${candidate.lifecycle.merchant.recognitionReason}`
                              : ""}
                          </small>
                        ) : null}
                      </strong>
                      <span className="transaction-import-match-detail">
                        {hasMatch
                          ? bankParsed.memo || "—"
                          : candidate.lifecycle.proposal.transferAccountName
                            ? `${accountName} → ${candidate.lifecycle.proposal.transferAccountName}`
                            : candidate.lifecycle.proposal.categoryName || "Choose category"}
                      </span>
                      <strong className={`transaction-import-match-amount ${bankParsed.inflow > 0 && bankParsed.outflow === 0 ? "money-positive" : bankParsed.outflow > 0 ? "money-negative" : ""}`}>
                        {amountLabel}
                      </strong>
                    </div>

                    {hasMatch ? (
                      <>
                        <div
                          className="transaction-import-match-arrow"
                          aria-hidden="true"
                        >
                          ↓
                        </div>
                        <div className="transaction-import-match-row transaction-import-match-row-existing">
                          <span className="transaction-import-match-label">
                            <b>B</b>
                            <span>Register</span>
                          </span>
                          <span className="transaction-import-match-date">
                            {formatImportReviewDate(
                              candidate.matchedTransaction?.date,
                            )}
                          </span>
                          <div
                            className="transaction-import-proposed-field transaction-import-proposed-payee"
                          >
                            {activeProposedTransactionEdit &&
                            activeProposedTransactionEdit.field === "payee" ? (
                              <PayeeInput
                                value={activeProposedTransactionEdit.draftValue}
                                transferAccounts={transferAccounts.filter(
                                  (account) => account.id !== selectedAccountId,
                                )}
                                payeeOptions={payeeOptions}
                                autoFocus
                                openOnFocus
                                onCreatePayee={onCreatePayee}
                                onChange={updateProposedTransactionDraft}
                                onSelection={(value) => {
                                  const built =
                                    buildTransactionImportMerchantProposal({
                                      store: merchantKnowledgeRef.current,
                                      rawPayee: value,
                                      transaction: candidate.parsed,
                                      fallbackCategoryName:
                                        candidate.matchedTransaction?.category,
                                    });
                                  const transferAccount = transferAccounts.find(
                                    (account) =>
                                      account.name.toLocaleLowerCase() ===
                                      built.proposal.transferAccountName?.toLocaleLowerCase(),
                                  );
                                  const suggestedCategory = categoryOptions.find(
                                    (category) =>
                                      category.name.toLocaleLowerCase() ===
                                      built.proposal.categoryName?.toLocaleLowerCase(),
                                  );
                                  updateMatchedTransactionDetails(candidate.id, {
                                    payee: built.proposal.payee,
                                    payeeId: undefined,
                                    transferAccountId: transferAccount?.id,
                                    category:
                                      built.proposal.categoryName ?? "",
                                    categoryId: built.proposal.transferAccountName
                                      ? undefined
                                      : suggestedCategory?.id ??
                                        candidate.matchedTransaction?.categoryId,
                                    splitLines: built.proposal.transferAccountName
                                      ? undefined
                                      : candidate.matchedTransaction?.splitLines,
                                  });
                                  setProposedTransactionEdit(null);
                                }}
                                onCancel={cancelProposedTransactionEdit}
                                onBlurOutside={cancelProposedTransactionEdit}
                              />
                            ) : candidate.matchCandidates &&
                              candidate.matchCandidates.length > 1 ? (
                              <details className="transaction-import-register-match-picker">
                                <summary
                                  className="transaction-import-register-match-summary"
                                  aria-label="Choose matched register transaction"
                                >
                                  <strong>
                                    {candidate.matchedTransaction?.payee || "—"}
                                  </strong>
                                </summary>
                                <div
                                  className="transaction-import-register-match-options"
                                  role="listbox"
                                  aria-label="Eligible register transactions"
                                >
                                  {candidate.matchCandidates.map((option) => {
                                    const isSelected =
                                      option.transaction.id ===
                                      candidate.matchedTransactionId;
                                    const isUnavailable =
                                      !isSelected &&
                                      matchedIdsUsedByOtherRows.has(
                                        option.transaction.id,
                                      );

                                    return (
                                      <button
                                        className={`transaction-import-register-match-option${
                                          isSelected
                                            ? " transaction-import-register-match-option-selected"
                                            : ""
                                        }`}
                                        key={option.transaction.id}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        disabled={isUnavailable}
                                        onClick={(event) => {
                                          selectMatchedRegisterTransaction(
                                            candidate.id,
                                            option.transaction.id,
                                          );
                                          event.currentTarget
                                            .closest("details")
                                            ?.removeAttribute("open");
                                        }}
                                      >
                                        <strong>
                                          {option.transaction.payee || "—"}
                                        </strong>
                                        <span>
                                          {formatImportReviewDate(
                                            option.transaction.date,
                                          )}
                                          {" · "}
                                          {option.transaction.category || "—"}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </details>
                            ) : (
                              <strong>
                                {candidate.matchedTransaction?.payee || "—"}
                              </strong>
                            )}
                          </div>
                          <div
                            className="transaction-import-proposed-field transaction-import-proposed-category"
                          >
                            {activeProposedTransactionEdit &&
                            activeProposedTransactionEdit.field === "category" ? (
                              <RegisterCategoryInput
                                value={activeProposedTransactionEdit.draftValue}
                                categoryOptions={categoryOptions}
                                includeSplitOption
                                autoFocus
                                openOnFocus
                                onCreateCategory={onCreateCategory}
                                onChange={updateProposedTransactionDraft}
                                onSelection={(value) => {
                                  const selectedCategory = categoryOptions.find(
                                    (category) => category.name === value,
                                  );
                                  updateMatchedTransactionDetails(candidate.id, {
                                    category: value,
                                    categoryId:
                                      value === "Split"
                                        ? undefined
                                        : selectedCategory?.id,
                                    splitLines: value === "Split"
                                      ? candidate.matchedTransaction?.splitLines
                                      : undefined,
                                  });
                                  setProposedTransactionEdit(null);
                                }}
                                onCancel={cancelProposedTransactionEdit}
                                onBlurOutside={cancelProposedTransactionEdit}
                              />
                            ) : (
                              <span >
                                {candidate.matchedTransaction?.splitLines?.length
                                  ? `Split · ${candidate.matchedTransaction.splitLines.length} categories`
                                  : candidate.matchedTransaction?.category || "—"}
                                {candidate.matchedTransaction?.memo
                                  ? ` · ${candidate.matchedTransaction.memo}`
                                  : ""}
                              </span>
                            )}
                          </div>
                          <strong className={`transaction-import-match-amount ${candidate.matchedTransaction && candidate.matchedTransaction.inflow > 0 && candidate.matchedTransaction.outflow === 0 ? "money-positive" : candidate.matchedTransaction && candidate.matchedTransaction.outflow > 0 ? "money-negative" : ""}`}>
                            {matchAmountLabel}
                          </strong>
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

                  {candidate.status === "exact-match" ? (
                    <>
                      <div className="transaction-import-edit-actions">
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => beginProposedTransactionEdit(candidate.id, "payee", candidate.matchedTransaction?.payee ?? "")}
                        >
                          Edit Payee
                        </button>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => beginProposedTransactionEdit(candidate.id, "category", candidate.matchedTransaction?.category ?? "")}
                        >
                          Edit Category
                        </button>
                      </div>
                      <div className="transaction-import-match-actions">
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={Boolean(processingCandidate)}
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
                      {candidate.status !== "invalid" ? (
                        <div className="transaction-import-edit-actions">
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => beginProposedTransactionEdit(candidate.id, "payee", candidate.lifecycle.proposal.payee)}
                          >
                            Edit Payee
                          </button>
                          {!candidate.lifecycle.proposal.transferAccountName ? (
                            <button
                              className="button button-secondary"
                              type="button"
                              onClick={() => beginProposedTransactionEdit(candidate.id, "category", candidate.lifecycle.proposal.categoryName ?? "")}
                            >
                              Edit Category
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {activeProposedTransactionEdit ? (
                        <div className="transaction-import-inline-editor">
                          {activeProposedTransactionEdit.field === "payee" ? (
                            <PayeeInput
                              value={activeProposedTransactionEdit.draftValue}
                              transferAccounts={transferAccounts.filter((account) => account.id !== selectedAccountId)}
                              payeeOptions={payeeOptions}
                              autoFocus
                              openOnFocus
                              onCreatePayee={onCreatePayee}
                              onChange={updateProposedTransactionDraft}
                              onSelection={(value) => commitProposedTransactionEdit(candidate.id, "payee", value)}
                              onCancel={cancelProposedTransactionEdit}
                              onBlurOutside={cancelProposedTransactionEdit}
                            />
                          ) : (
                            <RegisterCategoryInput
                              value={activeProposedTransactionEdit.draftValue}
                              categoryOptions={categoryOptions}
                              includeSplitOption={false}
                              autoFocus
                              openOnFocus
                              onCreateCategory={onCreateCategory}
                              onChange={updateProposedTransactionDraft}
                              onSelection={(value) => commitProposedTransactionEdit(candidate.id, "category", value)}
                              onCancel={cancelProposedTransactionEdit}
                              onBlurOutside={cancelProposedTransactionEdit}
                            />
                          )}
                        </div>
                      ) : null}

                      {isMatchConvertedToNew ? (
                        <button className="button button-secondary" type="button" onClick={() => returnToMatchOptions(candidate.id)}>
                          Back to Match
                        </button>
                      ) : null}

                      {candidate.status === "invalid" ? (
                        <div className="transaction-import-invalid-detail">
                          <p className="transaction-import-error">
                            {candidate.reason || candidate.errors[0] || "This transaction contains invalid source data."}
                          </p>
                          <button className="button button-secondary" type="button" onClick={() => setStep("mapping")}>
                            Review File Settings
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {candidate.status === "new" ||
                  candidate.status === "invalid" ? (
                    <div className="transaction-import-match-actions">
                      {candidate.status === "new" && candidate.matchCandidates?.length ? (
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={Boolean(processingCandidate)}
                          onClick={() => setWeakMatchReviewCandidateId(candidate.id)}
                        >
                          Review possible matches
                        </button>
                      ) : null}
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={
                          Boolean(processingCandidate) ||
                          !canImportReviewedCandidate(
                          candidate,
                          transferAccountNames,
                          )
                        }
                        onClick={() => importCandidate(candidate.id)}
                      >
                        {candidate.reconciliationKind === "transfer" ? "Import Transfer" : "Import Transaction"}
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

        {weakMatchReviewCandidate?.matchCandidates?.length ? (
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
                    Review possible register matches
                  </h3>
                  <p>
                    No transaction is selected. Choose one explicitly, or
                    cancel to keep this bank transaction as new.
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
              <div
                className="transaction-import-possible-match-list"
                role="listbox"
                aria-label="Possible register transactions"
              >
                {weakMatchReviewCandidate.matchCandidates.map((option) => {
                  const transaction = option.transaction;
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
                          selectMatchedRegisterTransaction(
                            weakMatchReviewCandidate.id,
                            transaction.id,
                          );
                          setWeakMatchReviewCandidateId(null);
                        }}
                      >
                        Choose this transaction
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
