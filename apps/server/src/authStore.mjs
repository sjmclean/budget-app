import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ROLE_LEVEL = Object.freeze({ viewer: 1, editor: 2, owner: 3 });

export function createAuthStore(database, options = {}) {
  const now = options.now ?? (() => new Date());

  const countUsers = database.prepare("SELECT COUNT(*) AS count FROM hosted_users");
  const findUserByEmail = database.prepare(
    "SELECT * FROM hosted_users WHERE email_normalized = ? AND disabled_at IS NULL",
  );
  const findUserById = database.prepare(
    "SELECT * FROM hosted_users WHERE id = ? AND disabled_at IS NULL",
  );
  const insertUser = database.prepare(`
    INSERT INTO hosted_users (
      id, email, email_normalized, password_salt, password_hash, is_admin,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSession = database.prepare(`
    INSERT INTO hosted_sessions (
      id, user_id, token_hash, expires_at, created_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const findSession = database.prepare(`
    SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.is_admin
    FROM hosted_sessions s
    JOIN hosted_users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND u.disabled_at IS NULL
  `);
  const touchSession = database.prepare(
    "UPDATE hosted_sessions SET last_seen_at = ? WHERE id = ?",
  );
  const revokeSession = database.prepare(
    "UPDATE hosted_sessions SET revoked_at = ? WHERE token_hash = ?",
  );
  const membership = database.prepare(`
    SELECT role FROM hosted_budget_memberships
    WHERE budget_id = ? AND user_id = ?
  `);
  const membershipCount = database.prepare(`
    SELECT COUNT(*) AS count FROM hosted_budget_memberships WHERE budget_id = ?
  `);
  const insertMembership = database.prepare(`
    INSERT INTO hosted_budget_memberships (budget_id, user_id, role, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (budget_id, user_id) DO NOTHING
  `);
  const deleteBudgetMemberships = database.prepare(
    "DELETE FROM hosted_budget_memberships WHERE budget_id = ?",
  );
  const listBudgets = database.prepare(`
    SELECT m.budget_id AS budgetId, m.role,
      COALESCE(
        local_metadata.budget_name,
        json_extract(local_baseline.manifest_json, '$.budgetName'),
        m.budget_id
      ) AS name,
      COALESCE(
        local_metadata.currency,
        json_extract(local_baseline.manifest_json, '$.currency'),
        'AUD'
      ) AS currency,
      m.created_at AS createdAt
    FROM hosted_budget_memberships m
    LEFT JOIN replication_generations rg
      ON rg.budget_id = m.budget_id AND rg.is_active = 1
    LEFT JOIN local_first_sync_epochs local_epoch
      ON local_epoch.budget_id = m.budget_id
     AND local_epoch.baseline_id IS NOT NULL
    LEFT JOIN local_first_baselines local_baseline
      ON local_baseline.baseline_id = local_epoch.baseline_id
     AND local_baseline.state = 'committed'
    LEFT JOIN local_first_budget_metadata local_metadata
      ON local_metadata.budget_id = m.budget_id
    WHERE m.user_id = ?
      AND (
        rg.generation_id IS NOT NULL OR
        local_baseline.baseline_id IS NOT NULL
      )
    ORDER BY m.created_at
  `);
  const listUsers = database.prepare(`
    SELECT id, email, is_admin, created_at
    FROM hosted_users WHERE disabled_at IS NULL ORDER BY email_normalized
  `);

  function createUser({ email, password, isAdmin = false }) {
    const normalized = normalizeEmail(email);
    validatePassword(password);
    const salt = randomBytes(16);
    const hash = derivePassword(password, salt);
    const timestamp = now().toISOString();
    const id = randomUUID();
    try {
      insertUser.run(
        id,
        String(email).trim(),
        normalized,
        salt.toString("base64"),
        hash.toString("base64"),
        isAdmin ? 1 : 0,
        timestamp,
        timestamp,
      );
    } catch (cause) {
      if (cause?.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw httpError(409, "AUTH_EMAIL_EXISTS", "An account already exists for that email address.");
      }
      throw cause;
    }
    return publicUser(findUserById.get(id));
  }

  return {
    needsSetup() {
      return countUsers.get().count === 0;
    },

    setup(input) {
      if (!this.needsSetup()) {
        throw httpError(409, "AUTH_SETUP_COMPLETE", "Initial account setup has already been completed.");
      }
      return createUser({ ...input, isAdmin: true });
    },

    createUser(actor, input) {
      if (!actor?.isAdmin) {
        throw httpError(403, "AUTH_ADMIN_REQUIRED", "Administrator access is required.");
      }
      return createUser(input);
    },

    listUsers(actor) {
      if (!actor?.isAdmin) {
        throw httpError(403, "AUTH_ADMIN_REQUIRED", "Administrator access is required.");
      }
      return listUsers.all().map((row) => ({
        id: row.id,
        email: row.email,
        isAdmin: Boolean(row.is_admin),
        createdAt: row.created_at,
      }));
    },

    login(email, password) {
      const user = findUserByEmail.get(normalizeEmail(email));
      if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
        throw httpError(401, "AUTH_INVALID_CREDENTIALS", "The email address or password is incorrect.");
      }
      const token = randomBytes(32).toString("base64url");
      const timestamp = now();
      const expiresAt = new Date(timestamp.getTime() + SESSION_TTL_MS);
      insertSession.run(
        randomUUID(),
        user.id,
        hashToken(token),
        expiresAt.toISOString(),
        timestamp.toISOString(),
        timestamp.toISOString(),
      );
      return { token, expiresAt: expiresAt.toISOString(), user: publicUser(user) };
    },

    authenticate(token) {
      if (!token) return null;
      const row = findSession.get(hashToken(token));
      if (!row || Date.parse(row.expires_at) <= now().getTime()) return null;
      touchSession.run(now().toISOString(), row.session_id);
      return publicUser(row);
    },

    logout(token) {
      if (token) revokeSession.run(now().toISOString(), hashToken(token));
    },

    requireBudgetRole(user, budgetId, minimumRole = "viewer") {
      const row = membership.get(budgetId, user.id);
      if (!row || ROLE_LEVEL[row.role] < ROLE_LEVEL[minimumRole]) {
        throw httpError(403, "BUDGET_ACCESS_DENIED", "You do not have access to this budget.");
      }
      return row.role;
    },

    claimBudget(user, budgetId) {
      const existingCount = membershipCount.get(budgetId).count;
      const existing = membership.get(budgetId, user.id);
      if (existing) return existing.role;
      if (existingCount > 0) {
        throw httpError(403, "BUDGET_ACCESS_DENIED", "You do not have access to this budget.");
      }
      insertMembership.run(budgetId, user.id, "owner", now().toISOString());
      return "owner";
    },

    deleteBudgetMemberships(budgetId) {
      return {
        budgetId,
        deletedMembershipCount: deleteBudgetMemberships.run(budgetId).changes,
      };
    },

    listBudgets(user) {
      return listBudgets.all(user.id);
    },

    cleanupOrphanedBudgetMemberships() {
      const cleanup = database.transaction(() => database.prepare(`
        DELETE FROM hosted_budget_memberships AS membership
        WHERE NOT EXISTS (
          SELECT 1 FROM replication_generations AS generation
          WHERE generation.budget_id = membership.budget_id
            AND generation.is_active = 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM local_first_sync_epochs AS epoch
          WHERE epoch.budget_id = membership.budget_id
            AND epoch.baseline_id IS NOT NULL
        )
      `).run().changes);
      return { removedMembershipCount: cleanup() };
    },
  };
}

function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw httpError(400, "AUTH_INVALID_EMAIL", "Enter a valid email address.");
  }
  return email;
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 256) {
    throw httpError(400, "AUTH_WEAK_PASSWORD", "Passwords must contain between 12 and 256 characters.");
  }
}

function derivePassword(password, salt) {
  return scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function verifyPassword(password, saltValue, hashValue) {
  if (typeof password !== "string") return false;
  try {
    const expected = Buffer.from(hashValue, "base64");
    const actual = derivePassword(password, Buffer.from(saltValue, "base64"));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    isAdmin: Boolean(user.is_admin),
    ...(user.created_at ? { createdAt: user.created_at } : {}),
  };
}

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}
