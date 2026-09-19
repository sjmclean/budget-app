import type { LocalBudgetRuntimeClient } from "../../accountRegisterQueryContracts";
import type { LocalBudgetMutation } from "../contracts";
import type {
  LocalTransactionAttachmentMutationPayload,
  LocalTransactionAttachmentRecord,
} from "../registerSchema";
import type { LocalBudgetDatabaseClient } from "../localBudgetClient";
import { committedCommandResult, type CommittedCommandMethods } from "./commandContext";

type AttachmentCommands = Pick<
  LocalBudgetRuntimeClient,
  "addTransactionAttachment" | "removeTransactionAttachment" | "readTransactionAttachment"
>;
type AttachmentWriteCommands = Pick<AttachmentCommands, "addTransactionAttachment" | "removeTransactionAttachment">;

export interface AttachmentCommandDependencies {
  readonly requireDatabase: (budgetId: string) => Promise<LocalBudgetDatabaseClient>;
  readonly createMutation: (
    budgetId: string,
    domain: "transactions",
    entityId: string,
    operation: "upsert" | "delete",
    payload: LocalTransactionAttachmentMutationPayload,
  ) => LocalBudgetMutation;
  readonly encodeBase64: (bytes: Uint8Array) => string;
}

/** Owns replicated transaction-attachment writes and the paired binary read. */
export function createAttachmentCommands(
  dependencies: AttachmentCommandDependencies,
): CommittedCommandMethods<AttachmentWriteCommands> & Pick<AttachmentCommands, "readTransactionAttachment"> {
  return {
    async addTransactionAttachment(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const attachment: LocalTransactionAttachmentRecord = {
        id: input.attachment.id,
        budgetId: input.budgetId,
        transactionId: input.transactionId,
        fileName: input.attachment.fileName,
        fileSize: input.attachment.fileSize,
        mimeType: input.attachment.mimeType,
        attachedAt: input.attachment.attachedAt,
        contentHash: input.attachment.contentHash ?? "",
      };
      const payload: LocalTransactionAttachmentMutationPayload = {
        kind: "transaction-attachment-upsert",
        attachment,
        contentBase64: dependencies.encodeBase64(input.content),
      };
      const mutation = dependencies.createMutation(
        input.budgetId, "transactions", `attachment:${attachment.id}`, "upsert", payload,
      );
      const { registerDelta } = await local.writeTransactionAttachment(
        attachment,
        input.content,
        mutation,
      );
      return committedCommandResult(undefined, [mutation], { budgetId: input.budgetId,
        domains: ["attachments", "transactions"], transactionIds: [input.transactionId] }, registerDelta);
    },

    async removeTransactionAttachment(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const attachment: LocalTransactionAttachmentRecord = {
        id: input.attachmentId,
        budgetId: input.budgetId,
        transactionId: input.transactionId,
        fileName: "deleted",
        fileSize: 0,
        mimeType: "application/octet-stream",
        attachedAt: new Date().toISOString(),
        contentHash: `sha256:${"0".repeat(64)}`,
      };
      const payload: LocalTransactionAttachmentMutationPayload = {
        kind: "transaction-attachment-delete",
        attachment,
      };
      const mutation = dependencies.createMutation(
        input.budgetId, "transactions", `attachment:${input.attachmentId}`, "delete", payload,
      );
      const { registerDelta } = await local.deleteTransactionAttachment(
        input.attachmentId,
        mutation,
      );
      return committedCommandResult(undefined, [mutation], { budgetId: input.budgetId,
        domains: ["attachments", "transactions"], transactionIds: [input.transactionId] }, registerDelta);
    },

    async readTransactionAttachment(input) {
      const local = await dependencies.requireDatabase(input.budgetId);
      const stored = await local.readTransactionAttachmentContent(
        input.budgetId,
        input.attachmentId,
      );
      return stored
        ? new Blob([stored.content.buffer as ArrayBuffer], { type: stored.mimeType })
        : null;
    },
  };
}
