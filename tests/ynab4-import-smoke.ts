import { importYnab4 } from "../packages/ynab4-importer/src/importYnab4.js";
const accountsCsv = `Account Name,Type
Checking,Checking
Visa,Credit Card`;
const registerCsv = `Date,Payee,Category,Outflow,Inflow
2026-06-17,Woolworths,Groceries,150.00,
2026-06-18,Salary,Ready To Budget,,4000.00`;
console.log(importYnab4({ accountsCsv, registerCsv }));
