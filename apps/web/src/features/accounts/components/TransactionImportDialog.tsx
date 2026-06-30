import { useRef, useState } from "react";
import type {
  NewRegisterTransactionInput,
  RegisterTransactionView,
} from "../accountRegisterTypes";
import {
  analyseTransactionCsvImport,
  buildRegisterTransactionsFromImport,
  createTransactionImportProfile,
  findMatchingTransactionImportProfile,
  previewTransactionCsvImport,
  readTransactionImportProfiles,
  upsertTransactionImportProfile,
  writeTransactionImportProfiles,
  type CsvImportAnalysis,
  type CsvImportColumnMapping,
  type CsvImportColumnRole,
  type TransactionImportCandidate,
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

    const detectedType = detectImportFileType(file.name);
    setFileName(file.name);
    setFileType(detectedType);

    if (detectedType !== "csv") {
      setError(
        detectedType === "unknown"
          ? "This file type could not be detected yet. CSV import is available in this first wizard release."
          : `${getFileTypeLabel(detectedType)} files are recognised but not connected to the new wizard yet. Start with CSV while the wizard foundation is being refreshed.`,
      );
      return;
    }

    const text = await file.text();
    const nextAnalysis = analyseTransactionCsvImport(text);

    if (nextAnalysis.columns.length === 0) {
      setError("The CSV file appears to be empty.");
      return;
    }

    const latestProfiles = readTransactionImportProfiles();
    const matchingProfile = findMatchingTransactionImportProfile(
      latestProfiles,
      nextAnalysis,
    );
    const nextMapping = matchingProfile?.mapping ?? nextAnalysis.suggestedMapping;
    const hasRequiredMapping = hasRequiredCsvMapping(nextMapping);

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
      buildCsvPreview(text, nextMapping, { preserveMessage: true });
      return;
    }

    setMessage(
      "CSV detected. Map the missing columns and this statement format can be remembered for next time.",
    );
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
    options: { saveProfile?: boolean; preserveMessage?: boolean } = {},
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

    const nextPreview = previewTransactionCsvImport(
      nextCsvText,
      transactions,
      nextMapping,
    );
    setPreview(nextPreview);
    setCandidates(nextPreview.candidates);
    setStep("review");
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

  async function importSelected() {
    const importable = buildRegisterTransactionsFromImport(candidates);

    if (importable.length === 0) {
      setError("No new transactions are selected for import.");
      return;
    }

    await onImportTransactions(importable);

    setMessage(
      `Imported ${importable.length} transaction${importable.length === 1 ? "" : "s"} into ${accountName}.`,
    );
    setStep("complete");
    setCandidates((current) =>
      current.map((candidate) => ({ ...candidate, selected: false })),
    );
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
              <strong>{countMappedColumns(mapping)}</strong>
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
                  Only selected new transactions will be imported.
                  {matchedProfileName ? ` Profile: ${matchedProfileName}.` : ""}
                </p>
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setStep("mapping")}
              >
                Edit Mapping
              </button>
            </div>
            <div className="transaction-import-summary transaction-import-review-summary">
              <span>✓ {readyCount} Ready</span>
              <span>⚠ {attentionCount} Need Attention</span>
              <span>Total rows: {preview.summary.totalRows}</span>
              <span>Matched: {preview.summary.exactMatches}</span>
              <span>Possible: {preview.summary.possibleMatches}</span>
              <span>Invalid: {preview.summary.invalidRows}</span>
            </div>
          </>
        ) : null}

        {candidates.length > 0 && step === "review" ? (
          <div className="transaction-import-table">
            <div className="transaction-import-row transaction-import-row-head">
              <span>Import</span>
              <span>Date</span>
              <span>Payee</span>
              <span>Memo</span>
              <span>Outflow</span>
              <span>Inflow</span>
              <span>Status</span>
            </div>
            {candidates.map((candidate) => (
              <label className="transaction-import-row" key={candidate.id}>
                <span>
                  <input
                    type="checkbox"
                    checked={candidate.selected}
                    disabled={candidate.status !== "new"}
                    onChange={() => toggleCandidate(candidate.id)}
                  />
                </span>
                <span>{candidate.parsed.date || "—"}</span>
                <span>
                  <strong>{candidate.parsed.payee || "Missing payee"}</strong>
                  <small>{candidate.reason}</small>
                </span>
                <span>{candidate.parsed.memo || "—"}</span>
                <span>
                  {candidate.parsed.outflow
                    ? formatMoney(candidate.parsed.outflow, currencyCode)
                    : ""}
                </span>
                <span>
                  {candidate.parsed.inflow
                    ? formatMoney(candidate.parsed.inflow, currencyCode)
                    : ""}
                </span>
                <span
                  className={`transaction-import-status transaction-import-status-${candidate.status}`}
                >
                  {candidate.status.replace("-", " ")}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {step === "complete" ? (
          <div className="transaction-import-complete-step">
            <div className="transaction-import-complete-icon">✓</div>
            <h3>Import complete</h3>
            <p>{message}</p>
            <button className="button button-primary" type="button" onClick={onClose}>
              Done
            </button>
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
                disabled={selectedCount === 0}
                onClick={() => void importSelected()}
              >
                Import {selectedCount} Transaction
                {selectedCount === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
