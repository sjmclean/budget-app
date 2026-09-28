export function TransferIcon({ size = "1em" }: { readonly size?: number | string }) {
  return (
    <svg
      aria-hidden="true"
      data-app-icon="transfer"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
    >
      <path d="M4 7.25h14.25m0 0-3.1-3.1m3.1 3.1-3.1 3.1" stroke="var(--transfer-icon-outbound, #3b82f6)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16.75H5.75m0 0 3.1 3.1m-3.1-3.1 3.1-3.1" stroke="var(--transfer-icon-inbound, #14b8a6)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3h4M17 21h4" stroke="var(--transfer-icon-accent, #94a3b8)" strokeWidth="1.25" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}
