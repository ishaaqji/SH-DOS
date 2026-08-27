export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "shdos-theme";

export function isValidTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (isValidTheme(stored)) return stored;
  return prefersDark ? "dark" : "light";
}

export function toggleTheme(current: Theme): Theme {
  return current === "light" ? "dark" : "light";
}

export function themeLabel(theme: Theme): string {
  return theme === "light" ? "Light" : "Dark";
}
