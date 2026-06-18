import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, join } from "node:path";

export function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function copyDirectory(
  source: string,
  destination: string,
  options?: { excludeNames?: string[] },
): void {
  ensureDir(destination);
  const excluded = new Set(options?.excludeNames ?? []);
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const src = join(source, entry.name);
    const dest = join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(src, dest, options);
    } else if (entry.isFile()) {
      copyFileSync(src, dest);
    }
  }
}

export function directorySize(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  return readdirSync(path).reduce(
    (total, child) => total + directorySize(join(path, child)),
    0,
  );
}

export function sha256File(path: string): string {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
}

export function removeIfExists(path: string): void {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

export function safeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function extensionFor(filePath: string): string {
  const name = basename(filePath);
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}
