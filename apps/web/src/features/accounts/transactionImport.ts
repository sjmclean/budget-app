import type { RegisterTransactionView } from "./accountRegisterTypes";
import { normaliseMerchant } from "./merchantNormalisation";
import { buildRegisterTransactionsFromImport } from "./transactionImportCommit";
import { parseTransactionOfx } from "./transactionImportParser";
import {
  validateParsedImportTransaction,
  validateQifTransferDestinations,
} from "./transactionImportValidator";
import {
  detectQifImportFormat,
  inspectTransactionCsvImport,
  inspectTransactionQifImport,
  inspectTransactionOfxImport,
  parseQifDateValue,
  parseQifMoneyValue,
  parseTransactionImportCsvRows,
} from "./transactionImportInspection";
import type {
  CsvImportAnalysis,
  CsvImportColumnMapping,
  CsvImportColumnRole,
  QifAmountFormat,
  QifDateFormat,
} from "./transactionImportInspection";

export {
  detectQifImportFormat,
  inspectTransactionCsvImport,
  inspectTransactionQifImport,
  inspectTransactionOfxImport,
  QIF_DATE_FORMAT_OPTIONS,
} from "./transactionImportInspection";
export { validateParsedImportTransaction, validateQifTransferDestinations } from "./transactionImportValidator";
export { buildRegisterTransactionsFromImport } from "./transactionImportCommit";
export { parseTransactionOfx } from "./transactionImportParser";

export type {
  CsvImportAnalysis,
  CsvImportColumnAnalysis,
  CsvImportColumnMapping,
  CsvImportColumnRole,
  CsvImportInspection,
  ImportFileType,
  ImportInspectionDiagnostic,
  ImportInspectionResult,
  ImportInspectionSetting,
  ImportSettingSource,
  QifAmountFormat,
  QifDateFormat,
  QifImportDetection,
  QifImportInspection,
  OfxImportInspection,
  OfxImportInspectionDetails,
} from "./transactionImportInspection";

export type TransactionImportMatchStatus =
  "exact-match" | "possible-match" | "new" | "invalid";
export interface TransactionImportProfile {
  id: string;
  name: string;
  parserType: "csv";
  signature: string;
  mapping: CsvImportColumnMapping;
  defaultAccountName?: string;
  createdAt: string;
  updatedAt: string;
}

export const TRANSACTION_IMPORT_PROFILES_STORAGE_KEY =
  "budget-app.transaction-import-profiles.v1";

export interface TransactionPayeeAlias {
  id: string;
  sourcePayee: string;
  targetPayee: string;
  normalisedSource: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionPayeeAliasSuggestion {
  id: string;
  sourcePayee: string;
  suggestedTargetPayee: string;
  normalisedSource: string;
  reason: string;
  occurrenceCount: number;
}

export const TRANSACTION_PAYEE_ALIASES_STORAGE_KEY =
  "budget-app.transaction-payee-aliases.v1";

export const HIGH_CONFIDENCE_IMPORT_MATCH_DAYS = 5;
export const SUGGESTED_IMPORT_MATCH_DAYS = 10;
export const TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS = 14;

export interface TransactionImportPerformanceEntry {
  label: string;
  durationMs: number;
}

export interface TransactionImportPerformanceReport {
  totalMs: number;
  entries: TransactionImportPerformanceEntry[];
}

export function createTransactionImportPerformanceReport(
  entries: TransactionImportPerformanceEntry[],
): TransactionImportPerformanceReport {
  return {
    totalMs: entries.reduce((total, entry) => total + entry.durationMs, 0),
    entries,
  };
}

export function formatImportDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(2)} s`;
}

export interface ParsedImportTransaction {
  rowNumber: number;
  date: string;
  payee: string;
  originalPayee?: string;
  payeeAliasId?: string;
  memo?: string;
  importedCategoryName?: string;
  transferAccountName?: string;
  outflow: number;
  inflow: number;
  raw: Record<string, string>;
}

export type TransactionImportReviewDecision =
  "matched" | "skipped" | "import-as-new";

export interface TransactionImportMatchEvidence {
  label: string;
  result: "positive" | "negative" | "neutral";
  detail: string;
}

export interface TransactionImportCandidate {
  id: string;
  parsed: ParsedImportTransaction;
  status: TransactionImportMatchStatus;
  matchedTransactionId?: string;
  matchedTransaction?: RegisterTransactionView;
  reason: string;
  confidence?: number;
  evidence?: TransactionImportMatchEvidence[];
  matchCandidates?: TransactionImportMatchCandidateAssessment[];
  selected: boolean;
  reviewDecision?: TransactionImportReviewDecision;
  errors: string[];
}

export type TransactionImportRecommendation = "import" | "review" | "match";

export interface TransactionImportMatchCandidateAssessment {
  transaction: RegisterTransactionView;
  confidence: number;
  evidence: TransactionImportMatchEvidence[];
  daysApart: number;
  payeeSimilarity: number;
  reason: string;
}

export interface TransactionImportMatchAssessment {
  recommendation: TransactionImportRecommendation;
  status: Exclude<TransactionImportMatchStatus, "invalid">;
  confidence: number;
  evidence?: TransactionImportMatchEvidence[];
  reason: string;
  candidates: TransactionImportMatchCandidateAssessment[];
  selectedCandidate?: TransactionImportMatchCandidateAssessment;
}

export interface TransactionImportPreview {
  candidates: TransactionImportCandidate[];
  summary: {
    totalRows: number;
    newTransactions: number;
    exactMatches: number;
    possibleMatches: number;
    invalidRows: number;
    selectedForImport: number;
  };
}

export function analyseTransactionCsvImport(
  csvText: string,
): CsvImportAnalysis {
  return inspectTransactionCsvImport(csvText).details.analysis;
}

export function previewTransactionCsvImport(
  csvText: string,
  existingTransactions: RegisterTransactionView[],
  mapping?: CsvImportColumnMapping,
): TransactionImportPreview {
  return buildTransactionImportPreview(
    applyTransactionPayeeAliases(
      parseTransactionCsv(csvText, mapping),
      readTransactionPayeeAliases(),
    ),
    existingTransactions,
  );
}

export function previewTransactionOfxImport(
  ofxText: string,
  existingTransactions: RegisterTransactionView[],
): TransactionImportPreview {
  return buildTransactionImportPreview(
    applyTransactionPayeeAliases(
      parseTransactionOfx(ofxText),
      readTransactionPayeeAliases(),
    ),
    existingTransactions,
  );
}

export function previewTransactionQifImport(
  qifText: string,
  existingTransactions: RegisterTransactionView[],
  options?: {
    sourceAccountName?: string;
    availableTransferAccountNames?: string[];
    dateFormat?: QifDateFormat;
    amountFormat?: QifAmountFormat;
  },
): TransactionImportPreview {
  const preview = buildTransactionImportPreview(
    applyTransactionPayeeAliases(
      parseTransactionQif(qifText, options),
      readTransactionPayeeAliases(),
    ),
    existingTransactions,
  );

  return validateQifTransferDestinations(preview, options);
}

function buildTransactionImportPreview(
  parsedTransactions: ParsedImportTransaction[],
  existingTransactions: RegisterTransactionView[],
): TransactionImportPreview {
  const candidates = parsedTransactions.map((transaction) =>
    classifyImportCandidate(transaction, existingTransactions),
  );

  return {
    candidates,
    summary: {
      totalRows: candidates.length,
      newTransactions: candidates.filter(
        (candidate) => candidate.status === "new",
      ).length,
      exactMatches: candidates.filter(
        (candidate) => candidate.status === "exact-match",
      ).length,
      possibleMatches: candidates.filter(
        (candidate) => candidate.status === "possible-match",
      ).length,
      invalidRows: candidates.filter(
        (candidate) => candidate.status === "invalid",
      ).length,
      selectedForImport: candidates.filter((candidate) => candidate.selected)
        .length,
    },
  };
}

export function parseTransactionCsv(
  csvText: string,
  mapping?: CsvImportColumnMapping,
): ParsedImportTransaction[] {
  const rows = parseTransactionImportCsvRows(csvText);

  if (rows.length <= 1) {
    return [];
  }

  const headers = rows[0].map(
    (header, index) => header.trim() || `Column ${index + 1}`,
  );
  const resolvedMapping =
    mapping ?? analyseTransactionCsvImport(csvText).suggestedMapping;

  return rows.slice(1).map((row, index) => {
    const raw = Object.fromEntries(
      headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""]),
    );
    const date = normaliseImportDate(readRole(row, resolvedMapping, "date"));
    const memoValue = readRole(row, resolvedMapping, "memo").trim();
    const payee = readImportPayee(row, resolvedMapping, memoValue);
    const memo = memoValue || undefined;
    const { outflow, inflow } = readMappedImportAmount(row, resolvedMapping);

    return {
      rowNumber: index + 2,
      date,
      payee,
      memo,
      outflow,
      inflow,
      raw,
    };
  });
}

export function parseTransactionQif(
  qifText: string,
  options?: { dateFormat?: QifDateFormat; amountFormat?: QifAmountFormat },
): ParsedImportTransaction[] {
  const detectedFormat = detectQifImportFormat(qifText);
  const dateFormat: QifDateFormat =
    options?.dateFormat ?? detectedFormat.dateFormat;
  const amountFormat: QifAmountFormat =
    options?.amountFormat ?? detectedFormat.amountFormat;
  const transactions: ParsedImportTransaction[] = [];
  let record: Record<string, string> = {};
  let rowNumber = 1;

  function commitRecord() {
    if (Object.keys(record).length === 0) {
      return;
    }

    const amount = parseQifMoneyValue(record.amount ?? "", amountFormat);
    const payee = (record.payee ?? record.memo ?? "").trim();
    const memo = record.memo?.trim() || undefined;
    const importedCategoryName = record.category?.trim() || undefined;
    const transferAccountName = extractQifTransferAccountName(
      importedCategoryName,
    );

    transactions.push({
      rowNumber,
      date: parseQifDateValue(record.date ?? "", dateFormat),
      payee,
      memo,
      importedCategoryName,
      transferAccountName,
      outflow: amount < 0 ? Math.abs(amount) : 0,
      inflow: amount > 0 ? Math.abs(amount) : 0,
      raw: { ...record },
    });

    record = {};
  }

  for (const rawLine of qifText.split(/\r?\n/)) {
    const line = rawLine.trim();
    rowNumber += 1;

    if (!line || line.startsWith("!")) {
      continue;
    }

    if (line === "^") {
      commitRecord();
      continue;
    }

    const code = line[0];
    const value = line.slice(1).trim();

    switch (code) {
      case "D":
        record.date = value;
        break;
      case "T":
      case "U":
        record.amount = value;
        break;
      case "P":
        record.payee = value;
        break;
      case "M":
        record.memo = value;
        break;
      case "L":
        record.category = value;
        break;
      case "N":
        record.number = value;
        break;
      case "C":
        record.cleared = value;
        break;
      default:
        record[`qif_${code}`] = value;
        break;
    }
  }

  commitRecord();

  return transactions;
}


/**
 * QIF represents account transfers in the category field using square
 * brackets, for example `L[Savings]`. Keep this interpretation deliberately
 * narrow: ordinary category names must never be guessed to be transfers.
 */
export function extractQifTransferAccountName(
  category: string | undefined,
): string | undefined {
  if (!category) {
    return undefined;
  }

  const match = category.trim().match(/^\[([^\]]+)\]$/);
  const accountName = match?.[1]?.trim();
  return accountName || undefined;
}

function readRole(
  row: string[],
  mapping: CsvImportColumnMapping,
  role: CsvImportColumnRole,
): string {
  const entry = Object.entries(mapping).find(
    ([, mappedRole]) => mappedRole === role,
  );
  if (!entry) {
    return "";
  }

  return row[Number(entry[0])] ?? "";
}

function readImportPayee(
  row: string[],
  mapping: CsvImportColumnMapping,
  memoValue: string,
): string {
  const primaryPayee = readRole(row, mapping, "payee").trim();
  if (primaryPayee) {
    return primaryPayee;
  }

  const explicitFallback = readRole(row, mapping, "payeeFallback").trim();
  if (explicitFallback) {
    return explicitFallback;
  }

  return memoValue.trim();
}

function readMappedImportAmount(
  row: string[],
  mapping: CsvImportColumnMapping,
): { outflow: number; inflow: number } {
  const explicitOutflow = parseMoney(readRole(row, mapping, "outflow"));
  const explicitInflow = parseMoney(readRole(row, mapping, "inflow"));

  if (explicitOutflow > 0 || explicitInflow > 0) {
    return {
      outflow: Math.abs(explicitOutflow),
      inflow: Math.abs(explicitInflow),
    };
  }

  const amount = parseMoney(readRole(row, mapping, "amount"));

  if (amount < 0) {
    return { outflow: Math.abs(amount), inflow: 0 };
  }

  return { outflow: 0, inflow: Math.abs(amount) };
}

function classifyImportCandidate(
  parsed: ParsedImportTransaction,
  existingTransactions: RegisterTransactionView[],
): TransactionImportCandidate {
  const errors = validateParsedImportTransaction(parsed);

  if (errors.length > 0) {
    return {
      id: `row-${parsed.rowNumber}`,
      parsed,
      status: "invalid",
      reason: errors.join(" "),
      selected: false,
      errors,
    };
  }

  const assessment = assessTransactionImportMatch(parsed, existingTransactions);
  const selectedCandidate = assessment.selectedCandidate;

  return {
    id: `row-${parsed.rowNumber}`,
    parsed,
    status: assessment.status,
    matchedTransactionId:
      assessment.status === "new" ? undefined : selectedCandidate?.transaction.id,
    matchedTransaction:
      assessment.status === "new" ? undefined : selectedCandidate?.transaction,
    reason: assessment.reason,
    confidence:
      assessment.candidates.length > 0 ? assessment.confidence : undefined,
    evidence: assessment.evidence,
    matchCandidates: assessment.candidates,
    selected: assessment.recommendation === "import",
    errors: [],
  };
}

export function assessTransactionImportMatch(
  parsed: ParsedImportTransaction,
  existingTransactions: RegisterTransactionView[],
): TransactionImportMatchAssessment {
  const matchAnalyses = existingTransactions
    .map((transaction) => analyseImportMatchCandidate(transaction, parsed))
    .filter((analysis) =>
      analysis.amountMatches &&
      analysis.daysApart <= TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
    )
    .sort((left, right) => right.confidence - left.confidence);
  const bestMatch = matchAnalyses[0];
  const candidates = matchAnalyses.map(toTransactionImportMatchCandidateAssessment);

  if (bestMatch?.isExactMatch) {
    return {
      recommendation: "match",
      status: "exact-match",
      confidence: bestMatch.confidence,
      evidence: bestMatch.evidence,
      reason: bestMatch.reason,
      candidates,
      selectedCandidate: toTransactionImportMatchCandidateAssessment(bestMatch),
    };
  }

  if (bestMatch?.isSuggestedMatch) {
    return {
      recommendation: "review",
      status: "possible-match",
      confidence: bestMatch.confidence,
      evidence: bestMatch.evidence,
      reason: bestMatch.reason,
      candidates,
      selectedCandidate: toTransactionImportMatchCandidateAssessment(bestMatch),
    };
  }

  return {
    recommendation: "import",
    status: "new",
    confidence: bestMatch?.confidence ?? 0,
    evidence: bestMatch?.evidence,
    reason: bestMatch
      ? `No suitable match found within ${TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS} days. Closest in-window same-amount candidate was ${formatImportDateDistance(
          bestMatch.daysApart,
        )} away with ${bestMatch.payeeSimilarity}% payee similarity.`
      : `No reasonable candidate found within ${TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS} days.`,
    candidates,
    selectedCandidate: bestMatch
      ? toTransactionImportMatchCandidateAssessment(bestMatch)
      : undefined,
  };
}

interface ImportMatchAnalysis {
  transaction: RegisterTransactionView;
  amountMatches: boolean;
  daysApart: number;
  payeeSimilarity: number;
  confidence: number;
  evidence: TransactionImportMatchEvidence[];
  isExactMatch: boolean;
  isSuggestedMatch: boolean;
  reason: string;
}

function toTransactionImportMatchCandidateAssessment(
  analysis: ImportMatchAnalysis,
): TransactionImportMatchCandidateAssessment {
  return {
    transaction: analysis.transaction,
    confidence: analysis.confidence,
    evidence: analysis.evidence,
    daysApart: analysis.daysApart,
    payeeSimilarity: analysis.payeeSimilarity,
    reason: analysis.reason,
  };
}

function analyseImportMatchCandidate(
  transaction: RegisterTransactionView,
  parsed: ParsedImportTransaction,
): ImportMatchAnalysis {
  const amountMatches = amountsEqual(transaction, parsed);
  const daysApart = daysBetween(transaction.date, parsed.date);
  const payeeSimilarity = calculatePayeeSimilarity(
    transaction.payee,
    parsed.payee,
  );
  const sameDate = transaction.date === parsed.date;
  const existingMerchant = normaliseMerchant(transaction.payee);
  const importedMerchant = normaliseMerchant(parsed.payee);
  const exactPayee =
    existingMerchant.canonical.length > 0 &&
    existingMerchant.canonical === importedMerchant.canonical;
  const withinHighConfidenceWindow =
    daysApart <= HIGH_CONFIDENCE_IMPORT_MATCH_DAYS;
  const withinSuggestedWindow = daysApart <= SUGGESTED_IMPORT_MATCH_DAYS;
  const confidence = calculateImportMatchConfidence({
    amountMatches,
    daysApart,
    payeeSimilarity,
    sameDate,
    exactPayee,
  });
  const evidence = buildImportMatchEvidence({
    amountMatches,
    daysApart,
    payeeSimilarity,
    sameDate,
    exactPayee,
  });
  const isExactMatch =
    amountMatches &&
    ((sameDate && exactPayee) ||
      (withinHighConfidenceWindow && payeeSimilarity >= 85));
  const isSuggestedMatch =
    !isExactMatch &&
    amountMatches &&
    withinSuggestedWindow &&
    payeeSimilarity >= 60;

  return {
    transaction,
    amountMatches,
    daysApart,
    payeeSimilarity,
    confidence,
    evidence,
    isExactMatch,
    isSuggestedMatch,
    reason: isExactMatch
      ? `High-confidence match: same amount, ${formatImportDateDistance(
          daysApart,
        )} apart, and ${payeeSimilarity}% payee similarity.`
      : isSuggestedMatch
        ? `Possible match: same amount, ${formatImportDateDistance(
            daysApart,
          )} apart, and ${payeeSimilarity}% payee similarity. Review before importing as new.`
        : `Same amount but not enough evidence to match: ${formatImportDateDistance(
            daysApart,
          )} apart and ${payeeSimilarity}% payee similarity.`,
  };
}

function calculateImportMatchConfidence({
  amountMatches,
  daysApart,
  payeeSimilarity,
  sameDate,
  exactPayee,
}: {
  amountMatches: boolean;
  daysApart: number;
  payeeSimilarity: number;
  sameDate: boolean;
  exactPayee: boolean;
}): number {
  if (!amountMatches) {
    return 0;
  }

  const dateScore = sameDate
    ? 30
    : daysApart <= 1
      ? 25
      : daysApart <= HIGH_CONFIDENCE_IMPORT_MATCH_DAYS
        ? 18
        : daysApart <= SUGGESTED_IMPORT_MATCH_DAYS
          ? 8
          : 0;
  const payeeScore = exactPayee ? 40 : Math.round(payeeSimilarity * 0.4);

  return Math.min(100, 30 + dateScore + payeeScore);
}

function buildImportMatchEvidence({
  amountMatches,
  daysApart,
  payeeSimilarity,
  sameDate,
  exactPayee,
}: {
  amountMatches: boolean;
  daysApart: number;
  payeeSimilarity: number;
  sameDate: boolean;
  exactPayee: boolean;
}): TransactionImportMatchEvidence[] {
  return [
    {
      label: "Amount",
      result: amountMatches ? "positive" : "negative",
      detail: amountMatches ? "Exact amount match." : "Amount differs.",
    },
    {
      label: "Date",
      result: sameDate
        ? "positive"
        : daysApart <= SUGGESTED_IMPORT_MATCH_DAYS
          ? "neutral"
          : "negative",
      detail: sameDate
        ? "Same date."
        : `${formatImportDateDistance(daysApart)} apart.`,
    },
    {
      label: "Payee",
      result: exactPayee
        ? "positive"
        : payeeSimilarity >= 60
          ? "neutral"
          : "negative",
      detail: exactPayee
        ? "Exact payee match."
        : `${payeeSimilarity}% payee similarity.`,
    },
  ];
}

function calculatePayeeSimilarity(left: string, right: string): number {
  const leftMerchant = normaliseMerchant(left);
  const rightMerchant = normaliseMerchant(right);
  const leftNormalised = leftMerchant.canonical;
  const rightNormalised = rightMerchant.canonical;

  if (!leftNormalised || !rightNormalised) {
    return 0;
  }

  if (leftNormalised === rightNormalised) {
    return 100;
  }

  if (leftNormalised.includes(rightNormalised) || rightNormalised.includes(leftNormalised)) {
    const shorter = Math.min(leftNormalised.length, rightNormalised.length);
    const longer = Math.max(leftNormalised.length, rightNormalised.length);
    return Math.round((shorter / longer) * 100);
  }

  const leftTokens = leftMerchant.tokens;
  const rightTokens = rightMerchant.tokens;

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const rightTokenSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightTokenSet.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return Math.round((overlap / union) * 100);
}

function normalisePayeeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function formatImportDateDistance(daysApart: number): string {
  if (!Number.isFinite(daysApart)) {
    return "an unknown number of days";
  }

  if (daysApart === 0) {
    return "0 days";
  }

  return `${daysApart} ${daysApart === 1 ? "day" : "days"}`;
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, "");

  if (/^\(.*\)$/.test(cleaned)) {
    const parsed = Number.parseFloat(cleaned.slice(1, -1));
    return Number.isFinite(parsed) ? -parsed : 0;
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseImportDate(value: string): string {
  const trimmed = value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/'(\d{2})$/, "/$1");

  if (!trimmed) {
    return "";
  }

  const withoutTime = trimmed.split(/\s+/)[0];

  if (/^\d{4}-\d{2}-\d{2}$/.test(withoutTime)) {
    return withoutTime;
  }

  if (/^\d{8}$/.test(withoutTime)) {
    const yearFirst = normaliseDateParts(
      withoutTime.slice(6, 8),
      withoutTime.slice(4, 6),
      withoutTime.slice(0, 4),
    );
    if (yearFirst) {
      return yearFirst;
    }

    return normaliseDateParts(
      withoutTime.slice(0, 2),
      withoutTime.slice(2, 4),
      withoutTime.slice(4, 8),
    );
  }

  const delimitedParts = withoutTime.split(/[\/\-.]/).filter(Boolean);

  if (delimitedParts.length === 3) {
    const [first, second, third] = delimitedParts;

    if (first.length === 4) {
      return normaliseDateParts(third, second, first);
    }

    const year = normaliseYear(third);
    return normaliseDateParts(first, second, year);
  }

  const monthNameMatch = trimmed.match(
    /^(\d{1,2})[\s\/-]([A-Za-z]{3,9})[\s\/-](\d{2,4})(?:\s|$)/,
  );
  if (monthNameMatch) {
    const [, day, monthName, year] = monthNameMatch;
    return normaliseDateParts(
      day,
      String(monthNumberFromName(monthName)),
      normaliseYear(year),
    );
  }

  const monthFirstNameMatch = trimmed.match(
    /^([A-Za-z]{3,9})[\s\/-](\d{1,2})(?:,)?[\s\/-](\d{2,4})(?:\s|$)/,
  );
  if (monthFirstNameMatch) {
    const [, monthName, day, year] = monthFirstNameMatch;
    return normaliseDateParts(
      day,
      String(monthNumberFromName(monthName)),
      normaliseYear(year),
    );
  }

  return "";
}

function normaliseYear(value: string): string {
  const cleaned = value.replace(/^'/, "");

  if (cleaned.length === 2) {
    return `20${cleaned}`;
  }

  return cleaned;
}

function monthNumberFromName(value: string): number {
  const month = value.trim().slice(0, 3).toLowerCase();
  return (
    [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(month) + 1
  );
}

function normaliseDateParts(day: string, month: string, year: string): string {
  const numericDay = Number.parseInt(day, 10);
  const numericMonth = Number.parseInt(month, 10);
  const numericYear = Number.parseInt(year, 10);
  const date = new Date(numericYear, numericMonth - 1, numericDay);

  if (
    !Number.isFinite(numericDay) ||
    !Number.isFinite(numericMonth) ||
    !Number.isFinite(numericYear) ||
    date.getFullYear() !== numericYear ||
    date.getMonth() !== numericMonth - 1 ||
    date.getDate() !== numericDay
  ) {
    return "";
  }

  return [
    String(numericYear).padStart(4, "0"),
    String(numericMonth).padStart(2, "0"),
    String(numericDay).padStart(2, "0"),
  ].join("-");
}

function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "");
}

function normalisePayee(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function amountsEqual(
  transaction: RegisterTransactionView,
  parsed: ParsedImportTransaction,
): boolean {
  return (
    cents(transaction.inflow) === cents(parsed.inflow) &&
    cents(transaction.outflow) === cents(parsed.outflow)
  );
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function daysBetween(left: string, right: string): number {
  const leftDate = Date.parse(`${left}T00:00:00.000Z`);
  const rightDate = Date.parse(`${right}T00:00:00.000Z`);

  if (!Number.isFinite(leftDate) || !Number.isFinite(rightDate)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(Math.round((leftDate - rightDate) / 86_400_000));
}

export function getCsvImportSignature(analysis: CsvImportAnalysis): string {
  return analysis.columns
    .map((column) => column.normalisedHeader || `column-${column.index + 1}`)
    .join("|");
}

export function findMatchingTransactionImportProfile(
  profiles: TransactionImportProfile[],
  analysis: CsvImportAnalysis,
): TransactionImportProfile | undefined {
  const signature = getCsvImportSignature(analysis);
  return profiles.find(
    (profile) =>
      profile.parserType === "csv" && profile.signature === signature,
  );
}

export function createTransactionImportProfile({
  name,
  analysis,
  mapping,
  defaultAccountName,
}: {
  name: string;
  analysis: CsvImportAnalysis;
  mapping: CsvImportColumnMapping;
  defaultAccountName?: string;
}): TransactionImportProfile {
  const now = new Date().toISOString();

  return {
    id: `csv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "CSV Import Profile",
    parserType: "csv",
    signature: getCsvImportSignature(analysis),
    mapping,
    defaultAccountName,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertTransactionImportProfile(
  profiles: TransactionImportProfile[],
  profile: TransactionImportProfile,
): TransactionImportProfile[] {
  const existingIndex = profiles.findIndex(
    (existing) =>
      existing.parserType === profile.parserType &&
      existing.signature === profile.signature,
  );

  if (existingIndex === -1) {
    return [...profiles, profile];
  }

  return profiles.map((existing, index) =>
    index === existingIndex
      ? {
          ...existing,
          name: profile.name,
          mapping: profile.mapping,
          defaultAccountName: profile.defaultAccountName,
          updatedAt: profile.updatedAt,
        }
      : existing,
  );
}


export function normalisePayeeAliasSource(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalisePayeeAliasTarget(value: string): string {
  return normalisePayeeAliasSource(value);
}

export function createTransactionPayeeAlias({
  sourcePayee,
  targetPayee,
}: {
  sourcePayee: string;
  targetPayee: string;
}): TransactionPayeeAlias {
  const now = new Date().toISOString();

  return {
    id: `payee-alias-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourcePayee: sourcePayee.trim(),
    targetPayee: targetPayee.trim(),
    normalisedSource: normalisePayeeAliasSource(sourcePayee),
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertTransactionPayeeAlias(
  aliases: TransactionPayeeAlias[],
  alias: TransactionPayeeAlias,
): TransactionPayeeAlias[] {
  const existingIndex = aliases.findIndex(
    (existing) => existing.normalisedSource === alias.normalisedSource,
  );

  if (existingIndex === -1) {
    return [...aliases, alias];
  }

  return aliases.map((existing, index) =>
    index === existingIndex
      ? {
          ...existing,
          sourcePayee: alias.sourcePayee,
          targetPayee: alias.targetPayee,
          updatedAt: alias.updatedAt,
        }
      : existing,
  );
}

export function findMatchingTransactionPayeeAlias(
  payee: string,
  aliases: TransactionPayeeAlias[],
): TransactionPayeeAlias | undefined {
  const normalisedPayee = normalisePayeeAliasSource(payee);

  if (!normalisedPayee) {
    return undefined;
  }

  return [...aliases]
    .filter((alias) => alias.normalisedSource.length >= 3)
    .sort((left, right) => right.normalisedSource.length - left.normalisedSource.length)
    .find(
      (alias) =>
        normalisedPayee === alias.normalisedSource ||
        normalisedPayee.includes(alias.normalisedSource) ||
        alias.normalisedSource.includes(normalisedPayee),
    );
}

export function applyTransactionPayeeAliases(
  transactions: ParsedImportTransaction[],
  aliases: TransactionPayeeAlias[],
): ParsedImportTransaction[] {
  return transactions.map((transaction) => {
    const alias = findMatchingTransactionPayeeAlias(transaction.payee, aliases);

    if (!alias || alias.targetPayee === transaction.payee) {
      return transaction;
    }

    return {
      ...transaction,
      originalPayee: transaction.originalPayee ?? transaction.payee,
      payee: alias.targetPayee,
      payeeAliasId: alias.id,
    };
  });
}

export function suggestTransactionPayeeAliases({
  candidates,
  existingTransactions,
  aliases,
}: {
  candidates: TransactionImportCandidate[];
  existingTransactions: RegisterTransactionView[];
  aliases: TransactionPayeeAlias[];
}): TransactionPayeeAliasSuggestion[] {
  const existingAliasSources = new Set(
    aliases.map((alias) => alias.normalisedSource).filter(Boolean),
  );
  const knownPayees = [...existingTransactions]
    .map((transaction) => transaction.payee.trim())
    .filter(Boolean);

  const knownPayeeByNormalised = new Map<string, string>();
  for (const payee of knownPayees) {
    const normalised = normalisePayeeAliasTarget(payee);
    if (normalised && !knownPayeeByNormalised.has(normalised)) {
      knownPayeeByNormalised.set(normalised, payee);
    }
  }

  const grouped = new Map<
    string,
    { sourcePayee: string; targetPayee: string; occurrenceCount: number }
  >();

  for (const candidate of candidates) {
    const sourcePayee = candidate.parsed.originalPayee ?? candidate.parsed.payee;
    const normalisedSource = normalisePayeeAliasSource(sourcePayee);

    if (!normalisedSource || existingAliasSources.has(normalisedSource)) {
      continue;
    }

    const currentTarget = normalisePayeeAliasTarget(candidate.parsed.payee);
    const directKnownPayee = knownPayeeByNormalised.get(normalisedSource);
    const matchedKnownPayee = candidate.matchedTransaction?.payee.trim();
    const matchedTarget = matchedKnownPayee
      ? normalisePayeeAliasTarget(matchedKnownPayee)
      : "";

    const targetPayee =
      directKnownPayee ??
      (matchedKnownPayee && matchedTarget === normalisedSource
        ? matchedKnownPayee
        : undefined);

    if (!targetPayee) {
      continue;
    }

    if (sourcePayee.trim().toLowerCase() === targetPayee.trim().toLowerCase()) {
      continue;
    }

    if (currentTarget && currentTarget !== normalisedSource) {
      continue;
    }

    const existing = grouped.get(normalisedSource);
    if (existing) {
      existing.occurrenceCount += 1;
    } else {
      grouped.set(normalisedSource, {
        sourcePayee,
        targetPayee,
        occurrenceCount: 1,
      });
    }
  }

  return [...grouped.entries()].map(([normalisedSource, suggestion]) => ({
    id: `payee-alias-suggestion-${normalisedSource.replace(/[^a-z0-9]+/g, "-")}`,
    sourcePayee: suggestion.sourcePayee,
    suggestedTargetPayee: suggestion.targetPayee,
    normalisedSource,
    occurrenceCount: suggestion.occurrenceCount,
    reason:
      suggestion.occurrenceCount > 1
        ? `Found ${suggestion.occurrenceCount} imported rows that look like ${suggestion.targetPayee}.`
        : `This imported merchant looks like existing payee ${suggestion.targetPayee}.`,
  }));
}

export function readTransactionPayeeAliases(): TransactionPayeeAlias[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(
      TRANSACTION_PAYEE_ALIASES_STORAGE_KEY,
    );
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as TransactionPayeeAlias[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeTransactionPayeeAliases(
  aliases: TransactionPayeeAlias[],
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    TRANSACTION_PAYEE_ALIASES_STORAGE_KEY,
    JSON.stringify(aliases),
  );
}

export function readTransactionImportProfiles(): TransactionImportProfile[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(
      TRANSACTION_IMPORT_PROFILES_STORAGE_KEY,
    );
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as TransactionImportProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeTransactionImportProfiles(
  profiles: TransactionImportProfile[],
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    TRANSACTION_IMPORT_PROFILES_STORAGE_KEY,
    JSON.stringify(profiles),
  );
}
