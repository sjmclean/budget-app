import { AppSettings } from "../../types/src/AppSettings.js";

export interface AppSettingsRepository {
  create(item: AppSettings): Promise<void>;
  update?(item: AppSettings): Promise<void>;
  findByKey(key: string): Promise<AppSettings[]>;
}
