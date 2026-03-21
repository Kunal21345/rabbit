"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { Header } from "@/components/header";
import { Canvas } from "@/components/ai-elements/canvas";
import { Edge as CustomEdge } from "@/components/ai-elements/edge";

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
import { previewWorkflow } from "@/lib/workflow-preview";

/* ====================================================== */

type NodeSheetPayload = {
  id: string;
  label: string;
  description: string;
  businessRule: string;
  aiRuleDefinition: string;
  aiTestRules: string;
  comments: string;
  yesCondition: string;
  yesNextNodeId: string;
  noCondition: string;
  noNextNodeId: string;
};

type EdgeBucket = {
  yes?: WorkflowEdge;
  no?: WorkflowEdge;
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
    id: "review",
    type: "workflow",
    position: { x: 600, y: -300 },
    data: {
      label: "Review",
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
    id: "end",
    type: "workflow",
    position: { x: 600, y: 300 },
    data: {
      label: "End",
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
    id: "start-review",
    source: "start",
    target: "review",
    label: "YES",
    type: "animated",
  },
  {
    id: "start-end",
    source: "start",
    target: "end",
    label: "NO",
    type: "temporary",
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
  const result = new Map<string, EdgeBucket>();

  edges.forEach((edge) => {
    const bucket = result.get(edge.source) || {};

    if (edge.label === "NO") {
      bucket.no = edge;
    } else {
      bucket.yes = edge;
    }

    result.set(edge.source, bucket);
  });

  return result;
}

function createEdge(
  source: string,
  target: string,
  label: string
): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    label,
    type: label === "YES" ? "animated" : "temporary",
  };
}

function replaceEdge(
  edges: WorkflowEdge[],
  source: string,
  index: 0 | 1,
  target: string,
  label: string
): WorkflowEdge[] {
  const sourceEdges = edges.filter(
    (e) => e.source === source
  );

  const otherEdges = edges.filter(
    (e) => e.source !== source
  );

  sourceEdges[index] = target
    ? createEdge(source, target, label)
    : undefined!;

  return [
    ...otherEdges,
    ...sourceEdges.filter(Boolean),
  ];
}

/* ====================================================== */
/* Node Renderer */
/* ====================================================== */

const WorkflowNodeRenderer = memo(
  function WorkflowNodeRenderer({
    data,
  }: {
    data: WorkflowNodeData & {
      edge?: EdgeBucket;
      nodeLabelMap?: Map<string, string>;
      hidden?: boolean;
    };
  }) {
    if (data.hidden) return null;

    return (
      <CustomNode handles={data.handles}>
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
            <p>
              YES →{" "}
              {data.edge?.yes?.target
                ? data.nodeLabelMap?.get(
                    data.edge.yes.target
                  )
                : "pending"}
            </p>

            <p>
              NO →{" "}
              {data.edge?.no?.target
                ? data.nodeLabelMap?.get(
                    data.edge.no.target
                  )
                : "pending"}
            </p>
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
  animated: CustomEdge.Animated,
  temporary: CustomEdge.Temporary,
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
    updateNode,
  } = useWorkflowGraph(initialNodes, initialEdges);

  const [hydrated, setHydrated] = useState(false);
  const [selectedNodeId, setSelectedNodeId] =
    useState<string | null>(null);
  const [sheetOpen, setSheetOpen] =
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
        edge: edgeMap.get(node.id),
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

    const edge = edgeMap.get(node.id) || {};

    return {
      id: node.id,
      label: node.data.label,
      description: node.data.description,
      businessRule: node.data.businessRule,
      aiRuleDefinition:
        node.data.aiRuleDefinition,
      aiTestRules: node.data.aiTestRules,
      comments: node.data.comments,
      yesCondition: "YES",
      yesNextNodeId: edge.yes?.target || "",
      noCondition: "NO",
      noNextNodeId: edge.no?.target || "",
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

      setEdges((prev) => {
        let next = replaceEdge(
          prev,
          data.id,
          0,
          data.yesNextNodeId,
          "YES"
        );

        next = replaceEdge(
          next,
          data.id,
          1,
          data.noNextNodeId,
          "NO"
        );

        return next;
      });
    },
    [updateNode, setEdges]
  );

  /* ====================================================== */
  /* Preview */
  /* ====================================================== */

  const handlePreview = useCallback(() => {
    previewWorkflow(nodes, edges);

    window.open("/preview", "_blank");
  }, [nodes, edges]);

  /* ====================================================== */
  /* Render */
  /* ====================================================== */

  return (
    <div className="w-full h-screen relative">
      <Header>
        <button onClick={handlePreview} className="px-4 py-2 border rounded">
          Preview
        </button>
        <button onClick={addNode} className="px-4 py-2 border rounded">
          Add Node
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
        fitView
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
