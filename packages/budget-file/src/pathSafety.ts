import { resolve, relative, isAbsolute, sep } from "node:path";

/**
 * Returns a path only when the requested path remains inside the budget package.
 *
 * This is intentionally strict because attachments, restore targets, and future import
 * staging all accept file-system paths. A malicious archive or a bad UI bug must not be
 * able to write outside the selected `.budget` package by using values such as
 * `../../Documents/passwords.txt` or absolute paths.
 */
export function resolveInsidePackage(packagePath: string, requestedPath: string): string {
  if (isAbsolute(requestedPath)) {
    throw new Error(`Absolute paths are not allowed inside a budget package: ${requestedPath}`);
  }

  const packageRoot = resolve(packagePath);
  const candidate = resolve(packageRoot, requestedPath);
  const rel = relative(packageRoot, candidate);

  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return candidate;
  }

  throw new Error(`Path escapes budget package: ${requestedPath}`);
}

/**
 * Rejects file names that can change meaning across platforms or folder boundaries.
 * We still store attachments by generated UUID, but this guard protects callers that
 * pass a stored file name back into `getAttachmentPath`.
 */
export function assertSafePackageFileName(fileName: string): void {
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes(sep) || fileName === "." || fileName === "..") {
    throw new Error(`Unsafe package file name: ${fileName}`);
  }
}
