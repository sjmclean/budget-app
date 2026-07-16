export type ImportFileType = "csv" | "qif" | "ofx" | "qfx";
export type ImportSettingSource = "file" | "profile" | "application" | "fallback";
export type ImportInspectionDiagnosticSeverity = "info" | "warning" | "error";

export interface ImportInspectionDiagnostic {
  code: string;
  severity: ImportInspectionDiagnosticSeverity;
  message: string;
}

export interface ImportInspectionSetting<T> {
  value: T;
  source: ImportSettingSource;
  needsConfirmation: boolean;
}

export interface ImportInspectionResult<TSettings, TDetails> {
  fileType: ImportFileType;
  settings: TSettings;
  details: TDetails;
  diagnostics: ImportInspectionDiagnostic[];
  statistics: {
    recordCount: number;
  };
}

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

export interface CsvImportInspectionSettings {
  delimiter: ImportInspectionSetting<",">;
  headerRow: ImportInspectionSetting<boolean>;
  mapping: ImportInspectionSetting<CsvImportColumnMapping>;
}

export interface CsvImportInspectionDetails {
  analysis: CsvImportAnalysis;
}

export type CsvImportInspection = ImportInspectionResult<
  CsvImportInspectionSettings,
  CsvImportInspectionDetails
>;

export type QifDateFormat =
  | "MM/DD/YYYY"
  | "MM-DD-YYYY"
  | "MM/DD/YY"
  | "DD/MM/YYYY"
  | "DD-MM-YYYY"
  | "DD/MM/YY"
  | "YYYYMMDD"
  | "YYYY-MM-DD";
export type QifAmountFormat = "decimal-dot" | "decimal-comma";

export interface QifImportDetection {
  dateFormat: QifDateFormat;
  dateFormatNeedsConfirmation: boolean;
  dateFormatSource: ImportSettingSource;
  amountFormat: QifAmountFormat;
  amountFormatNeedsConfirmation: boolean;
  sampleDates: string[];
  sampleAmounts: string[];
}

export interface QifImportInspectionSettings {
  dateFormat: ImportInspectionSetting<QifDateFormat>;
  amountFormat: ImportInspectionSetting<QifAmountFormat>;
}

export interface QifImportInspectionDetails {
  accountType?: string;
  sampleDates: string[];
  sampleAmounts: string[];
  transferRecordCount: number;
  splitRecordCount: number;
  clearedRecordCount: number;
}

export type QifImportInspection = ImportInspectionResult<
  QifImportInspectionSettings,
  QifImportInspectionDetails
>;

const DATE_HEADERS = ["date", "transaction date", "posted date", "posting date", "settled date", "effective date", "process date", "processed date", "value date"];
const PAYEE_HEADERS = ["payee", "description", "merchant", "name", "narrative", "transaction details", "details"];
const MEMO_HEADERS = ["memo", "notes", "reference", "description 2", "details 2"];
const AMOUNT_HEADERS = ["amount", "value", "transaction amount"];
const OUTFLOW_HEADERS = ["outflow", "debit", "withdrawal", "withdrawals", "spent", "money out"];
const INFLOW_HEADERS = ["inflow", "credit", "deposit", "deposits", "received", "money in"];
const BALANCE_HEADERS = ["balance", "running balance", "account balance"];

export function inspectTransactionCsvImport(csvText: string): CsvImportInspection {
  const rows = parseTransactionImportCsvRows(csvText);
  if (rows.length === 0) {
    const analysis: CsvImportAnalysis = { columns: [], sampleRows: [], suggestedMapping: {}, totalDataRows: 0 };
    return {
      fileType: "csv",
      settings: {
        delimiter: { value: ",", source: "fallback", needsConfirmation: false },
        headerRow: { value: true, source: "fallback", needsConfirmation: true },
        mapping: { value: {}, source: "fallback", needsConfirmation: true },
      },
      details: { analysis },
      diagnostics: [{ code: "csv.empty", severity: "warning", message: "The CSV file does not contain any rows." }],
      statistics: { recordCount: 0 },
    };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const sampleRows = dataRows.slice(0, 5);
  const usedRoles = new Set<CsvImportColumnRole>();
  const columns = headers.map((header, index) => {
    const normalisedHeader = normaliseHeader(header);
    const baseRole = suggestColumnRole(normalisedHeader);
    const suggestedRole = baseRole === "ignore" || baseRole === "balance" || !usedRoles.has(baseRole) ? baseRole : "ignore";
    if (suggestedRole !== "ignore" && suggestedRole !== "balance") usedRoles.add(suggestedRole);
    return {
      index,
      header: header.trim() || `Column ${index + 1}`,
      normalisedHeader,
      sampleValues: sampleRows.map((row) => row[index] ?? "").filter((value) => value.trim()).slice(0, 3),
      suggestedRole,
    };
  });
  const suggestedMapping = Object.fromEntries(columns.map((column) => [column.index, column.suggestedRole])) as CsvImportColumnMapping;
  const analysis: CsvImportAnalysis = { columns, sampleRows, suggestedMapping, totalDataRows: dataRows.length };
  const hasDate = Object.values(suggestedMapping).includes("date");
  const hasAmount = Object.values(suggestedMapping).some((role) => role === "amount" || role === "outflow" || role === "inflow");
  const diagnostics: ImportInspectionDiagnostic[] = [];
  if (!hasDate) diagnostics.push({ code: "csv.mapping.date", severity: "warning", message: "A date column could not be identified automatically." });
  if (!hasAmount) diagnostics.push({ code: "csv.mapping.amount", severity: "warning", message: "Amount columns could not be identified automatically." });

  return {
    fileType: "csv",
    settings: {
      delimiter: { value: ",", source: "file", needsConfirmation: false },
      headerRow: { value: true, source: "file", needsConfirmation: false },
      mapping: { value: suggestedMapping, source: "file", needsConfirmation: !hasDate || !hasAmount },
    },
    details: { analysis },
    diagnostics,
    statistics: { recordCount: dataRows.length },
  };
}


export interface OfxImportInspectionDetails {
  format: "ofx" | "qfx";
  currencyCode?: string;
  accountId?: string;
  statementStartDate?: string;
  statementEndDate?: string;
}

export type OfxImportInspection = ImportInspectionResult<
  Record<string, never>,
  OfxImportInspectionDetails
>;

export function inspectTransactionOfxImport(
  ofxText: string,
  format: "ofx" | "qfx" = "ofx",
): OfxImportInspection {
  const recordCount = (ofxText.match(/<STMTTRN(?:>|\s)/gi) ?? []).length;
  const currencyCode = readOfxTag(ofxText, "CURDEF") || undefined;
  const accountId = readOfxTag(ofxText, "ACCTID") || undefined;
  const statementStartDate = parseOfxInspectionDate(readOfxTag(ofxText, "DTSTART"));
  const statementEndDate = parseOfxInspectionDate(readOfxTag(ofxText, "DTEND"));
  const diagnostics: ImportInspectionDiagnostic[] = [];

  if (!/<OFX(?:>|\s)/i.test(ofxText)) {
    diagnostics.push({
      code: "ofx.structure.missing",
      severity: "error",
      message: "The file does not contain a recognised OFX document.",
    });
  }
  if (recordCount === 0) {
    diagnostics.push({
      code: "ofx.empty",
      severity: "warning",
      message: "The OFX/QFX file does not contain any statement transactions.",
    });
  }

  return {
    fileType: format,
    settings: {},
    details: {
      format,
      currencyCode,
      accountId,
      statementStartDate,
      statementEndDate,
    },
    diagnostics,
    statistics: { recordCount },
  };
}

export const QIF_DATE_FORMAT_OPTIONS: QifDateFormat[] = [
  "MM/DD/YYYY", "MM-DD-YYYY", "MM/DD/YY", "DD/MM/YYYY", "DD-MM-YYYY", "DD/MM/YY", "YYYYMMDD", "YYYY-MM-DD",
];

export function inspectTransactionQifImport(
  qifText: string,
  options?: { preferredDateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" },
): QifImportInspection {
  const detection = detectQifImportFormat(qifText, options);
  const lines = qifText.split(/\r?\n/).map((line) => line.trim());
  const accountType = lines.find((line) => /^!Type:/i.test(line))?.slice("!Type:".length).trim() || undefined;
  const recordCount = lines.filter((line) => line === "^").length;
  const transferRecordCount = lines.filter((line) => /^L\[[^\]]+\]$/.test(line)).length;
  const splitRecordCount = lines.filter((line) => /^[SE$]/.test(line)).length;
  const clearedRecordCount = lines.filter((line) => /^C./.test(line)).length;
  const diagnostics: ImportInspectionDiagnostic[] = [];
  if (detection.dateFormatNeedsConfirmation) diagnostics.push({ code: "qif.date-format.ambiguous", severity: "info", message: "The QIF date format should be confirmed before import." });
  if (detection.amountFormatNeedsConfirmation) diagnostics.push({ code: "qif.amount-format.ambiguous", severity: "info", message: "The QIF amount format should be confirmed before import." });
  if (recordCount === 0) diagnostics.push({ code: "qif.empty", severity: "warning", message: "The QIF file does not contain any transaction records." });

  return {
    fileType: "qif",
    settings: {
      dateFormat: { value: detection.dateFormat, source: detection.dateFormatSource, needsConfirmation: detection.dateFormatNeedsConfirmation },
      amountFormat: { value: detection.amountFormat, source: "file", needsConfirmation: detection.amountFormatNeedsConfirmation },
    },
    details: {
      accountType,
      sampleDates: detection.sampleDates,
      sampleAmounts: detection.sampleAmounts,
      transferRecordCount,
      splitRecordCount,
      clearedRecordCount,
    },
    diagnostics,
    statistics: { recordCount },
  };
}

export function detectQifImportFormat(
  qifText: string,
  options?: { preferredDateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" },
): QifImportDetection {
  const dates: string[] = [];
  const amounts: string[] = [];
  for (const rawLine of qifText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("D")) dates.push(line.slice(1).trim());
    if (line.startsWith("T") || line.startsWith("U")) amounts.push(line.slice(1).trim());
  }
  const validFormats = QIF_DATE_FORMAT_OPTIONS.filter((format) => dates.length > 0 && dates.every((value) => Boolean(parseQifDateValue(value, format))));
  const preferredDateFormat = choosePreferredQifDateFormat(validFormats, options?.preferredDateFormat);
  const localeFallback = mapApplicationDateFormatToQif(options?.preferredDateFormat);
  const dateFormat = validFormats.length === 1 ? validFormats[0] : preferredDateFormat ?? validFormats[0] ?? localeFallback;
  const dateFormatSource: ImportSettingSource = validFormats.length === 1 ? "file" : preferredDateFormat ? "application" : "fallback";
  const commaDecimalEvidence = amounts.some((value) => /\d+[.,]\d{3},\d{1,2}$|^-?\d+,\d{1,2}$/.test(value.replace(/\s/g, "")));
  const dotDecimalEvidence = amounts.some((value) => /\d+[,.]\d{3}\.\d{1,2}$|^-?\d+\.\d{1,2}$/.test(value.replace(/\s/g, "")));
  const amountFormat: QifAmountFormat = commaDecimalEvidence && !dotDecimalEvidence ? "decimal-comma" : "decimal-dot";
  return { dateFormat, dateFormatNeedsConfirmation: validFormats.length !== 1, dateFormatSource, amountFormat, amountFormatNeedsConfirmation: commaDecimalEvidence === dotDecimalEvidence, sampleDates: dates.slice(0, 5), sampleAmounts: amounts.slice(0, 5) };
}

export function parseQifDateValue(value: string, format: QifDateFormat): string {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  let parts: RegExpMatchArray | null = null;
  switch (format) {
    case "YYYYMMDD": parts = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/); return parts ? normaliseDateParts(parts[3], parts[2], parts[1]) : "";
    case "YYYY-MM-DD": parts = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); return parts ? normaliseDateParts(parts[3], parts[2], parts[1]) : "";
    case "MM/DD/YYYY": parts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return parts ? normaliseDateParts(parts[2], parts[1], parts[3]) : "";
    case "MM-DD-YYYY": parts = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); return parts ? normaliseDateParts(parts[2], parts[1], parts[3]) : "";
    case "MM/DD/YY": parts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/); return parts ? normaliseDateParts(parts[2], parts[1], normaliseYear(parts[3])) : "";
    case "DD/MM/YYYY": parts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return parts ? normaliseDateParts(parts[1], parts[2], parts[3]) : "";
    case "DD-MM-YYYY": parts = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); return parts ? normaliseDateParts(parts[1], parts[2], parts[3]) : "";
    case "DD/MM/YY": parts = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/); return parts ? normaliseDateParts(parts[1], parts[2], normaliseYear(parts[3])) : "";
  }
}

export function parseQifMoneyValue(value: string, format: QifAmountFormat): number {
  let cleaned = value.trim().replace(/[\s$£€¥]/g, "");
  const negative = /^\(.*\)$/.test(cleaned);
  if (negative) cleaned = cleaned.slice(1, -1);
  cleaned = format === "decimal-comma" ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

export function parseTransactionImportCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') { cell += '"'; index += 1; } else { inQuotes = !inQuotes; }
      continue;
    }
    if (char === "," && !inQuotes) { row.push(cell.trim()); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = []; cell = ""; continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function suggestColumnRole(header: string): CsvImportColumnRole {
  if (DATE_HEADERS.includes(header)) return "date";
  if (PAYEE_HEADERS.includes(header)) return "payee";
  if (MEMO_HEADERS.includes(header)) return "memo";
  if (OUTFLOW_HEADERS.includes(header)) return "outflow";
  if (INFLOW_HEADERS.includes(header)) return "inflow";
  if (AMOUNT_HEADERS.includes(header)) return "amount";
  if (BALANCE_HEADERS.includes(header)) return "balance";
  return "ignore";
}

function normaliseHeader(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function mapApplicationDateFormatToQif(preference: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" | undefined): QifDateFormat {
  return preference ?? "DD/MM/YYYY";
}

function choosePreferredQifDateFormat(validFormats: QifDateFormat[], preference: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" | undefined): QifDateFormat | undefined {
  if (!preference) return undefined;
  const order = preference.startsWith("DD") ? "day-first" : preference.startsWith("MM") ? "month-first" : "year-first";
  return validFormats.find((format) => order === "day-first" ? format.startsWith("DD") : order === "month-first" ? format.startsWith("MM") : format.startsWith("YYYY"));
}

function normaliseYear(value: string): string {
  const year = Number.parseInt(value, 10);
  return String(year >= 70 ? 1900 + year : 2000 + year);
}

function normaliseDateParts(dayValue: string, monthValue: string, yearValue: string): string {
  const day = Number.parseInt(dayValue, 10);
  const month = Number.parseInt(monthValue, 10);
  const year = Number.parseInt(yearValue, 10);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}


function readOfxTag(text: string, tagName: string): string {
  const match = new RegExp(`<${tagName}>([^<\r\n]*)`, "i").exec(text);
  return match?.[1]?.trim() ?? "";
}

function parseOfxInspectionDate(value: string): string | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
}
