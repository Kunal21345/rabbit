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
export const LLM_PROVIDER_API_KEYS_STORAGE_KEY =
  "workflow-llm-provider-api-keys";

export type WorkflowProvider =
  | "openai"
  | "claude"
  | "groq"
  | "ollama";

export type WorkflowGenerationRequest = {
  prompt: string;
  model: WorkflowGenerationModel;
  provider?: WorkflowProvider;
  apiKey?: string;
  currentGraph?: {
    nodes: Array<{
      id: string;
      label: string;
      description: string;
      businessRule: string;
    }>;
    edges: Array<{
      source: string;
      target: string;
    }>;
  };
};

export type GeneratedWorkflow = {
  title: string;
  summary: string;
  nodes: GeneratedWorkflowNode[];
  edges: GeneratedWorkflowEdge[];
};

export type GeneratedWorkflowNode = {
  id: string;
  label: string;
  description: string;
  businessRule: string;
  aiRuleDefinition: string;
  aiTestRules: string;
  comments: string;
};

export type GeneratedWorkflowEdge = {
  source: string;
  target: string;
};

type DagreNode = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const NODE_WIDTH = 280;
const NODE_HEIGHT = 172;

export const WORKFLOW_GENERATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "nodes", "edges"],
  properties: {
    title: {
      type: "string",
    },
    summary: {
      type: "string",
    },
    nodes: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "label",
          "description",
          "businessRule",
          "aiRuleDefinition",
          "aiTestRules",
          "comments",
        ],
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
          businessRule: {
            type: "string",
          },
          aiRuleDefinition: {
            type: "string",
          },
          aiTestRules: {
            type: "string",
          },
          comments: {
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

export function normalizeGeneratedWorkflow(
  workflow: GeneratedWorkflow
): GeneratedWorkflow {
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
      businessRule: asText(node?.businessRule),
      aiRuleDefinition: asText(node?.aiRuleDefinition),
      aiTestRules: asText(node?.aiTestRules),
      comments: asText(node?.comments),
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
    nodes,
    edges,
  };
}

export function buildWorkflowGraph(
  workflow: GeneratedWorkflow
): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
} {
  const normalized = normalizeGeneratedWorkflow(workflow);
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
        description: node.description,
        businessRule: node.businessRule,
        aiRuleDefinition: node.aiRuleDefinition,
        aiTestRules: node.aiTestRules,
        comments: node.comments,
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
