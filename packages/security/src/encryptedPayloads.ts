import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { EncryptedPayload } from "../../types/src/EncryptedPayload.js";

export function encryptPayload(
  plainText: string,
  key: Buffer,
): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    nonce: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    cipherText: encrypted.toString("hex"),
  };
}

export function decryptPayload(payload: EncryptedPayload, key: Buffer): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.nonce, "hex"),
  );

  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.cipherText, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
