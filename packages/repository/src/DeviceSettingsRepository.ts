import { DeviceSettings } from "../../types/src/DeviceSettings.js";

export interface DeviceSettingsRepository {
  create(item: DeviceSettings): Promise<void>;
  update?(item: DeviceSettings): Promise<void>;
  findByDeviceId(deviceId: string): Promise<DeviceSettings[]>;
}
