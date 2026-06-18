import { CloudStorageSettings } from "../../types/src/CloudStorageSettings.js";
import { SyncProvider } from "../../types/src/SyncProvider.js";
import { createCloudStorageSettings } from "../../budget-engine/src/services/createCloudStorageSettings.js";

export class CloudStorageSettingsApplicationService {
  createLocalFolderSettings(input: {
    userId: string;
    deviceId?: string | null;
    syncRootPath: string;
  }): CloudStorageSettings {
    return createCloudStorageSettings({
      ...input,
      provider: SyncProvider.LocalFolder
    });
  }

  createProviderSettings(input: {
    userId: string;
    deviceId?: string | null;
    provider: SyncProvider;
    syncRootPath: string;
  }): CloudStorageSettings {
    return createCloudStorageSettings(input);
  }
}
