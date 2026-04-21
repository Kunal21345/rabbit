import { NextResponse } from "next/server";
import type {
  GeneratedWorkflowNodeDetails,
  GeneratedWorkflowNodeDetailsBatchItem,
  WorkflowNodeDetailsBatchRequest,
  WorkflowProvider,
} from "@/lib/workflow-generation";
import {
  getDefaultWorkflowModel,
  isWorkflowGenerationModel,
  isWorkflowProvider,
  WORKFLOW_NODE_DETAILS_SCHEMA,
  WORKFLOW_NODE_DETAILS_BATCH_SCHEMA,
} from "@/lib/workflow-generation";
import {
  createRequestId,
  getEffectiveWorkflowModel,
  MISSING_API_KEY_MESSAGES,
  parseJsonObjectFromText,
  requestStructuredJson,
  resolveApiKey,
  validateApiKeyForProvider,
} from "@/lib/workflow-agent-runtime";

export const runtime = "nodejs";

function normalizeProvider(provider: unknown): WorkflowProvider {
  if (isWorkflowProvider(provider)) {
    return provider;
  }

  return "groq";
}

function sanitizeText(value: unknown, maxLength = 4000) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function normalizeNodeList(
  value: unknown
): Array<{ id: string; label: string }> {
  return Array.isArray(value)
    ? value
        .filter(
          (node): node is Record<string, unknown> =>
            typeof node === "object" && node !== null
        )
        .map((node) => ({
          id: sanitizeText(node.id, 120),
          label: sanitizeText(node.label, 200),
        }))
        .filter((node) => node.id && node.label)
    : [];
}

function normalizeRequest(
  payload: unknown
): WorkflowNodeDetailsBatchRequest | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const provider = normalizeProvider(record.provider);
  const model = isWorkflowGenerationModel(record.model)
    ? record.model
    : getDefaultWorkflowModel(provider);

  const nodes = Array.isArray(record.nodes)
    ? record.nodes
        .filter(
          (node): node is Record<string, unknown> =>
            typeof node === "object" && node !== null
        )
        .map((node) => ({
          id: sanitizeText(node.id, 120),
          label: sanitizeText(node.label, 200),
          description: sanitizeText(node.description, 300),
          previousSteps: normalizeNodeList(node.previousSteps),
          nextSteps: normalizeNodeList(node.nextSteps),
        }))
        .filter((node) => node.id && node.label)
    : [];

  if (nodes.length === 0) {
    return null;
  }

  const context =
    typeof record.context === "object" && record.context !== null
      ? {
          workflowTitle: sanitizeText(
            (record.context as Record<string, unknown>).workflowTitle,
            200
          ),
          workflowSummary: sanitizeText(
            (record.context as Record<string, unknown>).workflowSummary,
            600
          ),
        }
      : undefined;

  return {
    prompt: sanitizeText(record.prompt, 2000),
    model,
    provider,
    apiKey: sanitizeText(record.apiKey, 500),
    context,
    nodes,
  };
}

function buildPrompt(input: WorkflowNodeDetailsBatchRequest) {
  return [
    "Return JSON with an items array.",
    "One item per step.",
    "Each item must include id, description, details, suggestions.",
    "Keep all fields concise and practical.",
    "Do not rename steps.",
    input.context?.workflowTitle ? `Title: ${input.context.workflowTitle}` : "",
    input.context?.workflowSummary
      ? `Summary: ${input.context.workflowSummary}`
      : "",
    input.prompt ? `Goal: ${input.prompt}` : "",
    "",
    "Steps:",
    ...input.nodes.map((node) => {
      const previous = node.previousSteps?.map((step) => step.label).join(", ");
      const next = node.nextSteps?.map((step) => step.label).join(", ");

      return [
        `- id: ${node.id}`,
        `  label: ${node.label}`,
        node.description ? `  description: ${node.description}` : "",
        previous ? `  previous: ${previous}` : "",
        next ? `  next: ${next}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSingleNodePrompt(input: {
  prompt: string;
  node: WorkflowNodeDetailsBatchRequest["nodes"][number];
  context?: WorkflowNodeDetailsBatchRequest["context"];
}) {
  const previous = input.node.previousSteps?.map((step) => step.label).join(", ");
  const next = input.node.nextSteps?.map((step) => step.label).join(", ");

  return [
    "Return JSON with description, details, suggestions.",
    "Keep it concise.",
    "Do not rename the step.",
    input.context?.workflowTitle ? `Title: ${input.context.workflowTitle}` : "",
    input.context?.workflowSummary
      ? `Summary: ${input.context.workflowSummary}`
      : "",
    input.prompt ? `Goal: ${input.prompt}` : "",
    `Step id: ${input.node.id}`,
    `Step: ${input.node.label}${input.node.description ? ` - ${input.node.description}` : ""}`,
    previous ? `Previous: ${previous}` : "",
    next ? `Next: ${next}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseGeneratedNodeDetailsBatch(outputText: string): {
  items: GeneratedWorkflowNodeDetailsBatchItem[];
} {
  return parseJsonObjectFromText<{
    items: GeneratedWorkflowNodeDetailsBatchItem[];
  }>(outputText, "Model output");
}

function validateBatchItems(
  items: GeneratedWorkflowNodeDetailsBatchItem[],
  expectedIds: Set<string>
) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Node details batch must include items.");
  }

  const seenIds = new Set<string>();

  items.forEach((item) => {
    if (!expectedIds.has(item.id)) {
      throw new Error(`Unexpected node id in details batch: ${item.id}`);
    }

    if (seenIds.has(item.id)) {
      throw new Error(`Duplicate node id in details batch: ${item.id}`);
    }

    seenIds.add(item.id);

    if (!item.description?.trim()) {
      throw new Error(`Node ${item.id} is missing description.`);
    }

    if (!item.details?.trim()) {
      throw new Error(`Node ${item.id} is missing details.`);
    }

    if (!item.suggestions?.trim()) {
      throw new Error(`Node ${item.id} is missing suggestions.`);
    }
  });

  if (seenIds.size !== expectedIds.size) {
    const missingIds = [...expectedIds].filter((id) => !seenIds.has(id));

    throw new Error(
      `Node details batch is missing step ids: ${missingIds.join(", ")}`
    );
  }
}

function parseGeneratedNodeDetails(
  outputText: string
): GeneratedWorkflowNodeDetails {
  return parseJsonObjectFromText<GeneratedWorkflowNodeDetails>(
    outputText,
    "Model output"
  );
}

function validateNodeDetails(
  nodeDetails: GeneratedWorkflowNodeDetails
) {
  if (!nodeDetails.description?.trim()) {
    throw new Error("Node details must include a description.");
  }

  if (!nodeDetails.details?.trim()) {
    throw new Error("Node details must include details.");
  }

  if (!nodeDetails.suggestions?.trim()) {
    throw new Error("Node details must include suggestions.");
  }
}

function shouldFallbackToSingleNodeRequests(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("Unexpected node id in details batch:") ||
    message.includes("Node details batch is missing step ids:") ||
    message.includes("Duplicate node id in details batch:")
  );
}

async function requestSingleNodeDetails(
  payload: WorkflowNodeDetailsBatchRequest,
  node: WorkflowNodeDetailsBatchRequest["nodes"][number],
  provider: WorkflowProvider,
  apiKey: string
) {
  const result = await requestStructuredJson({
    schema: WORKFLOW_NODE_DETAILS_SCHEMA,
    schemaName: "workflow_node_details",
    provider,
    model: payload.model,
    apiKey,
    systemPrompt:
      "You are a workflow detail writer. Return only valid JSON matching the supplied schema.",
    fallbackSystemPrompt:
      "You are a workflow detail writer. Return ONLY one valid JSON object and no markdown.",
    userPrompt: buildSingleNodePrompt({
      prompt: payload.prompt,
      node,
      context: payload.context,
    }),
    maxTokens: 700,
    parse: parseGeneratedNodeDetails,
    validate: validateNodeDetails,
  });

  return {
    id: node.id,
    description: result.data.description.trim(),
    details: result.data.details.trim(),
    suggestions: result.data.suggestions.trim(),
  } satisfies GeneratedWorkflowNodeDetailsBatchItem;
}

async function requestNodeDetailsChunk(
  payload: WorkflowNodeDetailsBatchRequest,
  provider: WorkflowProvider,
  apiKey: string
) {
  try {
    const result = await requestStructuredJson({
      schema: WORKFLOW_NODE_DETAILS_BATCH_SCHEMA,
      schemaName: "workflow_node_details_batch",
      provider,
      model: payload.model,
      apiKey,
      systemPrompt:
        "You are a workflow detail writer. Return only valid JSON matching the supplied schema. Use the exact provided id for each step. Never invent, rename, or slugify ids.",
      fallbackSystemPrompt:
        "You are a workflow detail writer. Return ONLY one valid JSON object and no markdown. Use the exact provided id for each step.",
      userPrompt: buildPrompt(payload),
      maxTokens: Math.min(Math.max(320 * payload.nodes.length, 1400), 7000),
      parse: parseGeneratedNodeDetailsBatch,
      validate: (data) =>
        validateBatchItems(
          data.items,
          new Set(payload.nodes.map((node) => node.id))
        ),
      retryUserPrompt: [
        buildPrompt(payload),
        "",
        "Use the exact id values listed in the Steps section.",
        `Allowed ids: ${payload.nodes.map((node) => node.id).join(", ")}`,
        "Do not invent ids from labels.",
      ].join("\n"),
    });

    return result;
  } catch (error) {
    if (!shouldFallbackToSingleNodeRequests(error)) {
      throw error;
    }

    const items: GeneratedWorkflowNodeDetailsBatchItem[] = [];

    for (const node of payload.nodes) {
      items.push(
        await requestSingleNodeDetails(payload, node, provider, apiKey)
      );
    }

    return {
      data: { items },
      effectiveModel: getEffectiveWorkflowModel(provider, payload.model),
      usedModelFallback: false,
      rawOutput: JSON.stringify({ items }),
      reasoning: undefined,
      warnings: undefined,
    };
  }
}

function toUserFacingProviderError(
  provider: WorkflowProvider,
  details: string
) {
  const normalized = details.toLowerCase();

  if (
    provider === "claude" &&
    (normalized.includes("invalid x-api-key") ||
      normalized.includes("authentication_error"))
  ) {
    return {
      status: 401,
      error:
        "Invalid Anthropic API key. Update ANTHROPIC_API_KEY in .env.local and restart the dev server.",
    };
  }

  return {
    status: 500,
    error: "Failed to generate workflow node details.",
  };
}

export async function POST(request: Request) {
  const requestId = createRequestId();
  let rawPayload: unknown;

  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        requestId,
      },
      { status: 400 }
    );
  }

  const payload = normalizeRequest(rawPayload);

  if (!payload) {
    return NextResponse.json(
      {
        error: "Request payload must include at least one valid node.",
        requestId,
      },
      { status: 400 }
    );
  }

  const provider = normalizeProvider(payload.provider);
  const apiKey = resolveApiKey(provider, payload.apiKey);

  if (provider !== "ollama" && !apiKey) {
    return NextResponse.json(
      {
        error: MISSING_API_KEY_MESSAGES[provider],
        requestId,
      },
      { status: 503 }
    );
  }

  if (provider !== "ollama") {
    const validationError = validateApiKeyForProvider(provider, apiKey);

    if (validationError) {
      return NextResponse.json(
        {
          error: validationError,
          requestId,
        },
        { status: 400 }
      );
    }
  }

  try {
    const result = await requestNodeDetailsChunk(payload, provider, apiKey);
    const items = result.data.items;
    validateBatchItems(items, new Set(payload.nodes.map((node) => node.id)));

    return NextResponse.json(
      {
        items: items.map((item) => ({
          id: item.id,
          description: item.description.trim(),
          details: item.details.trim(),
          suggestions: item.suggestions.trim(),
        })),
        meta: {
          requestId,
          model: result.effectiveModel,
          usedModelFallback: result.usedModelFallback,
          requestedModel: payload.model,
          chunkCount: 1,
        },
      },
      {
        headers: {
          "x-request-id": requestId,
          "x-workflow-model": result.effectiveModel,
        },
      }
    );
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Unknown error";
    const providerError = toUserFacingProviderError(provider, details);

    console.error("[workflow/node-details/batch]", {
      requestId,
      provider,
      model: payload.model,
      effectiveModel: getEffectiveWorkflowModel(provider, payload.model),
      nodeCount: payload.nodes.length,
      error: details,
    });

    return NextResponse.json(
      {
        error: providerError.error,
        details,
        requestId,
      },
      {
        status: providerError.status,
        headers: {
          "x-request-id": requestId,
        },
      }
    );
  }
}
