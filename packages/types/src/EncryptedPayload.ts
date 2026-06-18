export interface EncryptedPayload {
  nonce: string;
  authTag: string;
  cipherText: string;
}
