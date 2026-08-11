import assert from "node:assert/strict";
import {
  findDeterministicDuplicateGroups,
  getPayeeDeleteEligibility,
  normalisePayeeIdentity,
  resolvePayeeRecognition,
} from "../apps/web/src/features/accounts/payeeRecognition";
import type { PayeeView } from "../apps/web/src/features/accounts/payeeService";

const base = (overrides: Partial<PayeeView>): PayeeView => ({
  id: "payee", name: "Payee", createdAt: "", lastUsedAt: "", useCount: 0,
  ...overrides,
});
const woolworths = base({ id: "w", name: "Woolworths", aliases: [{ id: "a", value: "WOOLWORTHS METRO" }],
  importRules: [{ id: "r", matchType: "contains", text: "WOOLWORTHS" }] });
const broad = base({ id: "b", name: "Other", importRules: [{ id: "b-r", matchType: "contains", text: "METRO" }] });

assert.equal(normalisePayeeIdentity("  W'worths--123 "), "w worths 123");
assert.equal(resolvePayeeRecognition("woolworths metro", [woolworths, broad]).match, null,
  "conflicting explicit rules must be reviewed instead of being hidden by learned aliases");
assert.equal(resolvePayeeRecognition("WOOLWORTHS 1234", [woolworths]).match?.payee.id, "w");
const ambiguous = resolvePayeeRecognition("SHOP METRO WOOLWORTHS", [woolworths, broad]);
assert.equal(ambiguous.match, null);
assert.equal(ambiguous.ambiguous.length, 2, "same-precedence rules must surface ambiguity");
assert.equal(getPayeeDeleteEligibility(base({ useCount: 1 })).canDelete, false);
assert.equal(getPayeeDeleteEligibility(base({ scheduledUseCount: 1 })).canDelete, false);
assert.equal(getPayeeDeleteEligibility(base({ importRules: [{ id: "r", matchType: "equals", text: "x" }] })).canDelete, false);
assert.equal(getPayeeDeleteEligibility(base({ aliases: [{ id: "a", value: "x" }] })).canDelete, true,
  "aliases may be cascade-deleted for an otherwise-unused payee");
assert.equal(findDeterministicDuplicateGroups([
  base({ id: "1", name: "Example Pty Ltd" }), base({ id: "2", name: "EXAMPLE" }),
  base({ id: "3", name: "Example Insurance" }),
]).length, 1);

console.log("Milestone 4 payee recognition and safety contracts passed.");
