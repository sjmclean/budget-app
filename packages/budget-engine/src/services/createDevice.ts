import { createHash, randomUUID } from "crypto";
import { Device } from "../../../types/src/Device.js";

export function createDevice(userId: string, name: string): Device {
  const now = new Date();
  const raw = `${userId}:${name}:${now.toISOString()}:${randomUUID()}`;

  return {
    id: randomUUID(),
    userId,
    name,
    fingerprint: createHash("sha256").update(raw).digest("hex"),
    trusted: true,
    createdAt: now,
    lastSeenAt: now
  };
}

export function markDeviceSeen(device: Device): Device {
  return {
    ...device,
    lastSeenAt: new Date()
  };
}
