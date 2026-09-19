import type {
  AccountRegisterSummary,
  AccountTransactionRow,
} from "../../../../../packages/application/src/accountRegister/AccountRegisterQueryPort";

export const MAX_REGISTER_DELTA_TRANSACTION_ROOTS = 250;

export interface AccountRegisterDeltaRow {
  readonly accountId: string;
  readonly row: AccountTransactionRow;
}

/** Produced from committed SQLite rows, never from intended command input. */
export type AccountRegisterMutationDelta =
  | {
      readonly mode: "patch";
      readonly budgetId: string;
      readonly affectedAccountIds: readonly string[];
      readonly beforeRows: readonly AccountRegisterDeltaRow[];
      readonly afterRows: readonly AccountRegisterDeltaRow[];
      readonly summaries: readonly AccountRegisterSummary[];
    }
  | {
      readonly mode: "refresh-required";
      readonly budgetId: string;
      readonly affectedAccountIds: readonly string[];
      readonly reason: "delta-too-large" | "unsupported-register-change";
    };
