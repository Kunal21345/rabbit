"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import {
  Connection,
  EdgeChange,
  applyEdgeChanges,
} from "@xyflow/react";

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

const STORAGE_KEY = "workflow-graph-v14";

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
];

const initialEdges: WorkflowEdge[] = [];

/* ====================================================== */
/* Helpers */
/* ====================================================== */

function buildEdgeMap(edges: WorkflowEdge[]) {
  const grouped = new Map<string, WorkflowEdge[]>();

  edges.forEach((edge) => {
    const list = grouped.get(edge.source) || [];
    list.push(edge);
    grouped.set(edge.source, list);
  });

  const result = new Map<string, EdgeBucket>();

  grouped.forEach((list, source) => {
    result.set(source, {
      yes: list[0],
      no: list[1],
    });
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

function createPlaceholderNode(
  node: WorkflowNode,
  branch: "yes" | "no"
): WorkflowNode {
  return {
    id: `${node.id}-${branch}-ghost`,
    type: "workflow",
    position: {
      x: node.position.x + 220,
      y:
        branch === "yes"
          ? node.position.y - 60
          : node.position.y + 60,
    },
    data: {
      label: "",
      description: "",
      businessRule: "",
      aiRuleDefinition: "",
      aiTestRules: "",
      comments: "",
      hidden: true,
      handles: {
        source: false,
        target: true,
      },
    },
  };
}

function createPlaceholderEdge(
  node: WorkflowNode,
  branch: "yes" | "no"
): WorkflowEdge {
  return {
    id: `${node.id}-${branch}-placeholder`,
    source: node.id,
    target: `${node.id}-${branch}-ghost`,
    type: "temporary",
  };
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
    onNodesChange,
    addNode,
    updateNode,
    connectEdge,
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

  const canvasEdges = useMemo(() => {
    const virtual: WorkflowEdge[] = [];

    nodes.forEach((node) => edges, [edges]);

    return [...edges, ...virtual];
  }, [nodes, edges, edgeMap]);

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

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) =>
        applyEdgeChanges(
          changes,
          prev
        ) as WorkflowEdge[]
      );
    },
    [setEdges]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      connectEdge(connection);
    },
    [connectEdge]
  );

  const handleNodeClick = useCallback(
    (_: MouseEvent, node: WorkflowNode) => {
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
      <div className="absolute top-4 left-4 z-10 flex gap-3">
        <button
          onClick={addNode}
          className="px-4 py-2 bg-black text-white rounded"
        >
          + Add Node
        </button>

        <button
          onClick={handlePreview}
          className="px-4 py-2 border rounded"
        >
          Preview
        </button>

        <ThemeToggle />
      </div>

      <Canvas
        nodes={canvasNodes}
        edges={canvasEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
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
