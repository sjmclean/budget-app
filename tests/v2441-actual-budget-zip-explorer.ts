import { deflateRawSync } from "node:zlib";
import { BudgetImportProviderApplicationService } from "../packages/application/src/BudgetImportProviderApplicationService.js";

const service = new BudgetImportProviderApplicationService();
const actualZip = buildZip({
  "metadata.json": JSON.stringify({ budgetName: "Actual Household", lastUploaded: "2026-07-01" }),
  "db.sqlite": "SQLite format 3\u0000fake sqlite payload for package shape tests",
});

const preview = await service.fullBudgetPreviewAsync({
  fileName: "actual-export.zip",
  text: "",
  binary: actualZip,
});

if (!preview) throw new Error("Expected Actual ZIP preview");
if (preview.providerId !== "actual-budget") throw new Error("Expected Actual provider");
if (preview.sourceBudgetName !== "Actual Household") throw new Error("Expected metadata budget name");
if (preview.canCommit) throw new Error("Actual ZIP explorer should remain preview-only");
if (preview.metadata.packageType !== "zip") throw new Error("Expected ZIP package metadata");
if (preview.metadata.lastUploaded !== "2026-07-01") throw new Error("Expected Actual metadata lastUploaded value");
if (!preview.entityCounts.some((item) => item.label === "db.sqlite" && item.count === 1 && item.supported)) {
  throw new Error("Expected db.sqlite to be detected as a package entry");
}
if (!preview.issues.some((issue) => issue.code === "ActualSQLiteTableInspectionPending")) {
  throw new Error("Expected warning that SQLite table-level inspection is pending");
}

const invalidZip = buildZip({ "metadata.json": JSON.stringify({ budgetName: "Missing DB" }) });
const invalidPreview = await service.fullBudgetPreviewAsync({ fileName: "missing-db.zip", text: "", binary: invalidZip });
if (!invalidPreview?.issues.some((issue) => issue.code === "ActualZipMissingDatabase" && issue.severity === "error")) {
  throw new Error("Expected missing db.sqlite to be reported as an error");
}

console.log("v2.44.1 Actual Budget ZIP explorer checks passed");

function buildZip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const rawBytes = encoder.encode(content);
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
