import { randomUUID } from "crypto";
import { RecentFile } from "../../types/src/RecentFile.js";
import { RecentFileRepository } from "../../repository/src/RecentFileRepository.js";

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export class BudgetRegistryApplicationService {
  constructor(private recentFileRepo: RecentFileRepository) {}

  async registerBudget(userId: string, filePath: string, displayName: string): Promise<RecentFile> {
    const existing = (await this.recentFileRepo.findByUserId(userId)).find((item) => item.filePath === filePath);
    const item: RecentFile = {
      id: existing?.id ?? makeId("recent"),
      userId,
      filePath,
      displayName,
      lastOpenedAt: new Date()
    };
    if (existing && this.recentFileRepo.update) await this.recentFileRepo.update(item);
    else await this.recentFileRepo.create(item);
    return item;
  }

  async listBudgetsForUser(userId: string): Promise<RecentFile[]> {
    return (await this.recentFileRepo.findByUserId(userId)).sort((a, b) => b.lastOpenedAt.getTime() - a.lastOpenedAt.getTime());
  }

  async openBudget(userId: string, filePath: string, displayName: string): Promise<RecentFile> {
    return this.registerBudget(userId, filePath, displayName);
  }
}
