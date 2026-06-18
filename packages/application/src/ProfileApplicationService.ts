import { UserRepository } from "../../repository/src/UserRepository.js";
import { UserSettingsRepository } from "../../repository/src/UserSettingsRepository.js";

export class ProfileApplicationService {
  constructor(
    private userRepo: UserRepository,
    private settingsRepo: UserSettingsRepository,
  ) {}

  async softDeleteProfile(userId: string): Promise<void> {
    const user = await this.userRepo.getById(userId);
    if (!user) throw new Error("User not found");

    await this.settingsRepo.deleteByUser(userId);

    await this.userRepo.update({
      ...user,
      isActive: false,
      updatedAt: new Date(),
    });
  }
}
