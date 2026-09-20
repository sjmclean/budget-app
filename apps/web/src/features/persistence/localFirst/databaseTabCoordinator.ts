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
  close(): Promise<void>;
}

/**
 * Cross-tab ownership for the physical OPFS SQLite generation.
 *
 * BroadcastChannel only asks the current owner to drain and release. The
 * long-lived Web Lock is the proof that the previous owner has actually
 * relinquished the database before another tab proceeds.
 */
export function createLocalFirstDatabaseTabCoordinator(options: {
  readonly lockManager?: LockManagerPort | null;
  readonly channelFactory?: ((name: string) => BroadcastChannelPort) | null;
  readonly onReleaseError?: ((error: unknown) => void) | null;
} = {}): LocalFirstDatabaseTabCoordinator {
  const lockManager = options.lockManager === undefined
    ? (globalThis.navigator?.locks as LockManagerPort | undefined) ?? null
    : options.lockManager;
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
  ): Promise<void> {
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
        if (closed) {
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

      if (held?.budgetId === budgetId) {
        held.releaseDatabase = releaseDatabase;
        return;
      }
      if (acquiring && acquiringBudgetId === budgetId) return acquiring;

      const operation = (async () => {
        if (held) await releaseHeld(true);
        sharedChannel()?.postMessage({
          type: "request-release",
          budgetId,
          requestedAt: new Date().toISOString(),
        });
        await acquireWithLock(budgetId, releaseDatabase);
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
      return releaseHeld(true);
    },

    owns(budgetId: string): boolean {
      return held?.budgetId === budgetId;
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
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
