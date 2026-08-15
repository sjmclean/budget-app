import type {
  AutocompleteOption,
  RankedAutocompleteOption,
} from "../ui/autocomplete/autocompleteEngine";
import type { SidebarAccount } from "./accountService";
import type { PayeeView } from "./payeeService";

export interface PayeeSelection {
  readonly value: string;
  readonly payeeId?: string;
  readonly transferAccountId?: string;
}

export interface PayeeAutocompleteMetadata {
  payeeId?: string;
  transferAccountId?: string;
  label: string;
  type: "payee" | "transfer";
}

export function buildPayeeAutocompleteOptions({
  transferAccounts,
  payeeOptions,
}: {
  transferAccounts: SidebarAccount[];
  payeeOptions: PayeeView[];
}): Array<AutocompleteOption<PayeeAutocompleteMetadata>> {
  return [
    ...transferAccounts.map((account) => ({
      id: `transfer-${account.id}`,
      value: `Transfer: ${account.name}`,
      label: "Transfer",
      metadata: {
        payeeId: undefined,
        transferAccountId: account.id,
        label: "Transfer",
        type: "transfer" as const,
      },
      ranking: { priority: 0 },
    })),
    ...payeeOptions.map((payee) => ({
      id: `payee-${payee.id}`,
      value: payee.name,
      label: "Payee",
      metadata: { payeeId: payee.id, label: "Payee", type: "payee" as const },
      ranking: {
        priority: 1,
        recentAt: payee.lastUsedAt,
        useCount: payee.useCount,
      },
    })),
  ];
}

export function getPayeeSuggestionSection(
  suggestion: RankedAutocompleteOption<PayeeAutocompleteMetadata>,
) {
  return suggestion.metadata?.type === "transfer" ? "Transfers" : "Payees";
}

export function getPayeeSuggestionText(
  suggestion: RankedAutocompleteOption<PayeeAutocompleteMetadata>,
) {
  if (suggestion.metadata?.type !== "transfer") {
    return suggestion.value;
  }

  return suggestion.value.replace(/^Transfer:\s*/i, "");
}

export function getPayeeSelection(
  suggestion: RankedAutocompleteOption<PayeeAutocompleteMetadata>,
): PayeeSelection {
  return {
    value: suggestion.value,
    payeeId: suggestion.metadata?.payeeId,
    transferAccountId: suggestion.metadata?.transferAccountId,
  };
}
