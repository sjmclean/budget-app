import assert from "node:assert/strict";
import test from "node:test";
import { getPayeeSearchRank, rankPayeeSearchMatches, rankPayeeSearchGroups } from "../../../apps/web/src/features/accounts/payeeSearchRanking.ts";

const names = ["Fred's Cafe", "Blue Store", "Red Rooster", "The Red Shop", "Credited Amount", "Shop-Red", "Red Energy", "Direct Credit Red Payment", "Red"];
const payees = names.map((name, id) => ({ id: String(id), name, useCount: 100 - id }));
const expected = ["Red", "Red Energy", "Red Rooster", "Direct Credit Red Payment", "Shop-Red", "The Red Shop", "Credited Amount", "Fred's Cafe"];

test("directory search ranks exact, prefix, later-word prefix, then substring alphabetically", () => {
  assert.deepEqual(rankPayeeSearchMatches(payees, "red").map(p => p.name), expected);
  assert.deepEqual(payees.map(p => p.name), names, "input order is not mutated");
});

test("case and surrounding whitespace do not change search results", () => {
  assert.deepEqual(rankPayeeSearchMatches(payees, "  RED  ").map(p => p.name), expected);
  assert.equal(getPayeeSearchRank("  Red  ", "red"), 0);
});

test("empty query preserves original ordering and non-matches are excluded", () => {
  assert.deepEqual(rankPayeeSearchMatches(payees, "  "), payees);
  assert.deepEqual(rankPayeeSearchMatches(payees, "missing"), []);
});

test("punctuation and whitespace introduce word prefixes, not embedded letters", () => {
  for (const name of ["The Red Shop", "Shop-Red", "Shop / Red", "Shop.Red", "Shop(Red)", "Shop—Red"]) assert.equal(getPayeeSearchRank(name, "red"), 2, name);
  for (const name of ["Fred's Cafe", "Credited Amount", "Alfred Bonnar Rye"]) assert.equal(getPayeeSearchRank(name, "red"), 3, name);
  assert.equal(getPayeeSearchRank("Redacted Merchant", "red"), 1);
  assert.equal(getPayeeSearchRank("Blue Store", "red"), null);
});

test("equal names preserve input order deterministically without popularity weighting", () => {
  const input = [{ id: "first", name: "Red", useCount: 0 }, { id: "second", name: "Red", useCount: 999 }];
  assert.deepEqual(rankPayeeSearchMatches(input, "red"), input);
  assert.deepEqual(rankPayeeSearchMatches(input, "red"), rankPayeeSearchMatches(input, "red"));
});

const groups = [
  { id: "weak", confidence: 1, payees: [{ name: "Credited Amount" }] },
  { id: "prefix-z", confidence: 0, payees: [{ name: "Unrelated Anchor" }, { name: "Red Rooster" }] },
  { id: "none", confidence: 1, payees: [{ name: "Blue Store" }] },
  { id: "prefix-a", confidence: 0, payees: [{ name: "Red Energy" }, { name: "Alfred" }] },
];
const confidenceOrder = (a: typeof groups[number], b: typeof groups[number]) => b.confidence - a.confidence;

test("duplicate search uses the best matching member before confidence or anchor name", () => {
  assert.deepEqual(rankPayeeSearchGroups(groups, "red", confidenceOrder).map(g => g.id), ["prefix-a", "prefix-z", "weak"]);
  assert.deepEqual(groups.map(g => g.id), ["weak", "prefix-z", "none", "prefix-a"]);
});

test("duplicate no-search confidence ordering remains unchanged", () => {
  assert.deepEqual(rankPayeeSearchGroups(groups, "  ", confidenceOrder), [...groups].sort(confidenceOrder));
});

test("duplicate ties use confidence then stable input order", () => {
  const input = [0, 1, 1].map((confidence, id) => ({ id: String(id), confidence, payees: [{ name: "Red" }] }));
  assert.deepEqual(rankPayeeSearchGroups(input, "red", confidenceOrder).map(g => g.id), ["1", "2", "0"]);
});
