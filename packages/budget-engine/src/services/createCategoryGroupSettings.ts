import { randomUUID } from "crypto";
import { CategoryGroupSettings } from "../../../types/src/CategoryGroupSettings.js";

export function createCategoryGroupSettings(categoryGroupId: string): CategoryGroupSettings {
  const now = new Date();

  return {
    id: randomUUID(),
    categoryGroupId,
    notes: null,
    hidden: false,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}
