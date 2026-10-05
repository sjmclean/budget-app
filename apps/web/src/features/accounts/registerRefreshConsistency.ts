export interface RegisterRefreshRevisionAttempt {
  readonly attempt: number;
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly durationMs: number;
}

export class RegisterRefreshRevisionChurnError extends Error {
  readonly attempts: readonly RegisterRefreshRevisionAttempt[];

  constructor(attempts: readonly RegisterRefreshRevisionAttempt[]) {
    super(
      `Account register refresh could not obtain a stable persistence revision after ${attempts.length} attempts.`,
    );
    this.name = "RegisterRefreshRevisionChurnError";
    this.attempts = attempts;
  }
}

export interface LoadConsistentRegisterSnapshotOptions<T> {
  readonly readRevision: () => number;
  readonly load: () => Promise<T>;
  readonly maxAttempts?: number;
  readonly now?: () => number;
  readonly yieldControl?: () => Promise<void>;
  readonly onRevisionChurn?: (attempt: RegisterRefreshRevisionAttempt) => void;
}

const DEFAULT_MAX_ATTEMPTS = 4;

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function defaultYieldControl(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function loadConsistentRegisterSnapshot<T>({
  readRevision,
  load,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  now = defaultNow,
  yieldControl = defaultYieldControl,
  onRevisionChurn,
}: LoadConsistentRegisterSnapshotOptions<T>): Promise<{
  readonly result: T;
  readonly revision: number;
  readonly attempts: readonly RegisterRefreshRevisionAttempt[];
}> {
  const attempts: RegisterRefreshRevisionAttempt[] = [];
  const boundedAttempts = Math.max(1, Math.floor(maxAttempts));

  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    const beforeRevision = readRevision();
    const startedAt = now();
    const result = await load();
    const durationMs = Math.max(0, now() - startedAt);
    const afterRevision = readRevision();

    if (beforeRevision === afterRevision) {
      return {
        result,
        revision: afterRevision,
        attempts,
      };
    }

    const record = {
      attempt,
      beforeRevision,
      afterRevision,
      durationMs,
    } satisfies RegisterRefreshRevisionAttempt;
    attempts.push(record);
    onRevisionChurn?.(record);

    if (attempt < boundedAttempts) {
      // Yield to the browser task queue before retrying. Re-entering the
      // worker immediately from a promise continuation can otherwise starve
      // rendering/devtools while persistence revisions are still arriving.
      await yieldControl();
    }
  }

  throw new RegisterRefreshRevisionChurnError(attempts);
}
