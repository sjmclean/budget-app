import {
  Bus, Clapperboard, Fuel, GraduationCap, HeartPulse, House, ShoppingBag,
  ShoppingBasket, Store, Utensils, UtilityPole, ArrowRightLeft, UserRound,
  type LucideIcon,
} from "lucide-react";
import type { PayeeView } from "../accounts/payeeService.js";
import { resolvePayeeIcon } from "./payeeIconResolver.js";
import type { PayeeBuiltinIconKey } from "./payeeIconReference.js";
import { readMerchantIconContentDataUrl } from "./merchantIconContentStore.js";

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
  const label = state === "transfer" ? "Transfer" : payee?.name ? `${payee.name} icon` : "No payee";
  const common = { className: "payee-icon", style: { width: size, height: size }, "data-icon-kind": resolved.kind };
  const accessibility = decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": label };
  if (resolved.kind === "builtin") {
    const Icon = builtinComponents[resolved.key];
    return <span {...common} {...accessibility}><Icon aria-hidden="true" /></span>;
  }
  if (resolved.kind === "content") {
    const src = readMerchantIconContentDataUrl(resolved.contentHash);
    if (src) {
      return (
        <span {...common} {...accessibility}>
          <img src={src} alt="" aria-hidden="true" className="payee-icon-image" />
        </span>
      );
    }
  }
  if (resolved.kind === "transfer") return <span {...common} {...accessibility}><ArrowRightLeft aria-hidden="true" /></span>;
  if (resolved.kind === "none") return <span {...common} {...accessibility}><UserRound aria-hidden="true" /></span>;
  const fallback = resolved.kind === "initials"
    ? resolved
    : resolvePayeeIcon({ payee: payee ? { ...payee, iconRef: "" } : payee, state });
  if (fallback.kind !== "initials") return <span {...common} {...accessibility}><UserRound aria-hidden="true" /></span>;
  return <span {...common} {...accessibility} data-avatar-token={fallback.token}>{fallback.initials}</span>;
}
