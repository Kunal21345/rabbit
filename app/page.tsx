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
import { Badge } from "@/components/ui/badge";

import {
  Node as CustomNode,
  NodeContent,
  NodeDescription,
 // NodeFooter,
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
  llmResponse?: string;
  reasoning?: string;
  warnings?: string[];
  model?: string;
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

type WorkflowCategory =
  | "entry"
  | "integration"
  | "processing"
  | "decision"
  | "validation"
  | "review"
  | "delivery"
  | "operations";

const WORKFLOW_CATEGORY_ORDER: WorkflowCategory[] = [
  "entry",
  "integration",
  "processing",
  "decision",
  "validation",
  "review",
  "delivery",
  "operations",
];

const WORKFLOW_CATEGORY_META: Record<
  WorkflowCategory,
  {
    label: string;
    badgeClassName: string;
    cardClassName: string;
    headerClassName: string;
    accentClassName: string;
    legendClassName: string;
  }
> = {
  entry: {
    label: "Entry",
    badgeClassName:
      "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/60 dark:text-sky-200",
    cardClassName:
      "border-sky-200/80 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/20",
    headerClassName:
      "border-sky-200/80 bg-linear-to-r from-sky-100 to-cyan-50 dark:border-sky-900/50 dark:from-sky-950/70 dark:to-cyan-950/40",
    accentClassName: "bg-sky-500",
    legendClassName: "bg-sky-500",
  },
  integration: {
    label: "Integration",
    badgeClassName:
      "border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950/60 dark:text-violet-200",
    cardClassName:
      "border-violet-200/80 bg-violet-50/70 dark:border-violet-900/50 dark:bg-violet-950/20",
    headerClassName:
      "border-violet-200/80 bg-linear-to-r from-violet-100 to-fuchsia-50 dark:border-violet-900/50 dark:from-violet-950/70 dark:to-fuchsia-950/40",
    accentClassName: "bg-violet-500",
    legendClassName: "bg-violet-500",
  },
  processing: {
    label: "Processing",
    badgeClassName:
      "border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/60 dark:text-blue-200",
    cardClassName:
      "border-blue-200/80 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/20",
    headerClassName:
      "border-blue-200/80 bg-linear-to-r from-blue-100 to-indigo-50 dark:border-blue-900/50 dark:from-blue-950/70 dark:to-indigo-950/40",
    accentClassName: "bg-blue-500",
    legendClassName: "bg-blue-500",
  },
  decision: {
    label: "Decision",
    badgeClassName:
      "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/60 dark:text-amber-200",
    cardClassName:
      "border-amber-200/80 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20",
    headerClassName:
      "border-amber-200/80 bg-linear-to-r from-amber-100 to-yellow-50 dark:border-amber-900/50 dark:from-amber-950/70 dark:to-yellow-950/40",
    accentClassName: "bg-amber-500",
    legendClassName: "bg-amber-500",
  },
  validation: {
    label: "Validation",
    badgeClassName:
      "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-200",
    cardClassName:
      "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20",
    headerClassName:
      "border-emerald-200/80 bg-linear-to-r from-emerald-100 to-teal-50 dark:border-emerald-900/50 dark:from-emerald-950/70 dark:to-teal-950/40",
    accentClassName: "bg-emerald-500",
    legendClassName: "bg-emerald-500",
  },
  review: {
    label: "Review",
    badgeClassName:
      "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-200",
    cardClassName:
      "border-rose-200/80 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20",
    headerClassName:
      "border-rose-200/80 bg-linear-to-r from-rose-100 to-pink-50 dark:border-rose-900/50 dark:from-rose-950/70 dark:to-pink-950/40",
    accentClassName: "bg-rose-500",
    legendClassName: "bg-rose-500",
  },
  delivery: {
    label: "Delivery",
    badgeClassName:
      "border-lime-200 bg-lime-100 text-lime-900 dark:border-lime-900/60 dark:bg-lime-950/60 dark:text-lime-200",
    cardClassName:
      "border-lime-200/80 bg-lime-50/70 dark:border-lime-900/50 dark:bg-lime-950/20",
    headerClassName:
      "border-lime-200/80 bg-linear-to-r from-lime-100 to-green-50 dark:border-lime-900/50 dark:from-lime-950/70 dark:to-green-950/40",
    accentClassName: "bg-lime-500",
    legendClassName: "bg-lime-500",
  },
  operations: {
    label: "Operations",
    badgeClassName:
      "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200",
    cardClassName:
      "border-slate-200/80 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/20",
    headerClassName:
      "border-slate-200/80 bg-linear-to-r from-slate-100 to-zinc-50 dark:border-slate-800 dark:from-slate-950/70 dark:to-zinc-950/40",
    accentClassName: "bg-slate-500",
    legendClassName: "bg-slate-500",
  },
};

function inferWorkflowCategory(input: {
  id: string;
  label: string;
  description: string;
  incomingCount: number;
  outgoingCount: number;
}): WorkflowCategory {
  const text = `${input.id} ${input.label} ${input.description}`.toLowerCase();

  if (
    text.includes("start") ||
    text.includes("intake") ||
    text.includes("request") ||
    text.includes("collect") ||
    input.incomingCount === 0
  ) {
    return "entry";
  }

  if (
    text.includes("api") ||
    text.includes("import") ||
    text.includes("export") ||
    text.includes("sync") ||
    text.includes("connect") ||
    text.includes("webhook") ||
    text.includes("fetch")
  ) {
    return "integration";
  }

  if (
    text.includes("decision") ||
    text.includes("approve") ||
    text.includes("reject") ||
    text.includes("branch") ||
    text.includes("route") ||
    text.includes("if ") ||
    input.outgoingCount > 1
  ) {
    return "decision";
  }

  if (
    text.includes("validate") ||
    text.includes("check") ||
    text.includes("verify") ||
    text.includes("qa") ||
    text.includes("test") ||
    text.includes("audit")
  ) {
    return "validation";
  }

  if (
    text.includes("review") ||
    text.includes("assess") ||
    text.includes("analyze") ||
    text.includes("inspect") ||
    text.includes("triage")
  ) {
    return "review";
  }

  if (
    text.includes("deploy") ||
    text.includes("publish") ||
    text.includes("release") ||
    text.includes("handoff") ||
    text.includes("deliver") ||
    text.includes("complete") ||
    text.includes("finish") ||
    text.includes("end")
  ) {
    return "delivery";
  }

  if (
    text.includes("monitor") ||
    text.includes("alert") ||
    text.includes("support") ||
    text.includes("operate") ||
    text.includes("maintain") ||
    text.includes("observe")
  ) {
    return "operations";
  }

  return "processing";
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
      hidden?: boolean;
    };
    selected?: boolean;
  }) {
    if (data.hidden) return null;

    const category =
      WORKFLOW_CATEGORY_META[
        (data.category as WorkflowCategory | undefined) || "processing"
      ];

    return (
      <CustomNode
        handles={data.handles}
        selected={selected}
        className={cn(
          "shadow-[0_18px_50px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xs",
          category.cardClassName
        )}
      >
        <NodeHeader className={cn("relative", category.headerClassName)}>
          <span
            className={cn(
              "absolute inset-y-0 left-0 w-1.5",
              category.accentClassName
            )}
          />
          <div className="ml-3 grid gap-2">
            <Badge
              variant="outline"
              className={cn("rounded-md px-2 py-1 text-[10px]", category.badgeClassName)}
            >
              {data.categoryLabel || category.label}
            </Badge>
            <NodeTitle>{data.label}</NodeTitle>
          </div>
          <NodeDescription className="line-clamp-2 px-3 text-xs leading-relaxed">
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

        {/* <NodeFooter>
          <p className="truncate text-[11px] text-muted-foreground">
            Open step details
          </p>
        </NodeFooter> */}
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
    moveNodes,
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
  const [canvasResetKey, setCanvasResetKey] =
    useState(0);
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

  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  );

  const categorizedNodes = useMemo(() => {
    const incomingCount = new Map<string, number>();
    const outgoingCount = new Map<string, number>();

    edges.forEach((edge) => {
      incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
      outgoingCount.set(edge.source, (outgoingCount.get(edge.source) || 0) + 1);
    });

    return nodes.map((node) => {
      const category = inferWorkflowCategory({
        id: node.id,
        label: node.data.label,
        description: node.data.description,
        incomingCount: incomingCount.get(node.id) || 0,
        outgoingCount: outgoingCount.get(node.id) || 0,
      });

      return {
        ...node,
        data: {
          ...node.data,
          category,
          categoryLabel: WORKFLOW_CATEGORY_META[category].label,
          categoryTone: WORKFLOW_CATEGORY_META[category].accentClassName,
        },
      };
    });
  }, [edges, nodes]);

  const categoryLegend = useMemo(() => {
    const counts = new Map<WorkflowCategory, number>();

    categorizedNodes.forEach((node) => {
      const category = (node.data.category as WorkflowCategory | undefined) || "processing";
      counts.set(category, (counts.get(category) || 0) + 1);
    });

    return WORKFLOW_CATEGORY_ORDER
      .filter((category) => counts.has(category))
      .map((category) => ({
        category,
        label: WORKFLOW_CATEGORY_META[category].label,
        count: counts.get(category) || 0,
        tone: WORKFLOW_CATEGORY_META[category].legendClassName,
      }));
  }, [categorizedNodes]);


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
  }, [edgeMap, nodesById, selectedNodeId]);

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
      const previousSteps = (incomingEdgeMap.get(node.id) || [])
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

      const nextSteps = (edgeMap.get(node.id) || [])
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
  }, [edgeMap, incomingEdgeMap, nodes, nodesById]);

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

    const DETAILS_BATCH_CONCURRENCY =
      workflowSettings.provider === "groq" ? 1 : 2;
    const workflowSummary = buildWorkflowSummary(nodes, edges);
    const runNodeDetailsBatch = async () => {
      const results: PromiseSettledResult<{
        cacheKey: string;
        nodeId: string;
        nodeDetails: GeneratedWorkflowNodeDetails;
      }>[] = [];

      for (
        let index = 0;
        index < pendingEntries.length;
        index += DETAILS_BATCH_CONCURRENCY
      ) {
        const batch = pendingEntries.slice(
          index,
          index + DETAILS_BATCH_CONCURRENCY
        );

        const batchResults = await Promise.allSettled(
          batch.map(async (entry) => {
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
                workflowSummary,
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
        );

        results.push(...batchResults);
      }

      return results;
    };

    runNodeDetailsBatch().then((results) => {
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
    setCanvasResetKey((current) => current + 1);
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
                nodes={categorizedNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesPositionChange={moveNodes}
                onNodeClick={handleNodeClick}
                onDeleteNodes={handleDeleteNodes}
                onDeleteEdge={handleDeleteEdge}
                onConnect={connectEdge}
                onReconnectEdgeTarget={updateEdgeTarget}
                fitView
                resetViewKey={canvasResetKey}
              />
              {categoryLegend.length > 0 ? (
                <div className="pointer-events-none absolute left-3 bottom-3 z-20 max-w-[min(32rem,calc(100%-5rem))] rounded-xl border border-border/70 bg-background/90 p-3 shadow-lg backdrop-blur-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Workflow Domains
                    </p>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {categoryLegend.map((item) => (
                      <div
                        key={item.category}
                        className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs text-foreground"
                      >
                        <span className={cn("h-2.5 w-2.5 rounded-full", item.tone)} />
                        <span className="font-medium">{item.label}</span>
                        <span className="text-muted-foreground">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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
