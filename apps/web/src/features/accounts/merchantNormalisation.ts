export interface NormalisedMerchant {
  raw: string;
  canonical: string;
  tokens: string[];
}

const TRAILING_NOISE_TOKENS = new Set([
  "au",
  "aus",
  "aust",
  "australia",
  "pty",
  "ltd",
  "limited",
]);

const COMMON_PAYMENT_NOISE_TOKENS = new Set([
  "eftpos",
  "visa",
  "mastercard",
  "mc",
  "card",
  "purchase",
  "debit",
  "credit",
  "pos",
]);

export function normaliseMerchant(rawPayee: string): NormalisedMerchant {
  const raw = rawPayee.trim();
  const lowercase = raw.toLowerCase();
  const withoutLongNumbers = lowercase.replace(/\b\d{3,}\b/g, " ");
  const compacted = withoutLongNumbers.replace(/[^a-z0-9]+/g, " ").trim();
  const rawTokens = compacted.length > 0 ? compacted.split(/\s+/) : [];
  const tokens = removeTrailingNoiseTokens(
    rawTokens.filter((token) => !COMMON_PAYMENT_NOISE_TOKENS.has(token)),
  ).filter((token) => token.length >= 2);

  return {
    raw,
    canonical: tokens.join(" "),
    tokens,
  };
}

function removeTrailingNoiseTokens(tokens: string[]): string[] {
  const cleaned = [...tokens];

  while (
    cleaned.length > 1 &&
    TRAILING_NOISE_TOKENS.has(cleaned[cleaned.length - 1] ?? "")
  ) {
    cleaned.pop();
  }

  return cleaned;
}
