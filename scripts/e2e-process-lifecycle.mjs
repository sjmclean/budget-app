import { spawn } from "node:child_process";

const DEFAULT_GRACEFUL_TIMEOUT_MS = 2_000;
const DEFAULT_FORCE_TIMEOUT_MS = 5_000;

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolveWait) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      resolveWait(false);
    }, timeoutMs);
    timeout.unref?.();

    function onExit() {
      clearTimeout(timeout);
      resolveWait(true);
    }

    child.once("exit", onExit);
  });
}

function runTaskkill(pid, timeoutMs) {
  return new Promise((resolveTaskkill, rejectTaskkill) => {
    const taskkill = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      taskkill.kill("SIGKILL");
      rejectTaskkill(new Error(`taskkill timed out after ${timeoutMs}ms for PID ${pid}.`));
    }, timeoutMs);
    timeout.unref?.();

    taskkill.stdout.on("data", (chunk) => { stdout += chunk; });
    taskkill.stderr.on("data", (chunk) => { stderr += chunk; });
    taskkill.once("error", (error) => {
      clearTimeout(timeout);
      rejectTaskkill(error);
    });
    taskkill.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0 || code === 128) {
        resolveTaskkill();
        return;
      }
      rejectTaskkill(new Error(
        `taskkill failed for PID ${pid} with exit code ${code}: ${stderr || stdout}`.trim(),
      ));
    });
  });
}

export async function terminateProcessTree(child, label, options = {}) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;

  const platform = options.platform ?? process.platform;
  const gracefulTimeoutMs = options.gracefulTimeoutMs ?? DEFAULT_GRACEFUL_TIMEOUT_MS;
  const forceTimeoutMs = options.forceTimeoutMs ?? DEFAULT_FORCE_TIMEOUT_MS;
  const taskkill = options.taskkill ?? runTaskkill;
  const signalGroup = options.signalGroup ?? ((pid, signal) => process.kill(-pid, signal));

  if (platform === "win32") {
    try {
      await taskkill(child.pid, forceTimeoutMs);
    } catch (error) {
      if (!String(error?.message).includes("Access denied")) throw error;
      if (!child.kill("SIGKILL")) {
        throw new Error(`Unable to terminate E2E ${label} process (PID ${child.pid}).`, {
          cause: error,
        });
      }
    }
  } else {
    try {
      signalGroup(child.pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
    if (!await waitForExit(child, gracefulTimeoutMs)) {
      try {
        signalGroup(child.pid, "SIGKILL");
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    }
  }

  if (!await waitForExit(child, forceTimeoutMs)) {
    throw new Error(`E2E ${label} process tree (PID ${child.pid}) did not terminate.`);
  }
}

export function childSpawnOptions(repositoryRoot, env) {
  return {
    cwd: repositoryRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    detached: process.platform !== "win32",
  };
}
