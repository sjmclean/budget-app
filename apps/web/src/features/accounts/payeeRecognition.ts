import type { PayeeView, PayeeImportRuleView } from "./payeeService";

export function normalisePayeeIdentity(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export interface PayeeRecognitionMatch {
  payee: PayeeView;
  source: "alias" | "rule";
  rule?: PayeeImportRuleView;
}

const rank = { equals: 4, startsWith: 3, endsWith: 3, contains: 2 } as const;

export function resolvePayeeRecognition(
  rawDescription: string,
  payees: readonly PayeeView[],
): { match: PayeeRecognitionMatch | null; ambiguous: readonly PayeeRecognitionMatch[] } {
  const value = normalisePayeeIdentity(rawDescription);
  if (!value) return { match: null, ambiguous: [] };
  const aliases = payees.flatMap((payee) => (payee.aliases ?? [])
    .filter((alias) => normalisePayeeIdentity(alias.value) === value)
    .map((): PayeeRecognitionMatch => ({ payee, source: "alias" })));
  if (aliases.length === 1) return { match: aliases[0], ambiguous: [] };
  if (aliases.length > 1) return { match: null, ambiguous: aliases };

  const matches = payees.flatMap((payee) => (payee.importRules ?? [])
    .filter((rule) => rule.enabled !== false && matchesRule(value, rule))
    .map((rule): PayeeRecognitionMatch => ({ payee, source: "rule", rule })));
  if (matches.length === 0) return { match: null, ambiguous: [] };
  const bestRank = Math.max(...matches.map(({ rule }) => rank[rule!.matchType] * 1_000 + (rule!.priority ?? 0)));
  const best = matches.filter(({ rule }) => rank[rule!.matchType] * 1_000 + (rule!.priority ?? 0) === bestRank);
  return best.length === 1 ? { match: best[0], ambiguous: [] } : { match: null, ambiguous: best };
}

function matchesRule(value: string, rule: PayeeImportRuleView): boolean {
  const pattern = normalisePayeeIdentity(rule.text);
  if (!pattern) return false;
  if (rule.matchType === "equals") return value === pattern;
  if (rule.matchType === "startsWith") return value.startsWith(pattern);
  if (rule.matchType === "endsWith") return value.endsWith(pattern);
  return value.includes(pattern);
}

export function getPayeeDeleteEligibility(payee: PayeeView) {
  const blockers = {
    transactions: payee.useCount,
    scheduledTransactions: payee.scheduledUseCount ?? 0,
    recognitionRules: (payee.importRules ?? []).filter((rule) => rule.enabled !== false).length,
  };
  return { canDelete: Object.values(blockers).every((count) => count === 0), blockers };
}

export type PossibleDuplicateReasonType =
  | "normalised-name"
  | "shared-core-name"
  | "store-number-variation"
  | "location-variation"
  | "corporate-suffix-variation"
  | "canonical-name-contained";

export interface PossibleDuplicateReason {
  readonly type: PossibleDuplicateReasonType;
  readonly value: string;
  readonly canonicalPayeeId?: string;
  readonly candidatePayeeId?: string;
  readonly matchedText?: string;
}

export interface PossibleDuplicateSuppression {
  readonly leftPayeeId: string;
  readonly rightPayeeId: string;
}

export interface PossibleDuplicateGroup {
  readonly id: string;
  readonly anchorPayeeId: string;
  readonly anchorPayee: PayeeView;
  readonly candidates: readonly PossibleDuplicateCandidate[];
  readonly payees: readonly PayeeView[];
  readonly reasons: readonly PossibleDuplicateReason[];
  readonly status: "review";
}

export interface PossibleDuplicateCandidate {
  readonly payeeId: string;
  readonly payee: PayeeView;
  readonly reasons: readonly PossibleDuplicateReason[];
}

export interface DuplicateRecognitionRuleProposal {
  readonly targetPayeeId: string;
  readonly targetName: string;
  readonly text: string;
  readonly state: "available" | "existing" | "conflict";
}

export function proposeRecognitionRuleForDuplicate(
  reason: PossibleDuplicateReason | undefined,
  targetPayeeId: string,
  payees: readonly PayeeView[],
): DuplicateRecognitionRuleProposal | null {
  if (reason?.type !== "canonical-name-contained" ||
      reason.canonicalPayeeId !== targetPayeeId || !reason.matchedText) return null;
  const target = payees.find(({ id }) => id === targetPayeeId);
  if (!target) return null;
  const text = reason.matchedText.trim();
  const sameRule = (payee: PayeeView) => (payee.importRules ?? []).some((rule) =>
    rule.enabled !== false && rule.matchType === "contains" &&
    normalisePayeeIdentity(rule.text) === normalisePayeeIdentity(text));
  return {
    targetPayeeId,
    targetName: target.name,
    text,
    state: sameRule(target) ? "existing" : payees.some((payee) => payee.id !== targetPayeeId && sameRule(payee))
      ? "conflict" : "available",
  };
}

const protectedQualifiers = new Set([
  "insurance", "services", "web", "bank", "financial", "converters",
]);
const genericContainmentNames = new Set([
  "cash", "store", "payment", "transfer", "bank", "eftpos", "card",
  "fuel", "petrol", "shop", "online", "direct debit", "metro", "city",
  "united", "adelaide",
]);
const processorNames = new Set(["paypal", "square", "sq", "apple pay", "google pay", "afterpay", "klarna"]);
const corporateSuffix = /\b(?:pty\s+ltd|proprietary\s+limited|limited|ltd)\b/gu;
const storeNumber = /\b(?:store|shop|terminal|branch)?\s*#?\d{2,}\b/gu;
const safeLocationWords = new Set([
  "greensborough", "doncaster", "rosanna", "bundoora", "metro",
]);

function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

function duplicateIdentity(name: string) {
  const normalised = normalisePayeeIdentity(name);
  const tokens = normalised.split(" ").filter(Boolean);
  const withoutCorporate = normalised.replace(corporateSuffix, " ").replace(/\s+/g, " ").trim();
  const withoutNumbers = withoutCorporate.replace(storeNumber, " ").replace(/\s+/g, " ").trim();
  const trailingLocation = withoutNumbers.split(" ").at(-1) ?? "";
  const core = safeLocationWords.has(trailingLocation)
    ? withoutNumbers.split(" ").slice(0, -1).join(" ").replace(/\bstores?\b/gu, "").replace(/\s+/g, " ").trim()
    : withoutNumbers;
  return { normalised, core, tokens, withoutCorporate, withoutNumbers };
}

function suppressionKey(left: string, right: string): string {
  return [left, right].sort().join("\u0000");
}

function isDistinctivePayeeName(identity: ReturnType<typeof duplicateIdentity>): boolean {
  if (!identity.core || genericContainmentNames.has(identity.core)) return false;
  if (identity.tokens.length > 1) return identity.core.length >= 5;
  return identity.core.length >= 3;
}

function containsPhrase(candidate: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || candidate.length <= phrase.length) return false;
  for (let index = 0; index <= candidate.length - phrase.length; index += 1) {
    if (phrase.every((token, offset) => candidate[index + offset] === token)) return true;
  }
  return false;
}

function isProcessorWrapper(anchor: ReturnType<typeof duplicateIdentity>, candidate: ReturnType<typeof duplicateIdentity>): boolean {
  if (!processorNames.has(anchor.core)) return false;
  const phrase = anchor.core.split(" ");
  return containsPhrase(candidate.tokens, phrase) && candidate.tokens.slice(0, phrase.length).join(" ") === anchor.core;
}

function anchorRank(entry: { payee: PayeeView; identity: ReturnType<typeof duplicateIdentity> }): readonly number[] {
  const noise = entry.identity.tokens.filter((token) =>
    token === "eftpos" || token === "cash" || token === "out" || token === "paypal" || /^\d+$/.test(token)).length;
  return [noise, entry.identity.tokens.length, entry.identity.normalised.length, -entry.payee.useCount];
}

function chooseAnchor<T extends { payee: PayeeView; identity: ReturnType<typeof duplicateIdentity> }>(left: T, right: T): [T, T] {
  const a = anchorRank(left), b = anchorRank(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? [left, right] : [right, left];
  }
  return left.payee.name.localeCompare(right.payee.name) <= 0 ? [left, right] : [right, left];
}

function directDuplicateEvidence(
  anchor: { payee: PayeeView; identity: ReturnType<typeof duplicateIdentity> },
  candidate: { payee: PayeeView; identity: ReturnType<typeof duplicateIdentity> },
): readonly PossibleDuplicateReason[] {
  const reasons: PossibleDuplicateReason[] = [];
  const pair = { canonicalPayeeId: anchor.payee.id, candidatePayeeId: candidate.payee.id };
  if (anchor.identity.normalised === candidate.identity.normalised) {
    reasons.push({ type: "normalised-name", value: titleCase(anchor.identity.core), ...pair });
  } else if (genericContainmentNames.has(anchor.identity.core)) {
    return [];
  } else if (anchor.identity.core === candidate.identity.core) {
    reasons.push({ type: "shared-core-name", value: titleCase(anchor.identity.core), ...pair });
    if (anchor.identity.normalised !== anchor.identity.withoutCorporate || candidate.identity.normalised !== candidate.identity.withoutCorporate)
      reasons.push({ type: "corporate-suffix-variation", value: "Corporate suffix differs", ...pair });
    if (anchor.identity.withoutCorporate !== anchor.identity.withoutNumbers || candidate.identity.withoutCorporate !== candidate.identity.withoutNumbers)
      reasons.push({ type: "store-number-variation", value: "Store or location number differs", ...pair });
    if (anchor.identity.withoutNumbers !== anchor.identity.core || candidate.identity.withoutNumbers !== candidate.identity.core)
      reasons.push({ type: "location-variation", value: "Known store or location qualifier differs", ...pair });
  }
  if (isDistinctivePayeeName(anchor.identity) && !isProcessorWrapper(anchor.identity, candidate.identity) &&
      containsPhrase(candidate.identity.tokens, anchor.identity.core.split(" "))) {
    const matchedText = anchor.identity.core.toLocaleUpperCase();
    reasons.push({ type: "canonical-name-contained", value: `Contains exact payee phrase "${matchedText}"`,
      matchedText, ...pair });
    if (candidate.identity.normalised !== candidate.identity.withoutCorporate &&
        !reasons.some(({ type }) => type === "corporate-suffix-variation"))
      reasons.push({ type: "corporate-suffix-variation", value: "Corporate suffix differs", ...pair });
  }
  return [...new Map(reasons.map((reason) => [`${reason.type}:${reason.value}`, reason])).values()];
}

/** Indexed deterministic detection: O(n) bucketing plus sorting, not O(n²). */
function findPossibleDuplicateGroupsLegacy(
  payees: readonly PayeeView[],
  suppressions: readonly PossibleDuplicateSuppression[] = [],
) {
  const suppressed = new Set(suppressions.map(({ leftPayeeId, rightPayeeId }) =>
    suppressionKey(leftPayeeId, rightPayeeId)));
  const entries: Array<{ payee: PayeeView; identity: ReturnType<typeof duplicateIdentity> }> = [];
  const buckets = new Map<string, typeof entries>();
  const tokenIndex = new Map<string, typeof entries>();
  for (const payee of payees) {
    const identity = duplicateIdentity(payee.name);
    if (!identity.core) continue;
    const entry = { payee, identity };
    entries.push(entry);
    const bucket = buckets.get(identity.core) ?? [];
    bucket.push(entry);
    buckets.set(identity.core, bucket);
    for (const token of new Set(identity.tokens)) {
      const indexed = tokenIndex.get(token) ?? [];
      indexed.push(entry);
      tokenIndex.set(token, indexed);
    }
  }

  const edges = new Map<string, { left: typeof entries[number]; right: typeof entries[number]; reasons: PossibleDuplicateReason[] }>();
  for (const [core, entries] of buckets) {
    if (entries.length < 2 || entries.length > 200) continue;
    const reasons = new Map<PossibleDuplicateReasonType, PossibleDuplicateReason>();
    if (new Set(entries.map(({ identity }) => identity.normalised)).size === 1) {
      reasons.set("normalised-name", { type: "normalised-name", value: titleCase(core) });
    } else {
      reasons.set("shared-core-name", { type: "shared-core-name", value: titleCase(core) });
      if (entries.some(({ identity }) => identity.normalised !== identity.withoutCorporate))
        reasons.set("corporate-suffix-variation", { type: "corporate-suffix-variation", value: "Corporate suffix differs" });
      if (entries.some(({ identity }) => identity.withoutCorporate !== identity.withoutNumbers))
        reasons.set("store-number-variation", { type: "store-number-variation", value: "Store or location number differs" });
      if (entries.some(({ identity }) => identity.withoutNumbers !== identity.core))
        reasons.set("location-variation", { type: "location-variation", value: "Known store or location qualifier differs" });
    }
    for (let index = 0; index < entries.length; index += 1) for (let other = index + 1; other < entries.length; other += 1) {
      const left = entries[index], right = entries[other];
      if (!suppressed.has(suppressionKey(left.payee.id, right.payee.id)))
        edges.set(suppressionKey(left.payee.id, right.payee.id), { left, right, reasons: [...reasons.values()] });
    }
  }

  for (const canonical of entries) {
    if (!isDistinctivePayeeName(canonical.identity)) continue;
    const phrase = canonical.identity.core.split(" ");
    const candidates = tokenIndex.get(phrase[0]) ?? [];
    // A highly common first token is not distinctive enough for safe containment
    // matching and would otherwise degrade a large payee list toward O(n²).
    if (candidates.length > 200) continue;
    for (const candidate of candidates) {
      if (candidate.payee.id === canonical.payee.id || candidate.identity.tokens.some((token) => protectedQualifiers.has(token))) continue;
      const key = suppressionKey(canonical.payee.id, candidate.payee.id);
      if (suppressed.has(key) || edges.has(key) || !containsPhrase(candidate.identity.tokens, phrase)) continue;
      edges.set(key, { left: canonical, right: candidate, reasons: [{
        type: "canonical-name-contained", value: `Contains exact payee name “${canonical.identity.core.toLocaleUpperCase()}”`,
        canonicalPayeeId: canonical.payee.id, candidatePayeeId: candidate.payee.id,
        matchedText: canonical.identity.core.toLocaleUpperCase(),
      }] });
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const { left, right } of edges.values()) {
    (adjacency.get(left.payee.id) ?? adjacency.set(left.payee.id, new Set()).get(left.payee.id)!).add(right.payee.id);
    (adjacency.get(right.payee.id) ?? adjacency.set(right.payee.id, new Set()).get(right.payee.id)!).add(left.payee.id);
  }
  const byId = new Map(entries.map((entry) => [entry.payee.id, entry]));
  const visited = new Set<string>();
  const groups: Array<{ id: string; payees: readonly PayeeView[]; reasons: readonly PossibleDuplicateReason[]; status: "review" }> = [];
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    const ids: string[] = [], queue = [start];
    while (queue.length) { const id = queue.pop()!; if (visited.has(id)) continue; visited.add(id); ids.push(id); for (const next of adjacency.get(id) ?? []) queue.push(next); }
    if (ids.length < 2) continue;
    const componentEdges = [...edges.values()].filter(({ left, right }) => ids.includes(left.payee.id) && ids.includes(right.payee.id));
    const members = ids.map((id) => byId.get(id)!.payee)
      .sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name));
    groups.push({
      id: members.map(({ id }) => id).sort().join(":"),
      payees: members,
      reasons: [...new Map(componentEdges.flatMap(({ reasons }) => reasons).map((reason) =>
        [`${reason.type}:${reason.canonicalPayeeId ?? ""}:${reason.candidatePayeeId ?? ""}`, reason])).values()],
      status: "review",
    });
  }
  return groups.sort((a, b) => b.payees.reduce((sum, p) => sum + p.useCount, 0) -
    a.payees.reduce((sum, p) => sum + p.useCount, 0));
}

void findPossibleDuplicateGroupsLegacy;

/** Indexed, anchor-centred detection. Every member has direct evidence against its anchor. */
export function findPossibleDuplicateGroups(
  payees: readonly PayeeView[],
  suppressions: readonly PossibleDuplicateSuppression[] = [],
): readonly PossibleDuplicateGroup[] {
  const suppressed = new Set(suppressions.map(({ leftPayeeId, rightPayeeId }) =>
    suppressionKey(leftPayeeId, rightPayeeId)));
  const entries: Array<{ payee: PayeeView; identity: ReturnType<typeof duplicateIdentity> }> = [];
  const buckets = new Map<string, typeof entries>();
  const tokenIndex = new Map<string, typeof entries>();
  for (const payee of payees) {
    const identity = duplicateIdentity(payee.name);
    if (!identity.core) continue;
    const entry = { payee, identity };
    entries.push(entry);
    const bucket = buckets.get(identity.core) ?? [];
    bucket.push(entry);
    buckets.set(identity.core, bucket);
    for (const token of new Set(identity.tokens)) {
      const indexed = tokenIndex.get(token) ?? [];
      indexed.push(entry);
      tokenIndex.set(token, indexed);
    }
  }

  const possiblePairs = new Map<string, [typeof entries[number], typeof entries[number]]>();
  for (const bucket of buckets.values()) {
    if (bucket.length < 2 || bucket.length > 200) continue;
    for (let index = 0; index < bucket.length; index += 1) for (let other = index + 1; other < bucket.length; other += 1)
      possiblePairs.set(suppressionKey(bucket[index].payee.id, bucket[other].payee.id), [bucket[index], bucket[other]]);
  }
  for (const entry of entries) {
    if (!isDistinctivePayeeName(entry.identity)) continue;
    const indexed = tokenIndex.get(entry.identity.core.split(" ")[0]) ?? [];
    if (indexed.length > 200) continue;
    for (const other of indexed) if (other.payee.id !== entry.payee.id)
      possiblePairs.set(suppressionKey(entry.payee.id, other.payee.id), [entry, other]);
  }

  const byAnchor = new Map<string, { anchor: typeof entries[number]; candidates: PossibleDuplicateCandidate[] }>();
  for (const [key, pair] of possiblePairs) {
    if (suppressed.has(key)) continue;
    const [anchor, candidate] = chooseAnchor(pair[0], pair[1]);
    if (candidate.identity.tokens.some((token) => protectedQualifiers.has(token)) && anchor.identity.core !== candidate.identity.core) continue;
    const reasons = directDuplicateEvidence(anchor, candidate);
    if (reasons.length === 0) continue;
    const group = byAnchor.get(anchor.payee.id) ?? { anchor, candidates: [] };
    group.candidates.push({ payeeId: candidate.payee.id, payee: candidate.payee, reasons: [...reasons] });
    byAnchor.set(anchor.payee.id, group);
  }

  const groups: PossibleDuplicateGroup[] = [...byAnchor.values()].map(({ anchor, candidates }) => {
    const sortedCandidates = [...candidates].sort((a, b) => b.payee.useCount - a.payee.useCount || a.payee.name.localeCompare(b.payee.name));
    const reasons = [...new Map(sortedCandidates.flatMap(({ reasons }) => reasons)
      .map((reason) => [`${reason.type}:${reason.value}`, reason])).values()];
    return {
      id: `${anchor.payee.id}:${sortedCandidates.map(({ payeeId }) => payeeId).sort().join(":")}`,
      anchorPayeeId: anchor.payee.id, anchorPayee: anchor.payee, candidates: sortedCandidates,
      payees: [anchor.payee, ...sortedCandidates.map(({ payee }) => payee)], reasons, status: "review" as const,
    };
  });
  return groups.sort((a, b) => b.payees.reduce((sum, payee) => sum + payee.useCount, 0) -
    a.payees.reduce((sum, payee) => sum + payee.useCount, 0));
}

/** Compatibility helper retained for existing callers and tests. */
export function findDeterministicDuplicateGroups(payees: readonly PayeeView[]): readonly PayeeView[][] {
  return findPossibleDuplicateGroups(payees).map(({ payees }) => [...payees]);
}
