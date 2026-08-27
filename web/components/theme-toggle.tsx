"use client";

import { useTheme } from "./theme-provider";
import { Icon } from "./ui/icons";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  return (
    <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={label} title={label}>
      <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
    </button>
  );
}
