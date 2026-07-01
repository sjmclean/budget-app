export interface ActualSQLiteTableSummary {
  name: string;
  rootPage: number;
  sql: string | null;
  rowCount: number | null;
}

export interface ActualSQLiteRepositoryInspection {
  tables: ActualSQLiteTableSummary[];
  knownCounts: Record<string, number>;
  issues: string[];
}

interface SQLiteSchemaRow {
  type: string | null;
  name: string | null;
  tableName: string | null;
  rootPage: number | null;
  sql: string | null;
}

interface ParsedRecord {
  values: Array<string | number | Uint8Array | null>;
}

const SQLITE_HEADER = "SQLite format 3\0";
const SQLITE_MASTER_ROOT_PAGE = 1;
const textDecoder = new TextDecoder();

export class ActualSQLiteRepository {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly pageSize: number;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pageSize = readSQLitePageSize(this.view);
  }

  inspect(): ActualSQLiteRepositoryInspection {
    const issues: string[] = [];
    const schemaRows = this.readSchemaRows(issues);
    const tables = schemaRows
      .filter((row) => row.type === "table" && row.name && row.rootPage && row.rootPage > 0 && !row.name.startsWith("sqlite_"))
      .map((row) => {
        const name = row.name ?? "unknown";
        let rowCount: number | null = null;
        try {
          rowCount = this.countRowsInTable(row.rootPage ?? 0);
        } catch (error) {
          issues.push(`Could not count rows for Actual table ${name}: ${error instanceof Error ? error.message : String(error)}`);
        }
        return {
          name,
          rootPage: row.rootPage ?? 0,
          sql: row.sql,
          rowCount,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const knownCounts: Record<string, number> = {};
    for (const table of tables) {
      if (table.rowCount !== null) knownCounts[table.name] = table.rowCount;
    }

    return { tables, knownCounts, issues };
  }

  private readSchemaRows(issues: string[]): SQLiteSchemaRow[] {
    const rows: SQLiteSchemaRow[] = [];
    const records = this.readTableRecords(SQLITE_MASTER_ROOT_PAGE, issues);
    for (const record of records) {
      const values = record.values;
      rows.push({
        type: valueAsString(values[0]),
        name: valueAsString(values[1]),
        tableName: valueAsString(values[2]),
        rootPage: valueAsNumber(values[3]),
        sql: valueAsString(values[4]),
      });
    }
    return rows;
  }

  private countRowsInTable(rootPage: number): number {
    return this.countTableRows(rootPage, new Set<number>());
  }

  private countTableRows(pageNumber: number, seen: Set<number>): number {
    if (seen.has(pageNumber)) throw new Error(`Cycle detected while walking SQLite b-tree page ${pageNumber}.`);
    seen.add(pageNumber);
    const page = this.readPage(pageNumber);
    const headerOffset = pageNumber === 1 ? 100 : 0;
    const pageType = page.getUint8(headerOffset);
    const cellCount = page.getUint16(headerOffset + 3, false);

    if (pageType === 0x0d) return cellCount;

    if (pageType === 0x05) {
      let total = 0;
      const rightMostPointer = page.getUint32(headerOffset + 8, false);
      const pointerArrayOffset = headerOffset + 12;
      for (let index = 0; index < cellCount; index += 1) {
        const cellOffset = page.getUint16(pointerArrayOffset + index * 2, false);
        const childPage = page.getUint32(cellOffset, false);
        total += this.countTableRows(childPage, seen);
      }
      total += this.countTableRows(rightMostPointer, seen);
      return total;
    }

    throw new Error(`Unsupported SQLite b-tree page type 0x${pageType.toString(16)}.`);
  }

  private readTableRecords(rootPage: number, issues: string[], seen = new Set<number>()): ParsedRecord[] {
    if (seen.has(rootPage)) throw new Error(`Cycle detected while reading SQLite b-tree page ${rootPage}.`);
    seen.add(rootPage);
    const page = this.readPage(rootPage);
    const headerOffset = rootPage === 1 ? 100 : 0;
    const pageType = page.getUint8(headerOffset);
    const cellCount = page.getUint16(headerOffset + 3, false);

    if (pageType === 0x0d) {
      const records: ParsedRecord[] = [];
      const pointerArrayOffset = headerOffset + 8;
      for (let index = 0; index < cellCount; index += 1) {
        const cellOffset = page.getUint16(pointerArrayOffset + index * 2, false);
        try {
          records.push(this.readTableLeafCell(rootPage, cellOffset));
        } catch (error) {
          issues.push(`Could not read SQLite table leaf cell on page ${rootPage}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return records;
    }

    if (pageType === 0x05) {
      const records: ParsedRecord[] = [];
      const rightMostPointer = page.getUint32(headerOffset + 8, false);
      const pointerArrayOffset = headerOffset + 12;
      for (let index = 0; index < cellCount; index += 1) {
        const cellOffset = page.getUint16(pointerArrayOffset + index * 2, false);
        const childPage = page.getUint32(cellOffset, false);
        records.push(...this.readTableRecords(childPage, issues, seen));
      }
      records.push(...this.readTableRecords(rightMostPointer, issues, seen));
      return records;
    }

    throw new Error(`Unsupported SQLite schema b-tree page type 0x${pageType.toString(16)}.`);
  }

  private readTableLeafCell(pageNumber: number, cellOffset: number): ParsedRecord {
    const pageStart = this.pageOffset(pageNumber);
    let absoluteOffset = pageStart + cellOffset;
    const payloadLength = readVarint(this.bytes, absoluteOffset);
    absoluteOffset += payloadLength.bytesRead;
    const rowId = readVarint(this.bytes, absoluteOffset);
    absoluteOffset += rowId.bytesRead;
    const payload = this.bytes.slice(absoluteOffset, absoluteOffset + payloadLength.value);
    return parseRecord(payload);
  }

  private readPage(pageNumber: number): DataView {
    const offset = this.pageOffset(pageNumber);
    if (pageNumber < 1 || offset < 0 || offset + this.pageSize > this.bytes.byteLength) {
      throw new Error(`SQLite page ${pageNumber} is outside the database bounds.`);
    }
    return new DataView(this.bytes.buffer, this.bytes.byteOffset + offset, this.pageSize);
  }

  private pageOffset(pageNumber: number): number {
    return (pageNumber - 1) * this.pageSize;
  }
}

export function inspectActualSQLiteDatabase(bytes: Uint8Array): ActualSQLiteRepositoryInspection {
  if (!hasSQLiteHeader(bytes)) {
    return { tables: [], knownCounts: {}, issues: ["db.sqlite does not have a valid SQLite header."] };
  }
  return new ActualSQLiteRepository(bytes).inspect();
}

function hasSQLiteHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 100) return false;
  return textDecoder.decode(bytes.slice(0, 16)) === SQLITE_HEADER;
}

function readSQLitePageSize(view: DataView): number {
  const rawPageSize = view.getUint16(16, false);
  return rawPageSize === 1 ? 65536 : rawPageSize;
}

function parseRecord(payload: Uint8Array): ParsedRecord {
  let offset = 0;
  const headerLength = readVarint(payload, offset);
  offset += headerLength.bytesRead;
  const serialTypes: number[] = [];
  while (offset < headerLength.value) {
    const serialType = readVarint(payload, offset);
    serialTypes.push(serialType.value);
    offset += serialType.bytesRead;
  }

  let valueOffset = headerLength.value;
  const values = serialTypes.map((serialType) => {
    const parsed = parseSerialValue(payload, valueOffset, serialType);
    valueOffset += parsed.bytesRead;
    return parsed.value;
  });

  return { values };
}

function parseSerialValue(payload: Uint8Array, offset: number, serialType: number): { value: string | number | Uint8Array | null; bytesRead: number } {
  if (serialType === 0) return { value: null, bytesRead: 0 };
  if (serialType === 1) return { value: readSignedInteger(payload, offset, 1), bytesRead: 1 };
  if (serialType === 2) return { value: readSignedInteger(payload, offset, 2), bytesRead: 2 };
  if (serialType === 3) return { value: readSignedInteger(payload, offset, 3), bytesRead: 3 };
  if (serialType === 4) return { value: readSignedInteger(payload, offset, 4), bytesRead: 4 };
  if (serialType === 5) return { value: readSignedInteger(payload, offset, 6), bytesRead: 6 };
  if (serialType === 6) return { value: Number(readSignedBigInteger(payload, offset, 8)), bytesRead: 8 };
  if (serialType === 7) {
    const view = new DataView(payload.buffer, payload.byteOffset + offset, 8);
    return { value: view.getFloat64(0, false), bytesRead: 8 };
  }
  if (serialType === 8) return { value: 0, bytesRead: 0 };
  if (serialType === 9) return { value: 1, bytesRead: 0 };
  if (serialType >= 12 && serialType % 2 === 0) {
    const bytesRead = (serialType - 12) / 2;
    return { value: payload.slice(offset, offset + bytesRead), bytesRead };
  }
  if (serialType >= 13 && serialType % 2 === 1) {
    const bytesRead = (serialType - 13) / 2;
    return { value: textDecoder.decode(payload.slice(offset, offset + bytesRead)), bytesRead };
  }
  throw new Error(`Unsupported SQLite serial type ${serialType}.`);
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  for (let index = 0; index < 9; index += 1) {
    const byte = bytes[offset + index];
    if (byte === undefined) throw new Error("Unexpected end of SQLite varint.");
    if (index === 8) return { value: value * 256 + byte, bytesRead: 9 };
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, bytesRead: index + 1 };
  }
  throw new Error("Invalid SQLite varint.");
}

function readSignedInteger(bytes: Uint8Array, offset: number, byteLength: number): number {
  let value = 0;
  for (let index = 0; index < byteLength; index += 1) value = value * 256 + bytes[offset + index];
  const signBit = 2 ** (byteLength * 8 - 1);
  const fullRange = 2 ** (byteLength * 8);
  return value >= signBit ? value - fullRange : value;
}

function readSignedBigInteger(bytes: Uint8Array, offset: number, byteLength: number): bigint {
  let value = 0n;
  for (let index = 0; index < byteLength; index += 1) value = value * 256n + BigInt(bytes[offset + index]);
  const signBit = 1n << BigInt(byteLength * 8 - 1);
  const fullRange = 1n << BigInt(byteLength * 8);
  return value >= signBit ? value - fullRange : value;
}

function valueAsString(value: string | number | Uint8Array | null | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function valueAsNumber(value: string | number | Uint8Array | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
