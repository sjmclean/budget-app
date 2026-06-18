import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname } from "path";
import { mkdirSync } from "fs";
import { SyncProvider } from "../../types/src/SyncProvider.js";
import { SyncProviderAdapter } from "./SyncProviderAdapter.js";

export class LocalFolderSyncAdapter implements SyncProviderAdapter {
  provider = SyncProvider.LocalFolder;

  async read(path: string): Promise<Buffer> {
    return readFileSync(path);
  }

  async write(path: string, content: Buffer): Promise<void> {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(path);
  }

  async stat(
    path: string,
  ): Promise<{ size: number; modifiedAt: number } | null> {
    if (!existsSync(path)) return null;
    const stats = statSync(path);

    return {
      size: stats.size,
      modifiedAt: stats.mtimeMs,
    };
  }
}
