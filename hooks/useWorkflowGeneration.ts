"use client";

import { useCallback, useRef, useState } from "react";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/hooks/useWorkflowGraph";
import { generateWorkflowGraph, type WorkflowSubmitResult } from "@/lib/workflow-client";
import type {
  WorkflowGenerationModel,
  WorkflowProvider,
} from "@/lib/workflow-generation";

type UseWorkflowGenerationArgs = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  setNodes: React.Dispatch<React.SetStateAction<WorkflowNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<WorkflowEdge[]>>;
  onWorkflowReplaced?: () => void;
};

export function useWorkflowGeneration({
  nodes,
  edges,
  setNodes,
  setEdges,
  onWorkflowReplaced,
}: UseWorkflowGenerationArgs) {
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  nodesRef.current = nodes;
  edgesRef.current = edges;

  const submitPrompt = useCallback(
    async (
      prompt: string,
      model: WorkflowGenerationModel,
      provider: WorkflowProvider,
      apiKey?: string
    ): Promise<WorkflowSubmitResult> => {
      setGenerationError(null);
      setIsGeneratingWorkflow(true);

      try {
        const graph = await generateWorkflowGraph({
          prompt,
          model,
          provider,
          apiKey,
          currentGraph: {
            nodes: nodesRef.current.map((node) => ({
              id: node.id,
              label: node.data.label,
              description: node.data.description,
              businessRule: node.data.businessRule,
            })),
            edges: edgesRef.current.map((edge) => ({
              source: edge.source,
              target: edge.target,
            })),
          },
        });

        setNodes(graph.nodes);
        setEdges(graph.edges);
        onWorkflowReplaced?.();

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

        setGenerationError(errorMessage);

        return {
          ok: false,
          message: `I could not update the workflow: ${errorMessage}`,
        };
      } finally {
        setIsGeneratingWorkflow(false);
      }
    },
    [onWorkflowReplaced, setEdges, setNodes]
  );

  return {
    generationError,
    isGeneratingWorkflow,
    submitPrompt,
    clearGenerationError: () => setGenerationError(null),
  };
}
