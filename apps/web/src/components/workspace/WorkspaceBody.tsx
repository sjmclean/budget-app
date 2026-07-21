import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type WorkspaceBodyProps<TElement extends ElementType = "div"> = {
  as?: TElement;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<TElement>, "as" | "children" | "className">;

export function WorkspaceBody<TElement extends ElementType = "div">({
  as,
  children,
  className,
  ...props
}: WorkspaceBodyProps<TElement>) {
  const Component = as ?? "div";
  const classes = ["workspace-body", className].filter(Boolean).join(" ");

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  );
}
