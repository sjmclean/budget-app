import type { HTMLAttributes, ReactNode } from "react";

interface WorkspaceStickyHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function WorkspaceStickyHeader({
  children,
  className,
  ...props
}: WorkspaceStickyHeaderProps) {
  const classes = ["workspace-sticky-header", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
