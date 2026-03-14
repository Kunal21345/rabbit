"use client";

import { useEffect, useMemo, useState } from "react";

import { Canvas } from "@/components/ai-elements/canvas";
import { Edge as CustomEdge } from "@/components/ai-elements/edge";

import {
  Node as CustomNode,
  NodeHeader,
  NodeTitle,
  NodeDescription,
  NodeContent,
  NodeFooter,
} from "@/components/ai-elements/node";

import { executeRule } from "@/lib/workflow-runtime";
import { Label } from "@/components/ui/label";

/* -------------------------------------------------- */

type WorkflowNode = {
  id: string;
  position: { x: number; y: number };
  type: string;
  data: {
    label: string;
    description: string;
    businessRule: string;
    aiRuleDefinition: string;
    aiTestRules: string;
    comments: string;
    handles: {
      source: boolean;
      target: boolean;
    };
  };
};

type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
};

/* -------------------------------------------------- */

const nodeTypes = {
  workflow: ({
    data,
  }: {
    data: WorkflowNode["data"];
  }) => (
    <CustomNode handles={data.handles}>
      <NodeHeader>
        <NodeTitle>{data.label}</NodeTitle>
        <NodeDescription>{data.description}</NodeDescription>
      </NodeHeader>

      <NodeContent>
        <p className="text-xs">
          {data.businessRule}
        </p>
      </NodeContent>

      <NodeFooter>
        <p className="text-xs">
          Preview Mode
        </p>
      </NodeFooter>
    </CustomNode>
  ),
};

const edgeTypes = {
  animated: CustomEdge.Animated,
  temporary: CustomEdge.Temporary,
};

/* -------------------------------------------------- */

export default function PreviewPage() {
  const [workflow, setWorkflow] =
    useState<{
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
    } | null>(null);

  const [selectedNodeId, setSelectedNodeId] =
    useState<string | null>(null);

  const [payload, setPayload] =
    useState(`{ "income": 50000 }`);

  const [result, setResult] =
    useState<string>("");

  /* -------------------------------------------------- */

  useEffect(() => {
    const saved = localStorage.getItem(
      "workflow-preview"
    );

    if (saved) {
      setWorkflow(JSON.parse(saved));
    }
  }, []);

  /* -------------------------------------------------- */

  const selectedNode = useMemo(() => {
    if (!workflow || !selectedNodeId) return null;

    return workflow.nodes.find(
      (n) => n.id === selectedNodeId
    );
  }, [workflow, selectedNodeId]);

  /* -------------------------------------------------- */

  const runTest = () => {
    if (!selectedNode) return;

    try {
      const parsed = JSON.parse(payload);

      const output = executeRule(
        selectedNode.data.aiRuleDefinition,
        parsed
      );

      setResult(String(output));
    } catch {
      setResult("Invalid payload");
    }
  };

  /* -------------------------------------------------- */

  if (!workflow) {
    return <div className="p-8">No preview available</div>;
  }

  /* -------------------------------------------------- */

  return (
    <div className="grid grid-cols-[2fr_1fr] h-screen">
      {/* Canvas */}

      <div className="border-r">
        <Canvas
          nodes={workflow.nodes}
          edges={workflow.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          onNodeClick={(_, node) =>
            setSelectedNodeId(node.id)
          }
        />
      </div>

      {/* Inspector */}

      <div className="p-6 space-y-6 overflow-y-auto">
        <h1 className="text-lg font-bold">
          Draft Preview
        </h1>

        {selectedNode ? (
          <>
            <div>
              <p className="font-medium">
                {selectedNode.data.label}
              </p>

              <p className="text-sm text-muted-foreground">
                {selectedNode.data.description}
              </p>
            </div>

            <div>
              <Label>Business Logic</Label>
              <pre className="border p-3 rounded">
                {selectedNode.data.businessRule}
              </pre>
            </div>

            <div>
              <Label>Generated Rule</Label>
              <pre className="border p-3 rounded">
                {
                  selectedNode.data
                    .aiRuleDefinition
                }
              </pre>
            </div>

            <div>
              <Label>Generated Test Cases</Label>
              <pre className="border p-3 rounded">
                {selectedNode.data.aiTestRules}
              </pre>
            </div>

            <div>
              <Label>Payload</Label>

              <textarea
                value={payload}
                onChange={(e) =>
                  setPayload(e.target.value)
                }
                className="w-full border rounded p-3 min-h-[120px]"
              />
            </div>

            <button
              onClick={runTest}
              className="px-4 py-2 border rounded"
            >
              Run Test
            </button>

            {result && (
              <div className="border p-3 rounded">
                Result: {result}
              </div>
            )}
          </>
        ) : (
          <p>Select a node to inspect</p>
        )}
      </div>
    </div>
  );
}