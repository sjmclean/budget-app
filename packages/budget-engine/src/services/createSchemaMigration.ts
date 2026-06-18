import { randomUUID } from "crypto";
import { SchemaMigration } from "../../../types/src/SchemaMigration.js";

export function createSchemaMigration(
  version: number,
  name: string,
): SchemaMigration {
  return {
    id: randomUUID(),
    version,
    name,
    appliedAt: new Date(),
  };
}
