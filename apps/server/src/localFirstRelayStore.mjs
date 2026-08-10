import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const LOCAL_FIRST_RELAY_PROTOCOL_VERSION = 2;
export const LOCAL_FIRST_MAX_CHUNK_BYTES = 4 * 1024 * 1024;
export const LOCAL_FIRST_MAX_MUTATION_BATCH = 1_000;
export const LOCAL_FIRST_REQUIRED_DOMAINS = [
  "accounts",
  "transactions",
  "payees",
  "categories",
  "budgetMonths",
  "scheduledTransactions",
  "transactionTags",
];

export function createLocalFirstRelayStore(database, options = {}) {
  const blobDirectory = options.blobDirectory;
  if (!blobDirectory) throw new Error("A local-first relay blob directory is required.");
  mkdirSync(blobDirectory, { recursive: true });
  ensureLocalFirstRelaySchema(database);

  const readEpoch = database.prepare(`
    SELECT budget_id AS budgetId, sync_epoch AS syncEpoch,
      schema_version AS schemaVersion, baseline_id AS baselineId,
      latest_cursor AS latestCursor, created_at AS createdAt,
      reset_at AS resetAt
    FROM local_first_sync_epochs WHERE budget_id = ?
  `);
  const insertEpoch = database.prepare(`
    INSERT INTO local_first_sync_epochs(
      budget_id, sync_epoch, schema_version, baseline_id,
      latest_cursor, created_at, reset_at
    ) VALUES (?, ?, ?, NULL, 0, ?, NULL)
  `);
  const readBaseline = database.prepare(`
    SELECT baseline_id AS baselineId, budget_id AS budgetId,
      sync_epoch AS syncEpoch, manifest_json AS manifestJson,
      state, created_at AS createdAt, committed_at AS committedAt
    FROM local_first_baselines WHERE baseline_id = ?
  `);
  const readChunk = database.prepare(`
    SELECT content_hash AS contentHash, size
    FROM local_first_baseline_chunks
    WHERE baseline_id = ? AND chunk_index = ?
  `);
  const listChunks = database.prepare(`
    SELECT chunk_index AS chunkIndex, content_hash AS contentHash, size
    FROM local_first_baseline_chunks
    WHERE baseline_id = ? ORDER BY chunk_index
  `);
  const upsertBudgetMetadata = database.prepare(`
    INSERT INTO local_first_budget_metadata(
      budget_id, budget_name, currency, updated_at
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(budget_id) DO UPDATE SET
      budget_name = excluded.budget_name,
      currency = excluded.currency,
      updated_at = excluded.updated_at
  `);

  const resetEpochTransaction = database.transaction((budgetId, schemaVersion, timestamp) => {
    const previous = readEpoch.get(budgetId);
    const syncEpoch = randomUUID();
    if (previous) {
      database.prepare(`
        UPDATE local_first_sync_epochs SET
          sync_epoch = ?, schema_version = ?, baseline_id = NULL,
          latest_cursor = 0, reset_at = ?
        WHERE budget_id = ?
      `).run(syncEpoch, schemaVersion, timestamp, budgetId);
      database.prepare(
        "DELETE FROM local_first_mutations WHERE budget_id = ?",
      ).run(budgetId);
    } else {
      insertEpoch.run(budgetId, syncEpoch, schemaVersion, timestamp);
    }
    return { previousEpoch: previous?.syncEpoch ?? null, syncEpoch };
  });

  const commitBaselineTransaction = database.transaction((
    budgetId,
    syncEpoch,
    baselineId,
    committedAt,
  ) => {
    const epoch = requireEpoch(budgetId, syncEpoch);
    const baseline = readBaseline.get(baselineId);
    const manifest = JSON.parse(baseline.manifestJson);
    if ((epoch.baselineId ?? null) !== manifest.previousBaselineId) {
      throw relayError(
        409,
        "BASELINE_SUPERSEDED",
        "Another device replaced the relay baseline while this baseline was uploading.",
      );
    }
    if (manifest.baseCursor > epoch.latestCursor) {
      throw relayError(
        409,
        "BASELINE_CURSOR_AHEAD",
        "Baseline cursor is ahead of the durable mutation stream.",
      );
    }
    assertNonDestructiveBaselineProgression(
      budgetId,
      syncEpoch,
      epoch.baselineId ? readBaseline.get(epoch.baselineId) : null,
      manifest,
    );
    database.prepare(`
      UPDATE local_first_baselines
      SET state = 'committed', committed_at = ?
      WHERE baseline_id = ? AND budget_id = ? AND sync_epoch = ?
    `).run(committedAt, baselineId, budgetId, syncEpoch);
    database.prepare(`
      UPDATE local_first_sync_epochs SET baseline_id = ?
      WHERE budget_id = ? AND sync_epoch = ?
    `).run(baselineId, budgetId, syncEpoch);
    const compactedMutationCount = database.prepare(`
      DELETE FROM local_first_mutations
      WHERE budget_id = ? AND sync_epoch = ? AND cursor <= ?
    `).run(budgetId, syncEpoch, manifest.baseCursor).changes;
    return {
      previousBaselineId: epoch.baselineId ?? null,
      compactedMutationCount,
      baseCursor: manifest.baseCursor,
    };
  });

  function assertNonDestructiveBaselineProgression(
    budgetId,
    syncEpoch,
    previousBaseline,
    nextManifest,
  ) {
    if (!previousBaseline) return;
    const previousManifest = readStoredBaselineManifest(previousBaseline);
    const regressions = LOCAL_FIRST_REQUIRED_DOMAINS.filter(
      (domain) => nextManifest.counts[domain] < previousManifest.counts[domain],
    );
    if (regressions.length === 0) return;
    const unsupported = regressions.filter((domain) => {
      if (nextManifest.baseCursor <= previousManifest.baseCursor) return true;
      return !database.prepare(`
        SELECT 1
        FROM local_first_mutations
        WHERE budget_id = ? AND sync_epoch = ?
          AND cursor > ? AND cursor <= ?
          AND json_extract(payload_json, '$.domain') = ?
          AND json_extract(payload_json, '$.operation') = 'delete'
        LIMIT 1
      `).get(
        budgetId,
        syncEpoch,
        previousManifest.baseCursor,
        nextManifest.baseCursor,
        domain,
      );
    });
    if (unsupported.length > 0) {
      throw relayError(
        409,
        "BASELINE_DATA_REGRESSION",
        `Refusing to replace a populated baseline with unexplained reductions in: ${unsupported.join(", ")}.`,
        {
          domains: unsupported,
          previousBaselineId: previousBaseline.baselineId,
        },
      );
    }
  }

  function ensureEpoch(budgetId, schemaVersion = 1) {
    assertBudgetId(budgetId);
    let epoch = readEpoch.get(budgetId);
    if (!epoch) {
      insertEpoch.run(budgetId, randomUUID(), schemaVersion, new Date().toISOString());
      epoch = readEpoch.get(budgetId);
    }
    return epoch;
  }

  function requireEpoch(budgetId, syncEpoch) {
    const epoch = ensureEpoch(budgetId);
    if (epoch.syncEpoch !== syncEpoch) {
      throw relayError(409, "STALE_SYNC_EPOCH",
        "This device uses an obsolete sync epoch and must rebuild from the current baseline.", {
          expectedSyncEpoch: epoch.syncEpoch,
          actualSyncEpoch: syncEpoch,
        });
    }
    return epoch;
  }

  return {
    updateBudgetMetadata(budgetId, input) {
      assertBudgetId(budgetId);
      const budgetName = typeof input?.budgetName === "string"
        ? input.budgetName.trim()
        : "";
      const currency = typeof input?.currency === "string"
        ? input.currency.trim().toUpperCase()
        : "";
      if (!budgetName || budgetName.length > 200) {
        throw relayError(400, "INVALID_BUDGET_NAME", "A valid budget name is required.");
      }
      if (!/^[A-Z]{3}$/.test(currency)) {
        throw relayError(400, "INVALID_BUDGET_CURRENCY", "A three-letter currency code is required.");
      }
      const updatedAt = new Date().toISOString();
      upsertBudgetMetadata.run(budgetId, budgetName, currency, updatedAt);
      return { budgetId, budgetName, currency, updatedAt };
    },

    getBootstrap(budgetId) {
      const epoch = ensureEpoch(budgetId);
      const baseline = epoch.baselineId ? readBaseline.get(epoch.baselineId) : null;
      const manifest = baseline ? readStoredBaselineManifest(baseline) : null;
      return {
        protocolVersion: LOCAL_FIRST_RELAY_PROTOCOL_VERSION,
        budgetId,
        syncEpoch: epoch.syncEpoch,
        schemaVersion: epoch.schemaVersion,
        latestCursor: epoch.latestCursor,
        baseline: baseline ? {
          baselineId: baseline.baselineId,
          manifest,
          committedAt: baseline.committedAt,
        } : null,
      };
    },

    resetEpoch(budgetId, schemaVersion = 1) {
      assertSchemaVersion(schemaVersion);
      const timestamp = new Date().toISOString();
      const result = resetEpochTransaction(budgetId, schemaVersion, timestamp);
      return {
        budgetId,
        syncEpoch: result.syncEpoch,
        previousSyncEpoch: result.previousEpoch,
        schemaVersion,
        resetAt: timestamp,
      };
    },

    beginBaseline(budgetId, syncEpoch, manifest) {
      const epoch = requireEpoch(budgetId, syncEpoch);
      const validated = validateBaselineManifest(manifest, {
        budgetId,
        syncEpoch,
        schemaVersion: epoch.schemaVersion,
      });
      const baselineId = randomUUID();
      database.prepare(`
        INSERT INTO local_first_baselines(
          baseline_id, budget_id, sync_epoch, manifest_json,
          state, created_at, committed_at
        ) VALUES (?, ?, ?, ?, 'staging', ?, NULL)
      `).run(
        baselineId,
        budgetId,
        syncEpoch,
        JSON.stringify(validated),
        new Date().toISOString(),
      );
      return { baselineId, chunkCount: validated.chunkCount };
    },

    saveBaselineChunk(budgetId, syncEpoch, baselineId, chunkIndex, contentHash, content) {
      requireEpoch(budgetId, syncEpoch);
      const baseline = requireStagingBaseline(baselineId, budgetId, syncEpoch);
      const manifest = JSON.parse(baseline.manifestJson);
      if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= manifest.chunkCount) {
        throw relayError(400, "INVALID_BASELINE_CHUNK", "Baseline chunk index is out of range.");
      }
      if (!Buffer.isBuffer(content) || content.length > LOCAL_FIRST_MAX_CHUNK_BYTES) {
        throw relayError(413, "BASELINE_CHUNK_TOO_LARGE",
          `Baseline chunks may contain at most ${LOCAL_FIRST_MAX_CHUNK_BYTES} bytes.`);
      }
      const actualHash = hash(content);
      if (actualHash !== contentHash) {
        throw relayError(400, "BASELINE_CHUNK_HASH_MISMATCH",
          "Baseline chunk content does not match its declared hash.");
      }
      const existing = readChunk.get(baselineId, chunkIndex);
      if (existing) {
        if (existing.contentHash === actualHash && existing.size === content.length) {
          return {
            baselineId,
            chunkIndex,
            contentHash: actualHash,
            size: content.length,
            alreadyStored: true,
          };
        }
        throw relayError(
          409,
          "BASELINE_CHUNK_COLLISION",
          "A different chunk is already stored at this baseline index.",
        );
      }
      const target = chunkPath(baselineId, chunkIndex);
      const partial = `${target}.${randomUUID()}.partial`;
      writeFileSync(partial, content, { flag: "wx" });
      renameSync(partial, target);
      database.prepare(`
        INSERT INTO local_first_baseline_chunks(
          baseline_id, chunk_index, content_hash, size
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(baseline_id, chunk_index) DO UPDATE SET
          content_hash = excluded.content_hash, size = excluded.size
      `).run(baselineId, chunkIndex, actualHash, content.length);
      return { baselineId, chunkIndex, contentHash: actualHash, size: content.length };
    },

    commitBaseline(budgetId, syncEpoch, baselineId) {
      requireEpoch(budgetId, syncEpoch);
      const baseline = requireStagingBaseline(baselineId, budgetId, syncEpoch);
      const manifest = JSON.parse(baseline.manifestJson);
      const chunks = listChunks.all(baselineId);
      if (chunks.length !== manifest.chunkCount) {
        throw relayError(409, "BASELINE_INCOMPLETE",
          `Baseline has ${chunks.length} of ${manifest.chunkCount} required chunks.`);
      }
      const digest = createHash("sha256");
      let totalBytes = 0;
      chunks.forEach((chunk, expectedIndex) => {
        if (chunk.chunkIndex !== expectedIndex) {
          throw relayError(409, "BASELINE_INCOMPLETE", "Baseline chunks are not contiguous.");
        }
        const content = readFileSync(chunkPath(baselineId, chunk.chunkIndex));
        if (content.length !== chunk.size || hash(content) !== chunk.contentHash) {
          throw relayError(409, "BASELINE_CHUNK_CORRUPT", "A stored baseline chunk failed integrity validation.");
        }
        digest.update(content);
        totalBytes += content.length;
      });
      const contentHash = `sha256:${digest.digest("hex")}`;
      if (totalBytes !== manifest.totalBytes || contentHash !== manifest.contentHash) {
        throw relayError(409, "BASELINE_INTEGRITY_MISMATCH",
          "The assembled baseline does not match its complete manifest.");
      }
      const committedAt = new Date().toISOString();
      let compacted;
      try {
        compacted = commitBaselineTransaction(
          budgetId,
          syncEpoch,
          baselineId,
          committedAt,
        );
      } catch (error) {
        if (error?.code === "BASELINE_DATA_REGRESSION") {
          deleteBaselineArtifacts(baselineId);
        }
        throw error;
      }
      pruneSupersededBaselines(budgetId, syncEpoch, 2);
      return {
        baselineId,
        contentHash,
        totalBytes,
        committedAt,
        baseCursor: compacted.baseCursor,
        compactedMutationCount: compacted.compactedMutationCount,
      };
    },

    readBaselineChunk(budgetId, syncEpoch, baselineId, chunkIndex) {
      requireEpoch(budgetId, syncEpoch);
      const baseline = readBaseline.get(baselineId);
      if (
        !baseline ||
        baseline.budgetId !== budgetId ||
        baseline.syncEpoch !== syncEpoch ||
        baseline.state !== "committed"
      ) {
        throw relayError(404, "BASELINE_NOT_FOUND", "The committed baseline was not found.");
      }
      const metadata = readChunk.get(baselineId, chunkIndex);
      if (!metadata || !existsSync(chunkPath(baselineId, chunkIndex))) {
        throw relayError(404, "BASELINE_CHUNK_NOT_FOUND", "The baseline chunk was not found.");
      }
      return {
        content: readFileSync(chunkPath(baselineId, chunkIndex)),
        metadata,
      };
    },

    deleteBudget(budgetId) {
      const chunks = database.prepare(`
        SELECT chunk.baseline_id AS baselineId, chunk.chunk_index AS chunkIndex
        FROM local_first_baseline_chunks AS chunk
        JOIN local_first_baselines AS baseline
          ON baseline.baseline_id = chunk.baseline_id
        WHERE baseline.budget_id = ?
      `).all(budgetId);
      const remove = database.transaction(() => {
        database.prepare(
          "DELETE FROM local_first_mutations WHERE budget_id = ?",
        ).run(budgetId);
        database.prepare(`
          DELETE FROM local_first_baseline_chunks
          WHERE baseline_id IN (
            SELECT baseline_id FROM local_first_baselines WHERE budget_id = ?
          )
        `).run(budgetId);
        database.prepare(
          "DELETE FROM local_first_baselines WHERE budget_id = ?",
        ).run(budgetId);
        database.prepare(
          "DELETE FROM local_first_sync_epochs WHERE budget_id = ?",
        ).run(budgetId);
        database.prepare(
          "DELETE FROM local_first_budget_metadata WHERE budget_id = ?",
        ).run(budgetId);
      });
      remove();
      for (const chunk of chunks) {
        rmSync(chunkPath(chunk.baselineId, chunk.chunkIndex), { force: true });
      }
      return { budgetId, deletedChunkCount: chunks.length, deleted: true };
    },

    pushMutations(budgetId, syncEpoch, mutations) {
      const epoch = requireEpoch(budgetId, syncEpoch);
      if (!epoch.baselineId) {
        throw relayError(409, "BASELINE_REQUIRED",
          "A complete baseline must be committed before mutations can be relayed.");
      }
      validateMutationBatch(mutations);
      const receivedAt = new Date().toISOString();
      const insert = database.prepare(`
        INSERT OR IGNORE INTO local_first_mutations(
          budget_id, sync_epoch, mutation_id, device_id, device_sequence,
          entity_key, base_cursor, payload_json, conflict_json, received_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `);
      const latestForEntity = database.prepare(`
        SELECT cursor, mutation_id AS mutationId, device_id AS deviceId,
          payload_json AS payloadJson
        FROM local_first_mutations
        WHERE budget_id = ? AND sync_epoch = ? AND entity_key = ?
        ORDER BY cursor DESC LIMIT 1
      `);
      const saveConflict = database.prepare(`
        UPDATE local_first_mutations SET conflict_json = ? WHERE cursor = ?
      `);
      let acceptedCount = 0;
      let detectedConflictCount = 0;
      const transaction = database.transaction(() => {
        for (const mutation of mutations) {
          const entityKey = `${mutation.domain}:${mutation.entityId}`;
          const previous = latestForEntity.get(budgetId, syncEpoch, entityKey);
          const result = insert.run(
            budgetId, syncEpoch, mutation.mutationId, mutation.deviceId,
            mutation.deviceSequence, entityKey, mutation.baseCursor,
            JSON.stringify(mutation), receivedAt,
          );
          acceptedCount += result.changes;
          if (
            result.changes > 0 &&
            previous &&
            previous.cursor > mutation.baseCursor &&
            previous.deviceId !== mutation.deviceId
          ) {
            const losingMutation = JSON.parse(previous.payloadJson);
            if (!mutationsAreEquivalent(losingMutation, mutation)) {
              const winningCursor = Number(result.lastInsertRowid);
              const conflict = {
                conflictId: [
                  syncEpoch,
                  entityKey,
                  previous.mutationId,
                  mutation.mutationId,
                ].map(encodeURIComponent).join("|"),
                budgetId,
                syncEpoch,
                entityKey,
                detectedAt: receivedAt,
                losingMutation,
                winningMutation: mutation,
                winningCursor,
              };
              saveConflict.run(JSON.stringify(conflict), winningCursor);
              detectedConflictCount += 1;
            }
          }
        }
        const latestCursor = database.prepare(`
          SELECT COALESCE(MAX(cursor), 0) AS cursor
          FROM local_first_mutations WHERE budget_id = ? AND sync_epoch = ?
        `).get(budgetId, syncEpoch).cursor;
        database.prepare(`
          UPDATE local_first_sync_epochs SET latest_cursor = ?
          WHERE budget_id = ? AND sync_epoch = ?
        `).run(latestCursor, budgetId, syncEpoch);
        return latestCursor;
      });
      const latestCursor = transaction();
      return {
        acceptedCount,
        acknowledgedCount: mutations.length,
        latestCursor,
        detectedConflictCount,
      };
    },

    pullMutations(budgetId, syncEpoch, afterCursor, limit = 500) {
      const epoch = requireEpoch(budgetId, syncEpoch);
      const activeBaseline = epoch.baselineId
        ? readBaseline.get(epoch.baselineId)
        : null;
      const baseCursor = activeBaseline
        ? readStoredBaselineManifest(activeBaseline).baseCursor
        : 0;
      if (afterCursor < baseCursor) {
        throw relayError(
          409,
          "CURSOR_COMPACTED",
          "This device is behind the retained mutation stream and must rebuild from the active baseline.",
          { baseCursor, baselineId: epoch.baselineId },
        );
      }
      const boundedLimit = Math.max(1, Math.min(1_000, Number(limit)));
      const rows = database.prepare(`
        SELECT cursor, payload_json AS payloadJson,
          conflict_json AS conflictJson, received_at AS receivedAt
        FROM local_first_mutations
        WHERE budget_id = ? AND sync_epoch = ? AND cursor > ?
        ORDER BY cursor LIMIT ?
      `).all(budgetId, syncEpoch, afterCursor, boundedLimit + 1);
      return {
        mutations: rows.slice(0, boundedLimit).map((row) => ({
          cursor: row.cursor,
          receivedAt: row.receivedAt,
          mutation: JSON.parse(row.payloadJson),
          ...(row.conflictJson
            ? { conflict: JSON.parse(row.conflictJson) }
            : {}),
        })),
        latestCursor: epoch.latestCursor,
        hasMore: rows.length > boundedLimit,
        baseCursor,
      };
    },
  };

  function pruneSupersededBaselines(budgetId, syncEpoch, retainedCount) {
    const activeBaselineId = readEpoch.get(budgetId)?.baselineId;
    if (!activeBaselineId) return;
    const superseded = database.prepare(`
      SELECT baseline_id AS baselineId
      FROM local_first_baselines
      WHERE budget_id = ? AND sync_epoch = ? AND state = 'committed'
        AND baseline_id <> ?
      ORDER BY committed_at DESC, created_at DESC, baseline_id DESC
      LIMIT -1 OFFSET ?
    `).all(budgetId, syncEpoch, activeBaselineId, Math.max(0, retainedCount - 1));
    for (const { baselineId } of superseded) {
      deleteBaselineArtifacts(baselineId);
    }
  }

  function deleteBaselineArtifacts(baselineId) {
    const chunks = listChunks.all(baselineId);
    database.prepare(
      "DELETE FROM local_first_baseline_chunks WHERE baseline_id = ?",
    ).run(baselineId);
    database.prepare(
      "DELETE FROM local_first_baselines WHERE baseline_id = ?",
    ).run(baselineId);
    for (const { chunkIndex } of chunks) {
      rmSync(chunkPath(baselineId, chunkIndex), { force: true });
    }
  }

  function requireStagingBaseline(baselineId, budgetId, syncEpoch) {
    const baseline = readBaseline.get(baselineId);
    if (
      !baseline ||
      baseline.budgetId !== budgetId ||
      baseline.syncEpoch !== syncEpoch ||
      baseline.state !== "staging"
    ) {
      throw relayError(404, "STAGING_BASELINE_NOT_FOUND", "The staging baseline was not found.");
    }
    return baseline;
  }

  function chunkPath(baselineId, chunkIndex) {
    return join(blobDirectory, `${baselineId}.${chunkIndex}.chunk`);
  }
}

function readStoredBaselineManifest(baseline) {
  const manifest = JSON.parse(baseline.manifestJson);
  if (manifest.baseCursor === undefined || manifest.baseCursor === null) {
    // Protocol 1 baselines predate durable relay cursors. They were published
    // before cursor compaction existed, so cursor zero is their safe boundary.
    return { ...manifest, baseCursor: 0 };
  }
  if (!Number.isSafeInteger(manifest.baseCursor) || manifest.baseCursor < 0) {
    throw relayError(
      500,
      "INVALID_STORED_BASELINE",
      "The stored relay baseline contains an invalid base cursor.",
    );
  }
  return manifest;
}

export function ensureLocalFirstRelaySchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS local_first_sync_epochs (
      budget_id TEXT PRIMARY KEY,
      sync_epoch TEXT NOT NULL UNIQUE,
      schema_version INTEGER NOT NULL,
      baseline_id TEXT,
      latest_cursor INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      reset_at TEXT
    );
    CREATE TABLE IF NOT EXISTS local_first_baselines (
      baseline_id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL,
      sync_epoch TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('staging', 'committed')),
      created_at TEXT NOT NULL,
      committed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS local_first_baselines_budget_epoch
      ON local_first_baselines(budget_id, sync_epoch, state);
    CREATE TABLE IF NOT EXISTS local_first_baseline_chunks (
      baseline_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      size INTEGER NOT NULL,
      PRIMARY KEY(baseline_id, chunk_index),
      FOREIGN KEY(baseline_id) REFERENCES local_first_baselines(baseline_id)
        ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS local_first_mutations (
      cursor INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id TEXT NOT NULL,
      sync_epoch TEXT NOT NULL,
      mutation_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_sequence INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      received_at TEXT NOT NULL,
      UNIQUE(budget_id, sync_epoch, mutation_id),
      UNIQUE(budget_id, sync_epoch, device_id, device_sequence)
    );
    CREATE INDEX IF NOT EXISTS local_first_mutations_pull
      ON local_first_mutations(budget_id, sync_epoch, cursor);
    CREATE TABLE IF NOT EXISTS local_first_budget_metadata (
      budget_id TEXT PRIMARY KEY,
      budget_name TEXT NOT NULL,
      currency TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const mutationColumns = new Set(
    database.prepare("PRAGMA table_info(local_first_mutations)")
      .all()
      .map(({ name }) => name),
  );
  if (!mutationColumns.has("entity_key")) {
    database.exec(
      "ALTER TABLE local_first_mutations ADD COLUMN entity_key TEXT",
    );
  }
  if (!mutationColumns.has("base_cursor")) {
    database.exec(
      "ALTER TABLE local_first_mutations ADD COLUMN base_cursor INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!mutationColumns.has("conflict_json")) {
    database.exec(
      "ALTER TABLE local_first_mutations ADD COLUMN conflict_json TEXT",
    );
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS local_first_mutations_entity
      ON local_first_mutations(
        budget_id, sync_epoch, entity_key, cursor DESC
      );
  `);
}

export function validateBaselineManifest(manifest, expected) {
  if (!manifest || typeof manifest !== "object") {
    throw relayError(400, "INVALID_BASELINE_MANIFEST", "A baseline manifest is required.");
  }
  if (
    manifest.budgetId !== expected.budgetId ||
    manifest.syncEpoch !== expected.syncEpoch ||
    manifest.schemaVersion !== expected.schemaVersion
  ) {
    throw relayError(409, "BASELINE_SCOPE_MISMATCH",
      "Baseline budget, epoch, or schema does not match the active relay.");
  }
  for (const domain of LOCAL_FIRST_REQUIRED_DOMAINS) {
    if (!Number.isSafeInteger(manifest.counts?.[domain]) || manifest.counts[domain] < 0) {
      throw relayError(400, "INCOMPLETE_BASELINE_MANIFEST",
        `Baseline manifest requires a non-negative ${domain} count.`);
    }
  }
  if (!Number.isSafeInteger(manifest.chunkCount) || manifest.chunkCount < 1) {
    throw relayError(400, "INVALID_BASELINE_MANIFEST", "Baseline chunkCount must be positive.");
  }
  if (!Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 1) {
    throw relayError(400, "INVALID_BASELINE_MANIFEST", "Baseline totalBytes must be positive.");
  }
  if (!Number.isSafeInteger(manifest.baseCursor) || manifest.baseCursor < 0) {
    throw relayError(
      400,
      "INVALID_BASELINE_MANIFEST",
      "Baseline baseCursor must be a non-negative integer.",
    );
  }
  if (
    manifest.previousBaselineId !== null &&
    (typeof manifest.previousBaselineId !== "string" ||
      !manifest.previousBaselineId)
  ) {
    throw relayError(
      400,
      "INVALID_BASELINE_MANIFEST",
      "Baseline previousBaselineId is invalid.",
    );
  }
  assertHash(manifest.contentHash);
  return manifest;
}

function validateMutationBatch(mutations) {
  if (!Array.isArray(mutations) || mutations.length > LOCAL_FIRST_MAX_MUTATION_BATCH) {
    throw relayError(400, "INVALID_MUTATION_BATCH",
      `Mutation batches may contain at most ${LOCAL_FIRST_MAX_MUTATION_BATCH} items.`);
  }
  for (const mutation of mutations) {
    if (
      !mutation ||
      typeof mutation.mutationId !== "string" ||
      typeof mutation.deviceId !== "string" ||
      !Number.isSafeInteger(mutation.deviceSequence) ||
      mutation.deviceSequence < 1 ||
      !Number.isSafeInteger(mutation.baseCursor) ||
      mutation.baseCursor < 0 ||
      !LOCAL_FIRST_REQUIRED_DOMAINS.includes(mutation.domain) ||
      typeof mutation.entityId !== "string" ||
      !mutation.entityId
    ) {
      throw relayError(400, "INVALID_MUTATION", "Mutation identity is invalid.");
    }
  }
}

function mutationsAreEquivalent(left, right) {
  return (
    left.operation === right.operation &&
    JSON.stringify(left.payload) === JSON.stringify(right.payload)
  );
}

function assertBudgetId(budgetId) {
  if (typeof budgetId !== "string" || !budgetId.trim() || budgetId.length > 200) {
    throw relayError(400, "INVALID_BUDGET_ID", "A valid budget ID is required.");
  }
}

function assertSchemaVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw relayError(400, "INVALID_SCHEMA_VERSION", "Schema version must be a positive integer.");
  }
}

function assertHash(value) {
  if (!/^sha256:[a-f0-9]{64}$/.test(value ?? "")) {
    throw relayError(400, "INVALID_CONTENT_HASH", "A SHA-256 content hash is required.");
  }
}

function hash(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function relayError(statusCode, code, message, details = {}) {
  return Object.assign(new Error(message), { statusCode, code, ...details });
}
