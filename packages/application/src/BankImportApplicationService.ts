import type { BankImportIssue, BankImportPreview, CsvBankImportMapping, ImportedBankTransaction } from "../../types/src/index.js";

/**
 * Parses ongoing bank-statement imports into one normalized transaction shape.
 *
 * This service deliberately does not write to the database. Bank files are messy:
 * column names differ, signs are inconsistent, and OFX/QIF files often contain
 * partial data. The UI should first show this preview, warnings, and duplicate
 * matches before committing anything to the budget.
 */
export class BankImportApplicationService {
  previewCsv(csvText: string, mapping: CsvBankImportMapping): BankImportPreview {
    const issues: BankImportIssue[] = [];
    const rows = parseCsv(csvText);
    const dataRows = mapping.hasHeader === false ? rows : rows.slice(1);
    const header = mapping.hasHeader === false ? null : rows[0] ?? [];

    const transactions: ImportedBankTransaction[] = [];

    dataRows.forEach((row, index) => {
      const rowNumber = (mapping.hasHeader === false ? index : index + 1) + 1;
      const get = (columnName: string | undefined): string => {
        if (!columnName) return "";
        const columnIndex = header ? header.findIndex((h) => h.trim().toLowerCase() === columnName.trim().toLowerCase()) : Number(columnName);
        if (columnIndex < 0 || Number.isNaN(columnIndex)) return "";
        return (row[columnIndex] ?? "").trim();
      };

      const date = parseDate(get(mapping.date), mapping.dateFormat ?? "yyyy-mm-dd");
      const rawPayee = get(mapping.payee);
      const memo = get(mapping.memo) || null;
      const externalId = get(mapping.externalId) || null;
      const importedCategoryName = get(mapping.category) || null;
      const amount = parseCsvAmount(get(mapping.amount), get(mapping.debit), get(mapping.credit));

      if (!date) {
        issues.push({ rowNumber, severity: "error", code: "InvalidDate", message: "Could not parse transaction date." });
        return;
      }
      if (!rawPayee) {
        issues.push({ rowNumber, severity: "warning", code: "MissingPayee", message: "Bank row has no payee/description." });
      }
      if (amount === null) {
        issues.push({ rowNumber, severity: "error", code: "InvalidAmount", message: "Could not parse transaction amount." });
        return;
      }

      transactions.push({ externalId, date, rawPayee, memo, amount, importedCategoryName });
    });

    return { format: "csv", transactions, issues };
  }

  previewQif(qifText: string): BankImportPreview {
    const issues: BankImportIssue[] = [];
    const transactions: ImportedBankTransaction[] = [];
    let current: Partial<ImportedBankTransaction> = {};
    let rowNumber = 0;

    const commit = () => {
      if (!current.date && !current.rawPayee && current.amount === undefined) return;
      if (!current.date || current.amount === undefined) {
        issues.push({ rowNumber, severity: "error", code: "IncompleteQifTransaction", message: "QIF transaction is missing a date or amount." });
      } else {
        transactions.push({
          externalId: current.externalId ?? null,
          date: current.date,
          rawPayee: current.rawPayee ?? "",
          memo: current.memo ?? null,
          amount: current.amount,
          importedCategoryName: current.importedCategoryName ?? null
        });
      }
      current = {};
    };

    for (const line of qifText.split(/\r?\n/)) {
      rowNumber += 1;
      const code = line.slice(0, 1);
      const value = line.slice(1).trim();
      if (line === "^") {
        commit();
      } else if (code === "D") {
        current.date = parseDate(value, value.includes("/") ? "dd/mm/yyyy" : "yyyy-mm-dd") ?? undefined;
      } else if (code === "T") {
        const parsed = parseMoneyToMinorUnits(value);
        if (parsed !== null) current.amount = parsed;
      } else if (code === "P") {
        current.rawPayee = value;
      } else if (code === "M") {
        current.memo = value;
      } else if (code === "L") {
        current.importedCategoryName = value;
      } else if (code === "N") {
        current.externalId = value || null;
      }
    }
    commit();

    return { format: "qif", transactions, issues };
  }

  previewOfx(ofxText: string, format: "ofx" | "qfx" = "ofx"): BankImportPreview {
    const issues: BankImportIssue[] = [];
    const transactions: ImportedBankTransaction[] = [];
    const blocks = ofxText.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi) ?? [];

    blocks.forEach((block, index) => {
      const date = parseOfxDate(tag(block, "DTPOSTED"));
      const rawPayee = tag(block, "NAME") || tag(block, "PAYEE") || "";
      const memo = tag(block, "MEMO") || null;
      const externalId = tag(block, "FITID") || null;
      const amount = parseMoneyToMinorUnits(tag(block, "TRNAMT"));

      if (!date || amount === null) {
        issues.push({ rowNumber: index + 1, severity: "error", code: "InvalidOfxTransaction", message: "OFX/QFX transaction is missing a valid date or amount." });
        return;
      }
      transactions.push({ externalId, date, rawPayee, memo, amount, importedCategoryName: null });
    });

    return { format, transactions, issues };
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function parseCsvAmount(amount: string, debit: string, credit: string): number | null {
  if (amount) return parseMoneyToMinorUnits(amount);
  const debitAmount = debit ? parseMoneyToMinorUnits(debit) : null;
  const creditAmount = credit ? parseMoneyToMinorUnits(credit) : null;
  if (debitAmount !== null && debitAmount !== 0) return -Math.abs(debitAmount);
  if (creditAmount !== null && creditAmount !== 0) return Math.abs(creditAmount);
  return null;
}

function parseMoneyToMinorUnits(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

function parseDate(value: string, format: "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy"): string | null {
  const clean = value.trim();
  if (!clean) return null;
  if (format === "yyyy-mm-dd") {
    const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(clean);
    return match ? iso(match[1], match[2], match[3]) : null;
  }
  const match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/.exec(clean);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return format === "dd/mm/yyyy" ? iso(year, match[2], match[1]) : iso(year, match[1], match[2]);
}

function parseOfxDate(value: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  return match ? iso(match[1], match[2], match[3]) : null;
}

function iso(year: string, month: string, day: string): string {
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function tag(block: string, name: string): string {
  const match = new RegExp(`<${name}>([^<\\r\\n]*)`, "i").exec(block);
  return match?.[1]?.trim() ?? "";
}
