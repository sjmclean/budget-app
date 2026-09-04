import { createServer } from "node:http";
import { once } from "node:events";
import { accessSync, constants, createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createReplicationStore, REPLICATION_PROTOCOL_VERSION } from "./replicationStore.mjs";
import {
  createLocalFirstRelayStore,
  LOCAL_FIRST_MAX_CHUNK_BYTES,
  LOCAL_FIRST_RELAY_PROTOCOL_VERSION,
} from "./localFirstRelayStore.mjs";
import { createLocalFirstRelayEventBroker } from "./localFirstRelayEvents.mjs";
import { readServerRuntimeConfig } from "./runtimeConfig.mjs";
import { createAuthStore } from "./authStore.mjs";
import { createBudgetDeletionLifecycle } from "./budgetDeletionLifecycle.mjs";
import { performAuthorizedBudgetMutation } from "./budgetMutationAuthorization.mjs";
import {
  createOperationalResilienceStore,
  openResilientHostedDatabase,
} from "./operationalResilienceStore.mjs";
import {
  HOSTED_SCHEMA_VERSION,
  prepareHostedSchemaMigrationBackup,
  readHostedSchemaVersion,
  runHostedSchemaMigrations,
} from "./hostedSchemaMigrations.mjs";

const currentFile = fileURLToPath(import.meta.url);
const serverSourceDir = dirname(currentFile);
const serverPackageDir = resolve(serverSourceDir, "..");
const repositoryRoot = resolve(serverPackageDir, "../..");

const runtimeConfig = readServerRuntimeConfig({
  serverPackageDir,
  repositoryRoot,
});
const {
  port,
  host,
  dataDir,
  databasePath,
  webDist,
  replicationBlobDir,
  shutdownTimeoutMs,
  exposePaths,
  migrationBackupDir,
  backupBeforeMigration,
  operationalBackupDir,
  operationalBackupIntervalMs,
  operationalBackupRetention,
  operationalBackupMaximumBytes,
  operationalBackupMinimumFreeBytes,
  operationalBackupRecentMaximumAgeMs,
} = runtimeConfig;
const startedAt = new Date().toISOString();

mkdirSync(dataDir, { recursive: true });

const { database, startupRecovery } = openResilientHostedDatabase(Database, {
  databasePath,
  backupDirectory: operationalBackupDir,
});
database.pragma("journal_mode = WAL");
database.pragma("synchronous = NORMAL");
const preMigrationBackupPath = await prepareHostedSchemaMigrationBackup(database, {
  databasePath,
  backupDirectory: migrationBackupDir,
  backupBeforeMigration,
});
let hostedMigrationStatus = null;
if (readHostedSchemaVersion(database) > 0) {
  hostedMigrationStatus = await runHostedSchemaMigrations(database, {
    databasePath,
    backupDirectory: migrationBackupDir,
    backupBeforeMigration: false,
  });
}
mkdirSync(replicationBlobDir, { recursive: true });
const replicationStore = createReplicationStore(database, {
  blobDirectory: replicationBlobDir,
});
const localFirstRelayStore = createLocalFirstRelayStore(database, {
  blobDirectory: join(replicationBlobDir, "local-first"),
});
const localFirstRelayEvents = createLocalFirstRelayEventBroker();
if (!hostedMigrationStatus) {
  hostedMigrationStatus = await runHostedSchemaMigrations(database, {
    databasePath,
    backupDirectory: migrationBackupDir,
    backupBeforeMigration: false,
  });
}
const authStore = createAuthStore(database);
const budgetDeletionLifecycle = createBudgetDeletionLifecycle({
  localFirstRelayStore,
  replicationStore,
  authStore,
});
const orphanedMembershipCleanup = authStore.cleanupOrphanedBudgetMemberships();
if (orphanedMembershipCleanup.removedMembershipCount > 0) {
  console.log(
    `Removed ${orphanedMembershipCleanup.removedMembershipCount} orphaned hosted budget membership(s).`,
  );
}
const operationalResilienceStore = createOperationalResilienceStore(database, {
  Database,
  databasePath,
  backupDirectory: operationalBackupDir,
  retentionCount: operationalBackupRetention,
  maximumRetainedBytes: operationalBackupMaximumBytes,
  minimumFreeBytes: operationalBackupMinimumFreeBytes,
  recentBackupMaximumAgeMs: operationalBackupRecentMaximumAgeMs,
  exposePaths,
  startupRecovery,
});
void operationalResilienceStore.createVerifiedBackup("startup").catch((error) => {
  console.error("Unable to create startup SQLite backup.", error);
});
const operationalBackupTimer = setInterval(() => {
  void operationalResilienceStore.createVerifiedBackup("scheduled").catch((error) => {
    console.error("Unable to create scheduled SQLite backup.", error);
  });
}, operationalBackupIntervalMs);
operationalBackupTimer.unref?.();
if (preMigrationBackupPath && hostedMigrationStatus.applied.length > 0) {
  hostedMigrationStatus.backupPath = preMigrationBackupPath;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

const SESSION_COOKIE = "budget_app_session";
const loginAttempts = new Map();

function enforceLoginRateLimit(request) {
  const address = request.socket?.remoteAddress ?? "unknown";
  const timestamp = Date.now();
  const windowStart = timestamp - 15 * 60 * 1000;
  const attempts = (loginAttempts.get(address) ?? []).filter((value) => value > windowStart);
  if (attempts.length >= 10) {
    throw Object.assign(new Error("Too many sign-in attempts. Try again later."), {
      statusCode: 429,
      code: "AUTH_RATE_LIMITED",
    });
  }
  attempts.push(timestamp);
  loginAttempts.set(address, attempts);
}

function clearLoginRateLimit(request) {
  loginAttempts.delete(request.socket?.remoteAddress ?? "unknown");
}

function readCookie(request, name) {
  const cookie = request.headers.cookie ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function sessionCookie(token, expiresAt, request) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const secure = forwardedProto === "https" || request.socket?.encrypted;
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : null,
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ].filter(Boolean).join("; ");
}

function expiredSessionCookie(request) {
  return sessionCookie("", new Date(0).toISOString(), request);
}

function requireAuthenticatedUser(request) {
  const user = authStore.authenticate(readCookie(request, SESSION_COOKIE));
  if (!user) {
    throw Object.assign(new Error("Sign in is required."), {
      statusCode: 401,
      code: "AUTH_REQUIRED",
    });
  }
  return user;
}

function minimumBudgetRole(method) {
  return method === "GET" || method === "HEAD" ? "viewer" : "editor";
}

async function readRequestBody(request, maximumBytes = 50 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) {
      throw new Error(`Request body exceeds the ${maximumBytes} byte limit.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(request) {
  const body = await readRequestBody(request);
  if (body.length === 0) return {};
  return JSON.parse(body.toString("utf8"));
}

function validateReplicationProtocol(value) {
  if (value !== REPLICATION_PROTOCOL_VERSION) {
    throw new Error(`Unsupported replication protocol version ${value}.`);
  }
}

function validateGenerationId(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("generationId is required.");
  }
  return value;
}

function validateCursor(value, fieldName) {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return parsed;
}

function validateReplicationOperations(value) {
  if (!Array.isArray(value)) throw new Error("operations must be an array.");
  if (value.length > 5000) throw new Error("A replication push may contain at most 5000 operations.");
  return value.map((operation) => {
    if (!operation || typeof operation !== "object") throw new Error("Invalid replication operation.");
    if (operation.formatVersion !== 1) throw new Error("Unsupported operation format version.");
    if (typeof operation.operationId !== "string" || !operation.operationId) throw new Error("operationId is required.");
    if (typeof operation.deviceId !== "string" || !operation.deviceId) throw new Error("deviceId is required.");
    if (!Number.isSafeInteger(operation.sequence) || operation.sequence < 1) throw new Error("operation sequence must be positive.");
    if (!operation.mutation || !["key-value.set", "key-value.remove"].includes(operation.mutation.type)) {
      throw new Error("Unsupported replication mutation.");
    }
    if (typeof operation.mutation.key !== "string" || !operation.mutation.key) throw new Error("mutation key is required.");
    if (operation.mutation.type === "key-value.set" && typeof operation.mutation.value !== "string") {
      throw new Error("Set mutations require a string value.");
    }
    return operation;
  });
}

function validateCheckpoint(value) {
  if (!value || typeof value !== "object") throw new Error("checkpoint is required.");
  if (value.formatVersion !== 1) throw new Error("Unsupported checkpoint format version.");
  if (typeof value.checkpointId !== "string" || !value.checkpointId) throw new Error("checkpointId is required.");
  if (typeof value.createdAt !== "string" || !value.createdAt) throw new Error("checkpoint createdAt is required.");
  if (!Number.isSafeInteger(value.throughSequence) || value.throughSequence < 0) throw new Error("checkpoint throughSequence is invalid.");
  if (!Number.isSafeInteger(value.replicatedThroughCursor) || value.replicatedThroughCursor < 0) throw new Error("checkpoint replicatedThroughCursor is invalid.");
  if (typeof value.integrityHash !== "string" || !/^[a-f0-9]{16}$/i.test(value.integrityHash)) throw new Error("checkpoint integrityHash is invalid.");
  if (!value.entries || typeof value.entries !== "object" || Array.isArray(value.entries)) throw new Error("checkpoint entries are invalid.");
  return value;
}

function serveStatic(requestPath, response) {
  if (!existsSync(webDist)) return false;
  const requested = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  let filePath = resolve(join(webDist, safePath));
  if (!filePath.startsWith(webDist)) return false;
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(webDist, "index.html");
  }
  if (!existsSync(filePath)) return false;
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
  };
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
  return true;
}

const server = createServer(async (request, response) => {
  // SQLite WASM uses a dedicated worker and OPFS. Cross-origin isolation is
  // required for the SharedArrayBuffer-backed persistent VFS.
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname === "/api/health" && request.method === "GET") {
      sendJson(response, 200, {
        status: "ok",
        service: "budget-app-server",
        startedAt,
        hostedSchemaVersion: HOSTED_SCHEMA_VERSION,
        uptimeSeconds: Math.floor(process.uptime()),
        protocolVersion: REPLICATION_PROTOCOL_VERSION,
        localFirstProtocolVersion: LOCAL_FIRST_RELAY_PROTOCOL_VERSION,
        serverTime: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === "/api/ready" && request.method === "GET") {
      try {
        accessSync(dataDir, constants.R_OK | constants.W_OK);
        accessSync(replicationBlobDir, constants.R_OK | constants.W_OK);
        sendJson(response, 200, {
          status: "ready",
          service: "budget-app-server",
          storage: "sqlite",
          protocolVersion: REPLICATION_PROTOCOL_VERSION,
          hostedSchemaVersion: hostedMigrationStatus.currentVersion,
          serverTime: new Date().toISOString(),
          ...(exposePaths ? { databasePath, replicationBlobDir, webDist } : {}),
        });
      } catch (error) {
        sendJson(response, 503, {
          status: "not-ready",
          service: "budget-app-server",
          message: error instanceof Error ? error.message : "Server readiness checks failed.",
          serverTime: new Date().toISOString(),
        });
      }
      return;
    }

    if (url.pathname === "/api/auth/status" && request.method === "GET") {
      const user = authStore.authenticate(readCookie(request, SESSION_COOKIE));
      sendJson(response, 200, {
        needsSetup: authStore.needsSetup(),
        authenticated: Boolean(user),
        user,
        budgets: user ? authStore.listBudgets(user) : [],
      });
      return;
    }

    if (url.pathname === "/api/auth/setup" && request.method === "POST") {
      const body = await readJsonBody(request);
      const user = authStore.setup(body);
      const session = authStore.login(user.email, body.password);
      response.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt, request));
      sendJson(response, 201, { user: session.user, expiresAt: session.expiresAt });
      return;
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      enforceLoginRateLimit(request);
      const body = await readJsonBody(request);
      const session = authStore.login(body.email, body.password);
      clearLoginRateLimit(request);
      response.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt, request));
      sendJson(response, 200, { user: session.user, expiresAt: session.expiresAt });
      return;
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      authStore.logout(readCookie(request, SESSION_COOKIE));
      response.setHeader("Set-Cookie", expiredSessionCookie(request));
      sendJson(response, 200, { loggedOut: true });
      return;
    }

    if (url.pathname === "/api/auth/users" && request.method === "POST") {
      const actor = requireAuthenticatedUser(request);
      sendJson(response, 201, authStore.createUser(actor, await readJsonBody(request)));
      return;
    }

    if (url.pathname === "/api/auth/users" && request.method === "GET") {
      const actor = requireAuthenticatedUser(request);
      sendJson(response, 200, { users: authStore.listUsers(actor) });
      return;
    }

    let authenticatedUser = null;
    if (url.pathname.startsWith("/api/")) {
      authenticatedUser = requireAuthenticatedUser(request);
    }

    const replicationBudgetId = url.pathname.startsWith("/api/replication/")
      ? url.searchParams.get("budgetId")?.trim()
      : null;
    if (url.pathname.startsWith("/api/replication/")) {
      if (!replicationBudgetId) {
        throw Object.assign(new Error("budgetId is required for replication."), {
          statusCode: 400,
          code: "REPLICATION_BUDGET_REQUIRED",
        });
      }
      authStore.requireBudgetRole(
        authenticatedUser,
        replicationBudgetId,
        minimumBudgetRole(request.method),
      );
    }

    const localFirstBudgetId = url.pathname.startsWith("/api/local-first/")
      ? url.searchParams.get("budgetId")?.trim()
      : null;
    if (url.pathname.startsWith("/api/local-first/")) {
      if (!localFirstBudgetId) {
        throw Object.assign(new Error("budgetId is required for local-first relay."), {
          statusCode: 400,
          code: "LOCAL_FIRST_BUDGET_REQUIRED",
        });
      }
      const minimumRole =
        url.pathname === "/api/local-first/epoch/reset" ||
        url.pathname === "/api/local-first/metadata" ||
        url.pathname === "/api/local-first/budget"
          ? "owner"
          : minimumBudgetRole(request.method);
      const isExplicitProvisioning =
        url.pathname === "/api/local-first/budget" && request.method === "POST";
      const isIdempotentDeletion =
        url.pathname === "/api/local-first/budget" && request.method === "DELETE";
      if (!isExplicitProvisioning && !isIdempotentDeletion) {
        authStore.requireBudgetRole(authenticatedUser, localFirstBudgetId, minimumRole);
      }
    }

    if (url.pathname.startsWith("/api/budget-engine/")) {
      sendJson(response, 410, {
        code: "HOSTED_BUDGET_DOMAIN_RETIRED",
        message:
          "Hosted budget-domain APIs have been retired. " +
          "Use the local-first SQLite engine and relay protocol.",
      });
      return;
    }

    const blobMatch = url.pathname.match(/^\/api\/replication\/blobs\/(sha256%3A|sha256:)?([a-f0-9]{64})$/i);
    if (blobMatch && ["HEAD", "GET", "PUT"].includes(request.method ?? "")) {
      const generationId = validateGenerationId(url.searchParams.get("generationId"));
      const contentHash = `sha256:${blobMatch[2].toLowerCase()}`;
      if (request.method === "HEAD") {
        response.writeHead(replicationStore.hasBlob(replicationBudgetId, generationId, contentHash) ? 200 : 404, {
          "Cache-Control": "private, max-age=31536000, immutable",
        });
        response.end();
        return;
      }
      if (request.method === "GET") {
        const blob = replicationStore.readBlob(replicationBudgetId, generationId, contentHash);
        if (!blob) {
          sendJson(response, 404, { message: "Attachment blob was not found." });
          return;
        }
        response.writeHead(200, {
          "Content-Type": blob.metadata.mimeType,
          "Content-Length": String(blob.metadata.size),
          "Cache-Control": "private, max-age=31536000, immutable",
          ETag: `"${contentHash}"`,
        });
        response.end(blob.content);
        return;
      }
      const content = await readRequestBody(request);
      const mimeType = String(request.headers["content-type"] ?? "application/octet-stream");
      sendJson(response, 201, performAuthorizedBudgetMutation(
        authStore, authenticatedUser, replicationBudgetId, "editor",
        () => replicationStore.saveBlob(
          replicationBudgetId, generationId, contentHash, mimeType, content,
        ),
      ));
      return;
    }

    if (url.pathname === "/api/replication/generation" && request.method === "GET") {
      sendJson(response, 200, replicationStore.getGeneration(replicationBudgetId));
      return;
    }

    if (url.pathname === "/api/replication/operations/push" && request.method === "POST") {
      const body = await readJsonBody(request);
      validateReplicationProtocol(body.protocolVersion);
      const generationId = validateGenerationId(body.generationId);
      const operations = validateReplicationOperations(body.operations);
      sendJson(response, 200, performAuthorizedBudgetMutation(
        authStore, authenticatedUser, replicationBudgetId, "editor",
        () => replicationStore.pushOperations(replicationBudgetId, generationId, operations),
      ));
      return;
    }

    if (url.pathname === "/api/replication/operations/pull" && request.method === "GET") {
      const generationId = validateGenerationId(url.searchParams.get("generationId"));
      const afterCursor = validateCursor(url.searchParams.get("afterCursor") ?? "0", "afterCursor");
      const limit = validateCursor(url.searchParams.get("limit") ?? "500", "limit");
      if (limit < 1 || limit > 5000) throw new Error("limit must be between 1 and 5000.");
      sendJson(response, 200, replicationStore.pullOperations(
        replicationBudgetId, generationId, afterCursor, limit,
      ));
      return;
    }

    if (url.pathname === "/api/replication/checkpoints" && request.method === "POST") {
      const body = await readJsonBody(request);
      validateReplicationProtocol(body.protocolVersion);
      const generationId = validateGenerationId(body.generationId);
      const checkpoint = validateCheckpoint(body.checkpoint);
      sendJson(response, 201, performAuthorizedBudgetMutation(
        authStore, authenticatedUser, replicationBudgetId, "editor",
        () => replicationStore.saveCheckpoint(replicationBudgetId, generationId, checkpoint),
      ));
      return;
    }

    if (url.pathname === "/api/replication/checkpoints/latest" && request.method === "GET") {
      const generationId = validateGenerationId(url.searchParams.get("generationId"));
      const checkpoint = replicationStore.getLatestCheckpoint(
        replicationBudgetId, generationId,
      );
      // Missing is a valid state for a newly provisioned generation. Returning
      // an explicit nullable value avoids treating normal bootstrap as a failed
      // resource request in browsers.
      sendJson(response, 200, { checkpoint: checkpoint ?? null });
      return;
    }

    if (url.pathname === "/api/local-first/bootstrap" && request.method === "GET") {
      sendJson(response, 200, localFirstRelayStore.getBootstrap(localFirstBudgetId));
      return;
    }

    if (url.pathname === "/api/local-first/events" && request.method === "GET") {
      const bootstrap = localFirstRelayStore.getBootstrap(localFirstBudgetId);
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      });
      response.flushHeaders?.();
      response.write(
        "event: relay\n" +
        `data: ${JSON.stringify({
          type: "connected",
          budgetId: localFirstBudgetId,
          syncEpoch: bootstrap.syncEpoch,
          latestCursor: bootstrap.latestCursor,
        })}\n\n`,
      );
      const unsubscribe = localFirstRelayEvents.subscribe(
        localFirstBudgetId,
        response,
      );
      request.once("close", unsubscribe);
      response.once("close", unsubscribe);
      return;
    }

    if (url.pathname === "/api/local-first/epoch/reset" && request.method === "POST") {
      const body = await readJsonBody(request);
      const result = performAuthorizedBudgetMutation(
        authStore, authenticatedUser, localFirstBudgetId, "owner",
        () => localFirstRelayStore.resetEpoch(localFirstBudgetId, body.schemaVersion ?? 1),
      );
      sendJson(
        response,
        201,
        result,
      );
      localFirstRelayEvents.publish(localFirstBudgetId, {
        type: "epoch-reset",
        budgetId: localFirstBudgetId,
        syncEpoch: result.syncEpoch,
        latestCursor: 0,
      });
      return;
    }

    if (url.pathname === "/api/local-first/metadata" && request.method === "PUT") {
      const body = await readJsonBody(request);
      sendJson(
        response,
        200,
        performAuthorizedBudgetMutation(
          authStore, authenticatedUser, localFirstBudgetId, "owner",
          () => localFirstRelayStore.updateBudgetMetadata(localFirstBudgetId, body),
        ),
      );
      return;
    }

    if (url.pathname === "/api/local-first/budget" && request.method === "POST") {
      const role = authStore.claimBudget(authenticatedUser, localFirstBudgetId);
      sendJson(response, 201, { budgetId: localFirstBudgetId, role, provisioned: true });
      return;
    }

    if (url.pathname === "/api/local-first/budget" && request.method === "DELETE") {
      sendJson(response, 200, budgetDeletionLifecycle.deleteBudgetForUser(
        authenticatedUser,
        localFirstBudgetId,
      ));
      return;
    }

    if (url.pathname === "/api/local-first/restores" && request.method === "POST") {
      const body = await readJsonBody(request);
      const result = performAuthorizedBudgetMutation(
        authStore, authenticatedUser, localFirstBudgetId, "owner",
        () => localFirstRelayStore.beginRestore(localFirstBudgetId, body.expected, body.manifest),
      );
      sendJson(response, 201, result);
      return;
    }

    const localFirstRestoreMatch = url.pathname.match(/^\/api\/local-first\/restores\/([^/]+)\/commit$/);
    if (localFirstRestoreMatch && request.method === "POST") {
      const body = await readJsonBody(request);
      const result = performAuthorizedBudgetMutation(
        authStore, authenticatedUser, localFirstBudgetId, "owner",
        () => localFirstRelayStore.commitBaseline(localFirstBudgetId, body.syncEpoch,
          decodeURIComponent(localFirstRestoreMatch[1]), true),
      );
      sendJson(response, 201, result);
      localFirstRelayEvents.publish(localFirstBudgetId, {
        type: "epoch-reset", budgetId: localFirstBudgetId,
        syncEpoch: body.syncEpoch, latestCursor: 0,
      });
      return;
    }

    if (url.pathname === "/api/local-first/baselines" && request.method === "POST") {
      const body = await readJsonBody(request);
      sendJson(
        response,
        201,
        performAuthorizedBudgetMutation(
          authStore, authenticatedUser, localFirstBudgetId, "editor",
          () => localFirstRelayStore.beginBaseline(
            localFirstBudgetId,
            body.syncEpoch,
            body.manifest,
          ),
        ),
      );
      return;
    }

    const localFirstChunkMatch = url.pathname.match(
      /^\/api\/local-first\/baselines\/([^/]+)\/chunks\/(\d+)$/,
    );
    if (localFirstChunkMatch) {
      const baselineId = decodeURIComponent(localFirstChunkMatch[1]);
      const chunkIndex = validateCursor(localFirstChunkMatch[2], "chunkIndex");
      const syncEpoch = validateGenerationId(url.searchParams.get("syncEpoch"));
      if (request.method === "PUT") {
        const contentHash = String(request.headers["x-content-hash"] ?? "");
        const content = await readRequestBody(request, LOCAL_FIRST_MAX_CHUNK_BYTES);
        sendJson(
          response,
          201,
          performAuthorizedBudgetMutation(
            authStore, authenticatedUser, localFirstBudgetId, "editor",
            () => localFirstRelayStore.saveBaselineChunk(
              localFirstBudgetId,
              syncEpoch,
              baselineId,
              chunkIndex,
              contentHash,
              content,
            ),
          ),
        );
        return;
      }
      if (request.method === "GET") {
        const chunk = localFirstRelayStore.readBaselineChunk(
          localFirstBudgetId,
          syncEpoch,
          baselineId,
          chunkIndex,
        );
        response.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(chunk.metadata.size),
          "X-Content-Hash": chunk.metadata.contentHash,
          "Cache-Control": "private, no-store",
        });
        response.end(chunk.content);
        return;
      }
    }

    const localFirstCommitMatch = url.pathname.match(
      /^\/api\/local-first\/baselines\/([^/]+)\/commit$/,
    );
    if (localFirstCommitMatch && request.method === "POST") {
      const baselineId = decodeURIComponent(localFirstCommitMatch[1]);
      const body = await readJsonBody(request);
      const result = performAuthorizedBudgetMutation(
        authStore, authenticatedUser, localFirstBudgetId, "editor",
        () => localFirstRelayStore.commitBaseline(
          localFirstBudgetId,
          body.syncEpoch,
          baselineId,
        ),
      );
      sendJson(
        response,
        201,
        result,
      );
      localFirstRelayEvents.publish(localFirstBudgetId, {
        type: "baseline-committed",
        budgetId: localFirstBudgetId,
        syncEpoch: body.syncEpoch,
        latestCursor: result.baseCursor,
      });
      return;
    }

    if (url.pathname === "/api/local-first/mutations" && request.method === "POST") {
      const body = await readJsonBody(request);
      const result = performAuthorizedBudgetMutation(
        authStore, authenticatedUser, localFirstBudgetId, "editor",
        () => localFirstRelayStore.pushMutations(
          localFirstBudgetId,
          body.syncEpoch,
          body.mutations,
        ),
      );
      sendJson(
        response,
        200,
        result,
      );
      if (result.acceptedCount > 0) {
        localFirstRelayEvents.publish(localFirstBudgetId, {
          type: "mutations-available",
          budgetId: localFirstBudgetId,
          syncEpoch: body.syncEpoch,
          latestCursor: result.latestCursor,
        });
      }
      return;
    }

    if (url.pathname === "/api/local-first/mutations" && request.method === "GET") {
      const syncEpoch = validateGenerationId(url.searchParams.get("syncEpoch"));
      const afterCursor = validateCursor(
        url.searchParams.get("afterCursor") ?? "0",
        "afterCursor",
      );
      const limit = validateCursor(url.searchParams.get("limit") ?? "500", "limit");
      sendJson(
        response,
        200,
        localFirstRelayStore.pullMutations(
          localFirstBudgetId,
          syncEpoch,
          afterCursor,
          limit,
        ),
      );
      return;
    }

    if (request.method === "GET" && serveStatic(url.pathname, response)) return;

    sendJson(response, 404, { message: "Not found." });
  } catch (error) {
    if (error?.code === "GENERATION_MISMATCH") {
      sendJson(response, 409, {
        code: error.code,
        message: error.message,
        expectedGenerationId: error.expectedGenerationId,
        actualGenerationId: error.actualGenerationId,
      });
      return;
    }


    console.error(error);
    sendJson(response, Number.isInteger(error?.statusCode) ? error.statusCode : 400, {
      code: error?.code,
      message: error instanceof Error ? error.message : "Unexpected server error.",
      details: error?.details,
    });
  }
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(operationalBackupTimer);
  console.log(`Received ${signal}; closing Budget App server.`);
  const forcedExit = setTimeout(() => {
    console.error(`Graceful shutdown exceeded ${shutdownTimeoutMs}ms; forcing exit.`);
    process.exit(1);
  }, shutdownTimeoutMs);
  forcedExit.unref();

  server.close(() => {
    clearTimeout(forcedExit);
    database.close();
    process.exit(0);
  });
  server.closeIdleConnections?.();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.listen(port, host, () => {
  console.log(`Budget App server listening on http://${host}:${port}`);
  console.log(`Health: http://${host}:${port}/api/health`);
  console.log(`Readiness: http://${host}:${port}/api/ready`);
  console.log(`SQLite database: ${databasePath}`);
  if (!existsSync(webDist)) {
    console.log(`Web build not found at ${webDist}; API-only mode is active.`);
  }
});
