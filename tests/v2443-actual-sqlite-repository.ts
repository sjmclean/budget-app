import { deflateRawSync } from "node:zlib";
import { inspectActualSQLiteDatabase } from "../packages/application/src/actualBudget/ActualSQLiteRepository.js";
import { BudgetImportProviderApplicationService } from "../packages/application/src/BudgetImportProviderApplicationService.js";

const actualDatabase = buildActualSQLiteDatabase({
  accounts: 12,
  transactions: 23967,
  payees: 2170,
  categories: 89,
  category_groups: 10,
  rules: 513,
  schedules: 7,
  notes: 3,
});

const repositoryInspection = inspectActualSQLiteDatabase(actualDatabase);
if (repositoryInspection.knownCounts.accounts !== 12) throw new Error("Expected Actual accounts count");
if (repositoryInspection.knownCounts.transactions !== 23967) throw new Error("Expected Actual transactions count");
if (repositoryInspection.knownCounts.payees !== 2170) throw new Error("Expected Actual payees count");
if (repositoryInspection.knownCounts.categories !== 89) throw new Error("Expected Actual categories count");
if (repositoryInspection.knownCounts.category_groups !== 10) throw new Error("Expected Actual category group count");
if (repositoryInspection.knownCounts.rules !== 513) throw new Error("Expected Actual rules count");
if (repositoryInspection.knownCounts.schedules !== 7) throw new Error("Expected Actual schedules count");
if (repositoryInspection.knownCounts.notes !== 3) throw new Error("Expected Actual notes count");
if (!repositoryInspection.tables.some((table) => table.name === "transactions" && table.rootPage > 1)) {
  throw new Error("Expected transactions table summary from sqlite_master");
}

const service = new BudgetImportProviderApplicationService();
const actualZip = buildZip({
  "metadata.json": JSON.stringify({ budgetName: "Actual Household", lastUploaded: "2026-07-01" }),
  "db.sqlite": actualDatabase,
});

const preview = await service.fullBudgetPreviewAsync({ fileName: "actual-export.zip", text: "", binary: actualZip });
if (!preview) throw new Error("Expected Actual full-budget preview");
if (preview.metadata.actualAccountCount !== 12) throw new Error("Expected Actual account count metadata");
if (preview.metadata.actualTransactionCount !== 23967) throw new Error("Expected Actual transaction count metadata");
if (preview.metadata.actualPayeeCount !== 2170) throw new Error("Expected Actual payee count metadata");
if (!preview.entityCounts.some((item) => item.label === "SQLite tables" && item.count >= 8 && item.supported)) {
  throw new Error("Expected SQLite table count in preview");
}
if (!preview.entityCounts.some((item) => item.label === "Transactions" && item.count === 23967 && item.supported)) {
  throw new Error("Expected transaction table count in preview");
}
if (!preview.entityCounts.some((item) => item.label === "Rules" && item.count === 513 && !item.supported)) {
  throw new Error("Expected rules to be detected but unsupported");
}
if (preview.issues.some((issue) => issue.code === "ActualSQLiteTableInspectionPending")) {
  throw new Error("Table inspection should no longer be pending");
}

console.log("v2.44.3 Actual SQLite repository checks passed");

function buildActualSQLiteDatabase(rowCounts: Record<string, number>): Uint8Array {
  const tableNames = Object.keys(rowCounts);
  const pageSize = 4096;
  const pageCount = tableNames.length + 1;
  const bytes = new Uint8Array(pageSize * pageCount);
  const header = new TextEncoder().encode("SQLite format 3\0");
  bytes.set(header, 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(16, pageSize, false);
  view.setUint32(28, pageCount, false);
  view.setUint32(44, 4, false);
  view.setUint32(56, 1, false);

  const schemaRecords = tableNames.map((name, index) =>
    buildSchemaCell(index + 1, {
      type: "table",
      name,
      tableName: name,
      rootPage: index + 2,
      sql: `CREATE TABLE ${name}(id TEXT)`,
    }),
  );
  writeLeafPage(bytes, pageSize, 1, 100, schemaRecords);

  tableNames.forEach((name, index) => {
    writeCountOnlyLeafPage(bytes, pageSize, index + 2, rowCounts[name]);
  });

  return bytes;
}

function buildSchemaCell(rowId: number, row: { type: string; name: string; tableName: string; rootPage: number; sql: string }): Uint8Array {
  const record = buildRecord([row.type, row.name, row.tableName, row.rootPage, row.sql]);
  return concatUint8Arrays([encodeVarint(record.length), encodeVarint(rowId), record]);
}

function buildRecord(values: Array<string | number>): Uint8Array {
  const serialTypes: number[] = [];
  const bodyParts: Uint8Array[] = [];
  const encoder = new TextEncoder();

  for (const value of values) {
    if (typeof value === "number") {
      serialTypes.push(1);
      bodyParts.push(Uint8Array.of(value & 0xff));
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

function writeCountOnlyLeafPage(bytes: Uint8Array, pageSize: number, pageNumber: number, rowCount: number): void {
  const pageOffset = (pageNumber - 1) * pageSize;
  const view = new DataView(bytes.buffer, pageOffset, pageSize);
  view.setUint8(0, 0x0d);
  view.setUint16(3, rowCount, false);
  view.setUint16(5, pageSize, false);
}

function encodeVarint(value: number): Uint8Array {
  if (value < 0x80) return Uint8Array.of(value);
  const bytes: number[] = [value & 0x7f];
  value = Math.floor(value / 128);
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
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
