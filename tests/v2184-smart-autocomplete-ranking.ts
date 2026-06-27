import {
  rankAutocompleteOptions,
  type AutocompleteOption,
} from "../apps/web/src/features/ui/autocomplete/autocompleteEngine";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const woolworthsPayees: AutocompleteOption[] = [
  {
    id: "plain",
    value: "Woolworths",
    ranking: { recentAt: "2026-06-01T00:00:00.000Z", useCount: 10 },
  },
  {
    id: "online",
    value: "Woolworths Online",
    ranking: { recentAt: "2026-06-25T00:00:00.000Z", useCount: 40 },
  },
  {
    id: "eftpos",
    value: "EFTPOS 05/07 16:08 WOOLWORTHS",
    ranking: { recentAt: "2026-06-26T00:00:00.000Z", useCount: 100 },
  },
];

const rankedWoolworths = rankAutocompleteOptions({
  inputValue: "Wool",
  options: woolworthsPayees,
});

assert(
  rankedWoolworths[0]?.value === "Woolworths Online",
  "More recent prefix payee should beat older prefix payee",
);

assert(
  rankedWoolworths[1]?.value === "Woolworths",
  "Older prefix payee should still beat contains matches",
);

assert(
  rankedWoolworths[2]?.value === "EFTPOS 05/07 16:08 WOOLWORTHS",
  "Contains payee should not beat prefix payees even when recently used",
);

const exactMatch = rankAutocompleteOptions({
  inputValue: "Woolworths",
  options: woolworthsPayees,
});

assert(
  exactMatch[0]?.value === "Woolworths",
  "Exact match should remain first even when another prefix payee is more recent",
);

const frequencyRanked = rankAutocompleteOptions({
  inputValue: "Al",
  options: [
    { id: "low", value: "Alpha", ranking: { useCount: 2 } },
    { id: "high", value: "Alpine", ranking: { useCount: 20 } },
  ],
});

assert(
  frequencyRanked[0]?.value === "Alpine",
  "Higher frequency should break ties when recency is unavailable",
);

const priorityRanked = rankAutocompleteOptions({
  inputValue: "nab",
  options: [
    {
      id: "payee",
      value: "NAB Merchant",
      ranking: { priority: 1, recentAt: "2026-06-26T00:00:00.000Z", useCount: 50 },
    },
    {
      id: "transfer",
      value: "Transfer: NAB Offset",
      ranking: { priority: 0 },
    },
  ],
});

assert(
  priorityRanked[0]?.value === "NAB Merchant",
  "Prefix payee should still beat transfer contains match",
);

const transferPrefixRanked = rankAutocompleteOptions({
  inputValue: "Transfer: NAB",
  options: [
    {
      id: "payee",
      value: "Transfer: NAB Merchant",
      ranking: { priority: 1, recentAt: "2026-06-26T00:00:00.000Z", useCount: 50 },
    },
    {
      id: "transfer",
      value: "Transfer: NAB Offset",
      ranking: { priority: 0 },
    },
  ],
});

assert(
  transferPrefixRanked[0]?.value === "Transfer: NAB Offset",
  "Transfer priority should keep transfer suggestions first when match quality is equal",
);

console.log("v2.18.4 smart autocomplete ranking regression checks passed");
