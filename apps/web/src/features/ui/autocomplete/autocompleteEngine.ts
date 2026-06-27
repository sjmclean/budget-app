export interface AutocompleteOption<TMetadata = unknown> {
  id: string;
  value: string;
  label?: string;
  metadata?: TMetadata;
}

export interface RankedAutocompleteOption<TMetadata = unknown>
  extends AutocompleteOption<TMetadata> {
  matchType: "exact" | "prefix" | "contains" | "all";
}

interface InternalRankedAutocompleteOption<TMetadata = unknown>
  extends RankedAutocompleteOption<TMetadata> {
  score: number;
  originalIndex: number;
}

export interface RankAutocompleteOptionsConfig<TMetadata = unknown> {
  inputValue: string;
  options: readonly AutocompleteOption<TMetadata>[];
  maxResults?: number;
  normalise?: (value: string) => string;
}

function defaultNormalise(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function getMatchScore(
  normalisedOptionValue: string,
  normalisedInputValue: string,
): { matchType: RankedAutocompleteOption["matchType"]; score: number } | null {
  if (!normalisedInputValue) {
    return { matchType: "all", score: 3 };
  }

  if (normalisedOptionValue === normalisedInputValue) {
    return { matchType: "exact", score: 0 };
  }

  if (normalisedOptionValue.startsWith(normalisedInputValue)) {
    return { matchType: "prefix", score: 1 };
  }

  if (normalisedOptionValue.includes(normalisedInputValue)) {
    return { matchType: "contains", score: 2 };
  }

  return null;
}

export function rankAutocompleteOptions<TMetadata = unknown>({
  inputValue,
  options,
  maxResults = 8,
  normalise = defaultNormalise,
}: RankAutocompleteOptionsConfig<TMetadata>): RankedAutocompleteOption<TMetadata>[] {
  const normalisedInputValue = normalise(inputValue);
  const seenValues = new Set<string>();
  const rankedOptions: InternalRankedAutocompleteOption<TMetadata>[] = [];

  options.forEach((option, originalIndex) => {
    const normalisedOptionValue = normalise(option.value);

    if (!normalisedOptionValue || seenValues.has(normalisedOptionValue)) {
      return;
    }

    seenValues.add(normalisedOptionValue);

    const match = getMatchScore(normalisedOptionValue, normalisedInputValue);

    if (!match) {
      return;
    }

    rankedOptions.push({
      ...option,
      matchType: match.matchType,
      score: match.score,
      originalIndex,
    });
  });

  return rankedOptions
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      const lengthDifference = left.value.length - right.value.length;

      if (lengthDifference !== 0) {
        return lengthDifference;
      }

      return left.originalIndex - right.originalIndex;
    })
    .slice(0, maxResults)
    .map(({ score: _score, originalIndex: _originalIndex, ...option }) =>
      option,
    );
}

export function getAutocompleteCompletion(
  inputValue: string,
  suggestionValue: string | undefined,
): string {
  if (!suggestionValue || !inputValue) {
    return "";
  }

  if (
    suggestionValue
      .toLocaleLowerCase()
      .startsWith(inputValue.toLocaleLowerCase()) &&
    suggestionValue.length > inputValue.length
  ) {
    return suggestionValue.slice(inputValue.length);
  }

  return "";
}
