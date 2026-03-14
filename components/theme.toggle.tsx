"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <button
      onClick={() =>
        setTheme(resolvedTheme === "light" ? "dark" : "light")
      }
      className="px-4 py-2 rounded-md bg-card border border-border"
    >
      Toggle Theme
    </button>
  );
}