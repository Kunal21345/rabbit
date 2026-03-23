import dagre from "dagre";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/hooks/useWorkflowGraph";

export type WorkflowGenerationModel =
  | "openai/gpt-oss-20b"
  | "openai/gpt-oss-120b"
  | "llama-3.3-70b-versatile";

export type WorkflowGenerationRequest = {
  prompt: string;
  model: WorkflowGenerationModel;
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
      label?: string;
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
  label: "YES" | "NO";
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
        required: ["source", "target", "label"],
        properties: {
          source: {
            type: "string",
          },
          target: {
            type: "string",
          },
          label: {
            type: "string",
            enum: ["YES", "NO"],
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

  const nodes = workflow.nodes.map((node, index) => {
    const baseId = slugify(node.id || node.label || `step-${index + 1}`);
    const id = dedupeId(baseId, usedIds);

    return {
      ...node,
      id,
      label: node.label.trim() || `Step ${index + 1}`,
      description: node.description.trim(),
      businessRule: node.businessRule.trim(),
      aiRuleDefinition: node.aiRuleDefinition.trim(),
      aiTestRules: node.aiTestRules.trim(),
      comments: node.comments.trim(),
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edgeBuckets = new Map<string, GeneratedWorkflowEdge[]>();

  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }

    const bucket = edgeBuckets.get(edge.source) || [];

    if (
      bucket.some(
        (item) =>
          item.target === edge.target ||
          item.label === edge.label
      )
    ) {
      continue;
    }

    if (bucket.length >= 2) {
      continue;
    }

    bucket.push(edge);
    edgeBuckets.set(edge.source, bucket);
  }

  const edges = [...edgeBuckets.values()].flatMap((bucket) => {
    if (bucket.length === 1) {
      return [
        {
          ...bucket[0],
          label: "YES" as const,
        },
      ];
    }

    const yes = bucket.find((edge) => edge.label === "YES");
    const no = bucket.find((edge) => edge.label === "NO");

    return [yes, no].filter(Boolean) as GeneratedWorkflowEdge[];
  });

  return {
    title: workflow.title.trim(),
    summary: workflow.summary.trim(),
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
    label: edge.label,
    type: edge.label === "YES" ? "animated" : "temporary",
  }));

  return {
    nodes,
    edges,
  };
}
