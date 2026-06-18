import { UserKey } from "../../types/src/UserKey.js";

export interface UserKeyRepository {
  create(userKey: UserKey): Promise<void>;
  getByUser(userId: string): Promise<UserKey | null>;
}
