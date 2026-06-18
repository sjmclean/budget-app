import { Device } from "../../types/src/Device.js";
import {
  createDevice,
  markDeviceSeen,
} from "../../budget-engine/src/services/createDevice.js";
import { DeviceRepository } from "../../repository/src/DeviceRepository.js";

export class DeviceApplicationService {
  constructor(private repo: DeviceRepository) {}

  async registerDevice(userId: string, name: string): Promise<Device> {
    const device = createDevice(userId, name);
    await this.repo.create(device);
    return device;
  }

  async markSeen(deviceId: string): Promise<Device> {
    const device = await this.repo.getById(deviceId);
    if (!device) throw new Error("Device not found");

    const updated = markDeviceSeen(device);
    await this.repo.update(updated);
    return updated;
  }

  async listUserDevices(userId: string): Promise<Device[]> {
    return await this.repo.findByUser(userId);
  }
}
