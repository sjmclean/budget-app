export const LOCAL_FIRST_SYNC_COMPLETED_EVENT =
  "budget-app:local-first-sync-completed";

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

export interface LocalFirstTabSyncCoordinator {
  run<T>(budgetId: string, operation: () => Promise<T>): Promise<T>;
  close(): void;
}

/**
 * Uses operation-scoped leadership: a tab owns the budget sync lock only while
 * it drains the outbox and applies remote mutations. A suspended background
 * tab therefore cannot indefinitely prevent a foreground tab from syncing.
 */
export function createLocalFirstTabSyncCoordinator(options: {
  readonly lockManager?: LockManagerPort | null;
  readonly channelFactory?: ((name: string) => BroadcastChannelPort) | null;
  readonly dispatchCompletion?: ((budgetId: string) => void) | null;
} = {}): LocalFirstTabSyncCoordinator {
  const lockManager = options.lockManager === undefined
    ? (globalThis.navigator?.locks as LockManagerPort | undefined) ?? null
    : options.lockManager;
  const channelFactory = options.channelFactory === undefined
    ? (globalThis.BroadcastChannel
        ? (name: string) => new BroadcastChannel(name)
        : null)
    : options.channelFactory;
  const dispatchCompletion = options.dispatchCompletion === undefined
    ? (budgetId: string) => globalThis.dispatchEvent?.(
        new CustomEvent(LOCAL_FIRST_SYNC_COMPLETED_EVENT, {
          detail: { budgetId },
        }),
      )
    : options.dispatchCompletion;
  const channels = new Map<string, BroadcastChannelPort>();
  let closed = false;

  function channelFor(budgetId: string): BroadcastChannelPort | null {
    if (!channelFactory) return null;
    let channel = channels.get(budgetId);
    if (!channel) {
      channel = channelFactory(
        `budget-app.local-first.sync.${encodeURIComponent(budgetId)}`,
      );
      channel.onmessage = (event) => {
        const message = event.data as {
          type?: string;
          budgetId?: string;
        };
        if (
          message.type === "sync-completed" &&
          message.budgetId === budgetId
        ) {
          dispatchCompletion?.(budgetId);
        }
      };
      channels.set(budgetId, channel);
    }
    return channel;
  }

  async function execute<T>(
    budgetId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (closed) throw new Error("The tab synchronization coordinator is closed.");
    const result = await operation();
    channelFor(budgetId)?.postMessage({
      type: "sync-completed",
      budgetId,
      completedAt: new Date().toISOString(),
    });
    return result;
  }

  return {
    run<T>(budgetId: string, operation: () => Promise<T>): Promise<T> {
      if (!budgetId) {
        return Promise.reject(new Error("A budget ID is required for tab coordination."));
      }
      if (!lockManager) return execute(budgetId, operation);
      return lockManager.request(
        `budget-app.local-first.sync.${budgetId}`,
        { mode: "exclusive" },
        () => execute(budgetId, operation),
      );
    },
    close() {
      if (closed) return;
      closed = true;
      for (const channel of channels.values()) channel.close();
      channels.clear();
    },
  };
}
