import { eq } from "drizzle-orm";
import { deviceSettings } from "../../database/src/schema.js";
import { DeviceSettings } from "../../types/src/DeviceSettings.js";
import { DeviceSettingsRepository } from "./DeviceSettingsRepository.js";

export class SqliteDeviceSettingsRepository implements DeviceSettingsRepository {
  constructor(private db: any) {}

  async create(item: DeviceSettings): Promise<void> {
    await this.db.insert(deviceSettings).values(item);
  }

  async update(item: DeviceSettings): Promise<void> {
    await this.db.update(deviceSettings).set(item).where(eq(deviceSettings.id, item.id));
  }

  async findByDeviceId(deviceId: string): Promise<DeviceSettings[]> {
    return await this.db.select().from(deviceSettings).where(eq(deviceSettings.deviceId, deviceId));
  }
}
