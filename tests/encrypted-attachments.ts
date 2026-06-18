import { createRandomBudgetKey } from "../packages/security/src/keys.js";
import { encryptAttachmentContent, decryptAttachmentContent } from "../packages/budget-engine/src/services/encryptAttachmentContent.js";

const key = createRandomBudgetKey();
const encrypted = encryptAttachmentContent("Receipt content", key);
const decrypted = decryptAttachmentContent(encrypted, key);

console.log(encrypted);
console.log(decrypted);
