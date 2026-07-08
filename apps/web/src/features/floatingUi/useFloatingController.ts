import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  resolveFloatingPositionFromMouseEvent,
  type FloatingPosition,
  type FloatingSize,
} from "./floatingPositioning";

export interface FloatingControllerOptions {
  floatingSize: FloatingSize;
  viewportPadding?: number;
  offset?: number;
  closeOnScroll?: boolean;
  restoreFocusOnClose?: boolean;
}

export interface OpenFloatingControllerOptions {
  event: Pick<MouseEvent, "clientX" | "clientY" | "preventDefault" | "stopPropagation">;
}

export interface FloatingControllerState<TPayload> {
  id: string;
  isOpen: boolean;
  payload: TPayload | null;
  position: FloatingPosition | null;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
  floatingRef: React.MutableRefObject<HTMLElement | null>;
  open: (payload: TPayload, options: OpenFloatingControllerOptions) => void;
  close: () => void;
  layerProps: {
    role: "presentation";
    onMouseDown: () => void;
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  };
  floatingProps: {
    role: "menu";
    style: React.CSSProperties;
    ref: React.MutableRefObject<HTMLElement | null>;
    onMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
  } | null;
}

function getViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function useFloatingController<TPayload = void>({
  floatingSize,
  viewportPadding = 12,
  offset = 6,
  closeOnScroll = true,
  restoreFocusOnClose = true,
}: FloatingControllerOptions): FloatingControllerState<TPayload> {
  const id = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const floatingRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [payload, setPayload] = useState<TPayload | null>(null);
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  const close = useCallback(() => {
    setPayload(null);
    setPosition(null);

    if (restoreFocusOnClose) {
      restoreFocusRef.current?.focus();
    }

    restoreFocusRef.current = null;
  }, [restoreFocusOnClose]);

  const open = useCallback(
    (nextPayload: TPayload, { event }: OpenFloatingControllerOptions) => {
      event.preventDefault();
      event.stopPropagation();

      restoreFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : triggerRef.current;
      setPayload(nextPayload);
      setPosition(
        resolveFloatingPositionFromMouseEvent(event, {
          floatingSize,
          viewport: getViewport(),
          padding: viewportPadding,
          offset,
        }),
      );
    },
    [floatingSize, offset, viewportPadding],
  );

  useEffect(() => {
    if (!position) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, position]);

  useEffect(() => {
    if (!closeOnScroll || !position) {
      return;
    }

    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("scroll", close, true);
    };
  }, [close, closeOnScroll, position]);

  return {
    id,
    isOpen: Boolean(position),
    payload,
    position,
    triggerRef,
    floatingRef,
    open,
    close,
    layerProps: {
      role: "presentation",
      onMouseDown: close,
      onContextMenu: (event) => {
        event.preventDefault();
        close();
      },
    },
    floatingProps: position
      ? {
          role: "menu",
          style: {
            top: position.top,
            left: position.left,
          },
          ref: floatingRef,
          onMouseDown: (event) => event.stopPropagation(),
        }
      : null,
  };
}
