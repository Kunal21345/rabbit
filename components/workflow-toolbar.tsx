"use client";

import {
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PlusIcon,
  RefreshCcw,
} from "lucide-react";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type WorkflowToolbarProps = {
  isChatbotCollapsed: boolean;
  onAddNode: () => void;
  onClearGraph: () => void;
  onToggleChatbot: () => void;
};

export function WorkflowToolbar({
  isChatbotCollapsed,
  onAddNode,
  onClearGraph,
  onToggleChatbot,
}: WorkflowToolbarProps) {
  return (
    <Header className="pointer-events-auto h-11 bg-transparent px-3 py-0">
      <div className="flex items-center gap-2">
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onAddNode}
                variant="ghost"
                size="sm"
                className="rounded-sm text-muted-foreground"
              >
                <PlusIcon data-icon="inline-start" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Add node</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onClearGraph}
                variant="ghost"
                size="sm"
                className="rounded-sm text-muted-foreground"
              >
                <RefreshCcw data-icon="inline-start" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear graph</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-sm text-muted-foreground"
                onClick={onToggleChatbot}
                aria-label={
                  isChatbotCollapsed
                    ? "Expand chatbot panel"
                    : "Collapse chatbot panel"
                }
              >
                {isChatbotCollapsed ? (
                  <PanelRightOpenIcon />
                ) : (
                  <PanelRightCloseIcon />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isChatbotCollapsed
                ? "Expand chatbot panel"
                : "Collapse chatbot panel"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </Header>
  );
}
