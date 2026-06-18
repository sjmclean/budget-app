import { Category } from "../../types/src/Category.js";
import { CategoryGroup } from "../../types/src/CategoryGroup.js";
import { CategorySettings } from "../../types/src/CategorySettings.js";
import { CategoryRepository } from "../../repository/src/CategoryRepository.js";
import { CategoryGroupRepository } from "../../repository/src/CategoryGroupRepository.js";
import { CategorySettingsRepository } from "../../repository/src/CategorySettingsRepository.js";

export class CategoryManagementApplicationService {
  constructor(
    private categoryRepo: CategoryRepository,
    private categoryGroupRepo: CategoryGroupRepository,
    private categorySettingsRepo: CategorySettingsRepository,
  ) {}

  async renameCategory(categoryId: string, name: string): Promise<Category> {
    const clean = name.trim();
    if (!clean) throw new Error("Category name cannot be empty");
    const category = await this.categoryRepo.getById(categoryId);
    if (!category) throw new Error(`Category not found: ${categoryId}`);
    const updated = { ...category, name: clean };
    await this.categoryRepo.update(updated);
    return updated;
  }

  async moveCategory(
    categoryId: string,
    groupId: string,
    sortOrder: number,
  ): Promise<Category> {
    const category = await this.categoryRepo.getById(categoryId);
    if (!category) throw new Error(`Category not found: ${categoryId}`);
    const updated = { ...category, groupId, sortOrder };
    await this.categoryRepo.update(updated);
    return updated;
  }

  async renameGroup(groupId: string, name: string): Promise<CategoryGroup> {
    const clean = name.trim();
    if (!clean) throw new Error("Category group name cannot be empty");
    const group = await this.categoryGroupRepo.getById(groupId);
    if (!group) throw new Error(`Category group not found: ${groupId}`);
    const updated = { ...group, name: clean };
    await this.categoryGroupRepo.update(updated);
    return updated;
  }

  async setHidden(
    categoryId: string,
    hidden: boolean,
  ): Promise<CategorySettings> {
    const settings = (
      await this.categorySettingsRepo.findByCategoryId(categoryId)
    )[0];
    if (!settings)
      throw new Error(`Category settings not found: ${categoryId}`);
    const updated = { ...settings, hidden, updatedAt: new Date() };
    await this.categorySettingsRepo.update?.(updated);
    return updated;
  }

  async setPinned(
    categoryId: string,
    pinned: boolean,
  ): Promise<CategorySettings> {
    const settings = (
      await this.categorySettingsRepo.findByCategoryId(categoryId)
    )[0];
    if (!settings)
      throw new Error(`Category settings not found: ${categoryId}`);
    const updated = { ...settings, pinned, updatedAt: new Date() };
    await this.categorySettingsRepo.update?.(updated);
    return updated;
  }
}
