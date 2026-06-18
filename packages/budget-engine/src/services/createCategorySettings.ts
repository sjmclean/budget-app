import { randomUUID } from "crypto";
import { CategorySettings } from "../../../types/src/CategorySettings.js";

export function createCategorySettings(categoryId: string): CategorySettings {
  const now = new Date();

  return {
    id: randomUUID(),
    categoryId,
    colour: null,
    hidden: false,
    pinned: false,
    notes: null,
    goalDisplayMode: "default",
    createdAt: now,
    updatedAt: now,
  };
}
