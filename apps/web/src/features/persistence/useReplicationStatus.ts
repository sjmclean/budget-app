import { useSyncExternalStore } from "react";
import {
  getReplicationServiceSnapshot,
  subscribeReplicationService,
} from "./replicationService";

export function useReplicationStatus() {
  return useSyncExternalStore(
    subscribeReplicationService,
    getReplicationServiceSnapshot,
    getReplicationServiceSnapshot,
  );
}
