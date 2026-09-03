type NamedPayee = { readonly name: string };

/** Exact → name prefix → later word prefix → substring; null excludes a name. */
export function getPayeeSearchRank(name: string, query: string): number | null {
  const text = name.trim().toLocaleLowerCase();
  const search = query.trim().toLocaleLowerCase();
  if (!search) return 0;
  if (text === search) return 0;
  if (text.startsWith(search)) return 1;
  let position = text.indexOf(search);
  if (position < 0) return null;
  while (position >= 0) {
    // Whitespace, punctuation and symbols cover common merchant separators.
    if (position > 0 && /[\s\p{P}\p{S}]/u.test(text[position - 1])) return 2;
    position = text.indexOf(search, position + 1);
  }
  return 3;
}

export function rankPayeeSearchMatches<T extends NamedPayee>(payees: readonly T[], query: string): T[] {
  if (!query.trim()) return [...payees];
  return payees.map((payee, index) => ({ payee, index, rank: getPayeeSearchRank(payee.name, query) }))
    .filter((entry): entry is typeof entry & { rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.payee.name.localeCompare(b.payee.name) || a.index - b.index)
    .map(({ payee }) => payee);
}

/** Keep group membership intact; rank by its strongest matching member. */
export function rankPayeeSearchGroups<T extends { readonly payees: readonly NamedPayee[] }>(
  groups: readonly T[],
  query: string,
  compareConfidence: (a: T, b: T) => number,
): T[] {
  if (!query.trim()) return [...groups].sort(compareConfidence);
  return groups.flatMap((group, index) => {
    const best = rankPayeeSearchMatches(group.payees, query)[0];
    return best ? [{ group, index, name: best.name, rank: getPayeeSearchRank(best.name, query)! }] : [];
  }).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name) ||
    compareConfidence(a.group, b.group) || a.index - b.index)
    .map(({ group }) => group);
}
