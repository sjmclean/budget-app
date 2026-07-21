import type { ReactNode } from "react";

interface WorkspaceHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  // TODO(UX): Introduce structured breadcrumb items when workspace information architecture is defined.
  breadcrumbs?: ReactNode;
  leadingActions?: ReactNode;
  primaryActions?: ReactNode;
  secondaryActions?: ReactNode;
  search?: ReactNode;
  className?: string;
  headingClassName?: string;
  titleAs?: "h1" | "h2";
}

export function WorkspaceHeader({
  title,
  subtitle,
  breadcrumbs,
  leadingActions,
  primaryActions,
  secondaryActions,
  search,
  className,
  headingClassName,
  titleAs: Title = "h1",
}: WorkspaceHeaderProps) {
  const classes = ["workspace-header", className].filter(Boolean).join(" ");
  const headingClasses = ["workspace-header-heading", headingClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes}>
      {breadcrumbs ? (
        <nav className="workspace-header-breadcrumbs" aria-label="Breadcrumb">
          {breadcrumbs}
        </nav>
      ) : null}

      <div className="workspace-header-content">
        <div className={`workspace-header-main ${headingClasses}`}>
          {leadingActions ? (
            <div className="workspace-header-leading-actions">{leadingActions}</div>
          ) : null}
          <div className="workspace-header-heading">
            <Title>{title}</Title>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
        </div>

        <div className="workspace-header-controls">
          {search ? <div className="workspace-header-search">{search}</div> : null}
          {primaryActions ? (
            <div className="workspace-header-primary-actions">{primaryActions}</div>
          ) : null}
          {secondaryActions ? (
            <div className="workspace-header-secondary-actions">
              {secondaryActions}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
