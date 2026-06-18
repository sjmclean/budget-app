import { randomUUID } from "crypto";
import { ImportRun, ImportSource } from "../../../types/src/ImportRun.js";
import { ImportMap } from "../../../types/src/ImportMap.js";

export function createImportRun(input: {
  budgetId: string;
  userId: string;
  source: ImportSource;
  sourceFileName?: string | null;
  summary?: unknown;
}): ImportRun {
  return {
    id: randomUUID(),
    budgetId: input.budgetId,
    userId: input.userId,
    source: input.source,
    sourceFileName: input.sourceFileName ?? null,
    startedAt: new Date(),
    completedAt: null,
    status: "Started",
    summaryJson: JSON.stringify(input.summary ?? {})
  };
}

export function completeImportRun(importRun: ImportRun, summary: unknown): ImportRun {
  return {
    ...importRun,
    completedAt: new Date(),
    status: "Completed",
    summaryJson: JSON.stringify(summary)
  };
}

export function createImportMap(input: {
  importRunId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  targetEntityType: string;
  targetEntityId: string;
}): ImportMap {
  return {
    id: randomUUID(),
    ...input,
    createdAt: new Date()
  };
}
