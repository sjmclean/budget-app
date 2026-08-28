export const PAYEE_BUILTIN_ICONS = [
  { key: "merchant", label: "General merchant" },
  { key: "shopping", label: "Shopping" },
  { key: "groceries", label: "Groceries" },
  { key: "dining", label: "Dining" },
  { key: "fuel", label: "Fuel" },
  { key: "transport", label: "Transport" },
  { key: "utilities", label: "Utilities" },
  { key: "entertainment", label: "Entertainment" },
  { key: "medical", label: "Medical" },
  { key: "education", label: "Education" },
  { key: "home", label: "Home" },
] as const;

export type PayeeBuiltinIconKey = (typeof PAYEE_BUILTIN_ICONS)[number]["key"];
export type PayeeEmbeddedIconFormat = "webp" | "png";
export type PayeeIconReference =
  | { readonly kind: "automatic" }
  | { readonly kind: "builtin"; readonly key: PayeeBuiltinIconKey }
  | { readonly kind: "embedded"; readonly format: PayeeEmbeddedIconFormat; readonly data: string }
  | { readonly kind: "content"; readonly contentHash: string }
  | { readonly kind: "unknown"; readonly raw: string };

const builtinKeys = new Set<string>(PAYEE_BUILTIN_ICONS.map(({ key }) => key));
const contentHashPattern = /^[a-f0-9]{64}$/;
const embeddedDataPattern = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_EMBEDDED_ICON_BASE64_LENGTH = 500_000;

function parseEmbeddedIconReference(raw: string): PayeeIconReference | null {
  const match = /^embedded:v1:(webp|png):(.+)$/u.exec(raw);
  if (!match) return null;
  const [, format, data] = match;
  if (
    data.length > MAX_EMBEDDED_ICON_BASE64_LENGTH ||
    data.length % 4 !== 0 ||
    !embeddedDataPattern.test(data)
  ) {
    return { kind: "unknown", raw };
  }
  return {
    kind: "embedded",
    format: format as PayeeEmbeddedIconFormat,
    data,
  };
}

export function parsePayeeIconReference(raw: string | null | undefined): PayeeIconReference {
  if (!raw) return { kind: "automatic" };
  if (raw.startsWith("builtin:v1:")) {
    const key = raw.slice("builtin:v1:".length);
    return builtinKeys.has(key)
      ? { kind: "builtin", key: key as PayeeBuiltinIconKey }
      : { kind: "unknown", raw };
  }
  if (raw.startsWith("embedded:v1:")) {
    return parseEmbeddedIconReference(raw) ?? { kind: "unknown", raw };
  }
  if (raw.startsWith("content:v1:")) {
    const contentHash = raw.slice("content:v1:".length);
    return contentHashPattern.test(contentHash)
      ? { kind: "content", contentHash }
      : { kind: "unknown", raw };
  }
  return { kind: "unknown", raw };
}

export function serialisePayeeIconReference(reference: Exclude<PayeeIconReference, { kind: "unknown" }>): string {
  if (reference.kind === "automatic") return "";
  if (reference.kind === "builtin") return `builtin:v1:${reference.key}`;
  if (reference.kind === "embedded") {
    const raw = `embedded:v1:${reference.format}:${reference.data}`;
    if (parseEmbeddedIconReference(raw)?.kind !== "embedded") {
      throw new TypeError("Invalid embedded payee icon.");
    }
    return raw;
  }
  if (!contentHashPattern.test(reference.contentHash)) throw new TypeError("Invalid payee icon content hash.");
  return `content:v1:${reference.contentHash}`;
}

export function validatePayeeIconReferenceForWrite(raw: string): string {
  const parsed = parsePayeeIconReference(raw);
  if (parsed.kind === "unknown") throw new TypeError("Unsupported payee icon reference.");
  return serialisePayeeIconReference(parsed);
}

export function isExplicitPayeeIconReference(raw: string | null | undefined): boolean {
  const parsed = parsePayeeIconReference(raw);
  return parsed.kind === "builtin" || parsed.kind === "embedded" || parsed.kind === "content";
}

export function mergePayeeIconReferences(
  target: string | null | undefined,
  sources: readonly (string | null | undefined)[],
): string {
  if (isExplicitPayeeIconReference(target)) return target!;
  const explicit = [...new Set(sources.filter(isExplicitPayeeIconReference) as string[])];
  return explicit.length === 1 ? explicit[0] : "";
}
