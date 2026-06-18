export interface User {
  id: string;
  displayName: string;
  email: string | null;
  passwordHash: string;
  passwordSalt: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
