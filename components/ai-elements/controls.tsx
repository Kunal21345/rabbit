"use client";

import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ControlsProps = ComponentProps<"div">;

export const Controls = ({ className, ...props }: ControlsProps) => (
  <div
    className={cn(
      "gap-px overflow-hidden rounded-md border bg-card p-1 shadow-none!",
      "[&>button]:rounded-md [&>button]:border-none [&>button]:bg-transparent [&>button]:hover:bg-secondary",
      className
    )}
    {...props}
  />
);
