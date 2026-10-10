let accountRegisterPagePromise:
  | Promise<typeof import("./AccountRegisterPage")>
  | null = null;

export function loadAccountRegisterPage() {
  accountRegisterPagePromise ??= import("./AccountRegisterPage");
  return accountRegisterPagePromise;
}

export function preloadAccountRegisterPage(): void {
  void loadAccountRegisterPage();
}
