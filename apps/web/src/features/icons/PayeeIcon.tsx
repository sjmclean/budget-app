import { useEffect, useMemo, useState } from "react";
import {
  Bus, Clapperboard, Fuel, GraduationCap, HeartPulse, House, ShoppingBag,
  ShoppingBasket, Store, Utensils, UtilityPole, ArrowRightLeft, UserRound,
  type LucideIcon,
} from "lucide-react";
import type { PayeeView } from "../accounts/payeeService.js";
import {
  automaticPayeeIconFallback,
  resolvePayeeIcon,
  type ResolvedPayeeIcon,
} from "./payeeIconResolver.js";
import type { PayeeBuiltinIconKey } from "./payeeIconReference.js";
import { readMerchantIconContentBlob } from "./merchantIconContentStore.js";

const builtinComponents: Record<PayeeBuiltinIconKey, LucideIcon> = {
  merchant: Store, shopping: ShoppingBag, groceries: ShoppingBasket, dining: Utensils,
  fuel: Fuel, transport: Bus, utilities: UtilityPole, entertainment: Clapperboard,
  medical: HeartPulse, education: GraduationCap, home: House,
};

export function PayeeIcon({
  payee, state = "payee", size = 32, decorative = false,
}: {
  readonly payee?: Pick<PayeeView, "id" | "name" | "iconRef"> | null;
  readonly state?: "payee" | "transfer" | "none";
  readonly size?: number;
  readonly decorative?: boolean;
}) {
  const resolved = resolvePayeeIcon({ payee, state });
  if (resolved.kind === "content") {
    return (
      <ContentPayeeIcon
        contentHash={resolved.contentHash}
        payee={payee}
        state={state}
        size={size}
        decorative={decorative}
      />
    );
  }
  return renderResolvedIcon({ resolved, payee, state, size, decorative });
}

function ContentPayeeIcon({
  contentHash,
  payee,
  state,
  size,
  decorative,
}: {
  readonly contentHash: string;
  readonly payee?: Pick<PayeeView, "id" | "name" | "iconRef"> | null;
  readonly state: "payee" | "transfer" | "none";
  readonly size: number;
  readonly decorative: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const fallback = useMemo<Exclude<ResolvedPayeeIcon, { readonly kind: "content" }>>(
    () => {
      if (state === "transfer") return { kind: "transfer" };
      if (state === "none" || !payee) return { kind: "none" };
      return automaticPayeeIconFallback(payee);
    },
    [payee, state],
  );

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    setSrc(null);
    void readMerchantIconContentBlob(contentHash).then((blob) => {
      if (disposed || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      if (!disposed) setSrc(objectUrl);
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [contentHash]);

  if (!src) {
    return renderResolvedIcon({ resolved: fallback, payee, state, size, decorative });
  }

  const label = payee?.name ? `${payee.name} icon` : "Payee icon";
  const accessibility = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": label };
  return (
    <span
      className="payee-icon"
      style={{ width: size, height: size }}
      data-icon-kind="content"
      {...accessibility}
    >
      <img
        src={src}
        alt=""
        aria-hidden="true"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
      />
    </span>
  );
}

function renderResolvedIcon({
  resolved,
  payee,
  state,
  size,
  decorative,
}: {
  readonly resolved: Exclude<ResolvedPayeeIcon, { readonly kind: "content" }>;
  readonly payee?: Pick<PayeeView, "id" | "name" | "iconRef"> | null;
  readonly state: "payee" | "transfer" | "none";
  readonly size: number;
  readonly decorative: boolean;
}) {
  const label = state === "transfer" ? "Transfer" : payee?.name ? `${payee.name} icon` : "No payee";
  const common = { className: "payee-icon", style: { width: size, height: size }, "data-icon-kind": resolved.kind };
  const accessibility = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": label };
  if (resolved.kind === "builtin") {
    const Icon = builtinComponents[resolved.key];
    return <span {...common} {...accessibility}><Icon aria-hidden="true" /></span>;
  }
  if (resolved.kind === "transfer") return <span {...common} {...accessibility}><ArrowRightLeft aria-hidden="true" /></span>;
  if (resolved.kind === "none") return <span {...common} {...accessibility}><UserRound aria-hidden="true" /></span>;
  return <span {...common} {...accessibility} data-avatar-token={resolved.token}>{resolved.initials}</span>;
}
