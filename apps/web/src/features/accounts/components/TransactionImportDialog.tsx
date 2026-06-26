import { useRef, useState } from "react";
import type {
  NewRegisterTransactionInput,
  RegisterTransactionView,
} from "../accountRegisterTypes";
import {
  analyseTransactionCsvImport,
  buildRegisterTransactionsFromImport,
  previewTransactionCsvImport,
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
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CsvImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<CsvImportColumnMapping>({});
  const [preview, setPreview] = useState<TransactionImportPreview | null>(null);
  const [candidates, setCandidates] = useState<TransactionImportCandidate[]>(
    [],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedCount = candidates.filter(
    (candidate) => candidate.selected && candidate.status === "new",
  ).length;

  async function readFile(file: File) {
    setError(null);
    setMessage(null);
    setPreview(null);
    setCandidates([]);
    setAnalysis(null);
    setMapping({});
    setCsvText(null);
    setFileName(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a CSV transaction file.");
      return;
    }

    const text = await file.text();
    const nextAnalysis = analyseTransactionCsvImport(text);

    if (nextAnalysis.columns.length === 0) {
      setError("The CSV file appears to be empty.");
      return;
    }

    setCsvText(text);
    setFileName(file.name);
    setAnalysis(nextAnalysis);
    setMapping(nextAnalysis.suggestedMapping);
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

  function buildPreview() {
    if (!csvText) {
      setError("Choose a CSV transaction file first.");
      return;
    }

    const roles = Object.values(mapping);
    const hasAmount =
      roles.includes("amount") ||
      roles.includes("outflow") ||
      roles.includes("inflow");

    if (!roles.includes("date") || !roles.includes("payee") || !hasAmount) {
      setError(
        "Map at least Date, Payee/Description, and an Amount or Inflow/Outflow column before continuing.",
      );
      return;
    }

    setError(null);
    const nextPreview = previewTransactionCsvImport(
      csvText,
      transactions,
      mapping,
    );
    setPreview(nextPreview);
    setCandidates(nextPreview.candidates);
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

    for (const transaction of importable) {
      await onImportTransactions([transaction]);
    }

    setMessage(
      `Imported ${importable.length} transaction${importable.length === 1 ? "" : "s"} into ${accountName}.`,
    );
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
        className="transaction-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transaction-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="transaction-import-header">
          <div>
            <h2 id="transaction-import-title">Import Transactions</h2>
            <p className="muted">Target account: {accountName}</p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="transaction-import-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
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
            className="button button-primary"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Choose CSV File
          </button>
          <p className="muted">
            Map your bank CSV columns before previewing. Different banks use
            different column names.
          </p>
        </div>

        {error ? <p className="transaction-import-error">{error}</p> : null}
        {message ? (
          <p className="transaction-import-message">{message}</p>
        ) : null}

        {analysis ? (
          <div className="transaction-import-mapping">
            <div className="transaction-import-section-heading">
              <div>
                <h3>1. Map CSV Columns</h3>
                <p className="muted">
                  {fileName ? `${fileName} · ` : ""}
                  {analysis.totalDataRows} data row
                  {analysis.totalDataRows === 1 ? "" : "s"} detected.
                </p>
                <p className="muted transaction-import-help">
                  Use Amount (+/-) only when your bank has one amount column
                  where spending is negative and deposits are positive. If your
                  bank has separate debit/credit columns, map them to Outflow /
                  Debit and Inflow / Credit. If the normal payee column is
                  sometimes blank, map another column as Payee fallback; memo is
                  also used as a final fallback when payee is blank.
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

            {analysis.sampleRows.length > 0 ? (
              <div className="transaction-import-raw-preview">
                <h4>First rows from file</h4>
                <div className="transaction-import-raw-scroll">
                  <table>
                    <thead>
                      <tr>
                        {analysis.columns.map((column) => (
                          <th key={column.index}>{column.header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.sampleRows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {analysis.columns.map((column) => (
                            <td key={column.index}>
                              {row[column.index] || "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="transaction-import-step-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={buildPreview}
              >
                Preview Import
              </button>
            </div>
          </div>
        ) : null}

        {preview ? (
          <>
            <div className="transaction-import-section-heading">
              <div>
                <h3>2. Review Import Preview</h3>
                <p className="muted">
                  Only selected new transactions will be imported.
                </p>
              </div>
            </div>
            <div className="transaction-import-summary">
              <span>Total rows: {preview.summary.totalRows}</span>
              <span>New: {preview.summary.newTransactions}</span>
              <span>Matched: {preview.summary.exactMatches}</span>
              <span>Possible: {preview.summary.possibleMatches}</span>
              <span>Invalid: {preview.summary.invalidRows}</span>
            </div>
          </>
        ) : null}

        {candidates.length > 0 ? (
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
        ) : !analysis ? (
          <p className="transaction-import-placeholder">
            Choose a CSV file to map columns and preview transactions before
            importing.
          </p>
        ) : preview ? (
          <p className="transaction-import-placeholder">
            No importable rows were found in this CSV file.
          </p>
        ) : null}

        <div className="transaction-import-footer">
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={selectedCount === 0}
            onClick={() => void importSelected()}
          >
            Import {selectedCount} New Transaction
            {selectedCount === 1 ? "" : "s"}
          </button>
        </div>
      </section>
    </div>
  );
}
