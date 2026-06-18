import { Category } from "../../types/src/Category.js";

export interface CategoryRepository {
  create(category: Category): Promise<void>;
  update(category: Category): Promise<void>;
  getById(id: string): Promise<Category | null>;
  findByGroup(groupId: string): Promise<Category[]>;
}
