import { eq } from "drizzle-orm";
import { devices } from "../../database/src/schema.js";
import { Device } from "../../types/src/Device.js";
import { DeviceRepository } from "./DeviceRepository.js";

export class SqliteDeviceRepository implements DeviceRepository {
  constructor(private db: any) {}

  async create(device: Device): Promise<void> {
    await this.db.insert(devices).values(device);
  }

  async update(device: Device): Promise<void> {
    await this.db.update(devices).set(device).where(eq(devices.id, device.id));
  }

  async getById(id: string): Promise<Device | null> {
    const rows = await this.db.select().from(devices).where(eq(devices.id, id));
    return rows[0] ?? null;
  }

  async findByUser(userId: string): Promise<Device[]> {
    return await this.db.select().from(devices).where(eq(devices.userId, userId));
  }
}
