import { evaluateMoneyExpression } from "./moneyExpression";

export type MoneyInputMode = "idle" | "editing" | "invalid-pending";

export interface MoneyInputSession {
  mode: MoneyInputMode;
  baseValue: number;
  draft: string;
  hasError: boolean;
}

export function createMoneyInputSession(value: number, display: string): MoneyInputSession {
  return { mode: "idle", baseValue: value, draft: display, hasError: false };
}

export function beginMoneyInputEdit(
  session: MoneyInputSession,
  value: number,
  display: string,
): MoneyInputSession {
  if (session.mode === "invalid-pending") {
    return { ...session, mode: "editing", baseValue: value };
  }
  return { mode: "editing", baseValue: value, draft: display, hasError: false };
}

export function changeMoneyInputDraft(
  session: MoneyInputSession,
  draft: string,
): MoneyInputSession {
  return { ...session, mode: "editing", draft, hasError: false };
}

export function commitMoneyInputEdit(
  session: MoneyInputSession,
  formatValue: (value: number) => string,
  validate?: (value: number) => boolean,
  invalidMode: Extract<MoneyInputMode, "editing" | "invalid-pending"> = "editing",
): { session: MoneyInputSession; committedValue?: number } {
  const result = evaluateMoneyExpression(session.draft, session.baseValue);
  if (!result.ok || (validate && !validate(result.value))) {
    return {
      session: { ...session, mode: invalidMode, hasError: true },
    };
  }
  return {
    session: {
      mode: "idle",
      baseValue: result.value,
      draft: formatValue(result.value),
      hasError: false,
    },
    committedValue: result.value,
  };
}

export function cancelMoneyInputEdit(value: number, display: string): MoneyInputSession {
  return createMoneyInputSession(value, display);
}

export function synchroniseMoneyInputValue(
  session: MoneyInputSession,
  value: number,
  display: string,
): MoneyInputSession {
  if (session.mode === "editing") return session;
  if (session.mode === "invalid-pending") {
    return session.baseValue === value ? session : { ...session, baseValue: value };
  }
  if (session.baseValue === value && session.draft === display && !session.hasError) return session;
  return createMoneyInputSession(value, display);
}
