"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import dagre from "dagre";
import { Header } from "@/components/header";
import { Canvas } from "@/components/ai-elements/canvas";
import { Edge as CustomEdge } from "@/components/ai-elements/edge";
import { WorkflowChatbot } from "@/components/workflow-chatbot";

import {
  Node as CustomNode,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from "@/components/ai-elements/node";

import { ThemeToggle } from "@/components/theme.toggle";
import { NodeSheet } from "@/components/sheet-panel";

import {
  useWorkflowGraph,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowEdge,
} from "@/hooks/useWorkflowGraph";

import { useDebounce } from "@/hooks/useDebounce";
import type { WorkflowGenerationModel } from "@/lib/workflow-generation";

/* ====================================================== */

type NodeSheetPayload = {
  id: string;
  label: string;
  description: string;
  businessRule: string;
  aiRuleDefinition: string;
  aiTestRules: string;
  comments: string;
  nextNodeIds: string[];
};

type WorkflowSubmitResult = {
  ok: boolean;
  message: string;
};

/* ====================================================== */

const initialNodes: WorkflowNode[] = [
  {
    id: "start",
    type: "workflow",
    position: { x: 0, y: 0 },
    data: {
      label: "Start",
      description: "Initialize workflow",
      businessRule: "",
      aiRuleDefinition: "",
      aiTestRules: "",
      comments: "",
      handles: {
        source: true,
        target: false,
      },
    },
  },
  {
    id: "Sample Node",
    type: "workflow",
    position: { x: 600, y: -300 },
    data: {
      label: "Sample Node",
      description: "Evaluate the workflow input",
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
  {
    id: "Sample Node 2",
    type: "workflow",
    position: { x: 600, y: 300 },
    data: {
      label: "Sample Node 2",
      description: "Complete the workflow",
      businessRule: "",
      aiRuleDefinition: "",
      aiTestRules: "",
      comments: "",
      handles: {
        source: false,
        target: true,
      },
    },
  },
];

const initialEdges: WorkflowEdge[] = [
  {
    id: "start-sample-node",
    source: "start",
    target: "Sample Node",
  },
  {
    id: "start-sample-node-2",
    source: "start",
    target: "Sample Node 2",
  },
];

function hashSeedGraph(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16);
}

const STORAGE_KEY = `workflow-graph-${hashSeedGraph(
  JSON.stringify({
    nodes: initialNodes,
    edges: initialEdges,
  })
)}`;

/* ====================================================== */
/* Helpers */
/* ====================================================== */

function buildEdgeMap(edges: WorkflowEdge[]) {
  const result = new Map<string, WorkflowEdge[]>();

  edges.forEach((edge) => {
    const existing = result.get(edge.source) || [];
    result.set(edge.source, [...existing, edge]);
  });

  return result;
}

const LAYOUT_NODE_WIDTH = 320;
const LAYOUT_NODE_HEIGHT = 144;
const CHILD_VERTICAL_GAP = 96;

function layoutNodePositions(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
) {
  const graph = new dagre.graphlib.Graph();

  graph.setGraph({
    rankdir: "LR",
    align: "UL",
    nodesep: 120,
    ranksep: 160,
    marginx: 60,
    marginy: 60,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    graph.setNode(node.id, {
      width: LAYOUT_NODE_WIDTH,
      height: LAYOUT_NODE_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const centerPositions = new Map<string, { x: number; y: number }>(
    nodes.map((node) => {
      const layoutNode = graph.node(node.id) as
        | { x: number; y: number }
        | undefined;

      if (!layoutNode) {
        return [
          node.id,
          {
            x: node.position.x + LAYOUT_NODE_WIDTH / 2,
            y: node.position.y + LAYOUT_NODE_HEIGHT / 2,
          },
        ] as const;
      }

      return [
        node.id,
        {
          x: layoutNode.x,
          y: layoutNode.y,
        },
      ] as const;
    })
  );

  const incomingCount = new Map<string, number>();
  edges.forEach((edge) => {
    incomingCount.set(
      edge.target,
      (incomingCount.get(edge.target) || 0) + 1
    );
  });

  const childrenBySource = new Map<string, string[]>();
  edges.forEach((edge) => {
    const children = childrenBySource.get(edge.source) || [];
    children.push(edge.target);
    childrenBySource.set(edge.source, children);
  });

  childrenBySource.forEach((children, sourceId) => {
    const sourcePosition = centerPositions.get(sourceId);
    if (!sourcePosition || children.length <= 1) return;

    const uniqueChildren = [...new Set(children)].filter(
      (childId) => (incomingCount.get(childId) || 0) <= 1
    );

    if (uniqueChildren.length <= 1) return;

    uniqueChildren.sort((a, b) => {
      const ay = centerPositions.get(a)?.y || 0;
      const by = centerPositions.get(b)?.y || 0;
      return ay - by;
    });

    const spacing = LAYOUT_NODE_HEIGHT + CHILD_VERTICAL_GAP;
    const totalSpan = (uniqueChildren.length - 1) * spacing;
    const startY = sourcePosition.y - totalSpan / 2;

    uniqueChildren.forEach((childId, index) => {
      const current = centerPositions.get(childId);
      if (!current) return;

      centerPositions.set(childId, {
        x: current.x,
        y: startY + index * spacing,
      });
    });
  });

  return new Map(
    nodes.map((node) => {
      const center = centerPositions.get(node.id);

      if (!center) return [node.id, node.position] as const;

      return [
        node.id,
        {
          x: center.x - LAYOUT_NODE_WIDTH / 2,
          y: center.y - LAYOUT_NODE_HEIGHT / 2,
        },
      ] as const;
    })
  );
}

/* ====================================================== */
/* Node Renderer */
/* ====================================================== */

const WorkflowNodeRenderer = memo(
  function WorkflowNodeRenderer({
    data,
    selected,
  }: {
    data: WorkflowNodeData & {
      edges?: WorkflowEdge[];
      nodeLabelMap?: Map<string, string>;
      hidden?: boolean;
    };
    selected?: boolean;
  }) {
    if (data.hidden) return null;

    return (
      <CustomNode handles={data.handles} selected={selected}>
        <NodeHeader>
          <NodeTitle>{data.label}</NodeTitle>
          <NodeDescription>
            {data.description}
          </NodeDescription>
        </NodeHeader>

        <NodeContent>
          <p className="text-xs">
            {data.businessRule || "Workflow Step"}
          </p>
        </NodeContent>

        <NodeFooter>
          <div className="text-xs space-y-1">
            {(data.edges?.length || 0) > 0 ? (
              data.edges?.map((edge) => (
                <p key={edge.id}>
                  Next:{" "}
                  {data.nodeLabelMap?.get(edge.target) ||
                    edge.target}
                </p>
              ))
            ) : (
              <p>Next: pending</p>
            )}
          </div>
        </NodeFooter>
      </CustomNode>
    );
  }
);

const nodeTypes = {
  workflow: WorkflowNodeRenderer,
};

const edgeTypes = {
  animated: CustomEdge.Default,
};


/* ====================================================== */
/* Page */
/* ====================================================== */

export default function WorkflowBuilder() {
  const {
    nodes,
    edges,
    setNodes,
    setEdges,
    moveNode,
    addNode,
    connectEdge,
    updateEdgeTarget,
    updateNode,
    removeEdge,
    removeNodes,
  } = useWorkflowGraph(initialNodes, initialEdges);

  const [hydrated, setHydrated] = useState(false);
  const [selectedNodeId, setSelectedNodeId] =
    useState<string | null>(null);
  const [sheetOpen, setSheetOpen] =
    useState(false);
  const [generationError, setGenerationError] =
    useState<string | null>(null);
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] =
    useState(false);
  const persistedGraph = useDebounce(
    { nodes, edges },
    800
  );

  /* ====================================================== */
  /* Restore */
  /* ====================================================== */

  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        STORAGE_KEY
      );

      if (!saved) {
        setHydrated(true);
        return;
      }

      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed.nodes))
        setNodes(parsed.nodes);

      if (Array.isArray(parsed.edges))
        setEdges(parsed.edges);
    } finally {
      setHydrated(true);
    }
  }, [setNodes, setEdges]);

  /* ====================================================== */
  /* Persist */
  /* ====================================================== */

  useEffect(() => {
    if (!hydrated) return;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(persistedGraph)
    );
  }, [persistedGraph, hydrated]);

  const graphTopologyKey = useMemo(() => {
    const nodeIds = nodes
      .map((node) => node.id)
      .sort()
      .join("|");
    const edgeIds = edges
      .map((edge) => `${edge.source}->${edge.target}`)
      .sort()
      .join("|");

    return `${nodeIds}::${edgeIds}`;
  }, [nodes, edges]);

  useEffect(() => {
    if (!hydrated) return;

    setNodes((previousNodes) => {
      const nextPositions = layoutNodePositions(
        previousNodes,
        edges
      );

      const changed = previousNodes.some((node) => {
        const next = nextPositions.get(node.id);

        if (!next) return false;

        return (
          Math.abs(next.x - node.position.x) > 0.5 ||
          Math.abs(next.y - node.position.y) > 0.5
        );
      });

      if (!changed) return previousNodes;

      return previousNodes.map((node) => {
        const next = nextPositions.get(node.id);
        if (!next) return node;

        return {
          ...node,
          position: next,
        };
      });
    });
  }, [edges, graphTopologyKey, hydrated, setNodes]);

  useEffect(() => {
    let cancelled = false;

    async function checkWorkflowGenerationConfig() {
      try {
        const response = await fetch(
          "/api/workflow/generate",
          {
            method: "GET",
          }
        );

        const payload = await response.json();

        if (cancelled) return;

        if (!response.ok) {
          setGenerationError(
            payload.error ||
              "Workflow generation is not configured."
          );
          return;
        }

        setGenerationError(null);
      } catch {
        if (!cancelled) {
          setGenerationError(
            "Unable to reach workflow generation backend."
          );
        }
      }
    }

    checkWorkflowGenerationConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ====================================================== */
  /* Derived */
  /* ====================================================== */

  const edgeMap = useMemo(
    () => buildEdgeMap(edges),
    [edges]
  );

  const nodeLabelMap = useMemo(() => {
    return new Map(
      nodes.map((node) => [
        node.id,
        node.data.label,
      ])
    );
  }, [nodes]);

  const canvasNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        edges: edgeMap.get(node.id),
        nodeLabelMap,
      },
    }));
  }, [nodes, edgeMap, nodeLabelMap]);

  const canvasEdges = useMemo(
    () => edges,
    [edges]
  );

  /* ====================================================== */
  /* Selected Node */
  /* ====================================================== */

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;

    const node = nodes.find(
      (n) => n.id === selectedNodeId
    );

    if (!node) return null;

    const nodeEdges = edgeMap.get(node.id) || [];

    return {
      id: node.id,
      label: node.data.label,
      description: node.data.description,
      businessRule: node.data.businessRule,
      aiRuleDefinition:
        node.data.aiRuleDefinition,
      aiTestRules: node.data.aiTestRules,
      comments: node.data.comments,
      nextNodeIds: nodeEdges.map((edge) => edge.target),
    };
  }, [nodes, selectedNodeId, edgeMap]);

  const nodeOptions = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        label: node.data.label,
      })),
    [nodes]
  );

  const handleNodeClick = useCallback(
    (_event: MouseEvent<HTMLDivElement>, node: WorkflowNode) => {
      setSelectedNodeId(node.id);
      setSheetOpen(true);
    },
    []
  );

  const handleDeleteNodes = useCallback(
    (nodeIds: string[]) => {
      removeNodes(nodeIds);

      if (
        selectedNodeId &&
        nodeIds.includes(selectedNodeId)
      ) {
        setSelectedNodeId(null);
        setSheetOpen(false);
      }
    },
    [removeNodes, selectedNodeId]
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      removeEdge(edgeId);
    },
    [removeEdge]
  );

  /* ====================================================== */
  /* Save */
  /* ====================================================== */

  const handleSave = useCallback(
    (data: NodeSheetPayload) => {
      updateNode(data.id, {
        label: data.label,
        description: data.description,
        businessRule: data.businessRule,
        aiRuleDefinition:
          data.aiRuleDefinition,
        aiTestRules: data.aiTestRules,
        comments: data.comments,
      });
    },
    [updateNode]
  );

  const handlePromptSubmit = useCallback(
    async (
      prompt: string,
      model: WorkflowGenerationModel
    ): Promise<WorkflowSubmitResult> => {
      setGenerationError(null);
      setIsGeneratingWorkflow(true);

      try {
        const response = await fetch(
          "/api/workflow/generate",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt,
              model,
              currentGraph: {
                nodes: nodes.map((node) => ({
                  id: node.id,
                  label: node.data.label,
                  description:
                    node.data.description,
                  businessRule:
                    node.data.businessRule,
                })),
                edges: edges.map((edge) => ({
                  source: edge.source,
                  target: edge.target,
                })),
              },
            }),
          }
        );

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload.details ||
              payload.error ||
              "Failed to generate workflow."
          );
        }

        setNodes(payload.graph.nodes);
        setEdges(payload.graph.edges);
        setSelectedNodeId(null);
        setSheetOpen(false);
        return {
          ok: true,
          message:
            "Workflow updated. Ask me for refinements if you want to tweak steps, labels, or business rules.",
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to generate workflow.";

        setGenerationError(
          errorMessage
        );
        return {
          ok: false,
          message: `I could not update the workflow: ${errorMessage}`,
        };
      } finally {
        setIsGeneratingWorkflow(false);
      }
    },
    [edges, nodes, setEdges, setNodes]
  );

  /* ====================================================== */
  /* Render */
  /* ====================================================== */
  /* ====================clear graph================================== */
const handleClearGraph = useCallback(() => {
  setNodes(initialNodes);
  setEdges(initialEdges);
  setSelectedNodeId(null);
  setSheetOpen(false);
  setGenerationError(null);
  localStorage.removeItem(STORAGE_KEY);
},[setNodes, setEdges]);


  return (
    <div className="w-full h-screen relative">
      <Header>
        <button onClick={() => addNode()} className="px-4 py-2 border rounded">
          Add Node
        </button>
        <button onClick={handleClearGraph} className="px-4 py-2 border rounded">
          Clear
        </button>
        <ThemeToggle />

        </Header>

      <Canvas
        nodes={canvasNodes}
        edges={canvasEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodePositionChange={moveNode}
        onNodeClick={handleNodeClick}
        onDeleteNodes={handleDeleteNodes}
        onDeleteEdge={handleDeleteEdge}
        onConnect={connectEdge}
        onReconnectEdgeTarget={updateEdgeTarget}
        fitView
      />

      <WorkflowChatbot
        error={generationError}
        loading={isGeneratingWorkflow}
        onSubmit={handlePromptSubmit}
      />

      <NodeSheet
        node={selectedNode}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        nodes={nodeOptions}
      />
    </div>
  );
}
