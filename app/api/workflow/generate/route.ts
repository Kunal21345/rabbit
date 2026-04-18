import { NextResponse } from "next/server";
import type {
  GeneratedWorkflowGraph,
  WorkflowGraphRequest,
  WorkflowProvider,
} from "@/lib/workflow-generation";
import {
  buildWorkflowGraph,
  getDefaultWorkflowModel,
  isWorkflowGenerationModel,
  isWorkflowProvider,
  normalizeGeneratedWorkflowGraph,
  WORKFLOW_GRAPH_SCHEMA,
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

function normalizeRequest(
  payload: unknown
): WorkflowGraphRequest | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const provider = normalizeProvider(record.provider);
  const model = isWorkflowGenerationModel(record.model)
    ? record.model
    : getDefaultWorkflowModel(provider);

  const currentGraph =
    typeof record.currentGraph === "object" &&
    record.currentGraph !== null
      ? {
          nodes: Array.isArray((record.currentGraph as Record<string, unknown>).nodes)
            ? ((record.currentGraph as Record<string, unknown>).nodes as unknown[])
                .filter(
                  (node): node is Record<string, unknown> =>
                    typeof node === "object" && node !== null
                )
                .map((node) => ({
                  id: sanitizeText(node.id, 120),
                  label: sanitizeText(node.label, 200),
                }))
                .filter((node) => node.id && node.label)
            : [],
          edges: Array.isArray((record.currentGraph as Record<string, unknown>).edges)
            ? ((record.currentGraph as Record<string, unknown>).edges as unknown[])
                .filter(
                  (edge): edge is Record<string, unknown> =>
                    typeof edge === "object" && edge !== null
                )
                .map((edge) => ({
                  source: sanitizeText(edge.source, 120),
                  target: sanitizeText(edge.target, 120),
                }))
                .filter((edge) => edge.source && edge.target)
            : [],
        }
      : undefined;

  return {
    prompt: sanitizeText(record.prompt, 8000),
    model,
    provider,
    apiKey: sanitizeText(record.apiKey, 500),
    currentGraph,
  };
}

function buildPrompt(input: WorkflowGraphRequest) {
  return [
    "Generate a complete workflow graph from the user's use case.",
    "Return the final workflow, not a patch.",
    "Your response must contain both user-facing text and workflow data.",
    "The graph may add, remove, or rename nodes as needed.",
    "Every node must have stable slug-style ids.",
    "Use direct unlabeled edges between nodes.",
    "First, identify the core path and render that base path as a linear sequence of steps from start to finish.",
    "The happy path must remain the primary backbone of the workflow.",
    "A node may connect to multiple target nodes only when that core step is a true decision, approval, validation, status check, timeout, missing-input check, or business-rule split.",
    "For ordinary action steps, continue the workflow as a single next step on the linear happy path.",
    "Only after defining the happy-path backbone should you add secondary branches for meaningful alternate outcomes, exceptions, or failure cases.",
    "If a core step is a decision-making step, keep the normal or approved outcome on the main path and render the other outcomes as secondary nodes branching from that same step.",
    "Do not turn every step into a parallel action node.",
    "Do not create exception branches for minor edge cases that can be handled within the same step.",
    "Do not collapse distinct decision outcomes into one generic node when separate branches are genuinely needed.",
    "Prefer explicit start and end nodes when appropriate.",
    "responseMessage must be a detailed natural assistant reply for the chat UI.",
    "responseMessage should explain the process, strategy, and operating logic of the workflow, not just announce that a workflow was created.",
    "responseMessage should help the user understand how the workflow works in practice, ideally with a simple analogy or mental model when useful.",
    "responseMessage should mention the important phases, handoffs, checkpoints, or decisions that shape the workflow.",
    "responseMessage must not contain JSON, code, schema descriptions, arrays, objects, or field names.",
    "Avoid generic openers like 'Here is the workflow' or 'Below is the workflow'.",
    "reasoningSummary must explain why the workflow was structured this way in plain English.",
    "reasoningSummary should describe the decision logic: why certain steps stayed on the happy path, where branches were added, and what tradeoffs guided the structure.",
    "reasoningSummary must not contain JSON, code fences, schema descriptions, arrays, objects, or field names.",
    "summary should stay brief and describe the workflow at a high level.",
    "Each node must include id and label.",
    "Each node must include description as one short sentence.",
    "Keep node labels specific enough to distinguish normal, exception, and decision branches.",
    "Do not include details or suggestions.",
    "",
    `User use case:\n${input.prompt}`,
    "",
    input.currentGraph
      ? `Current graph context:\n${JSON.stringify(input.currentGraph, null, 2)}`
      : "Current graph context:\nNone",
  ].join("\n");
}

function parseGeneratedWorkflow(
  outputText: string
): GeneratedWorkflowGraph {
  return parseJsonObjectFromText<GeneratedWorkflowGraph>(
    outputText,
    "Model output"
  );
}

function validateGeneratedWorkflowGraph(
  workflow: GeneratedWorkflowGraph
) {
  const responseMessage = workflow.responseMessage?.trim();
  const reasoningSummary = workflow.reasoningSummary?.trim();

  if (!responseMessage) {
    throw new Error("Workflow must include a user-facing responseMessage.");
  }

  if (!reasoningSummary) {
    throw new Error("Workflow must include a user-facing reasoningSummary.");
  }

  if (responseMessage.length < 160) {
    throw new Error("responseMessage is too brief to explain the workflow.");
  }

  if (reasoningSummary.length < 140) {
    throw new Error("reasoningSummary is too brief to explain the decisions.");
  }

  const genericResponsePatterns = [
    /^here is the workflow\b/i,
    /^this workflow\b/i,
    /^below is the workflow\b/i,
    /^the workflow for\b/i,
  ];

  if (genericResponsePatterns.some((pattern) => pattern.test(responseMessage))) {
    throw new Error("responseMessage is too generic for the chat UI.");
  }

  if (!Array.isArray(workflow.nodes) || workflow.nodes.length < 2) {
    throw new Error("Workflow must include at least 2 nodes.");
  }

  if (!Array.isArray(workflow.edges)) {
    throw new Error("Workflow must include an edges array.");
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
    error: "Failed to generate workflow graph.",
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
        error: "Request payload must be a JSON object.",
        requestId,
      },
      { status: 400 }
    );
  }

  if (!payload.prompt?.trim()) {
    return NextResponse.json(
      {
        error: "Prompt is required.",
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
    const validationError = validateApiKeyForProvider(
      provider,
      apiKey
    );

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
    const result = await requestStructuredJson({
      schema: WORKFLOW_GRAPH_SCHEMA,
      schemaName: "workflow_graph",
      provider,
      model: payload.model,
      apiKey,
      systemPrompt:
        "You are a workflow planner. Return only valid JSON matching the supplied schema.",
      fallbackSystemPrompt:
        "You are a workflow planner. Return ONLY one valid JSON object and no markdown.",
      userPrompt: buildPrompt(payload),
      retryUserPrompt: [
        buildPrompt(payload),
        "",
        "The previous answer was too generic.",
        "Rewrite responseMessage so it teaches the user how the workflow operates, including the process, strategy, and key decision points.",
        "Rewrite reasoningSummary so it explains why the workflow was designed this way, including why branches or checkpoints were added.",
        "Do not say 'Here is the workflow' or similar generic phrases.",
        "Do not output code, JSON-like prose, schema terms, arrays, or property names inside responseMessage or reasoningSummary.",
      ].join("\n"),
      maxTokens: 4096,
      parse: parseGeneratedWorkflow,
      validate: validateGeneratedWorkflowGraph,
    });

    const normalizedWorkflow =
      normalizeGeneratedWorkflowGraph(result.data);
    validateGeneratedWorkflowGraph(normalizedWorkflow);

    const graph = buildWorkflowGraph(normalizedWorkflow);

    return NextResponse.json({
      workflow: normalizedWorkflow,
      graph,
      llm: {
        response: normalizedWorkflow.responseMessage,
        reasoning: normalizedWorkflow.reasoningSummary,
        warnings: result.warnings,
      },
      meta: {
        requestId,
        model: result.effectiveModel,
        usedModelFallback: result.usedModelFallback,
        requestedModel: payload.model,
      },
    }, {
      headers: {
        "x-request-id": requestId,
        "x-workflow-model": result.effectiveModel,
      },
    });
  } catch (error) {
    const details =
      error instanceof Error ? error.message : "Unknown error";
    const providerError = toUserFacingProviderError(provider, details);

    console.error("[workflow/generate]", {
      requestId,
      provider,
      model: payload.model,
      effectiveModel: getEffectiveWorkflowModel(provider, payload.model),
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const provider = normalizeProvider(url.searchParams.get("provider"));

  if (provider === "ollama") {
    return NextResponse.json({ configured: true, provider });
  }

  const configured = Boolean(resolveApiKey(provider));

  return NextResponse.json(
    configured
      ? { configured: true, provider }
      : {
          configured: false,
          provider,
          error: MISSING_API_KEY_MESSAGES[provider],
        },
    { status: configured ? 200 : 503 }
  );
}
