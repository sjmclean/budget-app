import { ImportMap } from "../../types/src/ImportMap.js";

export interface ImportMapRepository {
  create(item: ImportMap): Promise<void>;
  update?(item: ImportMap): Promise<void>;
  findByImportRunId(importRunId: string): Promise<ImportMap[]>;
}
