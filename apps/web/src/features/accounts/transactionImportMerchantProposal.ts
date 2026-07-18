import {
  suggestMerchantKnowledge,
  type MerchantKnowledgeStore,
} from "./merchantKnowledge";
import { appendTransactionImportTrace } from "./transactionImportTrace";
import type {
  TransactionImportCandidate,
  TransactionImportMerchantResolution,
  TransactionImportProposal,
} from "./transactionImport";

export interface BuildTransactionImportMerchantProposalInput {
  store: MerchantKnowledgeStore;
  rawPayee: string;
  transaction: { inflow: number; outflow: number };
  currentProposal?: TransactionImportProposal;
  fallbackCategoryName?: string | null;
}

export interface BuiltTransactionImportMerchantProposal {
  merchant?: TransactionImportMerchantResolution;
  proposal: TransactionImportProposal;
}

export function normaliseSuggestedImportCategory(
  categoryName: string | undefined | null,
  transaction: { inflow: number; outflow: number },
): string | undefined {
  const trimmed = categoryName?.trim();
  if (!trimmed) return undefined;
  if (
    trimmed.toLocaleLowerCase() === "ready to assign" &&
    !(transaction.inflow > 0 && transaction.outflow === 0)
  ) {
    return undefined;
  }
  return trimmed;
}

export function resolveTransactionImportMerchant(
  store: MerchantKnowledgeStore,
  rawPayee: string,
): TransactionImportMerchantResolution | undefined {
  const suggestion = suggestMerchantKnowledge(store, rawPayee);
  if (!suggestion) return undefined;

  return {
    canonicalPayee: suggestion.transferAccountName
      ? `Transfer: ${suggestion.transferAccountName}`
      : suggestion.preferredName,
    suggestedCategoryName: suggestion.categoryName?.trim() || null,
    transferAccountName: suggestion.transferAccountName?.trim() || null,
  };
}

export function buildTransactionImportMerchantProposal(
  input: BuildTransactionImportMerchantProposalInput,
): BuiltTransactionImportMerchantProposal {
  const rawPayee = input.rawPayee.trim();
  const transferMatch = rawPayee.match(/^Transfer:\s*(.+)$/i);
  const explicitTransferAccountName = transferMatch?.[1]?.trim() || null;
  const merchant = explicitTransferAccountName
    ? undefined
    : resolveTransactionImportMerchant(input.store, rawPayee);
  const transferAccountName =
    explicitTransferAccountName ??
    merchant?.transferAccountName ??
    input.currentProposal?.transferAccountName ??
    null;
  const categoryName = transferAccountName
    ? null
    : normaliseSuggestedImportCategory(
        merchant?.suggestedCategoryName,
        input.transaction,
      ) ??
      normaliseSuggestedImportCategory(
        input.currentProposal?.categoryName,
        input.transaction,
      ) ??
      normaliseSuggestedImportCategory(
        input.fallbackCategoryName,
        input.transaction,
      ) ??
      null;

  return {
    merchant,
    proposal: {
      payee:
        explicitTransferAccountName !== null
          ? `Transfer: ${explicitTransferAccountName}`
          : merchant?.canonicalPayee ?? rawPayee,
      categoryName,
      transferAccountName,
    },
  };
}

export function applyTransactionImportMerchantProposal(input: {
  candidate: TransactionImportCandidate;
  store?: MerchantKnowledgeStore;
}): TransactionImportCandidate {
  if (input.candidate.status !== "new") return input.candidate;

  const merchant = input.candidate.lifecycle.merchant;
  if (!merchant && !input.store) return input.candidate;

  const built = input.store
    ? buildTransactionImportMerchantProposal({
        store: input.store,
        rawPayee: input.candidate.lifecycle.source.rawPayee,
        transaction: input.candidate.parsed,
        currentProposal: input.candidate.lifecycle.proposal,
        fallbackCategoryName: input.candidate.parsed.importedCategoryName,
      })
    : {
        merchant,
        proposal: {
          payee: merchant.canonicalPayee,
          transferAccountName:
            input.candidate.lifecycle.proposal.transferAccountName ??
            merchant.transferAccountName,
          categoryName:
            (input.candidate.lifecycle.proposal.transferAccountName ??
            merchant.transferAccountName)
              ? null
              : normaliseSuggestedImportCategory(
                  merchant.suggestedCategoryName,
                  input.candidate.parsed,
                ) ?? input.candidate.lifecycle.proposal.categoryName,
        },
      };

  return appendTransactionImportTrace(
    {
      ...input.candidate,
      lifecycle: {
        ...input.candidate.lifecycle,
        merchant: built.merchant
          ? {
              ...built.merchant,
              aliasId: merchant.aliasId,
              aliasSourcePayee: merchant.aliasSourcePayee,
            }
          : merchant,
        proposal: built.proposal,
      },
    },
    {
      stage: "proposal",
      input: { rawPayee: input.candidate.lifecycle.source.rawPayee },
      output: { ...built.proposal },
      detail: "Merchant proposal applied during preview preparation.",
    },
  );
}
