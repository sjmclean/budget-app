import { eq } from "drizzle-orm";
import { schemaMigrations } from "../../database/src/schema.js";
import { SchemaMigration } from "../../types/src/SchemaMigration.js";
import { SchemaMigrationRepository } from "./SchemaMigrationRepository.js";

export class SqliteSchemaMigrationRepository implements SchemaMigrationRepository {
  constructor(private db: any) {}

  async create(item: SchemaMigration): Promise<void> {
    await this.db.insert(schemaMigrations).values(item);
  }

  async update(item: SchemaMigration): Promise<void> {
    await this.db.update(schemaMigrations).set(item).where(eq(schemaMigrations.id, item.id));
  }

  async findByVersion(version: string): Promise<SchemaMigration[]> {
    return await this.db.select().from(schemaMigrations).where(eq(schemaMigrations.version, version));
  }
}
