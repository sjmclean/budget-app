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
          {
            entityId: "payee-transfer-cheque",
            name: "Transfer : Cheque Account",
            targetAccountId: "acct-cheque",
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
            payeeId: "payee-transfer-cheque",
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
        scheduledTransactions: [
          {
            entityId: "sched-card-payment",
            accountId: "acct-cheque",
            payeeId: "payee-transfer-visa",
            targetAccountId: "acct-visa",
            amount: -10000,
            date: "2026-02-01",
          },
        ],
      }),
    },
  ];
}

const proof = proveYnab4TransferCreditCardMigration(createPackageEntries());

assert.equal(proof.isYnab4Package, true);
assert.equal(proof.canProceedToWriteImport, true);
assert.equal(proof.budgetName, "Household");
assert.equal(proof.accountCount, 2);
assert.equal(proof.transactionCount, 3);
assert.equal(proof.scheduledTransactionCount, 1);
assert.equal(proof.transferPayeeCount, 2);
assert.equal(proof.ordinaryPayeeCount, 1);
assert.equal(proof.transferTransactionCount, 2);
assert.equal(proof.pairedTransferCount, 2);
assert.equal(proof.unpairedTransferCount, 0);
assert.equal(proof.inverseAmountMismatchCount, 0);
assert.equal(proof.scheduledTransferCount, 1);
assert.equal(proof.creditCardAccountCount, 1);
assert.equal(proof.creditCardPaymentTransferCount, 2);
assert.equal(proof.creditCardPurchaseTransactionCount, 1);
assert.deepEqual(proof.blockers, []);

const sourceTransfer = proof.transferProofs.find(
  (transfer) => transfer.ynab4TransactionId === "txn-payment-source",
);
assert.ok(sourceTransfer, "source transfer should be included in transfer proofs");
assert.equal(sourceTransfer.accountId, "acct-cheque");
assert.equal(sourceTransfer.accountName, "Cheque Account");
assert.equal(sourceTransfer.targetAccountId, "acct-visa");
assert.equal(sourceTransfer.targetAccountName, "Visa Card");
assert.equal(sourceTransfer.transferTransactionId, "txn-payment-target");
assert.equal(sourceTransfer.pairedTransactionId, "txn-payment-target");
assert.equal(sourceTransfer.amount, -25000);
assert.equal(sourceTransfer.pairedAmount, 25000);
assert.equal(sourceTransfer.mapping.sourceAccount, "proved");
assert.equal(sourceTransfer.mapping.targetAccount, "proved");
assert.equal(sourceTransfer.mapping.pairedTransaction, "proved");
assert.equal(sourceTransfer.mapping.inverseAmount, "proved");
assert.equal(sourceTransfer.mapping.ordinaryPayee, "excluded");

const creditCard = proof.creditCardProofs[0];
assert.equal(creditCard.ynab4AccountId, "acct-visa");
assert.equal(creditCard.name, "Visa Card");
assert.equal(creditCard.appAccountType, "credit-card");
assert.equal(creditCard.migrationHandlingMode, "manual-ynab4-traditional");
assert.equal(creditCard.paymentTransferCount, 2);
assert.equal(creditCard.purchaseTransactionCount, 1);
assert.equal(creditCard.mapping.accountType, "proved");
assert.equal(creditCard.mapping.handlingMode, "proved");
assert.equal(creditCard.mapping.automaticPaymentCategory, "not-forced");
assert.equal(creditCard.mapping.paymentsRemainTransfers, "proved");

assert.ok(
  proof.decisions.some((decision) => decision.includes("manual/traditional")),
  "proof should keep YNAB4 credit-card migration in manual/traditional budget mode until the user chooses otherwise",
);
assert.ok(
  proof.decisions.some((decision) => decision.includes("must not be imported as ordinary spending payees")),
  "proof should document transfer payee exclusion from ordinary payees",
);

const brokenPairProof = proveYnab4TransferCreditCardMigration([
  {
    path: "Broken.ynab4/Budget.ymeta",
    text: JSON.stringify({ relativeDataFolderName: "data1-BBBB" }),
  },
  {
    path: "Broken.ynab4/data1-BBBB/budget-guid/Budget.yfull",
    text: JSON.stringify({
      accounts: [
        { entityId: "acct-a", accountName: "A", accountType: "Checking" },
        { entityId: "acct-b", accountName: "B", accountType: "Checking" },
      ],
      payees: [{ entityId: "payee-transfer-b", name: "Transfer : B", targetAccountId: "acct-b" }],
      transactions: [
        {
          entityId: "txn-broken",
          accountId: "acct-a",
          payeeId: "payee-transfer-b",
          targetAccountId: "acct-b",
          transferTransactionId: "missing-pair",
          amount: -5000,
        },
      ],
    }),
  },
]);

assert.equal(brokenPairProof.canProceedToWriteImport, false);
assert.equal(brokenPairProof.unpairedTransferCount, 1);
assert.ok(
  brokenPairProof.blockers.some((blocker) => blocker.includes("transferTransactionId pair")),
  "broken transfer pairs should block write import",
);

console.log("v1.68 transfer & credit card migration validation passed");
