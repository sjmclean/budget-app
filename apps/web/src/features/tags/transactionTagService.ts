import type { KeyValueStoragePort } from "../persistence/keyValueStoragePort";
import {
  readTransactionTags,
  writeTransactionTags,
} from "./transactionTagPersistence";
import type {
  TransactionTagColour,
  TransactionTagDefinition,
} from "./transactionTagTypes";

export interface CreateTransactionTagInput {
  name: string;
  description?: string;
  colour: TransactionTagColour;
  autoTagImportedTransactions?: boolean;
}

export interface UpdateTransactionTagInput {
  id: string;
  name: string;
  description?: string;
  colour: TransactionTagColour;
  autoTagImportedTransactions: boolean;
}

export interface TransactionTagUsage {
  tagId: string;
  transactionCount: number;
}

export interface TransactionTagServiceDependencies {
  storage: KeyValueStoragePort;
  now?: () => string;
  createId?: () => string;
  countUsage?: (tagId: string) => number;
}

export interface TransactionTagService {
  listTags(options?: { includeArchived?: boolean }): TransactionTagDefinition[];
  createTag(input: CreateTransactionTagInput): TransactionTagDefinition;
  updateTag(input: UpdateTransactionTagInput): TransactionTagDefinition;
  archiveTag(tagId: string): TransactionTagDefinition;
  restoreTag(tagId: string): TransactionTagDefinition;
  deleteTag(tagId: string): void;
  getUsage(tagId: string): TransactionTagUsage;
}

export class TransactionTagValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionTagValidationError";
  }
}

export class TransactionTagNotFoundError extends Error {
  constructor(tagId: string) {
    super(`Transaction tag not found: ${tagId}`);
    this.name = "TransactionTagNotFoundError";
  }
}

export class TransactionTagInUseError extends Error {
  constructor(tagId: string, transactionCount: number) {
    super(
      `Transaction tag ${tagId} is used by ${transactionCount} transaction${
        transactionCount === 1 ? "" : "s"
      }. Archive it instead of deleting it.`,
    );
    this.name = "TransactionTagInUseError";
  }
}

export function createTransactionTagService(
  dependencies: TransactionTagServiceDependencies,
): TransactionTagService {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createId = dependencies.createId ?? createTransactionTagId;
  const countUsage = dependencies.countUsage ?? (() => 0);

  function listAllTags(): TransactionTagDefinition[] {
    return readTransactionTags(dependencies.storage);
  }

  function writeTags(tags: readonly TransactionTagDefinition[]): void {
    writeTransactionTags(dependencies.storage, tags);
  }

  function requireTag(
    tags: readonly TransactionTagDefinition[],
    tagId: string,
  ): TransactionTagDefinition {
    const id = tagId.trim();
    const tag = tags.find((candidate) => candidate.id === id);

    if (!tag) {
      throw new TransactionTagNotFoundError(id || tagId);
    }

    return tag;
  }

  function assertUniqueName(
    tags: readonly TransactionTagDefinition[],
    name: string,
    exceptTagId?: string,
  ): void {
    const normalisedName = normaliseTagName(name);
    const duplicate = tags.find(
      (tag) =>
        tag.id !== exceptTagId &&
        normaliseTagName(tag.name) === normalisedName,
    );

    if (duplicate) {
      throw new TransactionTagValidationError(
        `A transaction tag named "${name}" already exists.`,
      );
    }
  }

  function replaceTag(
    tags: readonly TransactionTagDefinition[],
    replacement: TransactionTagDefinition,
  ): void {
    writeTags(
      tags.map((tag) =>
        tag.id === replacement.id ? replacement : tag,
      ),
    );
  }

  return {
    listTags(options = {}) {
      const tags = listAllTags();
      const visible = options.includeArchived
        ? tags
        : tags.filter((tag) => !tag.archived);

      return visible
        .slice()
        .sort((left, right) =>
          left.name.localeCompare(right.name, undefined, {
            sensitivity: "base",
          }),
        );
    },

    createTag(input) {
      const tags = listAllTags();
      const name = requireTagName(input.name);
      assertUniqueName(tags, name);

      const timestamp = now();
      const tag: TransactionTagDefinition = {
        id: requireGeneratedId(createId()),
        name,
        ...(normaliseDescription(input.description)
          ? { description: normaliseDescription(input.description) }
          : {}),
        colour: input.colour,
        autoTagImportedTransactions:
          input.autoTagImportedTransactions === true,
        archived: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      writeTags([...tags, tag]);
      return { ...tag };
    },

    updateTag(input) {
      const tags = listAllTags();
      const existing = requireTag(tags, input.id);
      const name = requireTagName(input.name);
      assertUniqueName(tags, name, existing.id);

      const description = normaliseDescription(input.description);
      const updated: TransactionTagDefinition = {
        ...existing,
        name,
        ...(description ? { description } : {}),
        colour: input.colour,
        autoTagImportedTransactions:
          input.autoTagImportedTransactions,
        updatedAt: now(),
      };

      if (!description) {
        delete updated.description;
      }

      replaceTag(tags, updated);
      return { ...updated };
    },

    archiveTag(tagId) {
      const tags = listAllTags();
      const existing = requireTag(tags, tagId);
      const archived = {
        ...existing,
        archived: true,
        updatedAt: now(),
      };

      replaceTag(tags, archived);
      return { ...archived };
    },

    restoreTag(tagId) {
      const tags = listAllTags();
      const existing = requireTag(tags, tagId);
      assertUniqueName(tags, existing.name, existing.id);
      const restored = {
        ...existing,
        archived: false,
        updatedAt: now(),
      };

      replaceTag(tags, restored);
      return { ...restored };
    },

    deleteTag(tagId) {
      const tags = listAllTags();
      const existing = requireTag(tags, tagId);
      const transactionCount = normaliseUsageCount(countUsage(existing.id));

      if (transactionCount > 0) {
        throw new TransactionTagInUseError(existing.id, transactionCount);
      }

      writeTags(tags.filter((tag) => tag.id !== existing.id));
    },

    getUsage(tagId) {
      const tags = listAllTags();
      const existing = requireTag(tags, tagId);

      return {
        tagId: existing.id,
        transactionCount: normaliseUsageCount(countUsage(existing.id)),
      };
    },
  };
}

function requireTagName(value: string): string {
  const name = value.replace(/\s+/g, " ").trim();

  if (!name) {
    throw new TransactionTagValidationError(
      "Transaction tag name is required.",
    );
  }

  return name;
}

function normaliseTagName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function normaliseDescription(value: string | undefined): string | undefined {
  const description = value?.trim();
  return description || undefined;
}

function requireGeneratedId(value: string): string {
  const id = value.trim();

  if (!id) {
    throw new TransactionTagValidationError(
      "Transaction tag ID generation returned an empty value.",
    );
  }

  return id;
}

function normaliseUsageCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function createTransactionTagId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `tag-${crypto.randomUUID()}`;
  }

  return `tag-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
