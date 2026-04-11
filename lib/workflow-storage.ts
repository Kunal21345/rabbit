"use client";

import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/hooks/useWorkflowGraph";

export type WorkflowGraphSnapshot = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

function isPosition(value: unknown): value is WorkflowNode["position"] {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  );
}

function isWorkflowNode(value: unknown): value is WorkflowNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "type" in value &&
    "position" in value &&
    "data" in value &&
    typeof value.id === "string" &&
    value.type === "workflow" &&
    isPosition(value.position)
  );
}

function isWorkflowEdge(value: unknown): value is WorkflowEdge {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "source" in value &&
    "target" in value &&
    typeof value.id === "string" &&
    typeof value.source === "string" &&
    typeof value.target === "string"
  );
}

export function isWorkflowGraphSnapshot(
  value: unknown
): value is WorkflowGraphSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "nodes" in value &&
    "edges" in value &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    value.nodes.every(isWorkflowNode) &&
    value.edges.every(isWorkflowEdge)
  );
}

export function readWorkflowGraphSnapshot(
  storageKey: string
): WorkflowGraphSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    return isWorkflowGraphSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeWorkflowGraphSnapshot(
  storageKey: string,
  snapshot: WorkflowGraphSnapshot
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
}

export function clearWorkflowGraphSnapshot(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKey);
}
