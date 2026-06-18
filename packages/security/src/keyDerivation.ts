import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const DEFAULT_KEY_DERIVATION = "scrypt:v1:N16384:r8:p1:key32";

export interface DerivedSecret {
  algorithm: string;
  salt: string;
  hash: string;
}

/**
 * Derives a password hash using Node's built-in scrypt KDF.
 *
 * PBKDF2 remains available for backwards compatibility in older services, but new code
 * should prefer this helper because scrypt is intentionally memory-hard and therefore a
 * better fit for protecting local budget files and optional budget encryption keys.
 */
export function derivePasswordSecret(
  password: string,
  salt = randomBytes(16).toString("hex"),
): DerivedSecret {
  const key = scryptSync(password, salt, 32, { N: 16_384, r: 8, p: 1 });
  return { algorithm: DEFAULT_KEY_DERIVATION, salt, hash: key.toString("hex") };
}

export function verifyPasswordSecret(
  password: string,
  expected: DerivedSecret,
): boolean {
  const actual = Buffer.from(
    derivePasswordSecret(password, expected.salt).hash,
    "hex",
  );
  const expectedHash = Buffer.from(expected.hash, "hex");
  return (
    actual.length === expectedHash.length &&
    timingSafeEqual(actual, expectedHash)
  );
}
