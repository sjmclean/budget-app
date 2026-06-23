import assert from "node:assert/strict";
import { proveYnab4TransferCreditCardMigration } from "../packages/ynab4-importer/src/proveYnab4TransferCreditCardMigration.js";

function createPackageEntries() {
  return [
    {
      path: "Household.ynab4/Budget.ymeta",
      text: JSON.stringify({ relativeDataFolderName: "data1-AAAA" }),
    },
    {
      path: "Household.ynab4/data1-AAAA/budget-guid/Budget.yfull",
      text: JSON.stringify({
        accounts: [
          {
            entityId: "acct-cheque",
            accountName: "Cheque Account",
            accountType: "Checking",
            onBudget: true,
          },
          {
            entityId: "acct-visa",
            accountName: "Visa Card",
            accountType: "CreditCard",
            onBudget: true,
          },
        ],
        payees: [
          {
            entityId: "payee-coles",
            name: "Coles",
          },
          {
            entityId: "payee-transfer-visa",
            name: "Transfer : Visa Card",
            targetAccountId: "acct-visa",
          },
        ],
        transactions: [
          {
            entityId: "txn-payment-source",
            accountId: "acct-cheque",
            payeeId: "payee-transfer-visa",
            targetAccountId: "acct-visa",
            transferTransactionId: "txn-payment-target",
            amount: -25000,
            date: "2026-01-12",
          },
          {
            entityId: "txn-payment-target",
            accountId: "acct-visa",
            payeeId: "payee-transfer-visa",
            targetAccountId: "acct-cheque",
            transferTransactionId: "txn-payment-source",
            amount: 25000,
            date: "2026-01-12",
          },
          {
            entityId: "txn-card-spend",
            accountId: "acct-visa",
            payeeId: "payee-coles",
            categoryId: "cat-groceries",
            amount: -4250,
            date: "2026-01-13",
          },
        ],
      }),
    },
  ];
}

const proof = proveYnab4TransferCreditCardMigration(createPackageEntries());

assert.equal(proof.isYnab4Package, true);
assert.equal(proof.budgetName, "Household");
assert.equal(proof.transferPayeeCount, 1);
assert.equal(proof.ordinaryPayeeCount, 1);
assert.equal(proof.transferTransactionCount, 2);
assert.equal(proof.pairedTransferCount, 2);
assert.equal(proof.unpairedTransferCount, 0);
assert.equal(proof.creditCardAccountCount, 1);

const sourceTransfer = proof.transferProofs.find(
  (transfer) => transfer.ynab4TransactionId === "txn-payment-source",
);
assert.ok(sourceTransfer, "source transfer should be included in transfer proofs");
assert.equal(sourceTransfer.accountId, "acct-cheque");
assert.equal(sourceTransfer.targetAccountId, "acct-visa");
assert.equal(sourceTransfer.transferTransactionId, "txn-payment-target");
assert.equal(sourceTransfer.mapping.sourceAccount, "proved");
assert.equal(sourceTransfer.mapping.targetAccount, "proved");
assert.equal(sourceTransfer.mapping.pairedTransaction, "proved");
assert.equal(sourceTransfer.mapping.ordinaryPayee, "excluded");

const creditCard = proof.creditCardProofs[0];
assert.equal(creditCard.ynab4AccountId, "acct-visa");
assert.equal(creditCard.name, "Visa Card");
assert.equal(creditCard.appAccountType, "credit-card");
assert.equal(creditCard.migrationHandlingMode, "manual-ynab4-traditional");
assert.equal(creditCard.mapping.accountType, "proved");
assert.equal(creditCard.mapping.handlingMode, "proved");
assert.equal(creditCard.mapping.automaticPaymentCategory, "not-forced");

assert.ok(
  proof.blockers.some((blocker) => blocker.includes("YNAB4/manual/traditional")),
  "proof should keep YNAB4 credit-card migration in manual/traditional budget mode until the user chooses otherwise",
);

console.log("v1.68 transfer & credit card migration validation passed");
