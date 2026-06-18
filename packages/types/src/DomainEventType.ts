export enum DomainEventType {
  BudgetCreated = "BudgetCreated",
  AccountCreated = "AccountCreated",
  CategoryCreated = "CategoryCreated",
  CategoryGroupCreated = "CategoryGroupCreated",
  PayeeCreated = "PayeeCreated",
  TransactionCreated = "TransactionCreated",
  SplitTransactionCreated = "SplitTransactionCreated",
  TransferCreated = "TransferCreated",
  MoneyAssigned = "MoneyAssigned",
  IncomePosted = "IncomePosted",
  SpendingPosted = "SpendingPosted",
  OverspendingCovered = "OverspendingCovered",
  OverspendingLeft = "OverspendingLeft",
  MonthRolledOver = "MonthRolledOver",
  ReconciliationCompleted = "ReconciliationCompleted"
}
