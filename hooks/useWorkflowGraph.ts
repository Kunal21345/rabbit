"use client";

import { useCallback, useMemo, useState } from "react";

/* ====================================================== */
/* Types */
/* ====================================================== */

export type WorkflowNodeData = {
  label: string;
  description: string;

  businessRule: string;
  aiRuleDefinition: string;
  aiTestRules: string;
  comments: string;

  hidden?: boolean;

  handles: {
    source: boolean;
    target: boolean;
  };
};

export type WorkflowNode = {
  id: string;
  type: "workflow";
  position: {
    x: number;
    y: number;
  };
  data: WorkflowNodeData;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
};

export type WorkflowConnection = {
  source: string;
  target: string;
};

/* ====================================================== */
/* Helpers */
/* ====================================================== */

function buildNextNodePosition(nodes: WorkflowNode) {
  return {
    x: nodes.position.x + 280,
    y: nodes.position.y + 160,
  };
}

function normalizeLabels(edges: WorkflowEdge[], source: string) {
  return edges.map((edge) => {
    if (edge.source !== source) return edge;

    const sourceEdges = edges.filter((e) => e.source === source);
    const currentIndex = sourceEdges.findIndex((e) => e.id === edge.id);

    return {
      ...edge,
      label: currentIndex === 0 ? "YES" : "NO",
    };
  });
}

/* ====================================================== */
/* Hook */
/* ====================================================== */

export function useWorkflowGraph(
  initialNodes: WorkflowNode[],
  initialEdges: WorkflowEdge[]
) {
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes);
  const [edges, setEdges] = useState<WorkflowEdge[]>(initialEdges);

  /* ====================================================== */
  /* Add Node */
  /* ====================================================== */

  const addNode = useCallback(() => {
    setNodes((prev) => {
      const last = prev[prev.length - 1];

      const id = `node-${Date.now()}`;

      return [
        ...prev,
        {
          id,
          type: "workflow",
          position: last
            ? buildNextNodePosition(last)
            : { x: 250, y: 100 },
          data: {
            label: `Question ${prev.length}`,
            description: "",
            businessRule: "",
            aiRuleDefinition: "",
            aiTestRules: "",
            comments: "",
            handles: {
              source: true,
              target: true,
            },
          },
        },
      ];
    });
  }, []);

  /* ====================================================== */
  /* Update Node */
  /* ====================================================== */

  const updateNode = useCallback(
    (id: string, updates: Partial<WorkflowNodeData>) => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...updates,
                },
              }
            : node
        )
      );
    },
    []
  );

  /* ====================================================== */
  /* Node Changes */
  /* ====================================================== */

  const moveNode = useCallback(
    (id: string, position: WorkflowNode["position"]) => {
      setNodes((prev) =>
        prev.map((node) =>
          node.id === id
            ? {
                ...node,
                position,
              }
            : node
        )
      );
    },
    []
  );

  /* ====================================================== */
  /* Connect Edge */
  /* ====================================================== */

  const connectEdge = useCallback((connection: WorkflowConnection) => {
    if (!connection.source || !connection.target) return;

    setEdges((prev) => {
      const sourceEdges = prev.filter(
        (edge) => edge.source === connection.source
      );

      if (sourceEdges.length >= 2) return prev;

      const exists = prev.some(
        (edge) =>
          edge.source === connection.source &&
          edge.target === connection.target
      );

      if (exists) return prev;

      const label = sourceEdges.length === 0 ? "YES" : "NO";

      const next = [
        ...prev,
        {
          ...connection,
          id: `${connection.source}-${connection.target}`,
          label,
          type: label === "YES" ? "animated" : "temporary",
        },
      ] as WorkflowEdge[];

      return normalizeLabels(next, connection.source);
    });
  }, []);

  /* ====================================================== */
  /* Remove Edge + Reorder */
  /* ====================================================== */

  const removeEdge = useCallback((edgeId: string) => {
    setEdges((prev) => {
      const targetEdge = prev.find((e) => e.id === edgeId);
      if (!targetEdge) return prev;

      const next = prev.filter((e) => e.id !== edgeId);

      return normalizeLabels(next, targetEdge.source);
    });
  }, []);

  /* ====================================================== */
  /* Memo */
  /* ====================================================== */

  const graph = useMemo(
    () => ({
      nodes,
      edges,
    }),
    [nodes, edges]
  );

  /* ====================================================== */

  return {
    ...graph,
    setNodes,
    setEdges,
    addNode,
    updateNode,
    moveNode,
    connectEdge,
    removeEdge,
  };
}
