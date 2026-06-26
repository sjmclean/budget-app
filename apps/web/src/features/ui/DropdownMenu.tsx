import { ReactNode, useEffect, useId, useRef, useState } from "react";

export function DropdownMenu({
  label,
  ariaLabel,
  buttonClassName = "button button-secondary",
  className = "dropdown-menu",
  panelClassName = "dropdown-menu-panel",
  children,
}: {
  label: ReactNode;
  ariaLabel?: string;
  buttonClassName?: string;
  className?: string;
  panelClassName?: string;
  children: ReactNode | ((controls: { closeMenu: (options?: { restoreFocus?: boolean }) => void }) => ReactNode);
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function closeMenu({ restoreFocus = false }: { restoreFocus?: boolean } = {}) {
    setIsOpen(false);

    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu({ restoreFocus: true });
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className={className} ref={rootRef}>
      <button
        ref={triggerRef}
        className={buttonClassName}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => setIsOpen((current) => !current)}
      >
        {label}
      </button>

      {isOpen ? (
        <div id={menuId} className={panelClassName} role="menu" aria-label={ariaLabel}>
          {typeof children === "function" ? children({ closeMenu }) : children}
        </div>
      ) : null}
    </div>
  );
}
