import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export function useRegisterAutocompletePopupStyle(isOpen: boolean) {
  const anchorRef = useRef<HTMLInputElement | null>(null);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});

  const updatePopupStyle = useCallback(() => {
    const anchor = anchorRef.current;

    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();

    setPopupStyle({
      left: rect.left,
      minWidth: Math.max(rect.width, 384),
      position: "fixed",
      top: rect.bottom + 4,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePopupStyle();

    window.addEventListener("resize", updatePopupStyle);
    window.addEventListener("scroll", updatePopupStyle, true);

    return () => {
      window.removeEventListener("resize", updatePopupStyle);
      window.removeEventListener("scroll", updatePopupStyle, true);
    };
  }, [isOpen, updatePopupStyle]);

  return { anchorRef, popupStyle };
}
