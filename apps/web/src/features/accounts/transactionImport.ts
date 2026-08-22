import { createBudgetScopedStorage } from "../budget/budgetDataScope";
import { getActiveKeyValueStorage } from "../persistence/activeKeyValueStorage";
import {
  readTransactionImportProfileEntities,
  readTransactionPayeeAliasEntities,
  replaceTransactionImportProfileEntities,
  replaceTransactionPayeeAliasEntities,
} from "./entities/importPreferenceEntity";
import type { RegisterTransactionView } from "./accountRegisterTypes";
import { buildRegisterTransactionsFromImport } from "./transactionImportCommit";
import { parseTransactionOfx } from "./transactionImportParser";
import type { ParsedImportTransaction } from "./transactionImportParser";
import type { TransactionImportTraceEntry } from "./transactionImportTrace";
import {
  hasAmbiguousAutomaticImportMatch,
  reconcileTransactionImportCandidate,
} from "./transactionImportReconciliation";
import type {
  TransactionImportMatchCandidateAssessment,
  TransactionImportMatchEvidence,
  TransactionImportMerchantResolution,
  TransactionImportReconciliationKind,
  TransactionImportTransferAccount,
  TransactionImportTransferResolution,
} from "./transactionImportReconciliation";
import {
  validateParsedImportTransaction,
  validateQifTransferDestinations,
} from "./transactionImportValidator";
import {
  detectQifImportFormat,
  inspectTransactionCsvImport,
  inspectTransactionQifImport,
  inspectTransactionOfxImport,
  parseQifDateValue,
  parseQifMoneyValue,
  parseTransactionImportCsvRows,
} from "./transactionImportInspection";
import type {
  CsvImportAnalysis,
  CsvImportColumnMapping,
  CsvImportColumnRole,
  QifAmountFormat,
  QifDateFormat,
} from "./transactionImportInspection";

export {
  detectQifImportFormat,
  inspectTransactionCsvImport,
  inspectTransactionQifImport,
  inspectTransactionOfxImport,
  QIF_DATE_FORMAT_OPTIONS,
} from "./transactionImportInspection";
export { validateParsedImportTransaction, validateQifTransferDestinations } from "./transactionImportValidator";
export { buildRegisterTransactionsFromImport } from "./transactionImportCommit";
export { parseTransactionOfx } from "./transactionImportParser";
export type { ParsedImportTransaction } from "./transactionImportParser";
export {
  assessTransactionImportMatch,
  HIGH_CONFIDENCE_IMPORT_MATCH_DAYS,
  SUGGESTED_IMPORT_MATCH_DAYS,
  TRANSACTION_IMPORT_CANDIDATE_WINDOW_DAYS,
} from "./transactionImportReconciliation";
export type {
  TransactionImportMatchAssessment,
  TransactionImportMatchCandidateAssessment,
  TransactionImportMatchEvidence,
  TransactionImportMerchantResolution,
  TransactionImportRecommendation,
  TransactionImportReconciliationKind,
  TransactionImportTransferAccount,
  TransactionImportTransferResolution,
} from "./transactionImportReconciliation";

export type {
  CsvImportAnalysis,
  CsvImportColumnAnalysis,
  CsvImportColumnMapping,
  CsvImportColumnRole,
  CsvImportInspection,
  ImportFileType,
  ImportInspectionDiagnostic,
  ImportInspectionResult,
  ImportInspectionSetting,
  ImportSettingSource,
  QifAmountFormat,
  QifDateFormat,
  QifImportDetection,
  QifImportInspection,
  OfxImportInspection,
  OfxImportInspectionDetails,
} from "./transactionImportInspection";

export type TransactionImportMatchStatus =
  "exact-match" | "new" | "invalid";
export interface TransactionImportProfile {
  id: string;
  name: string;
  parserType: "csv";
  signature: string;
  mapping: CsvImportColumnMapping;
  defaultAccountName?: string;
  createdAt: string;
  updatedAt: string;
}

export const TRANSACTION_IMPORT_PROFILES_STORAGE_KEY =
  "budget-app.transaction-import-profiles.v1";

export interface TransactionPayeeAlias {
  id: string;
  sourcePayee: string;
  targetPayee: string;
  normalisedSource: string;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionPayeeAliasSuggestion {
  id: string;
  sourcePayee: string;
  suggestedTargetPayee: string;
  normalisedSource: string;
  reason: string;
  occurrenceCount: number;
}

export const TRANSACTION_PAYEE_ALIASES_STORAGE_KEY =
  "budget-app.transaction-payee-aliases.v1";

export interface TransactionImportSourceSnapshot {
  readonly rowNumber: number;
  readonly date: string;
  readonly rawPayee: string;
  readonly memo?: string;
  readonly importedCategoryName?: string;
  readonly transferAccountName?: string;
  readonly outflow: number;
  readonly inflow: number;
}

export interface TransactionImportProposal {
  payee: string;
  categoryName: string | null;
  transferAccountName: string | null;
}

export type TransactionImportRecognitionProvenance =
  | "explicit-rule"
  | "exact-alias"
  | "exact-canonical"
  | "merchant-inference"
  | "raw";

export interface TransactionImportLifecycle {
  readonly source: TransactionImportSourceSnapshot;
  merchant: TransactionImportMerchantResolution;
  proposal: TransactionImportProposal;
}

export type TransactionImportReviewDecision = "import-as-new" | "skipped";

export interface TransactionImportCandidate {
  id: string;
  parsed: ParsedImportTransaction;
  status: TransactionImportMatchStatus;
  matchedTransactionId?: string;
  matchedTransaction?: RegisterTransactionView;
  reason: string;
  evidence?: TransactionImportMatchEvidence[];
  matchCandidates?: TransactionImportMatchCandidateAssessment[];
  selected: boolean;
  reviewDecision?: TransactionImportReviewDecision;
  errors: string[];
  lifecycle: TransactionImportLifecycle;
  reconciliationKind?: TransactionImportReconciliationKind;
  transferResolution?: TransactionImportTransferResolution;
  trace?: readonly TransactionImportTraceEntry[];
}

export interface TransactionImportPerformanceEntry {
  label: string;
  durationMs: number;
}

export interface TransactionImportPerformanceReport {
  entries: TransactionImportPerformanceEntry[];
  totalMs: number;
}

export function createTransactionImportPerformanceReport(
  entries: readonly TransactionImportPerformanceEntry[],
): TransactionImportPerformanceReport {
  const normalisedEntries = entries.map((entry) => ({
    label: entry.label,
    durationMs: entry.durationMs,
  }));

  return {
    entries: normalisedEntries,
    totalMs: normalisedEntries.reduce(
      (total, entry) => total + entry.durationMs,
      0,
    ),
  };
}

export function formatImportDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(2)} s`;
}

export type TransactionImportMerchantResolver = (
  rawPayee: string,
) => string | Partial<TransactionImportMerchantResolution> | undefined;

export interface TransactionImportPreview {
  candidates: TransactionImportCandidate[];
  summary: {
    totalRows: number;
    newTransactions: number;
    exactMatches: number;
    possibleMatches: number;
    invalidRows: number;
    selectedForImport: number;
  };
}

export function analyseTransactionCsvImport(
  csvText: string,
): CsvImportAnalysis {
  return inspectTransactionCsvImport(csvText).details.analysis;
}

export function previewTransactionCsvImport(
  csvText: string,
  existingTransactions: RegisterTransactionView[],
  mapping?: CsvImportColumnMapping,
  resolveMerchant?: TransactionImportMerchantResolver,
): TransactionImportPreview {
  return buildTransactionImportPreview(
    parseTransactionCsv(csvText, mapping),
    existingTransactions,
    resolveMerchant,
    readTransactionPayeeAliases(),
  );
}

export function previewTransactionOfxImport(
  ofxText: string,
  existingTransactions: RegisterTransactionView[],
  resolveMerchant?: TransactionImportMerchantResolver,
): TransactionImportPreview {
  return buildTransactionImportPreview(
    parseTransactionOfx(ofxText),
    existingTransactions,
    resolveMerchant,
    readTransactionPayeeAliases(),
  );
}

export function previewTransactionQifImport(
  qifText: string,
  existingTransactions: RegisterTransactionView[],
  options?: {
    sourceAccountName?: string;
    availableTransferAccountNames?: string[];
    transferAccounts?: TransactionImportTransferAccount[];
    dateFormat?: QifDateFormat;
    amountFormat?: QifAmountFormat;
  },
  resolveMerchant?: TransactionImportMerchantResolver,
): TransactionImportPreview {
  const preview = buildTransactionImportPreview(
    parseTransactionQif(qifText, options),
    existingTransactions,
    resolveMerchant,
    readTransactionPayeeAliases(),
    { transferAccounts: options?.transferAccounts },
  );

  return validateQifTransferDestinations(preview, options);
}

export function assignTransactionImportMatches(
  candidates: TransactionImportCandidate[],
): TransactionImportCandidate[] {
  const automaticOptions = candidates.map((candidate) => {
    const matchCandidates = candidate.matchCandidates ?? [];

    if (hasAmbiguousAutomaticImportMatch(matchCandidates)) {
      return [];
    }

    return matchCandidates.filter(
      (assessment) => assessment.automaticMatch,
    );
  });

  const assignableCandidateIndexes = candidates
    .map((candidate, index) => ({
      id: candidate.id,
      index,
    }))
    .filter(({ index }) => automaticOptions[index].length > 0)
    .sort(
      (left, right) =>
        left.id.localeCompare(right.id) ||
        left.index - right.index,
    );

  const stableCandidateRank = new Map(
    assignableCandidateIndexes.map(
      ({ index }, rank) => [index, rank],
    ),
  );

  const transactionCandidateIndexes = new Map<
    string,
    number[]
  >();

  for (const { index: candidateIndex } of assignableCandidateIndexes) {
    for (const assessment of automaticOptions[candidateIndex]) {
      const transactionId = assessment.transaction.id;
      const existing =
        transactionCandidateIndexes.get(transactionId);

      if (existing) {
        existing.push(candidateIndex);
      } else {
        transactionCandidateIndexes.set(
          transactionId,
          [candidateIndex],
        );
      }
    }
  }

  for (const candidateIndexes of transactionCandidateIndexes.values()) {
    candidateIndexes.sort(
      (left, right) =>
        (stableCandidateRank.get(left) ?? 0) -
        (stableCandidateRank.get(right) ?? 0),
    );
  }

  interface AssignmentComponent {
    readonly candidateIndexes: readonly number[];
    readonly transactionIds: readonly string[];
  }

  function buildAssignmentComponents(): AssignmentComponent[] {
    const visitedCandidates = new Set<number>();
    const components: AssignmentComponent[] = [];

    for (const { index: startCandidateIndex } of assignableCandidateIndexes) {
      if (visitedCandidates.has(startCandidateIndex)) {
        continue;
      }

      const componentCandidateIndexes: number[] = [];
      const componentTransactionIds = new Set<string>();
      const candidateQueue = [startCandidateIndex];
      visitedCandidates.add(startCandidateIndex);

      for (
        let queueIndex = 0;
        queueIndex < candidateQueue.length;
        queueIndex += 1
      ) {
        const candidateIndex = candidateQueue[queueIndex];
        componentCandidateIndexes.push(candidateIndex);

        const transactionIds = automaticOptions[candidateIndex]
          .map((assessment) => assessment.transaction.id)
          .sort((left, right) => left.localeCompare(right));

        for (const transactionId of transactionIds) {
          if (componentTransactionIds.has(transactionId)) {
            continue;
          }

          componentTransactionIds.add(transactionId);

          for (
            const connectedCandidateIndex of
              transactionCandidateIndexes.get(transactionId) ?? []
          ) {
            if (
              visitedCandidates.has(connectedCandidateIndex)
            ) {
              continue;
            }

            visitedCandidates.add(connectedCandidateIndex);
            candidateQueue.push(connectedCandidateIndex);
          }
        }
      }

      componentCandidateIndexes.sort(
        (left, right) =>
          (stableCandidateRank.get(left) ?? 0) -
          (stableCandidateRank.get(right) ?? 0),
      );

      components.push({
        candidateIndexes: componentCandidateIndexes,
        transactionIds: [
          ...componentTransactionIds,
        ].sort((left, right) => left.localeCompare(right)),
      });
    }

    return components;
  }

  const assignedAssessments = new Map<
    number,
    TransactionImportMatchCandidateAssessment
  >();

  interface FlowEdge {
    readonly to: number;
    readonly reverseIndex: number;
    capacity: number;
    readonly cost: number;
    readonly candidateIndex?: number;
    readonly assessment?: TransactionImportMatchCandidateAssessment;
  }

  function solveAssignmentComponent(
    component: AssignmentComponent,
  ): void {
    /*
     * The overwhelmingly common case requires no flow solver at all:
     * one imported row has exactly one automatic register candidate.
     */
    if (
      component.candidateIndexes.length === 1 &&
      component.transactionIds.length === 1
    ) {
      const candidateIndex = component.candidateIndexes[0];
      const transactionId = component.transactionIds[0];

      const assessment = automaticOptions[candidateIndex].find(
        (option) =>
          option.transaction.id === transactionId,
      );

      if (!assessment) {
        throw new Error(
          `Missing automatic assessment for import assignment ${transactionId}.`,
        );
      }

      assignedAssessments.set(candidateIndex, assessment);
      return;
    }

    /*
     * Solve only this connected bipartite conflict component as
     * minimum-cost maximum-flow.
     *
     * Each source -> candidate -> transaction -> sink path contributes one
     * match. Augmenting until no path remains therefore maximises cardinality.
     *
     * Candidate -> transaction edges use negative matchScore, so among all
     * maximum-cardinality solutions the minimum-cost result has the greatest
     * total confidence.
     *
     * Candidate and transaction nodes use stable ID ordering, keeping equal
     * cost outcomes deterministic and independent of source-row ordering.
     */
    const candidateIndexes = [...component.candidateIndexes];
    const transactionIds = [...component.transactionIds];

    const transactionIndexById = new Map(
      transactionIds.map((id, index) => [id, index]),
    );

    const source = 0;
    const candidateNodeOffset = 1;
    const transactionNodeOffset =
      candidateNodeOffset + candidateIndexes.length;
    const sink = transactionNodeOffset + transactionIds.length;

    const graph: FlowEdge[][] = Array.from(
      { length: sink + 1 },
      () => [],
    );

    function addFlowEdge(
      from: number,
      to: number,
      capacity: number,
      cost: number,
      metadata: {
        readonly candidateIndex?: number;
        readonly assessment?: TransactionImportMatchCandidateAssessment;
      } = {},
    ) {
      const forward: FlowEdge = {
        to,
        reverseIndex: graph[to].length,
        capacity,
        cost,
        ...metadata,
      };

      const reverse: FlowEdge = {
        to: from,
        reverseIndex: graph[from].length,
        capacity: 0,
        cost: -cost,
      };

      graph[from].push(forward);
      graph[to].push(reverse);
    }

    candidateIndexes.forEach(
      (candidateIndex, componentCandidateIndex) => {
        const candidateNode =
          candidateNodeOffset + componentCandidateIndex;

        addFlowEdge(source, candidateNode, 1, 0);

        const options = [...automaticOptions[candidateIndex]]
          .filter((assessment) =>
            transactionIndexById.has(
              assessment.transaction.id,
            ),
          )
          .sort(
            (left, right) =>
              right.matchScore - left.matchScore ||
              left.transaction.id.localeCompare(
                right.transaction.id,
              ),
          );

        for (const assessment of options) {
          const transactionIndex =
            transactionIndexById.get(
              assessment.transaction.id,
            );

          if (transactionIndex === undefined) {
            throw new Error(
              `Missing transaction node for import match ${assessment.transaction.id}.`,
            );
          }

          addFlowEdge(
            candidateNode,
            transactionNodeOffset + transactionIndex,
            1,
            -assessment.matchScore,
            {
              candidateIndex,
              assessment,
            },
          );
        }
      },
    );

    transactionIds.forEach((_, transactionIndex) => {
      addFlowEdge(
        transactionNodeOffset + transactionIndex,
        sink,
        1,
        0,
      );
    });

    while (true) {
      const distance = Array<number>(graph.length).fill(
        Number.POSITIVE_INFINITY,
      );
      const previousNode = Array<number>(graph.length).fill(-1);
      const previousEdge = Array<number>(graph.length).fill(-1);

      distance[source] = 0;

      /*
       * Bellman-Ford handles the negative residual costs required when a
       * previous assignment must be displaced to produce a better global
       * solution. Component decomposition keeps these graphs small.
       */
      for (
        let iteration = 0;
        iteration < graph.length - 1;
        iteration += 1
      ) {
        let changed = false;

        for (
          let from = 0;
          from < graph.length;
          from += 1
        ) {
          if (!Number.isFinite(distance[from])) {
            continue;
          }

          for (
            let edgeIndex = 0;
            edgeIndex < graph[from].length;
            edgeIndex += 1
          ) {
            const edge = graph[from][edgeIndex];

            if (edge.capacity <= 0) {
              continue;
            }

            const nextDistance =
              distance[from] + edge.cost;

            if (nextDistance < distance[edge.to]) {
              distance[edge.to] = nextDistance;
              previousNode[edge.to] = from;
              previousEdge[edge.to] = edgeIndex;
              changed = true;
            }
          }
        }

        if (!changed) {
          break;
        }
      }

      if (!Number.isFinite(distance[sink])) {
        break;
      }

      let node = sink;

      while (node !== source) {
        const from = previousNode[node];
        const edgeIndex = previousEdge[node];

        if (from < 0 || edgeIndex < 0) {
          throw new Error(
            "Import assignment flow path is incomplete.",
          );
        }

        const edge = graph[from][edgeIndex];
        edge.capacity -= 1;
        graph[node][edge.reverseIndex].capacity += 1;
        node = from;
      }
    }

    candidateIndexes.forEach(
      (candidateIndex, componentCandidateIndex) => {
        const candidateNode =
          candidateNodeOffset + componentCandidateIndex;

        for (const edge of graph[candidateNode]) {
          if (
            edge.assessment &&
            edge.candidateIndex === candidateIndex &&
            edge.capacity === 0
          ) {
            assignedAssessments.set(
              candidateIndex,
              edge.assessment,
            );
            break;
          }
        }
      },
    );
  }

  for (const component of buildAssignmentComponents()) {
    solveAssignmentComponent(component);
  }

  return candidates.map((candidate, index) => {
    if (candidate.status === "invalid") {
      return candidate;
    }

    const assigned = assignedAssessments.get(index);

    if (assigned) {
      return {
        ...candidate,
        status: "exact-match",
        matchedTransactionId: assigned.transaction.id,
        matchedTransaction: assigned.transaction,
        evidence: assigned.evidence,
        reason: assigned.reason,
        selected: false,
        reviewDecision: undefined,
      };
    }

    if (automaticOptions[index].length > 0) {
      return {
        ...candidate,
        status: "new",
        matchedTransactionId: undefined,
        matchedTransaction: undefined,
        evidence: undefined,
        reason:
          "No unused register transaction could be assigned without displacing another valid import match.",
        selected: true,
        reviewDecision: undefined,
      };
    }

    return candidate;
  });
}

function buildTransactionImportPreview(
  parsedTransactions: ParsedImportTransaction[],
  existingTransactions: RegisterTransactionView[],
  resolveMerchant?: TransactionImportMerchantResolver,
  aliases: TransactionPayeeAlias[] = [],
  reconciliationContext: {
    transferAccounts?: readonly TransactionImportTransferAccount[];
  } = {},
): TransactionImportPreview {
  const classifiedCandidates = parsedTransactions.map((transaction) =>
    classifyImportCandidate(
      transaction,
      existingTransactions,
      new Set<string>(),
      resolveMerchant,
      aliases,
      reconciliationContext,
    ),
  );
  const candidates = assignTransactionImportMatches(classifiedCandidates);

  return {
    candidates,
    summary: {
      totalRows: candidates.length,
      newTransactions: candidates.filter(
        (candidate) => candidate.status === "new",
      ).length,
      exactMatches: candidates.filter(
        (candidate) => candidate.status === "exact-match",
      ).length,
      possibleMatches: 0,
      invalidRows: candidates.filter(
        (candidate) => candidate.status === "invalid",
      ).length,
      selectedForImport: candidates.filter((candidate) => candidate.selected)
        .length,
    },
  };
}

export function parseTransactionCsv(
  csvText: string,
  mapping?: CsvImportColumnMapping,
): ParsedImportTransaction[] {
  const rows = parseTransactionImportCsvRows(csvText);

  if (rows.length <= 1) {
    return [];
  }

  const headers = rows[0].map(
    (header, index) => header.trim() || `Column ${index + 1}`,
  );
  const resolvedMapping =
    mapping ?? analyseTransactionCsvImport(csvText).suggestedMapping;

  return rows.slice(1).map((row, index) => {
    const raw = Object.fromEntries(
      headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""]),
    );
    const date = normaliseImportDate(readRole(row, resolvedMapping, "date"));
    const memoValue = readRole(row, resolvedMapping, "memo").trim();
    const payee = readImportPayee(row, resolvedMapping, memoValue);
    const memo = memoValue || undefined;
    const { outflow, inflow } = readMappedImportAmount(row, resolvedMapping);

    return {
      rowNumber: index + 2,
      date,
      payee,
      memo,
      outflow,
      inflow,
      raw,
    };
  });
}

export function parseTransactionQif(
  qifText: string,
  options?: { dateFormat?: QifDateFormat; amountFormat?: QifAmountFormat },
): ParsedImportTransaction[] {
  const detectedFormat = detectQifImportFormat(qifText);
  const dateFormat: QifDateFormat =
    options?.dateFormat ?? detectedFormat.dateFormat;
  const amountFormat: QifAmountFormat =
    options?.amountFormat ?? detectedFormat.amountFormat;
  const transactions: ParsedImportTransaction[] = [];
  let record: Record<string, string> = {};
  let rowNumber = 1;

  function commitRecord() {
    if (Object.keys(record).length === 0) {
      return;
    }

    const amount = parseQifMoneyValue(record.amount ?? "", amountFormat);
    const payee = (record.payee ?? record.memo ?? "").trim();
    const memo = record.memo?.trim() || undefined;
    const importedCategoryName = record.category?.trim() || undefined;
    const transferAccountName = extractQifTransferAccountName(
      importedCategoryName,
    );

    transactions.push({
      rowNumber,
      date: parseQifDateValue(record.date ?? "", dateFormat),
      payee,
      memo,
      importedCategoryName,
      transferAccountName,
      outflow: amount < 0 ? Math.abs(amount) : 0,
      inflow: amount > 0 ? Math.abs(amount) : 0,
      raw: { ...record },
    });

    record = {};
  }

  for (const rawLine of qifText.split(/\r?\n/)) {
    const line = rawLine.trim();
    rowNumber += 1;

    if (!line || line.startsWith("!")) {
      continue;
    }

    if (line === "^") {
      commitRecord();
      continue;
    }

    const code = line[0];
    const value = line.slice(1).trim();

    switch (code) {
      case "D":
        record.date = value;
        break;
      case "T":
      case "U":
        record.amount = value;
        break;
      case "P":
        record.payee = value;
        break;
      case "M":
        record.memo = value;
        break;
      case "L":
        record.category = value;
        break;
      case "N":
        record.number = value;
        break;
      case "C":
        record.cleared = value;
        break;
      default:
        record[`qif_${code}`] = value;
        break;
    }
  }

  commitRecord();

  return transactions;
}


/**
 * QIF represents account transfers in the category field using square
 * brackets, for example `L[Savings]`. Keep this interpretation deliberately
 * narrow: ordinary category names must never be guessed to be transfers.
 */
export function extractQifTransferAccountName(
  category: string | undefined,
): string | undefined {
  if (!category) {
    return undefined;
  }

  const match = category.trim().match(/^\[([^\]]+)\]$/);
  const accountName = match?.[1]?.trim();
  return accountName || undefined;
}

function readRole(
  row: string[],
  mapping: CsvImportColumnMapping,
  role: CsvImportColumnRole,
): string {
  const entry = Object.entries(mapping).find(
    ([, mappedRole]) => mappedRole === role,
  );
  if (!entry) {
    return "";
  }

  return row[Number(entry[0])] ?? "";
}

function readImportPayee(
  row: string[],
  mapping: CsvImportColumnMapping,
  memoValue: string,
): string {
  const primaryPayee = readRole(row, mapping, "payee").trim();
  if (primaryPayee) {
    return primaryPayee;
  }

  const explicitFallback = readRole(row, mapping, "payeeFallback").trim();
  if (explicitFallback) {
    return explicitFallback;
  }

  return memoValue.trim();
}

function readMappedImportAmount(
  row: string[],
  mapping: CsvImportColumnMapping,
): { outflow: number; inflow: number } {
  const explicitOutflow = parseMoney(readRole(row, mapping, "outflow"));
  const explicitInflow = parseMoney(readRole(row, mapping, "inflow"));

  if (explicitOutflow > 0 || explicitInflow > 0) {
    return {
      outflow: Math.abs(explicitOutflow),
      inflow: Math.abs(explicitInflow),
    };
  }

  const amount = parseMoney(readRole(row, mapping, "amount"));

  if (amount < 0) {
    return { outflow: Math.abs(amount), inflow: 0 };
  }

  return { outflow: 0, inflow: Math.abs(amount) };
}

function createTransactionImportLifecycle(
  parsed: ParsedImportTransaction,
  resolveMerchant?: TransactionImportMerchantResolver,
  aliases: TransactionPayeeAlias[] = [],
): TransactionImportLifecycle {
  const rawPayee = parsed.payee;
  const alias = findMatchingTransactionPayeeAlias(rawPayee, aliases);
  const merchantInputPayee = alias?.targetPayee ?? rawPayee;
  const rawResolution = resolveMerchant?.(merchantInputPayee);
  const resolution =
    typeof rawResolution === "string"
      ? { canonicalPayee: rawResolution }
      : rawResolution;
  const transferAccountName =
    resolution?.transferAccountName?.trim() ||
    parsed.transferAccountName?.trim() ||
    null;
  const canonicalPayee =
    resolution?.canonicalPayee?.trim() ||
    (transferAccountName
      ? `Transfer: ${transferAccountName}`
      : merchantInputPayee.trim());

  return {
    source: {
      rowNumber: parsed.rowNumber,
      date: parsed.date,
      rawPayee,
      memo: parsed.memo,
      importedCategoryName: parsed.importedCategoryName,
      transferAccountName: parsed.transferAccountName,
      outflow: parsed.outflow,
      inflow: parsed.inflow,
    },
    merchant: {
      ...resolution,
      canonicalPayee,
      suggestedCategoryName:
        resolution?.suggestedCategoryName?.trim() || null,
      transferAccountName,
      aliasId: alias?.id ?? resolution?.aliasId,
      aliasSourcePayee:
        alias ? rawPayee : resolution?.aliasSourcePayee,
    },
    proposal: {
      payee: canonicalPayee,
      categoryName:
        transferAccountName
          ? null
          : resolution?.suggestedCategoryName?.trim() ||
            parsed.importedCategoryName?.trim() ||
            null,
      transferAccountName,
    },
  };
}

function downgradeUnresolvedExternalTransfer(
  lifecycle: TransactionImportLifecycle,
  parsed: ParsedImportTransaction,
) {
  lifecycle.merchant.transferAccountName = null;
  lifecycle.proposal.transferAccountName = null;

  // Once the destination is known to be outside this budget, the transaction
  // must no longer carry any synthetic or learned internal-transfer payee.
  // Keeping a value beginning with `Transfer: ` causes commit verification to
  // reinterpret the ordinary transaction as an invalid internal transfer.
  const fallbackPayee = parsed.payee.trim();
  lifecycle.merchant.canonicalPayee = fallbackPayee;
  lifecycle.proposal.payee = fallbackPayee;
}

function classifyImportCandidate(
  parsed: ParsedImportTransaction,
  existingTransactions: RegisterTransactionView[],
  excludedTransactionIds: ReadonlySet<string> = new Set(),
  resolveMerchant?: TransactionImportMerchantResolver,
  aliases: TransactionPayeeAlias[] = [],
  reconciliationContext: {
    transferAccounts?: readonly TransactionImportTransferAccount[];
  } = {},
): TransactionImportCandidate {
  const sourceTrace: TransactionImportTraceEntry = {
    stage: "source",
    timestamp: new Date().toISOString(),
    input: { rowNumber: parsed.rowNumber },
    output: {
      date: parsed.date,
      payee: parsed.payee,
      inflow: parsed.inflow,
      outflow: parsed.outflow,
      importedCategoryName: parsed.importedCategoryName ?? null,
      transferAccountName: parsed.transferAccountName ?? null,
    },
  };
  const validationStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const errors = validateParsedImportTransaction(parsed);
  const validationDurationMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    validationStartedAt;

  if (errors.length > 0) {
    return {
      id: `row-${parsed.rowNumber}`,
      parsed,
      status: "invalid",
      reason: errors.join(" "),
      selected: false,
      errors,
      lifecycle: createTransactionImportLifecycle(parsed, resolveMerchant, aliases),
      reconciliationKind: "new",
      trace: [
        sourceTrace,
        {
          stage: "validation",
          timestamp: new Date().toISOString(),
          durationMs: validationDurationMs,
          output: { valid: false, errors },
        },
      ],
    };
  }

  const merchantStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const lifecycle = createTransactionImportLifecycle(parsed, resolveMerchant, aliases);
  const merchantDurationMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - merchantStartedAt;
  const reconciliationStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const assessment = reconcileTransactionImportCandidate({
    parsed,
    existingTransactions,
    excludedTransactionIds,
    merchantResolution: lifecycle.merchant,
    transferAccounts: reconciliationContext.transferAccounts,
  });
  if (assessment.transfer?.status === "missing") {
    downgradeUnresolvedExternalTransfer(lifecycle, parsed);
  }
  const reconciliationDurationMs =
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    reconciliationStartedAt;
  const selectedCandidate = assessment.selectedCandidate;

  return {
    id: `row-${parsed.rowNumber}`,
    parsed,
    status: assessment.status,
    matchedTransactionId:
      assessment.status === "new" ? undefined : selectedCandidate?.transaction.id,
    matchedTransaction:
      assessment.status === "new" ? undefined : selectedCandidate?.transaction,
    reason: assessment.reason,
    evidence: assessment.evidence,
    matchCandidates: assessment.candidates,
    selected: assessment.recommendation === "import",
    errors: [],
    lifecycle,
    reconciliationKind: assessment.kind,
    transferResolution: assessment.transfer,
    trace: [
      sourceTrace,
      {
        stage: "validation",
        timestamp: new Date().toISOString(),
        durationMs: validationDurationMs,
        output: { valid: true, errors: [] },
      },
      {
        stage: "merchant-resolution",
        timestamp: new Date().toISOString(),
        durationMs: merchantDurationMs,
        input: { rawPayee: lifecycle.source.rawPayee },
        output: {
          canonicalPayee: lifecycle.merchant.canonicalPayee,
          suggestedCategoryName: lifecycle.merchant.suggestedCategoryName,
          transferAccountName: lifecycle.merchant.transferAccountName,
          aliasId: lifecycle.merchant.aliasId ?? null,
        },
      },
      {
        stage: "reconciliation",
        timestamp: new Date().toISOString(),
        durationMs: reconciliationDurationMs,
        output: {
          kind: assessment.kind,
          status: assessment.status,
          candidateCount: assessment.candidates.length,
          selectedTransactionId: assessment.selectedCandidate?.transaction.id ?? null,
          reason: assessment.reason,
          evidence: assessment.evidence ?? [],
        },
      },
      {
        stage: "proposal",
        timestamp: new Date().toISOString(),
        output: { ...lifecycle.proposal },
      },
    ],
  };
}

function parseMoney(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, "");

  if (/^\(.*\)$/.test(cleaned)) {
    const parsed = Number.parseFloat(cleaned.slice(1, -1));
    return Number.isFinite(parsed) ? -parsed : 0;
  }

  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normaliseImportDate(value: string): string {
  const trimmed = value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/'(\d{2})$/, "/$1");

  if (!trimmed) {
    return "";
  }

  const withoutTime = trimmed.split(/\s+/)[0];

  if (/^\d{4}-\d{2}-\d{2}$/.test(withoutTime)) {
    return withoutTime;
  }

  if (/^\d{8}$/.test(withoutTime)) {
    const yearFirst = normaliseDateParts(
      withoutTime.slice(6, 8),
      withoutTime.slice(4, 6),
      withoutTime.slice(0, 4),
    );
    if (yearFirst) {
      return yearFirst;
    }

    return normaliseDateParts(
      withoutTime.slice(0, 2),
      withoutTime.slice(2, 4),
      withoutTime.slice(4, 8),
    );
  }

  const delimitedParts = withoutTime.split(/[\/\-.]/).filter(Boolean);

  if (delimitedParts.length === 3) {
    const [first, second, third] = delimitedParts;

    if (first.length === 4) {
      return normaliseDateParts(third, second, first);
    }

    const year = normaliseYear(third);
    return normaliseDateParts(first, second, year);
  }

  const monthNameMatch = trimmed.match(
    /^(\d{1,2})[\s\/-]([A-Za-z]{3,9})[\s\/-](\d{2,4})(?:\s|$)/,
  );
  if (monthNameMatch) {
    const [, day, monthName, year] = monthNameMatch;
    return normaliseDateParts(
      day,
      String(monthNumberFromName(monthName)),
      normaliseYear(year),
    );
  }

  const monthFirstNameMatch = trimmed.match(
    /^([A-Za-z]{3,9})[\s\/-](\d{1,2})(?:,)?[\s\/-](\d{2,4})(?:\s|$)/,
  );
  if (monthFirstNameMatch) {
    const [, monthName, day, year] = monthFirstNameMatch;
    return normaliseDateParts(
      day,
      String(monthNumberFromName(monthName)),
      normaliseYear(year),
    );
  }

  return "";
}

function normaliseYear(value: string): string {
  const cleaned = value.replace(/^'/, "");

  if (cleaned.length === 2) {
    return `20${cleaned}`;
  }

  return cleaned;
}

function monthNumberFromName(value: string): number {
  const month = value.trim().slice(0, 3).toLowerCase();
  return (
    [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(month) + 1
  );
}

function normaliseDateParts(day: string, month: string, year: string): string {
  const numericDay = Number.parseInt(day, 10);
  const numericMonth = Number.parseInt(month, 10);
  const numericYear = Number.parseInt(year, 10);
  const date = new Date(numericYear, numericMonth - 1, numericDay);

  if (
    !Number.isFinite(numericDay) ||
    !Number.isFinite(numericMonth) ||
    !Number.isFinite(numericYear) ||
    date.getFullYear() !== numericYear ||
    date.getMonth() !== numericMonth - 1 ||
    date.getDate() !== numericDay
  ) {
    return "";
  }

  return [
    String(numericYear).padStart(4, "0"),
    String(numericMonth).padStart(2, "0"),
    String(numericDay).padStart(2, "0"),
  ].join("-");
}

function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, "");
}

function normalisePayee(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function getCsvImportSignature(analysis: CsvImportAnalysis): string {
  return analysis.columns
    .map((column) => column.normalisedHeader || `column-${column.index + 1}`)
    .join("|");
}

export function findMatchingTransactionImportProfile(
  profiles: TransactionImportProfile[],
  analysis: CsvImportAnalysis,
): TransactionImportProfile | undefined {
  const signature = getCsvImportSignature(analysis);
  return profiles.find(
    (profile) =>
      profile.parserType === "csv" && profile.signature === signature,
  );
}

export function createTransactionImportProfile({
  name,
  analysis,
  mapping,
  defaultAccountName,
}: {
  name: string;
  analysis: CsvImportAnalysis;
  mapping: CsvImportColumnMapping;
  defaultAccountName?: string;
}): TransactionImportProfile {
  const now = new Date().toISOString();

  return {
    id: `csv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "CSV Import Profile",
    parserType: "csv",
    signature: getCsvImportSignature(analysis),
    mapping,
    defaultAccountName,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertTransactionImportProfile(
  profiles: TransactionImportProfile[],
  profile: TransactionImportProfile,
): TransactionImportProfile[] {
  const existingIndex = profiles.findIndex(
    (existing) =>
      existing.parserType === profile.parserType &&
      existing.signature === profile.signature,
  );

  if (existingIndex === -1) {
    return [...profiles, profile];
  }

  return profiles.map((existing, index) =>
    index === existingIndex
      ? {
          ...existing,
          name: profile.name,
          mapping: profile.mapping,
          defaultAccountName: profile.defaultAccountName,
          updatedAt: profile.updatedAt,
        }
      : existing,
  );
}


export function normalisePayeeAliasSource(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalisePayeeAliasTarget(value: string): string {
  return normalisePayeeAliasSource(value);
}

export function createTransactionPayeeAlias({
  sourcePayee,
  targetPayee,
}: {
  sourcePayee: string;
  targetPayee: string;
}): TransactionPayeeAlias {
  const now = new Date().toISOString();

  return {
    id: `payee-alias-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourcePayee: sourcePayee.trim(),
    targetPayee: targetPayee.trim(),
    normalisedSource: normalisePayeeAliasSource(sourcePayee),
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertTransactionPayeeAlias(
  aliases: TransactionPayeeAlias[],
  alias: TransactionPayeeAlias,
): TransactionPayeeAlias[] {
  const existingIndex = aliases.findIndex(
    (existing) => existing.normalisedSource === alias.normalisedSource,
  );

  if (existingIndex === -1) {
    return [...aliases, alias];
  }

  return aliases.map((existing, index) =>
    index === existingIndex
      ? {
          ...existing,
          sourcePayee: alias.sourcePayee,
          targetPayee: alias.targetPayee,
          updatedAt: alias.updatedAt,
        }
      : existing,
  );
}

export function findMatchingTransactionPayeeAlias(
  payee: string,
  aliases: TransactionPayeeAlias[],
): TransactionPayeeAlias | undefined {
  const normalisedPayee = normalisePayeeAliasSource(payee);

  if (!normalisedPayee) {
    return undefined;
  }

  // Learned aliases are identities, not fuzzy search terms. A broad
  // bidirectional substring match can turn a person's name into an unrelated
  // merchant and is never safe for an automatic import decision.
  return aliases.find((alias) => normalisedPayee === alias.normalisedSource);
}

export function resolveTransactionPayeeAlias(
  transaction: ParsedImportTransaction,
  aliases: TransactionPayeeAlias[],
): TransactionPayeeAlias | undefined {
  return findMatchingTransactionPayeeAlias(transaction.payee, aliases);
}


export function suggestTransactionPayeeAliases({
  candidates,
  existingTransactions,
  aliases,
}: {
  candidates: TransactionImportCandidate[];
  existingTransactions: RegisterTransactionView[];
  aliases: TransactionPayeeAlias[];
}): TransactionPayeeAliasSuggestion[] {
  const existingAliasSources = new Set(
    aliases.map((alias) => alias.normalisedSource).filter(Boolean),
  );
  const knownPayees = [...existingTransactions]
    .map((transaction) => transaction.payee.trim())
    .filter(Boolean);

  const knownPayeeByNormalised = new Map<string, string>();
  for (const payee of knownPayees) {
    const normalised = normalisePayeeAliasTarget(payee);
    if (normalised && !knownPayeeByNormalised.has(normalised)) {
      knownPayeeByNormalised.set(normalised, payee);
    }
  }

  const grouped = new Map<
    string,
    { sourcePayee: string; targetPayee: string; occurrenceCount: number }
  >();

  for (const candidate of candidates) {
    const sourcePayee = candidate.lifecycle.source.rawPayee;
    const normalisedSource = normalisePayeeAliasSource(sourcePayee);

    if (!normalisedSource || existingAliasSources.has(normalisedSource)) {
      continue;
    }

    const currentTarget = normalisePayeeAliasTarget(candidate.parsed.payee);
    const directKnownPayee = knownPayeeByNormalised.get(normalisedSource);
    const matchedKnownPayee = candidate.matchedTransaction?.payee.trim();
    const matchedTarget = matchedKnownPayee
      ? normalisePayeeAliasTarget(matchedKnownPayee)
      : "";

    const targetPayee =
      directKnownPayee ??
      (matchedKnownPayee && matchedTarget === normalisedSource
        ? matchedKnownPayee
        : undefined);

    if (!targetPayee) {
      continue;
    }

    if (sourcePayee.trim().toLowerCase() === targetPayee.trim().toLowerCase()) {
      continue;
    }

    if (currentTarget && currentTarget !== normalisedSource) {
      continue;
    }

    const existing = grouped.get(normalisedSource);
    if (existing) {
      existing.occurrenceCount += 1;
    } else {
      grouped.set(normalisedSource, {
        sourcePayee,
        targetPayee,
        occurrenceCount: 1,
      });
    }
  }

  return [...grouped.entries()].map(([normalisedSource, suggestion]) => ({
    id: `payee-alias-suggestion-${normalisedSource.replace(/[^a-z0-9]+/g, "-")}`,
    sourcePayee: suggestion.sourcePayee,
    suggestedTargetPayee: suggestion.targetPayee,
    normalisedSource,
    occurrenceCount: suggestion.occurrenceCount,
    reason:
      suggestion.occurrenceCount > 1
        ? `Found ${suggestion.occurrenceCount} imported rows that look like ${suggestion.targetPayee}.`
        : `This imported merchant looks like existing payee ${suggestion.targetPayee}.`,
  }));
}

export function readTransactionPayeeAliases(): TransactionPayeeAlias[] {
  try {
    return readTransactionPayeeAliasEntities(
      createBudgetScopedStorage(getActiveKeyValueStorage()),
    );
  } catch {
    return [];
  }
}

export function writeTransactionPayeeAliases(
  aliases: TransactionPayeeAlias[],
): void {
  try {
    replaceTransactionPayeeAliasEntities(
      createBudgetScopedStorage(getActiveKeyValueStorage()),
      aliases,
    );
  } catch {
    // Importing must remain usable when persistence is unavailable.
  }
}

export function readTransactionImportProfiles(): TransactionImportProfile[] {
  try {
    return readTransactionImportProfileEntities(
      createBudgetScopedStorage(getActiveKeyValueStorage()),
    );
  } catch {
    return [];
  }
}

export function writeTransactionImportProfiles(
  profiles: TransactionImportProfile[],
): void {
  try {
    replaceTransactionImportProfileEntities(
      createBudgetScopedStorage(getActiveKeyValueStorage()),
      profiles,
    );
  } catch {
    // Importing must remain usable when persistence is unavailable.
  }
}
