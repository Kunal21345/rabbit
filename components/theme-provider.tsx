"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  attribute?: "class";
};

type ThemeContextValue = {
  resolvedTheme: Theme;
  setTheme: (theme: Theme) => void;
};

const THEME_STORAGE_KEY = "app-theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): Theme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

function resolveInitialTheme(
  defaultTheme: Theme,
  enableSystem: boolean
): Theme {
  if (typeof window === "undefined") {
    return defaultTheme;
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return enableSystem ? getSystemTheme() : defaultTheme;
}

function applyThemeToDocument(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  enableSystem = true,
}: ThemeProviderProps) {
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() =>
    resolveInitialTheme(defaultTheme, enableSystem)
  );

  useEffect(() => {
    applyThemeToDocument(resolvedTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (!enableSystem) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

      if (storedTheme === "light" || storedTheme === "dark") {
        return;
      }

      setResolvedTheme(getSystemTheme());
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [enableSystem]);

  const value = useMemo(
    () => ({
      resolvedTheme,
      setTheme: setResolvedTheme,
    }),
    [resolvedTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return context;
}
