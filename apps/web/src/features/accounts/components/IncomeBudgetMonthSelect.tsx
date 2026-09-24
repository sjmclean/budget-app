export function IncomeBudgetMonthSelect(_props: {
  transactionDate: string;
  latestAllowedMonth: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  // Income is budgeted from the Budget workspace. Keep this component as a
  // compatibility boundary while imported Income-for-Month metadata remains
  // supported internally.
  return null;
}
