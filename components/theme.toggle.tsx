"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
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
