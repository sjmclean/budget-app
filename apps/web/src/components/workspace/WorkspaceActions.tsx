import type { HTMLAttributes, ReactNode } from "react";

interface WorkspaceActionsProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tabletOverflow?: "wrap" | "scroll";
}

export function WorkspaceActions({
  children,
  className,
  tabletOverflow = "wrap",
  ...props
}: WorkspaceActionsProps) {
  const classes = [
    "workspace-actions",
    tabletOverflow === "scroll" ? "workspace-actions-tablet-scroll" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
