import { parseCsv } from "../packages/ynab4-importer/src/parseCsv.js";
import { mapYnab4RegisterRow } from "../packages/ynab4-importer/src/mapYnab4Rows.js";

const csv = `Date,Payee,Category,Memo,Outflow,Inflow,Cleared,Flag
2026-06-17,Woolworths,Groceries,Weekly shop,150.00,,C,Red
2026-06-18,Salary,Ready To Budget,Pay,,4000.00,C,`;

const rows = parseCsv(csv);

console.log(rows.map(mapYnab4RegisterRow));
