import { createBudgetScopedStorage } from "../budget/budgetDataScope.js";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage.js";

const CONTENT_KEY_PREFIX = "budget-app.merchant-icon-content.v1.";
const MAX_ICON_BYTES = 512 * 1024;

export interface MerchantIconContentRecord {
  readonly formatVersion: 1;
  readonly contentHash: string;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
  readonly base64: string;
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
  if (bytes.byteLength === 0) throw new TypeError("Merchant icon content is empty.");
  if (bytes.byteLength > MAX_ICON_BYTES) {
    throw new TypeError(`Merchant icon exceeds the ${MAX_ICON_BYTES} byte limit.`);
  }

  const mimeType = detectImageType(bytes, contentType);
  if (!mimeType) throw new TypeError("Merchant icon is not a supported PNG, JPEG, or WebP image.");

  const contentHash = await sha256Hex(bytes);
  const record: MerchantIconContentRecord = {
    formatVersion: 1,
    contentHash,
    mimeType,
    base64: bytesToBase64(bytes),
    sourceDomain: sourceDomain.trim().toLowerCase(),
    sourceUrl,
    acquiredAt,
  };
  getStorage().setItem(`${CONTENT_KEY_PREFIX}${contentHash}`, JSON.stringify(record));
  return { contentHash, contentRef: `content:v1:${contentHash}`, mimeType };
}

export function readMerchantIconContent(contentHash: string): MerchantIconContentRecord | undefined {
  if (!/^[a-f0-9]{64}$/u.test(contentHash)) return undefined;
  try {
    const raw = getStorage().getItem(`${CONTENT_KEY_PREFIX}${contentHash}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<MerchantIconContentRecord>;
    if (
      parsed.formatVersion !== 1 ||
      parsed.contentHash !== contentHash ||
      !isSupportedMimeType(parsed.mimeType) ||
      typeof parsed.base64 !== "string" ||
      typeof parsed.sourceDomain !== "string" ||
      typeof parsed.sourceUrl !== "string" ||
      typeof parsed.acquiredAt !== "string"
    ) {
      return undefined;
    }
    return parsed as MerchantIconContentRecord;
  } catch {
    return undefined;
  }
}

export function readMerchantIconContentDataUrl(contentHash: string): string | undefined {
  const content = readMerchantIconContent(contentHash);
  return content ? `data:${content.mimeType};base64,${content.base64}` : undefined;
}

export function removeMerchantIconContent(contentHash: string): void {
  if (!/^[a-f0-9]{64}$/u.test(contentHash)) return;
  try {
    getStorage().removeItem(`${CONTENT_KEY_PREFIX}${contentHash}`);
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

function getStorage() {
  return createBudgetScopedStorage(getActiveKeyValueStorage());
}

function isSupportedMimeType(value: unknown): value is MerchantIconContentRecord["mimeType"] {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

function detectImageType(
  bytes: Uint8Array,
  contentType?: string | null,
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

  const declared = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  // Content-Type is only corroborating metadata. A declared image type never
  // overrides a failed signature check.
  if (declared && isSupportedMimeType(declared)) return undefined;
  return undefined;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is required to cache merchant icons.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}
