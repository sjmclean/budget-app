import {
  calculateAttachmentContentHash,
  getAttachmentContentStore,
} from "../attachments/attachmentContentStore.js";
import { createBudgetScopedStorage } from "../budget/budgetDataScope.js";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage.js";

const CONTENT_KEY_PREFIX = "budget-app.merchant-icon-content.v1.";
const MAX_ICON_BYTES = 512 * 1024;

export interface MerchantIconContentRecord {
  readonly formatVersion: 1;
  readonly contentHash: string;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
  readonly sourceDomain: string;
  readonly sourceUrl: string;
  readonly acquiredAt: string;
}

export interface StoredMerchantIconContent {
  readonly contentHash: string;
  readonly contentRef: string;
  readonly mimeType: MerchantIconContentRecord["mimeType"];
}

export async function storeMerchantIconContent({
  bytes,
  contentType,
  sourceDomain,
  sourceUrl,
  acquiredAt = new Date().toISOString(),
}: {
  readonly bytes: Uint8Array;
  readonly contentType?: string | null;
  readonly sourceDomain: string;
  readonly sourceUrl: string;
  readonly acquiredAt?: string;
}): Promise<StoredMerchantIconContent> {
  const mimeType = validateMerchantIconBytes(bytes, contentType);
  if (!mimeType) {
    throw new TypeError("Merchant icon is not a supported PNG, JPEG, or WebP image.");
  }

  const canonicalHash = await calculateAttachmentContentHash(bytes);
  const contentHash = canonicalHash.slice("sha256:".length);
  const contentStore = getAttachmentContentStore();
  if (!(await contentStore.existsByHash(canonicalHash))) {
    await contentStore.put({
      attachmentId: `merchant-icon-${contentHash}`,
      bytes,
      mimeType,
      contentHash: canonicalHash,
    });
  }

  const record: MerchantIconContentRecord = {
    formatVersion: 1,
    contentHash,
    mimeType,
    sourceDomain: sourceDomain.trim().toLowerCase(),
    sourceUrl,
    acquiredAt,
  };
  getMetadataStorage().setItem(`${CONTENT_KEY_PREFIX}${contentHash}`, JSON.stringify(record));
  return { contentHash, contentRef: `content:v1:${contentHash}`, mimeType };
}

export function readMerchantIconContentMetadata(
  contentHash: string,
): MerchantIconContentRecord | undefined {
  if (!isContentHash(contentHash)) return undefined;
  try {
    const raw = getMetadataStorage().getItem(`${CONTENT_KEY_PREFIX}${contentHash}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<MerchantIconContentRecord>;
    if (
      parsed.formatVersion !== 1 ||
      parsed.contentHash !== contentHash ||
      !isSupportedMimeType(parsed.mimeType) ||
      typeof parsed.sourceDomain !== "string" ||
      typeof parsed.sourceUrl !== "string" ||
      typeof parsed.acquiredAt !== "string"
    ) return undefined;
    return parsed as MerchantIconContentRecord;
  } catch {
    return undefined;
  }
}

export async function readMerchantIconContentBlob(contentHash: string): Promise<Blob | null> {
  if (!isContentHash(contentHash)) return null;
  try {
    return await getAttachmentContentStore().readByHash(`sha256:${contentHash}`);
  } catch {
    return null;
  }
}

export async function removeMerchantIconContent(contentHash: string): Promise<void> {
  if (!isContentHash(contentHash)) return;
  try {
    const store = getAttachmentContentStore();
    const descriptor = (await store.list()).find(
      ({ contentHash: candidate }) => candidate === `sha256:${contentHash}`,
    );
    if (descriptor) await store.delete(descriptor.contentRef);
    getMetadataStorage().removeItem(`${CONTENT_KEY_PREFIX}${contentHash}`);
  } catch {
    // Icon cleanup must not interfere with financial persistence.
  }
}

export function validateMerchantIconBytes(
  bytes: Uint8Array,
  contentType?: string | null,
): MerchantIconContentRecord["mimeType"] | undefined {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ICON_BYTES) return undefined;
  return detectImageType(bytes, contentType);
}

function getMetadataStorage() {
  return createBudgetScopedStorage(getActiveKeyValueStorage());
}

function isContentHash(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

function isSupportedMimeType(value: unknown): value is MerchantIconContentRecord["mimeType"] {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

function detectImageType(
  bytes: Uint8Array,
  _contentType?: string | null,
): MerchantIconContentRecord["mimeType"] | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) return "image/webp";

  return undefined;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
