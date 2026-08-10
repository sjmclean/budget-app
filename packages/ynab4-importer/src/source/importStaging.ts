import type { ImportReadOptions } from "./importSource.js";

export type ImportStageState =
  | "new"
  | "staging"
  | "committing"
  | "committed"
  | "rolling-back"
  | "rolled-back"
  | "closed";

export interface ImportStageProgress {
  readonly state: ImportStageState;
  readonly batchesPersisted: number;
  readonly recordsPersisted: number;
}

/** Format-neutral isolated persistence boundary for bounded imports. */
export interface ImportStage<TRecord, TResult> {
  begin(options?: ImportReadOptions): Promise<void>;
  persistBatch(records: readonly TRecord[], options?: ImportReadOptions): Promise<void>;
  commit(options?: ImportReadOptions): Promise<TResult>;
  rollback(cause: unknown): Promise<void>;
  cleanup(): Promise<void>;
  progress(): ImportStageProgress;
  close(): Promise<void>;
}

export interface ImportStageFactory<TRecord, TResult, TOptions> {
  create(options: TOptions): ImportStage<TRecord, TResult>;
}
