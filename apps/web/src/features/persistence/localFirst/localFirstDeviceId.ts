import type { KeyValueStoragePort } from "../keyValueStoragePort";
import { createRuntimeUuid } from "../../ids/createRuntimeUuid";

const LOCAL_FIRST_DEVICE_ID_KEY = "budget-app.local-first.device-id";

export function getOrCreateLocalFirstDeviceId(
  storage: KeyValueStoragePort,
): string {
  const existing = storage.getItem(LOCAL_FIRST_DEVICE_ID_KEY);
  if (existing) return existing;

  const id = createRuntimeUuid();
  storage.setItem(LOCAL_FIRST_DEVICE_ID_KEY, id);
  return id;
}
