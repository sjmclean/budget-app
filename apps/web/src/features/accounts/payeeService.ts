import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import { createPayeeEntityRepository, projectPayee, replacePayeeEntities } from "./entities/payeeEntity.js";
import { mergePayeeIconReferences, validatePayeeIconReferenceForWrite } from "../icons/payeeIconReference.js";

export type PayeeRuleMatchType = "equals" | "contains" | "startsWith" | "endsWith";

export interface PayeeImportRuleView {
  id: string;
  matchType: PayeeRuleMatchType;
  text: string;
  defaultCategoryId?: string;
  defaultCategoryName?: string;
  priority?: number;
  enabled?: boolean;
}

export interface PayeeAliasView { id: string; value: string; }

export interface PayeeView {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
  note?: string;
  defaultCategoryId?: string;
  defaultCategoryName?: string;
  importRules?: PayeeImportRuleView[];
  aliases?: PayeeAliasView[];
  scheduledUseCount?: number;
  iconRef?: string;
  isArchived?: boolean;
}

export interface UpdatePayeeInput {
  id: string;
  name: string;
  note: string;
  defaultCategoryId?: string;
  defaultCategoryName?: string;
  importRules?: PayeeImportRuleView[];
  aliases?: PayeeAliasView[];
  iconUpdate?: { readonly kind: "set"; readonly iconRef: string } | { readonly kind: "automatic" };
}

export interface RenamePayeeInput {
  id: string;
  name: string;
}

export interface MergePayeesInput {
  sourcePayeeId: string;
  sourcePayeeIds?: readonly string[];
  targetPayeeId: string;
  updateLinkedTransactions?: boolean;
  updateScheduledTransactions?: boolean;
  addMergedAliases?: boolean;
  redirectRecognitionRules?: boolean;
}

export interface PayeeServiceDependencies {
  storage: KeyValueStoragePort;
}


class BrowserPersistentPayeeService {
  constructor(private readonly dependencies: PayeeServiceDependencies) {}

  async listPayees(): Promise<PayeeView[]> {
    return sortPayees(readPayees(this.dependencies.storage).filter((payee) => !payee.isArchived));
  }

  async recordPayee(name: string): Promise<PayeeView[]> {
    const trimmed = normalisePayeeName(name);

    if (!trimmed || isTransferPayee(trimmed)) {
      return sortPayees(readPayees(this.dependencies.storage).filter((payee) => !payee.isArchived));
    }

    const payees = readPayees(this.dependencies.storage);
    const existing = payees.find((payee) => samePayee(payee.name, trimmed));
    const now = new Date().toISOString();

    const nextPayees = existing
      ? payees.map((payee) =>
          payee.id === existing.id
            ? {
                ...payee,
                name: payee.name || trimmed,
                lastUsedAt: now,
                useCount: payee.useCount + 1,
                isArchived: false,
              }
            : payee,
        )
      : [
          ...payees,
          {
            id: createPayeeId(trimmed, payees),
            name: trimmed,
            createdAt: now,
            lastUsedAt: now,
            useCount: 1,
            isArchived: false,
          },
        ];

    writePayees(this.dependencies.storage, nextPayees);
    return sortPayees(nextPayees.filter((payee) => !payee.isArchived));
  }

  async recordPayees(names: string[]): Promise<PayeeView[]> {
    const payees = readPayees(this.dependencies.storage);
    const now = new Date().toISOString();
    let nextPayees = payees;

    for (const rawName of names) {
      const trimmed = normalisePayeeName(rawName);

      if (!trimmed || isTransferPayee(trimmed)) {
        continue;
      }

      const existing = nextPayees.find((payee) => samePayee(payee.name, trimmed));

      nextPayees = existing
        ? nextPayees.map((payee) =>
            payee.id === existing.id
              ? {
                  ...payee,
                  name: payee.name || trimmed,
                  lastUsedAt: now,
                  useCount: payee.useCount + 1,
                  isArchived: false,
                }
              : payee,
          )
        : [
            ...nextPayees,
            {
              id: createPayeeId(trimmed, nextPayees),
              name: trimmed,
              createdAt: now,
              lastUsedAt: now,
              useCount: 1,
              isArchived: false,
            },
          ];
    }

    writePayees(this.dependencies.storage, nextPayees);
    return sortPayees(nextPayees.filter((payee) => !payee.isArchived));
  }

  async renamePayee(input: RenamePayeeInput): Promise<PayeeView[]> {
    const nextName = normalisePayeeName(input.name);

    if (!nextName) {
      return sortPayees(readPayees(this.dependencies.storage).filter((payee) => !payee.isArchived));
    }

    const payees = readPayees(this.dependencies.storage);
    const target = payees.find((payee) => payee.id === input.id);

    if (!target) {
      return sortPayees(payees.filter((payee) => !payee.isArchived));
    }

    const duplicate = payees.find(
      (payee) => payee.id !== input.id && samePayee(payee.name, nextName),
    );

    if (duplicate) {
      const merged = payees
        .filter((payee) => payee.id !== input.id)
        .map((payee) =>
          payee.id === duplicate.id
            ? {
                ...payee,
                name: duplicate.name,
                lastUsedAt: maxIsoDate(payee.lastUsedAt, target.lastUsedAt),
                useCount: payee.useCount + target.useCount,
                iconRef: mergePayeeIconReferences(payee.iconRef, [target.iconRef]),
              }
            : payee,
        );

      writePayees(this.dependencies.storage, merged);
      return sortPayees(merged.filter((payee) => !payee.isArchived));
    }

    const renamed = payees.map((payee) =>
      payee.id === input.id ? { ...payee, name: nextName } : payee,
    );

    writePayees(this.dependencies.storage, renamed);
    return sortPayees(renamed.filter((payee) => !payee.isArchived));
  }

  async updatePayee(input: UpdatePayeeInput): Promise<PayeeView[]> {
    const nextName = normalisePayeeName(input.name);
    const nextNote = input.note.trim();

    if (!nextName) {
      return sortPayees(readPayees(this.dependencies.storage).filter((payee) => !payee.isArchived));
    }

    const payees = readPayees(this.dependencies.storage);
    const target = payees.find((payee) => payee.id === input.id);

    if (!target) {
      return sortPayees(payees.filter((payee) => !payee.isArchived));
    }

    const duplicate = payees.find(
      (payee) => payee.id !== input.id && samePayee(payee.name, nextName),
    );

    if (duplicate) {
      const merged = payees
        .filter((payee) => payee.id !== input.id)
        .map((payee) =>
          payee.id === duplicate.id
            ? {
                ...payee,
                name: duplicate.name,
                note: payee.note?.trim() || nextNote || target.note || "",
                defaultCategoryId:
                  payee.defaultCategoryId || input.defaultCategoryId || target.defaultCategoryId || "",
                defaultCategoryName:
                  payee.defaultCategoryName || input.defaultCategoryName || target.defaultCategoryName || "",
                importRules:
                  payee.importRules?.length
                    ? payee.importRules
                    : input.importRules?.length
                      ? input.importRules
                      : target.importRules ?? [],
                lastUsedAt: maxIsoDate(payee.lastUsedAt, target.lastUsedAt),
                useCount: payee.useCount + target.useCount,
                iconRef: mergePayeeIconReferences(payee.iconRef, [target.iconRef]),
              }
            : payee,
        );

      writePayees(this.dependencies.storage, merged);
      return sortPayees(merged.filter((payee) => !payee.isArchived));
    }

    const updated = payees.map((payee) =>
      payee.id === input.id
        ? {
            ...payee,
            name: nextName,
            note: nextNote,
            defaultCategoryId: input.defaultCategoryId ?? "",
            defaultCategoryName: input.defaultCategoryName ?? "",
            importRules: normaliseImportRules(input.importRules ?? []),
            aliases: input.aliases ?? payee.aliases ?? [],
            iconRef: applyIconUpdate(payee.iconRef, input.iconUpdate),
          }
        : payee,
    );

    writePayees(this.dependencies.storage, updated);
    return sortPayees(updated.filter((payee) => !payee.isArchived));
  }

  async mergePayees(input: MergePayeesInput): Promise<PayeeView[]> {
    const sourceIds = new Set(input.sourcePayeeIds?.length ? input.sourcePayeeIds : [input.sourcePayeeId]);
    sourceIds.delete(input.targetPayeeId);
    if (sourceIds.size === 0) {
      return sortPayees(readPayees(this.dependencies.storage).filter((payee) => !payee.isArchived));
    }

    const payees = readPayees(this.dependencies.storage);
    const sources = payees.filter((payee) => sourceIds.has(payee.id));
    const target = payees.find((payee) => payee.id === input.targetPayeeId);

    if (sources.length === 0 || !target) {
      return sortPayees(payees.filter((payee) => !payee.isArchived));
    }

    const nextPayees = payees.map((payee) => {
      if (sourceIds.has(payee.id)) {
        return { ...payee, isArchived: true };
      }

      if (payee.id === target.id) {
        return {
          ...payee,
          isArchived: false,
          note: sources.reduce((note, source) => mergeNotes(note, source.note ?? ""), payee.note ?? ""),
          defaultCategoryId: payee.defaultCategoryId || sources.find(({ defaultCategoryId }) => defaultCategoryId)?.defaultCategoryId || "",
          defaultCategoryName: payee.defaultCategoryName || sources.find(({ defaultCategoryName }) => defaultCategoryName)?.defaultCategoryName || "",
          importRules: sources.reduce((rules, source) => mergeImportRules(rules, source.importRules ?? []), payee.importRules ?? []),
          lastUsedAt: sources.reduce((lastUsedAt, source) => maxIsoDate(lastUsedAt, source.lastUsedAt), payee.lastUsedAt),
          useCount: payee.useCount + sources.reduce((total, source) => total + source.useCount, 0),
          iconRef: mergePayeeIconReferences(payee.iconRef, sources.map(({ iconRef }) => iconRef)),
        };
      }

      return payee;
    });

    writePayees(this.dependencies.storage, nextPayees);
    return sortPayees(nextPayees.filter((payee) => !payee.isArchived));
  }

  async archivePayee(payeeId: string): Promise<PayeeView[]> {
    const nextPayees = readPayees(this.dependencies.storage).map((payee) =>
      payee.id === payeeId ? { ...payee, isArchived: true } : payee,
    );

    writePayees(this.dependencies.storage, nextPayees);
    return sortPayees(nextPayees.filter((payee) => !payee.isArchived));
  }

  async restorePayee(payeeId: string): Promise<PayeeView[]> {
    const nextPayees = readPayees(this.dependencies.storage).map((payee) =>
      payee.id === payeeId ? { ...payee, isArchived: false } : payee,
    );

    writePayees(this.dependencies.storage, nextPayees);
    return sortPayees(nextPayees.filter((payee) => !payee.isArchived));
  }

  async listArchivedPayees(): Promise<PayeeView[]> {
    return sortPayees(readPayees(this.dependencies.storage).filter((payee) => payee.isArchived));
  }

  async deletePayee(payeeId: string): Promise<PayeeView[]> {
    const payees = readPayees(this.dependencies.storage);
    const target = payees.find((payee) => payee.id === payeeId);
    if (!target || target.useCount > 0 || (target.scheduledUseCount ?? 0) > 0 ||
        (target.importRules ?? []).some((rule) => rule.enabled !== false)) {
      return sortPayees(payees.filter((payee) => !payee.isArchived));
    }
    const next = payees.filter((payee) => payee.id !== payeeId);
    writePayees(this.dependencies.storage, next);
    return sortPayees(next.filter((payee) => !payee.isArchived));
  }

  findPayeeByName(name: string): PayeeView | undefined {
    return findPayeeByName(this.dependencies.storage, name);
  }

  findPayeeIdByName(name: string): string | undefined {
    return this.findPayeeByName(name)?.id;
  }
}

export function createPayeeService(
  dependencies: PayeeServiceDependencies,
): BrowserPersistentPayeeService {
  return new BrowserPersistentPayeeService(dependencies);
}

export function findPayeeByName(storage: KeyValueStoragePort, name: string): PayeeView | undefined {
  const normalised = normalisePayeeName(name).toLocaleLowerCase();

  if (!normalised || isTransferPayee(name)) {
    return undefined;
  }

  return readPayees(storage).find(
    (payee) =>
      !payee.isArchived && normalisePayeeName(payee.name).toLocaleLowerCase() === normalised,
  );
}

export function findPayeeIdByName(storage: KeyValueStoragePort, name: string): string | undefined {
  return findPayeeByName(storage, name)?.id;
}

export function readPayees(storage: KeyValueStoragePort): PayeeView[] {
  return createPayeeEntityRepository(storage).list().map(projectPayee);
}

function writePayees(storage: KeyValueStoragePort, payees: PayeeView[]): void {
  replacePayeeEntities(storage, sortPayees(normalisePayees(payees)));
}

function normalisePayees(payees: PayeeView[]): PayeeView[] {
  return payees
    .filter((payee) => typeof payee.name === "string" && payee.name.trim().length > 0)
    .map((payee) => ({
      id: payee.id || createPayeeId(payee.name, []),
      name: normalisePayeeName(payee.name),
      createdAt: payee.createdAt || new Date().toISOString(),
      lastUsedAt: payee.lastUsedAt || payee.createdAt || new Date().toISOString(),
      useCount: Number.isFinite(payee.useCount) ? payee.useCount : 1,
      note: typeof payee.note === "string" ? payee.note : "",
      defaultCategoryId:
        typeof payee.defaultCategoryId === "string" ? payee.defaultCategoryId : "",
      defaultCategoryName:
        typeof payee.defaultCategoryName === "string" ? payee.defaultCategoryName : "",
      importRules: normaliseImportRules(payee.importRules ?? []),
      aliases: payee.aliases ?? [],
      scheduledUseCount: Number.isFinite(payee.scheduledUseCount) ? payee.scheduledUseCount : 0,
      iconRef: typeof payee.iconRef === "string" ? payee.iconRef : "",
      isArchived: payee.isArchived === true,
    }));
}

function applyIconUpdate(
  current: string | undefined,
  update: UpdatePayeeInput["iconUpdate"],
): string {
  if (!update) return current ?? "";
  return update.kind === "automatic" ? "" : validatePayeeIconReferenceForWrite(update.iconRef);
}

function mergeNotes(targetNote: string, sourceNote: string): string {
  const cleanTargetNote = targetNote.trim();
  const cleanSourceNote = sourceNote.trim();

  if (!cleanTargetNote) {
    return cleanSourceNote;
  }

  if (!cleanSourceNote || cleanTargetNote === cleanSourceNote) {
    return cleanTargetNote;
  }

  return `${cleanTargetNote}\n\nMerged note:\n${cleanSourceNote}`;
}

function mergeImportRules(
  targetRules: PayeeImportRuleView[],
  sourceRules: PayeeImportRuleView[],
): PayeeImportRuleView[] {
  const existingKeys = new Set(
    targetRules.map((rule) => `${rule.matchType}:${rule.text.trim().toLocaleLowerCase()}`),
  );

  return normaliseImportRules([
    ...targetRules,
    ...sourceRules
      .filter((rule) => {
        const key = `${rule.matchType}:${rule.text.trim().toLocaleLowerCase()}`;
        return !existingKeys.has(key);
      })
      .map((rule) => ({ ...rule, id: `${rule.id}-merged` })),
  ]);
}

function normaliseImportRules(rules: PayeeImportRuleView[]): PayeeImportRuleView[] {
  return rules
    .filter((rule) => typeof rule.text === "string" && rule.text.trim().length > 0)
    .map((rule, index) => ({
      id: rule.id || `rule-${index + 1}`,
      matchType: isValidRuleMatchType(rule.matchType) ? rule.matchType : "contains",
      text: rule.text.trim(),
    }));
}

function isValidRuleMatchType(value: unknown): value is PayeeRuleMatchType {
  return value === "equals" || value === "contains" || value === "startsWith" || value === "endsWith";
}

function sortPayees(payees: PayeeView[]): PayeeView[] {
  return [...payees].sort((a, b) => {
    if (b.useCount !== a.useCount) {
      return b.useCount - a.useCount;
    }

    return a.name.localeCompare(b.name);
  });
}

function normalisePayeeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function samePayee(left: string, right: string): boolean {
  return normalisePayeeName(left).toLocaleLowerCase() === normalisePayeeName(right).toLocaleLowerCase();
}

function isTransferPayee(name: string): boolean {
  return normalisePayeeName(name).toLocaleLowerCase().startsWith("transfer:");
}

function createPayeeId(name: string, existingPayees: PayeeView[]): string {
  const base =
    normalisePayeeName(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "payee";

  const existingIds = new Set(existingPayees.map((payee) => payee.id));

  if (!existingIds.has(base)) {
    return base;
  }

  let counter = 2;
  while (existingIds.has(`${base}-${counter}`)) {
    counter += 1;
  }

  return `${base}-${counter}`;
}

function maxIsoDate(left: string, right: string): string {
  return left > right ? left : right;
}
