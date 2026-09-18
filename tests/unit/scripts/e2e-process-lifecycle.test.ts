import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { terminateProcessTree } from "../../../scripts/e2e-process-lifecycle.mjs";

class FakeChild extends EventEmitter {
  pid = 4242;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  killed = false;

  exit() {
    this.exitCode = 0;
    this.emit("exit", 0, null);
  }

  kill() {
    this.killed = true;
    this.exit();
    return true;
  }
}

test("Windows termination delegates the complete child tree and awaits exit", async () => {
  const child = new FakeChild();
  const calls: Array<[number, number]> = [];

  await terminateProcessTree(child, "web", {
    platform: "win32",
    taskkill: async (pid: number, timeoutMs: number) => {
      calls.push([pid, timeoutMs]);
      child.exit();
    },
    forceTimeoutMs: 25,
  });

  assert.deepEqual(calls, [[4242, 25]]);
});

test("POSIX termination escalates a non-responsive process group", async () => {
  const child = new FakeChild();
  const signals: string[] = [];

  await terminateProcessTree(child, "server", {
    platform: "linux",
    gracefulTimeoutMs: 1,
    forceTimeoutMs: 25,
    signalGroup: (_pid: number, signal: string) => {
      signals.push(signal);
      if (signal === "SIGKILL") child.exit();
    },
  });

  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});

test("termination is a no-op after a child has already exited", async () => {
  const child = new FakeChild();
  child.exitCode = 1;
  let called = false;

  await terminateProcessTree(child, "server", {
    platform: "win32",
    taskkill: async () => { called = true; },
  });

  assert.equal(called, false);
});

test("Windows termination falls back to the owned child in restricted jobs", async () => {
  const child = new FakeChild();

  await terminateProcessTree(child, "web", {
    platform: "win32",
    taskkill: async () => { throw new Error("ERROR: Access denied"); },
    forceTimeoutMs: 25,
  });

  assert.equal(child.killed, true);
});
