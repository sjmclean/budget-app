import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import Database from "better-sqlite3";

import { isUncategorisedRegisterTransaction } from "../../../apps/web/src/features/accounts/registerUncategorised.js";
import { uncategorisedTransactionPredicate } from "../../../apps/web/src/features/persistence/localFirst/uncategorisedTransactionSql.js";
import { LOCAL_REGISTER_SCHEMA_SQL } from "../../../apps/web/src/features/persistence/localFirst/registerSchema.js";
import type { RegisterTransactionView } from "../../../apps/web/src/features/accounts/accountRegisterTypes.js";

const BUDGET = "classification-budget";
const MONTH = "2026-08";

test("persisted SQLite filter, navigation, dashboard and TypeScript classification agree", () => {
  const directory = mkdtempSync(join(tmpdir(), "budget-app-category-attention-"));
  const db = new Database(join(directory, "classification.sqlite"));
  try {
    db.exec(LOCAL_REGISTER_SCHEMA_SQL);
    const account = db.prepare(`INSERT INTO local_accounts(
      id,budget_id,name,type,participation,opening_balance,currency_code,created_at,closed_at
    ) VALUES(?,?,?,?,?,0,'AUD','2026-01-01',NULL)`);
    account.run("checking", BUDGET, "Checking", "checking", "on-budget");
    account.run("credit", BUDGET, "Credit", "credit-card", "on-budget");
    account.run("savings", BUDGET, "Savings", "savings", "on-budget");
    account.run("tracking", BUDGET, "Tracking", "tracking", "off-budget");

    const insert = db.prepare(`INSERT INTO local_transactions(
      id,budget_id,account_id,date,amount,cleared_status,category_id,category_name,
      transfer_account_id,transfer_transaction_id,generated_from_schedule,updated_at
    ) VALUES(@id,@budget,@account,'2026-08-15',@amount,'uncleared',@categoryId,@categoryName,
      @transferAccountId,@transferTransactionId,0,'2026-08-15T00:00:00Z')`);
    const rows = [
      ["u-out","checking",-100,null,null,null,null],
      ["u-in","checking",100,null,null,null,null],
      ["cat-in","checking",100,"income","Income",null,null],
      ["rta","checking",100,"__ready_to_assign__","Ready to Assign",null,null],
      ["zero","checking",0,null,null,null,null],
      ["credit-refund","credit",600,null,null,null,null],
      ["off-out","tracking",-100,null,null,null,null],
      ["off-in","tracking",100,null,null,null,null],
      ["internal","checking",-100,null,"Transfer","savings","internal-other"],
      ["internal-other","savings",100,null,"Transfer","checking","internal"],
      ["dangling","checking",-100,null,"Transfer","savings",null],
      ["to-off-cat","checking",-100,"housing","Housing","tracking","to-off-cat-other"],
      ["to-off-cat-other","tracking",100,null,"Transfer","checking","to-off-cat"],
      ["to-off-no","checking",-100,null,"Transfer","tracking","to-off-no-other"],
      ["to-off-no-other","tracking",100,null,"Transfer","checking","to-off-no"],
      ["from-off-cat","tracking",-100,null,"Transfer","checking","from-off-cat-other"],
      ["from-off-cat-other","checking",100,"income","Income","tracking","from-off-cat"],
      ["from-off-no","tracking",-100,null,"Transfer","checking","from-off-no-other"],
      ["from-off-no-other","checking",100,null,"Transfer","tracking","from-off-no"],
      ["split-cat","checking",-100,null,"Split",null,null],
      ["split-missing","checking",-100,null,"Split",null,null],
      ["split-internal","checking",-100,null,"Split",null,null],
      ["split-dangling","checking",-100,null,"Split",null,null],
      ["split-cross-cat","checking",-100,null,"Split",null,null],
      ["split-cross-no","checking",-100,null,"Split",null,null],
    ] as const;
    for (const [id, accountId, amount, categoryId, categoryName, transferAccountId, transferTransactionId] of rows) {
      insert.run({ id, budget: BUDGET, account: accountId, amount, categoryId, categoryName, transferAccountId, transferTransactionId });
    }
    const split = db.prepare(`INSERT INTO local_transaction_splits(
      transaction_id,id,category_id,category_name,transfer_account_id,transfer_transaction_id,memo,amount
    ) VALUES(?,?,?,?,?,?,NULL,?)`);
    split.run("split-cat","line","food","Food",null,null,-100);
    split.run("split-missing","line",null,null,null,null,-100);
    split.run("split-internal","line",null,"Transfer","savings","split-internal-other",-100);
    split.run("split-dangling","line",null,"Transfer","savings",null,-100);
    split.run("split-cross-cat","line","housing","Housing","tracking","split-cross-cat-other",-100);
    split.run("split-cross-no","line",null,"Transfer","tracking","split-cross-no-other",-100);

    const predicate = uncategorisedTransactionPredicate("transaction_row");
    const idsFor = (accountId: string) => (db.prepare(
      `SELECT transaction_row.id FROM local_transactions AS transaction_row
       WHERE transaction_row.budget_id=? AND transaction_row.account_id=? AND (${predicate})
       ORDER BY transaction_row.id`,
    ).all(BUDGET, accountId) as { id: string }[]).map(row => row.id);

    const expectedChecking = [
      "dangling","from-off-no-other","split-cross-no","split-dangling",
      "split-missing","to-off-no","u-in","u-out",
    ].sort();
    assert.deepEqual(idsFor("checking"), expectedChecking);
    assert.deepEqual(idsFor("credit"), ["credit-refund"]);
    assert.deepEqual(idsFor("tracking"), []);

    const navigation = db.prepare(
      `SELECT account.id,
        EXISTS(SELECT 1 FROM local_transactions AS transaction_row
          WHERE transaction_row.budget_id=account.budget_id
            AND transaction_row.account_id=account.id AND (${predicate})) AS warned
       FROM local_accounts AS account WHERE account.budget_id=? ORDER BY account.id`,
    ).all(BUDGET) as { id: string; warned: number }[];
    assert.deepEqual(Object.fromEntries(navigation.map(row => [row.id, Boolean(row.warned)])), {
      checking: true, credit: true, savings: false, tracking: false,
    });

    const dashboard = db.prepare(
      `SELECT COUNT(*) AS count FROM local_transactions AS transaction_row
       WHERE transaction_row.budget_id=? AND substr(transaction_row.date,1,7)=?
         AND (${predicate})`,
    ).get(BUDGET, MONTH) as { count: number };
    assert.equal(dashboard.count, expectedChecking.length + 1);

    const participation = new Map([
      ["checking","on-budget"],["credit","on-budget"],
      ["savings","on-budget"],["tracking","off-budget"],
    ] as const);
    const hydrated = rows.map(([id, accountId, amount, categoryId, categoryName, transferAccountId, transferTransactionId]) => {
      const splitRows = db.prepare(`SELECT id,category_id AS categoryId,category_name AS category,
        transfer_account_id AS transferAccountId,transfer_transaction_id AS transferTransactionId,amount
        FROM local_transaction_splits WHERE transaction_id=?`).all(id) as Array<{
          id:string; categoryId:string|null; category:string|null; transferAccountId:string|null;
          transferTransactionId:string|null; amount:number;
        }>;
      return {
        id,date:"2026-08-15",attachmentCount:0,payee:"Example",
        category:categoryName ?? "Uncategorised",categoryId:categoryId ?? undefined,
        inflow:amount>0?amount/100:0,outflow:amount<0?-amount/100:0,
        runningBalance:0,cleared:false,reconciled:false,
        transferAccountId:transferAccountId ?? undefined,
        transferTransactionId:transferTransactionId ?? undefined,
        transferAccountParticipation:transferAccountId ? participation.get(transferAccountId) : undefined,
        splitLines:splitRows.map(line => ({
          id:line.id,category:line.category ?? "Uncategorised",categoryId:line.categoryId ?? undefined,
          inflow:line.amount>0?line.amount/100:0,outflow:line.amount<0?-line.amount/100:0,
          transferAccountId:line.transferAccountId ?? undefined,
          transferTransactionId:line.transferTransactionId ?? undefined,
          transferAccountParticipation:line.transferAccountId ? participation.get(line.transferAccountId) : undefined,
        })),
        accountId,
      };
    });
    const tsIdsFor = (accountId: string) => hydrated
      .filter(row => row.accountId === accountId)
      .filter(row => isUncategorisedRegisterTransaction(
        row as RegisterTransactionView,
        { accountParticipation: participation.get(accountId)! },
      ))
      .map(row => row.id).sort();
    assert.deepEqual(tsIdsFor("checking"), expectedChecking);
    assert.deepEqual(tsIdsFor("credit"), ["credit-refund"]);
    assert.deepEqual(tsIdsFor("tracking"), []);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
