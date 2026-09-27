export function IncomeIcon({ size = "1em" }: { readonly size?: number | string }) {
  return (
    <svg
      aria-hidden="true"
      data-app-icon="income"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
    >
      <circle cx="12" cy="12" r="7.5" stroke="var(--income-icon-ring, #14b8a6)" strokeWidth="2" />
      <path d="M12 7.75v8.5m2.25-6.6c-.55-.7-1.35-1.05-2.4-1.05-1.4 0-2.35.72-2.35 1.75 0 2.65 5 1.15 5 3.85 0 1.05-.98 1.8-2.5 1.8-1.12 0-2.03-.38-2.65-1.15" stroke="var(--income-icon-money, #0f766e)" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.75 5.25h5.5v5.5m0-5.5L4.9 8.6" stroke="var(--income-icon-arrow, #22c55e)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
