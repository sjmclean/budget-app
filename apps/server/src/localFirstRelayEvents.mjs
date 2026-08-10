const HEARTBEAT_INTERVAL_MS = 20_000;

export function createLocalFirstRelayEventBroker(options = {}) {
  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const subscribers = new Map();
  let nextEventId = 0;

  function subscribe(budgetId, response) {
    let budgetSubscribers = subscribers.get(budgetId);
    if (!budgetSubscribers) {
      budgetSubscribers = new Set();
      subscribers.set(budgetId, budgetSubscribers);
    }
    budgetSubscribers.add(response);

    const heartbeat = setInterval(() => {
      if (!response.destroyed) response.write(": heartbeat\n\n");
    }, heartbeatIntervalMs);
    heartbeat.unref?.();

    return () => {
      clearInterval(heartbeat);
      budgetSubscribers.delete(response);
      if (budgetSubscribers.size === 0) subscribers.delete(budgetId);
    };
  }

  function publish(budgetId, event) {
    const budgetSubscribers = subscribers.get(budgetId);
    if (!budgetSubscribers?.size) return 0;
    nextEventId += 1;
    const payload =
      `id: ${nextEventId}\n` +
      "event: relay\n" +
      `data: ${JSON.stringify(event)}\n\n`;
    let delivered = 0;
    for (const response of budgetSubscribers) {
      if (response.destroyed) continue;
      response.write(payload);
      delivered += 1;
    }
    return delivered;
  }

  return {
    subscribe,
    publish,
    subscriberCount(budgetId) {
      return subscribers.get(budgetId)?.size ?? 0;
    },
  };
}
