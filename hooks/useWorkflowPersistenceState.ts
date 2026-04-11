"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [hydrated, setHydrated] = useState(false);
  const persistedGraph = useDebounce({ nodes, edges }, 800);

  useEffect(() => {
    const saved = readWorkflowGraphSnapshot(storageKey);

    if (saved) {
      setNodes(saved.nodes);
      setEdges(saved.edges);
    }

    setHydrated(true);
  }, [setEdges, setNodes, storageKey]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    writeWorkflowGraphSnapshot(storageKey, persistedGraph);
  }, [hydrated, persistedGraph, storageKey]);

  const clearPersistedGraph = useCallback(() => {
    clearWorkflowGraphSnapshot(storageKey);
  }, [storageKey]);

  return {
    hydrated,
    clearPersistedGraph,
  };
}
