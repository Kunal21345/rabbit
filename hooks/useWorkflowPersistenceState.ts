"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/hooks/useWorkflowGraph";
import { useDebounce } from "@/hooks/useDebounce";
import {
  clearWorkflowGraphSnapshot,
  readWorkflowGraphSnapshot,
  writeWorkflowGraphSnapshot,
} from "@/lib/workflow-storage";

type UseWorkflowPersistenceStateArgs = {
  storageKey: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<WorkflowEdge[]>>;
};

export function useWorkflowPersistenceState({
  storageKey,
  nodes,
  edges,
  setNodes,
  setEdges,
}: UseWorkflowPersistenceStateArgs) {
  const hydratedRef = useRef(false);
  const snapshot = useMemo(
    () => ({ nodes, edges }),
    [nodes, edges]
  );
  const persistedGraph = useDebounce(snapshot, 800);

  useEffect(() => {
    const saved = readWorkflowGraphSnapshot(storageKey);

    if (saved) {
      setNodes(saved.nodes);
      setEdges(saved.edges);
    }

    hydratedRef.current = true;
  }, [setEdges, setNodes, storageKey]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    writeWorkflowGraphSnapshot(storageKey, persistedGraph);
  }, [persistedGraph, storageKey]);

  const clearPersistedGraph = useCallback(() => {
    clearWorkflowGraphSnapshot(storageKey);
  }, [storageKey]);

  return {
    hydrated: true,
    clearPersistedGraph,
  };
}
