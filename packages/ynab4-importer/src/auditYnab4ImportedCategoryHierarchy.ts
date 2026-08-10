import { discoverYnab4Package, type Ynab4PackageEntry } from "./analyzeYnab4Package.js";

export type Ynab4ImportedCategoryHierarchySeverity = "info" | "warning" | "blocker";
export type Ynab4ImportedCategoryHierarchyFindingId =
  | "package.discovery-failed"
  | "package.active-data"
  | "backup.invalid-json"
  | "backup.records-missing"
  | "backup.budget-views-missing"
  | "categories.subcategory-promoted-to-empty-group"
  | "categories.hidden-source-group-visible"
  | "categories.duplicate-empty-group-in-month"
  | "categories.source-group-name-duplicated";

export type Ynab4ImportedCategoryHierarchyFinding = {
  id: Ynab4ImportedCategoryHierarchyFindingId;
  severity: Ynab4ImportedCategoryHierarchySeverity;
  message: string;
  sourceEntityId?: string;
  details?: Record<string, unknown>;
};

export type Ynab4ImportedCategoryHierarchyAudit = {
  title: "YNAB4 Imported Category Hierarchy Audit";
  canTrustImportedCategoryHierarchy: boolean;
  summary: {
    sourceCategoryGroups: number;
    sourceCategories: number;
    sourceHiddenGroups: number;
    importedBudgetMonths: number;
    importedUniqueGroupNames: number;
    promotedSubcategoryGroups: number;
    visibleHiddenSourceGroups: number;
    duplicateEmptyGroupNames: number;
    blockers: number;
    warnings: number;
  };
  findings: Ynab4ImportedCategoryHierarchyFinding[];
  blockers: Ynab4ImportedCategoryHierarchyFinding[];
  warnings: Ynab4ImportedCategoryHierarchyFinding[];
};

type Ynab4PackageMetadata = { relativeDataFolderName?: unknown };

type SourceCategoryGroup = {
  sourceId: string;
  name: string;
  isHidden: boolean;
  categoryNames: Set<string>;
};

type SourceCategory = {
  sourceId: string;
  name: string;
  groupSourceId: string;
  groupName: string;
  isHidden: boolean;
};

type ImportedGroupObservation = {
  monthKey: string;
  groupId: string | null;
  groupName: string;
  childCount: number;
};

export function auditYnab4ImportedCategoryHierarchy(
  sourceEntries: Ynab4PackageEntry[],
  importedBackupJson: string,
): Ynab4ImportedCategoryHierarchyAudit {
  const findings: Ynab4ImportedCategoryHierarchyFinding[] = [];
  const discovery = discoverYnab4Package(sourceEntries);

  if (!discovery.isYnab4Package) {
    for (const warning of discovery.warnings) {
      findings.push({
        id: "package.discovery-failed",
        severity: "blocker",
        message: warning,
      });
    }
    return buildAudit(emptySummary(), findings);
  }

  const { data, warnings } = readActiveBudgetData(sourceEntries);
  for (const warning of warnings) {
    findings.push({ id: "package.active-data", severity: "blocker", message: warning });
  }
  if (!data) return buildAudit(emptySummary(), findings);

  const backup = parseBackup(importedBackupJson, findings);
  if (!backup) return buildAudit(emptySummary(), findings);

  const source = readSourceHierarchy(data);
  const importedGroups = readImportedBudgetViewGroups(backup, findings);

  auditSourceDuplicateGroupNames(source.groups, findings);
  auditSubcategoriesPromotedToEmptyGroups(source.categories, importedGroups, findings);
  auditHiddenSourceGroupsVisible(source.groups, importedGroups, findings);
  auditDuplicateEmptyGroups(importedGroups, findings);

  const promotedSubcategoryGroups = new Set(
    findings
      .filter((finding) => finding.id === "categories.subcategory-promoted-to-empty-group")
      .map((finding) => String(finding.details?.categoryName ?? ""))
      .filter(Boolean),
  ).size;
  const visibleHiddenSourceGroups = new Set(
    findings
      .filter((finding) => finding.id === "categories.hidden-source-group-visible")
      .map((finding) => String(finding.details?.groupName ?? ""))
      .filter(Boolean),
  ).size;
  const duplicateEmptyGroupNames = new Set(
    findings
      .filter((finding) => finding.id === "categories.duplicate-empty-group-in-month")
      .map((finding) => String(finding.details?.groupName ?? ""))
      .filter(Boolean),
  ).size;

  return buildAudit(
    {
      sourceCategoryGroups: source.groups.length,
      sourceCategories: source.categories.length,
      sourceHiddenGroups: source.groups.filter((group) => group.isHidden).length,
      importedBudgetMonths: new Set(importedGroups.map((group) => group.monthKey)).size,
      importedUniqueGroupNames: new Set(importedGroups.map((group) => group.groupName)).size,
      promotedSubcategoryGroups,
      visibleHiddenSourceGroups,
      duplicateEmptyGroupNames,
      blockers: 0,
      warnings: 0,
    },
    findings,
  );
}

function auditSourceDuplicateGroupNames(
  groups: SourceCategoryGroup[],
  findings: Ynab4ImportedCategoryHierarchyFinding[],
): void {
  const byName = new Map<string, SourceCategoryGroup[]>();
  for (const group of groups) {
    const existing = byName.get(group.name) ?? [];
    existing.push(group);
    byName.set(group.name, existing);
  }

  for (const [name, matches] of byName.entries()) {
    if (matches.length <= 1) continue;
    findings.push({
      id: "categories.source-group-name-duplicated",
      severity: "warning",
      message: `YNAB4 source contains ${matches.length} category group records named ${name}. Import must preserve hidden/tombstone state and must not render all of them as visible headers.`,
      details: {
        groupName: name,
        sourceIds: matches.map((match) => match.sourceId),
        hiddenCount: matches.filter((match) => match.isHidden).length,
      },
    });
  }
}

function auditSubcategoriesPromotedToEmptyGroups(
  categories: SourceCategory[],
  importedGroups: ImportedGroupObservation[],
  findings: Ynab4ImportedCategoryHierarchyFinding[],
): void {
  const emptyImportedGroupNames = new Set(
    importedGroups.filter((group) => group.childCount === 0).map((group) => group.groupName),
  );

  const sourceGroupNames = new Set(categories.map((category) => category.groupName));
  const reported = new Set<string>();

  for (const category of categories) {
    if (category.isHidden) continue;
    if (sourceGroupNames.has(category.name)) continue;
    if (!emptyImportedGroupNames.has(category.name)) continue;
    if (reported.has(category.name)) continue;

    const observations = importedGroups.filter(
      (group) => group.groupName === category.name && group.childCount === 0,
    );
    findings.push({
      id: "categories.subcategory-promoted-to-empty-group",
      severity: "blocker",
      message: `YNAB4 subcategory ${category.groupName} → ${category.name} appears in the imported budget as an empty category header/group named ${category.name}.`,
      sourceEntityId: category.sourceId,
      details: {
        groupName: category.groupName,
        categoryName: category.name,
        importedMonthCount: new Set(observations.map((observation) => observation.monthKey)).size,
      },
    });
    reported.add(category.name);
  }
}

function auditHiddenSourceGroupsVisible(
  groups: SourceCategoryGroup[],
  importedGroups: ImportedGroupObservation[],
  findings: Ynab4ImportedCategoryHierarchyFinding[],
): void {
  const importedGroupNames = new Set(importedGroups.map((group) => group.groupName));
  const reported = new Set<string>();

  for (const group of groups) {
    if (!group.isHidden) continue;
    if (!importedGroupNames.has(group.name)) continue;
    if (reported.has(group.name)) continue;

    const observations = importedGroups.filter((imported) => imported.groupName === group.name);
    findings.push({
      id: "categories.hidden-source-group-visible",
      severity: "blocker",
      message: `Hidden/tombstoned YNAB4 category group ${group.name} appears as a visible imported category header/group.`,
      sourceEntityId: group.sourceId,
      details: {
        groupName: group.name,
        importedMonthCount: new Set(observations.map((observation) => observation.monthKey)).size,
        sourceChildCount: group.categoryNames.size,
      },
    });
    reported.add(group.name);
  }
}

function auditDuplicateEmptyGroups(
  importedGroups: ImportedGroupObservation[],
  findings: Ynab4ImportedCategoryHierarchyFinding[],
): void {
  const byMonthAndName = new Map<string, ImportedGroupObservation[]>();
  for (const group of importedGroups) {
    if (group.childCount !== 0) continue;
    const key = `${group.monthKey}\u0000${group.groupName}`;
    const existing = byMonthAndName.get(key) ?? [];
    existing.push(group);
    byMonthAndName.set(key, existing);
  }

  const reported = new Set<string>();
  for (const [key, matches] of byMonthAndName.entries()) {
    if (matches.length <= 1) continue;
    const [, groupName] = key.split("\u0000");
    if (reported.has(groupName)) continue;

    const affectedMonths = [...new Set(
      [...byMonthAndName.entries()]
        .filter(([entryKey, entryMatches]) => entryKey.endsWith(`\u0000${groupName}`) && entryMatches.length > 1)
        .map(([, entryMatches]) => entryMatches[0]?.monthKey)
        .filter((monthKey): monthKey is string => Boolean(monthKey)),
    )];

    findings.push({
      id: "categories.duplicate-empty-group-in-month",
      severity: "blocker",
      message: `Imported budget contains duplicate empty category headers/groups named ${groupName}.`,
      details: {
        groupName,
        duplicateCountInFirstAffectedMonth: matches.length,
        affectedMonthCount: affectedMonths.length,
        firstAffectedMonth: affectedMonths[0] ?? matches[0]?.monthKey,
      },
    });
    reported.add(groupName);
  }
}

function readSourceHierarchy(data: Record<string, unknown>): { groups: SourceCategoryGroup[]; categories: SourceCategory[] } {
  const groups: SourceCategoryGroup[] = [];
  const categories: SourceCategory[] = [];

  for (const [groupIndex, group] of toRecords(data.masterCategories).entries()) {
    const groupSourceId = firstString(group.entityId, group.id, group.masterCategoryId) ?? `categoryGroup:${groupIndex}`;
    const groupName = firstString(group.name, group.masterCategoryName, group.displayName) ?? `Imported Group ${groupIndex + 1}`;
    const subCategories = toRecords(group.subCategories);
    const isGroupHidden = isHiddenOrDeleted(group);
    const sourceGroup: SourceCategoryGroup = {
      sourceId: groupSourceId,
      name: groupName,
      isHidden: isGroupHidden,
      categoryNames: new Set(),
    };

    for (const [categoryIndex, category] of subCategories.entries()) {
      const categorySourceId = firstString(category.entityId, category.id, category.categoryId) ?? `category:${groupIndex}:${categoryIndex}`;
      const categoryName = firstString(category.name, category.categoryName, category.displayName) ?? `Imported Category ${categoryIndex + 1}`;
      sourceGroup.categoryNames.add(categoryName);
      categories.push({
        sourceId: categorySourceId,
        name: categoryName,
        groupSourceId,
        groupName,
        isHidden: isGroupHidden || isHiddenOrDeleted(category),
      });
    }

    groups.push(sourceGroup);
  }

  return { groups, categories };
}

function readImportedBudgetViewGroups(
  backup: Record<string, unknown>,
  findings: Ynab4ImportedCategoryHierarchyFinding[],
): ImportedGroupObservation[] {
  const records = Array.isArray(backup.records) ? backup.records : null;
  if (!records) {
    findings.push({
      id: "backup.records-missing",
      severity: "blocker",
      message: "Imported backup does not contain a records array.",
    });
    return [];
  }

  const observations: ImportedGroupObservation[] = [];
  for (const record of records) {
    if (!isRecord(record)) continue;
    const key = firstString(record.key) ?? "";
    if (!key.includes("budget-app.budget-view.v1.")) continue;
    const value = firstString(record.value);
    if (!value) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;

    const monthKey = inferMonthFromBudgetViewKey(key) ?? firstString(parsed.month, parsed.monthKey, parsed.monthLabel) ?? key;
    for (const group of toRecords(parsed.categoryGroups)) {
      observations.push({
        monthKey,
        groupId: firstString(group.id),
        groupName: firstString(group.name) ?? "",
        childCount: toRecords(group.categories).length,
      });
    }
  }

  if (observations.length === 0) {
    findings.push({
      id: "backup.budget-views-missing",
      severity: "blocker",
      message: "Imported backup contains no budget view category groups to audit.",
    });
  }

  return observations.filter((observation) => observation.groupName.trim().length > 0);
}

function parseBackup(
  importedBackupJson: string,
  findings: Ynab4ImportedCategoryHierarchyFinding[],
): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(importedBackupJson);
    if (isRecord(parsed)) return parsed;
  } catch {
    // handled below
  }

  findings.push({
    id: "backup.invalid-json",
    severity: "blocker",
    message: "Imported backup JSON could not be parsed.",
  });
  return null;
}

function buildAudit(
  summary: Ynab4ImportedCategoryHierarchyAudit["summary"],
  findings: Ynab4ImportedCategoryHierarchyFinding[],
): Ynab4ImportedCategoryHierarchyAudit {
  const blockers = findings.filter((finding) => finding.severity === "blocker");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  return {
    title: "YNAB4 Imported Category Hierarchy Audit",
    canTrustImportedCategoryHierarchy: blockers.length === 0,
    summary: {
      ...summary,
      blockers: blockers.length,
      warnings: warnings.length,
    },
    findings,
    blockers,
    warnings,
  };
}

function emptySummary(): Ynab4ImportedCategoryHierarchyAudit["summary"] {
  return {
    sourceCategoryGroups: 0,
    sourceCategories: 0,
    sourceHiddenGroups: 0,
    importedBudgetMonths: 0,
    importedUniqueGroupNames: 0,
    promotedSubcategoryGroups: 0,
    visibleHiddenSourceGroups: 0,
    duplicateEmptyGroupNames: 0,
    blockers: 0,
    warnings: 0,
  };
}

function readActiveBudgetData(entries: Ynab4PackageEntry[]): { data: Record<string, unknown> | null; warnings: string[] } {
  const normalisedEntries = entries.map((entry) => ({ path: normalisePath(entry.path), text: entry.text, parsedData: entry.parsedData }));
  const metadataEntry = normalisedEntries.find((entry) => entry.path.endsWith("/Budget.ymeta") || entry.path === "Budget.ymeta");
  if (!metadataEntry) return { data: null, warnings: ["Budget.ymeta was not found."] };

  let metadata: Ynab4PackageMetadata;
  try {
    metadata = JSON.parse(metadataEntry.text) as Ynab4PackageMetadata;
  } catch {
    return { data: null, warnings: ["Budget.ymeta is not valid JSON."] };
  }

  const relativeDataFolderName = typeof metadata.relativeDataFolderName === "string" ? metadata.relativeDataFolderName : null;
  if (!relativeDataFolderName) return { data: null, warnings: ["Budget.ymeta does not contain a relativeDataFolderName value."] };

  const packageRoot = inferPackageRoot(metadataEntry.path);
  const activeDataFolderPath = packageRoot ? `${packageRoot}/${relativeDataFolderName}` : relativeDataFolderName;
  const activePrefix = `${activeDataFolderPath}/`;
  const budgetDataEntry = normalisedEntries
    .filter((entry) => entry.path.startsWith(activePrefix))
    .find((entry) => entry.path.endsWith("/Budget.yfull") || entry.path.endsWith("/Budget.json"));

  if (!budgetDataEntry) return { data: null, warnings: [`No Budget.yfull or Budget.json file was found under ${activeDataFolderPath}.`] };

  try {
    const parsed = budgetDataEntry.parsedData ?? JSON.parse(budgetDataEntry.text ?? "");
    return isRecord(parsed) ? { data: parsed, warnings: [] } : { data: null, warnings: ["The active YNAB4 budget data root is not an object."] };
  } catch {
    return { data: null, warnings: ["The active YNAB4 budget data file is not valid JSON."] };
  }
}

function inferMonthFromBudgetViewKey(key: string): string | null {
  const match = key.match(/(\d{4}-\d{2})$/);
  return match?.[1] ?? null;
}

function isHiddenOrDeleted(row: Record<string, unknown>): boolean {
  return row.isTombstone === true || row.deleted === true || row.hidden === true || row.isHidden === true;
}

function toRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalisePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function inferPackageRoot(metadataPath: string): string | null {
  const normalised = normalisePath(metadataPath);
  const marker = "/Budget.ymeta";
  if (normalised.endsWith(marker)) return normalised.slice(0, -marker.length);
  return null;
}
