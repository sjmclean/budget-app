import { createScheduledTransaction } from "../packages/budget-engine/src/services/createScheduledTransaction.js";
import { materializeScheduledTransaction } from "../packages/budget-engine/src/services/materializeScheduledTransaction.js";
import { ScheduledFrequency } from "../packages/types/src/ScheduledFrequency.js";
const scheduled = createScheduledTransaction({ budgetId: "budget", accountId: "checking", payeeId: "rent-payee", categoryId: "rent", amount: -180000, nextDueDate: "2026-07-01", frequency: ScheduledFrequency.Monthly }); console.log(scheduled); console.log(materializeScheduledTransaction(scheduled));
