import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import {
  createBudgetDataExportPackage,
  previewBudgetDataRestore,
  restoreBudgetDataPackage,
  type BudgetDataExportPackage,
  type BudgetDataRestoreResult,
} from "./budgetDataExport";
import {
  calculateAttachmentContentHash,
  getAttachmentContentStore,
} from "../attachments/attachmentContentStore";

export const PORTABLE_BUDGET_PACKAGE_SCHEMA = "budget-app.portable-package.v1";

export interface PortableBudgetAttachment {
  attachmentId: string;
  contentHash: string;
  mimeType: string;
  size: number;
  base64: string;
}

export interface PortableBudgetPackage {
  schema: typeof PORTABLE_BUDGET_PACKAGE_SCHEMA;
  createdAt: string;
  budgetData: BudgetDataExportPackage;
  attachments: PortableBudgetAttachment[];
  integrity: {
    algorithm: "SHA-256";
    digest: string;
  };
}

export interface PortableBudgetPackagePreview {
  valid: boolean;
  budgetName?: string;
  createdAt?: string;
  attachmentCount: number;
  attachmentBytes: number;
  errors: string[];
  warnings: string[];
  parsed?: PortableBudgetPackage;
}

export async function createPortableBudgetPackage(
  storage: KeyValueStoragePort,
): Promise<PortableBudgetPackage> {
  const budgetData = createBudgetDataExportPackage(storage, "backup");
  const referencedHashes = collectReferencedContentHashes(budgetData);
  const store = getAttachmentContentStore();
  const descriptors = await store.list();
  const attachments: PortableBudgetAttachment[] = [];

  for (const descriptor of descriptors) {
    if (!referencedHashes.has(descriptor.contentHash)) continue;
    const blob = await store.read(descriptor.contentRef);
    if (!blob) {
      throw new Error(`Attachment ${descriptor.attachmentId} is referenced but its content is missing.`);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const actualHash = await calculateAttachmentContentHash(bytes);
    if (actualHash !== descriptor.contentHash) {
      throw new Error(`Attachment ${descriptor.attachmentId} failed integrity verification.`);
    }
    attachments.push({
      attachmentId: descriptor.attachmentId,
      contentHash: descriptor.contentHash,
      mimeType: descriptor.mimeType || blob.type || "application/octet-stream",
      size: bytes.byteLength,
      base64: bytesToBase64(bytes),
    });
  }

  const unsigned = {
    schema: PORTABLE_BUDGET_PACKAGE_SCHEMA,
    createdAt: new Date().toISOString(),
    budgetData,
    attachments: attachments.sort((left, right) => left.contentHash.localeCompare(right.contentHash)),
  } as const;

  return {
    ...unsigned,
    integrity: {
      algorithm: "SHA-256",
      digest: await sha256Text(stableStringify(unsigned)),
    },
  };
}

export function serialisePortableBudgetPackage(pkg: PortableBudgetPackage): string {
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function createPortableBudgetPackageFilename(pkg: PortableBudgetPackage): string {
  const safeName = pkg.budgetData.budget.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "budget";
  return `${safeName}-${pkg.createdAt.slice(0, 10)}.budget-package.json`;
}

export async function previewPortableBudgetPackage(raw: string): Promise<PortableBudgetPackagePreview> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, attachmentCount: 0, attachmentBytes: 0, errors: ["The package is not valid JSON."], warnings };
  }

  if (!isPortablePackage(parsed)) {
    return { valid: false, attachmentCount: 0, attachmentBytes: 0, errors: ["The file is not a supported Budget App portable package."], warnings };
  }

  const budgetPreview = previewBudgetDataRestore(JSON.stringify(parsed.budgetData));
  errors.push(...budgetPreview.errors);
  warnings.push(...budgetPreview.warnings);

  const unsigned = {
    schema: parsed.schema,
    createdAt: parsed.createdAt,
    budgetData: parsed.budgetData,
    attachments: parsed.attachments,
  };
  const expectedDigest = await sha256Text(stableStringify(unsigned));
  if (expectedDigest !== parsed.integrity.digest) {
    errors.push("The package integrity digest does not match. The file may be damaged or modified.");
  }

  const seenHashes = new Set<string>();
  let attachmentBytes = 0;
  for (const attachment of parsed.attachments) {
    if (seenHashes.has(attachment.contentHash)) {
      errors.push(`Duplicate attachment hash ${attachment.contentHash}.`);
      continue;
    }
    seenHashes.add(attachment.contentHash);
    try {
      const bytes = base64ToBytes(attachment.base64);
      attachmentBytes += bytes.byteLength;
      if (bytes.byteLength !== attachment.size) {
        errors.push(`Attachment ${attachment.attachmentId} has an incorrect size.`);
      }
      const actualHash = await calculateAttachmentContentHash(bytes);
      if (actualHash !== attachment.contentHash) {
        errors.push(`Attachment ${attachment.attachmentId} failed SHA-256 verification.`);
      }
    } catch {
      errors.push(`Attachment ${attachment.attachmentId} contains invalid binary data.`);
    }
  }

  const referencedHashes = collectReferencedContentHashes(parsed.budgetData);
  for (const hash of referencedHashes) {
    if (!seenHashes.has(hash)) warnings.push(`Referenced attachment ${hash} is not embedded in this package.`);
  }

  return {
    valid: errors.length === 0 && budgetPreview.valid,
    budgetName: parsed.budgetData.budget.name,
    createdAt: parsed.createdAt,
    attachmentCount: parsed.attachments.length,
    attachmentBytes,
    errors,
    warnings,
    parsed,
  };
}

export async function restorePortableBudgetPackage(
  storage: KeyValueStoragePort,
  raw: string,
): Promise<BudgetDataRestoreResult & { restoredAttachments: number }> {
  const preview = await previewPortableBudgetPackage(raw);
  if (!preview.valid || !preview.parsed) {
    return {
      restored: false,
      removedRecords: 0,
      writtenRecords: 0,
      skippedGlobalRecords: 0,
      restoredAttachments: 0,
      warnings: preview.warnings,
      errors: preview.errors,
    };
  }

  const result = restoreBudgetDataPackage(storage, JSON.stringify(preview.parsed.budgetData));
  if (!result.restored) return { ...result, restoredAttachments: 0 };

  const store = getAttachmentContentStore();
  let restoredAttachments = 0;
  for (const attachment of preview.parsed.attachments) {
    if (await store.existsByHash(attachment.contentHash)) continue;
    await store.put({
      attachmentId: attachment.attachmentId,
      bytes: base64ToBytes(attachment.base64),
      mimeType: attachment.mimeType,
      contentHash: attachment.contentHash,
    });
    restoredAttachments += 1;
  }

  return { ...result, restoredAttachments };
}

function collectReferencedContentHashes(pkg: BudgetDataExportPackage): Set<string> {
  const hashes = new Set<string>();
  for (const record of pkg.records) {
    try {
      walk(JSON.parse(record.value), hashes);
    } catch {
      // Existing export validation handles malformed storage records.
    }
  }
  return hashes;
}

function walk(value: unknown, hashes: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, hashes));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === "contentHash" && typeof nested === "string" && /^sha256:[a-f0-9]{64}$/i.test(nested)) {
      hashes.add(nested);
    } else {
      walk(nested, hashes);
    }
  }
}

function isPortablePackage(value: unknown): value is PortableBudgetPackage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const integrity = record.integrity as Record<string, unknown> | undefined;
  return record.schema === PORTABLE_BUDGET_PACKAGE_SCHEMA
    && typeof record.createdAt === "string"
    && !!record.budgetData && typeof record.budgetData === "object"
    && Array.isArray(record.attachments)
    && !!integrity && integrity.algorithm === "SHA-256" && typeof integrity.digest === "string"
    && record.attachments.every((item) => {
      if (!item || typeof item !== "object") return false;
      const attachment = item as Record<string, unknown>;
      return typeof attachment.attachmentId === "string"
        && typeof attachment.contentHash === "string"
        && typeof attachment.mimeType === "string"
        && typeof attachment.size === "number"
        && typeof attachment.base64 === "string";
    });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
