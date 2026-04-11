"use client";

import {
  memo,
  useCallback,
  useMemo,
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
    onWorkflowReplaced: () => {
      setSelectedNodeId(null);
      setSheetOpen(false);
    },
  });

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
      return submitPrompt(prompt, model, provider, apiKey);
    },
    [submitPrompt]
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
    clearGenerationError();
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
        node={selectedNode}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
        nodes={nodeOptions}
      />
    </div>
  );
}
