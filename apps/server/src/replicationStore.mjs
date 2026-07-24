import { randomUUID } from "node:crypto";

export const REPLICATION_PROTOCOL_VERSION = 1;

export function createReplicationStore(database) {
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
      return { checkpointId: checkpoint.checkpointId };
    },

    getLatestCheckpoint(generationId) {
      assertActiveGeneration(generationId);
      const row = latestCheckpoint.get(generationId);
      return row ? JSON.parse(row.payloadJson) : null;
    },
  };
}
