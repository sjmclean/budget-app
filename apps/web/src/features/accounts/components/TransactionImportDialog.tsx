import { useRef, useState } from "react";
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
  createTransactionImportProfile,
  findMatchingTransactionImportProfile,
  previewTransactionCsvImport,
  previewTransactionQifImport,
  readTransactionImportProfiles,
  formatImportDuration,
  upsertTransactionImportProfile,
  writeTransactionImportProfiles,
  type CsvImportAnalysis,
  type CsvImportColumnMapping,
  type CsvImportColumnRole,
  type TransactionImportCandidate,
  type TransactionImportPerformanceEntry,
  type TransactionImportPerformanceReport,
  type TransactionImportPreview,
} from "../transactionImport";

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currencyCode,
  }).format(value);
}

type TransactionImportStep = "upload" | "mapping" | "review" | "complete";
type TransactionImportFileType = "csv" | "qif" | "ofx" | "qfx" | "json" | "unknown";

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

const SUPPORTED_IMPORT_FORMATS = ["CSV", "QIF", "OFX/QFX", "JSON"];

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

function inferProfileName(fileName: string, accountName: string) {
  const baseName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();

  return baseName ? `${baseName} CSV` : `${accountName} CSV`;
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
  accountName,
  transactions,
  currencyCode,
  onClose,
  onImportTransactions,
}: {
  accountName: string;
  transactions: RegisterTransactionView[];
  currencyCode: string;
  onClose: () => void;
  onImportTransactions: (
    transactions: NewRegisterTransactionInput[],
  ) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dateFormat = useDateFormatPreference();
  const [step, setStep] = useState<TransactionImportStep>("upload");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<TransactionImportFileType>("unknown");
  const [analysis, setAnalysis] = useState<CsvImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<CsvImportColumnMapping>({});
  const [importProfiles, setImportProfiles] = useState(() =>
    readTransactionImportProfiles(),
  );
  const [matchedProfileName, setMatchedProfileName] = useState<string | null>(null);
  const [rememberProfile, setRememberProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [preview, setPreview] = useState<TransactionImportPreview | null>(null);
  const [candidates, setCandidates] = useState<TransactionImportCandidate[]>(
    [],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [performanceReport, setPerformanceReport] =
    useState<TransactionImportPerformanceReport | null>(null);
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
    (candidate) => candidate.status === "new",
  ).length;
  const attentionCount = candidates.filter(
    (candidate) => candidate.status !== "new",
  ).length;

  function resetImportState() {
    setStep("upload");
    setError(null);
    setMessage(null);
    setPerformanceReport(null);
    setPreview(null);
    setCandidates([]);
    setAnalysis(null);
    setMapping({});
    setMatchedProfileName(null);
    setRememberProfile(false);
    setProfileName("");
    setCsvText(null);
    setFileName(null);
    setFileType("unknown");
  }

  async function readFile(file: File) {
    resetImportState();
    const timings: TransactionImportPerformanceEntry[] = [];

    const detectedType = measureImportStage(timings, "Detect file type", () =>
      detectImportFileType(file.name),
    );
    setFileName(file.name);
    setFileType(detectedType);

    if (detectedType !== "csv" && detectedType !== "qif") {
      setError(
        detectedType === "unknown"
          ? "This file type could not be detected yet. CSV and QIF import are available in this wizard release."
          : `${getFileTypeLabel(detectedType)} files are recognised but not connected to the new wizard yet. Start with CSV or QIF while the wizard foundation is being refreshed.`,
      );
      setPerformanceReport(createTransactionImportPerformanceReport(timings));
      return;
    }

    const text = await measureAsyncImportStage(timings, "Read file text", () =>
      file.text(),
    );

    if (detectedType === "qif") {
      const nextPreview = measureImportStage(timings, "Parse and preview QIF", () =>
        previewTransactionQifImport(text, transactions),
      );

      if (nextPreview.candidates.length === 0) {
        setError("The QIF file does not appear to contain any transactions.");
        setPerformanceReport(createTransactionImportPerformanceReport(timings));
        return;
      }

      setPreview(nextPreview);
      setCandidates(nextPreview.candidates);
      setMessage(
        `QIF detected. ${nextPreview.summary.totalRows} transaction${
          nextPreview.summary.totalRows === 1 ? "" : "s"
        } ready for review.`,
      );
      setStep("review");
      setPerformanceReport(createTransactionImportPerformanceReport(timings));
      return;
    }

    const nextAnalysis = measureImportStage(timings, "Analyse CSV columns", () =>
      analyseTransactionCsvImport(text),
    );

    if (nextAnalysis.columns.length === 0) {
      setError("The CSV file appears to be empty.");
      setPerformanceReport(createTransactionImportPerformanceReport(timings));
      return;
    }

    const latestProfiles = measureImportStage(timings, "Read import profiles", () =>
      readTransactionImportProfiles(),
    );
    const matchingProfile = measureImportStage(timings, "Match import profile", () =>
      findMatchingTransactionImportProfile(latestProfiles, nextAnalysis),
    );
    const nextMapping = matchingProfile?.mapping ?? nextAnalysis.suggestedMapping;
    const hasRequiredMapping = measureImportStage(timings, "Validate mapping", () =>
      hasRequiredCsvMapping(nextMapping),
    );

    setImportProfiles(latestProfiles);
    setCsvText(text);
    setAnalysis(nextAnalysis);
    setMapping(nextMapping);
    setMatchedProfileName(matchingProfile?.name ?? null);
    setRememberProfile(!matchingProfile && !hasRequiredMapping);
    setProfileName(inferProfileName(file.name, accountName));
    setStep(hasRequiredMapping ? "review" : "mapping");

    if (matchingProfile) {
      setMessage(`CSV detected. Import profile "${matchingProfile.name}" applied.`);
    }

    if (hasRequiredMapping) {
      buildCsvPreview(text, nextMapping, {
        preserveMessage: true,
        timings,
      });
      return;
    }

    setMessage(
      "CSV detected. Map the missing columns and this statement format can be remembered for next time.",
    );
    setPerformanceReport(createTransactionImportPerformanceReport(timings));
  }

  function saveImportProfile(nextMapping: CsvImportColumnMapping) {
    if (!analysis || !rememberProfile) {
      return;
    }

    const nextProfile = createTransactionImportProfile({
      name: profileName,
      analysis,
      mapping: nextMapping,
      defaultAccountName: accountName,
    });
    const nextProfiles = upsertTransactionImportProfile(
      readTransactionImportProfiles(),
      nextProfile,
    );

    setImportProfiles(nextProfiles);
    setMatchedProfileName(nextProfile.name);
    writeTransactionImportProfiles(nextProfiles);
    setMessage(`Import profile saved: ${nextProfile.name}.`);
  }

  function buildCsvPreview(
    nextCsvText = csvText,
    nextMapping: CsvImportColumnMapping = mapping,
    options: {
      saveProfile?: boolean;
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
    if (options.saveProfile) {
      saveImportProfile(nextMapping);
    } else if (!matchedProfileName && !options.preserveMessage) {
      setMessage(null);
    }

    const timings = options.timings ?? [];
    const nextPreview = measureImportStage(timings, "Parse and preview CSV", () =>
      previewTransactionCsvImport(
        nextCsvText,
        transactions,
        nextMapping,
      ),
    );
    setPreview(nextPreview);
    setCandidates(nextPreview.candidates);
    setStep("review");
    setPerformanceReport(createTransactionImportPerformanceReport(timings));
  }

  function updateColumnRole(columnIndex: number, role: CsvImportColumnRole) {
    setMapping((current) => ({ ...current, [columnIndex]: role }));
    setPreview(null);
    setCandidates([]);
    setMessage(null);
  }

  function resetAutoMapping() {
    if (!analysis) {
      return;
    }

    setMapping(analysis.suggestedMapping);
    setPreview(null);
    setCandidates([]);
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
              reason: "This imported row will be skipped.",
            }
          : candidate,
      ),
    );
    setError(null);
  }

  function formatImportReviewDate(date: string | undefined) {
    return date ? formatDateForDisplay(date, dateFormat) : "—";
  }

  function getCandidateStatusLabel(candidate: TransactionImportCandidate) {
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
    setMessage(`Importing ${importable.length} transaction${importable.length === 1 ? "" : "s"}…`);

    try {
      // Keep the commit path delegated to the register page.
      // await onImportTransactions(importable)
      await measureAsyncImportStage(timings, "Commit transactions", () =>
        onImportTransactions(importable),
      );

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
              Upload, review, and import transactions into {accountName}.
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

        <ol className="transaction-import-steps" aria-label="Import steps">
          <li className={step === "upload" ? "transaction-import-step-active" : ""}>1. File</li>
          <li className={step === "mapping" ? "transaction-import-step-active" : ""}>2. Setup</li>
          <li className={step === "review" ? "transaction-import-step-active" : ""}>3. Review</li>
          <li className={step === "complete" ? "transaction-import-step-active" : ""}>4. Done</li>
        </ol>

        {error ? <p className="transaction-import-error">{error}</p> : null}
        {message ? (
          <p className="transaction-import-message">{message}</p>
        ) : null}

        {step === "upload" ? (
          <div className="transaction-import-upload-step">
            <div className="transaction-import-format-grid">
              {SUPPORTED_IMPORT_FORMATS.map((format) => (
                <div className="transaction-import-format-card" key={format}>
                  <strong>{format}</strong>
                  <span>
                    {format === "CSV"
                      ? "Available now"
                      : "Recognised for the refreshed import workflow"}
                  </span>
                </div>
              ))}
            </div>

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
          <div className="transaction-import-detection-panel">
            <div>
              <span className="transaction-import-detection-label">File</span>
              <strong>{fileName}</strong>
            </div>
            <div>
              <span className="transaction-import-detection-label">Detected</span>
              <strong>{getFileTypeLabel(fileType)}</strong>
            </div>
            <div>
              <span className="transaction-import-detection-label">Destination</span>
              <strong>{accountName}</strong>
            </div>
            <div>
              <span className="transaction-import-detection-label">Profile</span>
              <strong>{matchedProfileName ?? "Not saved yet"}</strong>
            </div>
            <div>
              <span className="transaction-import-detection-label">Mapped Columns</span>
              <strong>{fileType === "csv" ? countMappedColumns(mapping) : "Not needed"}</strong>
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
                  These choices can be saved as an import profile and reused
                  automatically when this statement format appears again.
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

            <div className="transaction-import-profile-card">
              <label className="transaction-import-remember-profile">
                <input
                  type="checkbox"
                  checked={rememberProfile}
                  onChange={(event) => setRememberProfile(event.target.checked)}
                />
                Remember this mapping for future imports
              </label>
              <label>
                <span>Profile name</span>
                <input
                  type="text"
                  value={profileName}
                  disabled={!rememberProfile}
                  onChange={(event) => setProfileName(event.target.value)}
                />
              </label>
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
                onClick={() => buildCsvPreview(csvText, mapping, { saveProfile: true })}
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
                  Review new transactions and suggested matches before importing.
                  {matchedProfileName ? ` Profile: ${matchedProfileName}.` : ""}
                </p>
              </div>
              {fileType === "csv" ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setStep("mapping")}
                >
                  Edit Mapping
                </button>
              ) : null}
            </div>
            <div className="transaction-import-summary transaction-import-review-summary">
              <span>✓ {readyCount} Ready</span>
              <span>⚠ {attentionCount} Need Attention</span>
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
              const amountLabel = candidate.parsed.outflow
                ? formatMoney(candidate.parsed.outflow, currencyCode)
                : formatMoney(candidate.parsed.inflow, currencyCode);
              const matchAmountLabel = candidate.matchedTransaction
                ? candidate.matchedTransaction.outflow
                  ? formatMoney(candidate.matchedTransaction.outflow, currencyCode)
                  : formatMoney(candidate.matchedTransaction.inflow, currencyCode)
                : "";

              return (
                <article
                  className={`transaction-import-review-card transaction-import-review-card-${candidate.status}`}
                  key={candidate.id}
                >
                  <div className="transaction-import-review-card-header">
                    <div>
                      <span
                        className={`transaction-import-status transaction-import-status-${candidate.status}`}
                      >
                        {getCandidateStatusLabel(candidate)}
                      </span>
                      <p className="muted">{candidate.reason}</p>
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
                      <span className="transaction-import-match-label">Imported</span>
                      <span className="transaction-import-match-date">
                        {formatImportReviewDate(candidate.parsed.date)}
                      </span>
                      <strong className="transaction-import-match-payee">
                        {candidate.parsed.payee || "Missing payee"}
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
                        <div className="transaction-import-match-arrow" aria-hidden="true">
                          ↓
                        </div>
                        <div className="transaction-import-match-row transaction-import-match-row-existing">
                          <span className="transaction-import-match-label">In Register</span>
                          <span className="transaction-import-match-date">
                            {formatImportReviewDate(candidate.matchedTransaction?.date)}
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
                  </div>

                  {candidate.status === "exact-match" ? (
                    <div className="transaction-import-match-actions">
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => importMatchedCandidateAsNew(candidate.id)}
                      >
                        Import as New
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => skipCandidate(candidate.id)}
                      >
                        Skip
                      </button>
                    </div>
                  ) : null}

                  {candidate.status === "possible-match" ? (
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
                        onClick={() => importMatchedCandidateAsNew(candidate.id)}
                      >
                        Import as New
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => skipCandidate(candidate.id)}
                      >
                        Skip
                      </button>
                    </div>
                  ) : null}

                  {candidate.status === "new" ? (
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
                  Total measured time: {formatImportDuration(performanceReport.totalMs)}
                </p>
              </div>
            </div>
            <div className="transaction-import-performance-list">
              {performanceReport.entries.map((entry) => (
                <div className="transaction-import-performance-row" key={entry.label}>
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
              <span className="muted">{formatMoney(selectedTotal, currencyCode)}</span>
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
                {isImporting ? "Importing…" : <>Import {selectedCount} Transaction
                {selectedCount === 1 ? "" : "s"}</>}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
