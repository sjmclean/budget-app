export interface AutocompleteOption<TMetadata = unknown> {
  id: string;
  value: string;
  label?: string;
  metadata?: TMetadata;
  ranking?: {
    /** Lower values are ranked first within the same match type. */
    priority?: number;
    /** ISO timestamp or numeric epoch used for recency-aware suggestions. */
    recentAt?: string | number;
    /** Frequency hint used after recency. */
    useCount?: number;
  };
}

export interface RankedAutocompleteOption<TMetadata = unknown>
  extends AutocompleteOption<TMetadata> {
  matchType: "exact" | "prefix" | "contains" | "all";
}

interface InternalRankedAutocompleteOption<TMetadata = unknown>
  extends RankedAutocompleteOption<TMetadata> {
  score: number;
  priority: number;
  recentTime: number;
  useCount: number;
  normalisedValue: string;
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

function getRankingRecentTime(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const time = Date.parse(value);

    return Number.isFinite(time) ? time : 0;
  }

  return 0;
}

function getRankingUseCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getRankingPriority(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 1;
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
      priority: getRankingPriority(option.ranking?.priority),
      recentTime: getRankingRecentTime(option.ranking?.recentAt),
      useCount: getRankingUseCount(option.ranking?.useCount),
      normalisedValue: normalisedOptionValue,
      originalIndex,
    });
  });

  return rankedOptions
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      if (left.recentTime !== right.recentTime) {
        return right.recentTime - left.recentTime;
      }

      if (left.useCount !== right.useCount) {
        return right.useCount - left.useCount;
      }

      const lengthDifference = left.value.length - right.value.length;

      if (lengthDifference !== 0) {
        return lengthDifference;
      }

      const alphabeticalDifference = left.normalisedValue.localeCompare(
        right.normalisedValue,
      );

      if (alphabeticalDifference !== 0) {
        return alphabeticalDifference;
      }

      return left.originalIndex - right.originalIndex;
    })
    .slice(0, maxResults)
    .map(({
      score: _score,
      priority: _priority,
      recentTime: _recentTime,
      useCount: _useCount,
      normalisedValue: _normalisedValue,
      originalIndex: _originalIndex,
      ...option
    }) => option);
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
