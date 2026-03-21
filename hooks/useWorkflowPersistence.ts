import { useEffect, useRef } from "react";

import { WorkflowEdge, WorkflowNode } from "@/hooks/useWorkflowGraph";

/* -------------------------------------------------- */
/* Storage */
/* -------------------------------------------------- */

const STORAGE_KEY = "workflow-graph-v3";

/* -------------------------------------------------- */
/* Hook */
/* -------------------------------------------------- */

export function useWorkflowPersistence(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
) {
  const timeoutRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            nodes,
            edges,
          })
        );
      } catch (error) {
        console.warn(
          "Failed to persist workflow graph",
          error
        );
      }
    }, 400);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [nodes, edges]);
}
