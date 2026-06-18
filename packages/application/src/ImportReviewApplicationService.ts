import { ImportRun } from "../../types/src/ImportRun.js";
import { ImportRunRepository } from "../../repository/src/ImportRunRepository.js";

export class ImportReviewApplicationService {
  constructor(private importRunRepo: ImportRunRepository) {}

  async completeImportRun(
    importRun: ImportRun,
    summary: Record<string, unknown>,
  ): Promise<ImportRun> {
    const updated = {
      ...importRun,
      completedAt: new Date(),
      status: "completed",
      summaryJson: JSON.stringify(summary),
    };
    if (this.importRunRepo.update) await this.importRunRepo.update(updated);
    return updated;
  }

  async failImportRun(
    importRun: ImportRun,
    reason: string,
  ): Promise<ImportRun> {
    const updated = {
      ...importRun,
      completedAt: new Date(),
      status: "failed",
      summaryJson: JSON.stringify({ reason }),
    };
    if (this.importRunRepo.update) await this.importRunRepo.update(updated);
    return updated;
  }

  getSummary(importRun: ImportRun): Record<string, unknown> {
    try {
      return JSON.parse(importRun.summaryJson || "{}");
    } catch {
      return {};
    }
  }
}
