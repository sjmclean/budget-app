import type {
  AutoCategorizationSuggestion,
  ImportedBankTransaction,
  PayeeRule,
} from "../../types/src/index.js";
import { PayeeRuleApplicationService } from "./PayeeRuleApplicationService.js";

/**
 * High-level auto-categorisation façade for bank-import workflows.
 *
 * The UI can call this after parsing a CSV/QIF/OFX/QFX file. It returns suggested
 * payees/categories but does not commit them; the user should still be able to
 * review and override suggestions before transactions are written to SQLite.
 */
export class AutoCategorizationApplicationService {
  private readonly rules = new PayeeRuleApplicationService();

  suggest(
    importedRows: ImportedBankTransaction[],
    rules: PayeeRule[],
  ): AutoCategorizationSuggestion[] {
    return this.rules.applyRules(importedRows, rules);
  }
}
