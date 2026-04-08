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

type NewNodeSeed = Partial<
  Omit<WorkflowNodeData, "handles"> & {
    handles: Partial<WorkflowNodeData["handles"]>;
  }
>;

/* ====================================================== */
/* Helpers */
/* ====================================================== */

function buildNextNodePosition(nodes: WorkflowNode) {
  return {
    x: nodes.position.x + 280,
    y: nodes.position.y + 160,
  };
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

  const addNode = useCallback((seed?: NewNodeSeed) => {
    const id = `node-${Date.now()}`;

    setNodes((prev) => {
      const last = prev[prev.length - 1];
      const defaultData: WorkflowNodeData = {
        label: `Step ${prev.length}`,
        description: "",
        businessRule: "",
        aiRuleDefinition: "",
        aiTestRules: "",
        comments: "",
        handles: {
          source: true,
          target: true,
        },
      };

      return [
        ...prev,
        {
          id,
          type: "workflow",
          position: last
            ? buildNextNodePosition(last)
            : { x: 250, y: 100 },
          data: {
            ...defaultData,
            ...seed,
            handles: {
              ...defaultData.handles,
              ...seed?.handles,
            },
          },
        },
      ];
    });

    return id;
  }, []);

  /* ====================================================== */
  /* Update Node */
  /* ====================================================== */

  const updateNode = useCallback(
    (id: string, updates: Partial<WorkflowNodeData>) => {
      setNodes((prev) => {
        let changed = false;

        const next = prev.map((node) => {
          if (node.id !== id) return node;

          const hasChanges = (
            Object.keys(updates) as Array<keyof WorkflowNodeData>
          ).some((key) => node.data[key] !== updates[key]);

          if (!hasChanges) return node;

          changed = true;

          return {
            ...node,
            data: {
              ...node.data,
              ...updates,
            },
          };
        });

        return changed ? next : prev;
      });
    },
    []
  );

  /* ====================================================== */
  /* Node Changes */
  /* ====================================================== */

  const moveNode = useCallback(
    (id: string, position: WorkflowNode["position"]) => {
      setNodes((prev) => {
        let changed = false;

        const next = prev.map((node) => {
          if (node.id !== id) return node;

          if (
            node.position.x === position.x &&
            node.position.y === position.y
          ) {
            return node;
          }

          changed = true;

          return {
            ...node,
            position,
          };
        });

        return changed ? next : prev;
      });
    },
    []
  );

  /* ====================================================== */
  /* Connect Edge */
  /* ====================================================== */

  const connectEdge = useCallback((connection: WorkflowConnection) => {
    if (!connection.source || !connection.target) return;

    setEdges((prev) => {
      const exists = prev.some(
        (edge) =>
          edge.source === connection.source &&
          edge.target === connection.target
      );

      if (exists) return prev;

      return [
        ...prev,
        {
          ...connection,
          id: `${connection.source}-${connection.target}`,
        },
      ] as WorkflowEdge[];
    });
  }, []);

  /* ====================================================== */
  /* Remove Edge + Reorder */
  /* ====================================================== */

  const removeEdge = useCallback((edgeId: string) => {
    setEdges((prev) =>
      prev.filter((edge) => edge.id !== edgeId)
    );
  }, []);

  const updateEdgeTarget = useCallback(
    (edgeId: string, target: string) => {
      setEdges((prev) => {
        const currentEdge = prev.find(
          (edge) => edge.id === edgeId
        );

        if (!currentEdge || currentEdge.target === target) {
          return prev;
        }

        const duplicate = prev.some(
          (edge) =>
            edge.id !== edgeId &&
            edge.source === currentEdge.source &&
            edge.target === target
        );

        if (duplicate) return prev;

        const next = prev.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                id: `${edge.source}-${target}`,
                target,
              }
            : edge
        );

        return next;
      });
    },
    []
  );

  /* ====================================================== */
  /* Remove Nodes */
  /* ====================================================== */

  const removeNodes = useCallback((nodeIds: string[]) => {
    if (nodeIds.length === 0) return;

    const idSet = new Set(nodeIds);

    setNodes((prev) =>
      prev.filter((node) => !idSet.has(node.id))
    );

    setEdges((prev) => {
      return prev.filter(
        (edge) =>
          !idSet.has(edge.source) &&
          !idSet.has(edge.target)
      );
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
    updateEdgeTarget,
    removeEdge,
    removeNodes,
  };
}
