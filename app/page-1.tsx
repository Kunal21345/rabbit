"use client";

import { useCallback, useRef, useState } from "react";
import { applyNodeChanges, type NodeChange } from "@xyflow/react";
import { Canvas } from "@/components/ai-elements/canvas";
import { Edge } from "@/components/ai-elements/edge";
import {
  Node,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from "@/components/ai-elements/node";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeStatus = "idle" | "running" | "success" | "error" | "warning";

interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  handles: { target: boolean; source: boolean };
  status?: NodeStatus;
  badge?: string;
  metric?: string;
}

interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  NodeStatus,
  { label: string; color: string; dot: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  idle:    { label: "Idle",    color: "#94a3b8", dot: "#94a3b8", variant: "secondary"   },
  running: { label: "Running", color: "#38bdf8", dot: "#38bdf8", variant: "default"     },
  success: { label: "Success", color: "#4ade80", dot: "#4ade80", variant: "default"     },
  error:   { label: "Error",   color: "#f87171", dot: "#f87171", variant: "destructive" },
  warning: { label: "Warning", color: "#fbbf24", dot: "#fbbf24", variant: "outline"     },
};

const NODE_ICONS: Record<string, string> = {
  Start:            "▶",
  "Process Data":   "⚙",
  "Decision Point": "◆",
  "Success Path":   "✓",
  "Error Path":     "✕",
  Complete:         "■",
};

// ─── Stable IDs (no nanoid at module scope — avoids SSR/client mismatch) ──────

const NODE_IDS = {
  start:    "node-start",
  process1: "node-process1",
  decision: "node-decision",
  output1:  "node-output1",
  output2:  "node-output2",
  process2: "node-process2",
} as const;

// ─── Initial Data ─────────────────────────────────────────────────────────────

const INITIAL_NODES: WorkflowNode[] = [
  {
    id: NODE_IDS.start,
    type: "workflow",
    position: { x: 0, y: 0 },
    data: { label: "Start",          description: "Initialize workflow",        handles: { source: true,  target: false }, status: "success", badge: "Entry",       metric: "~0ms"        },
  },
  {
    id: NODE_IDS.process1,
    type: "workflow",
    position: { x: 500, y: 0 },
    data: { label: "Process Data",   description: "Transform & validate input", handles: { source: true,  target: true  }, status: "running", badge: "Transform",   metric: "12ms avg"    },
  },
  {
    id: NODE_IDS.decision,
    type: "workflow",
    position: { x: 1000, y: 0 },
    data: { label: "Decision Point", description: "Route based on conditions",  handles: { source: true,  target: true  }, status: "warning", badge: "Branch",      metric: "2 routes"    },
  },
  {
    id: NODE_IDS.output1,
    type: "workflow",
    position: { x: 1500, y: -160 },
    data: { label: "Success Path",   description: "Handle validated cases",     handles: { source: true,  target: true  }, status: "success", badge: "Happy Path",  metric: "87% traffic" },
  },
  {
    id: NODE_IDS.output2,
    type: "workflow",
    position: { x: 1500, y: 160 },
    data: { label: "Error Path",     description: "Handle failure cases",       handles: { source: true,  target: true  }, status: "error",   badge: "Fallback",    metric: "13% traffic" },
  },
  {
    id: NODE_IDS.process2,
    type: "workflow",
    position: { x: 2000, y: 0 },
    data: { label: "Complete",       description: "Finalize & emit results",    handles: { source: false, target: true  }, status: "idle",    badge: "Exit",        metric: "~2ms"        },
  },
];

const INITIAL_EDGES: WorkflowEdge[] = [
  { id: "edge-1", source: NODE_IDS.start,    target: NODE_IDS.process1, type: "animated"  },
  { id: "edge-2", source: NODE_IDS.process1, target: NODE_IDS.decision, type: "animated"  },
  { id: "edge-3", source: NODE_IDS.decision, target: NODE_IDS.output1,  type: "animated"  },
  { id: "edge-4", source: NODE_IDS.decision, target: NODE_IDS.output2,  type: "temporary" },
  { id: "edge-5", source: NODE_IDS.output1,  target: NODE_IDS.process2, type: "animated"  },
  { id: "edge-6", source: NODE_IDS.output2,  target: NODE_IDS.process2, type: "temporary" },
];

const cloneNodes = (): WorkflowNode[] => INITIAL_NODES.map((n) => ({ ...n, data: { ...n.data } }));
const cloneEdges = (): WorkflowEdge[] => INITIAL_EDGES.map((e) => ({ ...e }));

// Incremented only on client — never at module init — so no SSR mismatch
let customNodeCounter = 0;

// ─── Stable type maps (outside component to avoid re-creation on each render) ─

const EDGE_TYPES = { animated: Edge.Animated, temporary: Edge.Temporary };

// ─── Workflow Node Component ───────────────────────────────────────────────────

const WorkflowNodeComponent = ({
  data,
}: {
  data: WorkflowNodeData;
  selected?: boolean;
}) => {
  const status  = (data.status  as NodeStatus) ?? "idle";
  const cfg     = STATUS_CONFIG[status];
  const icon    = NODE_ICONS[data.label as string] ?? "●";
  const label   = data.label       as string;
  const desc    = data.description as string;
  const badge   = data.badge       as string | undefined;
  const metric  = data.metric      as string | undefined;
  const handles = data.handles     as { target: boolean; source: boolean };

  return (
    <Node handles={handles}>
      <NodeHeader>
        <div className="flex items-center gap-2.5">
          <span style={{ color: cfg.color, fontSize: 15, lineHeight: 1 }}>{icon}</span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <NodeTitle>{label}</NodeTitle>
            <NodeDescription>{desc}</NodeDescription>
          </div>
        </div>
      </NodeHeader>

      <NodeContent>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: cfg.dot,
                display: "inline-block",
                flexShrink: 0,
                boxShadow: status === "running" ? `0 0 6px ${cfg.dot}` : "none",
                animation: status === "running" ? "statusPulse 1.4s ease-in-out infinite" : "none",
              }}
            />
            <span style={{ color: cfg.color, fontSize: 11, fontWeight: 500 }}>
              {cfg.label}
            </span>
          </div>
          {metric && (
            <span className="text-[10px] text-muted-foreground tabular-nums">{metric}</span>
          )}
        </div>
      </NodeContent>

      <Separator />

      <NodeFooter>
        <div className="flex items-center w-full">
          {badge && (
            <Badge
              variant={cfg.variant}
              className="text-[9px] px-1.5 py-0 h-4 uppercase tracking-widest"
            >
              {badge}
            </Badge>
          )}
        </div>
      </NodeFooter>
    </Node>
  );
};

// Must be defined after WorkflowNodeComponent (no forward-ref issues)
const NODE_TYPES = { workflow: WorkflowNodeComponent };

// ─── Toolbar ──────────────────────────────────────────────────────────────────

const Toolbar = ({
  onAddNode,
  onRunAll,
  onReset,
  nodeCount,
  isRunning,
}: {
  onAddNode: () => void;
  onRunAll: () => void;
  onReset: () => void;
  nodeCount: number;
  isRunning: boolean;
}) => (
  <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-black/80 backdrop-blur-md shadow-2xl">
    <Button variant="ghost" size="sm" onClick={onReset} className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground">
      ↺ Reset
    </Button>
    <Separator orientation="vertical" className="h-4" />
    <Button variant="ghost" size="sm" onClick={onAddNode} className="h-7 px-3 text-xs">
      + Add Node
    </Button>
    <Button
      variant={isRunning ? "destructive" : "default"}
      size="sm"
      onClick={onRunAll}
      className="h-7 px-3 text-xs"
    >
      {isRunning ? "■ Stop" : "▶ Simulate"}
    </Button>
    <Separator orientation="vertical" className="h-4" />
    <span className="text-[10px] text-muted-foreground tabular-nums">
      {nodeCount} nodes
    </span>
  </div>
);

// ─── Legends ───────────────────────────────────────────────────────────────────

const Legend = () => (
  <div className="absolute bottom-5 left-5 z-50 rounded-xl border border-white/10 bg-black/80 backdrop-blur-md px-4 py-3 shadow-xl">
    <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
      Status
    </p>
    <div className="flex flex-col gap-1.5">
      {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-2">
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: cfg.dot,
              flexShrink: 0,
              display: "inline-block",
            }}
          />
          <span className="text-[10px] text-muted-foreground">{cfg.label}</span>
        </div>
      ))}
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProcessFlowPage() {
  const [liveNodes, setLiveNodes] = useState<WorkflowNode[]>(cloneNodes);
  const [liveEdges, setLiveEdges] = useState<WorkflowEdge[]>(cloneEdges);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleRunAll = useCallback(() => {
    if (isRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setIsRunning(false);
      return;
    }

    setIsRunning(true);
    let step = 0;

    const statusSequences: NodeStatus[][] = [
      ["running", "idle",    "idle",    "idle",    "idle",    "idle"   ],
      ["success", "running", "idle",    "idle",    "idle",    "idle"   ],
      ["success", "success", "running", "idle",    "idle",    "idle"   ],
      ["success", "success", "warning", "running", "running", "idle"   ],
      ["success", "success", "warning", "success", "error",   "running"],
      ["success", "success", "warning", "success", "error",   "success"],
    ];

    timerRef.current = setInterval(() => {
      if (step >= statusSequences.length) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setIsRunning(false);
        return;
      }
      const statuses = statusSequences[step];
      setLiveNodes((prev) =>
        prev.map((n, i) => ({
          ...n,
          data: { ...n.data, status: statuses[i] ?? n.data.status },
        }))
      );
      step++;
    }, 900);
  }, [isRunning]);

  const handleAddNode = useCallback(() => {
    customNodeCounter += 1;
    const newNode: WorkflowNode = {
      id: `node-custom-${customNodeCounter}`,
      type: "workflow",
      position: {
        x: 300 + ((customNodeCounter * 280) % 1400),
        y: -160 + ((customNodeCounter * 160) % 320),
      },
      data: {
        label: "New Step",
        description: "Custom process node",
        handles: { source: true, target: true },
        status: "idle",
        badge: "Custom",
        metric: "—",
      },
    };
    setLiveNodes((prev) => [...prev, newNode]);
  }, []);

  const handleReset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    customNodeCounter = 0;
    setIsRunning(false);
    setLiveNodes(cloneNodes());
    setLiveEdges(cloneEdges());
  }, []);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setLiveNodes((nds) => applyNodeChanges(changes, nds) as WorkflowNode[]),
    []
  );

  return (
    <div className="dark w-screen h-screen bg-zinc-950 relative overflow-hidden">
      {/* Title */}
      <div className="absolute top-5 left-5 z-50">
        <p className="text-[11px] font-bold tracking-[0.15em] uppercase text-sky-400">
          ◆ Process Flow
        </p>
        <p className="text-[9px] tracking-widest text-zinc-600">
          Visual Workflow Designer
        </p>
      </div>

      <Toolbar
        onAddNode={handleAddNode}
        onRunAll={handleRunAll}
        onReset={handleReset}
        nodeCount={liveNodes.length}
        isRunning={isRunning}
      />

      <Legend />

      <Canvas
        colorMode="dark"
        edges={liveEdges}
        edgeTypes={EDGE_TYPES}
        fitView
        nodes={liveNodes}
        nodeTypes={NODE_TYPES}
        onNodesChange={handleNodesChange}
        style={{ background: "hsl(0 0% 0%)" }}
      />

      <style>{`
        @keyframes statusPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(1.8); }
        }

        .react-flow__background {
          background-color: #000000 !important;
        }
        .react-flow__background pattern > * {
          stroke: #27272a !important;
          fill: #27272a !important;
        }
      `}</style>
    </div>
  );
}