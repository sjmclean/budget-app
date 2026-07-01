import { deflateRawSync } from "node:zlib";
import { ActualSQLiteRepository } from "../packages/application/src/actualBudget/ActualSQLiteRepository.js";
import { mapActualSQLiteRepositoryToFullBudgetPreview } from "../packages/application/src/actualBudget/ActualBudgetMapper.js";
import { BudgetImportProviderApplicationService } from "../packages/application/src/BudgetImportProviderApplicationService.js";

const actualDatabase = buildActualSQLiteDatabase({
  accounts: {
    sql: "CREATE TABLE accounts(id TEXT, name TEXT, offbudget INTEGER, closed INTEGER)",
    rows: [
      ["acc-cheque", "Cheque", 0, 0],
      ["acc-savings", "Savings", 0, 0],
    ],
  },
  category_groups: {
    sql: "CREATE TABLE category_groups(id TEXT, name TEXT, hidden INTEGER)",
    rows: [["group-everyday", "Everyday", 0]],
  },
  categories: {
    sql: "CREATE TABLE categories(id TEXT, name TEXT, cat_group TEXT, hidden INTEGER)",
    rows: [["cat-groceries", "Groceries", "group-everyday", 0]],
  },
  payees: {
    sql: "CREATE TABLE payees(id TEXT, name TEXT, transfer_acct TEXT)",
    rows: [
      ["payee-woolworths", "Woolworths", null],
      ["payee-transfer-savings", "", "acc-savings"],
    ],
  },
  transactions: {
    sql: "CREATE TABLE transactions(id TEXT, acct TEXT, category TEXT, amount INTEGER, description TEXT, imported_description TEXT, notes TEXT, date INTEGER, cleared INTEGER, reconciled INTEGER)",
    rows: [
      ["tx-grocery", "acc-cheque", "cat-groceries", -4250, "payee-woolworths", "Woolworths Supermarket", "Weekly shop", 20260701, 1, 0],
      ["tx-transfer", "acc-cheque", null, -10000, "payee-transfer-savings", null, null, 20260702, 1, 0],
    ],
  },
});

const repository = new ActualSQLiteRepository(actualDatabase);
const accounts = repository.readTableRows("accounts");
if (accounts.columns.join(",") !== "id,name,offbudget,closed") throw new Error("Expected Actual accounts column order");
if (accounts.rows.length !== 2) throw new Error("Expected Actual accounts rows");
if (accounts.rows[0].values.name !== "Cheque") throw new Error("Expected Actual account row values");

const mapped = mapActualSQLiteRepositoryToFullBudgetPreview(repository);
if (mapped.accounts.length !== 2) throw new Error("Expected mapped accounts");
if (mapped.categoryGroups[0]?.name !== "Everyday") throw new Error("Expected mapped category group");
if (mapped.categories[0]?.groupName !== "Everyday") throw new Error("Expected mapped category group name");
if (mapped.payees.length !== 2) throw new Error("Expected mapped payees");
const transferPayee = mapped.payees.find((payee) => payee.id === "payee-transfer-savings");
if (transferPayee?.name !== "Transfer: Savings") throw new Error("Expected blank Actual transfer payees to display using the transfer account name");
if (mapped.transactions.length !== 2) throw new Error("Expected mapped transactions");
const grocery = mapped.transactions.find((transaction) => transaction.id === "tx-grocery");
if (!grocery) throw new Error("Expected grocery transaction");
if (grocery.accountName !== "Cheque") throw new Error("Expected transaction account name");
if (grocery.categoryName !== "Groceries") throw new Error("Expected transaction category name");
if (grocery.payeeName !== "Woolworths") throw new Error("Expected transaction payee name to resolve from Actual description payee id");
if (grocery.date !== "2026-07-01") throw new Error("Expected Actual integer date to normalize to ISO date");
if (grocery.amount !== -4250) throw new Error("Expected transaction amount");
if (grocery.memo !== "Weekly shop") throw new Error("Expected transaction memo");
if (grocery.cleared !== true) throw new Error("Expected transaction cleared state");
const transfer = mapped.transactions.find((transaction) => transaction.id === "tx-transfer");
if (!transfer?.isTransfer || transfer.transferId !== "acc-savings") throw new Error("Expected transfer detection from Actual payee transfer account");
if (mapped.transferCount !== 1) throw new Error("Expected mapped transfer count");

const service = new BudgetImportProviderApplicationService();
const actualZip = buildZip({
  "metadata.json": JSON.stringify({ budgetName: "Actual Household", lastUploaded: "2026-07-01" }),
  "db.sqlite": actualDatabase,
});
const preview = await service.fullBudgetPreviewAsync({ fileName: "actual-export.zip", text: "", binary: actualZip });
if (!preview) throw new Error("Expected Actual full-budget preview");
if (preview.accounts.length !== 2) throw new Error("Expected preview accounts from SQLite rows");
if (preview.categories[0]?.name !== "Groceries") throw new Error("Expected preview categories from SQLite rows");
if (preview.transactions.length !== 2) throw new Error("Expected preview transactions from SQLite rows");
if (preview.transferCount !== 1) throw new Error("Expected preview transfer count from SQLite rows");
if (!preview.canCommit) throw new Error("Actual import preview should now be commit-capable after v2.44.5");

console.log("v2.44.4 Actual SQLite mapping checks passed");

type SQLiteCellValue = string | number | null;

function buildActualSQLiteDatabase(tables: Record<string, { sql: string; rows: SQLiteCellValue[][] }>): Uint8Array {
  const tableEntries = Object.entries(tables);
  const pageSize = 4096;
  const pageCount = tableEntries.length + 1;
  const bytes = new Uint8Array(pageSize * pageCount);
  const header = new TextEncoder().encode("SQLite format 3\0");
  bytes.set(header, 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(16, pageSize, false);
  view.setUint32(28, pageCount, false);
  view.setUint32(44, 4, false);
  view.setUint32(56, 1, false);

  const schemaRecords = tableEntries.map(([name, table], index) =>
    buildCell(index + 1, ["table", name, name, index + 2, table.sql]),
  );
  writeLeafPage(bytes, pageSize, 1, 100, schemaRecords);

  tableEntries.forEach(([, table], index) => {
    const records = table.rows.map((row, rowIndex) => buildCell(rowIndex + 1, row));
    writeLeafPage(bytes, pageSize, index + 2, 0, records);
  });

  return bytes;
}

function buildCell(rowId: number, values: SQLiteCellValue[]): Uint8Array {
  const record = buildRecord(values);
  return concatUint8Arrays([encodeVarint(record.length), encodeVarint(rowId), record]);
}

function buildRecord(values: SQLiteCellValue[]): Uint8Array {
  const serialTypes: number[] = [];
  const bodyParts: Uint8Array[] = [];
  const encoder = new TextEncoder();

  for (const value of values) {
    if (value === null) {
      serialTypes.push(0);
    } else if (typeof value === "number") {
      serialTypes.push(4);
      const bytes = new Uint8Array(4);
      new DataView(bytes.buffer).setInt32(0, value, false);
      bodyParts.push(bytes);
    } else {
      const bytes = encoder.encode(value);
      serialTypes.push(13 + bytes.length * 2);
      bodyParts.push(bytes);
    }
  }

  const serialTypeBytes = serialTypes.map(encodeVarint);
  let headerLength = 1 + serialTypeBytes.reduce((sum, part) => sum + part.length, 0);
  let headerLengthBytes = encodeVarint(headerLength);
  headerLength = headerLengthBytes.length + serialTypeBytes.reduce((sum, part) => sum + part.length, 0);
  headerLengthBytes = encodeVarint(headerLength);

  return concatUint8Arrays([headerLengthBytes, ...serialTypeBytes, ...bodyParts]);
}

function writeLeafPage(bytes: Uint8Array, pageSize: number, pageNumber: number, headerOffset: number, cells: Uint8Array[]): void {
  const pageOffset = (pageNumber - 1) * pageSize;
  const view = new DataView(bytes.buffer, pageOffset, pageSize);
  view.setUint8(headerOffset, 0x0d);
  view.setUint16(headerOffset + 3, cells.length, false);
  let contentOffset = pageSize;
  cells.forEach((cell, index) => {
    contentOffset -= cell.length;
    bytes.set(cell, pageOffset + contentOffset);
    view.setUint16(headerOffset + 8 + index * 2, contentOffset, false);
  });
  view.setUint16(headerOffset + 5, contentOffset, false);
}

function encodeVarint(value: number): Uint8Array {
  if (value < 0x80) return Uint8Array.of(value);
  const bytes: number[] = [value & 0x7f];
  value = Math.floor(value / 0x80);
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value = Math.floor(value / 0x80);
  }
  return Uint8Array.from(bytes);
}

function buildZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const rawBytes = typeof content === "string" ? encoder.encode(content) : content;
    const compressed = deflateRawSync(rawBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 8, true);
    localView.setUint32(14, 0, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, rawBytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, compressed);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, 8, true);
    centralView.setUint32(16, 0, true);
    centralView.setUint32(20, compressed.length, true);
    centralView.setUint32(24, rawBytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, Object.keys(files).length, true);
  endView.setUint16(10, Object.keys(files).length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);

  return concatUint8Arrays([...localParts, ...centralParts, end]);
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
