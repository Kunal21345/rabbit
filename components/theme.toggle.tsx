"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  if (!mounted) return null;

  return (
    <Button
      onClick={() =>
        setTheme(resolvedTheme === "light" ? "dark" : "light")
      }
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      className="rounded-sm text-muted-foreground"
    >
      {resolvedTheme === "light" ? (
        <SunIcon />
      ) : (
        <MoonIcon />
      )}
    </Button>
  );
}
