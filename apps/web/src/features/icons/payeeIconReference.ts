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
export type PayeeIconReference =
  | { readonly kind: "automatic" }
  | { readonly kind: "builtin"; readonly key: PayeeBuiltinIconKey }
  | { readonly kind: "content"; readonly contentHash: string }
  | { readonly kind: "unknown"; readonly raw: string };

const builtinKeys = new Set<string>(PAYEE_BUILTIN_ICONS.map(({ key }) => key));
const contentHashPattern = /^[a-f0-9]{64}$/;

export function parsePayeeIconReference(raw: string | null | undefined): PayeeIconReference {
  if (!raw) return { kind: "automatic" };
  if (raw.startsWith("builtin:v1:")) {
    const key = raw.slice("builtin:v1:".length);
    return builtinKeys.has(key)
      ? { kind: "builtin", key: key as PayeeBuiltinIconKey }
      : { kind: "unknown", raw };
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
  return parsed.kind === "builtin" || parsed.kind === "content";
}

export function mergePayeeIconReferences(
  target: string | null | undefined,
  sources: readonly (string | null | undefined)[],
): string {
  if (isExplicitPayeeIconReference(target)) return target!;
  const explicit = [...new Set(sources.filter(isExplicitPayeeIconReference) as string[])];
  return explicit.length === 1 ? explicit[0] : "";
}
