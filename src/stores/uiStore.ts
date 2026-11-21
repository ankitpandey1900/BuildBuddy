import { useState, useEffect } from "react";
import type { ViewType } from "@/types/ipc";

export function useUIState() {
  const [activeView, setActiveView] = useState<ViewType>("overview");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("buildbuddy-theme");
      if (saved === "light" || saved === "dark") return saved;
    }
    return "dark";
  });
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorWidth, setInspectorWidth] = useState(340);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    localStorage.setItem("buildbuddy-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const toggleInspector = () => {
    setInspectorOpen((prev) => !prev);
  };

  return {
    activeView,
    setActiveView,
    theme,
    setTheme,
    toggleTheme,
    inspectorOpen,
    setInspectorOpen,
    toggleInspector,
    inspectorWidth,
    setInspectorWidth,
    commandPaletteOpen,
    setCommandPaletteOpen,
  };
}

