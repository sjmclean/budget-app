import { previewYnab4Import } from "../packages/ynab4-importer/src/index.js";

const empty = previewYnab4Import({});
if (!empty.summary.issues.some((issue) => issue.code === "YNAB4_NO_INPUT" && issue.severity === "error")) {
  throw new Error("Expected empty import to report YNAB4_NO_INPUT");
}

const registerCsv = `Account,Date,Payee,Category,Outflow,Inflow
Checking,,Broken Row,Everyday: Groceries,,`;
const preview = previewYnab4Import({ registerCsv });

if (!preview.summary.issues.some((issue) => issue.code === "YNAB4_TRANSACTION_MISSING_DATE")) {
  throw new Error("Expected missing transaction date issue");
}
if (!preview.summary.issues.some((issue) => issue.code === "YNAB4_TRANSACTION_ZERO_AMOUNT")) {
  throw new Error("Expected zero amount warning");
}

console.log("PASS: v1.2 YNAB4 preview reports empty input, missing dates and zero amount rows clearly");
