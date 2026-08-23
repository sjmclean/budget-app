import { useEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import {
  beginMoneyInputEdit,
  cancelMoneyInputEdit,
  changeMoneyInputDraft,
  commitMoneyInputEdit,
  createMoneyInputSession,
  synchroniseMoneyInputValue,
} from "./moneyInputLifecycle";

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "onBlur">;

export interface MoneyInputProps extends NativeProps {
  value: number;
  onCommit: (value: number) => void;
  onCancel?: () => void;
  formatValue?: (value: number) => string;
  validate?: (value: number) => boolean;
  onMoneyKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  emptyWhenZero?: boolean;
  errorClassName?: string;
}

export function MoneyInput({
  value,
  onCommit,
  onCancel,
  formatValue = (amount) => amount.toFixed(2),
  validate,
  onMoneyKeyDown,
  emptyWhenZero = false,
  errorClassName = "money-input-error",
  className,
  onFocus,
  onKeyDown,
  ...inputProps
}: MoneyInputProps) {
  const display = emptyWhenZero && value === 0 ? "" : formatValue(value);
  const formatDisplayValue = (amount: number) =>
    emptyWhenZero && amount === 0 ? "" : formatValue(amount);
  const [session, setSession] = useState(() => createMoneyInputSession(value, display));
  const suppressNextBlur = useRef(false);

  useEffect(() => {
    setSession((current) => synchroniseMoneyInputValue(current, value, display));
  }, [display, value]);

  function commit(invalidMode: "editing" | "invalid-pending"): boolean {
    const result = commitMoneyInputEdit(session, formatDisplayValue, validate, invalidMode);
    setSession(result.session);
    if (result.committedValue === undefined) {
      return false;
    }
    onCommit(result.committedValue);
    return true;
  }

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="decimal"
      value={session.draft}
      aria-invalid={session.hasError || undefined}
      className={[className, session.hasError ? errorClassName : ""].filter(Boolean).join(" ")}
      onFocus={(event) => {
        suppressNextBlur.current = false;
        setSession((current) => beginMoneyInputEdit(current, value, display));
        onFocus?.(event);
      }}
      onChange={(event) => {
        setSession((current) => changeMoneyInputDraft(current, event.target.value));
      }}
      onBlur={() => {
        if (suppressNextBlur.current) {
          suppressNextBlur.current = false;
          return;
        }
        commit("invalid-pending");
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (commit("editing")) {
            suppressNextBlur.current = true;
            event.currentTarget.blur();
          }
        } else if (event.key === "Escape") {
          event.preventDefault();
          suppressNextBlur.current = true;
          setSession(cancelMoneyInputEdit(value, display));
          event.currentTarget.blur();
          onCancel?.();
        }
        onMoneyKeyDown?.(event);
        onKeyDown?.(event);
      }}
    />
  );
}
