import { eq } from "drizzle-orm";
import { importMaps } from "../../database/src/schema.js";
import { ImportMap } from "../../types/src/ImportMap.js";
import { ImportMapRepository } from "./ImportMapRepository.js";

export class SqliteImportMapRepository implements ImportMapRepository {
  constructor(private db: any) {}

  async create(item: ImportMap): Promise<void> {
    await this.db.insert(importMaps).values(item);
  }

  async update(item: ImportMap): Promise<void> {
    await this.db.update(importMaps).set(item).where(eq(importMaps.id, item.id));
  }

  async findByImportRunId(importRunId: string): Promise<ImportMap[]> {
    return await this.db.select().from(importMaps).where(eq(importMaps.importRunId, importRunId));
  }
}
