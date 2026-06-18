import { randomUUID } from "crypto";
import { Category } from "../../../types/src/Category.js";

export function createCategory(groupId: string, name: string, sortOrder = 0): Category {
  return { id: randomUUID(), groupId, name, sortOrder };
}
