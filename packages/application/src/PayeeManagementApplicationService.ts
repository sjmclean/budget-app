import { randomUUID } from "crypto";
import { Payee } from "../../types/src/Payee.js";
import { PayeeRepository } from "../../repository/src/PayeeRepository.js";

export interface TransactionPayeeUpdater {
  countByPayee(payeeId: string): Promise<number>;
  replacePayee(fromPayeeId: string, toPayeeId: string): Promise<void>;
}

export interface PayeeCleanupSuggestion {
  normalizedName: string;
  payees: Payee[];
}

export class PayeeManagementApplicationService {
  constructor(
    private payees: PayeeRepository,
    private transactionUpdater?: TransactionPayeeUpdater
  ) {}

  normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
  }

  isTransferPayeeName(name: string): boolean {
    return /^transfer\s*:/i.test(name.trim()) || /^transfer\s+to\s+/i.test(name.trim()) || /^transfer\s+from\s+/i.test(name.trim());
  }

  async createPayee(budgetId: string, name: string): Promise<Payee> {
    const displayName = name.trim().replace(/\s+/g, " ");
    if (!displayName) throw new Error("Payee name is required");

    const normalizedName = this.normalizeName(displayName);
    const existing = await this.payees.findByNormalizedName(budgetId, normalizedName);
    if (existing) return existing;

    const payee: Payee = {
      id: randomUUID(),
      budgetId,
      name: displayName,
      normalizedName,
      isArchived: false,
      isTransfer: this.isTransferPayeeName(displayName),
      transferAccountId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.payees.create(payee);
    return payee;
  }

  async renamePayee(payeeId: string, newName: string): Promise<Payee> {
    const existing = await this.payees.findById(payeeId);
    if (!existing) throw new Error("Payee not found");
    const displayName = newName.trim().replace(/\s+/g, " ");
    if (!displayName) throw new Error("Payee name is required");

    const updated: Payee = {
      ...existing,
      name: displayName,
      normalizedName: this.normalizeName(displayName),
      isTransfer: existing.isTransfer || this.isTransferPayeeName(displayName),
      updatedAt: new Date()
    };
    await this.payees.update(updated);
    return updated;
  }

  async archivePayee(payeeId: string): Promise<void> {
    await this.payees.archive(payeeId);
  }

  async deleteUnusedPayee(payeeId: string): Promise<void> {
    if (this.transactionUpdater) {
      const usageCount = await this.transactionUpdater.countByPayee(payeeId);
      if (usageCount > 0) throw new Error("Cannot delete a payee that is used by transactions; archive or merge it instead");
    }
    await this.payees.delete(payeeId);
  }

  async mergePayees(sourcePayeeId: string, targetPayeeId: string): Promise<void> {
    if (sourcePayeeId === targetPayeeId) throw new Error("Cannot merge a payee into itself");
    const source = await this.payees.findById(sourcePayeeId);
    const target = await this.payees.findById(targetPayeeId);
    if (!source || !target) throw new Error("Source and target payees are required for merge");
    if (source.budgetId !== target.budgetId) throw new Error("Cannot merge payees from different budgets");

    if (this.transactionUpdater) await this.transactionUpdater.replacePayee(sourcePayeeId, targetPayeeId);
    await this.payees.archive(sourcePayeeId);
  }

  async findDuplicateSuggestions(budgetId: string): Promise<PayeeCleanupSuggestion[]> {
    const all = await this.payees.findActiveByBudget(budgetId);
    const groups = new Map<string, Payee[]>();
    for (const payee of all) {
      const normalizedName = payee.normalizedName || this.normalizeName(payee.name);
      groups.set(normalizedName, [...(groups.get(normalizedName) ?? []), payee]);
    }
    return [...groups.entries()]
      .filter(([, payees]) => payees.length > 1)
      .map(([normalizedName, payees]) => ({ normalizedName, payees }));
  }
}
