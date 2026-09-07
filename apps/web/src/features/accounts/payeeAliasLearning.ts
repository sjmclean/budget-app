import type { PayeeAliasView, PayeeView } from "./payeeService";
import { normalisePayeeIdentity } from "./payeeRecognition";

export function appendCanonicalPayeeAlias({
  payee,
  rawPayee,
  aliasId,
}: {
  payee: PayeeView;
  rawPayee: string;
  aliasId: string;
}): PayeeAliasView[] | null {
  const value = rawPayee.replace(/\s+/g, " ").trim();
  const sourceIdentity = normalisePayeeIdentity(value);
  const targetIdentity = normalisePayeeIdentity(payee.name);

  if (
    !aliasId.trim() ||
    !sourceIdentity ||
    !targetIdentity ||
    payee.name.trim().toLocaleLowerCase().startsWith("transfer:") ||
    sourceIdentity === targetIdentity
  ) {
    return null;
  }

  const aliases = payee.aliases ?? [];
  if (
    aliases.some(
      (alias) => normalisePayeeIdentity(alias.value) === sourceIdentity,
    )
  ) {
    return null;
  }

  return [...aliases, { id: aliasId, value }];
}
