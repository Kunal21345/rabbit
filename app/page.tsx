"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Canvas } from "@/components/ai-elements/canvas";
import { Edge as CustomEdge } from "@/components/ai-elements/edge";
import { WorkflowToolbar } from "@/components/workflow-toolbar";
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
import { useWorkflowGeneration } from "@/hooks/useWorkflowGeneration";
import { useWorkflowPersistenceState } from "@/hooks/useWorkflowPersistenceState";
import { useResizableChatbotPanel } from "@/hooks/useResizableChatbotPanel";
import { generateWorkflowNodeDetails } from "@/lib/workflow-client";
import {
  getDefaultWorkflowModel,
  isWorkflowProvider,
  LLM_PROVIDER_STORAGE_KEY,
  type GeneratedWorkflowNodeDetails,
  type WorkflowGenerationModel,
  type WorkflowProvider,
} from "@/lib/workflow-generation";
import { cn } from "@/lib/utils";

/* ====================================================== */

type NodeSheetPayload = {
  id: string;
  label: string;
  description: string;
  details: string;
  suggestions: string;
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
      details: "",
      suggestions: "",
      handles: {
        source: true,
        target: false,
      },
    },
  },
  {
    id: "sample-node-1",
    type: "workflow",
    position: { x: 600, y: -300 },
    data: {
      label: "Sample Node",
      description: "Evaluate the workflow input",
      details: "",
      suggestions: "",
      handles: {
        source: true,
        target: true,
      },
    },
  },
  {
    id: "sample-node-2",
    type: "workflow",
    position: { x: 600, y: 300 },
    data: {
      label: "Sample Node 2",
      description: "Review the next workflow branch",
      details: "",
      suggestions: "",
      handles: {
        source: true,
        target: true,
      },
    },
  },
];

const initialEdges: WorkflowEdge[] = [
  {
    id: "start-sample-node-1",
    source: "start",
    target: "sample-node-1",
  },
  {
    id: "start-sample-node-2",
    source: "start",
    target: "sample-node-2",
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

  for (const edge of edges) {
    const existing = result.get(edge.source);
    if (existing) {
      existing.push(edge);
    } else {
      result.set(edge.source, [edge]);
    }
  }

  return result;
}

function buildIncomingEdgeMap(edges: WorkflowEdge[]) {
  const result = new Map<string, WorkflowEdge[]>();

  for (const edge of edges) {
    const existing = result.get(edge.target);
    if (existing) {
      existing.push(edge);
    } else {
      result.set(edge.target, [edge]);
    }
  }

  return result;
}

function getStoredDetailProvider(): WorkflowProvider {
  if (typeof window === "undefined") {
    return "groq";
  }

  const stored = localStorage.getItem(LLM_PROVIDER_STORAGE_KEY);
  return isWorkflowProvider(stored) ? stored : "groq";
}

function buildWorkflowGoalPrompt(nodes: WorkflowNode[]) {
  const summarizedNodes = nodes
    .map((node) => `${node.data.label}: ${node.data.description}`)
    .join("\n");

  return [
    "Generate practical details for a workflow step within this workflow:",
    summarizedNodes,
  ].join("\n");
}

function buildWorkflowSummary(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const summarizedEdges = edges
    .map((edge) => `${edge.source} -> ${edge.target}`)
    .join(", ");

  return [
    `${nodes.length} steps in the workflow.`,
    summarizedEdges ? `Connections: ${summarizedEdges}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildNodeDetailsCacheKey(input: {
  id: string;
  label: string;
  description: string;
  previousSteps: Array<{ id: string; label: string }>;
  nextSteps: Array<{ id: string; label: string }>;
}) {
  return JSON.stringify({
    id: input.id,
    label: input.label,
    description: input.description,
    previousSteps: [...input.previousSteps].sort((a, b) =>
      a.id.localeCompare(b.id)
    ),
    nextSteps: [...input.nextSteps].sort((a, b) =>
      a.id.localeCompare(b.id)
    ),
  });
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
          <NodeDescription className="line-clamp-2 text-xs leading-relaxed">
            {data.description || "Step description"}
          </NodeDescription>
        </NodeHeader>

        <NodeContent className="grid gap-2">
          <div className="grid gap-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Step Details
            </p>
            <p className="line-clamp-2 text-xs leading-relaxed text-foreground">
              {data.details || "Step details"}
            </p>
          </div>
        </NodeContent>

        <NodeFooter>
          <p className="truncate text-[11px] text-muted-foreground">
            Open step details
          </p>
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

  const [selectedNodeId, setSelectedNodeId] =
    useState<string | null>(null);
  const [sheetOpen, setSheetOpen] =
    useState(false);
  const [autoGenerateNodeDetails, setAutoGenerateNodeDetails] =
    useState(false);
  const [pendingNodeDetailKeys, setPendingNodeDetailKeys] =
    useState<string[]>([]);
  const [nodeDetailErrors, setNodeDetailErrors] =
    useState<Record<string, string>>({});
  const lastWorkflowPromptRef = useRef("");
  const lastWorkflowTitleRef = useRef("Current workflow");
  const lastWorkflowSettingsRef = useRef<{
    model: WorkflowGenerationModel;
    provider: WorkflowProvider;
  } | null>(null);
  const requestedNodeDetailsKeysRef = useRef(new Set<string>());
  const failedNodeDetailsKeysRef = useRef(new Set<string>());
  const unmountedRef = useRef(false);
  const { clearPersistedGraph } = useWorkflowPersistenceState({
    storageKey: STORAGE_KEY,
    nodes,
    edges,
    setNodes,
    setEdges,
  });
  const {
    contentRef,
    effectiveChatbotWidth,
    handleResizeStart,
    isChatbotCollapsed,
    setIsChatbotCollapsed,
  } = useResizableChatbotPanel();
  const {
    generationError,
    isGeneratingWorkflow,
    submitPrompt,
    clearGenerationError,
  } = useWorkflowGeneration({
    nodes,
    edges,
    setNodes,
    setEdges,
    onWorkflowReplaced: (title) => {
      lastWorkflowTitleRef.current = title || "Current workflow";
      setSelectedNodeId(null);
      setSheetOpen(false);
      setAutoGenerateNodeDetails(false);
      setPendingNodeDetailKeys([]);
      setNodeDetailErrors({});
      requestedNodeDetailsKeysRef.current.clear();
      failedNodeDetailsKeysRef.current.clear();
    },
  });

  /* ====================================================== */
  /* Derived */
  /* ====================================================== */

  const edgeMap = useMemo(
    () => buildEdgeMap(edges),
    [edges]
  );

  const incomingEdgeMap = useMemo(
    () => buildIncomingEdgeMap(edges),
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

  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  );

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


  /* ====================================================== */
  /* Selected Node */
  /* ====================================================== */

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;

    const node = nodesById.get(selectedNodeId);

    if (!node) return null;

    const nodeEdges = edgeMap.get(node.id) || [];

    return {
      id: node.id,
      label: node.data.label,
      description: node.data.description,
      details: node.data.details,
      suggestions: node.data.suggestions,
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

  const nodeDetailsPlan = useMemo(() => {
    return nodes.map((node) => {
      const previousSteps = edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => {
          const sourceNode = nodesById.get(edge.source);

          return sourceNode
            ? {
                id: sourceNode.id,
                label: sourceNode.data.label,
              }
            : null;
        })
        .filter(
          (step): step is { id: string; label: string } => Boolean(step)
        );

      const nextSteps = edges
        .filter((edge) => edge.source === node.id)
        .map((edge) => {
          const targetNode = nodesById.get(edge.target);

          return targetNode
            ? {
                id: targetNode.id,
                label: targetNode.data.label,
              }
            : null;
        })
        .filter(
          (step): step is { id: string; label: string } => Boolean(step)
        );

      return {
        node,
        previousSteps,
        nextSteps,
        cacheKey: buildNodeDetailsCacheKey({
          id: node.id,
          label: node.data.label,
          description: node.data.description,
          previousSteps,
          nextSteps,
        }),
        needsDetails:
          Boolean(node.data.description.trim()) &&
          (
            !node.data.details.trim() ||
            !node.data.suggestions.trim()
          ),
      };
    });
  }, [edges, nodes, nodesById]);

  const selectedNodeDetailsKey = useMemo(() => {
    if (!selectedNodeId) {
      return null;
    }

    return (
      nodeDetailsPlan.find((entry) => entry.node.id === selectedNodeId)
        ?.cacheKey || null
    );
  }, [nodeDetailsPlan, selectedNodeId]);

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
        details: data.details,
        suggestions: data.suggestions,
      });
    },
    [updateNode]
  );

  const handlePromptSubmit = useCallback(
    async (
      prompt: string,
      model: WorkflowGenerationModel,
      provider: WorkflowProvider
    ): Promise<WorkflowSubmitResult> => {
      lastWorkflowPromptRef.current = prompt;
      lastWorkflowSettingsRef.current = {
        model,
        provider,
      };
      const result = await submitPrompt(
        prompt,
        model,
        provider
      );

      if (result.ok) {
        setAutoGenerateNodeDetails(true);
      }

      return result;
    },
    [submitPrompt]
  );

  useEffect(() => {
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!autoGenerateNodeDetails) {
      return;
    }

    const pendingEntries = nodeDetailsPlan.filter(
      (entry) =>
        entry.needsDetails &&
        !requestedNodeDetailsKeysRef.current.has(entry.cacheKey) &&
        !failedNodeDetailsKeysRef.current.has(entry.cacheKey)
    );

    if (pendingEntries.length === 0) {
      return;
    }

    pendingEntries.forEach((entry) => {
      requestedNodeDetailsKeysRef.current.add(entry.cacheKey);
    });

    setPendingNodeDetailKeys((current) => [
      ...new Set([
        ...current,
        ...pendingEntries.map((entry) => entry.cacheKey),
      ]),
    ]);

    const workflowSettings =
      lastWorkflowSettingsRef.current || {
        model: getDefaultWorkflowModel(getStoredDetailProvider()),
        provider: getStoredDetailProvider(),
      };
    const workflowPrompt =
      lastWorkflowPromptRef.current || buildWorkflowGoalPrompt(nodes);

    Promise.allSettled(
      pendingEntries.map(async (entry) => {
        const nodeDetails = await generateWorkflowNodeDetails({
          prompt: workflowPrompt,
          model: workflowSettings.model,
          provider: workflowSettings.provider,
          node: {
            id: entry.node.id,
            label: entry.node.data.label,
            description: entry.node.data.description,
          },
          context: {
            workflowTitle: "Current workflow",
            workflowSummary: buildWorkflowSummary(nodes, edges),
            previousSteps: entry.previousSteps,
            nextSteps: entry.nextSteps,
          },
        });

        return {
          cacheKey: entry.cacheKey,
          nodeId: entry.node.id,
          nodeDetails,
        };
      })
    ).then((results) => {
      if (unmountedRef.current) {
        return;
      }

      const successfulDetails = new Map<
        string,
        GeneratedWorkflowNodeDetails
      >();
      const nextErrors: Record<string, string> = {};

      results.forEach((result, index) => {
        const entry = pendingEntries[index];

        if (result.status === "fulfilled") {
          failedNodeDetailsKeysRef.current.delete(entry.cacheKey);
          successfulDetails.set(
            result.value.nodeId,
            result.value.nodeDetails
          );
          delete nextErrors[entry.cacheKey];
          return;
        }

        requestedNodeDetailsKeysRef.current.delete(entry.cacheKey);
        failedNodeDetailsKeysRef.current.add(entry.cacheKey);
        nextErrors[entry.cacheKey] =
          result.reason instanceof Error
            ? result.reason.message
            : "Failed to generate workflow node details.";
      });

      if (successfulDetails.size > 0) {
        setNodes((currentNodes) =>
          currentNodes.map((node) => {
            const nodeDetails = successfulDetails.get(node.id);

            if (!nodeDetails) {
              return node;
            }

            return {
              ...node,
              data: {
                ...node.data,
                description:
                  nodeDetails.description.trim() ||
                  node.data.description,
                details: nodeDetails.details.trim(),
                suggestions: nodeDetails.suggestions.trim(),
              },
            };
          })
        );
      }

      setNodeDetailErrors((current) => {
        const merged = { ...current };

        pendingEntries.forEach((entry) => {
          if (!(entry.cacheKey in nextErrors)) {
            delete merged[entry.cacheKey];
          }
        });

        return {
          ...merged,
          ...nextErrors,
        };
      });

      setPendingNodeDetailKeys((current) =>
        current.filter(
          (key) =>
            !pendingEntries.some((entry) => entry.cacheKey === key)
        )
      );
    });
  }, [
    autoGenerateNodeDetails,
    edges,
    nodes,
    nodeDetailsPlan,
    setNodes,
  ]);

  /* ====================================================== */
  /* Render */
  /* ====================================================== */
  /* ====================clear graph================================== */
  const handleClearGraph = useCallback(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setSelectedNodeId(null);
    setSheetOpen(false);
    setAutoGenerateNodeDetails(false);
    clearGenerationError();
    setPendingNodeDetailKeys([]);
    setNodeDetailErrors({});
    lastWorkflowPromptRef.current = "";
    lastWorkflowSettingsRef.current = null;
    requestedNodeDetailsKeysRef.current.clear();
    failedNodeDetailsKeysRef.current.clear();
    clearPersistedGraph();
  }, [clearGenerationError, clearPersistedGraph, setEdges, setNodes]);

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
              <WorkflowToolbar
                isChatbotCollapsed={isChatbotCollapsed}
                onAddNode={() => addNode()}
                onClearGraph={handleClearGraph}
                onToggleChatbot={() =>
                  setIsChatbotCollapsed((value) => !value)
                }
              />
            </div>

            <div className="relative h-full w-full">
              <Canvas
                nodes={canvasNodes}
                edges={edges}
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
          onPointerDown={(event) => handleResizeStart(event.clientX)}
          className={cn(
            "group relative z-20 w-0 overflow-visible transition-opacity",
            isChatbotCollapsed
              ? "pointer-events-none opacity-0"
              : "opacity-100"
          )}
        >
          <span className="absolute inset-y-0 left-0 w-4 -translate-x-1/2 cursor-col-resize bg-transparent" />
          <span className="pointer-events-none absolute inset-y-4 left-0 -translate-x-1/2s" />
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
        key={selectedNode?.id || "empty-node-sheet"}
        node={selectedNode}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        detailsLoading={
          selectedNodeDetailsKey
            ? pendingNodeDetailKeys.includes(selectedNodeDetailsKey)
            : false
        }
        detailsError={
          selectedNodeDetailsKey
            ? nodeDetailErrors[selectedNodeDetailsKey] || null
            : null
        }
        nodes={nodeOptions}
      />
    </div>
  );
}
