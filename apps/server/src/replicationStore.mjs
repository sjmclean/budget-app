import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const REPLICATION_PROTOCOL_VERSION = 1;

export function createReplicationStore(database, options = {}) {
  const blobDirectory = options.blobDirectory;
  if (!blobDirectory) throw new Error("A replication blob directory is required.");
  mkdirSync(blobDirectory, { recursive: true });
  database.exec(`
    CREATE TABLE IF NOT EXISTS replication_generations (
      generation_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0
    );

    CREATE UNIQUE INDEX IF NOT EXISTS replication_one_active_generation
      ON replication_generations(is_active) WHERE is_active = 1;

    CREATE TABLE IF NOT EXISTS replication_operations (
      cursor INTEGER PRIMARY KEY AUTOINCREMENT,
      generation_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_sequence INTEGER NOT NULL,
      received_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      UNIQUE(generation_id, operation_id),
      UNIQUE(generation_id, device_id, device_sequence)
    );

    CREATE INDEX IF NOT EXISTS replication_operations_generation_cursor
      ON replication_operations(generation_id, cursor);

    CREATE TABLE IF NOT EXISTS replication_checkpoints (
      checkpoint_id TEXT PRIMARY KEY,
      generation_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      through_sequence INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS replication_checkpoints_generation_created
      ON replication_checkpoints(generation_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS replication_blobs (
      content_hash TEXT PRIMARY KEY,
      size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const readActiveGeneration = database.prepare(`
    SELECT generation_id AS generationId, created_at AS createdAt
    FROM replication_generations WHERE is_active = 1
  `);
  const insertGeneration = database.prepare(`
    INSERT INTO replication_generations (generation_id, created_at, is_active)
    VALUES (?, ?, 1)
  `);
  const latestCursor = database.prepare(`
    SELECT COALESCE(MAX(cursor), 0) AS latestCursor
    FROM replication_operations WHERE generation_id = ?
  `);
  const latestCheckpoint = database.prepare(`
    SELECT checkpoint_id AS checkpointId, payload_json AS payloadJson
    FROM replication_checkpoints
    WHERE generation_id = ?
    ORDER BY created_at DESC, checkpoint_id DESC LIMIT 1
  `);
  const insertOperation = database.prepare(`
    INSERT OR IGNORE INTO replication_operations (
      generation_id, operation_id, device_id, device_sequence, received_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const readOperations = database.prepare(`
    SELECT cursor, generation_id AS generationId, received_at AS receivedAt, payload_json AS payloadJson
    FROM replication_operations
    WHERE generation_id = ? AND cursor > ?
    ORDER BY cursor ASC LIMIT ?
  `);
  const insertCheckpoint = database.prepare(`
    INSERT INTO replication_checkpoints (
      checkpoint_id, generation_id, created_at, through_sequence, payload_json
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(checkpoint_id) DO UPDATE SET
      generation_id = excluded.generation_id,
      created_at = excluded.created_at,
      through_sequence = excluded.through_sequence,
      payload_json = excluded.payload_json
  `);

  const readBlob = database.prepare(`
    SELECT content_hash AS contentHash, size, mime_type AS mimeType, created_at AS createdAt
    FROM replication_blobs WHERE content_hash = ?
  `);
  const upsertBlob = database.prepare(`
    INSERT INTO replication_blobs (content_hash, size, mime_type, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(content_hash) DO UPDATE SET
      size = excluded.size,
      mime_type = excluded.mime_type
  `);

  const pruneCheckpoints = database.prepare(`
    DELETE FROM replication_checkpoints
    WHERE generation_id = ? AND checkpoint_id NOT IN (
      SELECT checkpoint_id FROM replication_checkpoints
      WHERE generation_id = ?
      ORDER BY created_at DESC, checkpoint_id DESC LIMIT 5
    )
  `);

  const pushTransaction = database.transaction((generationId, operations) => {
    let acceptedCount = 0;
    const receivedAt = new Date().toISOString();
    for (const operation of operations) {
      const result = insertOperation.run(
        generationId,
        operation.operationId,
        operation.deviceId,
        operation.sequence,
        receivedAt,
        JSON.stringify(operation),
      );
      acceptedCount += result.changes;
    }
    return { acceptedCount, latestCursor: latestCursor.get(generationId).latestCursor };
  });

  function ensureGeneration() {
    let generation = readActiveGeneration.get();
    if (!generation) {
      generation = { generationId: randomUUID(), createdAt: new Date().toISOString() };
      insertGeneration.run(generation.generationId, generation.createdAt);
    }
    return generation;
  }

  function assertActiveGeneration(generationId) {
    const active = ensureGeneration();
    if (generationId !== active.generationId) {
      const error = new Error("Replication generation does not match the active server generation.");
      error.code = "GENERATION_MISMATCH";
      error.expectedGenerationId = active.generationId;
      error.actualGenerationId = generationId;
      throw error;
    }
    return active;
  }

  return {
    getGeneration() {
      const generation = ensureGeneration();
      const checkpoint = latestCheckpoint.get(generation.generationId);
      return {
        protocolVersion: REPLICATION_PROTOCOL_VERSION,
        generationId: generation.generationId,
        latestCursor: latestCursor.get(generation.generationId).latestCursor,
        latestCheckpointId: checkpoint?.checkpointId ?? null,
      };
    },

    pushOperations(generationId, operations) {
      assertActiveGeneration(generationId);
      const result = pushTransaction(generationId, operations);
      return { generationId, ...result };
    },

    pullOperations(generationId, afterCursor, limit) {
      assertActiveGeneration(generationId);
      const rows = readOperations.all(generationId, afterCursor, limit + 1);
      const hasMore = rows.length > limit;
      const selected = rows.slice(0, limit);
      return {
        generationId,
        operations: selected.map((row) => ({
          cursor: row.cursor,
          generationId: row.generationId,
          receivedAt: row.receivedAt,
          operation: JSON.parse(row.payloadJson),
        })),
        latestCursor: latestCursor.get(generationId).latestCursor,
        hasMore,
      };
    },

    saveCheckpoint(generationId, checkpoint) {
      assertActiveGeneration(generationId);
      insertCheckpoint.run(
        checkpoint.checkpointId,
        generationId,
        checkpoint.createdAt,
        checkpoint.throughSequence,
        JSON.stringify(checkpoint),
      );
      pruneCheckpoints.run(generationId, generationId);
      return { checkpointId: checkpoint.checkpointId, acknowledgedThroughSequence: checkpoint.throughSequence };
    },

    getLatestCheckpoint(generationId) {
      assertActiveGeneration(generationId);
      const row = latestCheckpoint.get(generationId);
      return row ? JSON.parse(row.payloadJson) : null;
    },


    hasBlob(generationId, contentHash) {
      assertActiveGeneration(generationId);
      assertContentHash(contentHash);
      const row = readBlob.get(contentHash);
      return Boolean(row && existsSync(blobPath(contentHash)));
    },

    saveBlob(generationId, contentHash, mimeType, content) {
      assertActiveGeneration(generationId);
      assertContentHash(contentHash);
      const digest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
      if (digest !== contentHash) {
        const error = new Error("Attachment blob content does not match its SHA-256 address.");
        error.code = "BLOB_HASH_MISMATCH";
        throw error;
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
      upsertBlob.run(contentHash, content.byteLength, mimeType || "application/octet-stream", new Date().toISOString());
      return { contentHash, size: content.byteLength };
    },

    readBlob(generationId, contentHash) {
      assertActiveGeneration(generationId);
      assertContentHash(contentHash);
      const metadata = readBlob.get(contentHash);
      const path = blobPath(contentHash);
      if (!metadata || !existsSync(path)) return null;
      return { metadata, content: readFileSync(path) };
    },
  };

  function blobPath(contentHash) {
    return join(blobDirectory, contentHash.slice("sha256:".length));
  }
}

function assertContentHash(value) {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error("Attachment content hashes must be canonical SHA-256 values.");
  }
}
