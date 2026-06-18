import { calculateFutureMonthOffset, validateFutureMonth } from "../packages/budget-engine/src/index.js";

const offset = calculateFutureMonthOffset("2027-06", "2026-06");
if (offset !== 12) {
  throw new Error(`Expected 12-month offset, got ${offset}`);
}

validateFutureMonth("2027-06", "2026-06", 12);

let rejected = false;
try {
  validateFutureMonth("2027-07", "2026-06", 12);
} catch {
  rejected = true;
}

if (!rejected) {
  throw new Error("Expected month beyond configured future limit to be rejected");
}

console.log("v1.2.4 future month limits OK");
