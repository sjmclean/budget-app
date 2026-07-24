import { createServer } from "node:http";
import { accessSync, constants, createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createReplicationStore, REPLICATION_PROTOCOL_VERSION } from "./replicationStore.mjs";
import { readServerRuntimeConfig } from "./runtimeConfig.mjs";

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
} = runtimeConfig;
const startedAt = new Date().toISOString();

mkdirSync(dataDir, { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("synchronous = NORMAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS shared_storage (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS shared_storage_metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  INSERT OR IGNORE INTO shared_storage_metadata (id, revision) VALUES (1, 0);
`);

mkdirSync(replicationBlobDir, { recursive: true });
const replicationStore = createReplicationStore(database, {
  blobDirectory: replicationBlobDir,
});

const readSnapshot = database.prepare("SELECT key, value FROM shared_storage ORDER BY key");
const readRevision = database.prepare("SELECT revision FROM shared_storage_metadata WHERE id = 1");
const upsertEntry = database.prepare(`
  INSERT INTO shared_storage (key, value, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
`);
const deleteEntry = database.prepare("DELETE FROM shared_storage WHERE key = ?");
const bumpRevision = database.prepare(`
  UPDATE shared_storage_metadata
  SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = 1
`);

class RevisionConflictError extends Error {
  constructor(expectedRevision, actualRevision) {
    super(
      `Shared budget changed on another device. Expected revision ${expectedRevision}, but the server is at revision ${actualRevision}.`,
    );
    this.name = "RevisionConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

const revisionSubscribers = new Set();

function sendRevisionEvent(response, revision) {
  response.write(`event: revision\ndata: ${JSON.stringify({ revision })}\n\n`);
}

function broadcastRevision(revision) {
  for (const response of revisionSubscribers) {
    sendRevisionEvent(response, revision);
  }
}

function subscribeToRevisions(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.write("retry: 5000\n\n");
  sendRevisionEvent(response, readRevision.get().revision);
  revisionSubscribers.add(response);

  const heartbeat = setInterval(() => {
    response.write(": keep-alive\n\n");
  }, 25_000);

  const unsubscribe = () => {
    clearInterval(heartbeat);
    revisionSubscribers.delete(response);
  };

  request.once("close", unsubscribe);
  response.once("close", unsubscribe);
}

const applyOperations = database.transaction((operations, expectedRevision) => {
  const actualRevision = readRevision.get().revision;
  if (actualRevision !== expectedRevision) {
    throw new RevisionConflictError(expectedRevision, actualRevision);
  }

  for (const operation of operations) {
    if (operation.type === "set") {
      upsertEntry.run(operation.key, operation.value);
    } else {
      deleteEntry.run(operation.key);
    }
  }
  bumpRevision.run();
  return readRevision.get().revision;
});

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
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

function getSnapshot() {
  return {
    revision: readRevision.get().revision,
    entries: Object.fromEntries(readSnapshot.all().map((row) => [row.key, row.value])),
  };
}

function validateRevision(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return value;
}

function validateOperations(value) {
  if (!Array.isArray(value)) throw new Error("operations must be an array.");
  return value.map((operation) => {
    if (!operation || typeof operation !== "object") throw new Error("Invalid storage operation.");
    if (operation.type !== "set" && operation.type !== "remove") throw new Error("Unsupported storage operation type.");
    if (typeof operation.key !== "string" || operation.key.length === 0) throw new Error("Storage operation key is required.");
    if (operation.type === "set" && typeof operation.value !== "string") throw new Error("Set operations require a string value.");
    return operation;
  });
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
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname === "/api/health" && request.method === "GET") {
      sendJson(response, 200, {
        status: "ok",
        service: "budget-app-server",
        startedAt,
        uptimeSeconds: Math.floor(process.uptime()),
        protocolVersion: REPLICATION_PROTOCOL_VERSION,
        serverTime: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === "/api/ready" && request.method === "GET") {
      try {
        const generation = replicationStore.getGeneration();
        const revision = readRevision.get().revision;
        accessSync(dataDir, constants.R_OK | constants.W_OK);
        accessSync(replicationBlobDir, constants.R_OK | constants.W_OK);
        sendJson(response, 200, {
          status: "ready",
          service: "budget-app-server",
          storage: "sqlite",
          protocolVersion: REPLICATION_PROTOCOL_VERSION,
          generationId: generation.generationId,
          revision,
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



    const blobMatch = url.pathname.match(/^\/api\/replication\/blobs\/(sha256%3A|sha256:)?([a-f0-9]{64})$/i);
    if (blobMatch && ["HEAD", "GET", "PUT"].includes(request.method ?? "")) {
      const generationId = validateGenerationId(url.searchParams.get("generationId"));
      const contentHash = `sha256:${blobMatch[2].toLowerCase()}`;
      if (request.method === "HEAD") {
        response.writeHead(replicationStore.hasBlob(generationId, contentHash) ? 200 : 404, {
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        response.end();
        return;
      }
      if (request.method === "GET") {
        const blob = replicationStore.readBlob(generationId, contentHash);
        if (!blob) {
          sendJson(response, 404, { message: "Attachment blob was not found." });
          return;
        }
        response.writeHead(200, {
          "Content-Type": blob.metadata.mimeType,
          "Content-Length": String(blob.metadata.size),
          "Cache-Control": "public, max-age=31536000, immutable",
          ETag: `"${contentHash}"`,
        });
        response.end(blob.content);
        return;
      }
      const content = await readRequestBody(request);
      const mimeType = String(request.headers["content-type"] ?? "application/octet-stream");
      sendJson(response, 201, replicationStore.saveBlob(generationId, contentHash, mimeType, content));
      return;
    }

    if (url.pathname === "/api/replication/generation" && request.method === "GET") {
      sendJson(response, 200, replicationStore.getGeneration());
      return;
    }

    if (url.pathname === "/api/replication/operations/push" && request.method === "POST") {
      const body = await readJsonBody(request);
      validateReplicationProtocol(body.protocolVersion);
      const generationId = validateGenerationId(body.generationId);
      const operations = validateReplicationOperations(body.operations);
      sendJson(response, 200, replicationStore.pushOperations(generationId, operations));
      return;
    }

    if (url.pathname === "/api/replication/operations/pull" && request.method === "GET") {
      const generationId = validateGenerationId(url.searchParams.get("generationId"));
      const afterCursor = validateCursor(url.searchParams.get("afterCursor") ?? "0", "afterCursor");
      const limit = validateCursor(url.searchParams.get("limit") ?? "500", "limit");
      if (limit < 1 || limit > 5000) throw new Error("limit must be between 1 and 5000.");
      sendJson(response, 200, replicationStore.pullOperations(generationId, afterCursor, limit));
      return;
    }

    if (url.pathname === "/api/replication/checkpoints" && request.method === "POST") {
      const body = await readJsonBody(request);
      validateReplicationProtocol(body.protocolVersion);
      const generationId = validateGenerationId(body.generationId);
      const checkpoint = validateCheckpoint(body.checkpoint);
      sendJson(response, 201, replicationStore.saveCheckpoint(generationId, checkpoint));
      return;
    }

    if (url.pathname === "/api/replication/checkpoints/latest" && request.method === "GET") {
      const generationId = validateGenerationId(url.searchParams.get("generationId"));
      const checkpoint = replicationStore.getLatestCheckpoint(generationId);
      if (!checkpoint) {
        sendJson(response, 404, { message: "No checkpoint is available for this generation." });
        return;
      }
      sendJson(response, 200, { checkpoint });
      return;
    }

    if (url.pathname === "/api/shared-budget/events" && request.method === "GET") {
      subscribeToRevisions(request, response);
      return;
    }

    if (url.pathname === "/api/shared-budget/storage" && request.method === "GET") {
      sendJson(response, 200, getSnapshot());
      return;
    }

    if (url.pathname === "/api/shared-budget/storage/batch" && request.method === "POST") {
      const body = await readJsonBody(request);
      const operations = validateOperations(body.operations);
      const expectedRevision = validateRevision(
        body.expectedRevision,
        "expectedRevision",
      );
      const revision = operations.length > 0
        ? applyOperations(operations, expectedRevision)
        : readRevision.get().revision;
      if (operations.length > 0) {
        broadcastRevision(revision);
      }
      sendJson(response, 200, { revision });
      return;
    }

    if (url.pathname === "/api/shared-budget/storage/bootstrap" && request.method === "POST") {
      const current = getSnapshot();
      if (Object.keys(current.entries).length > 0) {
        sendJson(response, 409, { message: "Shared storage has already been initialised.", ...current });
        return;
      }
      const body = await readJsonBody(request);
      const entries = body.entries;
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
        throw new Error("entries must be an object containing string values.");
      }
      const operations = Object.entries(entries).map(([key, value]) => {
        if (typeof value !== "string") throw new Error(`Entry ${key} must contain a string value.`);
        return { type: "set", key, value };
      });
      const revision = operations.length > 0
        ? applyOperations(operations, current.revision)
        : current.revision;
      if (operations.length > 0) {
        broadcastRevision(revision);
      }
      sendJson(response, 201, { revision, importedKeys: operations.length });
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

    if (error instanceof RevisionConflictError) {
      sendJson(response, 409, {
        code: "REVISION_CONFLICT",
        message: error.message,
        expectedRevision: error.expectedRevision,
        actualRevision: error.actualRevision,
      });
      return;
    }

    console.error(error);
    sendJson(response, 400, {
      message: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing Budget App server.`);
  for (const response of revisionSubscribers) response.end();
  revisionSubscribers.clear();

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
