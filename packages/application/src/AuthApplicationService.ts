import { User } from "../../types/src/User.js";
import { Session } from "../../types/src/Session.js";
import { createUser } from "../../budget-engine/src/services/createUser.js";
import { createSession } from "../../budget-engine/src/services/createSession.js";
import { createUserSettings } from "../../budget-engine/src/services/createUserSettings.js";
import { verifyPassword } from "../../security/src/passwords.js";
import { UserRepository } from "../../repository/src/UserRepository.js";
import { SessionRepository } from "../../repository/src/SessionRepository.js";
import { UserSettingsRepository } from "../../repository/src/UserSettingsRepository.js";

export class AuthApplicationService {
  constructor(
    private userRepo: UserRepository,
    private sessionRepo: SessionRepository,
    private settingsRepo: UserSettingsRepository
  ) {}

  async signUp(
    displayName: string,
    email: string | null,
    password: string
  ): Promise<User> {
    const existing = await this.userRepo.findByDisplayName(displayName);
    if (existing) {
      throw new Error("User already exists");
    }

    const user = createUser(displayName, email, password);
    await this.userRepo.create(user);

    const settings = createUserSettings(user.id);
    await this.settingsRepo.create(settings);

    return user;
  }

  async login(displayName: string, password: string): Promise<Session> {
    const user = await this.userRepo.findByDisplayName(displayName);

    if (!user || !user.isActive) {
      throw new Error("Invalid login");
    }

    if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      throw new Error("Invalid login");
    }

    const session = createSession(user.id);
    await this.sessionRepo.create(session);

    return session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    const session = await this.sessionRepo.getById(sessionId);

    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() < Date.now()) {
      await this.sessionRepo.delete(session.id);
      return null;
    }

    return session;
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionRepo.delete(sessionId);
  }
}
