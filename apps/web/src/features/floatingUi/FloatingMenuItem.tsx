import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";

export type FloatingMenuItemVariant = "default" | "success" | "danger";

export interface FloatingMenuItemProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  icon?: ComponentType<{ size?: number; "aria-hidden"?: string | boolean }>;
  variant?: FloatingMenuItemVariant;
  pressed?: boolean;
}

export function FloatingMenuItem({
  children,
  icon: Icon,
  variant = "default",
  pressed,
  className,
  type = "button",
  ...buttonProps
}: FloatingMenuItemProps) {
  return (
    <button
      {...buttonProps}
      className={[
        "floating-menu-item",
        variant !== "default" ? `floating-menu-item-${variant}` : "",
        pressed ? "floating-menu-item-pressed" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      type={type}
      role="menuitem"
      aria-pressed={pressed ?? buttonProps["aria-pressed"]}
    >
      {Icon ? <Icon size={15} aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

export interface FloatingMenuDividerProps {
  className?: string;
}

export function FloatingMenuDivider({ className }: FloatingMenuDividerProps) {
  return (
    <div
      className={["floating-menu-divider", className ?? ""].filter(Boolean).join(" ")}
      role="separator"
    />
  );
}
