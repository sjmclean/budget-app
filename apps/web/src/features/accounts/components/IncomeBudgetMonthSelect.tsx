import { incomeBudgetMonthOptions } from "../incomeBudgetMonth";

export function IncomeBudgetMonthSelect({
  transactionDate,
  latestAllowedMonth,
  value,
  onChange,
  className,
}: {
  transactionDate: string;
  latestAllowedMonth: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const options = incomeBudgetMonthOptions(transactionDate, latestAllowedMonth);
  if (options.length === 0) return null;

  const transactionMonth = transactionDate.slice(0, 7);
  const resolvedValue = options.some((option) => option.value === value)
    ? value
    : transactionMonth;

  return (
    <label
      className={[
        "register-income-budget-month",
        className ?? "",
      ].filter(Boolean).join(" ")}
    >
      <span>Budget in</span>
      <select
        className="select"
        value={resolvedValue}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Budget in month"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
