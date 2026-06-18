import { UserSettings } from "../../types/src/UserSettings.js";

export interface UserSettingsRepository {
  create(settings: UserSettings): Promise<void>;
  update(settings: UserSettings): Promise<void>;
  getByUser(userId: string): Promise<UserSettings | null>;
  deleteByUser(userId: string): Promise<void>;
}
