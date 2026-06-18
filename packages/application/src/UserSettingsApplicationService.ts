import { UserSettings } from "../../types/src/UserSettings.js";
import { UserSettingsRepository } from "../../repository/src/UserSettingsRepository.js";

export class UserSettingsApplicationService {
  constructor(private settingsRepo: UserSettingsRepository) {}

  async get(userId: string): Promise<UserSettings | null> {
    return await this.settingsRepo.getByUser(userId);
  }

  async update(settings: UserSettings): Promise<UserSettings> {
    const updated = {
      ...settings,
      updatedAt: new Date()
    };

    await this.settingsRepo.update(updated);
    return updated;
  }
}
