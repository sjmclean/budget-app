import type { RestorePointFiles } from "../../apps/web/src/features/budget/restorePointStore";

/** Atomic-close OPFS model; instances for the same budget share one lock/namespace. */
export function memoryRestorePointFiles() {
  const budgets = new Map<string, ReturnType<typeof catalogue>>();
  function catalogue() {
    const entries = new Map<string, File>();
    const operations: string[] = [];
    const faults: {
      beforeWrite?: (path: string) => void | Promise<void>;
      afterWrite?: (path: string) => void | Promise<void>;
      beforeRead?: (path: string) => void;
      beforeRemove?: (path: string) => void;
    } = {};
    let tail: Promise<unknown> = Promise.resolve();
    const files: RestorePointFiles = {
      exclusive(operation) {
        const pending = tail.then(operation);
        tail = pending.catch(() => undefined);
        return pending;
      },
      async names(directory) {
        operations.push(`names:${directory}`);
        return [...entries.keys()].filter((key) => key.startsWith(`${directory}/`)).map((key) => key.slice(directory.length + 1));
      },
      async read(directory, name) {
        const path = `${directory}/${name}`;
        faults.beforeRead?.(path);
        operations.push(`read:${path}`);
        const file = entries.get(path);
        if (!file) throw new Error(`missing ${path}`);
        return file;
      },
      async write(directory, name, chunks) {
        const path = `${directory}/${name}`;
        await faults.beforeWrite?.(path);
        const parts: Uint8Array<ArrayBuffer>[] = [];
        for await (const chunk of chunks) parts.push(Uint8Array.from(chunk));
        entries.set(path, new File(parts, name));
        operations.push(`write:${path}`);
        await faults.afterWrite?.(path);
      },
      async remove(directory, name) {
        const path = `${directory}/${name}`;
        faults.beforeRemove?.(path);
        operations.push(`remove:${path}`);
        entries.delete(path);
      },
    };
    return { entries, operations, faults, files };
  }
  const budget = (id: string) => {
    if (!budgets.has(id)) budgets.set(id, catalogue());
    return budgets.get(id)!;
  };
  return { budget, forBudget: (id: string) => budget(id).files };
}

export async function collectRestorePointBytes(_point: unknown, chunks: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  // Test-only reconstruction for byte equality and opening with native SQLite.
  return Buffer.concat(parts);
}
