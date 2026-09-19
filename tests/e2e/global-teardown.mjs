const CONTROL_URL = "http://127.0.0.1:3001";

export default async function globalTeardown() {
  try {
    const response = await fetch(`${CONTROL_URL}/shutdown`, { method: "POST" });
    if (!response.ok) {
      throw new Error(`E2E supervisor shutdown returned HTTP ${response.status}.`);
    }
  } catch (error) {
    if (error?.cause?.code === "ECONNREFUSED") return;
    throw error;
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    try {
      await fetch(`${CONTROL_URL}/health`);
    } catch {
      return;
    }
  }

  throw new Error("E2E supervisor did not finish shutdown within 15 seconds.");
}
