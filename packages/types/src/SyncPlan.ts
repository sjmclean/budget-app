export interface SyncPlan {
  canFastForward: boolean;
  requiresMerge: boolean;
  conflictCount: number;
  notes: string[];
}
