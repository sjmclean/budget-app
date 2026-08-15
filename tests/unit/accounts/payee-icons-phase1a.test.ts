import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPayeeService, type PayeeView } from "../../../apps/web/src/features/accounts/payeeService.js";
import { createPayeeEntity, mergePayeeEntities, payeeTimestampFor, projectPayee } from "../../../apps/web/src/features/accounts/entities/payeeEntity.js";
import { mergePayeeIconReferences, parsePayeeIconReference, serialisePayeeIconReference, validatePayeeIconReferenceForWrite } from "../../../apps/web/src/features/icons/payeeIconReference.js";
import { resolvePayeeIcon } from "../../../apps/web/src/features/icons/payeeIconResolver.js";

const payee = (id: string, name: string, iconRef = ""): PayeeView => ({
  id, name, iconRef, createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: "2026-01-02T00:00:00.000Z", useCount: 1,
});

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key), listKeys: () => [...values.keys()] };
}

describe("payee icon reference and resolver", () => {
  it("parses automatic, built-in and reserved content references safely", () => {
    assert.deepEqual(parsePayeeIconReference(""), { kind: "automatic" });
    assert.deepEqual(parsePayeeIconReference("builtin:v1:shopping"), { kind: "builtin", key: "shopping" });
    const hash = "a".repeat(64);
    assert.deepEqual(parsePayeeIconReference(`content:v1:${hash}`), { kind: "content", contentHash: hash });
    assert.equal(parsePayeeIconReference("builtin:v1:not-real").kind, "unknown");
    assert.equal(parsePayeeIconReference("content:v1:ABC").kind, "unknown");
    assert.throws(() => validatePayeeIconReferenceForWrite("bad:v1:value"));
    assert.equal(serialisePayeeIconReference({ kind: "automatic" }), "");
  });

  it("uses only canonical identity for a deterministic fallback", () => {
    const first = resolvePayeeIcon({ payee: payee("p-1", "Woolworths") });
    const second = resolvePayeeIcon({ payee: { ...payee("p-1", "Woolworths"), rawPayee: "ignored" } as never });
    assert.deepEqual(first, second);
    assert.equal(resolvePayeeIcon({ payee: payee("p-1", "Woolworths", "builtin:v1:groceries") }).kind, "builtin");
    assert.equal(resolvePayeeIcon({ payee: payee("p-1", "Woolworths", `content:v1:${"b".repeat(64)}`) }).kind, "initials");
    assert.deepEqual(resolvePayeeIcon({ state: "transfer" }), { kind: "transfer" });
    assert.deepEqual(resolvePayeeIcon({ state: "none" }), { kind: "none" });
  });

  it("applies the approved deterministic merge precedence", () => {
    assert.equal(mergePayeeIconReferences("builtin:v1:shopping", ["builtin:v1:dining"]), "builtin:v1:shopping", "A: explicit target wins");
    assert.equal(mergePayeeIconReferences("", ["builtin:v1:dining"]), "builtin:v1:dining", "B: automatic target inherits one explicit source");
    assert.equal(mergePayeeIconReferences("", ["builtin:v1:dining", "builtin:v1:dining"]), "builtin:v1:dining", "C: duplicate explicit source refs count once");
    assert.equal(mergePayeeIconReferences("", ["builtin:v1:dining", "builtin:v1:fuel"]), "", "D: conflicting explicit sources keep an automatic target automatic");
    assert.equal(mergePayeeIconReferences("builtin:v1:shopping", ["builtin:v1:dining", "builtin:v1:fuel"]), "builtin:v1:shopping", "E: source conflicts never displace an explicit target");
    assert.equal(mergePayeeIconReferences("", [""]), "");
  });
});

describe("browser payee icon persistence", () => {
  it("preserves, sets, resets, renames, archives and restores iconRef", async () => {
    const store = storage();
    const service = createPayeeService({ storage: store });
    await service.recordPayee("Shop");
    let current = (await service.listPayees())[0];
    await service.updatePayee({ id: current.id, name: current.name, note: "note", iconUpdate: { kind: "set", iconRef: "builtin:v1:shopping" } });
    current = (await service.listPayees())[0];
    assert.equal(current.iconRef, "builtin:v1:shopping");
    await service.updatePayee({ id: current.id, name: "Shop renamed", note: "changed" });
    assert.equal((await service.listPayees())[0].iconRef, "builtin:v1:shopping");
    await service.archivePayee(current.id);
    assert.equal((await service.listArchivedPayees())[0].iconRef, "builtin:v1:shopping");
    await service.restorePayee(current.id);
    current = (await service.listPayees())[0];
    assert.equal(current.iconRef, "builtin:v1:shopping");
    await service.updatePayee({ id: current.id, name: current.name, note: "", iconUpdate: { kind: "automatic" } });
    assert.equal((await service.listPayees())[0].iconRef, "");
  });

  it("merges old/new replicated fields symmetrically", () => {
    const older = createPayeeEntity(payee("p", "Payee"), payeeTimestampFor(new Date("2026-01-01")));
    const newer = createPayeeEntity(payee("p", "Payee", "builtin:v1:dining"), payeeTimestampFor(new Date("2026-01-02")));
    const oldWithoutIcon = { ...older, fields: Object.freeze(Object.fromEntries(Object.entries(older.fields).filter(([key]) => key !== "iconRef"))) } as typeof older;
    assert.equal(projectPayee(oldWithoutIcon).iconRef, "");
    assert.equal(projectPayee(mergePayeeEntities(oldWithoutIcon, newer)).iconRef, "builtin:v1:dining");
    assert.equal(projectPayee(mergePayeeEntities(newer, oldWithoutIcon)).iconRef, "builtin:v1:dining");
  });

  it("uses the same icon merge policy for explicit and duplicate-name merges", async () => {
    const store = storage();
    const service = createPayeeService({ storage: store });
    await service.recordPayees(["Automatic target", "Explicit source"]);
    let values = await service.listPayees();
    const target = values.find(({ name }) => name === "Automatic target")!;
    const source = values.find(({ name }) => name === "Explicit source")!;
    await service.updatePayee({ id: source.id, name: source.name, note: "", iconUpdate: { kind: "set", iconRef: "builtin:v1:fuel" } });
    await service.mergePayees({ sourcePayeeId: source.id, targetPayeeId: target.id });
    assert.equal((await service.listPayees()).find(({ id }) => id === target.id)?.iconRef, "builtin:v1:fuel");

    await service.recordPayee("Other source");
    values = await service.listPayees();
    const other = values.find(({ name }) => name === "Other source")!;
    await service.updatePayee({ id: other.id, name: other.name, note: "", iconUpdate: { kind: "set", iconRef: "builtin:v1:home" } });
    await service.updatePayee({ id: other.id, name: "Automatic target", note: "" });
    assert.equal((await service.listPayees()).find(({ id }) => id === target.id)?.iconRef, "builtin:v1:fuel");
  });

  it("evaluates every source together during a multi-source merge", async () => {
    async function mergeWithTargetIcon(targetIconRef: string) {
      const service = createPayeeService({ storage: storage() });
      await service.recordPayees(["Target", "Dining source", "Fuel source"]);
      let values = await service.listPayees();
      const target = values.find(({ name }) => name === "Target")!;
      const dining = values.find(({ name }) => name === "Dining source")!;
      const fuel = values.find(({ name }) => name === "Fuel source")!;
      if (targetIconRef) await service.updatePayee({ id: target.id, name: target.name, note: "", iconUpdate: { kind: "set", iconRef: targetIconRef } });
      await service.updatePayee({ id: dining.id, name: dining.name, note: "", iconUpdate: { kind: "set", iconRef: "builtin:v1:dining" } });
      await service.updatePayee({ id: fuel.id, name: fuel.name, note: "", iconUpdate: { kind: "set", iconRef: "builtin:v1:fuel" } });
      await service.mergePayees({ sourcePayeeId: dining.id, sourcePayeeIds: [dining.id, fuel.id], targetPayeeId: target.id });
      values = await service.listPayees();
      return values.find(({ id }) => id === target.id)?.iconRef;
    }

    assert.equal(await mergeWithTargetIcon(""), "", "D: conflicting sources keep an automatic target automatic");
    assert.equal(await mergeWithTargetIcon("builtin:v1:shopping"), "builtin:v1:shopping", "E: conflicting sources cannot reset an explicit target");
  });

  it("rejects malformed icon references at the write boundary", async () => {
    const service = createPayeeService({ storage: storage() });
    await service.recordPayee("Payee");
    const current = (await service.listPayees())[0];
    await assert.rejects(() => service.updatePayee({ id: current.id, name: current.name, note: "", iconUpdate: { kind: "set", iconRef: "builtin:v1:unknown" } }));
  });
});
