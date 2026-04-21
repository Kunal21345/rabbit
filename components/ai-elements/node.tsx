import type { ComponentProps } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const NODE_WIDTH = 420;
export const NODE_HEIGHT = 220;
export const NODE_CONNECTOR_SIZE = 20;

export type NodeProps = ComponentProps<typeof Card> & {
  handles: {
    target: boolean;
    source: boolean;
  };
  selected?: boolean;
};

export const Node = ({
  className,
  selected = false,
  ...props
}: NodeProps) => (
  <Card
    className={cn(
      "node-container relative gap-0 overflow-hidden rounded-2xl p-0 transition-[box-shadow,border-color] duration-150",
      selected &&
        "border-primary shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_30%,transparent)]",
      className
    )}
    style={{
      width: `${NODE_WIDTH}px`,
      height: `${NODE_HEIGHT}px`,
      ...props.style,
    }}
    {...props}
  />
);

export type NodeHeaderProps = ComponentProps<typeof CardHeader>;

export const NodeHeader = ({ className, ...props }: NodeHeaderProps) => (
  <CardHeader
    className={cn("rounded-t-md border-b bg-secondary p-4", className)}
    {...props}
  />
);

export type NodeTitleProps = ComponentProps<typeof CardTitle>;

export const NodeTitle = (props: NodeTitleProps) => <CardTitle {...props} />;

export type NodeDescriptionProps = ComponentProps<typeof CardDescription>;

export const NodeDescription = (props: NodeDescriptionProps) => (
  <CardDescription {...props} />
);

export type NodeActionProps = ComponentProps<typeof CardAction>;

export const NodeAction = (props: NodeActionProps) => <CardAction {...props} />;

export type NodeContentProps = ComponentProps<typeof CardContent>;

export const NodeContent = ({ className, ...props }: NodeContentProps) => (
  <CardContent className={cn("px-8, py-4", className)} {...props} />
);

//export type NodeFooterProps = ComponentProps<typeof CardFooter>;

// export const NodeFooter = ({ className, ...props }: NodeFooterProps) => (
//   <CardFooter
//     className={cn("rounded-b-md border-t bg-secondary p-3!", className)}
//     {...props}
//   />
// );
