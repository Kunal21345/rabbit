import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/hooks/useWorkflowGraph";
import type {
  GeneratedWorkflowNodeDetails,
  WorkflowGraphContext,
  WorkflowNodeDetailsRequest,
  WorkflowGenerationModel,
  WorkflowProvider,
} from "@/lib/workflow-generation";

export type WorkflowSubmitResult = {
  ok: boolean;
  message: string;
};

export type WorkflowGraphPayload = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export async function generateWorkflowGraph(input: {
  prompt: string;
  model: WorkflowGenerationModel;
  provider: WorkflowProvider;
  apiKey?: string;
  currentGraph: WorkflowGraphContext;
}): Promise<WorkflowGraphPayload> {
  const response = await fetch("/api/workflow/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
        details?: string;
        graph?: WorkflowGraphPayload;
      }
    | null;

  if (!response.ok || !payload?.graph) {
    throw new Error(
      payload?.details ||
        payload?.error ||
        "Failed to generate workflow."
    );
  }

  return payload.graph;
}

export async function generateWorkflowNodeDetails(
  input: WorkflowNodeDetailsRequest
): Promise<GeneratedWorkflowNodeDetails> {
  const response = await fetch("/api/workflow/node-details", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
        details?: string;
        nodeDetails?: GeneratedWorkflowNodeDetails;
      }
    | null;

  if (!response.ok || !payload?.nodeDetails) {
    throw new Error(
      payload?.details ||
        payload?.error ||
        "Failed to generate workflow node details."
    );
  }

  return payload.nodeDetails;
}
