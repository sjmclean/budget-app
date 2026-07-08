import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";

export type SelectionActionVariant = "default" | "success" | "danger";

export interface SelectionAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  variant?: SelectionActionVariant;
  pressed?: boolean;
  title?: string;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}
