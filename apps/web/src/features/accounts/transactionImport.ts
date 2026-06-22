import type {
  NewRegisterTransactionInput,
  RegisterTransactionView,
} from "./accountRegisterTypes";

export type TransactionImportMatchStatus = "exact-match" | "possible-match" | "new" | "invalid";

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

const DATE_HEADERS = ["date", "transaction date", "posted date", "settled date"];
const PAYEE_HEADERS = ["payee", "description", "merchant", "name"];
const MEMO_HEADERS = ["memo", "notes", "details", "reference"];
const AMOUNT_HEADERS = ["amount", "value"];
const OUTFLOW_HEADERS = ["outflow", "debit", "withdrawal", "withdrawals", "spent"];
const INFLOW_HEADERS = ["inflow", "credit", "deposit", "deposits", "received"];

export function previewTransactionCsvImport(
  csvText: string,
  existingTransactions: RegisterTransactionView[],
): TransactionImportPreview {
  const parsed = parseTransactionCsv(csvText);
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

export function parseTransactionCsv(csvText: string): ParsedImportTransaction[] {
  const rows = parseCsvRows(csvText);

  if (rows.length <= 1) {
    return [];
  }

  const headers = rows[0].map(normaliseHeader);

  return rows.slice(1).map((row, index) => {
    const raw = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""]));
    const date = normaliseImportDate(readFirst(raw, DATE_HEADERS));
    const payee = readFirst(raw, PAYEE_HEADERS).trim();
    const memo = readFirst(raw, MEMO_HEADERS).trim() || undefined;
    const { outflow, inflow } = readImportAmount(raw);

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

function readFirst(row: Record<string, string>, headers: string[]): string {
  for (const header of headers) {
    const value = row[header];

    if (value !== undefined && value.trim()) {
      return value;
    }
  }

  return "";
}

function readImportAmount(row: Record<string, string>): { outflow: number; inflow: number } {
  const explicitOutflow = parseMoney(readFirst(row, OUTFLOW_HEADERS));
  const explicitInflow = parseMoney(readFirst(row, INFLOW_HEADERS));

  if (explicitOutflow > 0 || explicitInflow > 0) {
    return { outflow: Math.abs(explicitOutflow), inflow: Math.abs(explicitInflow) };
  }

  const amount = parseMoney(readFirst(row, AMOUNT_HEADERS));

  if (amount < 0) {
    return { outflow: Math.abs(amount), inflow: 0 };
  }

  return { outflow: 0, inflow: Math.abs(amount) };
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseImportDate(value: string): string {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parts = trimmed.split(/[\/\-.]/).filter(Boolean);

  if (parts.length !== 3) {
    return "";
  }

  const [first, second, third] = parts;

  if (first.length === 4) {
    return normaliseDateParts(third, second, first);
  }

  const year = third.length === 2 ? `20${third}` : third;
  return normaliseDateParts(first, second, year);
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
