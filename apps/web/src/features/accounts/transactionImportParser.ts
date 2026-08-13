import {
  inspectTransactionCsvImport,
  detectQifImportFormat,
  parseQifDateValue,
  parseQifMoneyValue,
  parseTransactionImportCsvRows,
} from "./transactionImportInspection";
import type {
  CsvImportColumnMapping,
  CsvImportColumnRole,
  QifAmountFormat,
  QifDateFormat,
} from "./transactionImportInspection";

export interface ParsedImportTransaction {
  readonly rowNumber: number;
  readonly date: string;
  readonly payee: string;
  readonly memo?: string;
  readonly importedCategoryName?: string;
  readonly transferAccountName?: string;
  readonly outflow: number;
  readonly inflow: number;
  readonly raw: Readonly<Record<string, string>>;
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
    mapping ?? inspectTransactionCsvImport(csvText).details.analysis.suggestedMapping;

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
  const hasExplicitAmountColumns = Object.values(mapping).some(
    (role) => role === "outflow" || role === "inflow",
  );

  if (hasExplicitAmountColumns) {
    const explicitOutflow = parseMoney(readRole(row, mapping, "outflow"));
    const explicitInflow = parseMoney(readRole(row, mapping, "inflow"));

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


export function parseTransactionOfx(
  ofxText: string,
): ParsedImportTransaction[] {
  const blocks =
    ofxText.match(/<STMTTRN(?:>|\s)[\s\S]*?(?=<STMTTRN(?:>|\s)|<\/BANKTRANLIST>|<\/CCSTMTRS>|$)/gi) ?? [];

  return blocks.map((block, index) => {
    const amount = parseOfxMoney(readOfxValue(block, "TRNAMT"));
    const payee =
      readOfxValue(block, "NAME") ||
      readOfxValue(block, "PAYEE") ||
      readOfxValue(block, "MEMO");
    const memo = readOfxValue(block, "MEMO") || undefined;
    const fitId = readOfxValue(block, "FITID");
    const transactionType = readOfxValue(block, "TRNTYPE");

    return {
      rowNumber: index + 1,
      date: parseOfxDate(readOfxValue(block, "DTPOSTED")),
      payee: payee.trim(),
      memo,
      outflow: amount < 0 ? Math.abs(amount) : 0,
      inflow: amount > 0 ? Math.abs(amount) : 0,
      raw: {
        fitId,
        transactionType,
        postedDate: readOfxValue(block, "DTPOSTED"),
        amount: readOfxValue(block, "TRNAMT"),
        name: readOfxValue(block, "NAME"),
        memo: readOfxValue(block, "MEMO"),
      },
    };
  });
}

function readOfxValue(block: string, tagName: string): string {
  const match = new RegExp(`<${tagName}>([^<\r\n]*)`, "i").exec(block);
  return match?.[1]?.trim() ?? "";
}

function parseOfxDate(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function parseOfxMoney(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
