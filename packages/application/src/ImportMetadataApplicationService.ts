import { ImportRun, ImportSource } from "../../types/src/ImportRun.js";
import { ImportMap } from "../../types/src/ImportMap.js";
import {
  createImportMap,
  createImportRun,
  completeImportRun,
} from "../../budget-engine/src/services/createImportRun.js";

export class ImportMetadataApplicationService {
  startRun(input: {
    budgetId: string;
    userId: string;
    source: ImportSource;
    sourceFileName?: string | null;
    summary?: unknown;
  }): ImportRun {
    return createImportRun(input);
  }

  completeRun(run: ImportRun, summary: unknown): ImportRun {
    return completeImportRun(run, summary);
  }

  mapEntity(input: {
    importRunId: string;
    sourceEntityType: string;
    sourceEntityId: string;
    targetEntityType: string;
    targetEntityId: string;
  }): ImportMap {
    return createImportMap(input);
  }
}
