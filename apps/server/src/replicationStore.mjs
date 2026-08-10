import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const REPLICATION_PROTOCOL_VERSION = 2;

export function createReplicationStore(database, options = {}) {
  const blobDirectory = options.blobDirectory;
  if (!blobDirectory) throw new Error("A replication blob directory is required.");
  mkdirSync(blobDirectory, { recursive: true });
  ensureScopedSchema(database);

  const readActiveGeneration = database.prepare(`
    SELECT generation_id AS generationId, created_at AS createdAt
    FROM replication_generations WHERE budget_id = ? AND is_active = 1
  `);
  const insertGeneration = database.prepare(`
    INSERT INTO replication_generations (budget_id, generation_id, created_at, is_active)
    VALUES (?, ?, ?, 1)
  `);
  const latestCursor = database.prepare(`
    SELECT COALESCE(MAX(cursor), 0) AS latestCursor
    FROM replication_operations WHERE budget_id = ? AND generation_id = ?
  `);
  const latestCheckpoint = database.prepare(`
    SELECT checkpoint_id AS checkpointId, payload_json AS payloadJson
    FROM replication_checkpoints
    WHERE budget_id = ? AND generation_id = ?
    ORDER BY created_at DESC, checkpoint_id DESC LIMIT 1
  `);
  const insertOperation = database.prepare(`
    INSERT OR IGNORE INTO replication_operations (
      budget_id, generation_id, operation_id, device_id, device_sequence,
      received_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const readOperationByIdentity = database.prepare(`
    SELECT operation_id AS operationId, device_id AS deviceId,
      device_sequence AS deviceSequence, payload_json AS payloadJson
    FROM replication_operations
    WHERE budget_id = ? AND generation_id = ?
      AND (operation_id = ? OR (device_id = ? AND device_sequence = ?))
    LIMIT 1
  `);
  const readOperations = database.prepare(`
    SELECT cursor, generation_id AS generationId, received_at AS receivedAt,
      payload_json AS payloadJson
    FROM replication_operations
    WHERE budget_id = ? AND generation_id = ? AND cursor > ?
    ORDER BY cursor ASC LIMIT ?
  `);
  const insertCheckpoint = database.prepare(`
    INSERT INTO replication_checkpoints (
      budget_id, checkpoint_id, generation_id, created_at,
      through_sequence, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(budget_id, checkpoint_id) DO UPDATE SET
      generation_id = excluded.generation_id,
      created_at = excluded.created_at,
      through_sequence = excluded.through_sequence,
      payload_json = excluded.payload_json
  `);
  const readBlobMetadata = database.prepare(`
    SELECT content_hash AS contentHash, size, mime_type AS mimeType,
      created_at AS createdAt
    FROM replication_blobs WHERE budget_id = ? AND content_hash = ?
  `);
  const upsertBlob = database.prepare(`
    INSERT INTO replication_blobs (
      budget_id, content_hash, size, mime_type, created_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(budget_id, content_hash) DO UPDATE SET
      size = excluded.size, mime_type = excluded.mime_type
  `);
  const pruneCheckpoints = database.prepare(`
    DELETE FROM replication_checkpoints
    WHERE budget_id = ? AND generation_id = ? AND checkpoint_id NOT IN (
      SELECT checkpoint_id FROM replication_checkpoints
      WHERE budget_id = ? AND generation_id = ?
      ORDER BY created_at DESC, checkpoint_id DESC LIMIT 5
    )
  `);
  const deleteBudgetReplication = database.transaction((budgetId) => {
    const contentHashes = database.prepare(
      "SELECT content_hash AS contentHash FROM replication_blobs WHERE budget_id = ?",
    ).all(budgetId).map(({ contentHash }) => contentHash);
    database.prepare("DELETE FROM replication_operations WHERE budget_id = ?").run(budgetId);
    database.prepare("DELETE FROM replication_checkpoints WHERE budget_id = ?").run(budgetId);
    database.prepare("DELETE FROM replication_blobs WHERE budget_id = ?").run(budgetId);
    database.prepare("DELETE FROM replication_generations WHERE budget_id = ?").run(budgetId);
    return contentHashes;
  });
  const blobStillReferenced = database.prepare(
    "SELECT 1 FROM replication_blobs WHERE content_hash = ? LIMIT 1",
  );

  const pushTransaction = database.transaction((budgetId, generationId, operations) => {
    let acceptedCount = 0;
    let acknowledgedCount = 0;
    const receivedAt = new Date().toISOString();
    for (const operation of operations) {
      assertBudgetMutationKey(budgetId, operation.mutation?.key);
      const payloadJson = JSON.stringify(operation);
      const result = insertOperation.run(
        budgetId, generationId, operation.operationId, operation.deviceId,
        operation.sequence, receivedAt, payloadJson,
      );
      if (result.changes === 1) {
        acceptedCount += 1;
        acknowledgedCount += 1;
        continue;
      }
      const existing = readOperationByIdentity.get(
        budgetId, generationId, operation.operationId,
        operation.deviceId, operation.sequence,
      );
      if (
        existing?.operationId === operation.operationId &&
        existing.deviceId === operation.deviceId &&
        existing.deviceSequence === operation.sequence &&
        existing.payloadJson === payloadJson
      ) {
        acknowledgedCount += 1;
        continue;
      }
      throw codedError(
        "OPERATION_COLLISION",
        `Replication operation collision for device ${operation.deviceId} sequence ${operation.sequence}.`,
      );
    }
    return {
      acceptedCount,
      acknowledgedCount,
      latestCursor: latestCursor.get(budgetId, generationId).latestCursor,
    };
  });

  function ensureGeneration(budgetId) {
    assertBudgetId(budgetId);
    let generation = readActiveGeneration.get(budgetId);
    if (!generation) {
      generation = { generationId: randomUUID(), createdAt: new Date().toISOString() };
      insertGeneration.run(budgetId, generation.generationId, generation.createdAt);
    }
    return generation;
  }

  function assertActiveGeneration(budgetId, generationId) {
    const active = ensureGeneration(budgetId);
    if (generationId !== active.generationId) {
      const error = codedError(
        "GENERATION_MISMATCH",
        "Replication generation does not match the active budget generation.",
      );
      error.expectedGenerationId = active.generationId;
      error.actualGenerationId = generationId;
      throw error;
    }
    return active;
  }

  return {
    getGeneration(budgetId) {
      const generation = ensureGeneration(budgetId);
      const checkpoint = latestCheckpoint.get(budgetId, generation.generationId);
      const payload = checkpoint ? JSON.parse(checkpoint.payloadJson) : null;
      return {
        protocolVersion: REPLICATION_PROTOCOL_VERSION,
        budgetId,
        generationId: generation.generationId,
        latestCursor: latestCursor.get(budgetId, generation.generationId).latestCursor,
        latestCheckpointId: checkpoint?.checkpointId ?? null,
        latestCheckpointIntegrityHash: payload?.integrityHash ?? null,
        latestCheckpointRemoteCursor: payload?.replicatedThroughCursor ?? null,
      };
    },

    pushOperations(budgetId, generationId, operations) {
      assertActiveGeneration(budgetId, generationId);
      return { generationId, ...pushTransaction(budgetId, generationId, operations) };
    },

    pullOperations(budgetId, generationId, afterCursor, limit) {
      assertActiveGeneration(budgetId, generationId);
      const rows = readOperations.all(budgetId, generationId, afterCursor, limit + 1);
      const selected = rows.slice(0, limit);
      return {
        generationId,
        operations: selected.map((row) => ({
          cursor: row.cursor,
          generationId: row.generationId,
          receivedAt: row.receivedAt,
          operation: JSON.parse(row.payloadJson),
        })),
        latestCursor: latestCursor.get(budgetId, generationId).latestCursor,
        hasMore: rows.length > limit,
      };
    },

    saveCheckpoint(budgetId, generationId, checkpoint) {
      assertActiveGeneration(budgetId, generationId);
      assertBudgetCheckpoint(budgetId, checkpoint);
      insertCheckpoint.run(
        budgetId, checkpoint.checkpointId, generationId, checkpoint.createdAt,
        checkpoint.throughSequence, JSON.stringify(checkpoint),
      );
      pruneCheckpoints.run(budgetId, generationId, budgetId, generationId);
      return {
        checkpointId: checkpoint.checkpointId,
        acknowledgedThroughSequence: checkpoint.throughSequence,
        integrityHash: checkpoint.integrityHash,
        replicatedThroughCursor: checkpoint.replicatedThroughCursor,
      };
    },

    getLatestCheckpoint(budgetId, generationId) {
      assertActiveGeneration(budgetId, generationId);
      const row = latestCheckpoint.get(budgetId, generationId);
      return row ? JSON.parse(row.payloadJson) : null;
    },

    hasBlob(budgetId, generationId, contentHash) {
      assertActiveGeneration(budgetId, generationId);
      assertContentHash(contentHash);
      return Boolean(
        readBlobMetadata.get(budgetId, contentHash) && existsSync(blobPath(contentHash)),
      );
    },

    saveBlob(budgetId, generationId, contentHash, mimeType, content) {
      assertActiveGeneration(budgetId, generationId);
      assertContentHash(contentHash);
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (digest !== contentHash) {
        throw codedError(
          "BLOB_HASH_MISMATCH",
          "Attachment blob content does not match its SHA-256 address.",
        );
      }
      const destination = blobPath(contentHash);
      if (!existsSync(destination)) {
        const temporary = `${destination}.${randomUUID()}.tmp`;
        try {
          writeFileSync(temporary, content, { flag: "wx" });
          renameSync(temporary, destination);
        } finally {
          if (existsSync(temporary)) rmSync(temporary, { force: true });
        }
      }
      upsertBlob.run(
        budgetId, contentHash, content.byteLength,
        mimeType || "application/octet-stream", new Date().toISOString(),
      );
      return { contentHash, size: content.byteLength };
    },

    readBlob(budgetId, generationId, contentHash) {
      assertActiveGeneration(budgetId, generationId);
      assertContentHash(contentHash);
      const metadata = readBlobMetadata.get(budgetId, contentHash);
      const path = blobPath(contentHash);
      if (!metadata || !existsSync(path)) return null;
      return { metadata, content: readFileSync(path) };
    },

    deleteBudget(budgetId) {
      assertBudgetId(budgetId);
      const contentHashes = deleteBudgetReplication(budgetId);
      let deletedBlobCount = 0;
      for (const contentHash of contentHashes) {
        if (blobStillReferenced.get(contentHash)) continue;
        const path = blobPath(contentHash);
        if (existsSync(path)) {
          rmSync(path, { force: true });
          deletedBlobCount += 1;
        }
      }
      return { deletedBlobCount };
    },
  };

  function blobPath(contentHash) {
    return join(blobDirectory, contentHash.slice("sha256:".length));
  }
}

export function ensureScopedSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS replication_generations (
      budget_id TEXT NOT NULL,
      generation_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (budget_id, generation_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS replication_one_active_generation_per_budget
      ON replication_generations(budget_id) WHERE is_active = 1;
    CREATE TABLE IF NOT EXISTS replication_operations (
      cursor INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id TEXT NOT NULL,
      generation_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_sequence INTEGER NOT NULL,
      received_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE(budget_id, generation_id, operation_id),
      UNIQUE(budget_id, generation_id, device_id, device_sequence)
    );
    CREATE INDEX IF NOT EXISTS replication_operations_budget_generation_cursor
      ON replication_operations(budget_id, generation_id, cursor);
    CREATE TABLE IF NOT EXISTS replication_checkpoints (
      budget_id TEXT NOT NULL,
      checkpoint_id TEXT NOT NULL,
      generation_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      through_sequence INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (budget_id, checkpoint_id)
    );
    CREATE INDEX IF NOT EXISTS replication_checkpoints_budget_generation_created
      ON replication_checkpoints(budget_id, generation_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS replication_blobs (
      budget_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (budget_id, content_hash)
    );
  `);
}

function assertBudgetCheckpoint(budgetId, checkpoint) {
  for (const key of Object.keys(checkpoint?.entries ?? {})) {
    assertBudgetMutationKey(budgetId, key);
  }
}

function assertBudgetMutationKey(budgetId, key) {
  if (typeof key !== "string" || !key.startsWith(`budget-app.budgets.${budgetId}.`)) {
    throw codedError(
      "REPLICATION_KEY_OUT_OF_SCOPE",
      "Replication payload contains a key outside the requested budget.",
    );
  }
}

function assertBudgetId(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    throw codedError("INVALID_BUDGET_ID", "A valid budgetId is required.");
  }
}

function assertContentHash(value) {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("Attachment content hashes must be canonical SHA-256 values.");
  }
}

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}
