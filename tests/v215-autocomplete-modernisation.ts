import {
  getAutocompleteCompletion,
  rankAutocompleteOptions,
  type AutocompleteOption,
} from "../apps/web/src/features/ui/autocomplete/autocompleteEngine";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const woolworthsPayees: AutocompleteOption[] = [
  { id: "eftpos", value: "EFTPOS 05/07 16:08 WOOLWORTHS" },
  { id: "online", value: "Woolworths Online" },
  { id: "plain", value: "Woolworths" },
];

const rankedWoolworths = rankAutocompleteOptions({
  inputValue: "Wool",
  options: woolworthsPayees,
});

assert(
  rankedWoolworths[0]?.value === "Woolworths",
  "Shorter prefix match should beat longer prefix and contains matches",
);

assert(
  rankedWoolworths[1]?.value === "Woolworths Online",
  "Longer prefix match should stay ahead of contains matches",
);

assert(
  rankedWoolworths[2]?.value === "EFTPOS 05/07 16:08 WOOLWORTHS",
  "Contains match should not override the prefix ghost suggestion",
);

assert(
  getAutocompleteCompletion("Wool", rankedWoolworths[0]?.value) === "worths",
  "Ghost completion should come from the highlighted/top-ranked suggestion",
);

const exactMatch = rankAutocompleteOptions({
  inputValue: "Woolworths",
  options: woolworthsPayees,
});

assert(
  exactMatch[0]?.value === "Woolworths",
  "Exact match should be ranked first",
);

assert(
  getAutocompleteCompletion("Woolworths", exactMatch[0]?.value) === "",
  "Exact matches should not show ghost completion",
);

const duplicatedOptions: AutocompleteOption[] = [
  { id: "first", value: "Groceries" },
  { id: "duplicate", value: " groceries " },
];

assert(
  rankAutocompleteOptions({ inputValue: "gro", options: duplicatedOptions })
    .length === 1,
  "Duplicate values should be collapsed before rendering suggestions",
);

console.log("v2.15 autocomplete modernisation regression checks passed");
