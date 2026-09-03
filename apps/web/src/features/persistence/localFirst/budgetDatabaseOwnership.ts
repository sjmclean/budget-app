export function databaseReleasedError() {
  return Object.assign(new Error("The active budget database has been released. Open a budget before using it."), {
    code: "BUDGET_DATABASE_RELEASED",
  });
}

export function isDatabaseReleasedError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "BUDGET_DATABASE_RELEASED";
}

/** One ownership queue for this query client, including complete async operations.
 * Internal calls stay inside their parent's lease; public calls enter the queue.
 * Release stops admission synchronously, drains admitted work, then closes.
 */
export function createBudgetDatabaseOwnership(close: () => Promise<void>) {
  let tail: Promise<unknown> = Promise.resolve();
  let accepting = true;
  let selectedBudget: string | undefined;
  let release: Promise<void> | null = null;
  let unsafeCleanup: unknown = null;
  let generation = 0;

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    // Coalesce only a release that is still the last reserved operation. A
    // later leave must also wait for any intervening import or activation.
    release = null;
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  }

  function leave(): Promise<void> {
    generation += 1;
    accepting = false;
    selectedBudget = undefined;
    if (release) return release;
    const result = enqueue(async () => {
      if (unsafeCleanup) throw unsafeCleanup;
      await close();
    });
    release = result;
    void result.finally(() => { if (release === result) release = null; }).catch(() => undefined);
    return result;
  }

  return {
    isReleased: () => !accepting,
    run<T>(budgetId: string | undefined, operation: () => Promise<T>): Promise<T> {
      if (!accepting || (selectedBudget && budgetId && selectedBudget !== budgetId)) {
        return Promise.reject(databaseReleasedError());
      }
      return enqueue(async () => {
        if (unsafeCleanup) throw unsafeCleanup;
        try { return await operation(); }
        catch (error) {
          if ((error as { code?: string })?.code === "LOCAL_DATABASE_RELEASE_FAILED") {
            unsafeCleanup = error;
            accepting = false;
          }
          throw error;
        }
      });
    },
    leave,
    enter(budgetId: string): Promise<void> {
      if (accepting && selectedBudget === budgetId) return Promise.resolve();
      const released = leave();
      const activationGeneration = generation;
      return enqueue(async () => {
        await released;
        if (activationGeneration !== generation) throw databaseReleasedError();
        if (unsafeCleanup) throw unsafeCleanup;
        selectedBudget = budgetId;
        accepting = true;
      });
    },
    exclusive<T>(operation: () => Promise<T>): Promise<T> {
      // Reserve the exclusive slot immediately, before another enter/operation.
      const released = leave();
      return enqueue(async () => {
        await released;
        if (unsafeCleanup) throw unsafeCleanup;
        try {
          return await operation();
        } catch (error) {
          if ((error as { code?: string })?.code === "LOCAL_DATABASE_RELEASE_FAILED") unsafeCleanup = error;
          throw error;
        }
      });
    },
  };
}
