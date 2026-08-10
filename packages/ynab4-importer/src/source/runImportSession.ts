import { throwIfAborted } from "./errors.js";
import type {
  ImportReadOptions,
  ImportSession,
  ImportSourceReader,
  ImportStreamOptions,
} from "./importSource.js";

export interface RunImportSessionOptions extends ImportStreamOptions {
  readonly closeReader?: boolean;
  readonly closeSession?: boolean;
}

/**
 * Drives a format-neutral reader into a staged persistence session.
 *
 * No commit occurs until source inspection, reference validation and every
 * record batch succeeds. Any failure (including AbortError) rolls the session
 * back. Cleanup errors never replace the primary import error.
 */
export async function runImportSession<
  TSummary,
  TReferenceData,
  TRecord,
  TPersistedBatch,
  TResult,
  TIssue = string,
>(
  reader: ImportSourceReader<TSummary, TReferenceData, TRecord>,
  session: ImportSession<
    TSummary,
    TReferenceData,
    TRecord,
    TPersistedBatch,
    TResult,
    TIssue
  >,
  options: RunImportSessionOptions = {},
): Promise<TResult> {
  let begun = false;
  let primaryError: unknown;
  const readOptions: ImportReadOptions = { signal: options.signal };

  try {
    throwIfAborted(options.signal);
    const summary = await reader.inspect(readOptions);
    throwIfAborted(options.signal);
    const referenceData = await reader.readReferenceData(readOptions);
    throwIfAborted(options.signal);
    const validation = await session.validateSource(
      summary,
      referenceData,
      readOptions,
    );
    if (!validation.valid) {
      throw new ImportSourceValidationError(validation.issues);
    }

    await session.begin(summary, referenceData, readOptions);
    begun = true;
    for await (const batch of reader.streamRecords({
      batchSize: options.batchSize,
      signal: options.signal,
    })) {
      throwIfAborted(options.signal);
      await session.persistBatch(batch, readOptions);
    }
    throwIfAborted(options.signal);
    return await session.commit(readOptions);
  } catch (error) {
    primaryError = error;
    if (begun) {
      try {
        await session.rollback(error);
      } catch {
        // Preserve the source/persistence failure that caused rollback.
      }
    }
    throw error;
  } finally {
    if (options.closeSession !== false) {
      try {
        await session.close();
      } catch (error) {
        if (primaryError === undefined) throw error;
      }
    }
    if (options.closeReader !== false) {
      try {
        await reader.close();
      } catch (error) {
        if (primaryError === undefined) throw error;
      }
    }
  }
}

export class ImportSourceValidationError<TIssue = string> extends Error {
  readonly issues: readonly TIssue[];

  constructor(issues: readonly TIssue[]) {
    super(`Import source validation failed with ${issues.length} issue(s).`);
    this.name = "ImportSourceValidationError";
    this.issues = [...issues];
  }
}
