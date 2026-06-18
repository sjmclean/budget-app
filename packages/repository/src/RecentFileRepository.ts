import { RecentFile } from "../../types/src/RecentFile.js";

export interface RecentFileRepository {
  create(item: RecentFile): Promise<void>;
  update?(item: RecentFile): Promise<void>;
  findByUserId(userId: string): Promise<RecentFile[]>;
}
