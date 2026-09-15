export const THEME_STORAGE_KEY = "budget-app-theme";

export type ThemeMode = "light" | "dark" | "blueprint" | "system";
export type ConcreteTheme = Exclude<ThemeMode, "system">;

interface ThemeEnvironment {
  root: Pick<HTMLElement, "dataset" | "classList">;
  matchMedia: (query: string) => MediaQueryList;
}

export function parseTheme(value: string | null): ThemeMode {
  return value === "light" || value === "dark" || value === "blueprint" || value === "system"
    ? value
    : "system";
}

export function resolveTheme(theme: ThemeMode, prefersDark: boolean): ConcreteTheme {
  return theme === "system" ? (prefersDark ? "dark" : "light") : theme;
}

export function applyTheme(root: ThemeEnvironment["root"], theme: ConcreteTheme): void {
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
}

export function synchronizeTheme(theme: ThemeMode, environment: ThemeEnvironment): () => void {
  const media = environment.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => applyTheme(environment.root, resolveTheme(theme, media.matches));

  apply();
  if (theme !== "system") return () => undefined;

  media.addEventListener("change", apply);
  return () => media.removeEventListener("change", apply);
}

export function bootstrapStoredTheme(
  environment: ThemeEnvironment & { storage: Pick<Storage, "getItem"> },
): void {
  let storedTheme: ThemeMode = "system";
  try {
    storedTheme = parseTheme(environment.storage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Restricted storage behaves like an unset preference.
  }
  const prefersDark = environment.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(environment.root, resolveTheme(storedTheme, prefersDark));
}
