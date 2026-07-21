import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type WorkspaceLayoutProps<TElement extends ElementType = "div"> = {
  as?: TElement;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<TElement>, "as" | "children" | "className">;

export function WorkspaceLayout<TElement extends ElementType = "div">({
  as,
  children,
  className,
  ...props
}: WorkspaceLayoutProps<TElement>) {
  const Component = as ?? "div";
  const classes = ["workspace-layout", className].filter(Boolean).join(" ");

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}
