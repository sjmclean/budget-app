import { SchemaMigration } from "../../types/src/SchemaMigration.js";

export interface SchemaMigrationRepository {
  create(item: SchemaMigration): Promise<void>;
  update?(item: SchemaMigration): Promise<void>;
  findByVersion(version: string): Promise<SchemaMigration[]>;
}
