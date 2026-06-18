import { Account } from "../../types/src/Account.js";
import { Category } from "../../types/src/Category.js";
import { Payee } from "../../types/src/Payee.js";
import { Transaction } from "../../types/src/Transaction.js";
import { TransactionAttachment } from "../../types/src/TransactionAttachment.js";
import { AccountRepository } from "../../repository/src/AccountRepository.js";
import { CategoryGroupRepository } from "../../repository/src/CategoryGroupRepository.js";
import { CategoryRepository } from "../../repository/src/CategoryRepository.js";
import { PayeeRepository } from "../../repository/src/PayeeRepository.js";
import { TransactionRepository } from "../../repository/src/TransactionRepository.js";
import { TransactionAttachmentRepository } from "../../repository/src/TransactionAttachmentRepository.js";

export interface SearchResults {
  accounts: Account[];
  categories: Category[];
  payees: Payee[];
  transactions: Transaction[];
  attachments: TransactionAttachment[];
}

function includes(value: string | null | undefined, query: string): boolean {
  return (value ?? "").toLowerCase().includes(query);
}

export class SearchApplicationService {
  constructor(
    private accountRepo: AccountRepository,
    private categoryGroupRepo: CategoryGroupRepository,
    private categoryRepo: CategoryRepository,
    private payeeRepo: PayeeRepository,
    private transactionRepo: TransactionRepository,
    private attachmentRepo: TransactionAttachmentRepository,
  ) {}

  async searchBudget(
    budgetId: string,
    rawQuery: string,
  ): Promise<SearchResults> {
    const query = rawQuery.trim().toLowerCase();
    if (!query)
      return {
        accounts: [],
        categories: [],
        payees: [],
        transactions: [],
        attachments: [],
      };

    const [accounts, groups, payees, transactions, attachments] =
      await Promise.all([
        this.accountRepo.findByBudget(budgetId),
        this.categoryGroupRepo.findByBudget(budgetId),
        this.payeeRepo.findByBudget(budgetId),
        this.transactionRepo.findByBudget(budgetId),
        this.attachmentRepo.findByBudget(budgetId),
      ]);

    const categoryLists = await Promise.all(
      groups.map((group) => this.categoryRepo.findByGroup(group.id)),
    );
    const categories = categoryLists.flat();

    return {
      accounts: accounts.filter(
        (item) => includes(item.name, query) || includes(item.type, query),
      ),
      categories: categories.filter((item) => includes(item.name, query)),
      payees: payees.filter((item) => includes(item.name, query)),
      transactions: transactions.filter(
        (item) =>
          includes(item.memo, query) ||
          includes(item.date, query) ||
          String(item.amount).includes(query),
      ),
      attachments: attachments.filter(
        (item) =>
          includes(item.originalFileName, query) ||
          includes(item.storedFileName, query) ||
          includes(item.mimeType, query),
      ),
    };
  }
}
