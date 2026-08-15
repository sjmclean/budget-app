import type { PayeeView } from "../accounts/payeeService.js";
import { parsePayeeIconReference, type PayeeBuiltinIconKey } from "./payeeIconReference.js";

export type ResolvedPayeeIcon =
  | { readonly kind: "builtin"; readonly key: PayeeBuiltinIconKey }
  | { readonly kind: "initials"; readonly initials: string; readonly token: string }
  | { readonly kind: "transfer" }
  | { readonly kind: "none" };

export interface ResolvePayeeIconInput {
  readonly payee?: Pick<PayeeView, "id" | "name" | "iconRef"> | null;
  readonly state?: "payee" | "transfer" | "none";
}

export function resolvePayeeIcon({ payee, state = "payee" }: ResolvePayeeIconInput): ResolvedPayeeIcon {
  if (state === "transfer") return { kind: "transfer" };
  if (state === "none" || !payee) return { kind: "none" };
  const reference = parsePayeeIconReference(payee.iconRef);
  if (reference.kind === "builtin") return reference;
  return {
    kind: "initials",
    initials: payeeInitials(payee.name),
    token: `payee-avatar-${stableHash(payee.id) % 8}`,
  };
}

function payeeInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return "?";
  const selected = words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words.at(-1)![0]}`;
  return selected.toLocaleUpperCase();
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
