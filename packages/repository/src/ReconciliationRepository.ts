import { Reconciliation } from "../../types/src/Reconciliation.js";

export interface ReconciliationRepository {
  create(reconciliation: Reconciliation): Promise<void>;
  findByAccount(accountId: string): Promise<Reconciliation[]>;
}
