import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  bootstrapStoredTheme,
  synchronizeTheme,
  type ThemeMode,
} from "../../../apps/web/src/app/theme";

const globals = readFileSync("apps/web/src/styles/globals.css", "utf8");
const main = readFileSync("apps/web/src/main.tsx", "utf8");
const canonicalizedStyles = [
  "apps/web/src/styles/globals.css",
  "apps/web/src/styles/register.css",
  "apps/web/src/styles/budgetCoverOverspending.css",
].map((path) => readFileSync(path, "utf8")).join("\n");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return globals.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

function createEnvironment(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const classes = new Set<string>();
  const root = {
    dataset: {} as DOMStringMap,
    classList: {
      toggle(name: string, force?: boolean) {
        if (force) classes.add(name);
        else classes.delete(name);
        return force ?? false;
      },
    } as DOMTokenList,
  };
  const media = {
    matches: prefersDark,
    addEventListener(type: string, listener: () => void) {
      if (type === "change") listeners.add(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      if (type === "change") listeners.delete(listener);
    },
  } as unknown as MediaQueryList;

  return {
    root,
    classes,
    listeners,
    media,
    matchMedia: () => media,
    setPrefersDark(value: boolean) {
      Object.defineProperty(media, "matches", { value, configurable: true });
      listeners.forEach((listener) => listener());
    },
  };
}

test("every concrete theme declares accent contrast and browser color scheme", () => {
  for (const selector of [":root", ':root[data-theme="dark"]', ':root[data-theme="blueprint"]']) {
    assert.match(rule(selector), /--accent-contrast\s*:/);
  }
  assert.match(rule(":root"), /color-scheme\s*:\s*light/);
  assert.match(rule(':root[data-theme="dark"]'), /color-scheme\s*:\s*dark/);
  assert.match(rule(':root[data-theme="blueprint"]'), /color-scheme\s*:\s*light/);
});

test("primary buttons and sync states consume semantic theme tokens", () => {
  const primary = rule(".button-primary");
  assert.match(primary, /color\s*:\s*var\(--accent-contrast\)/);
  assert.doesNotMatch(primary, /color\s*:\s*(?:white|#fff(?:fff)?)/i);

  const syncRules = ["success", "warning", "error"]
    .map((state) => rule(`.global-sync-indicator-${state}`))
    .join("\n");
  assert.match(syncRules, /var\(--positive\)/);
  assert.match(syncRules, /var\(--warning(?:-text)?\)/);
  assert.match(syncRules, /var\(--negative\)/);
  assert.doesNotMatch(syncRules, /#(?:15803d|dcfce7|a16207|b91c1c)/i);
});

test("undefined visual aliases are replaced with canonical tokens", () => {
  assert.doesNotMatch(
    canonicalizedStyles,
    /var\(--(?:surface-raised|border-strong|shadow-lg|border-subtle|danger)(?:[,\)])/,
  );
});

test("system theme follows OS changes and removes its listener", () => {
  const environment = createEnvironment(false);
  const cleanup = synchronizeTheme("system", environment);

  assert.equal(environment.root.dataset.theme, "light");
  assert.equal(environment.listeners.size, 1);
  environment.setPrefersDark(true);
  assert.equal(environment.root.dataset.theme, "dark");
  assert.equal(environment.classes.has("dark"), true);

  cleanup();
  assert.equal(environment.listeners.size, 0);
  environment.setPrefersDark(false);
  assert.equal(environment.root.dataset.theme, "dark");
});

test("explicit themes never subscribe to or follow OS changes", () => {
  for (const theme of ["light", "dark", "blueprint"] satisfies ThemeMode[]) {
    const environment = createEnvironment(theme !== "dark");
    synchronizeTheme(theme, environment);
    assert.equal(environment.root.dataset.theme, theme);
    assert.equal(environment.listeners.size, 0);
    environment.setPrefersDark(theme === "light");
    assert.equal(environment.root.dataset.theme, theme);
  }
});

test("pre-render bootstrap resolves stored themes and invalid values", () => {
  const cases: Array<[string | null, boolean, string]> = [
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["blueprint", true, "blueprint"],
    ["system", true, "dark"],
    ["system", false, "light"],
    ["invalid", true, "dark"],
    [null, false, "light"],
  ];

  for (const [stored, prefersDark, expected] of cases) {
    const environment = createEnvironment(prefersDark);
    bootstrapStoredTheme({
      ...environment,
      storage: { getItem: () => stored },
    });
    assert.equal(environment.root.dataset.theme, expected);
    assert.equal(environment.classes.has("dark"), expected === "dark");
  }

  assert.match(main, /bootstrapStoredThemeFromWindow\(\)[\s\S]*void bootstrapApp\(\)/);
});
