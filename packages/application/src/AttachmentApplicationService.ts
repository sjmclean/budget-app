import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { TransactionAttachment } from "../../types/src/TransactionAttachment.js";
import { AttachmentIntegrityResult } from "../../types/src/AttachmentIntegrityStatus.js";
import { createTransactionAttachment } from "../../budget-engine/src/services/createTransactionAttachment.js";
import { checkAttachmentIntegrity } from "../../budget-engine/src/services/checkAttachmentIntegrity.js";
import { canEditBudget, canViewBudget } from "../../budget-engine/src/services/permissions.js";
import { BudgetUserRepository } from "../../repository/src/BudgetUserRepository.js";
import { TransactionAttachmentRepository } from "../../repository/src/TransactionAttachmentRepository.js";

export class AttachmentApplicationService {
  constructor(
    private attachmentRepo: TransactionAttachmentRepository,
    private budgetUserRepo: BudgetUserRepository
  ) {}

  private async requireCanView(userId: string, budgetId: string): Promise<void> {
    const role = await this.budgetUserRepo.getRole(userId, budgetId);
    if (!canViewBudget(role)) throw new Error("Permission denied");
  }

  private async requireCanEdit(userId: string, budgetId: string): Promise<void> {
    const role = await this.budgetUserRepo.getRole(userId, budgetId);
    if (!canEditBudget(role)) throw new Error("Permission denied");
  }

  async attachFile(input: {
    userId: string;
    budgetId: string;
    transactionId: string;
    budgetFolder: string;
    attachmentsFolderName: string;
    originalFileName: string;
    mimeType: string;
    content: Buffer | string;
  }): Promise<TransactionAttachment> {
    await this.requireCanEdit(input.userId, input.budgetId);

    const size =
      typeof input.content === "string"
        ? Buffer.byteLength(input.content)
        : input.content.byteLength;

    const attachment = createTransactionAttachment({
      budgetId: input.budgetId,
      transactionId: input.transactionId,
      originalFileName: input.originalFileName,
      mimeType: input.mimeType,
      fileSize: size,
      relativePath: input.attachmentsFolderName,
      content: input.content
    });

    const absolutePath = join(input.budgetFolder, attachment.relativePath);
    const absoluteDir = dirname(absolutePath);

    if (!existsSync(absoluteDir)) {
      mkdirSync(absoluteDir, { recursive: true });
    }

    writeFileSync(absolutePath, input.content);

    await this.attachmentRepo.create(attachment);

    return attachment;
  }

  async listForTransaction(
    userId: string,
    budgetId: string,
    transactionId: string
  ): Promise<TransactionAttachment[]> {
    await this.requireCanView(userId, budgetId);
    return await this.attachmentRepo.findByTransaction(transactionId);
  }

  async verifyBudgetAttachments(
    userId: string,
    budgetId: string,
    budgetFolder: string
  ): Promise<AttachmentIntegrityResult[]> {
    await this.requireCanView(userId, budgetId);

    const attachments = await this.attachmentRepo.findByBudget(budgetId);

    return attachments.map((attachment) =>
      checkAttachmentIntegrity(budgetFolder, attachment)
    );
  }

  async deleteAttachment(
    userId: string,
    budgetId: string,
    budgetFolder: string,
    attachment: TransactionAttachment
  ): Promise<void> {
    await this.requireCanEdit(userId, budgetId);

    const absolutePath = join(budgetFolder, attachment.relativePath);

    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath);
    }

    await this.attachmentRepo.delete(attachment.id);
  }
}
