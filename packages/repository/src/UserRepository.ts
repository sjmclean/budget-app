import { User } from "../../types/src/User.js";

export interface UserRepository {
  create(user: User): Promise<void>;
  update(user: User): Promise<void>;
  getById(id: string): Promise<User | null>;
  findByDisplayName(displayName: string): Promise<User | null>;
}
