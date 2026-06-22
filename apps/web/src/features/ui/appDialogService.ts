export interface ConfirmDialogInput {
  title?: string;
  message: string;
}

export interface AlertDialogInput {
  title?: string;
  message: string;
}

function formatDialogMessage(input: ConfirmDialogInput | AlertDialogInput): string {
  return input.title ? `${input.title}\n\n${input.message}` : input.message;
}

export function confirmDialog(input: ConfirmDialogInput): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.confirm(formatDialogMessage(input));
}

export function alertDialog(input: AlertDialogInput): void {
  if (typeof window === "undefined") {
    return;
  }

  window.alert(formatDialogMessage(input));
}
