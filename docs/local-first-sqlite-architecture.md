

## Register category-attention integrity

Category attention is participation-based, not sign-based. Every non-zero
ordinary transaction in an on-budget account requires a real category identity,
including inflows. Off-budget account legs never produce budget-category
warnings. A structurally linked transfer is category-exempt only when both
accounts participate in the budget; the on-budget leg of a boundary-crossing
transfer retains and requires its category. Split parents are unresolved when
any financially relevant category-requiring split line is unresolved.

Transfer identity is carried by account and reciprocal transaction IDs. Display
text such as `Transfer: Savings` is never used to infer transfer semantics.
The worker centralises the SQL predicate used by register filtering, account
navigation warnings, and Dashboard attention counts; domain classifier tests
mirror the same matrix.
