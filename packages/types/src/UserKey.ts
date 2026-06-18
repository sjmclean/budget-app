export interface UserKey {
  id: string;
  userId: string;
  keySalt: string;
  keyCheckHash: string;
  createdAt: Date;
}
