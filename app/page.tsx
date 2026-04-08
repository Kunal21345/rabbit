"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import dagre from "dagre";
import { Header } from "@/components/header";
import { Canvas } from "@/components/ai-elements/canvas";
import { Edge as CustomEdge } from "@/components/ai-elements/edge";
import { WorkflowChatbot } from "@/components/workflow-chatbot";
import { PanelRightCloseIcon, PanelRightOpenIcon, PlusIcon, RefreshCcw } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  useWorkflowGraph,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowEdge,
} from "@/hooks/useWorkflowGraph";

import { useDebounce } from "@/hooks/useDebounce";
import {
  type WorkflowGenerationModel,
  type WorkflowProvider,
} from "@/lib/workflow-generation";
import { cn } from "@/lib/utils";

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
const MIN_CANVAS_WIDTH = 420;
const MIN_CHATBOT_WIDTH = 320;
const DEFAULT_CHATBOT_WIDTH = 420;

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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
          <div className="flex flex-col gap-1 text-xs">
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
  const [chatbotWidth, setChatbotWidth] = useState(
    DEFAULT_CHATBOT_WIDTH
  );
  const [contentWidth, setContentWidth] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [isChatbotCollapsed, setIsChatbotCollapsed] =
    useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const resizeStateRef = useRef<{
    startClientX: number;
    startWidth: number;
    containerWidth: number;
  } | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
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
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const nextWidth = entry.contentRect.width;
      setContentWidth((previousWidth) => {
        if (Math.abs(previousWidth - nextWidth) < 0.5) {
          return previousWidth;
        }

        return nextWidth;
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const maxChatbotWidth = useMemo(() => {
    if (contentWidth === 0) {
      return DEFAULT_CHATBOT_WIDTH;
    }

    return Math.max(
      MIN_CHATBOT_WIDTH,
      contentWidth - MIN_CANVAS_WIDTH
    );
  }, [contentWidth]);

  useEffect(() => {
    setChatbotWidth((current) =>
      clampValue(
        current,
        MIN_CHATBOT_WIDTH,
        maxChatbotWidth
      )
    );
  }, [maxChatbotWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      const currentResize = resizeStateRef.current;
      if (!currentResize) return;

      const deltaX =
        currentResize.startClientX - event.clientX;
      const maxWidth = Math.max(
        MIN_CHATBOT_WIDTH,
        currentResize.containerWidth -
          MIN_CANVAS_WIDTH
      );

      const nextWidth = clampValue(
        currentResize.startWidth + deltaX,
        MIN_CHATBOT_WIDTH,
        maxWidth
      );

      pendingWidthRef.current = nextWidth;

      if (resizeRafRef.current !== null) {
        return;
      }

      resizeRafRef.current = window.requestAnimationFrame(() => {
        const pendingWidth = pendingWidthRef.current;
        resizeRafRef.current = null;

        if (pendingWidth === null) return;

        setChatbotWidth((current) => {
          if (Math.abs(current - pendingWidth) < 0.5) {
            return current;
          }

          return pendingWidth;
        });
      });
    };

    const stopResizing = () => {
      setIsResizing(false);
      resizeStateRef.current = null;
      pendingWidthRef.current = null;

      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };

    window.addEventListener(
      "pointermove",
      handlePointerMove
    );
    window.addEventListener("pointerup", stopResizing);

    return () => {
      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );
      window.removeEventListener(
        "pointerup",
        stopResizing
      );
    };
  }, [isResizing]);

  useEffect(() => {
    return () => {
      if (resizeRafRef.current !== null) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
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
      model: WorkflowGenerationModel,
      provider: WorkflowProvider,
      apiKey?: string
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
              provider,
              apiKey,
              currentGraph: {
                nodes: nodesRef.current.map((node) => ({
                  id: node.id,
                  label: node.data.label,
                  description:
                    node.data.description,
                  businessRule:
                    node.data.businessRule,
                })),
                edges: edgesRef.current.map((edge) => ({
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
    [setEdges, setNodes]
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

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isChatbotCollapsed) return;

      const container = contentRef.current;
      if (!container) return;

      resizeStateRef.current = {
        startClientX: event.clientX,
        startWidth: chatbotWidth,
        containerWidth: container.getBoundingClientRect().width,
      };
      setIsResizing(true);
    },
    [chatbotWidth, isChatbotCollapsed]
  );

  const effectiveChatbotWidth = isChatbotCollapsed
    ? 0
    : chatbotWidth;

  return (
    <div className="h-screen w-full overflow-hidden bg-background text-foreground">
      <div
        ref={contentRef}
        className="grid h-screen min-h-0 p-3"
        style={{
          gridTemplateColumns: `minmax(0, 1fr) 0px ${effectiveChatbotWidth}px`,
        }}
      >
        <div className="min-w-0 min-h-0 p-[2px]">
          <div className="relative h-full w-full min-h-0 overflow-hidden rounded-lg border border-border bg-card">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
              <Header className="pointer-events-auto h-11 bg-transparent px-3 py-0">
                <div className="flex items-center gap-2">
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => addNode()}
                          variant="ghost"
                          size="sm"
                          className="rounded-sm text-muted-foreground"
                        >
                          <PlusIcon data-icon="inline-start" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Add node</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleClearGraph}
                          variant="ghost"
                          size="sm"
                          className="rounded-sm text-muted-foreground"
                        >
                          <RefreshCcw data-icon="inline-start" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Clear graph</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-sm text-muted-foreground"
                          onClick={() =>
                            setIsChatbotCollapsed((value) => !value)
                          }
                          aria-label={
                            isChatbotCollapsed
                              ? "Expand chatbot panel"
                              : "Collapse chatbot panel"
                          }
                        >
                          {isChatbotCollapsed ? (
                            <PanelRightOpenIcon />
                          ) : (
                            <PanelRightCloseIcon />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {isChatbotCollapsed
                          ? "Expand chatbot panel"
                          : "Collapse chatbot panel"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </Header>
            </div>

            <div className="relative h-full w-full">
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
              <div className="pointer-events-auto absolute bottom-3 right-3 z-20">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={handleResizeStart}
          className={cn(
            "group relative z-20 w-0 overflow-visible transition-opacity",
            isChatbotCollapsed
              ? "pointer-events-none opacity-0"
              : "opacity-100"
          )}
        >
          <span className="absolute inset-y-0 left-0 w-4 -translate-x-1/2 cursor-col-resize bg-transparent" />
          <span className="pointer-events-none absolute inset-y-4 left-0 -translate-x-1/2 border-l border-border/70" />
        </div>

        <div
          className={cn(
            "min-h-0 overflow-hidden transition-[width,opacity,margin]",
            isChatbotCollapsed
              ? "pointer-events-none ml-0 opacity-0"
              : "ml-3 opacity-100"
          )}
        >
          <div className="h-full w-full overflow-hidden rounded-lg border border-border bg-card">
            <WorkflowChatbot
              error={generationError}
              loading={isGeneratingWorkflow}
              onSubmit={handlePromptSubmit}
            />
          </div>
        </div>
      </div>

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
