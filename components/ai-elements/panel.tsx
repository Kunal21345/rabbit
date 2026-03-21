import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type PanelProps = ComponentProps<"div">;

export const Panel = ({ className, ...props }: PanelProps) => (
  <div
    className={cn(
      "m-4 overflow-hidden rounded-md border bg-card p-1",
      className
    )}
    {...props}
  />
);
