import {
  decryptPayload,
  encryptPayload,
} from "../../../security/src/encryptedPayloads.js";

export function encryptAttachmentContent(
  content: Buffer | string,
  key: Buffer,
): string {
  const plain =
    typeof content === "string" ? content : content.toString("base64");
  return JSON.stringify(encryptPayload(plain, key));
}

export function decryptAttachmentContent(
  payloadJson: string,
  key: Buffer,
): string {
  return decryptPayload(JSON.parse(payloadJson), key);
}
