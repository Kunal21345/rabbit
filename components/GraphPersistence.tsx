"use client";

import { Edge } from "@xyflow/react";
import { WorkflowNode } from "@/hooks/useWorkflowGraph";
import { useWorkflowPersistence } from "@/hooks/useWorkflowPersistence";

/* -------------------------------------------------- */
/* Types */
/* -------------------------------------------------- */

interface GraphPersistenceProps {
  nodes: WorkflowNode[];
  edges: Edge[];
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