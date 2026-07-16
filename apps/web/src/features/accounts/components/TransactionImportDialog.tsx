import { useEffect, useRef, useState } from "react";
import { formatDateForDisplay } from "../../settings/dateFormatting";
import { useDateFormatPreference } from "../../settings/useDateFormatPreference";
import type {
  NewRegisterTransactionInput,
  RegisterTransactionView,
} from "../accountRegisterTypes";
import {
  analyseTransactionCsvImport,
  buildRegisterTransactionsFromImport,
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
  createImportFileHash,
  createQifStructureSignature,
  findAccountImportKnowledge,
  findImportedFileFingerprint,
  rememberAccountImportKnowledge,
  rememberImportedFileFingerprint,
} from "../transactionImportKnowledge";

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

type TransactionImportStep = "upload" | "mapping" | "review" | "complete";
type TransactionImportFileType =
  "csv" | "qif" | "ofx" | "qfx" | "json" | "unknown";

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

function countMappedColumns(mapping: CsvImportColumnMapping) {
  return Object.values(mapping).filter((role) => role !== "ignore").length;
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
  onImportTransactions,
}: {
  initialAccountId: string;
  accounts: { id: string; name: string }[];
  currencyCode: string;
  onClose: () => void;
  loadAccountTransactions: (
    accountId: string,
  ) => Promise<RegisterTransactionView[]>;
  onImportTransactions: (
    accountId: string,
    transactions: NewRegisterTransactionInput[],
  ) => Promise<void>;
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
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [duplicateFileMessage, setDuplicateFileMessage] = useState<
    string | null
  >(null);
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] =
    useState<TransactionImportFileType>("unknown");
  const [analysis, setAnalysis] = useState<CsvImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<CsvImportColumnMapping>({});
  const [payeeAliases, setPayeeAliases] = useState(() =>
    readTransactionPayeeAliases(),
  );
  const [knowledgeApplied, setKnowledgeApplied] = useState(false);
  const [preview, setPreview] = useState<TransactionImportPreview | null>(null);
  const [candidates, setCandidates] = useState<TransactionImportCandidate[]>(
    [],
  );
  const [aliasSuggestions, setAliasSuggestions] = useState<
    TransactionPayeeAliasSuggestion[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [performanceReport, setPerformanceReport] =
    useState<TransactionImportPerformanceReport | null>(null);
  useEffect(() => {
    let active = true;
    void loadAccountTransactions(selectedAccountId).then((nextTransactions) => {
      if (active) setTransactions(nextTransactions);
    });
    return () => {
      active = false;
    };
  }, [loadAccountTransactions, selectedAccountId]);

  const selectedCount = candidates.filter(
    (candidate) => candidate.selected && candidate.status === "new",
  ).length;
  const selectedTotal = candidates
    .filter((candidate) => candidate.selected && candidate.status === "new")
    .reduce(
      (total, candidate) =>
        total + candidate.parsed.inflow - candidate.parsed.outflow,
      0,
    );
  const readyCount = candidates.filter(
    (candidate) => candidate.selected && candidate.status === "new",
  ).length;
  const skippedCount = candidates.filter(
    (candidate) =>
      candidate.reviewDecision === "skipped" ||
      (candidate.status === "new" && !candidate.selected),
  ).length;
  const attentionCount = candidates.filter(
    (candidate) =>
      candidate.status !== "new" && candidate.reviewDecision !== "skipped",
  ).length;

  function resetImportState() {
    setStep("upload");
    setError(null);
    setMessage(null);
    setPerformanceReport(null);
    setPreview(null);
    setCandidates([]);
    setAliasSuggestions([]);
    setAnalysis(null);
    setMapping({});
    setKnowledgeApplied(false);
    setFileHash(null);
    setDuplicateFileMessage(null);
    setCsvText(null);
    setQifText(null);
    setOfxText(null);
    setOfxInspection(null);
    setQifDetection(null);
    setQifDateFormat("DD/MM/YY");
    setQifAmountFormat("decimal-dot");
    setFileName(null);
    setFileType("unknown");
  }

  function applyPreview(
    nextPreview: TransactionImportPreview,
    existingTransactions: RegisterTransactionView[],
    nextMessage: string,
  ) {
    setPreview(nextPreview);
    setCandidates(nextPreview.candidates);
    setAliasSuggestions(
      suggestTransactionPayeeAliases({
        candidates: nextPreview.candidates,
        existingTransactions,
        aliases: payeeAliases,
      }),
    );
    setError(null);
    setMessage(nextMessage);
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
    setAliasSuggestions([]);
    setKnowledgeApplied(false);
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
      setKnowledgeApplied(Boolean(knowledge));
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
      );
      applyPreview(
        nextPreview,
        nextTransactions,
        `${nextPreview.summary.totalRows} QIF transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
      );
      return;
    }

    if ((fileType === "ofx" || fileType === "qfx") && ofxText) {
      const nextPreview = previewTransactionOfxImport(
        ofxText,
        nextTransactions,
      );
      applyPreview(
        nextPreview,
        nextTransactions,
        `${nextPreview.summary.totalRows} ${getFileTypeLabel(fileType)} transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
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
      setKnowledgeApplied(Boolean(knowledge));
      if (hasRequiredCsvMapping(nextMapping)) {
        const nextPreview = previewTransactionCsvImport(
          csvText,
          nextTransactions,
          nextMapping,
        );
        applyPreview(
          nextPreview,
          nextTransactions,
          `${nextPreview.summary.totalRows} CSV transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
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
    const timings: TransactionImportPerformanceEntry[] = [];

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

    const text = await measureAsyncImportStage(timings, "Read file text", () =>
      file.text(),
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
      setKnowledgeApplied(Boolean(useKnownDate || useKnownAmount));
      const nextPreview = previewTransactionQifImport(text, transactions, {
        sourceAccountName: accountName,
        availableTransferAccountNames: transferAccountNames,
        dateFormat: nextDateFormat,
        amountFormat: nextAmountFormat,
      });
      applyPreview(
        nextPreview,
        transactions,
        `${nextPreview.summary.totalRows} QIF transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
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
      const nextPreview = previewTransactionOfxImport(text, transactions);
      applyPreview(
        nextPreview,
        transactions,
        `${nextPreview.summary.totalRows} ${getFileTypeLabel(detectedType)} transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
      );
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
    const nextMapping = knowledge?.csvMapping ?? nextAnalysis.suggestedMapping;
    const hasRequiredMapping = measureImportStage(
      timings,
      "Validate mapping",
      () => hasRequiredCsvMapping(nextMapping),
    );

    setCsvText(text);
    setAnalysis(nextAnalysis);
    setMapping(nextMapping);
    setKnowledgeApplied(Boolean(knowledge));
    setStep(hasRequiredMapping ? "review" : "mapping");

    if (knowledge) {
      setMessage(
        `CSV detected. Previous successful settings for ${accountName} were applied.`,
      );
    }

    if (hasRequiredMapping) {
      buildCsvPreview(text, nextMapping, {
        preserveMessage: true,
        timings,
      });
      return;
    }

    setMessage(
      "CSV detected. Map the missing columns. These choices will be reused automatically for similar files imported into this account.",
    );
    setPerformanceReport(createTransactionImportPerformanceReport(timings));
  }

  function updateQifInterpretation(
    nextDateFormat: QifDateFormat,
    nextAmountFormat: QifAmountFormat,
  ) {
    if (!qifText) return;

    setQifDateFormat(nextDateFormat);
    setQifAmountFormat(nextAmountFormat);
    const nextPreview = previewTransactionQifImport(qifText, transactions, {
      sourceAccountName: accountName,
      availableTransferAccountNames: transferAccountNames,
      dateFormat: nextDateFormat,
      amountFormat: nextAmountFormat,
    });
    applyPreview(
      nextPreview,
      transactions,
      `${nextPreview.summary.totalRows} QIF transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
    );
  }

  function buildQifPreview() {
    if (!qifText) {
      setError("Choose a QIF file first.");
      return;
    }
    const nextPreview = previewTransactionQifImport(qifText, transactions, {
      sourceAccountName: accountName,
      availableTransferAccountNames: transferAccountNames,
      dateFormat: qifDateFormat,
      amountFormat: qifAmountFormat,
    });
    if (nextPreview.candidates.length === 0) {
      setError("The QIF file does not appear to contain any transactions.");
      return;
    }
    setPreview(nextPreview);
    setCandidates(nextPreview.candidates);
    setAliasSuggestions(
      suggestTransactionPayeeAliases({
        candidates: nextPreview.candidates,
        existingTransactions: transactions,
        aliases: payeeAliases,
      }),
    );
    setError(null);
    setMessage(
      `${nextPreview.summary.totalRows} QIF transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
    );
    setStep("review");
  }

  function buildOfxPreview() {
    if (!ofxText || (fileType !== "ofx" && fileType !== "qfx")) {
      setError("Choose an OFX or QFX file first.");
      return;
    }
    const nextPreview = previewTransactionOfxImport(ofxText, transactions);
    if (nextPreview.candidates.length === 0) {
      setError("The OFX/QFX file does not appear to contain any transactions.");
      return;
    }
    setPreview(nextPreview);
    setCandidates(nextPreview.candidates);
    setAliasSuggestions(
      suggestTransactionPayeeAliases({
        candidates: nextPreview.candidates,
        existingTransactions: transactions,
        aliases: payeeAliases,
      }),
    );
    setError(null);
    setMessage(
      `${nextPreview.summary.totalRows} ${getFileTypeLabel(fileType)} transaction${nextPreview.summary.totalRows === 1 ? "" : "s"} ready for review.`,
    );
    setStep("review");
  }

  function buildCsvPreview(
    nextCsvText = csvText,
    nextMapping: CsvImportColumnMapping = mapping,
    options: {
      preserveMessage?: boolean;
      timings?: TransactionImportPerformanceEntry[];
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
    const nextPreview = measureImportStage(
      timings,
      "Parse and preview CSV",
      () => previewTransactionCsvImport(nextCsvText, transactions, nextMapping),
    );
    setPreview(nextPreview);
    setCandidates(nextPreview.candidates);
    setAliasSuggestions(
      suggestTransactionPayeeAliases({
        candidates: nextPreview.candidates,
        existingTransactions: transactions,
        aliases: payeeAliases,
      }),
    );
    setStep("review");
    setPerformanceReport(createTransactionImportPerformanceReport(timings));
  }

  function updateColumnRole(columnIndex: number, role: CsvImportColumnRole) {
    setMapping((current) => ({ ...current, [columnIndex]: role }));
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

  function toggleCandidate(candidateId: string) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId && candidate.status === "new"
          ? { ...candidate, selected: !candidate.selected }
          : candidate,
      ),
    );
  }

  function acceptMatchedCandidate(candidateId: string) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId &&
        (candidate.status === "exact-match" ||
          candidate.status === "possible-match")
          ? {
              ...candidate,
              selected: false,
              reviewDecision: "matched",
              reason:
                "Matched to the existing register transaction. The imported row will not be added as a new transaction.",
            }
          : candidate,
      ),
    );
    setError(null);
  }

  function importMatchedCandidateAsNew(candidateId: string) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId &&
        (candidate.status === "exact-match" ||
          candidate.status === "possible-match")
          ? {
              ...candidate,
              status: "new",
              selected: true,
              reviewDecision: "import-as-new",
              reason:
                "This imported row will be imported as a new transaction instead of using the suggested match.",
              errors: [],
            }
          : candidate,
      ),
    );
    setError(null);
  }

  function skipCandidate(candidateId: string) {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              selected: false,
              reviewDecision: "skipped",
              reason: "This imported row will be skipped.",
            }
          : candidate,
      ),
    );
    setError(null);
  }

  function restoreCandidate(candidateId: string) {
    setCandidates((current) =>
      current.map((candidate) => {
        if (candidate.id !== candidateId) {
          return candidate;
        }

        if (candidate.status === "new") {
          return {
            ...candidate,
            selected: true,
            reviewDecision:
              candidate.reviewDecision === "skipped"
                ? undefined
                : candidate.reviewDecision,
            reason: candidate.matchedTransaction
              ? "This imported row will be imported as a new transaction instead of using the suggested match."
              : "No matching transaction found in this register.",
          };
        }

        return {
          ...candidate,
          selected: false,
          reviewDecision: undefined,
          reason:
            candidate.status === "exact-match"
              ? "Matched to an existing register transaction."
              : "Possible match restored for review.",
        };
      }),
    );
    setError(null);
  }

  function rememberPayeeAlias(candidateId: string) {
    const candidate = candidates.find((entry) => entry.id === candidateId);

    if (!candidate?.matchedTransaction) {
      return;
    }

    const sourcePayee =
      candidate.parsed.originalPayee ?? candidate.parsed.payee;
    const targetPayee = candidate.matchedTransaction.payee;

    if (
      !sourcePayee.trim() ||
      !targetPayee.trim() ||
      sourcePayee === targetPayee
    ) {
      return;
    }

    const nextAlias = createTransactionPayeeAlias({
      sourcePayee,
      targetPayee,
    });
    const nextAliases = upsertTransactionPayeeAlias(payeeAliases, nextAlias);
    setPayeeAliases(nextAliases);
    writeTransactionPayeeAliases(nextAliases);
    setCandidates((current) =>
      current.map((entry) =>
        (entry.parsed.originalPayee ?? entry.parsed.payee) === sourcePayee
          ? {
              ...entry,
              parsed: {
                ...entry.parsed,
                originalPayee: sourcePayee,
                payee: targetPayee,
                payeeAliasId: nextAlias.id,
              },
            }
          : entry,
      ),
    );
    setMessage(
      `Payee alias saved: "${sourcePayee}" will import as "${targetPayee}" next time.`,
    );
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
    setAliasSuggestions((current) =>
      current.filter((entry) => entry.id !== suggestion.id),
    );
    setCandidates((current) =>
      current.map((entry) => {
        const sourcePayee = entry.parsed.originalPayee ?? entry.parsed.payee;

        if (sourcePayee !== suggestion.sourcePayee) {
          return entry;
        }

        return {
          ...entry,
          parsed: {
            ...entry.parsed,
            originalPayee: sourcePayee,
            payee: suggestion.suggestedTargetPayee,
            payeeAliasId: nextAlias.id,
          },
        };
      }),
    );
    setMessage(
      `Payee alias saved: "${suggestion.sourcePayee}" will import as "${suggestion.suggestedTargetPayee}" next time.`,
    );
    setError(null);
  }

  function canRememberPayeeAlias(candidate: TransactionImportCandidate) {
    const sourcePayee =
      candidate.parsed.originalPayee ?? candidate.parsed.payee;
    const targetPayee = candidate.matchedTransaction?.payee;

    return Boolean(
      targetPayee &&
      sourcePayee.trim() &&
      sourcePayee.trim().toLowerCase() !== targetPayee.trim().toLowerCase(),
    );
  }

  function formatImportReviewDate(date: string | undefined) {
    return date ? formatDateForDisplay(date, dateFormat) : "—";
  }

  function getCandidateStatusLabel(candidate: TransactionImportCandidate) {
    if (
      candidate.reviewDecision === "skipped" ||
      (candidate.status === "new" && !candidate.selected)
    ) {
      return "Skipped";
    }

    switch (candidate.status) {
      case "exact-match":
        return "Matched";
      case "possible-match":
        return "Suggested Match";
      case "new":
        return candidate.selected ? "New" : "Skipped";
      case "invalid":
        return "Needs Attention";
      default:
        return candidate.status;
    }
  }

  async function importSelected() {
    const timings: TransactionImportPerformanceEntry[] = [];
    const importable = measureImportStage(timings, "Build import payload", () =>
      buildRegisterTransactionsFromImport(candidates),
    );

    if (importable.length === 0) {
      setError("No new transactions are selected for import.");
      return;
    }

    setIsImporting(true);
    setError(null);
    setMessage(
      `Importing ${importable.length} transaction${importable.length === 1 ? "" : "s"}…`,
    );

    try {
      // Keep the commit path delegated to the register page.
      // await onImportTransactions(importable)
      await measureAsyncImportStage(timings, "Commit transactions", () =>
        onImportTransactions(selectedAccountId, importable),
      );

      measureImportStage(timings, "Remember import knowledge", () => {
        if (fileType === "csv" && analysis) {
          rememberAccountImportKnowledge({
            accountId: selectedAccountId,
            fileType: "csv",
            structureSignature: getCsvImportSignature(analysis),
            csvMapping: mapping,
          });
        } else if (fileType === "qif" && qifDetection) {
          rememberAccountImportKnowledge({
            accountId: selectedAccountId,
            fileType: "qif",
            structureSignature: createQifStructureSignature(qifText ?? ""),
            qifDateFormat,
            qifAmountFormat,
          });
        }
        if (fileHash && fileName) {
          rememberImportedFileFingerprint({
            accountId: selectedAccountId,
            fileHash,
            fileName,
            importedAt: new Date().toISOString(),
            transactionCount: importable.length,
          });
        }
      });
      measureImportStage(timings, "Complete import UI update", () => {
        setMessage(
          `Imported ${importable.length} transaction${importable.length === 1 ? "" : "s"} into ${accountName}.`,
        );
        setStep("complete");
        setCandidates((current) =>
          current.map((candidate) => ({ ...candidate, selected: false })),
        );
      });
      setPerformanceReport(createTransactionImportPerformanceReport(timings));
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div
      className="transaction-import-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="transaction-import-dialog transaction-import-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="transaction-import-header">
          <div>
            <h2 id="transaction-import-title">Import Transactions</h2>
            <p className="muted">
              Select a file, check the preview, then import.
            </p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
            disabled={isImporting}
            aria-label="Close import transactions"
          >
            Close
          </button>
        </div>

        {error ? <p className="transaction-import-error">{error}</p> : null}
        {message ? (
          <p className="transaction-import-message">{message}</p>
        ) : null}
        {duplicateFileMessage ? (
          <p className="transaction-import-error">{duplicateFileMessage}</p>
        ) : null}

        {step === "review" && aliasSuggestions.length > 0 ? (
          <div className="transaction-import-alias-suggestions">
            <strong>Alias suggestions</strong>
            <p className="muted">
              These are suggestions only. Create an alias when an imported
              merchant clearly maps to one of your existing payees.
            </p>
            <ul>
              {aliasSuggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <span>
                    <strong>{suggestion.sourcePayee}</strong> →{" "}
                    <strong>{suggestion.suggestedTargetPayee}</strong>
                    <small>{suggestion.reason}</small>
                  </span>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => acceptAliasSuggestion(suggestion.id)}
                  >
                    Create Alias
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === "upload" ? (
          <div className="transaction-import-upload-step">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.qif,.ofx,.qfx,.json,text/csv"
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
              <small>Supports CSV, QIF, OFX/QFX, and JSON files</small>
            </button>
          </div>
        ) : null}

        {fileName && step !== "upload" ? (
          <div className="transaction-import-preview-toolbar">
            <div className="transaction-import-file-summary">
              <span className="transaction-import-detection-label">File</span>
              <strong title={fileName}>{fileName}</strong>
            </div>
            <label className="transaction-import-account-selector">
              <span>Destination account</span>
              <select
                value={selectedAccountId}
                disabled={isImporting}
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
          </div>
        ) : null}

        {fileName && step !== "upload" ? (
          <div className="transaction-import-detection-panel">
            <div>
              <span className="transaction-import-detection-label">
                Detected
              </span>
              <strong>{getFileTypeLabel(fileType)}</strong>
            </div>
            <div>
              <span className="transaction-import-detection-label">
                Interpretation
              </span>
              <strong>
                {knowledgeApplied
                  ? "Previous account settings"
                  : "Detected from file"}
              </strong>
            </div>
            <div>
              <span className="transaction-import-detection-label">
                Mapped Columns
              </span>
              <strong>
                {fileType === "csv"
                  ? countMappedColumns(mapping)
                  : "Not needed"}
              </strong>
            </div>
          </div>
        ) : null}

        {qifText && qifDetection && step === "review" ? (
          <div className="transaction-import-inline-settings">
            <label>
              <span>Date format</span>
              <select
                value={qifDateFormat}
                onChange={(event) =>
                  updateQifInterpretation(
                    event.target.value as QifDateFormat,
                    qifAmountFormat,
                  )
                }
              >
                {QIF_DATE_FORMAT_OPTIONS.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Amount format</span>
              <select
                value={qifAmountFormat}
                onChange={(event) =>
                  updateQifInterpretation(
                    qifDateFormat,
                    event.target.value as QifAmountFormat,
                  )
                }
              >
                <option value="decimal-dot">1,234.56</option>
                <option value="decimal-comma">1.234,56</option>
              </select>
            </label>
          </div>
        ) : null}

        {qifText && qifDetection && step === "mapping" ? (
          <div className="transaction-import-mapping">
            <div className="transaction-import-section-heading">
              <div>
                <h3>Confirm QIF file settings</h3>
                <p className="muted">
                  The importer inspected the complete file. Check the detected
                  formats before reviewing transactions.
                </p>
              </div>
            </div>
            <div className="transaction-import-profile-card">
              <label>
                <span>File date format</span>
                <select
                  value={qifDateFormat}
                  onChange={(event) =>
                    setQifDateFormat(event.target.value as QifDateFormat)
                  }
                >
                  {QIF_DATE_FORMAT_OPTIONS.map((format) => (
                    <option key={format} value={format}>
                      {format}
                    </option>
                  ))}
                </select>
                <small>
                  {qifDetection.dateFormatSource === "file"
                    ? "Detected from the dates in this file."
                    : qifDetection.dateFormatSource === "application"
                      ? "Multiple formats are possible. The application date setting was used."
                      : "Needs confirmation: the file did not provide a single unambiguous date format."}
                </small>
              </label>
              <label>
                <span>File amounts</span>
                <select
                  value={qifAmountFormat}
                  onChange={(event) =>
                    setQifAmountFormat(event.target.value as QifAmountFormat)
                  }
                >
                  <option value="decimal-dot">1,234.56</option>
                  <option value="decimal-comma">1.234,56</option>
                </select>
                <small>
                  {qifDetection.amountFormatNeedsConfirmation
                    ? "Needs confirmation: the file does not contain enough separator evidence."
                    : "Detected from the amounts in this file."}
                </small>
              </label>
              <label>
                <span>Destination account</span>
                <input type="text" value={accountName} disabled />
              </label>
            </div>
            <div className="transaction-import-column-grid">
              <div className="transaction-import-column-row transaction-import-column-head">
                <span>Sample</span>
                <span>File value</span>
                <span>Parsed value</span>
              </div>
              {qifDetection.sampleDates.slice(0, 3).map((value, index) => {
                const sample =
                  previewTransactionQifImport(
                    `D${value}\nT1.00\nPDate sample\n^`,
                    [],
                    {
                      dateFormat: qifDateFormat,
                      amountFormat: qifAmountFormat,
                    },
                  ).candidates[0]?.parsed.date ?? "Invalid";
                return (
                  <div
                    className="transaction-import-column-row"
                    key={`${value}-${index}`}
                  >
                    <span>Date</span>
                    <span>{value}</span>
                    <span>{sample || "Invalid"}</span>
                  </div>
                );
              })}
              {qifDetection.sampleAmounts.slice(0, 3).map((value, index) => {
                const sample = previewTransactionQifImport(
                  `D01/01/26\nT${value}\nPAmount sample\n^`,
                  [],
                  { dateFormat: "DD/MM/YY", amountFormat: qifAmountFormat },
                ).candidates[0]?.parsed;
                return (
                  <div
                    className="transaction-import-column-row"
                    key={`${value}-${index}`}
                  >
                    <span>Amount</span>
                    <span>{value}</span>
                    <span>
                      {sample
                        ? formatMoney(
                            sample.inflow || sample.outflow,
                            currencyCode,
                          )
                        : "Invalid"}
                    </span>
                  </div>
                );
              })}
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
                onClick={buildQifPreview}
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
                <h3>Review transactions</h3>
                <p className="muted">
                  Review new transactions and suggested matches before
                  importing.
                </p>
              </div>
              {["csv", "qif", "ofx", "qfx"].includes(fileType) ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setStep("mapping")}
                >
                  {fileType === "csv"
                    ? "Edit Mapping"
                    : fileType === "qif"
                      ? "Edit File Settings"
                      : "View Statement Details"}
                </button>
              ) : null}
            </div>
            <div className="transaction-import-summary transaction-import-review-summary">
              <span>✓ {readyCount} Ready</span>
              <span>⚠ {attentionCount} Need Attention</span>
              <span>Skipped: {skippedCount}</span>
              <span>Total rows: {preview.summary.totalRows}</span>
              <span>Matched: {preview.summary.exactMatches}</span>
              <span>Suggested: {preview.summary.possibleMatches}</span>
              <span>Invalid: {preview.summary.invalidRows}</span>
            </div>
          </>
        ) : null}

        {candidates.length > 0 && step === "review" ? (
          <div className="transaction-import-review-list">
            {candidates.map((candidate) => {
              const hasMatch = Boolean(candidate.matchedTransaction);
              const closestCandidate = candidate.matchCandidates?.[0];
              const isSkipped =
                candidate.reviewDecision === "skipped" ||
                (candidate.status === "new" && !candidate.selected);
              const amountLabel = candidate.parsed.outflow
                ? formatMoney(candidate.parsed.outflow, currencyCode)
                : formatMoney(candidate.parsed.inflow, currencyCode);
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
              const closestCandidateAmountLabel = closestCandidate
                ? closestCandidate.transaction.outflow
                  ? formatMoney(
                      closestCandidate.transaction.outflow,
                      currencyCode,
                    )
                  : formatMoney(
                      closestCandidate.transaction.inflow,
                      currencyCode,
                    )
                : "";

              return (
                <article
                  className={`transaction-import-review-card transaction-import-review-card-${candidate.status}${isSkipped ? " transaction-import-review-card-skipped" : ""}`}
                  key={candidate.id}
                >
                  <div className="transaction-import-review-card-header">
                    <div className="transaction-import-review-card-title">
                      <span
                        className={`transaction-import-status transaction-import-status-${candidate.status}`}
                      >
                        {getCandidateStatusLabel(candidate)}
                      </span>
                    </div>
                    {candidate.status === "new" ? (
                      <label className="transaction-import-select-new">
                        <input
                          type="checkbox"
                          checked={candidate.selected}
                          onChange={() => toggleCandidate(candidate.id)}
                        />
                        Import
                      </label>
                    ) : null}
                  </div>

                  <div className="transaction-import-match-stack">
                    <div className="transaction-import-match-row transaction-import-match-row-imported">
                      <span className="transaction-import-match-label">
                        Imported
                      </span>
                      <span className="transaction-import-match-date">
                        {formatImportReviewDate(candidate.parsed.date)}
                      </span>
                      <strong className="transaction-import-match-payee">
                        {candidate.parsed.payee || "Missing payee"}
                        {candidate.parsed.originalPayee ? (
                          <small className="transaction-import-payee-alias-note">
                            Alias from {candidate.parsed.originalPayee}
                          </small>
                        ) : null}
                      </strong>
                      <span className="transaction-import-match-detail">
                        {candidate.parsed.memo || "—"}
                      </span>
                      <strong className="transaction-import-match-amount">
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
                            In Register
                          </span>
                          <span className="transaction-import-match-date">
                            {formatImportReviewDate(
                              candidate.matchedTransaction?.date,
                            )}
                          </span>
                          <strong className="transaction-import-match-payee">
                            {candidate.matchedTransaction?.payee || "—"}
                          </strong>
                          <span className="transaction-import-match-detail">
                            {candidate.matchedTransaction?.category || "—"}
                            {candidate.matchedTransaction?.memo
                              ? ` · ${candidate.matchedTransaction.memo}`
                              : ""}
                          </span>
                          <strong className="transaction-import-match-amount">
                            {matchAmountLabel}
                          </strong>
                        </div>
                      </>
                    ) : null}

                    {!hasMatch && closestCandidate ? (
                      <>
                        <div
                          className="transaction-import-match-arrow"
                          aria-hidden="true"
                        >
                          ↓
                        </div>
                        <div className="transaction-import-match-row transaction-import-match-row-existing transaction-import-match-row-closest">
                          <span className="transaction-import-match-label">
                            Closest candidate
                          </span>
                          <span className="transaction-import-match-date">
                            {formatImportReviewDate(
                              closestCandidate.transaction.date,
                            )}
                          </span>
                          <strong className="transaction-import-match-payee">
                            {closestCandidate.transaction.payee || "—"}
                          </strong>
                          <span className="transaction-import-match-detail">
                            {closestCandidate.transaction.category || "—"}
                            {closestCandidate.transaction.memo
                              ? ` · ${closestCandidate.transaction.memo}`
                              : ""}
                          </span>
                          <strong className="transaction-import-match-amount">
                            {closestCandidateAmountLabel}
                          </strong>
                        </div>
                      </>
                    ) : null}
                  </div>

                  {isSkipped ? (
                    <div className="transaction-import-match-actions">
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => restoreCandidate(candidate.id)}
                      >
                        Restore
                      </button>
                    </div>
                  ) : null}

                  {!isSkipped && candidate.status === "exact-match" ? (
                    <div className="transaction-import-match-actions">
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() =>
                          importMatchedCandidateAsNew(candidate.id)
                        }
                      >
                        Import as New
                      </button>
                      {canRememberPayeeAlias(candidate) ? (
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => rememberPayeeAlias(candidate.id)}
                        >
                          Remember Alias
                        </button>
                      ) : null}
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => skipCandidate(candidate.id)}
                      >
                        Skip
                      </button>
                    </div>
                  ) : null}

                  {!isSkipped && candidate.status === "possible-match" ? (
                    <div className="transaction-import-match-actions">
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => acceptMatchedCandidate(candidate.id)}
                      >
                        Match
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() =>
                          importMatchedCandidateAsNew(candidate.id)
                        }
                      >
                        Import as New
                      </button>
                      {canRememberPayeeAlias(candidate) ? (
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => rememberPayeeAlias(candidate.id)}
                        >
                          Remember Alias
                        </button>
                      ) : null}
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => skipCandidate(candidate.id)}
                      >
                        Skip
                      </button>
                    </div>
                  ) : null}

                  {!isSkipped && candidate.status === "new" ? (
                    <div className="transaction-import-match-actions">
                      <button
                        className="button button-secondary"
                        type="button"
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

        {performanceReport ? (
          <div className="transaction-import-performance-panel">
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

        {step === "review" ? (
          <div className="transaction-import-footer">
            <div>
              <span className="muted">Ready to import</span>
              <strong>
                {selectedCount} Transaction{selectedCount === 1 ? "" : "s"}
              </strong>
              <span className="muted">
                {formatMoney(selectedTotal, currencyCode)}
              </span>
            </div>
            <div className="transaction-import-footer-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={resetImportState}
              >
                Start Over
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={selectedCount === 0 || isImporting}
                onClick={() => void importSelected()}
              >
                {isImporting ? (
                  "Importing…"
                ) : (
                  <>
                    Import {selectedCount} Transaction
                    {selectedCount === 1 ? "" : "s"}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
