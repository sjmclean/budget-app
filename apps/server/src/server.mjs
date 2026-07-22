import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import Database from "better-sqlite3";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const dataDir = resolve(process.env.BUDGET_APP_DATA_DIR ?? join(process.cwd(), "apps/server/data"));
const databasePath = resolve(process.env.BUDGET_APP_DATABASE_PATH ?? join(dataDir, "shared-budget.sqlite"));
const webDist = resolve(process.env.BUDGET_APP_WEB_DIST ?? join(process.cwd(), "apps/web/dist"));

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

const applyOperations = database.transaction((operations) => {
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

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 50 * 1024 * 1024) {
      throw new Error("Request body exceeds the 50 MB limit.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function getSnapshot() {
  return {
    revision: readRevision.get().revision,
    entries: Object.fromEntries(readSnapshot.all().map((row) => [row.key, row.value])),
  };
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
        storage: "sqlite",
        databasePath,
        revision: readRevision.get().revision,
      });
      return;
    }

    if (url.pathname === "/api/shared-budget/storage" && request.method === "GET") {
      sendJson(response, 200, getSnapshot());
      return;
    }

    if (url.pathname === "/api/shared-budget/storage/batch" && request.method === "POST") {
      const body = await readJsonBody(request);
      const operations = validateOperations(body.operations);
      const revision = operations.length > 0 ? applyOperations(operations) : readRevision.get().revision;
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
      const revision = operations.length > 0 ? applyOperations(operations) : current.revision;
      sendJson(response, 201, { revision, importedKeys: operations.length });
      return;
    }

    if (request.method === "GET" && serveStatic(url.pathname, response)) return;

    sendJson(response, 404, { message: "Not found." });
  } catch (error) {
    console.error(error);
    sendJson(response, 400, {
      message: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

function shutdown(signal) {
  console.log(`Received ${signal}; closing shared budget server.`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.listen(port, host, () => {
  console.log(`Budget App shared server listening on http://${host}:${port}`);
  console.log(`SQLite database: ${databasePath}`);
  if (!existsSync(webDist)) {
    console.log(`Web build not found at ${webDist}; API-only mode is active.`);
  }
});
