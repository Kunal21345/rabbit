"use client";

import { WorkflowEdge, WorkflowNode } from "@/hooks/useWorkflowGraph";
import { useWorkflowPersistence } from "@/hooks/useWorkflowPersistence";

/* -------------------------------------------------- */
/* Types */
/* -------------------------------------------------- */

interface GraphPersistenceProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/* -------------------------------------------------- */
/* Component */
/* -------------------------------------------------- */

export function GraphPersistence({
  nodes,
  edges,
}: GraphPersistenceProps) {
  useWorkflowPersistence(nodes, edges);

  return null;
}
