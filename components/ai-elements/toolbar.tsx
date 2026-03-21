import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ToolbarProps = ComponentProps<"div">;

export const Toolbar = ({ className, ...props }: ToolbarProps) => (
  <div
    className={cn(
      "flex items-center gap-1 rounded-sm border bg-background p-1.5",
      className
    )}
    {...props}
  />
);
