import { SyncProvider } from "../../types/src/SyncProvider.js";

export interface SyncProviderAdapter {
  provider: SyncProvider;
  read(path: string): Promise<Buffer>;
  write(path: string, content: Buffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{ size: number; modifiedAt: number } | null>;
}
