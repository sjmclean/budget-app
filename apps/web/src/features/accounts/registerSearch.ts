import type { RegisterTransactionView } from "./accountRegisterTypes";

export type RegisterSearchScope =
  "all" | "payee" | "category" | "memo" | "amount";

export interface RegisterSearchCommit {
  query: string;
  scope: RegisterSearchScope;
  label: string;
}

export interface RegisterSearchSuggestion {
  id: string;
  group: "payees" | "categories" | "memos" | "search";
  label: string;
  detail?: string;
  query: string;
  scope: RegisterSearchScope;
  count: number;
}

export const REGISTER_SEARCH_SCOPE_LABELS: Record<RegisterSearchScope, string> =
  {
    all: "all fields",
    payee: "payees",
    category: "categories",
    memo: "memos",
    amount: "amounts",
  };

export function normaliseSearchText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function parseRegisterAmountSearchCents(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const parenthesised = trimmed.startsWith("(") && trimmed.endsWith(")");
  const normalised = trimmed
    .replace(/[()]/g, "")
    .replace(/[\s,$£€¥A-Za-z]/g, "")
    .replace(/^\+/, "");
  if (!/^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(normalised)) return null;
  const amount = Number.parseFloat(normalised);
  if (!Number.isFinite(amount)) return null;
  return Math.abs(Math.round((parenthesised ? -amount : amount) * 100));
}

function amountSearchTokens(transaction: RegisterTransactionView): string[] {
  const amounts = [transaction.outflow, transaction.inflow].filter(
    (amount) => amount > 0,
  );

  return amounts.flatMap((amount) => {
    const fixed = amount.toFixed(2);
    return [fixed, fixed.replace(/\.00$/, ""), String(amount)];
  });
}

export function transactionMatchesSearch(
  transaction: RegisterTransactionView,
  search: RegisterSearchCommit,
): boolean {
  const query = normaliseSearchText(search.query);

  if (!query) {
    return true;
  }

  const splitCategories =
    transaction.splitLines?.map((line) => line.category) ?? [];
  const splitMemos =
    transaction.splitLines?.map((line) => line.memo ?? "") ?? [];

  const payeeText = normaliseSearchText(transaction.payee);
  const categoryText = normaliseSearchText(
    [transaction.category, ...splitCategories].join(" "),
  );
  const memoText = normaliseSearchText(
    [transaction.memo, transaction.checkNumber, ...splitMemos].join(" "),
  );
  const amountText = amountSearchTokens(transaction)
    .join(" ")
    .toLocaleLowerCase();
  const amountCents = parseRegisterAmountSearchCents(search.query);
  const hasExactAmount = amountCents !== null && [transaction.outflow, transaction.inflow]
    .some((amount) => Math.round(Math.abs(amount) * 100) === amountCents);

  switch (search.scope) {
    case "payee":
      return payeeText.includes(query);
    case "category":
      return categoryText.includes(query);
    case "memo":
      return memoText.includes(query);
    case "amount":
      return amountCents !== null ? hasExactAmount : amountText.includes(query);
    case "all":
    default:
      return (
        payeeText.includes(query) ||
        categoryText.includes(query) ||
        memoText.includes(query) ||
        (amountCents === null && amountText.includes(query)) ||
        hasExactAmount
      );
  }
}

function countMatchingTransactions(
  transactions: readonly RegisterTransactionView[],
  query: string,
  scope: RegisterSearchScope,
): number {
  return transactions.filter((transaction) =>
    transactionMatchesSearch(transaction, {
      query,
      scope,
      label: query,
    }),
  ).length;
}

export function buildRegisterSearchSuggestions(
  transactions: readonly RegisterTransactionView[],
  query: string,
): RegisterSearchSuggestion[] {
  const normalisedQuery = normaliseSearchText(query);

  if (!normalisedQuery) {
    return [];
  }

  const byPayee = new Map<string, { label: string; count: number }>();
  const byCategory = new Map<string, { label: string; count: number }>();
  const byMemo = new Map<string, { label: string; count: number }>();

  for (const transaction of transactions) {
    const payee = transaction.payee.trim();
    if (payee && normaliseSearchText(payee).includes(normalisedQuery)) {
      const key = normaliseSearchText(payee);
      byPayee.set(key, {
        label: payee,
        count: (byPayee.get(key)?.count ?? 0) + 1,
      });
    }

    const categoryNames = [
      transaction.category,
      ...(transaction.splitLines?.map((line) => line.category) ?? []),
    ];

    for (const category of categoryNames) {
      const cleanCategory = category.trim();
      if (
        cleanCategory &&
        normaliseSearchText(cleanCategory).includes(normalisedQuery)
      ) {
        const key = normaliseSearchText(cleanCategory);
        byCategory.set(key, {
          label: cleanCategory,
          count: (byCategory.get(key)?.count ?? 0) + 1,
        });
      }
    }

    const memoValues = [
      transaction.memo ?? "",
      ...(transaction.splitLines?.map((line) => line.memo ?? "") ?? []),
    ];

    for (const memo of memoValues) {
      const cleanMemo = memo.replace(/\s+/g, " ").trim();
      if (
        cleanMemo &&
        normaliseSearchText(cleanMemo).includes(normalisedQuery)
      ) {
        const key = normaliseSearchText(cleanMemo);
        byMemo.set(key, {
          label: cleanMemo,
          count: (byMemo.get(key)?.count ?? 0) + 1,
        });
      }
    }
  }

  const ranked = (entries: Iterable<{ label: string; count: number }>) =>
    [...entries].sort((left, right) => {
      const leftExact =
        normaliseSearchText(left.label) === normalisedQuery ? 1 : 0;
      const rightExact =
        normaliseSearchText(right.label) === normalisedQuery ? 1 : 0;

      if (leftExact !== rightExact) {
        return rightExact - leftExact;
      }

      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label);
    });

  const suggestions: RegisterSearchSuggestion[] = [
    ...ranked(byPayee.values())
      .slice(0, 8)
      .map((match) => ({
        id: `payee:${match.label}`,
        group: "payees" as const,
        label: match.label,
        detail: `${match.count} transaction${match.count === 1 ? "" : "s"}`,
        query: match.label,
        scope: "payee" as const,
        count: match.count,
      })),
    ...ranked(byCategory.values())
      .slice(0, 6)
      .map((match) => ({
        id: `category:${match.label}`,
        group: "categories" as const,
        label: match.label,
        detail: `${match.count} transaction${match.count === 1 ? "" : "s"}`,
        query: match.label,
        scope: "category" as const,
        count: match.count,
      })),
    ...ranked(byMemo.values())
      .slice(0, 4)
      .map((match) => ({
        id: `memo:${match.label}`,
        group: "memos" as const,
        label: match.label,
        detail: `${match.count} transaction${match.count === 1 ? "" : "s"}`,
        query: match.label,
        scope: "memo" as const,
        count: match.count,
      })),
  ];

  const searchEverywhereAction: RegisterSearchSuggestion = {
    id: "search:all",
    group: "search",
    label: `Search "${query.trim()}" in all fields`,
    query: query.trim(),
    scope: "all",
    count: countMatchingTransactions(transactions, query, "all"),
  };

  const searchActions: RegisterSearchSuggestion[] = [
    {
      id: "search:payee",
      group: "search",
      label: `Find "${query.trim()}" in payees`,
      query: query.trim(),
      scope: "payee",
      count: countMatchingTransactions(transactions, query, "payee"),
    },
    {
      id: "search:category",
      group: "search",
      label: `Find "${query.trim()}" in categories`,
      query: query.trim(),
      scope: "category",
      count: countMatchingTransactions(transactions, query, "category"),
    },
    {
      id: "search:memo",
      group: "search",
      label: `Find "${query.trim()}" in memos`,
      query: query.trim(),
      scope: "memo",
      count: countMatchingTransactions(transactions, query, "memo"),
    },
  ];

  if (parseRegisterAmountSearchCents(query) !== null) {
    searchActions.push({
      id: "search:amount",
      group: "search",
      label: `Find amount "${query.trim()}"`,
      query: query.trim(),
      scope: "amount",
      count: countMatchingTransactions(transactions, query, "amount"),
    });
  }

  return [searchEverywhereAction, ...suggestions, ...searchActions];
}
