import { useEffect, useRef } from "react";
import { Edge } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";

import { WorkflowNode } from "@/hooks/useWorkflowGraph";

/* -------------------------------------------------- */
/* Storage */
/* -------------------------------------------------- */

const STORAGE_KEY = "workflow-graph-v3";

/* -------------------------------------------------- */
/* Hook */
/* -------------------------------------------------- */

export function useWorkflowPersistence(
  nodes: WorkflowNode[],
  edges: Edge[]
) {
  const { getViewport } = useReactFlow();

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
            viewport: getViewport(),
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
  }, [nodes, edges, getViewport]);
}