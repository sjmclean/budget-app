export interface LocalFirstRelayEvent {
  readonly type:
    | "connected"
    | "mutations-available"
    | "baseline-committed"
    | "epoch-reset";
  readonly budgetId: string;
  readonly syncEpoch: string;
  readonly latestCursor: number;
}

export interface LocalFirstRelayEventSubscription {
  close(): void;
}

export function subscribeToLocalFirstRelayEvents(options: {
  readonly budgetId: string;
  readonly apiBaseUrl?: string;
  readonly onEvent: (event: LocalFirstRelayEvent) => void;
  readonly onConnectionChange?: (connected: boolean) => void;
  readonly eventSourceFactory?: (url: string) => EventSource;
}): LocalFirstRelayEventSubscription | null {
  const EventSourceConstructor = globalThis.EventSource;
  const factory = options.eventSourceFactory ??
    (EventSourceConstructor
      ? (url: string) => new EventSourceConstructor(url, { withCredentials: true })
      : null);
  if (!factory) return null;

  const baseUrl = (options.apiBaseUrl ?? "").replace(/\/+$/, "");
  const query = new URLSearchParams({ budgetId: options.budgetId });
  const source = factory(`${baseUrl}/api/local-first/events?${query}`);
  source.addEventListener("open", () => options.onConnectionChange?.(true));
  source.addEventListener("error", () => options.onConnectionChange?.(false));
  source.addEventListener("relay", (message) => {
    try {
      const event = JSON.parse((message as MessageEvent<string>).data) as
        LocalFirstRelayEvent;
      if (event.budgetId === options.budgetId) options.onEvent(event);
    } catch {
      // A malformed notification is safely ignored. The fallback catch-up
      // timer remains the source of reliability.
    }
  });
  return { close: () => source.close() };
}
