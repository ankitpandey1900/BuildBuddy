import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: Theme;
  effectiveTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("buildbuddy-theme") as Theme | null;
      if (saved === "light" || saved === "dark" || saved === "system") return saved;
    }
    return "dark";
  });

  const [effectiveTheme, setEffectiveTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const computeEffective = (): "dark" | "light" => {
      if (theme === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      return theme;
    };

    const eff = computeEffective();
    setEffectiveTheme(eff);

    document.documentElement.setAttribute("data-theme", eff);
    document.documentElement.classList.toggle("dark", eff === "dark");
    document.documentElement.classList.toggle("light", eff === "light");
    localStorage.setItem("buildbuddy-theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        const updated = computeEffective();
        setEffectiveTheme(updated);
        document.documentElement.setAttribute("data-theme", updated);
        document.documentElement.classList.toggle("dark", updated === "dark");
        document.documentElement.classList.toggle("light", updated === "light");
      };
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme: setThemeState, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
