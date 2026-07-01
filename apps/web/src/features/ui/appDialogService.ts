export type AppDialogTone = "default" | "danger";

export interface ConfirmDialogInput {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AppDialogTone;
}

export interface AlertDialogInput {
  title?: string;
  message: string;
  confirmLabel?: string;
  tone?: AppDialogTone;
}

export type AppDialogRequest =
  | ({ kind: "confirm"; id: string } & Required<Pick<ConfirmDialogInput, "message">> &
      Omit<ConfirmDialogInput, "message">)
  | ({ kind: "alert"; id: string } & Required<Pick<AlertDialogInput, "message">> &
      Omit<AlertDialogInput, "message">);

export interface AppDialogHost {
  confirm(input: ConfirmDialogInput): Promise<boolean>;
  alert(input: AlertDialogInput): Promise<void>;
}

let appDialogHost: AppDialogHost | null = null;

export function installAppDialogHost(host: AppDialogHost): () => void {
  appDialogHost = host;

  return () => {
    if (appDialogHost === host) {
      appDialogHost = null;
    }
  };
}

export function hasAppDialogHost(): boolean {
  return appDialogHost !== null;
}

export async function confirmDialog(input: ConfirmDialogInput): Promise<boolean> {
  if (!appDialogHost) {
    return false;
  }

  return appDialogHost.confirm(input);
}

export async function alertDialog(input: AlertDialogInput): Promise<void> {
  if (!appDialogHost) {
    return;
  }

  await appDialogHost.alert(input);
}
