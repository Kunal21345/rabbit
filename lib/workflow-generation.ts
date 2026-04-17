import dagre from "dagre";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/hooks/useWorkflowGraph";

export type WorkflowGenerationModel =
  | "openai/gpt-oss-20b"
  | "openai/gpt-oss-120b"
  | "llama-3.3-70b-versatile"
  | "gpt-4.1-mini"
  | "claude-3-5-sonnet-latest"
  | "llama3.2:3b";

export const LLM_PROVIDER_STORAGE_KEY = "workflow-llm-provider";
export const LLM_MODEL_STORAGE_KEY = "workflow-llm-model";
export const LLM_PROVIDER_API_KEYS_STORAGE_KEY =
  "workflow-llm-provider-api-keys";

export type WorkflowProvider =
  | "openai"
  | "claude"
  | "groq"
  | "ollama";

export const WORKFLOW_PROVIDER_OPTIONS: Array<{
  label: string;
  value: WorkflowProvider;
}> = [
  { label: "OpenAI", value: "openai" },
  { label: "Claude", value: "claude" },
  { label: "Groq", value: "groq" },
  { label: "Ollama", value: "ollama" },
];

export const WORKFLOW_MODEL_OPTIONS_BY_PROVIDER: Record<
  WorkflowProvider,
  Array<{
    label: string;
    value: WorkflowGenerationModel;
  }>
> = {
  openai: [{ label: "GPT-4.1 Mini", value: "gpt-4.1-mini" }],
  claude: [
    {
      label: "Claude 3.5 Sonnet",
      value: "claude-3-5-sonnet-latest",
    },
  ],
  groq: [
    { label: "GPT OSS 120B", value: "openai/gpt-oss-120b" },
    {
      label: "GPT OSS 20B (Experimental)",
      value: "openai/gpt-oss-20b",
    },
    { label: "Llama 3.3 70B", value: "llama-3.3-70b-versatile" },
  ],
  ollama: [{ label: "Llama 3.2 3B", value: "llama3.2:3b" }],
};

export function isExperimentalWorkflowModel(
  model: WorkflowGenerationModel
) {
  return model === "openai/gpt-oss-20b";
}

export function isWorkflowProvider(value: unknown): value is WorkflowProvider {
  return WORKFLOW_PROVIDER_OPTIONS.some((provider) => provider.value === value);
}

export function isWorkflowGenerationModel(
  value: unknown
): value is WorkflowGenerationModel {
  return Object.values(WORKFLOW_MODEL_OPTIONS_BY_PROVIDER)
    .flat()
    .some((model) => model.value === value);
}

export function getDefaultWorkflowModel(
  provider: WorkflowProvider
): WorkflowGenerationModel {
  return WORKFLOW_MODEL_OPTIONS_BY_PROVIDER[provider][0].value;
}

export type WorkflowGraphContext = {
  nodes: Array<{
    id: string;
    label: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
  }>;
};

export type WorkflowGraphRequest = {
  prompt: string;
  model: WorkflowGenerationModel;
  provider?: WorkflowProvider;
  apiKey?: string;
  currentGraph?: WorkflowGraphContext;
};

export type GeneratedWorkflowGraph = {
  title: string;
  summary: string;
  responseMessage: string;
  reasoningSummary: string;
  nodes: GeneratedWorkflowGraphNode[];
  edges: GeneratedWorkflowEdge[];
};

export type GeneratedWorkflowGraphNode = {
  id: string;
  label: string;
  description: string;
};

export type GeneratedWorkflowEdge = {
  source: string;
  target: string;
};

export type WorkflowNodeDetailsRequest = {
  prompt: string;
  model: WorkflowGenerationModel;
  provider?: WorkflowProvider;
  apiKey?: string;
  node: {
    id: string;
    label: string;
    description?: string;
  };
  context?: {
    workflowTitle?: string;
    workflowSummary?: string;
    previousSteps?: Array<{
      id: string;
      label: string;
    }>;
    nextSteps?: Array<{
      id: string;
      label: string;
    }>;
  };
};

export type GeneratedWorkflowNodeDetails = {
  description: string;
  details: string;
  suggestions: string;
};

type DagreNode = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const NODE_WIDTH = 280;
const NODE_HEIGHT = 172;

export const WORKFLOW_GRAPH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "summary",
    "responseMessage",
    "reasoningSummary",
    "nodes",
    "edges",
  ],
  properties: {
    title: {
      type: "string",
    },
    summary: {
      type: "string",
    },
    responseMessage: {
      type: "string",
    },
    reasoningSummary: {
      type: "string",
    },
    nodes: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "description"],
        properties: {
          id: {
            type: "string",
          },
          label: {
            type: "string",
          },
          description: {
            type: "string",
          },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "target"],
        properties: {
          source: {
            type: "string",
          },
          target: {
            type: "string",
          },
        },
      },
    },
  },
} as const;

export const WORKFLOW_NODE_DETAILS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["description", "details", "suggestions"],
  properties: {
    description: {
      type: "string",
    },
    details: {
      type: "string",
    },
    suggestions: {
      type: "string",
    },
  },
} as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function dedupeId(baseId: string, usedIds: Set<string>) {
  let candidate = baseId || "step";
  let suffix = 1;

  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId || "step"}-${suffix}`;
  }

  usedIds.add(candidate);
  return candidate;
}

export function normalizeGeneratedWorkflowGraph(
  workflow: GeneratedWorkflowGraph
): GeneratedWorkflowGraph {
  const usedIds = new Set<string>();
  const asText = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";

  const rawNodes = Array.isArray(workflow.nodes)
    ? workflow.nodes
    : [];
  const rawEdges = Array.isArray(workflow.edges)
    ? workflow.edges
    : [];

  const nodes = rawNodes.map((node, index) => {
    const labelText = asText(node?.label);
    const baseId = slugify(
      asText(node?.id) ||
        labelText ||
        `step-${index + 1}`
    );
    const id = dedupeId(baseId, usedIds);

    return {
      id,
      label: labelText || `Step ${index + 1}`,
      description: asText(node?.description),
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const seenEdges = new Set<string>();
  const edges: GeneratedWorkflowEdge[] = [];

  for (const edge of rawEdges) {
    const source = asText(edge?.source);
    const target = asText(edge?.target);

    if (!source || !target) {
      continue;
    }

    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      continue;
    }

    const edgeKey = `${source}:${target}`;

    if (seenEdges.has(edgeKey)) {
      continue;
    }

    seenEdges.add(edgeKey);
    edges.push({
      source,
      target,
    });
  }

  return {
    title: asText(workflow?.title),
    summary: asText(workflow?.summary),
    responseMessage: asText(workflow?.responseMessage),
    reasoningSummary: asText(workflow?.reasoningSummary),
    nodes,
    edges,
  };
}

export function buildWorkflowGraph(
  workflow: GeneratedWorkflowGraph
): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
} {
  const normalized = normalizeGeneratedWorkflowGraph(workflow);
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "LR",
    nodesep: 90,
    ranksep: 180,
    marginx: 40,
    marginy: 40,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  normalized.nodes.forEach((node) => {
    graph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  normalized.edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();

  normalized.edges.forEach((edge) => {
    outgoingCount.set(
      edge.source,
      (outgoingCount.get(edge.source) || 0) + 1
    );
    incomingCount.set(
      edge.target,
      (incomingCount.get(edge.target) || 0) + 1
    );
  });

  const nodes: WorkflowNode[] = normalized.nodes.map((node) => {
    const layoutNode = graph.node(node.id) as DagreNode | undefined;

    return {
      id: node.id,
      type: "workflow",
      position: {
        x: (layoutNode?.x || 0) - NODE_WIDTH / 2,
        y: (layoutNode?.y || 0) - NODE_HEIGHT / 2,
      },
      data: {
        label: node.label,
        description: node.description || "",
        details: "",
        suggestions: "",
        handles: {
          source: (outgoingCount.get(node.id) || 0) > 0,
          target: (incomingCount.get(node.id) || 0) > 0,
        },
      },
    };
  });

  const edges: WorkflowEdge[] = normalized.edges.map((edge) => ({
    id: `${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
  }));

  return {
    nodes,
    edges,
  };
}
