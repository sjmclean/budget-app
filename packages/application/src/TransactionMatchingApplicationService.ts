import type {
  ExistingTransactionForMatch,
  ImportedBankTransaction,
  TransactionMatchCandidate,
} from "../../types/src/index.js";

/**
 * Suggests likely matches between imported bank rows and existing manual transactions.
 *
 * This prevents duplicate transactions when users first enter transactions manually
 * and later import a bank statement. The scoring is intentionally transparent so
 * the UI can explain why a match was suggested instead of making a hidden choice.
 */
export class TransactionMatchingApplicationService {
  suggestMatches(
    importedRows: ImportedBankTransaction[],
    existingRows: ExistingTransactionForMatch[],
  ): TransactionMatchCandidate[] {
    const matches: TransactionMatchCandidate[] = [];

    for (const imported of importedRows) {
      let best: TransactionMatchCandidate | null = null;
      for (const existing of existingRows) {
        const candidate = scoreMatch(imported, existing);
        if (!candidate) continue;
        if (!best || candidate.score > best.score) best = candidate;
      }
      // The 70-point threshold is deliberately conservative. A false positive
      // duplicate match is worse than asking the user to review one extra row,
      // because an incorrect match can hide a real transaction from the budget.
      if (best && best.score >= 70) matches.push(best);
    }

    return matches;
  }
}

function scoreMatch(
  imported: ImportedBankTransaction,
  existing: ExistingTransactionForMatch,
): TransactionMatchCandidate | null {
  let score = 0;
  const reasons: string[] = [];

  if (
    imported.externalId &&
    existing.externalId &&
    imported.externalId === existing.externalId
  ) {
    score += 100;
    reasons.push("same external transaction id");
  }

  if (imported.amount === existing.amount) {
    score += 45;
    reasons.push("same amount");
  } else {
    return null;
  }

  const dayGap = Math.abs(daysBetween(imported.date, existing.date));
  if (dayGap === 0) {
    score += 30;
    reasons.push("same date");
  } else if (dayGap <= 3) {
    score += 15;
    reasons.push("date within three days");
  }

  const importedText = normalize(`${imported.rawPayee} ${imported.memo ?? ""}`);
  const existingText = normalize(
    `${existing.payeeName ?? ""} ${existing.memo ?? ""}`,
  );
  if (
    importedText &&
    existingText &&
    (importedText.includes(existingText) || existingText.includes(importedText))
  ) {
    score += 20;
    reasons.push("similar payee or memo");
  }

  return score > 0
    ? {
        imported,
        existingTransactionId: existing.id,
        score: Math.min(score, 100),
        reasons,
      }
    : null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function daysBetween(a: string, b: string): number {
  const first = Date.UTC(
    Number(a.slice(0, 4)),
    Number(a.slice(5, 7)) - 1,
    Number(a.slice(8, 10)),
  );
  const second = Date.UTC(
    Number(b.slice(0, 4)),
    Number(b.slice(5, 7)) - 1,
    Number(b.slice(8, 10)),
  );
  return Math.round((first - second) / 86_400_000);
}
