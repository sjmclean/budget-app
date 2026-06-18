import { BankImportApplicationService } from "../packages/application/src/BankImportApplicationService.js";

const service = new BankImportApplicationService();

const csv = `Date,Description,Debit,Credit,Memo,Transaction Id\n2026-06-01,Woolworths,42.50,,Groceries run,abc-1\n2026-06-02,Salary,,2500.00,Fortnightly pay,abc-2`;
const csvPreview = service.previewCsv(csv, {
  date: "Date",
  payee: "Description",
  debit: "Debit",
  credit: "Credit",
  memo: "Memo",
  externalId: "Transaction Id",
  hasHeader: true,
  dateFormat: "yyyy-mm-dd"
});

if (csvPreview.issues.length !== 0) throw new Error(`Expected clean CSV import, got ${JSON.stringify(csvPreview.issues)}`);
if (csvPreview.transactions.length !== 2) throw new Error("Expected two CSV transactions");
if (csvPreview.transactions[0].amount !== -4250) throw new Error("Expected debit column to become negative minor units");
if (csvPreview.transactions[1].amount !== 250000) throw new Error("Expected credit column to become positive minor units");

const qif = `!Type:Bank\nD03/06/2026\nT-19.95\nPCafe\nMCoffee\nLEating Out\n^`;
const qifPreview = service.previewQif(qif);
if (qifPreview.transactions.length !== 1) throw new Error("Expected one QIF transaction");
if (qifPreview.transactions[0].date !== "2026-06-03") throw new Error("Expected QIF date to normalize to ISO format");
if (qifPreview.transactions[0].importedCategoryName !== "Eating Out") throw new Error("Expected QIF category label to be captured");

const ofx = `<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260604120000<TRNAMT>-12.34<FITID>fit-1<NAME>Bakery<MEMO>Bread</STMTTRN></BANKTRANLIST></OFX>`;
const ofxPreview = service.previewOfx(ofx);
if (ofxPreview.transactions.length !== 1) throw new Error("Expected one OFX transaction");
if (ofxPreview.transactions[0].amount !== -1234) throw new Error("Expected OFX amount to parse to minor units");
if (ofxPreview.transactions[0].externalId !== "fit-1") throw new Error("Expected OFX FITID to become external id");

const badCsv = service.previewCsv("Date,Description,Amount\nnot-a-date,Unknown,abc", {
  date: "Date",
  payee: "Description",
  amount: "Amount",
  hasHeader: true
});
if (!badCsv.issues.some((issue) => issue.code === "InvalidDate")) throw new Error("Expected invalid CSV date to be reported");

console.log("v1.2.13 bank import parsers OK");
