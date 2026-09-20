interface LockManagerPort {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<T>,
  ): Promise<T>;
}

interface BroadcastChannelPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

interface HeldDatabaseLease {
  readonly budgetId: string;
  releaseDatabase: () => Promise<void>;
  readonly releaseLock: () => void;
}

export interface LocalFirstDatabaseTabCoordinator {
  acquire(budgetId: string, releaseDatabase: () => Promise<void>): Promise<void>;
  release(): Promise<void>;
  owns(budgetId: string): boolean;
  budgetId(): string | null;
  close(): Promise<void>;
}

/**
 * Cross-tab ownership for the single physical OPFS/SAH-pool SQLite runtime.
 *
 * The lease is intentionally global rather than per budget: the SAH-pool
 * fallback owns shared access handles even when two tabs target different
 * budget files. BroadcastChannel only asks the current owner to drain and
 * release. The long-lived Web Lock is the proof that the previous owner has actually
 * relinquished the database before another tab proceeds.
 */
export function createLocalFirstDatabaseTabCoordinator(options: {
  readonly lockManager?: LockManagerPort | null;
  readonly channelFactory?: ((name: string) => BroadcastChannelPort) | null;
  readonly onReleaseError?: ((error: unknown) => void) | null;
} = {}): LocalFirstDatabaseTabCoordinator {
  const configuredLockManager = options.lockManager;

  function currentLockManager(): LockManagerPort | null {
    return configuredLockManager === undefined
      ? (globalThis.navigator?.locks as LockManagerPort | undefined) ?? null
      : configuredLockManager;
  }
  const channelFactory = options.channelFactory === undefined
    ? (globalThis.BroadcastChannel
        ? (name: string) => new BroadcastChannel(name)
        : null)
    : options.channelFactory;
  const onReleaseError = options.onReleaseError === undefined
    ? (error: unknown) => console.error("Unable to hand off the local budget database.", error)
    : options.onReleaseError;

  let channel: BroadcastChannelPort | null = null;
  let held: HeldDatabaseLease | null = null;
  let acquiringBudgetId: string | null = null;
  let acquiring: Promise<void> | null = null;
  let acquisitionGeneration = 0;
  let closed = false;

  function sharedChannel(): BroadcastChannelPort | null {
    if (!channelFactory) return null;
    if (channel) return channel;
    channel = channelFactory("budget-app.local-first.database");
    channel.onmessage = (event) => {
      const message = event.data as { type?: string };
      if (message.type !== "request-release" || !held) return;
      void releaseHeld(true).catch((error) => onReleaseError?.(error));
    };
    return channel;
  }

  async function releaseHeld(closeDatabase: boolean): Promise<void> {
    const current = held;
    if (!current) return;
    if (closeDatabase) {
      await current.releaseDatabase();
    }
    if (held !== current) return;
    held = null;
    current.releaseLock();
  }

  async function acquireWithLock(
    budgetId: string,
    releaseDatabase: () => Promise<void>,
    generation: number,
  ): Promise<void> {
    const lockManager = currentLockManager();
    if (!lockManager) {
      throw Object.assign(
        new Error(
          "Cross-tab SQLite ownership requires the Web Locks API in this browser.",
        ),
        { code: "WEB_LOCKS_UNAVAILABLE" },
      );
    }

    let resolveAcquired!: () => void;
    let rejectAcquired!: (error: unknown) => void;
    let resolveHold!: () => void;
    const acquired = new Promise<void>((resolve, reject) => {
      resolveAcquired = resolve;
      rejectAcquired = reject;
    });
    const hold = new Promise<void>((resolve) => {
      resolveHold = resolve;
    });

    const lockRun = lockManager.request(
      "budget-app.local-first.database",
      { mode: "exclusive" },
      async () => {
        if (closed || generation !== acquisitionGeneration) {
          resolveAcquired();
          return;
        }
        held = {
          budgetId,
          releaseDatabase,
          releaseLock: resolveHold,
        };
        resolveAcquired();
        await hold;
      },
    );
    void lockRun.catch(rejectAcquired);
    await acquired;
    if (closed) {
      resolveHold();
      throw new Error("The database tab coordinator is closed.");
    }
  }

  return {
    async acquire(
      budgetId: string,
      releaseDatabase: () => Promise<void>,
    ): Promise<void> {
      if (!budgetId) throw new Error("A budget ID is required for database ownership.");
      if (closed) throw new Error("The database tab coordinator is closed.");
      if (!currentLockManager()) {
        throw Object.assign(
          new Error(
            "Cross-tab SQLite ownership requires the Web Locks API in this browser.",
          ),
          { code: "WEB_LOCKS_UNAVAILABLE" },
        );
      }

      if (held?.budgetId === budgetId) {
        held.releaseDatabase = releaseDatabase;
        return;
      }
      if (acquiring && acquiringBudgetId === budgetId) return acquiring;

      const generation = ++acquisitionGeneration;
      const operation = (async () => {
        if (held) await releaseHeld(true);
        sharedChannel()?.postMessage({
          type: "request-release",
          budgetId,
          requestedAt: new Date().toISOString(),
        });
        await acquireWithLock(budgetId, releaseDatabase, generation);
      })();
      acquiring = operation;
      acquiringBudgetId = budgetId;
      try {
        await operation;
      } finally {
        if (acquiring === operation) {
          acquiring = null;
          acquiringBudgetId = null;
        }
      }
    },

    release(): Promise<void> {
      acquisitionGeneration += 1;
      return releaseHeld(true);
    },

    owns(budgetId: string): boolean {
      return held?.budgetId === budgetId;
    },

    budgetId(): string | null {
      return held?.budgetId ?? null;
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      acquisitionGeneration += 1;
      await releaseHeld(true);
      channel?.close();
      channel = null;
    },
  };
}

const sharedDatabaseTabCoordinator = createLocalFirstDatabaseTabCoordinator();

export function acquireLocalFirstDatabaseTabOwnership(
  budgetId: string,
  releaseDatabase: () => Promise<void>,
): Promise<void> {
  return sharedDatabaseTabCoordinator.acquire(budgetId, releaseDatabase);
}

export function releaseLocalFirstDatabaseTabOwnership(): Promise<void> {
  return sharedDatabaseTabCoordinator.release();
}

export function hasLocalFirstDatabaseTabOwnership(budgetId: string): boolean {
  return sharedDatabaseTabCoordinator.owns(budgetId);
}


export function getLocalFirstDatabaseTabOwnershipBudgetId(): string | null {
  return sharedDatabaseTabCoordinator.budgetId();
}
