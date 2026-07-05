import type {
  NewRegisterTransactionInput,
  RegisterTransactionView,
} from "./accountRegisterTypes";

export type TransactionImportMatchStatus =
  "exact-match" | "possible-match" | "new" | "invalid";
export type CsvImportColumnRole =
  | "date"
  | "payee"
  | "payeeFallback"
  | "memo"
  | "amount"
  | "outflow"
  | "inflow"
  | "balance"
  | "ignore";
export type CsvImportColumnMapping = Record<number, CsvImportColumnRole>;

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

export const TRANSACTION_PAYEE_ALIASES_STORAGE_KEY =
  "budget-app.transaction-payee-aliases.v1";

export const HIGH_CONFIDENCE_IMPORT_MATCH_DAYS = 5;
export const SUGGESTED_IMPORT_MATCH_DAYS = 10;

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

export interface CsvImportColumnAnalysis {
  index: number;
  header: string;
  normalisedHeader: string;
  sampleValues: string[];
  suggestedRole: CsvImportColumnRole;
}

export interface CsvImportAnalysis {
  columns: CsvImportColumnAnalysis[];
  sampleRows: string[][];
  suggestedMapping: CsvImportColumnMapping;
  totalDataRows: number;
}

export interface ParsedImportTransaction {
  rowNumber: number;
  date: string;
  payee: string;
  originalPayee?: string;
  payeeAliasId?: string;
  memo?: string;
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
  selected: boolean;
  reviewDecision?: TransactionImportReviewDecision;
  errors: string[];
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

const DATE_HEADERS = [
  "date",
  "transaction date",
  "posted date",
  "posting date",
  "settled date",
  "effective date",
  "process date",
  "processed date",
  "value date",
];
const PAYEE_HEADERS = [
  "payee",
  "description",
  "merchant",
  "name",
  "narrative",
  "transaction details",
  "details",
];
const MEMO_HEADERS = [
  "memo",
  "notes",
  "reference",
  "description 2",
  "details 2",
];
const AMOUNT_HEADERS = ["amount", "value", "transaction amount"];
const OUTFLOW_HEADERS = [
  "outflow",
  "debit",
  "withdrawal",
  "withdrawals",
  "spent",
  "money out",
];
const INFLOW_HEADERS = [
  "inflow",
  "credit",
  "deposit",
  "deposits",
  "received",
  "money in",
];
const BALANCE_HEADERS = ["balance", "running balance", "account balance"];

export function analyseTransactionCsvImport(
  csvText: string,
): CsvImportAnalysis {
  const rows = parseCsvRows(csvText);

  if (rows.length === 0) {
    return {
      columns: [],
      sampleRows: [],
      suggestedMapping: {},
      totalDataRows: 0,
    };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const sampleRows = dataRows.slice(0, 5);
  const usedRoles = new Set<CsvImportColumnRole>();
  const columns = headers.map((header, index) => {
    const normalisedHeader = normaliseHeader(header);
    const baseRole = suggestColumnRole(normalisedHeader);
    const suggestedRole =
      baseRole === "ignore" ||
      baseRole === "balance" ||
      !usedRoles.has(baseRole)
        ? baseRole
        : "ignore";

    if (suggestedRole !== "ignore" && suggestedRole !== "balance") {
      usedRoles.add(suggestedRole);
    }

    return {
      index,
      header: header.trim() || `Column ${index + 1}`,
      normalisedHeader,
      sampleValues: sampleRows
        .map((row) => row[index] ?? "")
        .filter((value) => value.trim())
        .slice(0, 3),
      suggestedRole,
    };
  });
  const suggestedMapping = Object.fromEntries(
    columns.map((column) => [column.index, column.suggestedRole]),
  ) as CsvImportColumnMapping;

  return {
    columns,
    sampleRows,
    suggestedMapping,
    totalDataRows: dataRows.length,
  };
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

export function previewTransactionQifImport(
  qifText: string,
  existingTransactions: RegisterTransactionView[],
): TransactionImportPreview {
  return buildTransactionImportPreview(
    applyTransactionPayeeAliases(
      parseTransactionQif(qifText),
      readTransactionPayeeAliases(),
    ),
    existingTransactions,
  );
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

export function buildRegisterTransactionsFromImport(
  candidates: TransactionImportCandidate[],
): NewRegisterTransactionInput[] {
  return candidates
    .filter((candidate) => candidate.selected && candidate.status === "new")
    .map((candidate) => ({
      date: candidate.parsed.date,
      payee: candidate.parsed.payee,
      category:
        candidate.parsed.inflow > 0 && candidate.parsed.outflow === 0
          ? "Ready to Assign"
          : "Uncategorised",
      categoryId:
        candidate.parsed.inflow > 0 && candidate.parsed.outflow === 0
          ? "__ready_to_assign__"
          : undefined,
      memo: candidate.parsed.memo,
      outflow: candidate.parsed.outflow,
      inflow: candidate.parsed.inflow,
    }));
}

export function parseTransactionCsv(
  csvText: string,
  mapping?: CsvImportColumnMapping,
): ParsedImportTransaction[] {
  const rows = parseCsvRows(csvText);

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
): ParsedImportTransaction[] {
  const transactions: ParsedImportTransaction[] = [];
  let record: Record<string, string> = {};
  let rowNumber = 1;

  function commitRecord() {
    if (Object.keys(record).length === 0) {
      return;
    }

    const amount = parseMoney(record.amount ?? "");
    const payee = (record.payee ?? record.memo ?? "").trim();
    const memo = record.memo?.trim() || undefined;

    transactions.push({
      rowNumber,
      date: normaliseImportDate(record.date ?? ""),
      payee,
      memo,
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

function suggestColumnRole(header: string): CsvImportColumnRole {
  if (DATE_HEADERS.includes(header)) {
    return "date";
  }

  if (PAYEE_HEADERS.includes(header)) {
    return "payee";
  }

  if (MEMO_HEADERS.includes(header)) {
    return "memo";
  }

  if (OUTFLOW_HEADERS.includes(header)) {
    return "outflow";
  }

  if (INFLOW_HEADERS.includes(header)) {
    return "inflow";
  }

  if (AMOUNT_HEADERS.includes(header)) {
    return "amount";
  }

  if (BALANCE_HEADERS.includes(header)) {
    return "balance";
  }

  return "ignore";
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
  const errors = validateParsedTransaction(parsed);

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

  const matchAnalyses = existingTransactions
    .map((transaction) => analyseImportMatchCandidate(transaction, parsed))
    .filter((analysis) => analysis.amountMatches)
    .sort((left, right) => right.confidence - left.confidence);
  const bestMatch = matchAnalyses[0];

  if (bestMatch?.isExactMatch) {
    return {
      id: `row-${parsed.rowNumber}`,
      parsed,
      status: "exact-match",
      matchedTransactionId: bestMatch.transaction.id,
      matchedTransaction: bestMatch.transaction,
      reason: bestMatch.reason,
      confidence: bestMatch.confidence,
      evidence: bestMatch.evidence,
      selected: false,
      errors: [],
    };
  }

  if (bestMatch?.isSuggestedMatch) {
    return {
      id: `row-${parsed.rowNumber}`,
      parsed,
      status: "possible-match",
      matchedTransactionId: bestMatch.transaction.id,
      matchedTransaction: bestMatch.transaction,
      reason: bestMatch.reason,
      confidence: bestMatch.confidence,
      evidence: bestMatch.evidence,
      selected: false,
      errors: [],
    };
  }

  return {
    id: `row-${parsed.rowNumber}`,
    parsed,
    status: "new",
    reason: bestMatch
      ? `No suitable match found. Closest same-amount candidate was ${formatImportDateDistance(
          bestMatch.daysApart,
        )} away with ${bestMatch.payeeSimilarity}% payee similarity.`
      : "No matching transaction found in this register.",
    confidence: bestMatch?.confidence ?? 0,
    evidence: bestMatch?.evidence,
    selected: true,
    errors: [],
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
  const exactPayee = normalisePayee(transaction.payee) === normalisePayee(parsed.payee);
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
  const leftNormalised = normalisePayee(left);
  const rightNormalised = normalisePayee(right);

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

  const leftTokens = normalisePayeeTokens(left);
  const rightTokens = normalisePayeeTokens(right);

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

function validateParsedTransaction(parsed: ParsedImportTransaction): string[] {
  const errors: string[] = [];

  if (!parsed.date) {
    errors.push("Missing or invalid date.");
  }

  if (!parsed.payee) {
    errors.push("Missing payee/description.");
  }

  if (parsed.inflow <= 0 && parsed.outflow <= 0) {
    errors.push("Missing amount.");
  }

  return errors;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }

      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
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
