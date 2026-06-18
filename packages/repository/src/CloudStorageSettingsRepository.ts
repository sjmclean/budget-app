import { CloudStorageSettings } from "../../types/src/CloudStorageSettings.js";

export interface CloudStorageSettingsRepository {
  create(item: CloudStorageSettings): Promise<void>;
  update?(item: CloudStorageSettings): Promise<void>;
  findByUserId(userId: string): Promise<CloudStorageSettings[]>;
}
