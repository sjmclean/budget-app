export interface SchemaMigration {
  id: string;
  version: number;
  name: string;
  appliedAt: Date;
}
