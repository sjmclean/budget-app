import { createSchemaMigration } from "../../budget-engine/src/services/createSchemaMigration.js";
import { SchemaMigrationRepository } from "../../repository/src/SchemaMigrationRepository.js";

export interface MigrationDefinition {
  version: number;
  name: string;
  up: () => Promise<void> | void;
}

export class MigrationRunner {
  constructor(private migrationRepo: SchemaMigrationRepository) {}

  async getPending(
    migrations: MigrationDefinition[],
  ): Promise<MigrationDefinition[]> {
    const sorted = [...migrations].sort((a, b) => a.version - b.version);
    const pending: MigrationDefinition[] = [];

    for (const migration of sorted) {
      const existing = await this.migrationRepo.findByVersion(
        String(migration.version),
      );
      if (existing.length === 0) pending.push(migration);
    }

    return pending;
  }

  async runPending(migrations: MigrationDefinition[]): Promise<number[]> {
    const pending = await this.getPending(migrations);
    const applied: number[] = [];

    for (const migration of pending) {
      await migration.up();
      await this.migrationRepo.create(
        createSchemaMigration(migration.version, migration.name),
      );
      applied.push(migration.version);
    }

    return applied;
  }
}
