import type {
  NewRegisterTransactionInput,
  RegisterTransactionView,
} from "./accountRegisterTypes";

export type TransactionImportMatchStatus = "exact-match" | "possible-match" | "new" | "invalid";
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
  memo?: string;
  outflow: number;
  inflow: number;
  raw: Record<string, string>;
}

export interface TransactionImportCandidate {
  id: string;
  parsed: ParsedImportTransaction;
  status: TransactionImportMatchStatus;
  matchedTransactionId?: string;
  matchedTransaction?: RegisterTransactionView;
  reason: string;
  selected: boolean;
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

const DATE_HEADERS = ["date", "transaction date", "posted date", "posting date", "settled date", "effective date", "process date", "processed date", "value date"];
const PAYEE_HEADERS = ["payee", "description", "merchant", "name", "narrative", "transaction details", "details"];
const MEMO_HEADERS = ["memo", "notes", "reference", "description 2", "details 2"];
const AMOUNT_HEADERS = ["amount", "value", "transaction amount"];
const OUTFLOW_HEADERS = ["outflow", "debit", "withdrawal", "withdrawals", "spent", "money out"];
const INFLOW_HEADERS = ["inflow", "credit", "deposit", "deposits", "received", "money in"];
const BALANCE_HEADERS = ["balance", "running balance", "account balance"];

export function analyseTransactionCsvImport(csvText: string): CsvImportAnalysis {
  const rows = parseCsvRows(csvText);

  if (rows.length === 0) {
    return { columns: [], sampleRows: [], suggestedMapping: {}, totalDataRows: 0 };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const sampleRows = dataRows.slice(0, 5);
  const usedRoles = new Set<CsvImportColumnRole>();
  const columns = headers.map((header, index) => {
    const normalisedHeader = normaliseHeader(header);
    const baseRole = suggestColumnRole(normalisedHeader);
    const suggestedRole = baseRole === "ignore" || baseRole === "balance" || !usedRoles.has(baseRole)
      ? baseRole
      : "ignore";

    if (suggestedRole !== "ignore" && suggestedRole !== "balance") {
      usedRoles.add(suggestedRole);
    }

    return {
      index,
      header: header.trim() || `Column ${index + 1}`,
      normalisedHeader,
      sampleValues: sampleRows.map((row) => row[index] ?? "").filter((value) => value.trim()).slice(0, 3),
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
  const parsed = parseTransactionCsv(csvText, mapping);
  const candidates = parsed.map((transaction) => classifyImportCandidate(transaction, existingTransactions));

  return {
    candidates,
    summary: {
      totalRows: candidates.length,
      newTransactions: candidates.filter((candidate) => candidate.status === "new").length,
      exactMatches: candidates.filter((candidate) => candidate.status === "exact-match").length,
      possibleMatches: candidates.filter((candidate) => candidate.status === "possible-match").length,
      invalidRows: candidates.filter((candidate) => candidate.status === "invalid").length,
      selectedForImport: candidates.filter((candidate) => candidate.selected).length,
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

export function parseTransactionCsv(csvText: string, mapping?: CsvImportColumnMapping): ParsedImportTransaction[] {
  const rows = parseCsvRows(csvText);

  if (rows.length <= 1) {
    return [];
  }

  const headers = rows[0].map((header, index) => header.trim() || `Column ${index + 1}`);
  const resolvedMapping = mapping ?? analyseTransactionCsvImport(csvText).suggestedMapping;

  return rows.slice(1).map((row, index) => {
    const raw = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""]));
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

function readRole(row: string[], mapping: CsvImportColumnMapping, role: CsvImportColumnRole): string {
  const entry = Object.entries(mapping).find(([, mappedRole]) => mappedRole === role);
  if (!entry) {
    return "";
  }

  return row[Number(entry[0])] ?? "";
}

function readImportPayee(row: string[], mapping: CsvImportColumnMapping, memoValue: string): string {
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

function readMappedImportAmount(row: string[], mapping: CsvImportColumnMapping): { outflow: number; inflow: number } {
  const explicitOutflow = parseMoney(readRole(row, mapping, "outflow"));
  const explicitInflow = parseMoney(readRole(row, mapping, "inflow"));

  if (explicitOutflow > 0 || explicitInflow > 0) {
    return { outflow: Math.abs(explicitOutflow), inflow: Math.abs(explicitInflow) };
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

  const exact = existingTransactions.find(
    (transaction) =>
      transaction.date === parsed.date &&
      amountsEqual(transaction, parsed) &&
      normalisePayee(transaction.payee) === normalisePayee(parsed.payee),
  );

  if (exact) {
    return {
      id: `row-${parsed.rowNumber}`,
      parsed,
      status: "exact-match",
      matchedTransactionId: exact.id,
      matchedTransaction: exact,
      reason: "Exact date, amount, and payee match already exists in this register.",
      selected: false,
      errors: [],
    };
  }

  const automaticNear = existingTransactions.find(
    (transaction) => amountsEqual(transaction, parsed) && daysBetween(transaction.date, parsed.date) <= 3,
  );

  if (automaticNear) {
    return {
      id: `row-${parsed.rowNumber}`,
      parsed,
      status: "exact-match",
      matchedTransactionId: automaticNear.id,
      matchedTransaction: automaticNear,
      reason: "Matched by same amount within 3 days in this register.",
      selected: false,
      errors: [],
    };
  }

  const possible = existingTransactions.find(
    (transaction) => amountsEqual(transaction, parsed) && daysBetween(transaction.date, parsed.date) <= 7,
  );

  if (possible) {
    return {
      id: `row-${parsed.rowNumber}`,
      parsed,
      status: "possible-match",
      matchedTransactionId: possible.id,
      matchedTransaction: possible,
      reason: "Possible match: same amount within 7 days. Review before importing as new.",
      selected: false,
      errors: [],
    };
  }

  return {
    id: `row-${parsed.rowNumber}`,
    parsed,
    status: "new",
    reason: "No matching transaction found in this register.",
    selected: true,
    errors: [],
  };
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
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");

  if (!trimmed) {
    return "";
  }

  const withoutTime = trimmed.split(/\s+/)[0];

  if (/^\d{4}-\d{2}-\d{2}$/.test(withoutTime)) {
    return withoutTime;
  }

  if (/^\d{8}$/.test(withoutTime)) {
    const yearFirst = normaliseDateParts(withoutTime.slice(6, 8), withoutTime.slice(4, 6), withoutTime.slice(0, 4));
    if (yearFirst) {
      return yearFirst;
    }

    return normaliseDateParts(withoutTime.slice(0, 2), withoutTime.slice(2, 4), withoutTime.slice(4, 8));
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

  const monthNameMatch = trimmed.match(/^(\d{1,2})[\s\/-]([A-Za-z]{3,9})[\s\/-](\d{2,4})(?:\s|$)/);
  if (monthNameMatch) {
    const [, day, monthName, year] = monthNameMatch;
    return normaliseDateParts(day, String(monthNumberFromName(monthName)), normaliseYear(year));
  }

  const monthFirstNameMatch = trimmed.match(/^([A-Za-z]{3,9})[\s\/-](\d{1,2})(?:,)?[\s\/-](\d{2,4})(?:\s|$)/);
  if (monthFirstNameMatch) {
    const [, monthName, day, year] = monthFirstNameMatch;
    return normaliseDateParts(day, String(monthNumberFromName(monthName)), normaliseYear(year));
  }

  return "";
}

function normaliseYear(value: string): string {
  if (value.length === 2) {
    return `20${value}`;
  }

  return value;
}

function monthNumberFromName(value: string): number {
  const month = value.trim().slice(0, 3).toLowerCase();
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month) + 1;
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
  return value.trim().toLowerCase().replace(/^\uFEFF/, "");
}

function normalisePayee(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function amountsEqual(transaction: RegisterTransactionView, parsed: ParsedImportTransaction): boolean {
  return cents(transaction.inflow) === cents(parsed.inflow) && cents(transaction.outflow) === cents(parsed.outflow);
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
