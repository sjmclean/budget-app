import { Device } from "../../types/src/Device.js";

export interface DeviceRepository {
  create(device: Device): Promise<void>;
  update(device: Device): Promise<void>;
  getById(id: string): Promise<Device | null>;
  findByUser(userId: string): Promise<Device[]>;
}
