import { createRuntimeUuid } from "../ids/createRuntimeUuid";

interface CloneBackupResponse {
  readonly requestId: string;
  readonly ok: boolean;
  readonly sourceBudgetId?: string;
  readonly bytes?: Uint8Array;
  readonly error?: string;
}

export interface CloneBudgetBackupInput {
  readonly file: File;
  readonly targetBudgetId: string;
  readonly targetSyncEpoch: string;
  readonly deviceId: string;
}

export interface CloneBudgetBackupResult {
  readonly sourceBudgetId: string;
  readonly bytes: Uint8Array;
}

export async function cloneBudgetBackup(
  input: CloneBudgetBackupInput,
): Promise<CloneBudgetBackupResult> {
  const requestId = createRuntimeUuid();
  const worker = new Worker(new URL("./backupClone.worker.ts", import.meta.url), {
    type: "module",
    name: "budget-app-backup-clone",
  });

  try {
    const sourceBuffer = await input.file.arrayBuffer();
    const response = await new Promise<CloneBackupResponse>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<CloneBackupResponse>) => {
        if (event.data?.requestId === requestId) resolve(event.data);
      };
      worker.onerror = (event) => {
        reject(new Error(event.message || "The backup clone worker failed."));
      };
      worker.postMessage(
        {
          type: "clone",
          requestId,
          bytes: new Uint8Array(sourceBuffer),
          targetBudgetId: input.targetBudgetId,
          targetSyncEpoch: input.targetSyncEpoch,
          deviceId: input.deviceId,
        },
        [sourceBuffer],
      );
    });

    if (!response.ok || !response.sourceBudgetId || !(response.bytes instanceof Uint8Array)) {
      throw new Error(response.error || "The backup could not be cloned into a new budget.");
    }

    return {
      sourceBudgetId: response.sourceBudgetId,
      bytes: response.bytes,
    };
  } finally {
    worker.terminate();
  }
}
