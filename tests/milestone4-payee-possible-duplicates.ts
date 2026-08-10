import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findPossibleDuplicateGroups, proposeRecognitionRuleForDuplicate, resolvePayeeRecognition } from "../apps/web/src/features/accounts/payeeRecognition";
import type { PayeeView } from "../apps/web/src/features/accounts/payeeService";

const payee = (id: string, name: string, useCount = 1): PayeeView => ({
  id, name, useCount, createdAt: "2026-01-01", lastUsedAt: "2026-08-01",
});

const candidates = [
  payee("b1", "Bakers Delight", 517), payee("b2", "BAKERS DELIGHT 1234", 14),
  payee("a1", "ALDI", 380), payee("a2", "ALDI STORES GREENSBOROUGH", 14),
  payee("e1", "Example Pty Ltd"), payee("e2", "EXAMPLE"),
  payee("w1", "Woolworths"), payee("w2", "Woolworths Insurance"),
  payee("x1", "Apple"), payee("x2", "Apple Services"),
  payee("c1", "Cash"), payee("c2", "Cash Converters"),
];

const groups = findPossibleDuplicateGroups(candidates);
assert.ok(groups.every(({ payees }) => payees.length >= 2));
assert.ok(groups.some(({ payees }) => payees.some(({ id }) => id === "b1") && payees.some(({ id }) => id === "b2")));
assert.ok(groups.some(({ payees }) => payees.some(({ id }) => id === "e1") && payees.some(({ id }) => id === "e2")));
assert.ok(groups.some(({ payees }) => payees.some(({ id }) => id === "a1") && payees.some(({ id }) => id === "a2")));
assert.ok(!groups.some(({ payees }) => payees.some(({ id }) => id === "w1") && payees.some(({ id }) => id === "w2")));
assert.ok(!groups.some(({ payees }) => payees.some(({ id }) => id === "x1") && payees.some(({ id }) => id === "x2")));
assert.ok(!groups.some(({ payees }) => payees.some(({ id }) => id === "c1") && payees.some(({ id }) => id === "c2")));
const baker = groups.find(({ payees }) => payees.some(({ id }) => id === "b1"))!;
assert.ok(baker.reasons.some(({ type }) => type === "shared-core-name"));
assert.equal(findPossibleDuplicateGroups(candidates, [{ leftPayeeId: "b1", rightPayeeId: "b2" }])
  .some(({ payees }) => payees.some(({ id }) => id === "b1") && payees.some(({ id }) => id === "b2")), false);

const rawWoolworths = "EFTPOS 05/07 16:08 WOOLWORTHS 3118CASH OUT $50.00";
const containmentCandidates = [
  payee("woo", "Woolworths", 84), payee("raw-woo", rawWoolworths),
  payee("raw-woo-2", "EFTPOS 08/08 09:15 WOOLWORTHS 3118 $67.42"),
  payee("agl", "AGL", 20), payee("raw-agl", "EFTPOS AGL MELBOURNE 1234"),
  payee("bagley", "BAGLEY"), payee("insurance", "Woolworths Insurance"),
  payee("cash", "Cash"), payee("cashout", "CASH OUT 50.00"),
];
const containmentGroups = findPossibleDuplicateGroups(containmentCandidates);
const woolworthsGroup = containmentGroups.find(({ payees }) => payees.some(({ id }) => id === "woo"))!;
assert.deepEqual(new Set(woolworthsGroup.payees.map(({ id }) => id)), new Set(["woo", "raw-woo", "raw-woo-2"]));
const containmentReason = woolworthsGroup.reasons.find(({ type }) => type === "canonical-name-contained")!;
assert.equal(containmentReason.matchedText, "WOOLWORTHS");
assert.ok(!woolworthsGroup.payees.some(({ id }) => id === "insurance"));
assert.ok(containmentGroups.some(({ payees }) => payees.some(({ id }) => id === "agl") && payees.some(({ id }) => id === "raw-agl")));
assert.ok(!containmentGroups.some(({ payees }) => payees.some(({ id }) => id === "agl") && payees.some(({ id }) => id === "bagley")));
assert.ok(!containmentGroups.some(({ payees }) => payees.some(({ id }) => id === "cash") && payees.some(({ id }) => id === "cashout")));

const proposal = proposeRecognitionRuleForDuplicate(containmentReason, "woo", containmentCandidates)!;
assert.equal(proposal.state, "available");
const recognisedPayee = { ...containmentCandidates[0], importRules: [{ id: "rule-woo", matchType: "contains" as const, text: proposal.text, enabled: true }] };
assert.equal(resolvePayeeRecognition(rawWoolworths, [recognisedPayee]).match?.payee.id, "woo");
assert.equal(proposeRecognitionRuleForDuplicate(containmentReason, "woo", [recognisedPayee])!.state, "existing");
assert.equal(proposeRecognitionRuleForDuplicate(containmentReason, "woo", [containmentCandidates[0], { ...containmentCandidates[1], importRules: recognisedPayee.importRules }])!.state, "conflict");

const correctnessFixtures = [
  payee("chemist", "Chemist Warehouse", 500),
  payee("chemist-noisy-1", "EFTPOS CHEMIST WAREHOUSE PRESTON 1234"),
  payee("chemist-noisy-2", "CHEMIST WAREHOUSE NORTHLAND"),
  ...["McDonalds", "Cotton On", "Boost Juice", "Adelaide Metro", "Muffin Break", "Peking Inn", "Adelaide Nuts"]
    .map((name, index) => payee(`unrelated-${index}`, name)),
  payee("paypal", "PayPal", 50), payee("paypal-officeworks", "PAYPAL *OFFICEWORKS"),
  payee("paypal-ebay", "PAYPAL *EBAY"), payee("paypal-hoyts", "PAYPAL *HOYTS"), payee("paypal-racv", "PAYPAL *RACV"),
  payee("iga", "IGA", 20), payee("iga-noisy", "EFTPOS IGA GREENSBOROUGH"), payee("andrea", "Andrea Johnston"),
  payee("myer", "Myer", 100), payee("myer-northland", "MYER-NORTHLAND PRESTON"), payee("myer-pty", "Myer Pty Ltd DOCKLANDS"),
  payee("agl-boundary", "AGL"), payee("bagley-boundary", "BAGLEY SUPPLIES"),
  payee("cash-generic", "Cash"), payee("cash-noisy", "EFTPOS WOOLWORTHS CASH OUT"),
  payee("adelaide-generic", "Adelaide"), payee("adelaide-nuts", "Adelaide Nuts"),
  payee("united-generic", "United"), payee("united-other", "United Medical Services"),
];
const correctnessGroups = findPossibleDuplicateGroups(correctnessFixtures);
const groupFor = (id: string) => correctnessGroups.find(({ anchorPayeeId }) => anchorPayeeId === id);
assert.deepEqual(new Set(groupFor("chemist")!.payees.map(({ id }) => id)),
  new Set(["chemist", "chemist-noisy-1", "chemist-noisy-2"]));
assert.equal(groupFor("paypal"), undefined, "processor-prefixed merchants must not become PayPal duplicates");
assert.deepEqual(groupFor("iga")!.payees.map(({ id }) => id).sort(), ["iga", "iga-noisy"]);
assert.ok(!groupFor("iga")!.payees.some(({ id }) => id === "andrea"));
assert.equal(correctnessGroups.some(({ payees }) => payees.some(({ id }) => id === "agl-boundary") && payees.some(({ id }) => id === "bagley-boundary")), false);
assert.equal(groupFor("cash-generic"), undefined);
assert.equal(groupFor("adelaide-generic"), undefined);
assert.equal(groupFor("united-generic"), undefined);

const myerGroup = groupFor("myer")!;
assert.deepEqual(new Set(myerGroup.payees.map(({ id }) => id)), new Set(["myer", "myer-northland", "myer-pty"]));
assert.ok(myerGroup.candidates.every(({ reasons }) => reasons.every(({ canonicalPayeeId }) => canonicalPayeeId === "myer")));
assert.ok(myerGroup.reasons.every(({ value }) => /myer|corporate suffix/i.test(value)),
  `Myer evidence was contaminated: ${myerGroup.reasons.map(({ value }) => value).join(", ")}`);
const isolated = findPossibleDuplicateGroups([
  payee("iso-myer", "Myer"), payee("iso-myer-noisy", "EFTPOS MYER NORTHLAND"),
  payee("iso-woo", "Woolworths"), payee("iso-woo-noisy", "EFTPOS WOOLWORTHS 1234"),
]);
const isolatedMyer = isolated.find(({ anchorPayeeId }) => anchorPayeeId === "iso-myer")!;
const isolatedWoolworths = isolated.find(({ anchorPayeeId }) => anchorPayeeId === "iso-woo")!;
assert.ok(isolatedMyer.reasons.every(({ value }) => !/woolworths/i.test(value)));
assert.ok(isolatedWoolworths.reasons.every(({ value }) => !/myer/i.test(value)));
assert.notEqual(isolatedMyer.reasons, isolatedWoolworths.reasons);

const transitive = findPossibleDuplicateGroups([
  payee("transitive-chemist", "Chemist Warehouse"),
  payee("transitive-bridge", "Chemist Warehouse McDonalds"),
  payee("transitive-mcd", "McDonalds"),
]);
assert.ok(!transitive.some(({ anchorPayeeId, payees }) => anchorPayeeId === "transitive-chemist" && payees.some(({ id }) => id === "transitive-mcd")));

const many = Array.from({ length: 5_000 }, (_, index) => payee(`unique-${index}`, `Unique merchant ${index}`));
const started = performance.now();
findPossibleDuplicateGroups(many);
assert.ok(performance.now() - started < 1_000, "indexed detection should remain bounded for thousands of payees");

const page = readFileSync("apps/web/src/pages/PayeeManagementPage.tsx", "utf8");
const schema = readFileSync("apps/web/src/features/persistence/localFirst/registerSchema.ts", "utf8");
assert.match(page, /duplicateGroups\.length/);
assert.match(page, /filteredDuplicateGroups\.map/);
assert.match(page, /Review Merge/);
assert.match(page, /Keep Separate/);
assert.match(page, /Ignore Suggestion/);
assert.match(schema, /local_payee_duplicate_suppressions/);

console.log("Milestone 4 possible duplicate groups passed: reasons, suppressions, false positives, and bounded detection.");
