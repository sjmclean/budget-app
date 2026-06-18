import { ScheduledTransaction } from "../../types/src/ScheduledTransaction.js";
import { ScheduledTransactionRepository } from "../../repository/src/ScheduledTransactionRepository.js";
import { advanceScheduledTransactionDate } from "../../budget-engine/src/services/advanceScheduledTransactionDate.js";

export class ScheduledTransactionManagementApplicationService {
  constructor(private scheduledRepo: ScheduledTransactionRepository) {}

  async edit(scheduled: ScheduledTransaction): Promise<ScheduledTransaction> {
    if (!this.scheduledRepo.update) throw new Error("Scheduled transaction repository does not support update");
    const updated = { ...scheduled, updatedAt: new Date() };
    await this.scheduledRepo.update(updated);
    return updated;
  }

  async pause(scheduled: ScheduledTransaction): Promise<ScheduledTransaction> {
    return this.edit({ ...scheduled, isActive: false });
  }

  async resume(scheduled: ScheduledTransaction): Promise<ScheduledTransaction> {
    return this.edit({ ...scheduled, isActive: true });
  }

  async skipNextOccurrence(scheduled: ScheduledTransaction): Promise<ScheduledTransaction> {
    const nextDueDate = advanceScheduledTransactionDate(scheduled.nextDueDate, scheduled.frequency);
    if (!nextDueDate) return this.pause(scheduled);
    return this.edit({ ...scheduled, nextDueDate });
  }

  previewNextDueDate(scheduled: ScheduledTransaction): string | null {
    return advanceScheduledTransactionDate(scheduled.nextDueDate, scheduled.frequency);
  }
}
